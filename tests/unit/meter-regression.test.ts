import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { createNewSr } from "../../src/lib/generateUnison";
import { canFillExercise } from "../../src/lib/rhythm-feasibility";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { TIME_SIGS, choralSelectable, presetVoicing } from "../../scripts/generation-fixtures";

/**
 * Simple-meter output, frozen for fixed seeds.
 *
 * Compound meter arrives by moving every meter onto one model and adding a
 * branch for 6/8, 9/8 and 12/8. None of that may change a single byte of a 2/4,
 * 3/4 or 4/4 exercise, Unison or Choral. With Math.random seeded, both
 * generators are deterministic, so the ABC they write is the contract.
 *
 * NEVER update this snapshot to make it pass. A failure means a change reached
 * simple meter - including a compound branch that draws a random number before
 * it knows the meter is compound, which shifts every later draw.
 */

/** Runs fn with a seeded Math.random and a quiet console. A throw is recorded, not raised: it is deterministic too. */
function seeded(seed: number, fn: () => string): string {
  const real = Math.random;
  const { log, warn, error } = console;
  let s = seed;
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    return fn();
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    Math.random = real;
    Object.assign(console, { log, warn, error });
  }
}

const SIMPLE_METERS = ["2/4", "3/4", "4/4"] as const;

describe("Choral in simple meter, fixed seeds", () => {
  for (const level of ["UIL 1", "UIL 3", "UIL 5"]) {
    const preset = (uilPresets as any)[level];
    const voicing = preset.allowedVoicings[0];
    const key = preset.allowedKeys[0];
    for (const meter of SIMPLE_METERS) {
      const timeSig = TIME_SIGS[meter];
      const usable = allRhythms.filter(
        (r) =>
          preset.allowedRhythmNames.includes(r.name) &&
          choralSelectable(r) &&
          !r.rest &&
          r.totalValue <= timeSig.tsPerMeasure
      );
      if (!usable.length || !canFillExercise(usable, timeSig.tsPerMeasure, 8 * timeSig.tsPerMeasure, false)) continue;
      for (const seed of [11, 4242]) {
        test(`${level} | ${voicing} | ${key} | ${meter} | seed ${seed}`, () => {
          const abc = seeded(seed, () =>
            generateChoralExercise({
              key,
              timeSig,
              partsObject: presetVoicing(voicing, preset),
              measures: 8,
              maxSkip: preset.maxSkip,
              bpm: 72,
              selectedRhythms: usable,
              chords: fullChordSet,
              accidentalsByStep: true,
              nctProbability: 0.25,
              chromaticFrequency: 1,
              allowedChordNames: preset.allowedChordNames,
              voiceTexture: "full",
              stepwiseEighths: true,
            } as any).abcString
          );
          expect(abc).toMatchSnapshot();
        }, 60000);
      }
    }
  }
});

const UNISON_RHYTHMS = [
  "quarter", "half", "dotHalf", "whole", "eighthEighth", "dotQuarterEighth",
  "eighthQuarterEighth", "fourSixteenths", "quarterRest", "eighthRestEighth",
];

describe("Unison in simple meter, fixed seeds", () => {
  for (const meter of SIMPLE_METERS) {
    const timeSig = TIME_SIGS[meter];
    const names = UNISON_RHYTHMS.filter(
      (n) => allRhythms.find((r) => r.name === n)!.totalValue <= timeSig.tsPerMeasure
    );
    for (const rhythmOnly of [false, true]) {
      for (const ties of [false, true]) {
        const syllableSystemId = ties ? "counting" : "kodaly";
        test(`${meter} | ${rhythmOnly ? "rhythm" : "pitched"} | ties ${ties} | ${syllableSystemId}`, () => {
          const abc = seeded(ties ? 99 : 7, () =>
            createNewSr({
              bpm: 60,
              tempo: 60,
              clef: "treble",
              selectedClef: "treble",
              key: "F",
              timeSig,
              selectedTimeSignature: meter,
              measures: 8,
              maxSkip: 4,
              range: { min: 14, max: 21 },
              scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
              selectedSharpDegrees: [],
              selectedFlatDegrees: [],
              rhythms: allRhythms.filter((r) => names.includes(r.name)),
              selectedRhythms: names,
              rhythmOnly,
              showSolfege: !rhythmOnly,
              lyricSystem: "movable",
              showRhythmSyllables: true,
              syllableSystemId,
              allowTiesAcrossBarline: ties,
              moveOnEighthNotes: !ties,
              accidentalsFollowStep: false,
              partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
            } as any)[0]
          );
          expect(abc).toMatchSnapshot();
        }, 60000);
      }
    }
  }
});
