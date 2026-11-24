import { db } from "@/lib/db";
import { FOLLOW_UP_DAYS } from "@/lib/config";
import { runAgent } from "./run";

const DAY = 86_400_000;

/**
 * Called when a human marks a message as sent. followUpStage = follow-ups already sent.
 * First touch -> CONTACTED, follow-up due on day 3. Follow-up #1 -> next due on day 7. Last one -> no more.
 * Leads that already replied get no automatic follow-ups (a person is handling the conversation).
 */
export async function onMessageSent(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const now = Date.now();
  if (lead.status === "NEW") {
    await db.lead.update({
      where: { id: leadId },
      data: { status: "CONTACTED", followUpStage: 0, lastContactedAt: new Date(), nextFollowUpAt: new Date(now + FOLLOW_UP_DAYS[0] * DAY) },
    });
    return;
  }
  if (lead.status === "CONTACTED") {
    const stage = lead.followUpStage + 1;
    const gap = stage < FOLLOW_UP_DAYS.length ? FOLLOW_UP_DAYS[stage] - FOLLOW_UP_DAYS[stage - 1] : null;
    await db.lead.update({
      where: { id: leadId },
      data: { followUpStage: stage, lastContactedAt: new Date(), nextFollowUpAt: gap ? new Date(now + gap * DAY) : null },
    });
    return;
  }
  await db.lead.update({ where: { id: leadId }, data: { lastContactedAt: new Date() } });
}

/**
 * Daily automation (Vercel Cron -> /api/cron/followups):
 * 1. leads whose last follow-up went unanswered are closed as NO_RESPONSE,
 * 2. leads with a follow-up due get an agent run that drafts a short, non-repetitive follow-up.
 */
export async function runDueFollowUps() {
  const now = new Date();
  const closed = await db.lead.updateMany({
    where: { status: "CONTACTED", nextFollowUpAt: null, followUpStage: { gte: FOLLOW_UP_DAYS.length },
      lastContactedAt: { lt: new Date(now.getTime() - 5 * DAY) } },
    data: { status: "NO_RESPONSE" },
  });
  const due = await db.lead.findMany({
    where: { status: "CONTACTED", nextFollowUpAt: { lte: now }, messages: { none: { status: "DRAFT" } } },
    orderBy: { score: { sort: "desc", nulls: "last" } },
    take: 10,
  });
  if (!due.length) return { closedNoResponse: closed.count, drafted: 0, runId: null };

  const list = due.map((l) => `- ${l.id} (${l.name}): follow-up #${l.followUpStage + 1} of ${FOLLOW_UP_DAYS.length}`).join("\n");
  const run = await runAgent({
    trigger: "cron",
    goal:
      `Daily follow-up job. These leads were contacted and have not replied:\n${list}\n\n` +
      `For each one: use get_lead to read what was already sent, then draft_outreach ONE follow-up on the same channel. ` +
      `It must be shorter than the first message and must not repeat it. The last follow-up (#${FOLLOW_UP_DAYS.length}) should politely close the loop.`,
  });
  return { closedNoResponse: closed.count, drafted: due.length, runId: run.runId };
}
