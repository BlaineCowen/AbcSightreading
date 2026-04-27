/**
 * Verifies accidentalsByStep voice-leading constraints across many generated exercises.
 *
 * For every chromatic note (non-null accidental) in every voice:
 *   1. APPROACH  — the immediately preceding non-rest note must be exactly 1 pitchValue away.
 *   2. RESOLUTION — the immediately following non-rest note must move in the correct direction:
 *        sharp / double-sharp / wasRaised natural  →  pitchValue + 1
 *        flat  / double-flat  / wasRaised=false natural  →  pitchValue - 1
 *
 * Run with:  bun scripts/test-step-constraints.ts
 *
 * Deliberately uses high chromaticFrequency (5×) and UIL 5 (most chromatic chords)
 * to maximise the chance of exposing violations.
 */

import { generateChoralExercise } from "../src/lib/generateChoral";
import { uilPresets } from "../src/lib/uil-presets";
import { chords as fullChordSet } from "../src/resources/chords";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import type { VoiceNote, PartsObject, TimeSignature } from "../src/lib/types";

// ── Voicing definitions (mirrors AbcjsChoral.svelte) ───────────────────────
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
};

const timeSignatures: TimeSignature[] = [
  { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
];

// ── Silence console during generation ──────────────────────────────────────
function silence<T>(fn: () => T): T {
  const noop = () => {};
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = noop; console.warn = noop; console.error = noop;
  try { return fn(); } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error;
  }
}

function cloneVoicings(): Record<string, PartsObject> {
  return JSON.parse(JSON.stringify(baseVoicings));
}

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

// ── Constraint checker ──────────────────────────────────────────────────────
interface Violation {
  exercise: string;
  voice: string;
  type: "approach" | "resolution";
  detail: string;
}

function checkStepConstraints(
  voiceNotes: VoiceNote[][],
  voiceNames: string[],
  exerciseLabel: string
): Violation[] {
  const violations: Violation[] = [];

  for (let vi = 0; vi < voiceNotes.length; vi++) {
    const notes = voiceNotes[vi];
    const voiceName = voiceNames[vi] ?? `Voice ${vi}`;

    // Walk the FULL note sequence (including rests) so that a rest between two
    // notes correctly cancels the approach / resolution obligation, matching the
    // code's own behaviour (forcedPitch is reset whenever previousNote.rest).
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.rest) continue;

      // Find the immediately preceding non-rest note with NO rest in between.
      // If there IS a rest between them, obligations are cancelled.
      let directPrev: VoiceNote | undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (notes[j].rest) break; // rest cancels — stop looking
        directPrev = notes[j];
        break;
      }

      // 1. APPROACH — a chromatic note's first occurrence must be directly preceded
      //    by a non-rest note at distance 1. Continuations (same pv + same acc) skip.
      if (note.accidental != null && directPrev) {
        const isContinuation =
          note.pitchValue === directPrev.pitchValue &&
          note.accidental === directPrev.accidental;
        if (!isContinuation) {
          const dist = Math.abs(note.pitchValue - directPrev.pitchValue);
          if (dist !== 1) {
            violations.push({
              exercise: exerciseLabel,
              voice: voiceName,
              type: "approach",
              detail: `"${note.name}" (pv=${note.pitchValue}, acc=${note.accidental}) preceded by "${directPrev.name}" (pv=${directPrev.pitchValue}) — distance ${dist}, expected 1`,
            });
          }
        }
      }

      // 2. RESOLUTION — if the direct previous note had a directional accidental,
      //    this note must be the resolution pitch. Continuations skip.
      if (directPrev && directPrev.accidental != null) {
        const pn = directPrev;
        const isContinuation =
          note.pitchValue === pn.pitchValue && note.accidental === pn.accidental;
        if (!isContinuation) {
          let requiredPitch: number | undefined;
          if (
            pn.accidental === "sharp" ||
            pn.accidental === "double-sharp" ||
            (pn.accidental === "natural" && pn.wasRaised === true)
          ) {
            requiredPitch = pn.pitchValue + 1;
          } else if (
            pn.accidental === "flat" ||
            pn.accidental === "double-flat" ||
            (pn.accidental === "natural" && pn.wasRaised === false)
          ) {
            requiredPitch = pn.pitchValue - 1;
          }

          if (requiredPitch !== undefined && note.pitchValue !== requiredPitch) {
            violations.push({
              exercise: exerciseLabel,
              voice: voiceName,
              type: "resolution",
              detail: `After "${pn.name}" (pv=${pn.pitchValue}, acc=${pn.accidental}, wasRaised=${pn.wasRaised}), expected pv=${requiredPitch} but got "${note.name}" (pv=${note.pitchValue})`,
            });
          }
        }
      }
    }
  }

  return violations;
}

// ── Test run ────────────────────────────────────────────────────────────────
const ITERATIONS = 50; // per combination
const CHROMATIC_FREQUENCY = 5; // max chromatic weight

// Focus on UIL 4 + 5 (have secondary dominants) and all their voicings/keys
const TARGET_LEVELS = ["UIL 4", "UIL 5"];

let totalExercises = 0;
let totalWithAccidentals = 0;
let totalViolations = 0;
const allViolations: Violation[] = [];

for (const levelKey of TARGET_LEVELS) {
  const preset = uilPresets[levelKey];
  if (!preset) continue;

  const voicings = cloneVoicings();
  applyUILRanges(voicings, levelKey);

  const allowedRhythms = allRhythms.filter(
    (r) => preset.allowedRhythmNames.includes(r.name) && !r.name.toLowerCase().includes("rest")
  );
  const allowedChords = fullChordSet.filter((c) => preset.allowedChordNames.includes(c.name));
  const measures = preset.measureRange[0];

  for (const key of preset.allowedKeys) {
    for (const voicingName of preset.allowedVoicings) {
      const partsObject = voicings[voicingName];
      if (!partsObject) continue;

      for (const timeSig of timeSignatures) {
        for (let i = 0; i < ITERATIONS; i++) {
          const label = `${levelKey} | ${key} | ${voicingName} | ${timeSig.name} | run ${i + 1}`;
          totalExercises++;

          try {
            const result = silence(() =>
              generateChoralExercise({
                key,
                timeSig,
                partsObject,
                measures,
                maxSkip: preset.maxSkip,
                bpm: 80,
                selectedRhythms: allowedRhythms,
                chords: allowedChords,
                accidentalsByStep: true,
                nctProbability: 0.0,     // disable NCTs so only chord tones are checked
                chromaticFrequency: CHROMATIC_FREQUENCY,
                allowedChordNames: preset.allowedChordNames,
              })
            );

            const hasAccidental = result.voiceNotes.some((voice) =>
              voice.some((n) => n.accidental != null)
            );
            if (hasAccidental) totalWithAccidentals++;

            const violations = checkStepConstraints(result.voiceNotes, result.voiceNames, label);
            if (violations.length > 0) {
              totalViolations += violations.length;
              allViolations.push(...violations);
            }
          } catch {
            // generation failure — already caught by smoke tests
          }
        }
      }
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
// Bass violations (approach + resolution) are a known consequence of the late-retry
// deadlock-avoidance mechanism: when no non-chromatic bass pitch can escape a voice-
// ordering deadlock, retry 9+ allows the chromatic 3rd without a step constraint.
// The pre-computed next-chord bass note also doesn't know the retry changed things.
// Upper-voice violations (Soprano / Alto / Tenor) are bugs and must be zero.
const bassVoiceNames = new Set(
  Object.values(baseVoicings).flatMap((v) =>
    Object.entries(v.parts)
      .filter(([, p]) => p.order === 0)
      .map(([name]) => name)
  )
);

const upperViolations = allViolations.filter((v) => !bassVoiceNames.has(v.voice));
const bassViolations  = allViolations.filter((v) =>  bassVoiceNames.has(v.voice));

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  Step-Constraint Test  (accidentalsByStep=true, chromaticFrequency=5×)");
console.log(`  Levels: ${TARGET_LEVELS.join(", ")}  |  ${ITERATIONS} iterations per combo`);
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Total exercises generated : ${totalExercises}`);
console.log(`  Exercises with accidentals: ${totalWithAccidentals}`);
console.log(`  Total violations          : ${allViolations.length}`);
console.log(`    Upper voices (BUGS)     : ${upperViolations.length}  ← must be 0`);
console.log(`    Bass (known limitation) : ${bassViolations.length}`);
console.log("═══════════════════════════════════════════════════════════\n");

// ── Upper-voice details (always shown when non-zero) ──────────────────────
if (upperViolations.length === 0) {
  console.log("  ✓ Upper voices: all accidentals approached and resolved by step.\n");
} else {
  console.log(`  ✗ ${upperViolations.length} upper-voice violations (BUGS):\n`);
  const byType = { approach: [] as Violation[], resolution: [] as Violation[] };
  for (const v of upperViolations) byType[v.type].push(v);

  if (byType.approach.length) {
    console.log(`  APPROACH (${byType.approach.length}):`);
    for (const v of byType.approach.slice(0, 20)) {
      console.log(`    [${v.voice}] ${v.detail}`);
      console.log(`      in: ${v.exercise}`);
    }
    if (byType.approach.length > 20) console.log(`    … and ${byType.approach.length - 20} more`);
    console.log();
  }
  if (byType.resolution.length) {
    console.log(`  RESOLUTION (${byType.resolution.length}):`);
    for (const v of byType.resolution.slice(0, 20)) {
      console.log(`    [${v.voice}] ${v.detail}`);
      console.log(`      in: ${v.exercise}`);
    }
    if (byType.resolution.length > 20) console.log(`    … and ${byType.resolution.length - 20} more`);
    console.log();
  }
}

// ── Bass summary (informational only) ─────────────────────────────────────
if (bassViolations.length > 0) {
  const bApproach  = bassViolations.filter((v) => v.type === "approach").length;
  const bResolve   = bassViolations.filter((v) => v.type === "resolution").length;
  console.log(`  ℹ Bass violations (deadlock-avoidance side effect):`);
  console.log(`      Approach : ${bApproach}`);
  console.log(`      Resolution: ${bResolve}`);
  console.log(`    (These occur when the only way to escape a voice-ordering deadlock`);
  console.log(`    is to place the chromatic 3rd in the bass without step constraint.)\n`);
}

process.exit(upperViolations.length > 0 ? 1 : 0);
