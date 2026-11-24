import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODEL, sender } from "@/lib/config";
import { db } from "@/lib/db";
import { canContact, isOptOut } from "@/lib/leads/guardrails";
import { demoTriage } from "./demo";
import { getProvider, openaiJson } from "./provider";

// Reply triage is a single structured-output call, not an agent: the task is fixed (read one reply,
// classify it, suggest an answer), so one schema-checked response is cheaper and more predictable.

export const TriageSchema = z.object({
  intent: z.enum(["interested", "wants_call", "demo_request", "price_question", "question", "not_interested", "out_of_office", "other"]),
  new_status: z.enum(["REPLIED", "INTERESTED", "CALL_BACK", "DEMO_BOOKED", "NOT_INTERESTED"]),
  summary: z.string().describe("One sentence: what the lead said"),
  suggested_reply: z.string().nullable().describe("Short reply for a human to approve, or null when no reply is needed"),
  reasoning: z.string().describe("Why this intent and status"),
});
export type Triage = z.infer<typeof TriageSchema>;

export async function triageReply(leadId: string, channel: "EMAIL" | "WHATSAPP" | "INSTAGRAM", text: string, client?: Pick<Anthropic["beta"]["messages"], "parse">) {
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { messages: { where: { direction: "OUTBOUND", status: { in: ["SENT", "APPROVED"] } }, orderBy: { createdAt: "desc" }, take: 3 } },
  });

  const inbound = await db.message.create({
    data: { leadId, channel, direction: "INBOUND", status: "RECEIVED", author: "LEAD", body: text },
  });

  // 1. Hard rule first: opt-out never depends on the model.
  if (isOptOut(text)) {
    await db.$transaction([
      db.message.update({ where: { id: inbound.id }, data: { intent: "opt_out", rationale: "Matched opt-out keywords (rule, no LLM)" } }),
      db.lead.update({ where: { id: leadId }, data: { status: "DO_NOT_CONTACT", nextFollowUpAt: null } }),
      db.message.updateMany({ where: { leadId, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "REJECTED" } }),
    ]);
    return { optOut: true as const, status: "DO_NOT_CONTACT" };
  }

  // 2. Structured output: the response is validated against TriageSchema.
  const context = lead.messages.map((m) => `[${m.channel}] ${m.subject ? m.subject + " - " : ""}${m.body}`).join("\n---\n") || "(none recorded)";
  let t: Triage;
  const provider = client ? "anthropic" : getProvider();
  if (provider === "demo") {
    t = demoTriage(text);
  } else if (provider === "openai") {
    const schema = JSON.stringify(z.toJSONSchema(TriageSchema));
    const raw = await openaiJson(
      `You triage replies to cold outreach sent by ${sender.name} (${sender.company}). Reply with ONLY a JSON object matching this JSON Schema: ${schema}`,
      `Lead: ${lead.name} (${lead.category}, ${lead.city}). Channel: ${channel}.

Our earlier messages:
${context}

Their reply:
${text}`,
    );
    t = TriageSchema.parse(raw);
  } else {
  const messages = client ?? new Anthropic().beta.messages;
  const res = await messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(TriageSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      `You triage replies to cold outreach sent by ${sender.name} (${sender.company}, offering ${sender.offer}). ` +
      `Classify the reply and pick the pipeline status. If a reply is useful, draft a short, friendly answer in the same language and channel style` +
      (sender.bookingUrl ? `; when they want a call or demo, include the booking link ${sender.bookingUrl}` : "") + ".",
    messages: [{
      role: "user",
      content: `Lead: ${lead.name} (${lead.category}, ${lead.city}). Channel: ${channel}.\n\nOur earlier messages:\n${context}\n\nTheir reply:\n${text}`,
    }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Could not classify this reply");
  t = res.parsed_output;
  }

  await db.message.update({ where: { id: inbound.id }, data: { intent: t.intent, rationale: `${t.summary} | ${t.reasoning}` } });
  // Any reply stops the follow-up sequence.
  const updated = await db.lead.update({ where: { id: leadId }, data: { status: t.new_status, nextFollowUpAt: null } });

  let draftId: string | null = null;
  if (t.suggested_reply && canContact(updated, channel).ok) {
    const draft = await db.message.create({
      data: { leadId, channel, direction: "OUTBOUND", status: "DRAFT", author: "AGENT", body: t.suggested_reply,
        subject: channel === "EMAIL" ? `Re: ${lead.messages.find((m) => m.subject)?.subject ?? lead.name}` : null,
        rationale: `Reply to: ${t.summary}` },
    });
    draftId = draft.id;
  }
  return { optOut: false as const, triage: t, draftId };
}
