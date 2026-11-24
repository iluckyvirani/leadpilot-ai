import { z } from "zod";
import { onMessageSent } from "@/lib/agent/followups";
import { db } from "@/lib/db";
import { canContact } from "@/lib/leads/guardrails";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), body: z.string().trim().min(1).max(4000), subject: z.string().trim().max(200).nullable() }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("sent") }),
]);

/** Human-in-the-loop: approve (optionally edited), reject, or confirm a message was sent. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/messages/[id]">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 });
  const msg = await db.message.findUnique({ where: { id }, include: { lead: true } });
  if (!msg || msg.direction !== "OUTBOUND") return Response.json({ error: "Message not found" }, { status: 404 });

  const a = parsed.data;
  if (a.action === "reject") {
    await db.message.update({ where: { id }, data: { status: "REJECTED" } });
    return Response.json({ ok: true });
  }
  // Re-check guardrails at approval/send time: the lead may have opted out since the draft was written.
  const gate = canContact(msg.lead, msg.channel);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 409 });

  if (a.action === "approve") {
    if (msg.status !== "DRAFT") return Response.json({ error: "Only drafts can be approved" }, { status: 409 });
    const edited = a.body !== msg.body || (a.subject ?? null) !== msg.subject;
    await db.message.update({
      where: { id },
      data: { status: "APPROVED", body: a.body, subject: msg.channel === "EMAIL" ? a.subject : null, author: edited ? "HUMAN" : msg.author },
    });
    return Response.json({ ok: true });
  }
  if (msg.status !== "APPROVED") return Response.json({ error: "Approve the message first" }, { status: 409 });
  await db.message.update({ where: { id }, data: { status: "SENT" } });
  await onMessageSent(msg.leadId);
  return Response.json({ ok: true });
}
