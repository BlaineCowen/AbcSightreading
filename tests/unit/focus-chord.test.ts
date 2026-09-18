import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { ClefType, type Chord } from "../../src/lib/types";

/**
 * Drilling one chromatic chord: "exercises that work on V/V".
 *
 * Measured at UIL 4, eight bars, the focused chord appears in about 97% of
 * exercises and around twice in each. Asserted looser than that so a
 * randomised generator cannot make it flaky: it must be there in most, and no
 * other chromatic chord may be there in any.
 */

const PARTS = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2, 24], currentRange: [9, 18] },
  },
};

const quiet = <T>(fn: () => T): T => {
  const { log, warn, error } = console;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try { return fn(); } finally { Object.assign(console, { log, warn, error }); }
};

function progressions(overrides: Record<string, unknown>, runs = 12): Chord[][] {
  const out: Chord[][] = [];
  for (let i = 0; i < runs; i++) {
    try {
      out.push(quiet(() => generateChoralExercise({
        key: "C",
        timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
        partsObject: PARTS,
        measures: 8,
        maxSkip: 4,
        bpm: 72,
        selectedRhythms: allRhythms.filter((r) => ["whole", "half", "quarter"].includes(r.name)),
        chords: fullChordSet,
        accidentalsByStep: true,
        nctProbability: 0.2,
        chromaticFrequency: 1,
        ...overrides,
      } as any)).chordProgression);
    } catch { /* a failed draw is not what this is about */ }
  }
  return out;
}

const chromatic = (c: Chord) => c.sharpScaleDegree != null || c.flatScaleDegree != null;

describe("focusing on a chromatic chord", () => {
  test("V/V turns up in most exercises, and nothing else chromatic does", () => {
    const runs = progressions({ focusChord: "5/5" });
    expect(runs.length).toBeGreaterThan(8);
    const withIt = runs.filter((p) => p.some((c) => c.chordFamily === "5/5"));
    expect(withIt.length).toBeGreaterThanOrEqual(Math.ceil(runs.length * 0.75));
    for (const p of runs) {
      expect(p.filter((c) => chromatic(c) && c.chordFamily !== "5/5")).toEqual([]);
    }
  }, 60000);

  test("it is used even when the allowlist left it out", () => {
    // The UI's chord toggles and the focus are separate controls; picking a
    // focus should not also require ticking the chord.
    const diatonic = fullChordSet.filter((c) => !chromatic(c) && c.mode !== "minor").map((c) => c.name);
    const runs = progressions({ focusChord: "5/6", allowedChordNames: diatonic });
    expect(runs.some((p) => p.some((c) => c.chordFamily === "5/6"))).toBe(true);
  }, 60000);

  test("a minor key ignores it rather than failing", () => {
    const runs = progressions({ key: "Am", focusChord: "5/5" }, 6);
    expect(runs.length).toBeGreaterThan(0);
    for (const p of runs) expect(p.some((c) => c.chordFamily === "5/5")).toBe(false);
  }, 60000);
});
