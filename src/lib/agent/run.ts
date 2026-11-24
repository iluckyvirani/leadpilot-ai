import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/config";
import { db } from "@/lib/db";
import { createDemoClient } from "./demo";
import { createOpenAIClient, getProvider, modelLabel as providerLabel } from "./provider";
import { systemPrompt } from "./prompt";
import { executeTool, toolDefinitions } from "./tools";

export type AgentEvent =
  | { type: "run"; runId: string; model: string }
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output: unknown; isError: boolean }
  | { type: "done"; summary: string; inputTokens: number; outputTokens: number; toolCalls: number }
  | { type: "error"; message: string };

type MessagesClient = Pick<Anthropic["beta"]["messages"], "create">;

export type RunOptions = {
  goal: string;
  trigger?: "manual" | "cron";
  maxTurns?: number;
  onEvent?: (e: AgentEvent) => void | Promise<void>;
  /** Injected in tests; defaults to the real Anthropic client. */
  client?: MessagesClient;
};

/**
 * The agent loop (Messages API + client tools):
 *   ask Claude -> run every tool it requested -> send all results back in ONE user message -> repeat
 * until Claude ends its turn. Every step is persisted to AgentStep so a run can be replayed in the UI.
 */
export async function runAgent({ goal, trigger = "manual", maxTurns = 30, onEvent, client }: RunOptions) {
  const provider = client ? "anthropic" : getProvider();
  const messages: MessagesClient = client ?? (provider === "demo" ? (createDemoClient() as unknown as MessagesClient)
    : provider === "openai" ? (createOpenAIClient() as unknown as MessagesClient) : new Anthropic().beta.messages);
  const modelLabel = client ? MODEL : providerLabel();
  const run = await db.agentRun.create({ data: { goal, trigger, model: modelLabel } });
  let stepIndex = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;

  const emit = async (e: AgentEvent) => {
    await onEvent?.(e);
    if (e.type === "run" || e.type === "done" || e.type === "error") return;
    await db.agentStep.create({
      data: {
        runId: run.id, index: stepIndex++, kind: e.type,
        toolName: "name" in e ? e.name : null,
        data: JSON.parse(JSON.stringify(e)),
        isError: e.type === "tool_result" ? e.isError : false,
      },
    });
  };

  const finish = async (status: "DONE" | "ERROR", summary: string, error?: string) => {
    await db.agentRun.update({
      where: { id: run.id },
      data: { status, summary, error, inputTokens, outputTokens, toolCalls, finishedAt: new Date() },
    });
    if (status === "DONE") await emit({ type: "done", summary, inputTokens, outputTokens, toolCalls });
    else await emit({ type: "error", message: error ?? "Agent failed" });
    return { runId: run.id, status, summary };
  };

  await emit({ type: "run", runId: run.id, model: modelLabel });
  const tools = toolDefinitions();
  const history: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: goal }];
  let lastText = "";

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: systemPrompt(),
        tools,
        messages: history,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        // If the model declines for policy reasons, the API retries on its default fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      inputTokens += response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
      outputTokens += response.usage.output_tokens;

      for (const block of response.content) {
        if (block.type === "thinking" && block.thinking) await emit({ type: "thinking", text: block.thinking });
        if (block.type === "text" && block.text.trim()) {
          lastText = block.text;
          await emit({ type: "text", text: block.text });
        }
      }

      // Append the full content (thinking blocks included, unchanged) - required for the next turn.
      history.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") return finish("ERROR", lastText, `Model declined: ${response.stop_details?.explanation ?? "refusal"}`);
      if (response.stop_reason === "max_tokens") return finish("ERROR", lastText, "Response hit max_tokens");
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason !== "tool_use") return finish("DONE", lastText);

      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      for (const c of calls) await emit({ type: "tool_call", id: c.id, name: c.name, input: c.input });
      toolCalls += calls.length;

      // Parallel tool calls run concurrently; all results go back together in a single user message.
      const results = await Promise.all(calls.map((c) => executeTool(c.name, c.input, { runId: run.id })));
      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const [i, c] of calls.entries()) {
        const r = results[i];
        await emit({ type: "tool_result", id: c.id, name: c.name, output: r.output, isError: r.isError });
        toolResults.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(r.output), is_error: r.isError });
      }
      history.push({ role: "user", content: toolResults });
    }
    return finish("ERROR", lastText, `Stopped after ${maxTurns} turns`);
  } catch (e) {
    const msg =
      e instanceof Anthropic.AuthenticationError ? "Invalid or missing ANTHROPIC_API_KEY"
      : e instanceof Anthropic.RateLimitError ? "Rate limited by the Claude API - try again shortly"
      : e instanceof Anthropic.APIError ? `Claude API error ${e.status}: ${e.message}`
      : (e as Error).message;
    return finish("ERROR", lastText, msg);
  }
}
