import { resolveMx } from "node:dns/promises";
import { domainOf, normalizeUrl, safeFetch } from "./safe-fetch";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const EMAIL_FULL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const JUNK = ["example", "sentry", "wixpress", "domain.com", "godaddy", "yourname", "email.com",
  "your@", "name@", "user@", "test@", "noreply", "no-reply", "@2x", "u003e"];
const BAD_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js", ".woff", ".ico"];
const ROLE_PREF = ["info", "contact", "hello", "sales", "enquiry", "inquiry", "support", "admin", "office"];
const CONTACT_PATHS = ["contact", "contact-us", "about", "about-us"];
const IG_SKIP = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "about", "direct", "share"]);

const decodeEntities = (s: string) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

/** Cloudflare "email protection" encodes addresses as data-cfemail hex, XOR'd with the first byte. */
export function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

/** Every plausible email on a page: plain text, mailto:, Cloudflare-encoded, and "name [at] site [dot] com".
 *  Emails on the business's own domain come first, then role mailboxes (info@, contact@ ...). */
export function extractEmails(rawHtml: string, domain = ""): string[] {
  const html = decodeEntities(rawHtml ?? "");
  const found: string[] = [];
  for (const m of html.matchAll(/data-cfemail="([0-9a-fA-F]{4,})"/g)) {
    try { found.push(decodeCfEmail(m[1])); } catch { /* ignore */ }
  }
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    try { found.push(decodeURIComponent(m[1])); } catch { found.push(m[1]); }
  }
  const text = html
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
  found.push(...(text.match(EMAIL_RE) ?? []));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const m = raw.replace(/^[.,;:<>()[\]"' ]+|[.,;:<>()[\]"' ]+$/g, "").toLowerCase();
    if (!EMAIL_FULL.test(m) || seen.has(m)) continue;
    if (JUNK.some((j) => m.includes(j)) || BAD_EXT.some((e) => m.endsWith(e))) continue;
    seen.add(m);
    out.push(m);
  }
  const rank = (m: string) => {
    const local = m.split("@")[0];
    const role = ROLE_PREF.includes(local) ? ROLE_PREF.indexOf(local) : ROLE_PREF.length;
    return (domain && m.endsWith(`@${domain}`) ? 0 : 100) + role;
  };
  return out.sort((a, b) => rank(a) - rank(b));
}

export function instagramProfile(url?: string | null): string {
  const m = url?.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (!m || IG_SKIP.has(m[1].toLowerCase())) return "";
  return `https://www.instagram.com/${m[1]}`;
}

export function findSocialLinks(html: string) {
  const fb = html.match(/https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|plugins|tr\?)[\w./-]+/)?.[0] ?? "";
  let ig = "";
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/[\w./-]+/g)) {
    ig = instagramProfile(m[0]);
    if (ig) break;
  }
  return { facebook: fb, instagram: ig };
}

/** true = domain receives mail, false = it cannot, null = could not check. */
export async function hasMx(domain: string): Promise<boolean | null> {
  if (!domain || /^[\d.:]+$/.test(domain)) return false;
  try {
    return (await resolveMx(domain)).length > 0;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? false : null;
  }
}

export type EmailFinding = {
  email: string | null;
  status: "FOUND" | "GUESSED" | "INVALID" | "NONE";
  source: string;
  facebook: string;
  instagram: string;
  pagesChecked: string[];
  mx: boolean | null;
};

/** Crawl home + contact/about pages for an email and social links. Falls back to a labelled info@ guess. */
export async function findEmail(website: string, opts: { guess: boolean }): Promise<EmailFinding> {
  const base = normalizeUrl(website).replace(/\/+$/, "");
  const domain = domainOf(base);
  const emails: string[] = [];
  const pagesChecked: string[] = [];
  let facebook = "";
  let instagram = "";
  for (const page of [base, ...CONTACT_PATHS.map((p) => `${base}/${p}`)]) {
    const res = await safeFetch(page);
    pagesChecked.push(`${page} -> ${res.ok ? "ok" : res.error ?? res.status}`);
    if (!res.html) continue;
    emails.push(...extractEmails(res.html, domain));
    const social = findSocialLinks(res.html);
    facebook ||= social.facebook;
    instagram ||= social.instagram;
    if (emails.length && facebook && instagram) break;
  }
  const own = emails.filter((e) => e.endsWith(`@${domain}`));
  const best = own[0] ?? emails[0];
  if (best) {
    const mx = await hasMx(best.split("@")[1]);
    return { email: best, status: mx === false ? "INVALID" : "FOUND", source: "website", facebook, instagram, pagesChecked, mx };
  }
  if (opts.guess && domain) {
    const mx = await hasMx(domain);
    if (mx) return { email: `info@${domain}`, status: "GUESSED", source: "guess (domain has MX records)", facebook, instagram, pagesChecked, mx };
    return { email: null, status: "NONE", source: "none", facebook, instagram, pagesChecked, mx };
  }
  return { email: null, status: "NONE", source: "none", facebook, instagram, pagesChecked, mx: null };
}
