/**
 * Smoke-test the choral generation pipeline across every UIL level × key × voicing
 * × time signature combination. Run with: bun scripts/test-generation.ts
 *
 * Suppresses console output to keep results readable.
 */

import { generateChoralExercise } from "../src/lib/generateChoral";
import { uilPresets } from "../src/lib/uil-presets";
import { chords as fullChordSet } from "../src/resources/chords";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import type { PartsObject, TimeSignature } from "../src/lib/types";

// ── Mirror the possibleVoicing from AbcjsChoral.svelte ────────────────────────
const ClefType = {
  Treble: "treble octave=-1",
  Bass: "bass octave=-1",
  TrebleOctaveUp: "treble transpose=-12",
} as const;

const baseVoicings: Record<string, PartsObject> = {
  "4 Part Mixed": {
    numofParts: 4,
    parts: {
      Soprano: { order: 3, smallName: "S",  clef: ClefType.Treble,        range: [21, 35], currentRange: [25, 32] },
      Alto:    { order: 2, smallName: "A",  clef: ClefType.Treble,        range: [14, 32], currentRange: [21, 28] },
      Tenor:   { order: 1, smallName: "T",  clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [14, 23] },
      Bass:    { order: 0, smallName: "B",  clef: ClefType.Bass,          range: [2,  21], currentRange: [9,  18] },
    },
  },
  "3 Part Mixed": {
    numofParts: 3,
    parts: {
      Soprano:  { order: 2, smallName: "S",  clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
      Alto:     { order: 1, smallName: "A",  clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
      Baritone: { order: 0, smallName: "B",  clef: ClefType.Bass,   range: [2,  21], currentRange: [9,  18] },
    },
  },
  "3 Part Treble": {
    numofParts: 3,
    parts: {
      Soprano1: { order: 2, smallName: "S1", clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
      Soprano2: { order: 1, smallName: "S2", clef: ClefType.Treble, range: [18, 32], currentRange: [22, 29] },
      Alto:     { order: 0, smallName: "A",  clef: ClefType.Treble, range: [14, 30], currentRange: [21, 27] },
    },
  },
  "3 Part Tenor/Bass": {
    numofParts: 3,
    parts: {
      Tenor:    { order: 2, smallName: "T",  clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [14, 23] },
      Baritone: { order: 1, smallName: "B1", clef: ClefType.Bass,          range: [2,  18], currentRange: [6,  16] },
      Bass:     { order: 0, smallName: "B2", clef: ClefType.Bass,          range: [2,  13], currentRange: [2,  11] },
    },
  },
  "2 Part Treble": {
    numofParts: 2,
    parts: {
      Soprano: { order: 1, smallName: "S", clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
      Alto:    { order: 0, smallName: "A", clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
    },
  },
  Unison: {
    numofParts: 1,
    parts: {
      Unison: { order: 0, smallName: "V", clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
    },
  },
};

const timeSignatures: TimeSignature[] = [
  { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
];

// ── Silence all console output during runs ─────────────────────────────────
function silence<T>(fn: () => T): T {
  const noop = () => {};
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = noop; console.warn = noop; console.error = noop;
  try { return fn(); } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error;
  }
}

// ── Deep-clone voicings so UIL range application doesn't bleed between tests ─
function cloneVoicings(): Record<string, PartsObject> {
  return JSON.parse(JSON.stringify(baseVoicings));
}

// ── Apply UIL preset ranges to a voicing clone ─────────────────────────────
function applyUILRanges(voicings: Record<string, PartsObject>, levelKey: string) {
  const preset = uilPresets[levelKey];
  if (!preset?.voiceRanges) return;
  for (const voicingDef of Object.values(voicings)) {
    for (const [partName, partDef] of Object.entries(voicingDef.parts)) {
      if (preset.voiceRanges![partName]) {
        partDef.currentRange = [...preset.voiceRanges![partName]] as [number, number];
      }
    }
  }
}

// ── Run N attempts for a single combination ────────────────────────────────
const ATTEMPTS_PER_COMBO = 10;
const ACCIDENTALS_BY_STEP_MODES = [false, true];

interface Result {
  level: string;
  key: string;
  voicing: string;
  timeSig: string;
  passes: number;
  failures: number;
  errors: string[];
}

const results: Result[] = [];
let totalPass = 0;
let totalFail = 0;

const allLevels = Object.keys(uilPresets);

for (const levelKey of allLevels) {
  const preset = uilPresets[levelKey];
  const voicings = cloneVoicings();
  applyUILRanges(voicings, levelKey);

  const allowedRhythms = allRhythms.filter(
    (r) => preset.allowedRhythmNames.includes(r.name) && !r.name.toLowerCase().includes("rest")
  );
  const allowedChords = fullChordSet.filter((c) => preset.allowedChordNames.includes(c.name));
  const measures = preset.measureRange[0]; // use minimum (fastest to generate)

  for (const key of preset.allowedKeys) {
    for (const voicingName of preset.allowedVoicings) {
      const partsObject = voicings[voicingName];
      if (!partsObject) {
        console.warn(`Voicing "${voicingName}" not found — skipping.`);
        continue;
      }

      for (const timeSig of timeSignatures) {
        for (const accidentalsByStep of ACCIDENTALS_BY_STEP_MODES) {
          const result: Result = {
            level: levelKey,
            key,
            voicing: voicingName,
            timeSig: timeSig.name,
            passes: 0,
            failures: 0,
            errors: [],
          };

          for (let attempt = 0; attempt < ATTEMPTS_PER_COMBO; attempt++) {
            try {
              silence(() =>
                generateChoralExercise({
                  key,
                  timeSig,
                  partsObject,
                  measures,
                  maxSkip: preset.maxSkip,
                  bpm: 80,
                  selectedRhythms: allowedRhythms,
                  chords: allowedChords,
                  accidentalsByStep,
                  nctProbability: 0.1,
                  allowedChordNames: preset.allowedChordNames,
                })
              );
              result.passes++;
              totalPass++;
            } catch (e: any) {
              result.failures++;
              totalFail++;
              const msg = e?.message ?? String(e);
              if (!result.errors.includes(msg)) result.errors.push(msg);
            }
          }

          results.push(result);
        }
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.failures > 0);
const passed = results.filter((r) => r.failures === 0);

console.log("\n═══════════════════════════════════════════════════════════");
console.log(`  Choral Generation Smoke Test`);
console.log(`  ${ATTEMPTS_PER_COMBO} attempts × ${results.length} combinations = ${ATTEMPTS_PER_COMBO * results.length} total`);
console.log("═══════════════════════════════════════════════════════════");
console.log(`  ✓ Passed: ${totalPass}  ✗ Failed: ${totalFail}`);
console.log(`  Combos with failures: ${failed.length} / ${results.length}`);
console.log("═══════════════════════════════════════════════════════════\n");

if (failed.length === 0) {
  console.log("  All combinations passed!\n");
} else {
  console.log("  FAILING COMBINATIONS:\n");
  for (const r of failed) {
    console.log(`  ✗ ${r.level} | ${r.key} | ${r.voicing} | ${r.timeSig}`);
    console.log(`    ${r.failures}/${ATTEMPTS_PER_COMBO} failed`);
    for (const err of r.errors) {
      console.log(`    → ${err}`);
    }
    console.log();
  }
}

// Summary table by level
console.log("  Results by level:");
for (const levelKey of allLevels) {
  const levelResults = results.filter((r) => r.level === levelKey);
  const lPass = levelResults.reduce((s, r) => s + r.passes, 0);
  const lFail = levelResults.reduce((s, r) => s + r.failures, 0);
  const lTotal = lPass + lFail;
  const pct = ((lPass / lTotal) * 100).toFixed(1);
  const mark = lFail === 0 ? "✓" : "✗";
  console.log(`  ${mark} ${levelKey}: ${lPass}/${lTotal} (${pct}%)`);
}
console.log();
