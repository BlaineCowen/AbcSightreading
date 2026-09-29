/**
 * An advertiser's link. /?ref=JODI10 on any page (middleware.ts) keeps the
 * code in a cookie for REF_DAYS, and a checkout by that visitor later has the
 * discount already applied (auth.ts), so their followers never type it. The
 * sale is credited to the advertiser the same way as a typed code: from the
 * finished checkout's discounts (recordAffiliateSale). Tests:
 * tests/unit/referral.test.ts.
 */
import { normalizeCode } from "./codes";

export const REF_COOKIE = "sr_ref";
export const REF_DAYS = 60;

const plausible = (code: string) => (code.length >= 3 && code.length <= 24 ? code : null);

export function refFromUrl(url: URL): string | null {
  return plausible(normalizeCode(url.searchParams.get("ref") ?? ""));
}

export function refCookie(code: string, secure: boolean): string {
  return [
    `${REF_COOKIE}=${code}`,
    "Path=/",
    `Max-Age=${REF_DAYS * 86400}`,
    "SameSite=Lax",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function refFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== REF_COOKIE) continue;
    const raw = rest.join("=");
    const code = normalizeCode(raw);
    return code === raw ? plausible(code) : null;
  }
  return null;
}

/** The discount part of a Stripe checkout: a promotion code applied, or the box to type one. */
export function checkoutDiscount(promotionId: string | null):
  | { discounts: { promotion_code: string }[] }
  | { allow_promotion_codes: true } {
  return promotionId ? { discounts: [{ promotion_code: promotionId }] } : { allow_promotion_codes: true };
}
