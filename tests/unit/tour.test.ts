import { describe, expect, test } from "bun:test";
import {
  FIRST_STEP_HREF,
  TOUR_STEPS,
  isQuickStart,
  markTourSeen,
  markWelcomed,
  shouldWelcome,
  tourPageFor,
  tourSeen,
} from "../../src/lib/tour";
import { ladder, nextStepAfter, stepHref } from "../../src/lib/ladder";

/** A stand-in for localStorage. */
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("the walkthrough", () => {
  test("each page's steps point at different controls, and say something", () => {
    for (const steps of Object.values(TOUR_STEPS)) {
      expect(new Set(steps.map((s) => s.anchor)).size).toBe(steps.length);
      for (const s of steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.body.length).toBeGreaterThan(0);
        // Blaine's rule for copy: no mid-sentence dashes.
        expect(s.body).not.toMatch(/ [-–—] |—/);
      }
    }
  });

  test("the practice pages have a tour, other pages none", () => {
    expect(tourPageFor("/sightreading")).toBe("unison");
    expect(tourPageFor("/choral-sightreading/")).toBe("choral");
    expect(tourPageFor("/piano-sightreading")).toBe("piano");
    expect(tourPageFor("/")).toBeNull();
    expect(tourPageFor("/tuner")).toBeNull();
  });

  test("seen is remembered per page", () => {
    const store = memory();
    expect(tourSeen("unison", store)).toBe(false);
    markTourSeen("unison", store);
    expect(tourSeen("unison", store)).toBe(true);
    expect(tourSeen("choral", store)).toBe(false);
  });

  test("storage that throws (a private window) is never fatal", () => {
    const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(tourSeen("unison", broken)).toBe(false);
    expect(() => markTourSeen("unison", broken)).not.toThrow();
    expect(shouldWelcome({ page: "unison", search: "", hash: "", student: false, store: broken })).toBe(true);
  });
});

describe("the welcome card", () => {
  const base = { page: "unison" as const, search: "", hash: "", student: false };

  test("greets a bare first visit", () => {
    expect(shouldWelcome({ ...base, store: memory() })).toBe(true);
  });

  test("not when the address says where they are going, nor a student, nor twice", () => {
    expect(shouldWelcome({ ...base, search: "?step=sbs-01-rhythm", store: memory() })).toBe(false);
    expect(shouldWelcome({ ...base, search: "?assignment=abc", store: memory() })).toBe(false);
    expect(shouldWelcome({ ...base, hash: "#x=1", store: memory() })).toBe(false);
    expect(shouldWelcome({ ...base, student: true, store: memory() })).toBe(false);
    expect(shouldWelcome({ ...base, page: null, store: memory() })).toBe(false);
    const answered = memory();
    markWelcomed(answered);
    expect(shouldWelcome({ ...base, store: answered })).toBe(false);
    const toured = memory();
    markTourSeen("choral", toured);
    expect(shouldWelcome({ ...base, page: "choral", store: toured })).toBe(false);
  });
});

describe("Quick start", () => {
  test("opens step 1 and asks for it to be written", () => {
    expect(FIRST_STEP_HREF.startsWith(stepHref(ladder[0]))).toBe(true);
    expect(isQuickStart(new URL(FIRST_STEP_HREF, "https://x").search)).toBe(true);
    expect(isQuickStart("?step=sbs-01-rhythm")).toBe(false);
  });

  test("the step after each step is the next in the ladder, across pages too", () => {
    expect(nextStepAfter(ladder[0].id)).toBe(ladder[1]);
    expect(nextStepAfter(ladder[ladder.length - 1].id)).toBeNull();
    expect(nextStepAfter("no-such-step")).toBeNull();
    const cross = ladder.findIndex((s, i) => i > 0 && s.page !== ladder[i - 1].page);
    expect(cross).toBeGreaterThan(0);
    expect(nextStepAfter(ladder[cross - 1].id)?.page).not.toBe(ladder[cross - 1].page);
  });
});
