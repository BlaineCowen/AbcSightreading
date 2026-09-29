import { describe, expect, test } from "bun:test";
import {
  REF_COOKIE,
  REF_DAYS,
  checkoutDiscount,
  refCookie,
  refFromCookieHeader,
  refFromUrl,
} from "../../src/lib/referral";

/**
 * An advertiser's link: /?ref=JODI10 (any page) remembers the code, and a
 * checkout by that visitor later has the discount already applied. Written
 * before the code.
 */

describe("reading the code from a link", () => {
  test("normalised the way codes are typed in", () => {
    expect(refFromUrl(new URL("https://x.test/?ref=jodi10"))).toBe("JODI10");
    expect(refFromUrl(new URL("https://x.test/pricing?ref=Jodi-10&x=1"))).toBe("JODI10");
  });

  test("nothing, or nothing plausible, is no code", () => {
    expect(refFromUrl(new URL("https://x.test/"))).toBeNull();
    expect(refFromUrl(new URL("https://x.test/?ref="))).toBeNull();
    expect(refFromUrl(new URL("https://x.test/?ref=ab"))).toBeNull(); // too short to be one of ours
    expect(refFromUrl(new URL(`https://x.test/?ref=${"A".repeat(40)}`))).toBeNull();
  });
});

describe("the cookie", () => {
  test("kept for the whole window, site-wide, not readable by scripts", () => {
    const c = refCookie("JODI10", true);
    expect(c).toContain(`${REF_COOKIE}=JODI10`);
    expect(c).toContain("Path=/");
    expect(c).toContain(`Max-Age=${REF_DAYS * 86400}`);
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(refCookie("JODI10", false)).not.toContain("Secure"); // http://localhost
  });

  test("read back from a request's Cookie header", () => {
    expect(refFromCookieHeader(`a=1; ${REF_COOKIE}=JODI10; b=2`)).toBe("JODI10");
    expect(refFromCookieHeader("a=1")).toBeNull();
    expect(refFromCookieHeader(null)).toBeNull();
    expect(refFromCookieHeader(`${REF_COOKIE}=<script>`)).toBeNull();
  });
});

describe("what checkout is asked for", () => {
  test("an advertiser's code is applied; the box to type one is then not offered", () => {
    // Stripe refuses a session with both.
    expect(checkoutDiscount("promo_123")).toEqual({ discounts: [{ promotion_code: "promo_123" }] });
  });

  test("without one, the buyer may type a code", () => {
    expect(checkoutDiscount(null)).toEqual({ allow_promotion_codes: true });
  });
});
