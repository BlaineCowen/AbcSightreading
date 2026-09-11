import { describe, expect, test } from "bun:test";
import {
  applyUnisonSpans,
  unisonProbabilityFor,
} from "../../src/lib/unison-spans";
import type { VoiceNote } from "../../src/lib/types";

/**
 * Two parts singing together for a stretch, then splitting.
 *
 * This runs after the search rather than inside it, so the property that
 * matters most is that it cannot break anything: same number of notes, same
 * rhythm, same total duration. The generator was measured at *zero* unisons in
 * 2461 note pairs before this existed - two rules independently forbid it, and
 * both are right for four-part counterpoint - so nothing here loosens them.
 */

const TS = 32; // 4/4 in 32nd-note units

const note = (pitchValue: number, order: number, length = 8): VoiceNote =>
  ({ name: "x", degree: 0, pitchValue, length, rest: false, order } as VoiceNote);

const rest = (order: number, length = 8): VoiceNote =>
  ({ name: "z", degree: -1, pitchValue: -1, length, rest: true, order } as VoiceNote);

/** Two index-aligned voices, one quarter per beat, upper on 28 and lower on 24. */
function twoPart(measures: number): VoiceNote[][] {
  return [
    Array.from({ length: measures * 4 }, () => note(28, 1)),
    Array.from({ length: measures * 4 }, () => note(24, 0)),
  ];
}

const WIDE: [number, number][] = [
  [20, 32],
  [20, 32],
];
// Wide enough that the seam checks never refuse these fixtures; the seams get
// their own tests at the bottom.
const always = { probability: 1, random: () => 0, maxSkip: 7 };

const unisonCount = (v: VoiceNote[][]) =>
  v[0].filter((n, i) => !n.rest && n.pitchValue === v[1][i].pitchValue).length;

describe("unison spans", () => {
  test("the parts actually end up together", () => {
    const out = applyUnisonSpans(twoPart(16), {
      measures: 16,
      tsPerMeasure: TS,
      ranges: WIDE,
      ...always,
    });
    expect(unisonCount(out)).toBeGreaterThan(0);
  });

  test("and they split again - it is not unison all the way down", () => {
    const out = applyUnisonSpans(twoPart(16), {
      measures: 16,
      tsPerMeasure: TS,
      ranges: WIDE,
      ...always,
    });
    expect(unisonCount(out)).toBeLessThan(out[0].length);
  });

  test("the opening is where it starts", () => {
    const out = applyUnisonSpans(twoPart(16), {
      measures: 16,
      tsPerMeasure: TS,
      ranges: WIDE,
      ...always,
    });
    expect(out[0][0].pitchValue).toBe(out[1][0].pitchValue);
  });

  test("the last measure stays in two parts", () => {
    // The exercise should not end on a unison - the cadence is the one place
    // two parts most need to be two parts.
    for (let i = 0; i < 40; i++) {
      const out = applyUnisonSpans(twoPart(16), {
        measures: 16,
        tsPerMeasure: TS,
        ranges: WIDE,
        maxSkip: 7,
        probability: 1,
      });
      const lastMeasureFrom = out[0].length - 4;
      for (let k = lastMeasureFrom; k < out[0].length; k++) {
        expect(out[0][k].pitchValue).not.toBe(out[1][k].pitchValue);
      }
    }
  });

  test("rhythm and length are untouched", () => {
    // It replaces pitches, never notes: anything else and the two staves stop
    // lining up.
    const input = twoPart(16);
    const before = input.map((v) => v.map((n) => n.length));
    const out = applyUnisonSpans(input, {
      measures: 16,
      tsPerMeasure: TS,
      ranges: WIDE,
      ...always,
    });
    expect(out.map((v) => v.map((n) => n.length))).toEqual(before);
    expect(out.map((v) => v.length)).toEqual(input.map((v) => v.length));
  });

  test("each voice keeps its own order, so the staves do not swap", () => {
    const out = applyUnisonSpans(twoPart(16), {
      measures: 16,
      tsPerMeasure: TS,
      ranges: WIDE,
      ...always,
    });
    expect(out[0].every((n) => n.order === 1)).toBe(true);
    expect(out[1].every((n) => n.order === 0)).toBe(true);
  });

  test("a span nobody can sing is left alone", () => {
    // The whole point of the range check: a unison has to be inside BOTH
    // singers' ranges or one of them cannot sing it. Here the ranges do not
    // overlap at all.
    const out = applyUnisonSpans(twoPart(16), {
      measures: 16,
      tsPerMeasure: TS,
      ranges: [
        [28, 32],
        [20, 24],
      ],
      ...always,
    });
    expect(unisonCount(out)).toBe(0);
  });

  test("it takes the line the other voice can reach", () => {
    // Upper line first, since in two parts that is the tune - but if the lower
    // voice cannot reach it, the lower line is used instead and it is still a
    // unison.
    const out = applyUnisonSpans(twoPart(16), {
      measures: 16,
      tsPerMeasure: TS,
      // The lower voice cannot reach 28; the upper can reach 24.
      ranges: [
        [20, 32],
        [20, 26],
      ],
      ...always,
    });
    expect(out[0][0].pitchValue).toBe(24);
    expect(out[1][0].pitchValue).toBe(24);
  });

  test("rests are left as rests", () => {
    const input = twoPart(16);
    input[0][2] = rest(1);
    input[1][2] = rest(0);
    const out = applyUnisonSpans(input, {
      measures: 16,
      tsPerMeasure: TS,
      ranges: WIDE,
      ...always,
    });
    expect(out[0][2].rest).toBe(true);
    expect(out[1][2].rest).toBe(true);
  });

  test("only ever a two-voice texture", () => {
    // Two of four parts in unison leaves the harmony a note short.
    const four = [...twoPart(16), ...twoPart(16)];
    expect(
      applyUnisonSpans(four, { measures: 16, tsPerMeasure: TS, ranges: WIDE, ...always })
    ).toBe(four);
  });

  test("probability zero does nothing at all", () => {
    const input = twoPart(16);
    expect(
      applyUnisonSpans(input, {
        measures: 16,
        tsPerMeasure: TS,
        ranges: WIDE,
        maxSkip: 7,
        probability: 0,
      })
    ).toBe(input);
  });

  test("a very short exercise is left alone", () => {
    // There is no room to split back apart.
    const input = twoPart(2);
    expect(
      applyUnisonSpans(input, { measures: 2, tsPerMeasure: TS, ranges: WIDE, ...always })
    ).toBe(input);
  });

  test("the beginner levels always, level 3 sometimes, above never", () => {
    expect(unisonProbabilityFor("UIL 1")).toBe(1);
    expect(unisonProbabilityFor("UIL 2")).toBe(1);
    expect(unisonProbabilityFor("UIL 3")).toBeGreaterThan(0);
    expect(unisonProbabilityFor("UIL 3")).toBeLessThan(1);
    expect(unisonProbabilityFor("UIL 4")).toBe(0);
    expect(unisonProbabilityFor("UIL 5")).toBe(0);
    expect(unisonProbabilityFor(undefined)).toBe(0);
  });

});

/**
 * Seam checks.
 *
 * The splice joins a borrowed line to what the target voice sang before and
 * after it. Checking only that the notes were in range let it hand the singer a
 * leap the search would never have written: measured on a two-part tenor/bass
 * texture, intervals wider than maxSkip went from 93 to 332 and melodic sevenths
 * from 1 to 19, purely from these joins.
 *
 * All of these use the LATER rejoin span, not the opening one. The opening
 * starts at bar 1, so it has nothing before it and its entry seam is vacuous -
 * a fixture built on it can only ever exercise half the checks.
 *
 * With `random: () => 0` and 16 measures: the opening takes bars 1-2 (notes
 * 0-7) and the rejoin takes bars 4-5 (notes 12-19). The upper voice is the
 * source, since it is tried first and these ranges let either reach the other.
 */
/**
 * The contract is not "this particular window was left alone" - the pass now
 * tries every legal position and takes one that joins, so a refusal in one place
 * shows up as a splice somewhere else. What must hold is that it never
 * INTRODUCES a fault: no interval the singer cannot manage, and no accidental
 * left without the resolution it was written with.
 */
function run(upper: VoiceNote[], lower: VoiceNote[], maxSkip: number) {
  const before = lower.map((n) => n.pitchValue);
  const out = applyUnisonSpans([upper, lower], {
    measures: 16,
    tsPerMeasure: TS,
    ranges: [
      [8, 40],
      [8, 40],
    ],
    maxSkip,
    probability: 1,
    random: () => 0,
  });
  return { after: out[1], before, spliced: out[1].some((n, i) => n.pitchValue !== before[i]) };
}

/** 64 quarters at one pitch, with individual notes overridden. */
const line = (pitch: number, order: number, overrides: Record<number, number> = {}) =>
  Array.from({ length: 64 }, (_, i) => note(overrides[i] ?? pitch, order));

/** An interval the output has, that the input did not, and that is unsingable. */
function introducedBadLeap(
  before: number[],
  after: VoiceNote[],
  maxSkip: number
): boolean {
  for (let i = 1; i < after.length; i++) {
    const was = Math.abs(before[i] - before[i - 1]);
    const now = Math.abs(after[i].pitchValue - after[i - 1].pitchValue);
    if (now === was) continue;
    if (now > maxSkip || now === 6) return true;
  }
  return false;
}

/** Every accidental followed by the step it is owed, looking through repeats. */
function resolutionsIntact(v: VoiceNote[]): boolean {
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    if (a.rest || !a.accidental) continue;
    const b = v.slice(i + 1).find((n) => !n.rest && n.pitchValue !== a.pitchValue);
    if (!b) continue;
    const raised =
      a.accidental === "sharp" || (a.accidental === "natural" && a.wasRaised === true);
    if (raised ? b.pitchValue - a.pitchValue !== 1 : b.pitchValue - a.pitchValue !== -1) {
      return false;
    }
  }
  return true;
}

describe("unison seams", () => {
  test("it still joins the parts when the seams are fine", () => {
    // The control. Without it, every assertion below is satisfied by a pass that
    // simply never splices anything.
    expect(run(line(28, 1), line(26, 0), 3).spliced).toBe(true);
  });

  test("no unsingable leap INTO the borrowed line", () => {
    // Note 11 sits a sixth above the borrowed line, so the span that would start
    // at note 12 cannot be entered. Its exit is a step, so only the entry check
    // can refuse it.
    const { before, after } = run(line(28, 1), line(26, 0, { 11: 34 }), 3);
    expect(introducedBadLeap(before, after, 3)).toBe(false);
  });

  test("no unsingable leap OUT of it", () => {
    // The mirror: note 20, where the target voice resumes, is a sixth away.
    const { before, after } = run(line(28, 1), line(26, 0, { 20: 34 }), 3);
    expect(introducedBadLeap(before, after, 3)).toBe(false);
  });

  test("an accidental running INTO a seam keeps its resolution", () => {
    // Note 11 is raised and resolves up to note 12. The borrowed line sits a
    // step BELOW it, which is the wrong way - and the leap is a step either way,
    // so only the resolution check can refuse it.
    const lower = line(26, 0, { 11: 29, 12: 30 });
    lower[11] = { ...lower[11], accidental: "sharp", wasRaised: true } as VoiceNote;
    const { after } = run(line(28, 1), lower, 3);
    expect(resolutionsIntact(lower)).toBe(true); // the fixture starts out correct
    expect(resolutionsIntact(after)).toBe(true);
  });

  test("and so does one running OUT of a seam", () => {
    // The last note of the borrowed material is raised, so whatever the target
    // voice resumes on must be a step above it.
    // Note 20 of the SOURCE is the step that resolves it, so the source's own
    // line is sound - the fault is only ever the target resuming somewhere else.
    const upper = line(28, 1, { 20: 29 });
    upper[19] = { ...upper[19], accidental: "sharp", wasRaised: true } as VoiceNote;
    expect(resolutionsIntact(upper)).toBe(true);
    const { after } = run(upper, line(26, 0), 3);
    expect(resolutionsIntact(after)).toBe(true);
  });
});
