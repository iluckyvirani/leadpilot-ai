import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Trace } from "@/components/trace";
import { Card, Skeleton } from "@/components/ui";
import type { AgentEvent } from "@/lib/agent/run";
import { db } from "@/lib/db";

async function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await db.agentRun.findUnique({ where: { id }, include: { steps: { orderBy: { index: "asc" } } } });
  if (!run) notFound();
  const events = run.steps.map((s) => s.data as AgentEvent);
  events.push(run.status === "ERROR"
    ? { type: "error", message: run.error ?? "Failed" }
    : { type: "done", summary: run.summary ?? "", inputTokens: run.inputTokens, outputTokens: run.outputTokens, toolCalls: run.toolCalls });
  return (
    <div className="space-y-4">
      <Link href="/runs" className="text-sm text-zinc-500 hover:text-zinc-800">← All runs</Link>
      <h1 className="text-xl font-semibold">{run.goal}</h1>
      <p className="text-xs text-zinc-500">{run.model} · {run.trigger} · {run.createdAt.toLocaleString("en-GB")}</p>
      <Card title="Trace"><Trace events={events} /></Card>
    </div>
  );
}

export default function RunPage({ params }: PageProps<"/runs/[id]">) {
  return <Suspense fallback={<Skeleton rows={8} />}><RunDetail params={params} /></Suspense>;
}
