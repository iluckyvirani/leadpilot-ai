import { z } from "zod";
import { runAgent, type AgentEvent } from "@/lib/agent/run";

export const maxDuration = 300;

const Body = z.object({ goal: z.string().trim().min(5).max(2000) });

/** Runs the agent and streams its events as NDJSON (one JSON object per line). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "goal must be 5-2000 characters" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent({ goal: parsed.data.goal, onEvent: send });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
