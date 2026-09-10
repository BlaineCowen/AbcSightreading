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
const always = { probability: 1, random: () => 0 };

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
