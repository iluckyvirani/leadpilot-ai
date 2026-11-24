import { lookup } from "node:dns/promises";
import net from "node:net";

// The agent fetches websites stored on leads. Those URLs are user data, so every hop
// (including redirects) is checked: http(s) only, no private / loopback / link-local hosts.

const UA = "Mozilla/5.0 (compatible; LeadPilotAI/1.0; +https://github.com/iluckyvirani/leadpilot-ai)";
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;

export function normalizeUrl(url: string): string {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `http://${u}`;
}

export function domainOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Blocked protocol ${url.protocol}`);
  if (url.username || url.password) throw new Error("Blocked URL with credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`Blocked private host ${host}`);
  return url;
}

export type FetchResult = { ok: boolean; status: number; finalUrl: string; html: string; ms: number; error?: string };

export async function safeFetch(rawUrl: string, timeoutMs = 9000): Promise<FetchResult> {
  const started = Date.now();
  let current = normalizeUrl(rawUrl);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublicUrl(current);
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, url).toString();
        continue;
      }
      const type = res.headers.get("content-type") ?? "text/html";
      let html = "";
      if (res.ok && type.toLowerCase().includes("html") && res.body) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (size < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          size += value.byteLength;
        }
        await reader.cancel().catch(() => {});
        html = new TextDecoder().decode(Buffer.concat(chunks));
      }
      return { ok: res.ok, status: res.status, finalUrl: url.toString(), html, ms: Date.now() - started };
    }
    return { ok: false, status: 0, finalUrl: current, html: "", ms: Date.now() - started, error: "Too many redirects" };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: current, html: "", ms: Date.now() - started, error: (e as Error).message };
  }
}
