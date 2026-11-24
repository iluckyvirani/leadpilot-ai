import { z } from "zod";
import { triageReply } from "@/lib/agent/triage";

export const maxDuration = 60;

const Body = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP", "INSTAGRAM"]),
  text: z.string().trim().min(1).max(4000),
});

/** Log an inbound reply. Opt-outs are handled by rule; everything else is classified by Claude. */
export async function POST(req: Request, ctx: RouteContext<"/api/leads/[id]/reply">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "channel and text are required" }, { status: 400 });
  try {
    return Response.json(await triageReply(id, parsed.data.channel, parsed.data.text));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
