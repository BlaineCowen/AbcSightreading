import { expect, test } from "bun:test";
import { parallelFaults } from "../../src/lib/parallel-check";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { unisonProbabilityFor } from "../../src/lib/unison-spans";
import { rhymeProbabilityFor } from "../../src/lib/rhyming-phrases";
import { melodyFirstFor } from "../../src/lib/two-part-treble";
import { skipLevelFor } from "../../src/lib/uil-skips";
import { ssaLevelFor } from "../../src/lib/three-part-treble";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";
import type { VoiceNote } from "../../src/lib/types";

// pitchValue is a noteArray index: C4 14, D4 15, G4 18, A4 19, B4 20, F5 24.
const n = (pitchValue: number, length = 8, rest = false) => ({ pitchValue, length, rest }) as VoiceNote;

test("C-G moving to D-A is a parallel fifth; contrary motion, a held note and a rest between are not", () => {
  expect(parallelFaults([[n(18), n(19)], [n(14), n(15)]], "C")).toBe(1);
  expect(parallelFaults([[n(18), n(17)], [n(14), n(15)]], "C")).toBe(0);
  expect(parallelFaults([[n(18), n(19)], [n(14, 16)]], "C")).toBe(0);
  expect(parallelFaults([[n(18), n(0, 8, true), n(19)], [n(14), n(0, 8, true), n(15)]], "C")).toBe(0);
});

test("octaves count, unisons do not, and a diminished fifth to a perfect one is not a fault", () => {
  expect(parallelFaults([[n(21), n(22)], [n(14), n(15)]], "C")).toBe(1);
  expect(parallelFaults([[n(14), n(15)], [n(14), n(15)]], "C")).toBe(0);
  // B-F (a diminished fifth) to C-G.
  expect(parallelFaults([[n(24), n(25)], [n(20), n(21)]], "C")).toBe(0);
});

test("finished choral exercises carry no parallel fifths or octaves, every UIL level, four parts", () => {
  const quiet = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log() {}, warn() {}, error() {} });
  try {
    for (let lv = 1; lv <= 5; lv++) {
      const LEVEL = `UIL ${lv}`;
      const p: any = (uilPresets as any)[LEVEL];
      const keys = p.allowedKeys.filter((k: string) => !k.endsWith("m"));
      const timeSig = TIME_SIGS["4/4"];
      for (let i = 0; i < 12; i++) {
        const key = keys[i % keys.length];
        const ex = generateChoralExercise({
          key, timeSig, partsObject: presetVoicing("4 Part Mixed", p), measures: 8, maxSkip: p.maxSkip, bpm: 72,
          selectedRhythms: allRhythms.filter((x) => p.allowedRhythmNames.includes(x.name) && choralSelectable(x) && !x.rest && x.totalValue <= timeSig.tsPerMeasure),
          chords: fullChordSet, accidentalsByStep: true, nctProbability: 0.25, chromaticFrequency: 1, allowedChordNames: p.allowedChordNames,
          voiceTexture: "full", stepwiseEighths: true, unisonProbability: unisonProbabilityFor(LEVEL), rhymeProbability: rhymeProbabilityFor(LEVEL),
          melodyFirst: melodyFirstFor(LEVEL), skipLevel: skipLevelFor(LEVEL), breathRests: !p.noRests, cadenceTypes: p.allowedCadenceTypes,
          dottedOnStrongBeats: !!p.dottedOnStrongBeats, ssaLevel: ssaLevelFor(LEVEL), partWriterLevel: p.level,
        } as any);
        expect(parallelFaults(ex.voiceNotes, key)).toBe(0);
      }
    }
  } finally {
    Object.assign(console, quiet);
  }
}, 120000);
