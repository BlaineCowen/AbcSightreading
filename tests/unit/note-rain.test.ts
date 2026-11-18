import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  BOTTOM_LINE, MIN_FALL_MS, RAIN_LEVELS, START_SPEED, STORM_MS, abcOf, checkRainSetup, clefRange, fallMs, lettersOf, maxDrops, noteLabel, pickStep, poolOf, spawnMs, speedAt,
} from "../../src/lib/games/note-rain";

describe("levels", () => {
  test("every level's notes are inside what its clef offers, low to high", () => {
    for (const l of RAIN_LEVELS) for (const clef of ["treble", "bass"] as const) {
      const r = new Set(clefRange(clef));
      expect(l.steps[clef].every((s) => r.has(s))).toBe(true);
      expect([...l.steps[clef]].sort((a, b) => a - b)).toEqual(l.steps[clef]);
    }
  });
  test("the easy levels are three and five notes; the staff's lines and spaces are what they say", () => {
    expect(RAIN_LEVELS[0]!.steps.treble.map(noteLabel)).toEqual(["G4", "A4", "B4"]);
    expect(RAIN_LEVELS[1]!.steps.treble.map(noteLabel)).toEqual(["C4", "D4", "E4", "F4", "G4"]);
    expect(RAIN_LEVELS[2]!.steps.treble.map(noteLabel)).toEqual(["E4", "G4", "B4", "D5", "F5"]);
    expect(RAIN_LEVELS[3]!.steps.bass.map(noteLabel)).toEqual(["A2", "C3", "E3", "G3"]);
    expect(noteLabel(BOTTOM_LINE.bass)).toBe("G2");
  });
  test("the answer buttons are the letters in play", () => {
    expect(lettersOf(checkRainSetup({ level: 1 }))).toEqual(["G", "A", "B"]);
    expect(lettersOf(checkRainSetup({ level: 5 })).length).toBe(7);
  });
  test("Customize keeps only notes the clef offers, and needs two letters", () => {
    expect(poolOf(checkRainSetup({ level: 0, notes: [30, 32, 99, 32] }))).toEqual([30, 32]);
    expect(checkRainSetup({ level: 0, notes: [30, 37] }).level).toBe(1); // E4 and E5: one letter
    expect(checkRainSetup(null)).toEqual({ clef: "treble", level: 1, speed: "medium", round: "storm", names: "letters" });
  });
  test("ABC for abcjs", () => {
    expect([28, 30, 35, 36, 42, 21, 14].map(abcOf)).toEqual(["C", "E", "c", "d", "c'", "C,", "C,,"]);
  });
});

describe("speed", () => {
  // Property (Blaine: "in endless mode, keep speeding up until the player runs out of strikes"):
  // later is always faster, with no top: notes come closer together for ever.
  test("the rain never slows and keeps thickening", () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.values(START_SPEED)), fc.integer({ min: 0, max: 30 * 60_000 }), fc.integer({ min: 1, max: 600_000 }), (start, t, dt) => {
        const a = speedAt(t, start), b = speedAt(t + dt, start);
        expect(b).toBeGreaterThan(a);
        expect(spawnMs(b)).toBeLessThan(spawnMs(a));
        expect(fallMs(b)).toBeLessThanOrEqual(fallMs(a));
        expect(maxDrops(b)).toBeGreaterThanOrEqual(maxDrops(a));
        expect(fallMs(b)).toBeGreaterThanOrEqual(MIN_FALL_MS);
      }),
    );
  });
  test("the hardest storm ends far faster than learnmusic.fun's (about 1.8 s a note at the end)", () => {
    const end = speedAt(STORM_MS, START_SPEED.extreme);
    expect(fallMs(speedAt(0, START_SPEED.extreme))).toBeLessThan(3000);
    expect(fallMs(end)).toBeLessThan(1100);
    // Medium too ends quicker than learnmusic's Hard did.
    expect(fallMs(speedAt(STORM_MS, START_SPEED.medium))).toBeLessThan(2200);
  });
});

describe("pickStep", () => {
  test("never the same note twice running", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 20, max: 40 }), { minLength: 2, maxLength: 9 }), fc.double({ min: 0, max: 0.9999, noNaN: true }), (pool, r) => {
        const last = pool[0]!;
        expect(pickStep(pool, {}, last, () => r)).not.toBe(last);
      }),
    );
  });
});
