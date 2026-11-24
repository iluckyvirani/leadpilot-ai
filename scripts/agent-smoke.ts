// Offline smoke test for the agent loop, tools, guardrails and the opt-out rule.
// A scripted fake client stands in for Claude, so this runs without an API key:
//   npm run smoke
import "dotenv/config";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/lib/db";
import { runAgent } from "../src/lib/agent/run";
import { toolDefinitions } from "../src/lib/agent/tools";
import { triageReply } from "../src/lib/agent/triage";

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

type Block = Record<string, unknown>;
const reply = (content: Block[], stop: string) => ({
  id: "msg_fake", type: "message", role: "assistant", model: "fake", content, stop_reason: stop, stop_details: null,
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

async function main() {
  const defs = toolDefinitions();
  check(defs.every((d) => d.strict && (d.input_schema as { additionalProperties?: boolean }).additionalProperties === false),
    `${defs.length} tool schemas are strict with additionalProperties:false`);

  const physio = await db.lead.findFirstOrThrow({ where: { name: { startsWith: "Northside" } } });
  const gym = await db.lead.findFirstOrThrow({ where: { name: { startsWith: "Iron Republic" } } });
  check(physio.phoneType === "MOBILE" && gym.phoneType === "LANDLINE", "seed phones classified (mobile / landline)");

  // Scripted "Claude": search -> audit + score in parallel -> two drafts (one must be blocked) -> summary.
  const script = [
    reply([{ type: "tool_use", id: "t1", name: "search_leads", input: { status: null, tier: null, needs: "audit", limit: 5 } }], "tool_use"),
    reply([
      { type: "thinking", thinking: "Audit the physio site, then score it.", signature: "x" },
      { type: "tool_use", id: "t2", name: "audit_website", input: { lead_id: physio.id } },
      { type: "tool_use", id: "t3", name: "score_lead", input: { lead_id: physio.id } },
    ], "tool_use"),
    reply([
      { type: "tool_use", id: "t4", name: "draft_outreach", input: { lead_id: physio.id, channel: "WHATSAPP", subject: null, body: "Hi Northside team, your site has no WhatsApp button. Want a free mock-up?", personalization_note: "audit issue" } },
      { type: "tool_use", id: "t5", name: "draft_outreach", input: { lead_id: gym.id, channel: "WHATSAPP", subject: null, body: "Hi", personalization_note: "x" } },
      { type: "tool_use", id: "t6", name: "score_lead", input: { lead_id: 42 } },
    ], "tool_use"),
    reply([{ type: "text", text: "Audited and scored Northside; 1 WhatsApp draft waiting for approval. Gym skipped (landline)." }], "end_turn"),
  ];
  const requests: unknown[] = [];
  const fake = { create: async (body: unknown) => { requests.push(structuredClone(body)); return script.shift(); } } as unknown as Pick<Anthropic["beta"]["messages"], "create">;

  const events: string[] = [];
  const result = await runAgent({ goal: "smoke test", client: fake, onEvent: (e) => { events.push(e.type); } });
  check(result.status === "DONE", "agent run finished with DONE");

  const steps = await db.agentStep.findMany({ where: { runId: result.runId }, orderBy: { index: "asc" } });
  const results = steps.filter((s) => s.kind === "tool_result");
  check(results.length === 6, `6 tool results persisted (got ${results.length})`);
  check(results.find((s) => (s.data as { id: string }).id === "t5")?.isError === true, "guardrail blocked WhatsApp to a landline");
  check(results.find((s) => (s.data as { id: string }).id === "t6")?.isError === true, "zod rejected a bad tool argument");

  const third = requests[2] as { messages: { role: string; content: { type: string }[] }[] };
  const lastUser = third.messages[third.messages.length - 1];
  check(lastUser.role === "user" && lastUser.content.length === 2 && lastUser.content.every((c) => c.type === "tool_result"),
    "parallel tool results returned in ONE user message");
  const second = requests[1] as { messages: { role: string; content: { type: string }[] }[] };
  check(third.messages[3].content.some((c) => c.type === "thinking") && second.messages.length === 3, "thinking blocks passed back unchanged");

  const updated = await db.lead.findUniqueOrThrow({ where: { id: physio.id } });
  check(updated.auditedAt !== null && updated.score !== null, `lead audited (${updated.auditIssues.length} issues) and scored ${updated.score} ${updated.tier}`);
  const drafts = await db.message.count({ where: { leadId: physio.id, status: "DRAFT" } });
  check(drafts === 1, "one DRAFT saved for human approval");

  // Opt-out is decided by a rule, before any model call (no client passed -> would throw if called).
  const opt = await triageReply(physio.id, "WHATSAPP", "Please STOP messaging us.");
  const after = await db.lead.findUniqueOrThrow({ where: { id: physio.id } });
  const pending = await db.message.count({ where: { leadId: physio.id, status: "DRAFT" } });
  check(opt.optOut && after.status === "DO_NOT_CONTACT" && pending === 0, "opt-out -> DO_NOT_CONTACT and pending drafts rejected");

  console.log(`\nEvents: ${events.join(" > ")}`);
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed. Run `npm run db:seed` to reset demo data.");
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => db.$disconnect());
