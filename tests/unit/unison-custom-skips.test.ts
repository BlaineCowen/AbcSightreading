import { describe, expect, test } from "bun:test";
import { createNewSr, generationFailedMessage } from "../../src/lib/generateUnison";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";
import type { SkipMove, SkipPolicy } from "../../src/lib/skip-policy";

/**
 * Custom skips in the generator (skip-policy.ts). The line sings only the
 * skips listed, lands each on an allowed note value, and a rest does not hide
 * a skip: moves are measured between the notes actually sung, the way a singer
 * meets them. Rates over many runs, as for every generator test here.
 */
const quiet = () => {};
const SOLFA = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const QUARTER = 8;
const DO_MI_SOL_UP: SkipPolicy = {
  kind: "custom",
  moves: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }],
  landOn: [QUARTER],
};

function line(
  policy: SkipPolicy,
  o: { degrees: number[]; range: { min: number; max: number }; rhythms: string[]; key?: string; sharps?: number[]; moveOnEighthNotes?: boolean }
): any[] {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const result: any = createNewSr({
      bpm: 72, tempo: 72, clef: "treble", selectedClef: "treble",
      timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
      measures: 8, maxSkip: policy, range: o.range,
      rhythms: selectableRhythms.filter((r) => o.rhythms.includes(r.name)), selectedRhythms: o.rhythms,
      scaleDegrees: o.degrees, selectedSharpDegrees: o.sharps ?? [], selectedFlatDegrees: [],
      key: o.key ?? "C", showSolfege: true, lyricSystem: "movable", rhythmOnly: false,
      showRhythmSyllables: true, syllableSystemId: "kodaly",
      moveOnEighthNotes: o.moveOnEighthNotes ?? false, accidentalsFollowStep: true,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any);
    return result[2].partsObject.parts.Unison.chordNoteObject;
  } finally {
    Object.assign(console, saved);
  }
}

/** Each sung note with the sung note before it - rests skipped over. */
function sungMoves(notes: any[]) {
  const sung = notes.filter((n) => !n.rhythm?.rest);
  return sung.slice(1).map((b, k) => ({ a: sung[k], b, rise: b.pitchValue - sung[k].pitchValue }));
}
const nameOf = (m: { a: any; b: any; rise: number }) =>
  `${SOLFA[m.a.degree]}${m.rise > 0 ? "↑" : "↓"}${SOLFA[m.b.degree]}`;

describe("custom skips in the generator", () => {
  test("Do-Mi-Sol ↑ on quarters: only do↑mi and mi↑sol, each onto a quarter, rests or not", () => {
    const bad: string[] = [];
    let skips = 0;
    for (let run = 0; run < 40; run++) {
      const notes = line(DO_MI_SOL_UP, {
        degrees: [1, 2, 3, 4, 5, 6], range: { min: 14, max: 19 },
        rhythms: ["quarter", "half", "quarterRest", "eighthEighth"], moveOnEighthNotes: true,
      });
      for (const m of sungMoves(notes)) {
        if (Math.abs(m.rise) <= 1) continue;
        skips++;
        const name = nameOf(m);
        if (!["do↑mi", "mi↑sol"].includes(name)) bad.push(name);
        else if (m.b.noteLength !== QUARTER) bad.push(`${name} onto ${m.b.noteLength}`);
      }
    }
    expect(bad).toEqual([]);
    expect(skips).toBeGreaterThan(0); // not vacuous
  });

  test("a rest held for the line keeps its own length, so every bar adds up", () => {
    // The rest repeats the note before it for the skip rule only. It used to
    // take that note's length too: a quarter rest after a half sounded as a
    // half, one after an eighth as an eighth rest, and every note after it
    // slid off the beat.
    const bad: string[] = [];
    let rests = 0;
    for (let run = 0; run < 40; run++) {
      const notes = line(DO_MI_SOL_UP, {
        degrees: [1, 2, 3, 4, 5, 6], range: { min: 14, max: 19 },
        rhythms: ["quarter", "half", "quarterRest", "eighthEighth"], moveOnEighthNotes: true,
      });
      for (const n of notes) {
        if (n.rhythm?.rest) rests++;
        if (n.noteLength !== n.rhythm?.totalValue) bad.push(`${n.rhythm?.name} written ${n.noteLength}`);
      }
      const total = notes.reduce((sum, n) => sum + n.noteLength, 0);
      if (total !== 8 * 32) bad.push(`${total}/32 in 8 bars`);
    }
    expect(bad).toEqual([]);
    expect(rests).toBeGreaterThan(0); // not vacuous
  });

  test("landOn quarters only: no skip lands on a note that is not a quarter, in another key", () => {
    const policy: SkipPolicy = {
      kind: "custom",
      moves: [
        { from: 1, to: 3, dir: "both" }, { from: 3, to: 5, dir: "both" }, { from: 1, to: 5, dir: "both" },
      ],
      landOn: [QUARTER],
    };
    const bad: string[] = [];
    let skips = 0;
    for (let run = 0; run < 20; run++) {
      const notes = line(policy, {
        key: "D", degrees: [1, 2, 3, 4, 5, 6, 7], range: { min: 15, max: 22 },
        rhythms: ["quarter", "half", "eighthEighth"], moveOnEighthNotes: true,
      });
      for (const m of sungMoves(notes)) {
        if (Math.abs(m.rise) <= 1) continue;
        skips++;
        if (m.b.noteLength !== QUARTER) bad.push(`${nameOf(m)} onto ${m.b.noteLength}`);
      }
    }
    expect(bad).toEqual([]);
    expect(skips).toBeGreaterThan(0);
  });

  test("an empty list sings by step only, across rests too", () => {
    const bad: string[] = [];
    for (let run = 0; run < 40; run++) {
      const notes = line({ kind: "custom", moves: [] }, {
        degrees: [1, 2, 3, 4, 5], range: { min: 14, max: 18 }, rhythms: ["quarter", "half", "quarterRest"],
      });
      for (const m of sungMoves(notes)) if (Math.abs(m.rise) > 1) bad.push(nameOf(m));
    }
    expect(bad).toEqual([]);
  });

  test("a chromatic note is reached and left by step, even where a listed skip lands on its letter", () => {
    // do↑fa and re↑fa are listed, so without the chromatic rule a skip could land on fi.
    const policy: SkipPolicy = {
      kind: "custom",
      moves: [
        { from: 1, to: 4, dir: "up" }, { from: 2, to: 4, dir: "up" },
        { from: 4, to: 1, dir: "down" }, { from: 4, to: 2, dir: "down" },
      ],
    };
    const bad: string[] = [];
    let altered = 0;
    for (let run = 0; run < 30; run++) {
      const notes = line(policy, {
        key: "G", degrees: [1, 2, 3, 4, 5, 6, 7], sharps: [4], range: { min: 18, max: 25 }, rhythms: ["quarter", "half"],
      });
      const sung = notes.filter((n) => !n.rhythm?.rest);
      sung.forEach((n, k) => {
        if (!/[_^=]/.test(n.name)) return;
        altered++;
        if (k > 0 && Math.abs(n.pitchValue - sung[k - 1].pitchValue) > 1) bad.push(`into ${n.name}`);
        if (k + 1 < sung.length && Math.abs(sung[k + 1].pitchValue - n.pitchValue) > 1) bad.push(`out of ${n.name}`);
      });
    }
    expect(bad).toEqual([]);
    expect(altered).toBeGreaterThan(0);
  });

  /** How many different pitches the line sings: a line frozen on one note sings one. */
  const distinctPitches = (notes: any[]) =>
    new Set(notes.filter((n) => !n.rhythm?.rest).map((n) => n.pitchValue)).size;

  test("no dead-end start: low sol with only sol↓do below the range is never sung (Task 6R)", () => {
    // C4-C5 in F: C4 is sol. Do-Mi-Sol ↑, Sol-Do ↓ and re ↗ sol; from low
    // sol the only skip is down to do, below the range, and la is not selected.
    const policy: SkipPolicy = {
      kind: "custom",
      moves: [
        { from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" },
        { from: 5, to: 1, dir: "down" }, { from: 2, to: 5, dir: "up" },
      ],
      landOn: [QUARTER],
    };
    const frozen: number[] = [];
    let lowSol = 0;
    for (let run = 0; run < 20; run++) {
      const notes = line(policy, {
        key: "F", degrees: [1, 2, 3, 5], range: { min: 14, max: 21 },
        rhythms: ["quarter", "half", "quarterRest", "eighthEighth"],
      });
      if (distinctPitches(notes) < 3) frozen.push(run);
      lowSol += notes.filter((n) => !n.rhythm?.rest && n.pitchValue === 14).length;
    }
    expect(frozen).toEqual([]);
    expect(lowSol).toBe(0);
  });

  test("NYSSMA Level II-like (Do-Mi-Sol ↑ on quarters, do-la) in C, F and G: no frozen lines, no failures", () => {
    const policy: SkipPolicy = {
      kind: "custom",
      moves: [{ from: 1, to: 3, dir: "up" }, { from: 3, to: 5, dir: "up" }],
      landOn: [QUARTER],
    };
    const ranges: Record<string, { min: number; max: number }> = {
      C: { min: 14, max: 19 }, F: { min: 17, max: 22 }, G: { min: 18, max: 23 },
    };
    const problems: string[] = [];
    for (const key of ["C", "F", "G"]) {
      for (let run = 0; run < 20; run++) {
        try {
          const notes = line(policy, {
            key, degrees: [1, 2, 3, 4, 5, 6], range: ranges[key],
            rhythms: ["quarter", "half", "quarterRest", "eighthEighth"],
          });
          if (distinctPitches(notes) < 3) problems.push(`${key} run ${run}: frozen`);
        } catch (e) {
          problems.push(`${key} run ${run}: ${(e as Error).message}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("a list with no way out of the range fails with a plain message, not a frozen line", () => {
    // Steps only, and the range holds do alone among the selected notes.
    expect(() =>
      line({ kind: "custom", moves: [] }, { degrees: [1, 3, 5], range: { min: 14, max: 15 }, rhythms: ["quarter", "half"] })
    ).toThrow(/get stuck on a note it cannot leave/);
  });

  // The final review's probes: the listed skips connect do, mi and sol, but
  // no selected rhythm has a note a skip may land on, so not one skip can be
  // sung. The line used to sit on one pitch for the whole exercise.
  const TONIC_TRIAD_BOTH: SkipMove[] = [
    { from: 1, to: 3, dir: "both" }, { from: 3, to: 5, dir: "both" }, { from: 1, to: 5, dir: "both" },
  ];
  test("Tonic triad ↕ landing on halves, quarters only: refused plainly, not 32 × one pitch", () => {
    expect(() =>
      line({ kind: "custom", moves: TONIC_TRIAD_BOTH, landOn: [16] }, { degrees: [1, 3, 5], range: { min: 14, max: 21 }, rhythms: ["quarter"] })
    ).toThrow(/No selected rhythm has a note a skip may land on/);
  });
  test("Tonic triad ↕ landing on quarters, eighth pairs only: refused plainly, not 64 × one pitch", () => {
    expect(() =>
      line({ kind: "custom", moves: TONIC_TRIAD_BOTH, landOn: [8] }, { degrees: [1, 3, 5], range: { min: 14, max: 21 }, rhythms: ["eighthEighth"] })
    ).toThrow(/No selected rhythm has a note a skip may land on/);
  });
  test("no landing note but the notes join by step: the line steps, with more than one pitch", () => {
    for (let run = 0; run < 10; run++) {
      const notes = line({ kind: "custom", moves: TONIC_TRIAD_BOTH, landOn: [16] }, { degrees: [1, 2, 3, 4, 5], range: { min: 14, max: 21 }, rhythms: ["quarter"] });
      const moves = sungMoves(notes);
      expect(moves.every((m) => Math.abs(m.rise) <= 1)).toBe(true);
      expect(new Set(notes.map((n) => n.pitchValue)).size).toBeGreaterThan(1);
    }
  });

  test("with no do, mi or sol selected, custom mode gives the tonic message, as Max skip does", () => {
    expect(() =>
      line({ kind: "custom", moves: [] }, { degrees: [2, 4, 6], range: { min: 14, max: 21 }, rhythms: ["quarter", "half"] })
    ).toThrow(/No tonic notes found/);
  });

  test("the give-up message names Max Skip only when Max skip is in force", () => {
    expect(generationFailedMessage({ kind: "max", maxSkip: 4 })).toMatch(/increasing the Max Skip/);
    const exact = generationFailedMessage({ kind: "custom", moves: [] });
    expect(exact).not.toMatch(/Max Skip/);
    expect(exact).toMatch(/adding a skip or more scale degrees/);
  });
});
