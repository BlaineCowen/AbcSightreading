import { describe, expect, test } from "bun:test";
import { emailKey, freeMonthDecision, isDisposable, NETWORK_LIMIT, type FreeMonthCheck } from "../../src/lib/free-month";

const fine: FreeMonthCheck = {
  signedIn: true, accountType: "standard", emailVerified: true, email: "teacher@school.org",
  hadPro: false, emailKeyUsed: false, browserUsed: false, networkClaims: 0, enabled: true,
};

describe("one person, however the address is dressed up", () => {
  test("Gmail ignores dots and +tags, and googlemail is gmail", () => {
    expect(emailKey("B.Lain.E+abc@Gmail.com")).toBe("blaine@gmail.com");
    expect(emailKey("blaine@googlemail.com")).toBe("blaine@gmail.com");
  });
  test("other providers: +tags dropped, dots kept", () => {
    expect(emailKey("j.smith+free@school.org")).toBe("j.smith@school.org");
    expect(emailKey("j.smith@school.org")).not.toBe(emailKey("jsmith@school.org"));
  });
  test("throwaway inboxes are recognised", () => {
    expect(isDisposable("x@mailinator.com")).toBe(true);
    expect(isDisposable("x@YOPMAIL.com")).toBe(true);
    expect(isDisposable("x@school.org")).toBe(false);
  });
});

describe("who gets the month", () => {
  test("a confirmed account that never had Pro", () => {
    expect(freeMonthDecision(fine).ok).toBe(true);
  });
  test("not when switched off, signed out, a student, or after any Pro", () => {
    for (const c of [{ enabled: false }, { signedIn: false }, { accountType: "student" }, { hadPro: true }]) {
      expect(freeMonthDecision({ ...fine, ...c }).ok).toBe(false);
    }
  });
  test("not before the email is confirmed, nor on a throwaway inbox", () => {
    expect(freeMonthDecision({ ...fine, emailVerified: false })).toMatchObject({ ok: false, reason: expect.stringContaining("Confirm") });
    expect(freeMonthDecision({ ...fine, email: "a@10minutemail.com" })).toMatchObject({ ok: false, reason: expect.stringContaining("permanent") });
  });
  test("not twice for one email key or one browser", () => {
    expect(freeMonthDecision({ ...fine, emailKeyUsed: true }).ok).toBe(false);
    expect(freeMonthDecision({ ...fine, browserUsed: true }).ok).toBe(false);
  });
  test("a few per network a month", () => {
    expect(freeMonthDecision({ ...fine, networkClaims: NETWORK_LIMIT - 1 }).ok).toBe(true);
    expect(freeMonthDecision({ ...fine, networkClaims: NETWORK_LIMIT }).ok).toBe(false);
  });
});
