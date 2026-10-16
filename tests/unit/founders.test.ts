import { describe, expect, test } from "bun:test";
import { FOUNDERS_CLOSE_DEFAULT, endOfDay, founderDecision, founderEndsAt, foundersOpen } from "../../src/lib/founders";

const teacher = { open: true, signedIn: true, accountType: "standard", emailVerified: true, disposable: false, already: false };

describe("founderDecision", () => {
  test("a signed-in teacher with a confirmed email may join", () => {
    expect(founderDecision(teacher)).toEqual({ ok: true });
    expect(founderDecision({ ...teacher, accountType: "educator" })).toEqual({ ok: true });
  });
  test("one step in the way is named", () => {
    expect(founderDecision({ ...teacher, signedIn: false })).toMatchObject({ ok: false, step: "sign-in" });
    expect(founderDecision({ ...teacher, emailVerified: false })).toMatchObject({ ok: false, step: "confirm" });
  });
  test("never a student, never a throwaway address", () => {
    expect(founderDecision({ ...teacher, accountType: "student" }).ok).toBe(false);
    expect(founderDecision({ ...teacher, disposable: true }).ok).toBe(false);
  });
  test("a founder is told so, even after the offer closes", () => {
    expect(founderDecision({ ...teacher, already: true, open: false })).toMatchObject({ ok: false, step: "joined" });
    expect(founderDecision({ ...teacher, open: false })).toMatchObject({ ok: false });
  });
});

describe("dates", () => {
  test("Educator runs to the end of 31 May 2027 in Texas", () => {
    expect(founderEndsAt().toISOString()).toBe("2027-06-01T06:00:00.000Z");
  });
  test("the offer closes at the end of its closing day", () => {
    const end = endOfDay(FOUNDERS_CLOSE_DEFAULT);
    expect(foundersOpen(undefined, undefined, new Date(end.getTime() - 1))).toBe(true);
    expect(foundersOpen(undefined, undefined, end)).toBe(false);
    expect(foundersOpen("2026-12-01", undefined, new Date("2026-12-15T12:00:00Z"))).toBe(false);
    expect(foundersOpen(undefined, "0", new Date("2026-10-16T12:00:00Z"))).toBe(false);
    expect(foundersOpen("not a date", undefined, new Date("2026-10-16T12:00:00Z"))).toBe(true);
  });
});
