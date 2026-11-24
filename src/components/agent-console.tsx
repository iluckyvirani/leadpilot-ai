"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/run";
import { Trace } from "./trace";

const PRESETS = [
  "Research every lead that has not been scored yet: audit websites, find emails, score them, then draft first outreach for HOT and WARM leads.",
  "Draft a first WhatsApp message for the top 3 HOT leads that have no message yet.",
  "Which leads have a website with problems? Audit them and summarise the most common issues.",
];

export function AgentConsole() {
  const router = useRouter();
  const [goal, setGoal] = useState(PRESETS[0]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function run() {
    setRunning(true);
    setEvents([]);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setEvents([{ type: "error", message: err.error }]);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        const parsed = lines.filter(Boolean).map((l) => JSON.parse(l) as AgentEvent);
        if (parsed.length) {
          setEvents((prev) => [...prev, ...parsed]);
          if (parsed.some((p) => p.type === "tool_result")) router.refresh();
          requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
        }
      }
    } catch (e) {
      setEvents((prev) => [...prev, { type: "error", message: (e as Error).message }]);
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p, i) => (
          <button key={i} type="button" onClick={() => setGoal(p)} disabled={running}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50">
            {["Research & draft", "Top 3 WhatsApp", "Website audit report"][i]}
          </button>
        ))}
      </div>
      <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} disabled={running}
        className="w-full rounded-lg border border-zinc-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        placeholder="Tell the agent what to do…" />
      <div className="flex items-center gap-3">
        <button type="button" onClick={run} disabled={running || goal.trim().length < 5}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {running ? "Agent is working…" : "Run agent"}
        </button>
        <span className="text-xs text-zinc-500">The agent only drafts. You approve every message before it goes out.</span>
      </div>
      {events.length > 0 && (
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <Trace events={events} />
          {running && <p className="mt-2 animate-pulse text-xs text-zinc-500">…</p>}
          <div ref={bottom} />
        </div>
      )}
    </div>
  );
}
