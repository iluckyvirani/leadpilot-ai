// Everything the agent knows about "who is reaching out". Set these in .env - nothing is hard-coded.
export const sender = {
  name: process.env.SENDER_NAME || "Alex",
  company: process.env.SENDER_COMPANY || "Your Studio",
  offer:
    process.env.SENDER_OFFER ||
    "fast websites, WhatsApp click-to-chat and lead-capture automation for local businesses",
  portfolioUrl: process.env.PORTFOLIO_URL || "https://example.com",
  bookingUrl: process.env.BOOKING_URL || "",
};

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const FOLLOW_UP_DAYS = [3, 7]; // follow-up #1 on day 3, #2 on day 7, then "No Response"
