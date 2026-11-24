import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReplyBox } from "@/components/reply-box";
import { Badge, Card, Skeleton, label } from "@/components/ui";
import { db } from "@/lib/db";
import type { ScorePart } from "@/lib/leads/score";

async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await db.lead.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!lead) notFound();
  const parts = (lead.scoreBreakdown as ScorePart[] | null) ?? [];
  const channels = [lead.phone && "WHATSAPP", lead.email && "EMAIL", lead.instagram && "INSTAGRAM"].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">← Dashboard</Link>
        <h1 className="text-2xl font-semibold">{lead.name}</h1>
        <Badge value={lead.tier} kind="tier" />
        <Badge value={lead.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-zinc-500">Category</dt><dd className="col-span-2">{lead.category}</dd>
            <dt className="text-zinc-500">City</dt><dd className="col-span-2">{lead.city}, {lead.country}</dd>
            <dt className="text-zinc-500">Rating</dt><dd className="col-span-2">{lead.rating ? `★ ${lead.rating} (${lead.reviews} reviews)` : "-"}</dd>
            <dt className="text-zinc-500">Phone</dt><dd className="col-span-2">{lead.phone ?? "-"} <span className="text-xs text-zinc-500">{label(lead.phoneType)}</span></dd>
            <dt className="text-zinc-500">Email</dt><dd className="col-span-2 break-all">{lead.email ?? "-"} {lead.email && <span className="text-xs text-zinc-500">{label(lead.emailStatus)}</span>}</dd>
            <dt className="text-zinc-500">Website</dt><dd className="col-span-2 break-all">{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" className="text-indigo-700">{lead.website}</a> : "none"}</dd>
            <dt className="text-zinc-500">Instagram</dt><dd className="col-span-2 break-all">{lead.instagram ?? "-"}</dd>
            {lead.nextFollowUpAt && (<><dt className="text-zinc-500">Next follow-up</dt><dd className="col-span-2">{lead.nextFollowUpAt.toDateString()}</dd></>)}
          </dl>
          {lead.notes && <pre className="mt-3 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs text-zinc-600">{lead.notes}</pre>}
        </Card>
        <Card title={`Score ${lead.score ?? "-"}`}>
          {parts.length ? (
            <ul className="space-y-1 text-sm">{parts.map((p) => <li key={p.rule} className="flex justify-between"><span>{p.rule}</span><span className="font-mono text-zinc-500">+{p.points}</span></li>)}</ul>
          ) : <p className="text-sm text-zinc-500">Not scored yet.</p>}
        </Card>
        <Card title="Website audit">
          {!lead.website ? <p className="text-sm text-zinc-500">No website: the main opportunity.</p>
            : !lead.auditedAt ? <p className="text-sm text-zinc-500">Not audited yet.</p>
            : lead.auditIssues.length ? <ul className="list-disc space-y-1 pl-4 text-sm">{lead.auditIssues.map((i) => <li key={i}>{i}</li>)}</ul>
            : <p className="text-sm text-emerald-700">No issues found.</p>}
        </Card>
      </div>
      <Card title="Conversation">
        <div className="space-y-3">
          {lead.messages.length === 0 && <p className="text-sm text-zinc-500">No messages yet.</p>}
          {lead.messages.map((m) => (
            <div key={m.id} className={`max-w-2xl rounded-lg p-3 text-sm ${m.direction === "INBOUND" ? "bg-violet-50" : "ml-auto bg-zinc-50"}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>{label(m.channel)}</span><Badge value={m.status} />{m.intent && <span>intent: {m.intent}</span>}
                <span className="ml-auto">{m.createdAt.toLocaleString("en-GB")}</span>
              </div>
              {m.subject && <p className="font-medium">{m.subject}</p>}
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.rationale && <p className="mt-1 text-xs text-zinc-500">{m.direction === "INBOUND" ? "Triage" : "Why"}: {m.rationale}</p>}
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Simulate an inbound reply</p>
          <ReplyBox leadId={lead.id} channels={channels} />
        </div>
      </Card>
    </div>
  );
}

export default function LeadPage({ params }: PageProps<"/leads/[id]">) {
  return <Suspense fallback={<Skeleton rows={6} />}><LeadDetail params={params} /></Suspense>;
}
