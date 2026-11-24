import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/** E.164 number + whether it is a mobile (WhatsApp-able), landline or unknown. */
export function classifyPhone(raw: string | null | undefined, region = "IN") {
  if (!raw) return { e164: null, type: "NONE" as const };
  const p = parsePhoneNumberFromString(raw, region as CountryCode);
  if (!p || !p.isValid()) return { e164: null, type: "UNKNOWN" as const };
  const t = p.getType();
  const type = t === "MOBILE" ? "MOBILE" : t === "FIXED_LINE" ? "LANDLINE" : "UNKNOWN";
  return { e164: p.number as string, type: type as "MOBILE" | "LANDLINE" | "UNKNOWN" };
}

export function waLink(e164: string, text: string) {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
