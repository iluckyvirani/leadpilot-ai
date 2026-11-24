import type { ReactNode } from "react";

const TIER: Record<string, string> = {
  HOT: "bg-rose-100 text-rose-700 ring-rose-200",
  WARM: "bg-amber-100 text-amber-800 ring-amber-200",
  COLD: "bg-sky-100 text-sky-700 ring-sky-200",
};
const STATUS: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  INTERESTED: "bg-emerald-100 text-emerald-700",
  DEMO_BOOKED: "bg-emerald-100 text-emerald-700",
  CALL_BACK: "bg-teal-100 text-teal-700",
  DO_NOT_CONTACT: "bg-zinc-800 text-white",
  NOT_INTERESTED: "bg-zinc-200 text-zinc-600",
  NO_RESPONSE: "bg-zinc-200 text-zinc-600",
  DRAFT: "bg-amber-100 text-amber-800",
  APPROVED: "bg-indigo-100 text-indigo-700",
  SENT: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-zinc-200 text-zinc-500 line-through",
  RECEIVED: "bg-violet-100 text-violet-700",
  RUNNING: "bg-amber-100 text-amber-800",
  DONE: "bg-emerald-100 text-emerald-700",
  ERROR: "bg-rose-100 text-rose-700",
};

export const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function Badge({ value, kind = "status" }: { value: string | null | undefined; kind?: "status" | "tier" }) {
  if (!value) return kind === "tier" ? null : <span className="text-zinc-400">-</span>;
  const cls = kind === "tier" ? `ring-1 ${TIER[value] ?? ""}` : STATUS[value] ?? "bg-zinc-100 text-zinc-700";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label(value)}</span>;
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label: l, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{l}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900">{value}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-zinc-100" />)}
    </div>
  );
}
