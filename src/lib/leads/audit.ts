import { safeFetch } from "./safe-fetch";

export type AuditResult = { reachable: boolean; loadSeconds: number; finalUrl: string; issues: string[] };

/** Quick, sales-ready website checks. Empty `issues` = the site looks fine. */
export async function auditSite(url: string): Promise<AuditResult> {
  const res = await safeFetch(url, 10_000);
  const loadSeconds = Math.round(res.ms / 100) / 10;
  if (!res.ok || !res.html) {
    return { reachable: false, loadSeconds, finalUrl: res.finalUrl, issues: [`Website is not opening (${res.error ?? `HTTP ${res.status}`})`] };
  }
  const low = res.html.slice(0, 400_000).toLowerCase();
  const issues: string[] = [];
  if (!res.finalUrl.toLowerCase().startsWith("https")) issues.push("No HTTPS (browsers show 'Not secure')");
  if (loadSeconds > 3) issues.push(`Slow to load (${loadSeconds}s)`);
  if (!/name=["']viewport["']/.test(low)) issues.push("Not mobile friendly (no viewport tag)");
  if (!low.includes("whatsapp") && !low.includes("wa.me")) issues.push("No WhatsApp button");
  if (!low.includes("<form")) issues.push("No enquiry or booking form");
  if (!low.includes("tel:")) issues.push("No tap-to-call number");
  if (!/<title>\s*\S/.test(low)) issues.push("Missing page title (hurts Google ranking)");
  return { reachable: true, loadSeconds, finalUrl: res.finalUrl, issues };
}
