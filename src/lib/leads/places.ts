// Optional lead discovery through the official Google Places API (Text Search, New).
// Enabled only when GOOGLE_PLACES_API_KEY is set.

const URL_ = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.internationalPhoneNumber",
  "places.rating", "places.userRatingCount", "places.websiteUri", "places.businessStatus",
].join(",");

export type Place = {
  placeId: string; name: string; address: string | null; phone: string | null;
  rating: number | null; reviews: number | null; website: string | null;
};

type ApiPlace = {
  id: string; displayName?: { text?: string }; formattedAddress?: string; internationalPhoneNumber?: string;
  rating?: number; userRatingCount?: number; websiteUri?: string; businessStatus?: string;
};

export const placesEnabled = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

export async function searchPlaces(query: string, region: string, limit: number): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({ textQuery: query, regionCode: region, pageSize: Math.min(limit, 20) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { places?: ApiPlace[] };
  return (data.places ?? [])
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
    .slice(0, limit)
    .map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "Unknown",
      address: p.formattedAddress ?? null,
      phone: p.internationalPhoneNumber ?? null,
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? null,
      website: p.websiteUri ?? null,
    }));
}
