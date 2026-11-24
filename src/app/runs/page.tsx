import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, Card, Skeleton } from "@/components/ui";
import { db } from "@/lib/db";

async function Runs() {
  await connection();
  const runs = await db.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  if (!runs.length) return <p className="text-sm text-zinc-500">No runs yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
        <tr><th className="py-2 pr-3">Goal</th><th className="pr-3">Trigger</th><th className="pr-3">Status</th><th className="pr-3">Tools</th><th className="pr-3">Tokens</th><th>When</th></tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {runs.map((r) => (
          <tr key={r.id} className="hover:bg-zinc-50">
            <td className="max-w-md truncate py-2 pr-3"><Link href={`/runs/${r.id}`} className="text-zinc-900 hover:text-indigo-700">{r.goal}</Link></td>
            <td className="pr-3 text-xs">{r.trigger}</td>
            <td className="pr-3"><Badge value={r.status} /></td>
            <td className="pr-3">{r.toolCalls}</td>
            <td className="pr-3 text-xs text-zinc-500">{(r.inputTokens + r.outputTokens).toLocaleString()}</td>
            <td className="text-xs text-zinc-500">{r.createdAt.toLocaleString("en-GB")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RunsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Agent runs</h1>
      <Card><Suspense fallback={<Skeleton rows={6} />}><Runs /></Suspense></Card>
    </div>
  );
}
