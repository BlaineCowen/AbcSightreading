import { describe, expect, test } from "bun:test";
import { checkRedemption, commissionCents, normalizeCode, checkNewAccessCode, checkNewAffiliate } from "../../src/lib/codes";
import { planFrom } from "../../src/lib/plan";

/**
 * Access codes and affiliate codes. Written before the code.
 *
 * An access code gives a plan free for a while - the beta testers' Educator
 * year - with no card and no Stripe. An affiliate code is a Stripe promotion
 * code: its audience gets a discount at checkout, and the advertiser earns a
 * share of what that first year paid.
 */

const now = new Date("2026-09-28T12:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe("codes as people type them", () => {
  test("case, spaces and dashes do not matter", () => {
    expect(normalizeCode(" beta-2026 ")).toBe("BETA2026");
    expect(normalizeCode("Choir Queen")).toBe("CHOIRQUEEN");
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode(42)).toBe("");
  });
});

describe("redeeming an access code", () => {
  const code = { plan: "educator", days: 365, maxUses: 25, uses: 3, expiresAt: later(60) };

  test("gives its plan for its days, from today", () => {
    expect(checkRedemption({ code, accountType: "standard", alreadyRedeemed: false, now })).toEqual({
      ok: true,
      value: { plan: "educator", expiresAt: later(365) },
    });
  });

  test("refuses a code that is used up, past its date, or already used by this account", () => {
    expect(checkRedemption({ code: { ...code, uses: 25 }, accountType: "standard", alreadyRedeemed: false, now }).ok).toBe(false);
    expect(checkRedemption({ code: { ...code, expiresAt: later(-1) }, accountType: "standard", alreadyRedeemed: false, now }).ok).toBe(false);
    expect(checkRedemption({ code, accountType: "standard", alreadyRedeemed: true, now }).ok).toBe(false);
    expect(checkRedemption({ code: null, accountType: "standard", alreadyRedeemed: false, now }).ok).toBe(false);
  });

  test("a code with no limit or end date works for anyone", () => {
    expect(checkRedemption({ code: { ...code, maxUses: null, expiresAt: null }, accountType: "educator", alreadyRedeemed: false, now }).ok).toBe(true);
  });

  test("never on a student account - their class gives them what they need", () => {
    expect(checkRedemption({ code, accountType: "student", alreadyRedeemed: false, now }).ok).toBe(false);
  });
});

describe("a granted plan", () => {
  test("counts like a subscription until it ends", () => {
    expect(planFrom({ subscriptions: [], grants: [{ plan: "educator", expiresAt: later(10) }], now })).toBe("educator");
    expect(planFrom({ subscriptions: [], grants: [{ plan: "pro", expiresAt: later(10) }], now })).toBe("pro");
    expect(planFrom({ subscriptions: [], grants: [{ plan: "educator", expiresAt: later(-1) }], now })).toBe("free");
  });

  test("the better of a grant and a subscription wins", () => {
    const subs = [{ plan: "pro", status: "active", periodEnd: later(100) }];
    expect(planFrom({ subscriptions: subs, grants: [{ plan: "educator", expiresAt: later(10) }], now })).toBe("educator");
  });
});

describe("making codes", () => {
  test("an access code: a plan, days, and optional limits", () => {
    expect(checkNewAccessCode({ code: "beta-2026", plan: "educator", days: 365, maxUses: 25, note: "Beta testers" })).toEqual({
      ok: true,
      value: { code: "BETA2026", plan: "educator", days: 365, maxUses: 25, expiresAt: null, note: "Beta testers" },
    });
    expect(checkNewAccessCode({ code: "X", plan: "educator", days: 365 }).ok).toBe(false);
    expect(checkNewAccessCode({ code: "BETA", plan: "gold", days: 365 }).ok).toBe(false);
    expect(checkNewAccessCode({ code: "BETA", plan: "pro", days: 0 }).ok).toBe(false);
    expect(checkNewAccessCode({ code: "BETA", plan: "pro", days: 800 }).ok).toBe(false);
  });

  test("an affiliate code: who, the discount, and their cut", () => {
    expect(checkNewAffiliate({ name: "Jodi Coke", code: "choirqueen", percentOff: 10, commissionPercent: 20 })).toEqual({
      ok: true,
      value: { name: "Jodi Coke", code: "CHOIRQUEEN", percentOff: 10, commissionPercent: 20 },
    });
    expect(checkNewAffiliate({ name: "", code: "X1", percentOff: 10, commissionPercent: 20 }).ok).toBe(false);
    expect(checkNewAffiliate({ name: "A", code: "ABCD", percentOff: 0, commissionPercent: 20 }).ok).toBe(false);
    expect(checkNewAffiliate({ name: "A", code: "ABCD", percentOff: 60, commissionPercent: 20 }).ok).toBe(false);
    expect(checkNewAffiliate({ name: "A", code: "ABCD", percentOff: 10, commissionPercent: 60 }).ok).toBe(false);
  });
});

describe("an affiliate's cut", () => {
  test("a share of what was paid, before tax, in cents", () => {
    // Educator at 10% off: $89.10 paid, $5.74 of it Texas tax (prices include tax).
    expect(commissionCents({ amountTotal: 8910, amountTax: 574, percent: 20 })).toBe(1667);
    // A tax-exempt school: nothing to take out.
    expect(commissionCents({ amountTotal: 8910, amountTax: 0, percent: 20 })).toBe(1782);
    // Pro at 10% off: $17.99.
    expect(commissionCents({ amountTotal: 1799, amountTax: 0, percent: 20 })).toBe(360);
    expect(commissionCents({ amountTotal: 0, amountTax: 0, percent: 20 })).toBe(0);
  });
});
