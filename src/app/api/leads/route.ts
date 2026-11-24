import { z } from "zod";
import { db } from "@/lib/db";
import { classifyPhone } from "@/lib/leads/phone";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(60),
  country: z.string().trim().length(2).default("GB"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  instagram: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid lead" }, { status: 400 });
  const d = parsed.data;
  const phone = classifyPhone(d.phone || null, d.country.toUpperCase());
  const lead = await db.lead.create({
    data: {
      name: d.name, category: d.category.toLowerCase(), city: d.city, country: d.country.toUpperCase(),
      phone: phone.e164 ?? (d.phone || null), phoneType: phone.type,
      website: d.website || null, instagram: d.instagram || null, source: "manual",
    },
  });
  return Response.json({ id: lead.id }, { status: 201 });
}
