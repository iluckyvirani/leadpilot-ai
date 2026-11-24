"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "Hi, yes we have been meaning to sort the website out. What would it cost roughly?",
  "Can you call me tomorrow after 4pm? Busy with patients before that.",
  "Not interested, thanks.",
  "Please stop messaging this number.",
];

/** Paste a reply the lead sent. Opt-outs are handled by rule; anything else is triaged by Claude. */
export function ReplyBox({ leadId, channels }: { leadId: string; channels: string[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState(channels[0] ?? "WHATSAPP");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");

  async function submit() {
    setBusy(true);
    setResult("");
    const res = await fetch(`/api/leads/${leadId}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, text }) });
    const data = await res.json().catch(() => ({ error: "Failed" }));
    if (!res.ok) setResult(`Error: ${data.error}`);
    else if (data.optOut) setResult("Opt-out detected by rule (no AI call). Lead is now Do Not Contact and pending drafts were cancelled.");
    else setResult(`Claude: ${data.triage.intent} → ${data.triage.new_status}. ${data.triage.summary}${data.draftId ? " A suggested reply is waiting in Approvals." : ""}`);
    setText("");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" onClick={() => setText(e)} className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 hover:border-indigo-300">
            {e.slice(0, 28)}…
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-md border border-zinc-300 px-2 text-sm">
          {["WHATSAPP", "EMAIL", "INSTAGRAM"].map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the lead's reply…"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        <button onClick={submit} disabled={busy || !text.trim()} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Triaging…" : "Log reply"}
        </button>
      </div>
      {result && <p className="rounded-md bg-zinc-50 p-2 text-sm text-zinc-700">{result}</p>}
    </div>
  );
}
