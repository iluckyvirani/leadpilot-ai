import type { Lead } from "@/generated/prisma/client";
import { instagramProfile } from "./emails";

export type ScorePart = { rule: string; points: number };

/** Deterministic 0-100 lead score: how worth contacting this business is for a web / automation studio.
 *  Kept rule-based on purpose: the agent explains the score, it does not invent it. */
export function scoreLead(lead: Pick<Lead, "website" | "auditIssues" | "phone" | "phoneType" | "email" | "emailStatus" | "instagram" | "rating" | "reviews">) {
  const parts: ScorePart[] = [];
  if (!lead.website) parts.push({ rule: "No website (biggest opportunity)", points: 25 });
  else if (lead.auditIssues.length) parts.push({ rule: `${lead.auditIssues.length} website issue(s)`, points: Math.min(20, 5 * lead.auditIssues.length) });

  if (lead.phoneType === "MOBILE") parts.push({ rule: "Mobile number (WhatsApp-able)", points: 20 });
  else if (lead.phoneType === "UNKNOWN") parts.push({ rule: "Phone of unknown type", points: 12 });
  else if (lead.phone) parts.push({ rule: "Landline only", points: 5 });

  if (lead.email && lead.emailStatus !== "INVALID") parts.push({ rule: `Email ${lead.emailStatus.toLowerCase()}`, points: 10 });
  if (instagramProfile(lead.instagram)) parts.push({ rule: "Active Instagram profile", points: 10 });

  const rating = lead.rating ?? 0;
  const reviews = lead.reviews ?? 0;
  if (rating >= 4 && reviews >= 20) parts.push({ rule: "Well reviewed (4.0+, 20+ reviews)", points: 15 });
  else if (reviews >= 10) parts.push({ rule: "Some reviews (10+)", points: 7 });
  if (reviews >= 100) parts.push({ rule: "Established (100+ reviews)", points: 5 });

  const score = Math.min(100, parts.reduce((s, p) => s + p.points, 0));
  return { score, tier: tierOf(score), parts };
}

export function tierOf(score: number): "HOT" | "WARM" | "COLD" {
  return score >= 60 ? "HOT" : score >= 40 ? "WARM" : "COLD";
}
