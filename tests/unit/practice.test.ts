import { describe, expect, test } from "bun:test";
import {
  BEAT_SECONDS,
  IDLE_MS,
  RETENTION_DAYS,
  assignmentPage,
  assignmentProgress,
  checkAssignmentRequest,
  creditSeconds,
  isActive,
  practiceDay,
} from "../../src/lib/practice";

/**
 * Practice time and assignments (student accounts, stages 2 and 3). Written
 * before the code.
 *
 * A student's practice is counted in minutes they were really at it: the page
 * in front of them, and something happening - a click, an exercise, playback,
 * the metronome or the tuner - in the last five minutes. Sight-singing is done
 * standing back from the screen, so a still mouse is not idleness.
 *
 * The page reports every 30 seconds; the server decides the credit, so a
 * tampered page, or three open tabs, cannot count faster than the clock.
 */

const t0 = new Date("2026-09-28T15:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe("what counts as practising", () => {
  test("visible and recently touched", () => {
    expect(isActive({ visible: true, lastActivityAt: at(0), busy: false, now: at(60) })).toBe(true);
  });

  test("five minutes of stillness pauses it - unless something is sounding", () => {
    expect(IDLE_MS).toBe(5 * 60_000);
    const still = { visible: true, lastActivityAt: at(0), now: at(5 * 60 + 1) };
    expect(isActive({ ...still, busy: false })).toBe(false);
    // Playback, the metronome or the tuner listening: they are singing.
    expect(isActive({ ...still, busy: true })).toBe(true);
  });

  test("a hidden tab never counts", () => {
    expect(isActive({ visible: false, lastActivityAt: at(0), busy: true, now: at(1) })).toBe(false);
  });
});

describe("the server's credit for a report", () => {
  test("what the page claims, up to one report's worth", () => {
    expect(BEAT_SECONDS).toBe(30);
    expect(creditSeconds({ claimed: 30, lastCreditedAt: null, now: at(0) })).toBe(30);
    expect(creditSeconds({ claimed: 12, lastCreditedAt: null, now: at(0) })).toBe(12);
    // A tampered page asking for an hour gets one report's worth.
    expect(creditSeconds({ claimed: 3600, lastCreditedAt: null, now: at(0) })).toBe(30);
    expect(creditSeconds({ claimed: -5, lastCreditedAt: null, now: at(0) })).toBe(0);
    expect(creditSeconds({ claimed: Number.NaN, lastCreditedAt: null, now: at(0) })).toBe(0);
  });

  test("never more than the clock has moved since the last credit", () => {
    // Two tabs reporting 15 seconds apart: 15 seconds of practice, not 30.
    expect(creditSeconds({ claimed: 30, lastCreditedAt: at(0), now: at(15) })).toBe(15);
    expect(creditSeconds({ claimed: 30, lastCreditedAt: at(0), now: at(0) })).toBe(0);
    // After a pause, the claim is the limit again.
    expect(creditSeconds({ claimed: 30, lastCreditedAt: at(0), now: at(3600) })).toBe(30);
  });

  test("three tabs for ten minutes count ten minutes", () => {
    let last: Date | null = null;
    let total = 0;
    // Each tab reports every 30 s, offset by 10 s from the others.
    const reports = [];
    for (let s = 30; s <= 600; s += 30) for (const offset of [0, 10, 20]) reports.push(s + offset);
    for (const s of reports.sort((a, b) => a - b)) {
      const credit = creditSeconds({ claimed: 30, lastCreditedAt: last, now: at(s) });
      total += credit;
      if (credit > 0) last = at(s);
    }
    expect(total).toBeLessThanOrEqual(620);
    expect(total).toBeGreaterThanOrEqual(590);
  });
});

describe("which day practice belongs to", () => {
  test("the student's own date, if it is plausible", () => {
    // 8pm in Texas is already tomorrow in UTC.
    expect(practiceDay("2026-09-28", new Date("2026-09-29T01:00:00Z"))).toBe("2026-09-28");
    expect(practiceDay("2026-09-28", t0)).toBe("2026-09-28");
  });

  test("otherwise the server's", () => {
    expect(practiceDay("2026-01-01", t0)).toBe("2026-09-28");
    expect(practiceDay("yesterday", t0)).toBe("2026-09-28");
    expect(practiceDay(undefined, t0)).toBe("2026-09-28");
  });
});

describe("an assignment", () => {
  test("a preset and minutes, with an optional due date and note", () => {
    const r = checkAssignmentRequest({ presetKey: "uil:UIL 3", minutes: 15, dueAt: "2026-10-02", note: " Sing on solfège " }, t0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.presetKey).toBe("uil:UIL 3");
      expect(r.value.minutes).toBe(15);
      expect(r.value.note).toBe("Sing on solfège");
      // Due at the end of that day.
      expect(r.value.dueAt?.toISOString().slice(0, 10)).toBe("2026-10-02");
    }
    const bare = checkAssignmentRequest({ presetKey: "saved:abc123", minutes: 10 }, t0);
    expect(bare.ok && bare.value.dueAt).toBe(null);
  });

  test("refuses what cannot be assigned", () => {
    expect(checkAssignmentRequest({ presetKey: "step:no-such-step", minutes: 10 }, t0).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "uil:UIL 3", minutes: 0 }, t0).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "uil:UIL 3", minutes: 121 }, t0).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "uil:UIL 3", minutes: 7.5 }, t0).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "uil:UIL 3", minutes: 10, dueAt: "not a date" }, t0).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "uil:UIL 3", minutes: 10, dueAt: "2026-09-01" }, t0).ok).toBe(false);
    expect(checkAssignmentRequest({ presetKey: "uil:UIL 3", minutes: 10, note: "x".repeat(301) }, t0).ok).toBe(false);
    expect(checkAssignmentRequest(null, t0).ok).toBe(false);
  });

  test("opens on the page its preset belongs to", () => {
    expect(assignmentPage("uil:UIL 2")).toBe("choral");
    expect(assignmentPage("saved:x", "abcsr_presets")).toBe("choral");
    expect(assignmentPage("saved:x", "abcsr_unison_presets")).toBe("unison");
  });

  test("progress: not started, under way, done", () => {
    expect(assignmentProgress(0, 15)).toEqual({ status: "not-started", percent: 0 });
    expect(assignmentProgress(450, 15)).toEqual({ status: "in-progress", percent: 50 });
    expect(assignmentProgress(900, 15)).toEqual({ status: "done", percent: 100 });
    expect(assignmentProgress(5000, 15)).toEqual({ status: "done", percent: 100 });
  });

  test("the log is kept for a school year and a bit, then deleted", () => {
    expect(RETENTION_DAYS).toBe(395);
  });
});
