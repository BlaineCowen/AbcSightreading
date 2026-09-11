import { describe, expect, test } from "bun:test";
import {
  applyRhymingPhrases,
  rhymeProbabilityFor,
  PHRASE_MEASURES,
} from "../../src/lib/rhyming-phrases";
import type { VoiceNote } from "../../src/lib/types";
import { noteArray } from "../../src/resources/noteArray";

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

/**
 * `ranges` is left out by default, which switches the top-line variation off -
 * the splice itself is what most of these are about, and an exact copy is the
 * easiest thing to assert against. The variation has its own block at the
 * bottom, where ranges are supplied.
 */
const opts = (over: Partial<Parameters<typeof applyRhymingPhrases>[1]> = {}) =>
  ({
    measures: 8,
    tsPerMeasure: TS,
    maxSkip: 4,
    probability: 1,
    random: () => 0,
    ...over,
  }) as Parameters<typeof applyRhymingPhrases>[1];

/** The notes of measures [from, to) of one voice. */
const bars = (v: VoiceNote[], from: number, to: number) =>
  v.slice(from * (TS / QUARTER), to * (TS / QUARTER));

const samePitches = (x: VoiceNote[], y: VoiceNote[]) =>
  x.length === y.length && x.every((n, i) => n.pitchValue === y[i].pitchValue);

/**
 * Every accidental in the line is followed by the step it is owed - raised up,
 * lowered down - looking through repeats of the same pitch.
 *
 * Asserted over the whole voice rather than at one index, because the splice can
 * break a resolution at either end: the one running into the borrowed material,
 * and the one running out of it.
 */
const resolutionsIntact = (v: VoiceNote[]): boolean => {
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    if (a.rest || !a.accidental) continue;
    let b: VoiceNote | undefined;
    for (let j = i + 1; j < v.length; j++) {
      if (v[j].rest || v[j].pitchValue === a.pitchValue) continue;
      b = v[j];
      break;
    }
    if (!b) continue;
    const raised =
      a.accidental === "sharp" || (a.accidental === "natural" && a.wasRaised === true);
    const delta = b.pitchValue - a.pitchValue;
    if (raised ? delta !== 1 : delta !== -1) return false;
  }
  return true;
};

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

  test("an accidental running INTO a seam keeps its resolution", () => {
    // A chromatic note is written together with the note that resolves it. The
    // splice replaces whatever came next, so an accidental beside a seam loses
    // the resolution it was written with and nothing downstream notices.
    // Measured, that took the lowest voice from 95% to 89% resolving by step in
    // major, and raised notes from rising 92% of the time to 88%.
    //
    // The last note of measure 4 is raised and resolves up into measure 5; the
    // borrowed opening would land a third below it instead.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const v = voice(byBar([26, 27, 26, 28, 29, 23, 22, 24]));
    v[15] = { ...v[15], accidental: "sharp", wasRaised: true } as VoiceNote;
    expect(resolutionsIntact(v)).toBe(true); // the fixture starts out correct
    expect(resolutionsIntact(applyRhymingPhrases([v], opts({ maxSkip: 4 }))[0])).toBe(true);
  });

  test("and so does one running OUT of a seam", () => {
    // The other end, which needs its own fixture: here the accidental is the
    // LAST note of the borrowed material, so what must resolve it is the target
    // phrase's own cadence - the part deliberately left as generated.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const v = voice(byBar([26, 27, 26, 27, 22, 23, 22, 24]));
    v[11] = { ...v[11], accidental: "sharp", wasRaised: true } as VoiceNote;
    expect(resolutionsIntact(v)).toBe(true);
    expect(resolutionsIntact(applyRhymingPhrases([v], opts({ maxSkip: 4 }))[0])).toBe(true);
  });

  test("...but a resolution that is honoured still lets the rhyme happen", () => {
    // A gate that simply refused every seam would pass both tests above and be
    // worthless.
    //
    // Spelled as a NATURAL that was raised, which is how every chromatic note
    // looks in a flat key: there the accidental alone cannot say which way the
    // note resolves, and only `wasRaised` distinguishes a raised 4th (rises)
    // from a lowered 7th (falls). Read it wrong and this splice is refused for
    // resolving the way it should.
    const byBar = (p: number[]) => p.flatMap((x) => [x, x, x, x]);
    const v = voice(byBar([26, 27, 26, 25, 22, 23, 22, 24]));
    v[15] = { ...v[15], accidental: "natural", wasRaised: true } as VoiceNote;
    const out = applyRhymingPhrases([v], opts({ maxSkip: 4 }));
    expect(samePitches(bars(out[0], 0, 3), bars(out[0], 4, 7))).toBe(true);
    expect(resolutionsIntact(out[0])).toBe(true);
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

/**
 * The restatement answers the first phrase instead of echoing it.
 *
 * A parallel period whose consequent is an exact copy reads as repetition - the
 * only difference is the cadence, four bars later. One or two notes of the tune
 * change, and every substitute has to be a tone of the chord sounding there.
 *
 * That chord is not handed to this pass, and does not need to be: the other
 * voices ARE the chord at that instant, so any scale degree they are sounding is
 * a chord tone by construction.
 */
describe("varying the restatement", () => {
  // Array position, not `order`. The two are independent: voices[0] here is the
  // tune and carries order 1, because order says which staff a part sits on.
  const TOP = 0;
  const LOW = 1;

  /** Two voices: a tune on top, and a lower part that defines the harmony. */
  function twoVoices(tune: number[], under: number[]) {
    return [
      tune.map((p) => note(p, 1)),
      under.map((p) => note(p, 0)),
    ];
  }

  const withRanges = (over = {}) =>
    opts({ ranges: [[14, 34], [14, 34]] as [number, number][], ...over });

  test("the phrases still match, but not note for note", () => {
    // Both properties at once: too few changes and it is an echo, too many and
    // it is a different phrase rather than an answer to this one.
    const tune = [...A, ...B];
    const under = tune.map((p) => p - 5); // a sixth below throughout
    const out = applyRhymingPhrases(twoVoices(tune, under), withRanges());
    const first = bars(out[TOP], 0, 3).map((n) => n.pitchValue);
    const second = bars(out[TOP], 4, 7).map((n) => n.pitchValue);
    const differences = first.filter((p, i) => p !== second[i]).length;
    expect(differences).toBeGreaterThan(0);
    expect(differences).toBeLessThanOrEqual(2);
  });

  test("a substituted note is a tone the other voices are sounding", () => {
    // The rule that keeps this from breaking the harmony. The lower voice holds
    // one degree throughout, so any change in the tune must land on it.
    const tune = [...A, ...B];
    const under = tune.map(() => 21); // a single degree, all the way down
    const out = applyRhymingPhrases(twoVoices(tune, under), withRanges());
    const varied = out[TOP].filter((n) => (n as VoiceNote & { varied?: boolean }).varied);
    expect(varied.length).toBeGreaterThan(0);
    for (const n of varied) expect(n.pitchValue % 7).toBe(21 % 7);
  });

  test("only the top voice is varied", () => {
    // The lower part still moves - the rhyme splice rewrites every voice. What
    // must not happen is a SUBSTITUTED note in anything but the tune.
    const tune = [...A, ...B];
    const out = applyRhymingPhrases(
      twoVoices(tune, tune.map((p) => p - 5)),
      withRanges()
    );
    const varied = (v: VoiceNote[]) =>
      v.filter((n) => (n as VoiceNote & { varied?: boolean }).varied).length;
    expect(varied(out[TOP])).toBeGreaterThan(0);
    expect(varied(out[LOW])).toBe(0);
  });

  test("the first note of the restatement is never the one that changes", () => {
    // It is what makes the two phrases recognisably the same phrase.
    const tune = [...A, ...B];
    const under = tune.map((p) => p - 5);
    const out = applyRhymingPhrases(twoVoices(tune, under), withRanges());
    expect(out[TOP][16].pitchValue).toBe(out[TOP][0].pitchValue);
  });

  test("a substitute is never a leap the singer cannot make", () => {
    const tune = [...A, ...B];
    const under = tune.map((p) => p - 5);
    const out = applyRhymingPhrases(twoVoices(tune, under), withRanges({ maxSkip: 2 }));
    for (let i = 1; i < out[TOP].length; i++) {
      const gap = Math.abs(out[TOP][i].pitchValue - out[TOP][i - 1].pitchValue);
      const wasGap = Math.abs(
        [...A, ...B][i] - [...A, ...B][i - 1]
      );
      if (gap !== wasGap) expect(gap).toBeLessThanOrEqual(2);
    }
  });

  test("a note carrying an accidental is left alone", () => {
    // It was written together with the note that resolves it; swapping the
    // accidental away silently voids that.
    const tune = [...A, ...B];
    const under = tune.map((p) => p - 5);
    const input = twoVoices(tune, under);
    // On the SOURCE note, not the target: the splice overwrites bars 5-7 with
    // copies of bars 1-3, so an accidental placed in the restatement is simply
    // replaced and the test proves nothing. A[5] is 23 and A[6] is 24, so a
    // raised note here already resolves up by step.
    // Index 1 - which lands at index 17, the FIRST note the variation considers.
    // Put it out of reach and the protection can be deleted unnoticed. A[1] is
    // 21 and A[2] is 22, so a raised note here already resolves up by step.
    input[TOP][1] = { ...input[TOP][1], accidental: "sharp", wasRaised: true } as VoiceNote;
    const out = applyRhymingPhrases(input, withRanges());
    const carried = out[TOP][17] as VoiceNote & { varied?: boolean };
    expect(carried.accidental).toBe("sharp");
    expect(carried.varied).toBeFalsy();
    // ...and the pass did vary something, so this is not a vacuous pass.
    expect(out[TOP].some((n) => (n as VoiceNote & { varied?: boolean }).varied)).toBe(true);
  });

  test("without ranges it stays an exact copy", () => {
    // No range means no safe way to choose a substitute. A period that echoes is
    // still a period, so this degrades rather than failing.
    const tune = [...A, ...B];
    const out = applyRhymingPhrases(twoVoices(tune, tune.map((p) => p - 5)), opts());
    expect(
      samePitches(bars(out[TOP], 0, 3), bars(out[TOP], 4, 7))
    ).toBe(true);
  });

  test("the note running into the cadence is left to the seam rules", () => {
    // The last note of the borrowed span is the approach to the consequent's own
    // cadence, which the splice deliberately did not copy over.
    //
    // 0.95 pushes the starting offset to the END of the span. With the default 0
    // the search fills its quota from the first notes and never reaches the last
    // one, so the guard could be deleted and nothing would notice.
    const tune = [...A, ...B];
    const out = applyRhymingPhrases(
      twoVoices(tune, tune.map((p) => p - 5)),
      withRanges({ random: () => 0.95 })
    );
    expect((out[TOP][27] as VoiceNote & { varied?: boolean }).varied).toBeFalsy();
  });

  test("a substituted note prints as the note it now is", () => {
    // `name` is what the assembler emits as the ABC pitch. Carry the replaced
    // note's name over and the score shows the old note while everything that
    // reads pitchValue - playback, the checks above - sees the new one.
    const tune = [...A, ...B];
    const out = applyRhymingPhrases(
      twoVoices(tune, tune.map((p) => p - 5)),
      withRanges()
    );
    const varied = out[TOP].filter((n) => (n as VoiceNote & { varied?: boolean }).varied);
    expect(varied.length).toBeGreaterThan(0);
    for (const n of varied) {
      expect(n.name).toBe(noteArray[n.pitchValue]);
      expect(n.degree).toBe(n.pitchValue % 7);
    }
  });
});
