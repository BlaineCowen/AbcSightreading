import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { ClefType } from "../../src/lib/types";

/**
 * Three-part voicings failed in some keys and not others - at UIL 4, 16 bars,
 * C and Bb failed 88% of the time in both SSA and TBB while G and F did not.
 *
 * The lowest part's range sits almost inside the ranges above it, so in a key
 * whose dominant root the lowest part can only reach near its top, every V
 * pushes it into the space the part above just left, and the no-overlap rule
 * had no fallback. It now yields after several retries of the same step. These
 * hold the keys that were impossible to "mostly works", on the calibrated UIL
 * ranges, which are the real ones and are not to be changed to suit this.
 */

const VOICINGS: Record<string, any> = {
  "3 Part Treble": {
    Soprano1: { order: 2, smallName: "S1", clef: ClefType.Treble, range: [21, 35] },
    Soprano2: { order: 1, smallName: "S2", clef: ClefType.Treble, range: [18, 32] },
    Alto: { order: 0, smallName: "A", clef: ClefType.Treble, range: [14, 30] },
  },
  "3 Part Tenor/Bass": {
    Tenor: { order: 2, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11, 27] },
    Baritone: { order: 1, smallName: "B1", clef: ClefType.Bass, range: [2, 26] },
    Bass: { order: 0, smallName: "B2", clef: ClefType.Bass, range: [2, 24] },
  },
};

function successes(voicing: string, key: string, runs: number) {
  const p: any = (uilPresets as any)["UIL 4"];
  const parts: any = { numofParts: 3, parts: {} };
  for (const [k, d] of Object.entries<any>(VOICINGS[voicing])) {
    parts.parts[k] = { ...d, currentRange: p.voiceRanges[k] };
  }
  const rhythms = allRhythms.filter(
    (r) => p.allowedRhythmNames.includes(r.name) && !r.rest && r.totalValue <= 32
  );
  const { log, warn, error } = console;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  let ok = 0;
  try {
    for (let i = 0; i < runs; i++) {
      try {
        generateChoralExercise({
          key,
          timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
          partsObject: structuredClone(parts),
          measures: 16,
          maxSkip: p.maxSkip,
          bpm: 72,
          selectedRhythms: rhythms,
          chords: fullChordSet,
          accidentalsByStep: true,
          nctProbability: 0.25,
          chromaticFrequency: 1,
          allowedChordNames: p.allowedChordNames,
          voiceTexture: "full",
          stepwiseEighths: true,
        } as any);
        ok++;
      } catch {
        /* counted by omission */
      }
    }
  } finally {
    Object.assign(console, { log, warn, error });
  }
  return ok;
}

describe("three-part voicings in the keys that used to fail", () => {
  // Measured 16 of 16 in C and 15 of 16 in Bb. Asserted looser, so a
  // randomised search cannot make this flaky: it was 2 of 16 before.
  for (const voicing of Object.keys(VOICINGS)) {
    for (const key of ["C", "Bb"]) {
      test(`${voicing} in ${key}, 16 bars, UIL 4`, () => {
        expect(successes(voicing, key, 6)).toBeGreaterThanOrEqual(4);
      }, 120000);
    }
  }
});
