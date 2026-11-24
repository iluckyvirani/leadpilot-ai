import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddLead } from "@/components/add-lead";
import { AgentConsole } from "@/components/agent-console";
import { Badge, Card, Skeleton, Stat } from "@/components/ui";
import { db } from "@/lib/db";

async function Stats() {
  await connection();
  const [leads, hot, drafts, contacted, replied] = await Promise.all([
    db.lead.count(),
    db.lead.count({ where: { tier: "HOT" } }),
    db.message.count({ where: { status: { in: ["DRAFT", "APPROVED"] } } }),
    db.lead.count({ where: { status: "CONTACTED" } }),
    db.lead.count({ where: { status: { in: ["REPLIED", "INTERESTED", "CALL_BACK", "DEMO_BOOKED", "QUOTE_SENT", "WON"] } } }),
  ]);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Stat label="Leads" value={leads} />
      <Stat label="Hot leads" value={hot} />
      <Stat label="Awaiting approval" value={<Link href="/approvals" className="text-indigo-700">{drafts}</Link>} />
      <Stat label="Contacted" value={contacted} hint="follow-ups automated" />
      <Stat label="Replied" value={replied} />
    </div>
  );
}

async function LeadsTable() {
  await connection();
  const leads = await db.lead.findMany({
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    include: { _count: { select: { messages: { where: { status: "DRAFT" } } } } },
    take: 200,
  });
  if (!leads.length) return <p className="text-sm text-zinc-500">No leads yet. Run <code>npm run db:seed</code> or add one.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr><th className="py-2 pr-3">Business</th><th className="pr-3">Score</th><th className="pr-3">Status</th><th className="pr-3">Website</th><th className="pr-3">Contact</th><th>Drafts</th></tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {leads.map((l) => (
            <tr key={l.id} className="hover:bg-zinc-50">
              <td className="py-2 pr-3">
                <Link href={`/leads/${l.id}`} className="font-medium text-zinc-900 hover:text-indigo-700">{l.name}</Link>
                <div className="text-xs text-zinc-500">{l.category} · {l.city}{l.rating ? ` · ★ ${l.rating} (${l.reviews})` : ""}</div>
              </td>
              <td className="pr-3 whitespace-nowrap">{l.score ?? <span className="text-zinc-400">-</span>} <Badge value={l.tier} kind="tier" /></td>
              <td className="pr-3"><Badge value={l.status} /></td>
              <td className="pr-3 text-xs">
                {!l.website ? <span className="text-rose-600">none</span>
                  : !l.auditedAt ? <span className="text-zinc-400">not audited</span>
                  : l.auditIssues.length ? <span className="text-amber-700">{l.auditIssues.length} issues</span>
                  : <span className="text-emerald-700">ok</span>}
              </td>
              <td className="pr-3 text-xs text-zinc-600">
                {l.email ? `✉ ${l.emailStatus.toLowerCase()}` : ""} {l.phoneType === "MOBILE" ? "📱" : l.phoneType === "LANDLINE" ? "☎" : ""} {l.instagram ? "IG" : ""}
              </td>
              <td className="text-xs">{l._count.messages || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales agent</h1>
        <p className="text-sm text-zinc-500">Give Claude a goal. It audits websites, finds emails, scores leads and drafts outreach, using tools against this database.</p>
      </div>
      <Suspense fallback={<Skeleton rows={1} />}><Stats /></Suspense>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Agent" className="lg:col-span-2"><AgentConsole /></Card>
        <Card title="Leads" action={<AddLead />} className="lg:col-span-3">
          <Suspense fallback={<Skeleton rows={8} />}><LeadsTable /></Suspense>
        </Card>
      </div>
    </div>
  );
}
