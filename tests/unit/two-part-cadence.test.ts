import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { isSelectableRhythm, containsRest } from "../../src/lib/selectable-rhythms";
import { ClefType } from "../../src/lib/types";

/**
 * Two parts have to be allowed to double a chord tone, or some cadences cannot
 * be written at all.
 *
 * Keeping one voice off a degree another voice already has is right whenever
 * there is a choice, but the filter was unconditional while every filter after
 * it was best-effort. The max-skip filter then emptied the list and the step
 * died. The final chord of a cadence is the worst case: the bass is pinned to
 * the root, which leaves the upper voice the third or the fifth and nothing
 * else, and if neither is within the level's max skip of where that voice just
 * was, there is no exercise.
 *
 * It surfaced as UIL 1, 2-Part Tenor/Bass, four bars, G major: 100% failure in
 * all three meters. Opening the tenor's floor moved the failure to F rather
 * than removing it, which is what showed the range was never the cause.
 */

const level1 = uilPresets["UIL 1"];
const rhythms = allRhythms.filter(
  (r) =>
    level1.allowedRhythmNames.includes(r.name) &&
    isSelectableRhythm(r) &&
    !(r.pattern === true && containsRest(r)) &&
    !r.rest
);

/** The level's own two-part tenor/bass voicing, with its own ranges. */
const twoPartTenorBass = () => ({
  numofParts: 2,
  parts: {
    Tenor: {
      order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp,
      range: [11, 27] as [number, number],
      currentRange: [...level1.voiceRanges!.Tenor] as [number, number],
    },
    Bass: {
      order: 0, smallName: "B", clef: ClefType.Bass,
      range: [2, 24] as [number, number],
      currentRange: [...level1.voiceRanges!.Bass] as [number, number],
    },
  },
});

function attempt(key: string, measures: number, tsName: string) {
  const perMeasure = { "4/4": 32, "3/4": 24, "2/4": 16 }[tsName]!;
  return generateChoralExercise({
    key,
    timeSig: { name: tsName, tsPerMeasure: perMeasure, beamGroupSize: 8 },
    partsObject: twoPartTenorBass(),
    measures,
    maxSkip: level1.maxSkip,
    bpm: 72,
    selectedRhythms: rhythms,
    chords: fullChordSet,
    accidentalsByStep: true,
    nctProbability: 0,
    chromaticFrequency: 1,
    allowedChordNames: level1.allowedChordNames,
    voiceTexture: "full",
  } as any);
}

/** How many of `runs` attempts threw, with the generator's narration silenced. */
function failures(key: string, measures: number, tsName: string, runs = 10) {
  let failed = 0;
  const { log, warn, error } = console;
  for (let i = 0; i < runs; i++) {
    Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
    try {
      attempt(key, measures, tsName);
    } catch {
      failed++;
    } finally {
      Object.assign(console, { log, warn, error });
    }
  }
  return failed;
}

describe("a two-part exercise can always reach its cadence", () => {
  test("every key of level 1, at the length where it broke", () => {
    // Four bars is the tight case: the cadence takes most of the exercise, so
    // the upper voice has the fewest ways to arrive at the final chord.
    for (const key of level1.allowedKeys) {
      expect(`${key}: ${failures(key, 4, "4/4")}`).toBe(`${key}: 0`);
    }
  }, 60_000);

  test("in every meter, since the failure appeared in all three", () => {
    for (const tsName of ["4/4", "3/4", "2/4"]) {
      expect(`${tsName}: ${failures("G", 4, tsName)}`).toBe(`${tsName}: 0`);
    }
  }, 60_000);

  test("and at the longer lengths it also failed at", () => {
    // G was 20-25% at eight and sixteen bars, not only at four.
    expect(failures("G", 8, "4/4")).toBe(0);
    expect(failures("G", 16, "4/4")).toBe(0);
  }, 60_000);
});
