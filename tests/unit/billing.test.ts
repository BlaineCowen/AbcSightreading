import { describe, expect, test } from "bun:test";
import {
  GENERATION_LIMITS,
  anonymousUsage,
  generationAllowance,
  monthKey,
  planFrom,
  recordAnonymousGeneration,
} from "../../src/lib/plan";
import { seatsTotal } from "../../src/lib/seats";

/**
 * Plans and limits (billing, stage 4). Written before the code.
 *
 * Without an account: 10 exercises a month, counted in the browser - a nudge
 * to make an account, which is free. A free account: 50 a month, counted on
 * the server. Pro ($19.99/yr) and Educator ($99/yr): unlimited, and a student
 * in a paying teacher's class gets what the class has.
 */

const now = new Date("2026-09-28T12:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe("which plan an account is on", () => {
  test("no subscription: free", () => {
    expect(planFrom({ subscriptions: [], now })).toBe("free");
  });

  test("an active Pro or Educator subscription", () => {
    expect(planFrom({ subscriptions: [{ plan: "pro", status: "active", periodEnd: later(200) }], now })).toBe("pro");
    expect(planFrom({ subscriptions: [{ plan: "educator", status: "trialing", periodEnd: later(10) }], now })).toBe("educator");
  });

  test("Educator wins over Pro, as after an upgrade", () => {
    const subs = [
      { plan: "pro", status: "active", periodEnd: later(100) },
      { plan: "educator", status: "active", periodEnd: later(300) },
    ];
    expect(planFrom({ subscriptions: subs, now })).toBe("educator");
  });

  test("a lapsed or unpaid subscription is not a plan", () => {
    for (const status of ["canceled", "incomplete", "incomplete_expired", "unpaid"]) {
      expect(planFrom({ subscriptions: [{ plan: "pro", status, periodEnd: later(100) }], now })).toBe("free");
    }
    // Active in name but past its paid period.
    expect(planFrom({ subscriptions: [{ plan: "pro", status: "active", periodEnd: later(-2) }], now })).toBe("free");
  });

  test("a failed renewal keeps the plan while Stripe retries", () => {
    expect(planFrom({ subscriptions: [{ plan: "pro", status: "past_due", periodEnd: later(-1) }], now })).toBe("pro");
  });

  test("a student in a paying teacher's class, and a complimentary account", () => {
    expect(planFrom({ subscriptions: [], studentOfEducator: true, now })).toBe("pro");
    expect(planFrom({ subscriptions: [], complimentary: true, now })).toBe("educator");
  });
});

describe("generation limits", () => {
  test("10 without an account, 50 with one, unlimited on a plan", () => {
    expect(GENERATION_LIMITS).toEqual({ anonymous: 10, free: 50 });
    expect(generationAllowance("anonymous", 9)).toEqual({ limit: 10, used: 9, remaining: 1, allowed: true });
    expect(generationAllowance("anonymous", 10)).toMatchObject({ remaining: 0, allowed: false });
    expect(generationAllowance("free", 49).allowed).toBe(true);
    expect(generationAllowance("free", 50).allowed).toBe(false);
    for (const plan of ["pro", "educator"] as const) {
      expect(generationAllowance(plan, 10_000)).toEqual({ limit: null, used: 10_000, remaining: null, allowed: true });
    }
  });

  test("the count is per calendar month", () => {
    expect(monthKey(new Date("2026-09-30T23:59:00Z"))).toBe("2026-09");
    expect(monthKey(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10");
  });
});

describe("the count without an account", () => {
  const storage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  test("counts up, and starts again in a new month", () => {
    const s = storage();
    expect(anonymousUsage(s, now)).toBe(0);
    recordAnonymousGeneration(s, now);
    recordAnonymousGeneration(s, now);
    expect(anonymousUsage(s, now)).toBe(2);
    expect(anonymousUsage(s, new Date("2026-10-02T00:00:00Z"))).toBe(0);
  });

  test("a browser that will not store anything is not stopped by it", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(anonymousUsage(broken, now)).toBe(0);
    expect(() => recordAnonymousGeneration(broken, now)).not.toThrow();
  });
});

describe("seats with packs", () => {
  test("the plan's 100, plus each pack still in its year", () => {
    const grants = [
      { seats: 25, expiresAt: later(100) },
      { seats: 25, expiresAt: later(-1) }, // last school year's
    ];
    expect(seatsTotal(100, grants, now)).toBe(125);
    expect(seatsTotal(100, [], now)).toBe(100);
  });
});
