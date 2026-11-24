"use client";

import type { AgentEvent } from "@/lib/agent/run";

const ICON: Record<string, string> = { thinking: "💭", text: "💬", tool_call: "🛠️", tool_result: "📦", done: "✅", error: "⚠️", run: "▶️" };

function Json({ value }: { value: unknown }) {
  return (
    <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Renders an agent run step by step: reasoning summaries, tool calls with arguments, and tool results. */
export function Trace({ events }: { events: AgentEvent[] }) {
  return (
    <ol className="space-y-2">
      {events.map((e, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span aria-hidden className="w-5 shrink-0 text-center">{ICON[e.type]}</span>
          <div className="min-w-0 flex-1">
            {e.type === "run" && <p className="text-zinc-500">Run started on <code>{e.model}</code></p>}
            {e.type === "thinking" && <p className="whitespace-pre-wrap italic text-zinc-500">{e.text}</p>}
            {e.type === "text" && <p className="whitespace-pre-wrap text-zinc-800">{e.text}</p>}
            {e.type === "tool_call" && (
              <details>
                <summary className="cursor-pointer font-mono text-xs text-indigo-700">
                  {e.name}({Object.entries((e.input ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && typeof v !== "object").map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(", ")})
                </summary>
                <Json value={e.input} />
              </details>
            )}
            {e.type === "tool_result" && (
              <details>
                <summary className={`cursor-pointer font-mono text-xs ${e.isError ? "text-rose-600" : "text-emerald-700"}`}>
                  {e.name} → {e.isError ? `blocked / error: ${String((e.output as { error?: string })?.error ?? "").slice(0, 90)}` : "ok"}
                </summary>
                <Json value={e.output} />
              </details>
            )}
            {e.type === "done" && (
              <p className="text-xs text-zinc-500">
                Done · {e.toolCalls} tool calls · {e.inputTokens.toLocaleString()} in / {e.outputTokens.toLocaleString()} out tokens
              </p>
            )}
            {e.type === "error" && <p className="text-rose-600">{e.message}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
