import { describe, expect, test } from "bun:test";
import {
  applyRhymingPhrases,
  rhymeProbabilityFor,
  PHRASE_MEASURES,
} from "../../src/lib/rhyming-phrases";
import type { VoiceNote } from "../../src/lib/types";

/**
 * The consequent phrase rhymes the antecedent.
 *
 * Measured before this existed: over 120 exercises the second half repeated the
 * first's rhythm in 0% of them and its pitches in 0%. Two four-measure phrases
 * of unrelated material is not a period, it is eight bars of correct harmony in
 * a row.
 *
 * Like the unison splice, this runs after the search rather than inside it, so
 * the property that matters most is that it cannot break anything: same total
 * duration per voice, and every splice vetted before a note is written.
 */

const TS = 32; // 4/4 in 32nd-note units
const QUARTER = 8;

const note = (pitchValue: number, order = 1): VoiceNote =>
  ({ name: "x", degree: 0, pitchValue, length: QUARTER, rest: false, order } as VoiceNote);

/** One voice of `pitches`, a quarter each. */
const voice = (pitches: number[], order = 1) => pitches.map((p) => note(p, order));

/** Eight measures: a first phrase, then a deliberately different second one. */
const A = [20, 21, 22, 21, 22, 23, 24, 23, 21, 20, 21, 22, 23, 23, 22, 22];
const B = [24, 23, 24, 25, 25, 24, 23, 24, 22, 23, 22, 21, 20, 20, 20, 20];

const opts = (over: Partial<Parameters<typeof applyRhymingPhrases>[1]> = {}) => ({
  measures: 8,
  tsPerMeasure: TS,
  maxSkip: 4,
  probability: 1,
  random: () => 0,
  ...over,
});

/** The notes of measures [from, to) of one voice. */
const bars = (v: VoiceNote[], from: number, to: number) =>
  v.slice(from * (TS / QUARTER), to * (TS / QUARTER));

const samePitches = (x: VoiceNote[], y: VoiceNote[]) =>
  x.length === y.length && x.every((n, i) => n.pitchValue === y[i].pitchValue);

describe("rhyming phrases", () => {
  test("the two phrases open with the same material", () => {
    const out = applyRhymingPhrases([voice([...A, ...B])], opts());
    // Either phrase may supply the material - both directions are tried, and the
    // period is the same either way - so this asserts they MATCH, not which one
    // moved.
    expect(samePitches(bars(out[0], 0, 3), bars(out[0], 4, 7))).toBe(true);
  });

  test("and they part company at the cadence", () => {
    // A period whose phrases end alike is not a period; the whole point is that
    // the antecedent is left open and the consequent closes.
    const out = applyRhymingPhrases([voice([...A, ...B])], opts());
    expect(samePitches(bars(out[0], 3, 4), bars(out[0], 7, 8))).toBe(false);
  });

  test("the final measure is never overwritten", () => {
    const input = [voice([...A, ...B])];
    const out = applyRhymingPhrases(input, opts());
    expect(samePitches(bars(out[0], 7, 8), bars(input[0], 7, 8))).toBe(true);
  });

  test("total duration per voice is untouched", () => {
    // It replaces notes, never the amount of time they fill: anything else and
    // every later barline in that voice moves.
    // A sixth apart, not in unison: two identical voices are declined by the
    // parallel-unison rule before any splice is attempted, and then neither this
    // nor the order assertion below is exercising anything.
    const input = [voice([...A, ...B], 1), voice([...A, ...B].map((p) => p - 5), 0)];
    const before = input.map((v) => v.reduce((a, n) => a + n.length, 0));
    const out = applyRhymingPhrases(input, opts());
    expect(out.map((v) => v.reduce((a, n) => a + n.length, 0))).toEqual(before);
  });

  test("each voice keeps its own order, so the staves do not swap", () => {
    const out = applyRhymingPhrases(
      [voice([...A, ...B], 1), voice([...A, ...B].map((p) => p - 5), 0)],
      opts()
    );
    expect(out[0].every((n) => n.order === 1)).toBe(true);
    expect(out[1].every((n) => n.order === 0)).toBe(true);
  });

  test("a seam needing an unsingable leap is declined", () => {
    // maxSkip 1 - nothing but steps - and the two phrases sit far enough apart
    // that no join is a step.
    const input = [voice([...A, ...B.map((p) => p + 5)])];
    const out = applyRhymingPhrases(input, opts({ maxSkip: 1 }));
    expect(out[0].map((n) => n.pitchValue)).toEqual(
      input[0].map((n) => n.pitchValue)
    );
  });

  test("a seam that would run two voices in parallel fifths is declined", () => {
    // Vetting melodic leaps alone let the splice join two lines that were never
    // written against each other; measured, that roughly doubled the parallel
    // fifths and octaves at UIL 3 and 5.
    //
    // Both voices are a fifth apart throughout and every seam moves them the
    // same direction by the same step, so each join is a parallel fifth while
    // every join is an easy interval - the leap check passes and only the
    // parallel check can refuse it.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const upper = byBar([30, 31, 32, 31, 26, 27, 28, 29]);
    const lower = byBar([26, 27, 28, 27, 22, 23, 24, 25]);
    const out = applyRhymingPhrases(
      [voice(upper, 1), voice(lower, 0)],
      opts({ maxSkip: 4 })
    );
    expect(out[0].map((n) => n.pitchValue)).toEqual(upper);
    expect(out[1].map((n) => n.pitchValue)).toEqual(lower);
  });

  test("the seam INTO the borrowed material is vetted, not just the one out", () => {
    // Both seams are checked, and a test that only reaches one of them lets the
    // other be deleted silently. Here every route is refused by the entry seam
    // alone: the exit seams are all easy intervals.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const upper = byBar([30, 31, 30, 35, 24, 25, 24, 29]);
    const lower = byBar([25, 26, 25, 30, 19, 20, 19, 24]);
    const out = applyRhymingPhrases(
      [voice(upper, 1), voice(lower, 0)],
      opts({ maxSkip: 2 })
    );
    expect(out[0].map((n) => n.pitchValue)).toEqual(upper);
    expect(out[1].map((n) => n.pitchValue)).toEqual(lower);
  });

  test("the entry seam is vetted for parallels too, not only the exit", () => {
    // The previous fixture is parallel at both seams, so either check alone
    // catches it and the other can be deleted unnoticed. Here only the entry is
    // parallel: the exit moves into a sixth.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const upper = byBar([30, 31, 32, 31, 26, 27, 28, 33]);
    const lower = byBar([26, 27, 27, 27, 22, 23, 23, 28]);
    const out = applyRhymingPhrases(
      [voice(upper, 1), voice(lower, 0)],
      opts({ maxSkip: 2 })
    );
    expect(out[0].map((n) => n.pitchValue)).toEqual(upper);
    expect(out[1].map((n) => n.pitchValue)).toEqual(lower);
  });

  test("contrary motion into a perfect interval is allowed, not refused", () => {
    // The rule has to be parallel motion, not merely arriving at a perfect
    // interval - two voices converging on a unison from opposite directions is
    // ordinary counterpoint. Treating that as parallel would silently refuse
    // good periods, and a suite that only asserts refusals never notices.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const upper = byBar([27, 28, 27, 30, 20, 21, 20, 31]);
    const lower = byBar([27, 26, 27, 23, 16, 17, 16, 28]);
    const out = applyRhymingPhrases(
      [voice(upper, 1), voice(lower, 0)],
      opts({ maxSkip: 4 })
    );
    // The entry seam here is a contrary-motion octave-to-unison.
    expect(samePitches(bars(out[0], 0, 3), bars(out[0], 4, 7))).toBe(true);
    expect(samePitches(bars(out[1], 0, 3), bars(out[1], 4, 7))).toBe(true);
  });

  test("parallel octaves are refused as well as fifths", () => {
    // Two rules, two fixtures: a suite that only ever builds fifths lets the
    // octave clause be deleted without a word.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const upper = byBar([30, 31, 32, 31, 26, 27, 28, 33]);
    const lower = byBar([23, 24, 25, 24, 19, 20, 21, 26]);
    const out = applyRhymingPhrases(
      [voice(upper, 1), voice(lower, 0)],
      opts({ maxSkip: 2 })
    );
    expect(out[0].map((n) => n.pitchValue)).toEqual(upper);
    expect(out[1].map((n) => n.pitchValue)).toEqual(lower);
  });

  test("probability zero does nothing at all", () => {
    const input = [voice([...A, ...B])];
    expect(applyRhymingPhrases(input, opts({ probability: 0 }))).toBe(input);
  });

  test("an exercise with only one phrase is left alone", () => {
    const input = [voice(A)];
    expect(
      applyRhymingPhrases(input, opts({ measures: PHRASE_MEASURES }))
    ).toBe(input);
  });

  test("a sixteen-measure exercise is two periods, not one", () => {
    // Phrases pair up in order, so the fourth rhymes the third rather than
    // everything rhyming the opening.
    const C = [18, 19, 20, 19, 20, 21, 22, 21, 19, 18, 19, 20, 21, 21, 20, 20];
    const D = [22, 21, 22, 23, 23, 22, 21, 22, 20, 21, 20, 19, 18, 18, 18, 18];
    const out = applyRhymingPhrases([voice([...A, ...B, ...C, ...D])], {
      ...opts(),
      measures: 16,
    });
    expect(samePitches(bars(out[0], 0, 3), bars(out[0], 4, 7))).toBe(true);
    expect(samePitches(bars(out[0], 8, 11), bars(out[0], 12, 15))).toBe(true);
    // ...and the second period is its own idea. Pairing the phrases as (0,1),
    // (1,2), (2,3) instead of (0,1), (2,3) also satisfies the two assertions
    // above - by making the whole exercise one idea four times over.
    expect(samePitches(bars(out[0], 0, 3), bars(out[0], 8, 11))).toBe(false);
  });

  test("the beginner levels most often, the advanced ones least, never zero", () => {
    // A period is good writing at any level; it is just less of the whole story
    // as the writing becomes continuous.
    expect(rhymeProbabilityFor("UIL 1")).toBeGreaterThan(rhymeProbabilityFor("UIL 3"));
    expect(rhymeProbabilityFor("UIL 3")).toBeGreaterThan(rhymeProbabilityFor("UIL 5"));
    expect(rhymeProbabilityFor("UIL 5")).toBeGreaterThan(0);
    expect(rhymeProbabilityFor(undefined)).toBeGreaterThan(0);
  });
});
