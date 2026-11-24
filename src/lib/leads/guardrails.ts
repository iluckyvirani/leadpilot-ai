import type { Lead } from "@/generated/prisma/client";

// Hard rules enforced in code, not in the prompt. The agent can't talk its way past these.

export const BLOCKED_STATUSES = ["NOT_INTERESTED", "BOUNCED", "DO_NOT_CONTACT", "WON", "LOST", "NO_RESPONSE"] as const;

export type Channel = "EMAIL" | "WHATSAPP" | "INSTAGRAM";

export function canContact(lead: Pick<Lead, "status" | "email" | "emailStatus" | "phone" | "phoneType" | "instagram">, channel: Channel) {
  if ((BLOCKED_STATUSES as readonly string[]).includes(lead.status)) {
    return { ok: false, reason: `Lead status is ${lead.status}; outreach is blocked.` };
  }
  if (channel === "EMAIL") {
    if (!lead.email || lead.emailStatus === "INVALID") return { ok: false, reason: "No usable email address." };
    if (lead.emailStatus === "GUESSED" && process.env.ALLOW_GUESSED_EMAILS !== "true") {
      return { ok: false, reason: "Email is a guess (info@domain). Guessed emails are not used unless ALLOW_GUESSED_EMAILS=true." };
    }
  }
  if (channel === "WHATSAPP") {
    if (!lead.phone) return { ok: false, reason: "No phone number." };
    if (lead.phoneType === "LANDLINE") return { ok: false, reason: "Landline number; WhatsApp is not possible." };
  }
  if (channel === "INSTAGRAM" && !lead.instagram) return { ok: false, reason: "No Instagram profile." };
  return { ok: true, reason: "" };
}

// Opt-out is detected with plain rules BEFORE any model call: a "stop" must never depend on an LLM.
const OPT_OUT = /\b(stop|unsubscribe|remove me|opt[ -]?out|do not (contact|message|email)|don'?t (contact|message|email)|spam)\b/i;

export function isOptOut(text: string): boolean {
  return OPT_OUT.test(text);
}
