import { connection } from "next/server";
import { Suspense } from "react";
import { DraftCard, type DraftView } from "@/components/draft-card";
import { Skeleton } from "@/components/ui";
import { db } from "@/lib/db";

async function Queue() {
  await connection();
  const msgs = await db.message.findMany({
    where: { direction: "OUTBOUND", status: { in: ["DRAFT", "APPROVED"] } },
    include: { lead: { select: { id: true, name: true, city: true, email: true, phone: true, instagram: true, tier: true, score: true } } },
    orderBy: [{ lead: { score: { sort: "desc", nulls: "last" } } }, { createdAt: "asc" }],
  });
  if (!msgs.length) return <p className="text-sm text-zinc-500">Nothing to review. Run the agent from the dashboard to create drafts.</p>;
  const drafts: DraftView[] = msgs.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
  return <div className="grid gap-4 lg:grid-cols-2">{drafts.map((d) => <DraftCard key={d.id} draft={d} />)}</div>;
}

export default function ApprovalsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-zinc-500">
          The agent never sends anything. Edit and approve each draft, open it in email / WhatsApp / Instagram, then confirm it was sent: that starts the Day 3 / Day 7 follow-up timer.
        </p>
      </div>
      <Suspense fallback={<Skeleton rows={6} />}><Queue /></Suspense>
    </div>
  );
}
