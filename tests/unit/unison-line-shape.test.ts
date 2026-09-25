import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";

/**
 * The shape of a single line, as a reader meets it: it ends on do, and it
 * moves. Both were left to chance - any tone of the final I could end it, and
 * staying put was as likely as stepping - so an exercise meant to teach
 * do-re-mi was two-thirds repeated notes and "up to so" ended on so three
 * times in four. Rates, not rules, because both are preferences the walk may
 * have to give up; the thresholds sit well below what the generator measures
 * (ends on do 89-100%, repeats 40-50% with eighth pairs on one pitch).
 */

const quiet = () => {};
function line(opts: {
  degrees: number[];
  maxSkip: number;
  range: { min: number; max: number };
  rhythms: string[];
  measures?: number;
  key?: string;
}) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const result: any = createNewSr({
      bpm: 60, clef: "treble", selectedClef: "treble",
      timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 }, selectedTimeSignature: "4/4",
      measures: opts.measures ?? 8, maxSkip: opts.maxSkip, tempo: 60, range: opts.range,
      rhythms: selectableRhythms.filter((r) => opts.rhythms.includes(r.name)),
      selectedRhythms: opts.rhythms, scaleDegrees: opts.degrees,
      selectedSharpDegrees: [], selectedFlatDegrees: [], key: opts.key ?? "C",
      showSolfege: true, lyricSystem: "movable", rhythmOnly: false,
      showRhythmSyllables: true, syllableSystemId: "kodaly", moveOnEighthNotes: false,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any);
    return result[2].partsObject.parts.Unison.chordNoteObject.filter((n: any) => !n.rhythm?.rest);
  } finally {
    Object.assign(console, saved);
  }
}

function rates(make: () => any[], runs: number) {
  let endsOnDo = 0, repeats = 0, moves = 0;
  for (let i = 0; i < runs; i++) {
    const notes = make();
    if (notes[notes.length - 1].degree === 0) endsOnDo++;
    for (let k = 1; k < notes.length; k++) {
      moves++;
      if (notes[k].pitchValue === notes[k - 1].pitchValue) repeats++;
    }
  }
  return { endsOnDo: endsOnDo / runs, repeats: repeats / moves };
}

describe("unison line shape", () => {
  test("a line by step from do to so ends on do, and mostly moves", () => {
    const r = rates(
      () => line({ degrees: [1, 2, 3, 4, 5], maxSkip: 1, range: { min: 14, max: 18 }, rhythms: ["quarter", "half"] }),
      40
    );
    expect(r.endsOnDo).toBeGreaterThanOrEqual(0.7);
    // Quarters and halves only, so no eighth pairs repeating by design.
    expect(r.repeats).toBeLessThan(0.4);
  }, 30000);

  test("an ordinary line ends on do", () => {
    const r = rates(
      () => line({ degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4, range: { min: 14, max: 21 }, rhythms: ["quarter", "eighthEighth", "half"], key: "F" }),
      40
    );
    expect(r.endsOnDo).toBeGreaterThanOrEqual(0.9);
  }, 30000);

  test("with no chromatic notes selected, only diatonic notes are written", () => {
    // V/V used to steer the walk with its altered note unselected; the notes it
    // left were natural, but the line swung so-fa-so over it. Now it is not in
    // the pool at all - so no note carries an accidental.
    for (let i = 0; i < 20; i++) {
      const notes = line({ degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4, range: { min: 14, max: 21 }, rhythms: ["quarter"] });
      for (const n of notes) expect(n.name).not.toMatch(/[\^_=]/);
    }
  }, 30000);
});
