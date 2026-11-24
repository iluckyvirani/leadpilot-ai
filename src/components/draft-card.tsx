"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, label } from "./ui";

export type DraftView = {
  id: string; channel: "EMAIL" | "WHATSAPP" | "INSTAGRAM"; status: string; subject: string | null; body: string;
  rationale: string | null; author: string; createdAt: string;
  lead: { id: string; name: string; city: string; email: string | null; phone: string | null; instagram: string | null; tier: string | null; score: number | null };
};

function sendLink(d: DraftView, body: string, subject: string) {
  if (d.channel === "EMAIL" && d.lead.email) return `mailto:${d.lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (d.channel === "WHATSAPP" && d.lead.phone) return `https://wa.me/${d.lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;
  if (d.channel === "INSTAGRAM" && d.lead.instagram) return d.lead.instagram;
  return null;
}

/** One message in the approval queue: edit -> approve -> open in the real app -> confirm sent. */
export function DraftCard({ draft }: { draft: DraftView }) {
  const router = useRouter();
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/messages/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) setError((await res.json().catch(() => ({ error: "Failed" }))).error);
    setBusy(false);
    router.refresh();
  }

  const link = sendLink(draft, body, subject);
  const isDraft = draft.status === "DRAFT";

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/leads/${draft.lead.id}`} className="font-semibold text-zinc-900 hover:text-indigo-700">{draft.lead.name}</Link>
        <span className="text-xs text-zinc-500">{draft.lead.city}</span>
        <Badge value={draft.lead.tier} kind="tier" />
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">{label(draft.channel)}</span>
        <Badge value={draft.status} />
        <span className="ml-auto text-xs text-zinc-400">by {label(draft.author)}</span>
      </header>
      {draft.channel === "EMAIL" && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!isDraft}
          className="mb-2 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:bg-zinc-50" />
      )}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!isDraft} rows={Math.min(10, body.split("\n").length + 2)}
        className="w-full rounded-md border border-zinc-300 p-3 text-sm leading-relaxed disabled:bg-zinc-50" />
      <div className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>{draft.rationale && <>Why: {draft.rationale}</>}</span>
        <span>{body.length} chars</span>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <footer className="mt-3 flex flex-wrap gap-2">
        {isDraft && (
          <>
            <button disabled={busy} onClick={() => act({ action: "approve", body, subject: draft.channel === "EMAIL" ? subject : null })}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Approve</button>
            <button disabled={busy} onClick={() => act({ action: "reject" })}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">Reject</button>
          </>
        )}
        {draft.status === "APPROVED" && (
          <>
            {link && <a href={link} target="_blank" rel="noreferrer" className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">Open in {label(draft.channel)} ↗</a>}
            <button disabled={busy} onClick={() => act({ action: "sent" })}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">I sent it</button>
          </>
        )}
      </footer>
    </article>
  );
}
