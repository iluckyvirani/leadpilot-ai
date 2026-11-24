// Verifies the OpenAI-compatible adapter against a local mock Chat Completions server (no network, no keys):
//   npm run smoke:openai
import "dotenv/config";
import http from "node:http";

process.env.LLM_PROVIDER = "openai";
process.env.OPENAI_BASE_URL = "http://127.0.0.1:4010/v1";
process.env.OPENAI_MODEL = "mock";

let calls = 0;
const seen: { messages: { role: string }[]; tools?: unknown[] }[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const b = JSON.parse(body);
    seen.push(b);
    calls++;
    const msg = calls === 1
      ? { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_leads", arguments: JSON.stringify({ status: null, tier: null, needs: "score", limit: 3 }) } }] }
      : { content: "Found the unscored leads." };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: msg, finish_reason: msg.content ? "stop" : "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
});

(async () => {
  await new Promise<void>((r) => server.listen(4010, r));
  const { db } = await import("../src/lib/db");
  const { runAgent } = await import("../src/lib/agent/run");
  const r = await runAgent({ goal: "adapter smoke test" });
  const steps = await db.agentStep.findMany({ where: { runId: r.runId }, orderBy: { index: "asc" } });
  const ok = r.status === "DONE" && steps.some((s) => s.kind === "tool_result" && !s.isError)
    && seen[0].tools?.length === 7 && seen[1].messages.some((m) => m.role === "tool") && seen[0].messages[0].role === "system";
  console.log(ok ? "PASS  OpenAI-compatible adapter: tool call, tool result and final answer round-trip" : `FAIL  status=${r.status}`);
  process.exitCode = ok ? 0 : 1;
  server.close();
  await db.$disconnect();
})();
