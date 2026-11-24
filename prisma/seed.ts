// Demo data. All businesses are fictional. Phone numbers use Ofcom's ranges reserved for drama
// (07700 900xxx mobiles, 020 7946 0xxx London landlines), so they never reach a real person.
// Websites point at example.com / example.org / example.net (IANA's reserved demo sites) so the
// live audit tool has something real to open.
import "dotenv/config";
import { db } from "../src/lib/db";
import { classifyPhone } from "../src/lib/leads/phone";

const DAY = 86_400_000;

// 07700 900xxx is reserved for fiction, so phone libraries call it "invalid". Treat it as a mobile here.
function demoPhone(raw: string) {
  if (raw.startsWith("07700 900")) return { e164: `+44${raw.replace(/\D/g, "").slice(1)}`, type: "MOBILE" as const };
  return classifyPhone(raw, "GB");
}

const leads = [
  { name: "Bright Smile Dental Studio", category: "dentist", city: "London", phone: "07700 900123", website: null, rating: 4.7, reviews: 182, instagram: "https://www.instagram.com/brightsmile_demo" },
  { name: "Northside Physio & Sports Clinic", category: "physiotherapist", city: "Manchester", phone: "07700 900456", website: "https://example.com", rating: 4.5, reviews: 64, instagram: null },
  { name: "Iron Republic Gym", category: "gym", city: "London", phone: "020 7946 0018", website: "http://example.org", rating: 4.2, reviews: 230, instagram: "https://www.instagram.com/ironrepublic_demo" },
  { name: "Maple & Thyme Kitchen", category: "restaurant", city: "Leeds", phone: "07700 900789", website: null, rating: 4.6, reviews: 95, instagram: "https://www.instagram.com/maplethyme_demo" },
  { name: "Lumen Wedding Photography", category: "photographer", city: "Bristol", phone: "07700 900321", website: "https://example.net", rating: 4.9, reviews: 41, instagram: "https://www.instagram.com/lumenweddings_demo" },
  { name: "QuickFix Plumbing Co.", category: "plumber", city: "Birmingham", phone: "020 7946 0442", website: null, rating: 3.9, reviews: 12, instagram: null },
  { name: "Serenity Day Spa", category: "spa", city: "London", phone: "07700 900654", website: "https://example.com", rating: 4.4, reviews: 158, instagram: "https://www.instagram.com/serenityspa_demo" },
  { name: "Little Acorns Nursery", category: "nursery", city: "Manchester", phone: "07700 900987", website: null, rating: 4.8, reviews: 27, instagram: null },
  { name: "Harbour View Lettings", category: "letting agent", city: "Liverpool", phone: "020 7946 0731", website: "http://example.org", rating: 4.1, reviews: 73, instagram: null },
  { name: "Petal & Stem Florist", category: "florist", city: "London", phone: "07700 900111", website: null, rating: 4.3, reviews: 8, instagram: "https://www.instagram.com/petalstem_demo" },
];

async function main() {
  await db.agentStep.deleteMany();
  await db.agentRun.deleteMany();
  await db.message.deleteMany();
  await db.lead.deleteMany();

  for (const l of leads) {
    const phone = demoPhone(l.phone);
    await db.lead.create({
      data: { ...l, country: "GB", phone: phone.e164 ?? l.phone, phoneType: phone.type, source: "seed" },
    });
  }

  // One lead already contacted 4 days ago with no reply -> the follow-up job has work to do.
  const contacted = await db.lead.create({
    data: {
      name: "Copperleaf Coffee House", category: "cafe", city: "London", country: "GB",
      phone: demoPhone("07700 900222").e164, phoneType: "MOBILE", website: "https://example.net",
      email: "hello@copperleaf.example", emailStatus: "FOUND", rating: 4.6, reviews: 312,
      auditIssues: ["No WhatsApp button", "No enquiry or booking form"], auditedAt: new Date(Date.now() - 5 * DAY),
      score: 70, tier: "HOT", status: "CONTACTED", followUpStage: 0,
      lastContactedAt: new Date(Date.now() - 4 * DAY), nextFollowUpAt: new Date(Date.now() - DAY), source: "seed",
    },
  });
  await db.message.create({
    data: {
      leadId: contacted.id, channel: "EMAIL", direction: "OUTBOUND", status: "SENT", author: "AGENT",
      subject: "A small idea for Copperleaf",
      body: "Hi Copperleaf team,\n\n312 reviews at 4.6 is brilliant. I noticed your site has no WhatsApp button or booking form, so people who want to reserve a table have to call.\n\nI build quick fixes for exactly that. Would a free mock-up for Copperleaf be useful?\n\nBest,\nAlex",
      rationale: "Used review count and two audit issues", createdAt: new Date(Date.now() - 4 * DAY),
    },
  });

  console.log(`Seeded ${leads.length + 1} fictional leads.`);
}

main().finally(() => db.$disconnect());
