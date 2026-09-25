/**
 * Does every step of the ladder (src/lib/ladder.ts) generate?
 *
 * A step that fails is worse than a missing one: a class working up the ladder
 * stops there. Each step is run in every voicing, key and meter it allows (and
 * each clef, for unison), at the length it starts at and at 16 bars, and the
 * failure rate is reported per cell. It also checks the step's settings name
 * real rhythms, chords, keys and voicings - a typo there would be a step that
 * silently drops what it was meant to teach.
 *
 *   bun run scripts/check-ladder.ts        (RUNS=20 by default)
 *   STEP=parts-four bun run scripts/check-ladder.ts   (steps whose id contains it)
 */
import { generateChoralExercise } from "../src/lib/generateChoral";
import { createNewSr } from "../src/lib/generateUnison";
import { ladder, rangeForStep } from "../src/lib/ladder";
import { chords as fullChordSet } from "../src/resources/chords";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import { keySignatures } from "../src/resources/key-signatures";
import { selectableRhythms } from "../src/lib/selectable-rhythms";
import { TIME_SIGS, VOICINGS, choralSelectable, presetVoicing } from "./generation-fixtures";

const RUNS = Number(process.env.RUNS ?? 20);
const log = console.log;
const quiet = { log: () => {}, warn: () => {}, error: () => {} };
function silenced<T>(fn: () => T): T {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, quiet);
  try { return fn(); } finally { Object.assign(console, saved); }
}

const problems: string[] = [];
const rows: { label: string; fails: number; runs: number; error?: string }[] = [];

function run(label: string, make: () => void) {
  let fails = 0;
  let error: string | undefined;
  for (let i = 0; i < RUNS; i++) {
    try { silenced(make); } catch (e: any) {
      fails++;
      error ??= String(e?.message ?? e).slice(0, 90);
    }
  }
  rows.push({ label, fails, runs: RUNS, error });
}

const rhythmNames = new Set(allRhythms.map((r) => r.name));
const chordNames = new Set(fullChordSet.map((c: any) => c.name));
const UNISON_RANGES: Record<string, { min: number; max: number }> = {
  treble: { min: 14, max: 21 },
  bass: { min: 7, max: 14 },
};

const ONLY = process.env.STEP;
const steps = ladder.filter((s) => !ONLY || s.id.includes(ONLY));

for (const step of steps) {
  const tag = `${String(step.number).padStart(2)} ${step.id}`;
  const started = Date.now();
  const before = rows.length;

  if (step.unison) {
    const u = step.unison;
    for (const n of u.selectedRhythms) if (!rhythmNames.has(n)) problems.push(`${tag}: unknown rhythm ${n}`);
    if (u.selectedKey && !keySignatures[u.selectedKey]) problems.push(`${tag}: unknown key ${u.selectedKey}`);
    const rhythms = selectableRhythms.filter((r) => u.selectedRhythms.includes(r.name));
    if (rhythms.length !== u.selectedRhythms.length) {
      problems.push(`${tag}: a rhythm the Unison page does not offer`);
    }
    for (const clef of u.rhythmOnly ? ["treble"] : ["treble", "bass"]) {
      for (const measures of [...new Set([u.measures, 16])]) {
        const range = rangeForStep(u, UNISON_RANGES[clef]) ?? UNISON_RANGES[clef];
        run(`${tag} | unison ${clef} | ${u.selectedTimeSignature} | ${measures}m`, () => {
          const result = createNewSr({
            bpm: 60, clef, selectedClef: clef,
            timeSig: TIME_SIGS[u.selectedTimeSignature], selectedTimeSignature: u.selectedTimeSignature,
            measures, maxSkip: u.maxSkip ?? 4, tempo: 60, range,
            rhythms, selectedRhythms: u.selectedRhythms,
            scaleDegrees: u.selectedScaleDegrees ?? [1, 3, 5],
            selectedSharpDegrees: [], selectedFlatDegrees: [],
            key: u.selectedKey ?? "C", showSolfege: !u.rhythmOnly, lyricSystem: "movable",
            rhythmOnly: u.rhythmOnly, showRhythmSyllables: true, syllableSystemId: "kodaly",
            allowTiesAcrossBarline: false, moveOnEighthNotes: u.moveEighthNotes, accidentalsFollowStep: true,
            partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
          } as any);
          if (u.rhythmOnly) return;
          // Generating is not enough: a line pinned to one note "succeeds".
          // It must stay in the step's range and actually move.
          const notes = (result?.[2]?.partsObject?.parts?.Unison?.chordNoteObject ?? [])
            .filter((n: any) => !n.rhythm?.rest);
          const pitches = new Set(notes.map((n: any) => n.pitchValue));
          const outside = notes.filter((n: any) => n.pitchValue < range.min || n.pitchValue > range.max);
          if (outside.length) throw new Error(`notes outside ${range.min}-${range.max}`);
          if (pitches.size < Math.min(3, u.selectedScaleDegrees?.length ?? 3)) {
            throw new Error(`only ${pitches.size} distinct pitches`);
          }
        });
      }
    }
  }

  if (step.choral) {
    const c = step.choral;
    for (const n of c.selectedRhythmNames) {
      if (!rhythmNames.has(n)) problems.push(`${tag}: unknown rhythm ${n}`);
      if (!c.allowedRhythmNames.includes(n)) problems.push(`${tag}: ${n} selected but not allowed`);
    }
    for (const n of c.allowedChordNames) if (!chordNames.has(n)) problems.push(`${tag}: unknown chord ${n}`);
    for (const k of c.allowedKeys) if (!keySignatures[k]) problems.push(`${tag}: unknown key ${k}`);
    for (const v of c.allowedVoicings) if (!VOICINGS[v]) problems.push(`${tag}: unknown voicing ${v}`);
    const rhythms = allRhythms.filter(
      (r) => c.selectedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest
    );
    for (const voicing of c.allowedVoicings) {
      const partsObject = presetVoicing(voicing, c);
      if (!partsObject) continue;
      for (const meter of c.allowedMeters) {
        const timeSig = TIME_SIGS[meter];
        const usable = rhythms.filter((r) => r.totalValue <= timeSig.tsPerMeasure);
        for (const measures of [...new Set([c.measures, 16])]) {
          for (const key of c.allowedKeys) {
            run(`${tag} | ${voicing} | ${key} | ${meter} | ${measures}m`, () => {
              generateChoralExercise({
                key, timeSig, partsObject, measures,
                maxSkip: c.maxSkip, bpm: 72, selectedRhythms: usable,
                chords: fullChordSet, accidentalsByStep: true, nctProbability: 0.1,
                chromaticFrequency: 1, allowedChordNames: c.allowedChordNames,
                voiceTexture: c.voiceTexture ?? "full", stepwiseEighths: true,
              } as any);
            });
          }
        }
      }
    }
  }
  const mine = rows.slice(before);
  const runs = mine.reduce((a, r) => a + r.runs, 0);
  const fails = mine.reduce((a, r) => a + r.fails, 0);
  log(`${tag.padEnd(34)} ${String(mine.length).padStart(3)} cells ` +
    `${((fails / Math.max(runs, 1)) * 100).toFixed(1).padStart(5)}% failed  ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

// ── Report, per step and then the worst cells
// (each step also prints as it finishes, above) ────────────────────────────────
log(`\n=== LADDER (${RUNS} runs per cell) ===`);
for (const step of steps) {
  const tag = `${String(step.number).padStart(2)} ${step.id}`;
  const mine = rows.filter((r) => r.label.startsWith(tag + " |"));
  const runs = mine.reduce((s, r) => s + r.runs, 0);
  const fails = mine.reduce((s, r) => s + r.fails, 0);
  log(`${tag.padEnd(34)} ${step.page.padEnd(7)} ${String(mine.length).padStart(3)} cells  ` +
    `${((fails / Math.max(runs, 1)) * 100).toFixed(1).padStart(5)}% failed`);
}
const bad = rows.filter((r) => r.fails).sort((a, b) => b.fails / b.runs - a.fails / a.runs);
if (bad.length) {
  log("\nworst cells:");
  for (const r of bad.slice(0, 30)) {
    log(`  ${Math.round((r.fails / r.runs) * 100).toString().padStart(3)}%  ${r.label}\n        ${r.error}`);
  }
}
if (problems.length) {
  log("\nPROBLEMS:");
  for (const p of problems) log("  " + p);
  process.exit(1);
}
