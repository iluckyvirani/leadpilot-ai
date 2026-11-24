import { sender } from "@/lib/config";
import { getProvider } from "./provider";
import type { Triage } from "./triage";

// Demo mode: a scripted stand-in for Claude so the whole app runs without an API key or credits.
// It drives the REAL loop, tools, guardrails and database; only the "decisions" are scripted.
// It is enabled when no provider is configured (see provider.ts) or DEMO_MODE=true.

export const isDemoMode = () => getProvider() === "demo";

type Lead = {
  id: string; name: string; category: string; city: string; website: string | null; websiteIssues: number;
  email: string | null; emailStatus: string; phoneType: string; instagram: boolean; rating: number | null; reviews: number | null;
  tier: string | null; audited: boolean;
};
type Block = Record<string, unknown>;

const msg = (content: Block[], stop: "tool_use" | "end_turn") => ({
  id: "msg_demo", type: "message", role: "assistant", model: "demo", content, stop_reason: stop, stop_details: null,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});
const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });
const think = (thinking: string): Block => ({ type: "thinking", thinking, signature: "demo" });

function readResults(body: { messages: { role: string; content: unknown }[] }) {
  const last = body.messages[body.messages.length - 1];
  const out: unknown[] = [];
  if (Array.isArray(last?.content)) {
    for (const c of last.content as { type: string; content?: string }[]) {
      if (c.type === "tool_result" && c.content) { try { out.push(JSON.parse(c.content)); } catch { /* ignore */ } }
    }
  }
  return out;
}

function draftFor(l: Lead) {
  const channel = l.phoneType === "MOBILE" ? "WHATSAPP" : l.email && l.emailStatus === "FOUND" ? "EMAIL" : l.instagram ? "INSTAGRAM" : null;
  if (!channel) return null;
  const proof = l.reviews ? `${l.reviews} reviews${l.rating ? ` at ${l.rating}` : ""}` : "a great local reputation";
  const hook = !l.website ? `I couldn't find a website for ${l.name}` : l.websiteIssues ? `I checked your website and found ${l.websiteIssues} quick fix${l.websiteIssues > 1 ? "es" : ""} (for example, no WhatsApp button)` : `your site looks solid`;
  const ask = `Would a free one-page mock-up be useful? No obligation.`;
  const body = channel === "EMAIL"
    ? `Hi ${l.name} team,\n\n${proof} is impressive. ${hook}, which means customers can miss you.\n\nI build ${sender.offer}. ${ask}\n\nBest,\n${sender.name}, ${sender.company}`
    : `Hi ${l.name} team, ${proof} is impressive. ${hook}. ${ask} - ${sender.name}`;
  return { channel, body, subject: channel === "EMAIL" ? `A small idea for ${l.name}` : null, note: `Used ${proof}${l.website ? ` and ${l.websiteIssues} audit issue(s)` : " and the missing website"} (demo mode)` };
}

/** Returns an object shaped like `client.beta.messages` with a scripted `create`. */
export function createDemoClient() {
  let turn = 0;
  let leads: Lead[] = [];
  return {
    async create(body: { messages: { role: string; content: unknown }[] }) {
      const results = readResults(body);
      turn++;
      if (turn === 1) {
        return msg([think("Start by finding leads that have not been scored yet."),
          { type: "text", text: "[Demo mode - scripted, no API credits used] Finding unscored leads first." },
          toolUse("d1", "search_leads", { status: null, tier: null, needs: "score", limit: 6 })], "tool_use");
      }
      if (turn === 2) {
        leads = ((results[0] as { leads?: Lead[] })?.leads ?? []).slice(0, 6);
        if (!leads.length) return msg([{ type: "text", text: "Every lead already has a score, so there is nothing new to research." }], "end_turn");
        const calls = leads.filter((l) => l.website).flatMap((l) => [toolUse(`a-${l.id}`, "audit_website", { lead_id: l.id }), toolUse(`e-${l.id}`, "find_contact_email", { lead_id: l.id })]);
        return msg([think("Audit and email lookup are independent, so I can run them in parallel."), ...(calls.length ? calls : [toolUse("n", "search_leads", { status: null, tier: null, needs: null, limit: 1 })])], "tool_use");
      }
      if (turn === 3) {
        return msg([think("Now score every lead with the fresh data."), ...leads.map((l) => toolUse(`s-${l.id}`, "score_lead", { lead_id: l.id }))], "tool_use");
      }
      if (turn === 4) {
        return msg([toolUse("d4", "search_leads", { status: "NEW", tier: null, needs: "outreach", limit: 10 })], "tool_use");
      }
      if (turn === 5) {
        const ready = ((results[0] as { leads?: Lead[] })?.leads ?? []).filter((l) => l.tier === "HOT" || l.tier === "WARM").slice(0, 4);
        const calls = ready.flatMap((l) => {
          const d = draftFor(l);
          return d ? [toolUse(`dr-${l.id}`, "draft_outreach", { lead_id: l.id, channel: d.channel, subject: d.subject, body: d.body, personalization_note: d.note })] : [];
        });
        if (!calls.length) return msg([{ type: "text", text: "No HOT or WARM leads with a usable channel, so I drafted nothing." }], "end_turn");
        return msg([think("Draft only for HOT and WARM leads, on the channel each can receive."), ...calls], "tool_use");
      }
      return msg([{ type: "text", text: "Done (demo mode). I audited websites, looked for emails, scored the leads and saved outreach drafts for HOT/WARM leads. Review them on the Approvals page - nothing has been sent." }], "end_turn");
    },
  };
}

/** Rule-based stand-in for the structured-output triage call. */
export function demoTriage(text: string): Triage {
  const t = text.toLowerCase();
  if (/not interested|no thanks|no thank you/.test(t)) return { intent: "not_interested", new_status: "NOT_INTERESTED", summary: "Declined the offer.", suggested_reply: null, reasoning: "Explicit refusal (demo rules)." };
  if (/call|phone|ring/.test(t)) return { intent: "wants_call", new_status: "CALL_BACK", summary: "Asked for a call.", suggested_reply: `Of course! I'll call you then.${sender.bookingUrl ? ` You can also pick a time: ${sender.bookingUrl}` : ""} - ${sender.name}`, reasoning: "Mentions a call (demo rules)." };
  if (/demo|meeting|book/.test(t)) return { intent: "demo_request", new_status: "DEMO_BOOKED", summary: "Wants a demo.", suggested_reply: `Great - let's set it up. - ${sender.name}`, reasoning: "Asks for a demo (demo rules)." };
  if (/cost|price|how much|quote/.test(t)) return { intent: "price_question", new_status: "INTERESTED", summary: "Asked about price.", suggested_reply: `Happy to share a quick estimate once I see what you need. A free mock-up comes first. - ${sender.name}`, reasoning: "Price question shows interest (demo rules)." };
  if (/yes|interested|sure|sounds good/.test(t)) return { intent: "interested", new_status: "INTERESTED", summary: "Interested.", suggested_reply: `Wonderful, I'll send the free sample shortly. - ${sender.name}`, reasoning: "Positive reply (demo rules)." };
  return { intent: "other", new_status: "REPLIED", summary: "Replied.", suggested_reply: null, reasoning: "No clear intent (demo rules)." };
}
