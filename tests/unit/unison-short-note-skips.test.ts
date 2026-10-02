import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { timeSignatureFor } from "../../src/lib/meter";
import { shortSkipsFrom } from "../../src/lib/short-note-skips";
import { policyFor, DEFAULT_SKIP_SETTINGS } from "../../src/lib/skip-settings";
import { rhythms } from "../../src/resources/rhythms";

/**
 * Max 8th skip and Max 16th skip: they cap the moves between the short notes
 * INSIDE a figure (where "Move 8th Notes" off used to tie). The move onto a
 * figure's first note follows Max skip or the exact skips.
 */

function unison(meter: string, names: string[], over: Record<string, unknown> = {}) {
  const { log, warn, error } = console;
  Object.assign(console, { log() {}, warn() {}, error() {} });
  try {
    const [, , data] = createNewSr({
      bpm: 60, tempo: 60, clef: "treble", selectedClef: "treble", key: "F",
      timeSig: timeSignatureFor(meter), selectedTimeSignature: meter, measures: 8, maxSkip: 4,
      range: { min: 14, max: 24 }, scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
      selectedSharpDegrees: [], selectedFlatDegrees: [],
      rhythms: rhythms.filter((r) => names.includes(r.name)), selectedRhythms: names,
      showSolfege: true, lyricSystem: "movable", showRhythmSyllables: false,
      accidentalsFollowStep: false, allowTiesAcrossBarline: false,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
      ...over,
    } as any) as [string, unknown, any];
    return data.partsObject.parts.Unison.chordNoteObject as any[];
  } finally {
    Object.assign(console, { log, warn, error });
  }
}

type Move = { distance: number; length: number; inside: boolean };

/** Every move between sung notes, marked inside a figure (short note after a short note in one figure) or not. */
function moves(notes: any[]): Move[] {
  const out: Move[] = [];
  for (let i = 1; i < notes.length; i++) {
    const r = notes[i].rhythm ?? {};
    const p = notes[i - 1].rhythm ?? {};
    if (r.rest || p.rest) continue;
    const inside =
      r.isPatternNote === true && r.isPatternStart !== true && !r.isCadenceEnd &&
      r.totalValue <= 4 && p.totalValue <= 4;
    out.push({ distance: Math.abs(notes[i].pitchValue - notes[i - 1].pitchValue), length: r.totalValue, inside });
  }
  return out;
}

const RUNS = 12;

describe("Max 8th / 16th skip in the generator", () => {
  test("max8th=1: inside a figure eighths only step or repeat; figure starts still skip", () => {
    let outsideSkips = 0;
    let insideMoves = 0;
    for (let run = 0; run < RUNS; run++) {
      const m = moves(unison("4/4", ["quarter", "eighthEighth"], { maxEighthSkip: 1, maxSixteenthSkip: 1 }));
      for (const mv of m) {
        if (mv.inside) {
          expect(mv.distance).toBeLessThanOrEqual(1);
          if (mv.distance === 1) insideMoves++;
        } else if (mv.distance > 1) outsideSkips++;
      }
    }
    expect(insideMoves).toBeGreaterThan(0);
    expect(outsideSkips).toBeGreaterThan(0);
  });

  test("max8th=0: every eighth inside a figure repeats its predecessor", () => {
    let inside = 0;
    for (let run = 0; run < RUNS; run++) {
      for (const mv of moves(unison("4/4", ["quarter", "eighthEighth", "eighthQuarterEighth"], { maxEighthSkip: 0, maxSixteenthSkip: 3 }))) {
        if (mv.inside) {
          inside++;
          expect(mv.distance).toBe(0);
        }
      }
    }
    expect(inside).toBeGreaterThan(0);
  });

  test("max16th caps sixteenths independently of max8th", () => {
    let sixteenthMoves = 0;
    let eighthSkips = 0;
    for (let run = 0; run < RUNS; run++) {
      for (const mv of moves(unison("4/4", ["quarter", "fourSixteenths", "eighthEighth"], { maxEighthSkip: 4, maxSixteenthSkip: 1 }))) {
        if (!mv.inside) continue;
        if (mv.length <= 2) {
          expect(mv.distance).toBeLessThanOrEqual(1);
          if (mv.distance === 1) sixteenthMoves++;
        } else if (mv.distance > 1) eighthSkips++;
      }
    }
    expect(sixteenthMoves).toBeGreaterThan(0);
    expect(eighthSkips).toBeGreaterThan(0);
  });

  test("linked default: 8th skips follow Max skip", () => {
    const s = shortSkipsFrom({}, 3);
    expect(s.linked).toBe(true);
    let insideSkips = 0;
    for (let run = 0; run < RUNS; run++) {
      for (const mv of moves(unison("4/4", ["quarter", "eighthEighth"], { maxSkip: 3, maxEighthSkip: s.max8th, maxSixteenthSkip: s.max16th }))) {
        expect(mv.distance).toBeLessThanOrEqual(3);
        if (mv.inside && mv.distance > 1) insideSkips++;
      }
    }
    expect(insideSkips).toBeGreaterThan(0);
  });

  test("caps hold with exact skips on", () => {
    const policy = policyFor(4, { ...DEFAULT_SKIP_SETTINGS, exactOn: true, patterns: ["tonic-triad"] });
    let skips = 0;
    for (let run = 0; run < RUNS; run++) {
      for (const mv of moves(unison("4/4", ["quarter", "eighthEighth"], { maxSkip: policy, maxEighthSkip: 1, maxSixteenthSkip: 1 }))) {
        if (mv.inside) expect(mv.distance).toBeLessThanOrEqual(1);
        else if (mv.distance > 1) skips++;
      }
    }
    expect(skips).toBeGreaterThan(0);
  });

  test("compound meter: the caps apply to each eighth of three", () => {
    let inside = 0;
    for (let run = 0; run < RUNS; run++) {
      const notes = unison("6/8", ["threeEighths", "dotQuarter"], { maxEighthSkip: 1, maxSixteenthSkip: 1 });
      for (const mv of moves(notes)) {
        if (!mv.inside) continue;
        inside++;
        expect(mv.distance).toBeLessThanOrEqual(1);
      }
    }
    expect(inside).toBeGreaterThan(0);
  });

  test("compound meter: six sixteenths take the 16th cap", () => {
    let inside = 0;
    for (let run = 0; run < RUNS; run++) {
      const notes = unison("6/8", ["sixSixteenths", "dotQuarter"], { maxEighthSkip: 4, maxSixteenthSkip: 1 });
      for (const mv of moves(notes)) {
        if (!mv.inside) continue;
        inside++;
        expect(mv.length).toBe(2);
        expect(mv.distance).toBeLessThanOrEqual(1);
      }
    }
    expect(inside).toBeGreaterThan(0);
  });
});
