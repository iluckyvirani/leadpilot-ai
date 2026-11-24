import { MODEL } from "@/lib/config";

// Provider selection + an adapter for any OpenAI-compatible Chat Completions API
// (OpenAI, Google Gemini, Groq, Ollama, OpenRouter ...). The agent loop speaks Anthropic's message shape;
// this adapter translates to and from Chat Completions, so the loop, tools and guardrails stay unchanged.

export type Provider = "demo" | "anthropic" | "openai";

export function getProvider(): Provider {
  if (process.env.DEMO_MODE === "true") return "demo";
  const forced = process.env.LLM_PROVIDER;
  if (forced === "anthropic" || forced === "openai" || forced === "demo") return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) return "openai";
  return "demo";
}

export const openaiModel = () => process.env.OPENAI_MODEL || "gpt-4o-mini";
export const modelLabel = () => (getProvider() === "openai" ? `${openaiModel()} (OpenAI-compatible)` : getProvider() === "demo" ? "demo (scripted, no API key)" : MODEL);

type Block = { type: string; [k: string]: unknown };
type AnthropicMsg = { role: string; content: string | Block[] };
type CCMessage = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string };

async function chat(payload: Record<string, unknown>) {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  let res!: Response;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY || "none"}` },
      body: JSON.stringify({ model: openaiModel(), ...payload }),
      signal: AbortSignal.timeout(120_000),
    });
    if (![429, 500, 502, 503, 504].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); // free tiers return 429/503 under load
  }
  if (!res.ok) throw new Error(`OpenAI-compatible API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as {
    choices: { message: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string }; extra_content?: unknown }[] }; finish_reason: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
}

function toChatMessages(system: string | undefined, messages: AnthropicMsg[]): CCMessage[] {
  const out: CCMessage[] = system ? [{ role: "system", content: system }] : [];
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
      const calls = m.content.filter((b) => b.type === "tool_use").map((b) => ({
        id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) },
        // Gemini 3 returns a thought_signature here and requires it to be echoed back on the next turn.
        ...(b.extra_content ? { extra_content: b.extra_content } : {}),
      }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of m.content) {
        if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: String(b.content ?? "") });
        else if (b.type === "text") out.push({ role: "user", content: String(b.text) });
      }
    }
  }
  return out;
}

/** An object shaped like `client.beta.messages`, backed by a Chat Completions endpoint. */
export function createOpenAIClient() {
  return {
    async create(body: { system?: string; tools?: { name: string; description?: string; input_schema: unknown }[]; messages: AnthropicMsg[]; max_tokens?: number }) {
      const data = await chat({
        messages: toChatMessages(body.system, body.messages),
        ...(body.tools?.length ? { tools: body.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
      });
      const choice = data.choices[0];
      const content: Block[] = [];
      if (choice.message.content) content.push({ type: "text", text: choice.message.content });
      for (const c of choice.message.tool_calls ?? []) {
        let input: unknown = {};
        try { input = JSON.parse(c.function.arguments || "{}"); } catch { /* invalid args: zod will reject them and the model can retry */ }
        content.push({ type: "tool_use", id: c.id, name: c.function.name, input, ...(c.extra_content ? { extra_content: c.extra_content } : {}) });
      }
      const stop = choice.message.tool_calls?.length ? "tool_use" : choice.finish_reason === "length" ? "max_tokens" : "end_turn";
      return {
        id: "chatcmpl", type: "message", role: "assistant", model: openaiModel(), content, stop_reason: stop, stop_details: null,
        usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      };
    },
  };
}

/** JSON-mode completion used for reply triage on OpenAI-compatible providers. */
export async function openaiJson(system: string, user: string): Promise<unknown> {
  const data = await chat({
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  return JSON.parse(data.choices[0].message.content ?? "{}");
}
