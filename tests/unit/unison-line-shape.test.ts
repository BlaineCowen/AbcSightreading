import { describe, expect, test } from "bun:test";
import { createNewSr } from "../../src/lib/generateUnison";
import { selectableRhythms } from "../../src/lib/selectable-rhythms";

/**
 * The shape of a single line, as a reader meets it: it starts and ends on do,
 * mi or so, it moves, it travels the range it was given, and it sings every
 * degree selected. Staying put was once as likely as stepping, and the line
 * sat where I and V keep it - so a do-re-mi exercise was two-thirds repeated
 * notes, and a wide range had both its ends sung in 30% of exercises. Then it
 * was made to end on do and steered there, and with 1 2 3 5 6 selected so and
 * la were a tenth of the line each. Rates, not rules, because each is
 * a preference the walk may have to give up; the thresholds sit well below
 * what the generator measures.
 */

const quiet = () => {};
function line(opts: {
  degrees: number[];
  maxSkip: number;
  range: { min: number; max: number };
  rhythms: string[];
  measures?: number;
  key?: string;
  moveOnEighthNotes?: boolean;
}) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const result: any = createNewSr({
      bpm: 60, clef: "treble", selectedClef: "treble",
      timeSig: { name: "4/4", tsPerMeasure: 32, beatUnits: 8 }, selectedTimeSignature: "4/4",
      measures: opts.measures ?? 8, maxSkip: opts.maxSkip, tempo: 60, range: opts.range,
      rhythms: selectableRhythms.filter((r) => opts.rhythms.includes(r.name)),
      selectedRhythms: opts.rhythms, scaleDegrees: opts.degrees,
      selectedSharpDegrees: [], selectedFlatDegrees: [], key: opts.key ?? "C",
      showSolfege: true, lyricSystem: "movable", rhythmOnly: false,
      showRhythmSyllables: true, syllableSystemId: "kodaly", moveOnEighthNotes: opts.moveOnEighthNotes ?? false,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    } as any);
    return result[2].partsObject.parts.Unison.chordNoteObject.filter((n: any) => !n.rhythm?.rest);
  } finally {
    Object.assign(console, saved);
  }
}

const TONIC_TRIAD = [0, 2, 4];

function rates(make: () => any[], runs: number) {
  let endsHome = 0, startsHome = 0, endsOnDo = 0, repeats = 0, moves = 0, notesSung = 0;
  const byDegree: Record<number, number> = {};
  for (let i = 0; i < runs; i++) {
    const notes = make();
    const last = notes[notes.length - 1].degree;
    if (TONIC_TRIAD.includes(last)) endsHome++;
    if (last === 0) endsOnDo++;
    if (TONIC_TRIAD.includes(notes[0].degree)) startsHome++;
    for (const n of notes) byDegree[n.degree] = (byDegree[n.degree] ?? 0) + 1;
    notesSung += notes.length;
    for (let k = 1; k < notes.length; k++) {
      moves++;
      if (notes[k].pitchValue === notes[k - 1].pitchValue) repeats++;
    }
  }
  const share = (degree: number) => (byDegree[degree] ?? 0) / notesSung;
  return {
    endsHome: endsHome / runs,
    startsHome: startsHome / runs,
    endsOnDo: endsOnDo / runs,
    repeats: repeats / moves,
    share,
  };
}

describe("unison line shape", () => {
  test("a line by step from do to so ends on the tonic triad, and mostly moves", () => {
    const r = rates(
      () => line({ degrees: [1, 2, 3, 4, 5], maxSkip: 1, range: { min: 14, max: 18 }, rhythms: ["quarter", "half"] }),
      40
    );
    expect(r.endsHome).toBeGreaterThanOrEqual(0.9);
    // Quarters and halves only, so no eighth pairs repeating by design.
    expect(r.repeats).toBeLessThan(0.4);
  }, 30000);

  test("an ordinary line starts and ends on do, mi or so, and not always do", () => {
    const r = rates(
      () => line({ degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4, range: { min: 14, max: 21 }, rhythms: ["quarter", "eighthEighth", "half"], key: "F" }),
      40
    );
    expect(r.startsHome).toBe(1);
    expect(r.endsHome).toBeGreaterThanOrEqual(0.9);
    // Measured about 30-50%: do is one home among three.
    expect(r.endsOnDo).toBeLessThan(0.8);
  }, 30000);

  test("with Move eighths off, a ti-ti holds one pitch and the line does not", () => {
    // Any two eighths in a row were sung on one pitch, so ti-ti pairs back to
    // back chained: 2.5 runs of three or more notes on one pitch an exercise,
    // one of them 18 long. Now the tie stays inside the pair, and a note that
    // opens a pair or follows one moves: measured 0.00 runs, longest 2.
    let runs = 0, longest = 0, pairsHeld = 0, pairs = 0;
    for (let i = 0; i < 40; i++) {
      const notes = line({ degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4, range: { min: 14, max: 21 }, rhythms: ["quarter", "eighthEighth", "half"], key: "F" });
      let run = 1;
      for (let k = 1; k < notes.length; k++) {
        if (notes[k].pitchValue === notes[k - 1].pitchValue) {
          run++;
          if (run === 3) runs++;
          longest = Math.max(longest, run);
        } else run = 1;
        const pairEnd = notes[k].rhythm?.isPatternNote && !notes[k].rhythm?.isPatternStart && notes[k].rhythm?.totalValue <= 4;
        if (pairEnd) {
          pairs++;
          if (notes[k].pitchValue === notes[k - 1].pitchValue) pairsHeld++;
        }
      }
    }
    expect(pairs).toBeGreaterThan(40);
    expect(pairsHeld).toBe(pairs);
    expect(runs / 40).toBeLessThan(0.25);
    expect(longest).toBeLessThanOrEqual(4);
  }, 30000);

  test("every degree selected gets its share of the line", () => {
    // 1 2 3 5 6 in C and F, a third: la was 10-14% and do 30%, since the line
    // was steered to do at the end and a range with two dos offered it twice.
    // Measured now at 12-19% la and 20-27% do; an even share is 20%.
    for (const key of ["C", "F"]) {
      const r = rates(
        () => line({ degrees: [1, 2, 3, 5, 6], maxSkip: 2, range: { min: 14, max: 21 }, rhythms: ["quarter", "eighthEighth", "half"], key }),
        60
      );
      for (const degree of [0, 1, 2, 4, 5]) expect(r.share(degree)).toBeGreaterThan(0.08);
      expect(r.share(0)).toBeLessThan(0.29);
    }
  }, 30000);

  test("a line uses the range it was given", () => {
    // Chosen evenly, the line sat where I and V keep it: an octave's ends both
    // came up 88% of the time, a wider range's 30%. Measured now at 100% and
    // 80% (8 bars); the thresholds leave room for chance.
    const bothEnds = (range: { min: number; max: number }, runs: number, measures = 8) => {
      let hit = 0;
      for (let i = 0; i < runs; i++) {
        const p = line({ degrees: [1, 2, 3, 4, 5, 6, 7], maxSkip: 4, range, rhythms: ["quarter", "eighthEighth", "half"], measures }).map((n: any) => n.pitchValue);
        if (p.includes(range.min) && p.includes(range.max)) hit++;
      }
      return hit / runs;
    };
    expect(bothEnds({ min: 14, max: 21 }, 30)).toBeGreaterThanOrEqual(0.9);
    expect(bothEnds({ min: 12, max: 23 }, 30, 16)).toBeGreaterThanOrEqual(0.85);
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
