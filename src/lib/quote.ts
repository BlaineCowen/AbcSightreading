/**
 * School quotes: a teacher asks for the Educator plan (and seat packs) on a
 * quote their purchasing office can turn into a purchase order. Pure rules,
 * tested in tests/unit/quote.test.ts; src/pages/api/quotes/ applies them.
 */

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export type QuoteRequest = {
  school: string;
  district: string;
  contactName: string;
  contactEmail: string;
  address: { line1: string; line2: string; city: string; state: string; postalCode: string; country: "US" };
  packs: number;
  taxExempt: boolean;
};

/** How long a quote holds. Purchasing offices are slow; sixty days is the usual. */
export const QUOTE_DAYS = 60;
export const MAX_PACKS = 40;
const MAX_TEXT = 200;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkQuoteRequest(body: unknown): Checked<QuoteRequest> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Expected the school's details." };
  const b = body as Record<string, unknown>;
  const a = (typeof b.address === "object" && b.address !== null ? b.address : {}) as Record<string, unknown>;
  const value: QuoteRequest = {
    school: str(b.school),
    district: str(b.district),
    contactName: str(b.contactName),
    contactEmail: str(b.contactEmail).toLowerCase(),
    address: {
      line1: str(a.line1),
      line2: str(a.line2),
      city: str(a.city),
      state: str(a.state).toUpperCase(),
      postalCode: str(a.postalCode),
      country: "US",
    },
    packs: b.packs === undefined || b.packs === null || b.packs === "" ? 0 : Number(b.packs),
    taxExempt: b.taxExempt === true,
  };
  const texts = [value.school, value.district, value.contactName, value.address.line1, value.address.line2, value.address.city];
  if (texts.some((t) => t.length > MAX_TEXT)) return { ok: false, error: "One of those is too long." };
  if (!value.school) return { ok: false, error: "Enter the school's name." };
  if (!value.contactName) return { ok: false, error: "Enter who the quote goes to." };
  if (!EMAIL.test(value.contactEmail)) return { ok: false, error: "Enter the purchasing contact's email." };
  if (!value.address.line1 || !value.address.city) return { ok: false, error: "Enter the billing address." };
  if (!/^[A-Z]{2}$/.test(value.address.state)) return { ok: false, error: "Enter the state as two letters, like TX." };
  if (!/^\d{5}(-\d{4})?$/.test(value.address.postalCode)) return { ok: false, error: "Enter a ZIP code." };
  if (!Number.isInteger(value.packs) || value.packs < 0 || value.packs > MAX_PACKS) {
    return { ok: false, error: `Seat packs: between 0 and ${MAX_PACKS}.` };
  }
  return { ok: true, value };
}

/** The lines on the quote, by price lookup key: the Educator year, then any seat packs. */
export function quoteItems(packs: number) {
  const items: { price: string; quantity: number }[] = [{ price: "educator_yearly", quantity: 1 }];
  if (packs > 0) items.push({ price: "seat_pack_25", quantity: packs });
  return items;
}

export function checkPoNumber(v: unknown): Checked<string> {
  if (typeof v !== "string") return { ok: false, error: "Enter the purchase order number." };
  const po = v.trim();
  if (!po) return { ok: false, error: "Enter the purchase order number." };
  if (po.length > 40) return { ok: false, error: "That purchase order number is too long." };
  return { ok: true, value: po };
}
