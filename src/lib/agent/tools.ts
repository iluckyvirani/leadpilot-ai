import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditSite } from "@/lib/leads/audit";
import { findEmail } from "@/lib/leads/emails";
import { canContact } from "@/lib/leads/guardrails";
import { classifyPhone } from "@/lib/leads/phone";
import { placesEnabled, searchPlaces } from "@/lib/leads/places";
import { scoreLead } from "@/lib/leads/score";
import { Prisma } from "@/generated/prisma/client";

// Each tool = a zod schema (validated before running), a description for Claude, and an executor.
// Schemas are converted to JSON Schema and sent with `strict: true`, so Claude's arguments match them.
// Every field is required; "optional" fields are nullable instead.

type ToolCtx = { runId: string };
type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolCtx) => Promise<unknown>;
  enabled?: () => boolean;
};
const tool = <S extends z.ZodType>(def: ToolDef<S>) => def;

const STATUS = z.enum(["NEW", "CONTACTED", "REPLIED", "INTERESTED", "CALL_BACK", "DEMO_BOOKED", "QUOTE_SENT",
  "WON", "LOST", "NOT_INTERESTED", "NO_RESPONSE", "BOUNCED", "DO_NOT_CONTACT"]);
const AGENT_SETTABLE = z.enum(["INTERESTED", "CALL_BACK", "DEMO_BOOKED", "NOT_INTERESTED", "NO_RESPONSE", "DO_NOT_CONTACT"]);
const CHANNEL = z.enum(["EMAIL", "WHATSAPP", "INSTAGRAM"]);
const LIMITS = { EMAIL: 1200, WHATSAPP: 600, INSTAGRAM: 400 } as const;

async function loadLead(id: string) {
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new Error(`No lead with id ${id}. Use search_leads to find valid ids.`);
  return lead;
}

const compact = (l: Prisma.LeadGetPayload<{ include: { _count: { select: { messages: true } } } }>) => ({
  id: l.id, name: l.name, category: l.category, city: l.city,
  website: l.website, audited: Boolean(l.auditedAt), websiteIssues: l.auditIssues.length,
  email: l.email, emailStatus: l.emailStatus, phoneType: l.phoneType, instagram: Boolean(l.instagram),
  rating: l.rating, reviews: l.reviews, score: l.score, tier: l.tier, status: l.status, messages: l._count.messages,
});

export const TOOLS = [
  tool({
    name: "search_leads",
    description:
      "List leads from the CRM database. Filter by status, tier, or by what work they still need: " +
      "'audit' (has a website that was never audited), 'email' (has a website but no email yet), " +
      "'score' (never scored), 'outreach' (scored, status NEW, no message drafted yet). Returns compact rows, best score first.",
    schema: z.strictObject({
      status: STATUS.nullable(),
      tier: z.enum(["HOT", "WARM", "COLD"]).nullable(),
      needs: z.enum(["audit", "email", "score", "outreach"]).nullable(),
      limit: z.number().int().nullable().describe("Max rows, default 20, max 50"),
    }),
    async run({ status, tier, needs, limit }) {
      const where: Prisma.LeadWhereInput = {};
      if (status) where.status = status;
      if (tier) where.tier = tier;
      if (needs === "audit") Object.assign(where, { website: { not: null }, auditedAt: null });
      if (needs === "email") Object.assign(where, { website: { not: null }, email: null });
      if (needs === "score") where.score = null;
      if (needs === "outreach") Object.assign(where, { score: { not: null }, status: "NEW", messages: { none: {} } });
      const rows = await db.lead.findMany({
        where,
        include: { _count: { select: { messages: true } } },
        orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
        take: Math.min(Math.max(limit ?? 20, 1), 50),
      });
      return { count: rows.length, leads: rows.map(compact) };
    },
  }),

  tool({
    name: "get_lead",
    description: "Full details for one lead: contact data, website audit issues, score breakdown, and its last 10 messages.",
    schema: z.strictObject({ lead_id: z.string() }),
    async run({ lead_id }) {
      const lead = await db.lead.findUnique({
        where: { id: lead_id },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 10 } },
      });
      if (!lead) throw new Error(`No lead with id ${lead_id}.`);
      return lead;
    },
  }),

  tool({
    name: "audit_website",
    description:
      "Open the lead's website and run quick sales checks: HTTPS, load time, mobile viewport, WhatsApp button, " +
      "enquiry form, tap-to-call, page title. Saves the issues on the lead. Use the issues to personalise outreach.",
    schema: z.strictObject({ lead_id: z.string() }),
    async run({ lead_id }) {
      const lead = await loadLead(lead_id);
      if (!lead.website) return { skipped: true, reason: "Lead has no website - that itself is the main opportunity." };
      const audit = await auditSite(lead.website);
      await db.lead.update({ where: { id: lead.id }, data: { auditIssues: audit.issues, auditedAt: new Date() } });
      return audit;
    },
  }),

  tool({
    name: "find_contact_email",
    description:
      "Look for a public contact email on the lead's website (home, /contact, /about), including obfuscated forms " +
      "like 'name [at] site [dot] com' and Cloudflare-protected addresses. Also picks up Facebook/Instagram links. " +
      "If nothing is found and the domain accepts mail, stores info@domain labelled GUESSED (not used for sending by default).",
    schema: z.strictObject({ lead_id: z.string() }),
    async run({ lead_id }) {
      const lead = await loadLead(lead_id);
      if (!lead.website) return { skipped: true, reason: "No website to search." };
      if (lead.email && lead.emailStatus === "FOUND") return { skipped: true, reason: `Already has ${lead.email}` };
      const f = await findEmail(lead.website, { guess: process.env.GUESS_EMAILS !== "false" });
      await db.lead.update({
        where: { id: lead.id },
        data: {
          ...(f.email ? { email: f.email, emailStatus: f.status } : {}),
          ...(f.facebook && !lead.facebook ? { facebook: f.facebook } : {}),
          ...(f.instagram && !lead.instagram ? { instagram: f.instagram } : {}),
        },
      });
      return f;
    },
  }),

  tool({
    name: "score_lead",
    description:
      "Compute and save the lead's 0-100 score and tier (HOT >= 60, WARM >= 40, COLD) with a rule-by-rule breakdown. " +
      "Run it after audit_website / find_contact_email so the score uses fresh data.",
    schema: z.strictObject({ lead_id: z.string() }),
    async run({ lead_id }) {
      const lead = await loadLead(lead_id);
      const s = scoreLead(lead);
      await db.lead.update({ where: { id: lead.id }, data: { score: s.score, tier: s.tier, scoreBreakdown: s.parts } });
      return s;
    },
  }),

  tool({
    name: "draft_outreach",
    description:
      "Save an outreach message as a DRAFT for a human to review. Nothing is sent: a person approves and sends it from the Approvals page. " +
      "Rules are enforced in code: blocked statuses, missing contact details, guessed emails and landlines are rejected. " +
      "Length limits: EMAIL 1200 chars, WHATSAPP 600, INSTAGRAM 400 (no links in a first Instagram DM). " +
      "subject is required for EMAIL and must be null otherwise. personalization_note says which real fact about the lead you used.",
    schema: z.strictObject({
      lead_id: z.string(),
      channel: CHANNEL,
      subject: z.string().nullable(),
      body: z.string(),
      personalization_note: z.string(),
    }),
    async run({ lead_id, channel, subject, body, personalization_note }, ctx) {
      const lead = await loadLead(lead_id);
      const gate = canContact(lead, channel);
      if (!gate.ok) throw new Error(`Not allowed: ${gate.reason}`);
      if (body.length > LIMITS[channel]) throw new Error(`Body is ${body.length} chars; limit for ${channel} is ${LIMITS[channel]}. Shorten it.`);
      if (channel === "EMAIL" && !subject) throw new Error("EMAIL needs a subject.");
      if (channel === "INSTAGRAM" && /https?:\/\//.test(body)) throw new Error("No links in an Instagram DM.");
      const pending = await db.message.findFirst({ where: { leadId: lead.id, channel, status: "DRAFT" } });
      if (pending) throw new Error(`A ${channel} draft already waits for approval (message ${pending.id}).`);
      const msg = await db.message.create({
        data: {
          leadId: lead.id, channel, direction: "OUTBOUND", status: "DRAFT", author: "AGENT",
          subject: channel === "EMAIL" ? subject : null, body, rationale: personalization_note, runId: ctx.runId,
        },
      });
      return { saved: true, messageId: msg.id, status: "DRAFT - waiting for human approval" };
    },
  }),

  tool({
    name: "update_lead_status",
    description:
      "Move a lead in the pipeline. Allowed: INTERESTED, CALL_BACK, DEMO_BOOKED, NOT_INTERESTED, NO_RESPONSE, DO_NOT_CONTACT. " +
      "A lead marked DO_NOT_CONTACT can never be moved out of it. Always give a short reason.",
    schema: z.strictObject({ lead_id: z.string(), status: AGENT_SETTABLE, reason: z.string() }),
    async run({ lead_id, status, reason }) {
      const lead = await loadLead(lead_id);
      if (lead.status === "DO_NOT_CONTACT") throw new Error("Lead opted out (DO_NOT_CONTACT). Status is locked.");
      const stopFollowUps = status !== "CALL_BACK";
      await db.lead.update({
        where: { id: lead.id },
        data: {
          status,
          notes: [lead.notes, `[agent] ${status}: ${reason}`].filter(Boolean).join("\n"),
          ...(stopFollowUps ? { nextFollowUpAt: null } : {}),
        },
      });
      return { updated: true, from: lead.status, to: status };
    },
  }),

  tool({
    name: "find_new_businesses",
    description:
      "Discover new local businesses with the Google Places API and add them as NEW leads (duplicates skipped). " +
      "query example: 'dentist in Agra'. region is a 2-letter country code like IN, GB, US.",
    enabled: placesEnabled,
    schema: z.strictObject({ query: z.string(), region: z.string(), limit: z.number().int().nullable() }),
    async run({ query, region, limit }) {
      const places = await searchPlaces(query, region.toUpperCase(), Math.min(Math.max(limit ?? 10, 1), 20));
      const [category, city = ""] = query.split(/\s+in\s+/i);
      let added = 0;
      for (const p of places) {
        if (await db.lead.findUnique({ where: { placeId: p.placeId } })) continue;
        const phone = classifyPhone(p.phone, region.toUpperCase());
        await db.lead.create({
          data: {
            placeId: p.placeId, name: p.name, category: category.trim(), city: city.trim(), country: region.toUpperCase(),
            address: p.address, phone: phone.e164 ?? p.phone, phoneType: phone.type, website: p.website,
            rating: p.rating, reviews: p.reviews, source: "google_places",
          },
        });
        added++;
      }
      return { found: places.length, added };
    },
  }),
] as const;

export function activeTools() {
  return TOOLS.filter((t) => !("enabled" in t) || !t.enabled || t.enabled());
}

export function toolDefinitions(): Anthropic.Beta.BetaTool[] {
  return activeTools().map((t) => {
    const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      description: t.description,
      strict: true,
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    };
  });
}

/** Validate Claude's arguments with zod, run the tool, and always return something Claude can read. */
export async function executeTool(name: string, input: unknown, ctx: ToolCtx) {
  const def = activeTools().find((t) => t.name === name);
  if (!def) return { isError: true, output: { error: `Unknown tool ${name}` } };
  const parsed = def.schema.safeParse(input);
  if (!parsed.success) return { isError: true, output: { error: "Invalid arguments", issues: parsed.error.issues } };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = await (def.run as (i: any, c: ToolCtx) => Promise<unknown>)(parsed.data, ctx);
    return { isError: false, output };
  } catch (e) {
    return { isError: true, output: { error: (e as Error).message } };
  }
}
