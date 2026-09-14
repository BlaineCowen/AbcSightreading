/**
 * Does every kind of exercise the app offers actually generate?
 *
 * Not a unit test: it walks the configuration space a user can actually reach -
 * every UIL level, with that level's own voicings, keys, chords, rhythms,
 * ranges and max skip, across every meter, texture and a spread of lengths -
 * and reports the failure rate per cell.
 *
 * It exists because narrow checks lie. Every earlier "0% failures" in this
 * project was measured at 4/4, eight bars, with hand-picked ranges; the first
 * sweep that walked the real space found 55%. A cell here is a thing a choir
 * director can select, so a cell that fails is an exercise someone cannot get.
 */
import { generateChoralExercise } from "../src/lib/generateChoral";
import { createNewSr } from "../src/lib/generateUnison";
import { uilPresets } from "../src/lib/uil-presets";
import { chords as fullChordSet } from "../src/resources/chords";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import { isSelectableRhythm, containsRest } from "../src/lib/selectable-rhythms";
import { canFillExercise } from "../src/lib/rhythm-feasibility";
import { ClefType } from "../src/lib/types";

const RUNS = Number(process.env.RUNS ?? 12);

/**
 * Eighths held to steps and repeats - ON, because that is what the app ships.
 *
 * It used to be opt-in via STEPWISE_EIGHTHS=1, which was right while the option
 * was off by default. It is on by default now, so a plain `bun run sweep` has
 * to sweep what a director actually gets: otherwise the headline figure reads
 * 0.05% while the exercises people generate fail at 1.76%, and the gate is
 * measuring something nobody uses. `STEPWISE_EIGHTHS=0` sweeps with it off.
 */
const STEPWISE = process.env.STEPWISE_EIGHTHS !== "0";

/**
 * Not a failure, a quality: how many short notes (an eighth or less) are
 * approached or left by skip, across the choral exercises that generated. With
 * the stepwise rule on it is about 1%; with STEPWISE_EIGHTHS=0 it is the
 * baseline, around 37%. A rest breaks the line, so the note beside one is not
 * counted against.
 */
const shortTally = { notes: 0, skipped: 0 };
function tallyShortNotes(voices: any[][]) {
  for (const voice of voices) {
    for (let k = 0; k < voice.length; k++) {
      const n = voice[k];
      if (n.rest || n.length > 4) continue;
      shortTally.notes++;
      const skips = (m: any) => m && !m.rest && Math.abs(m.pitchValue - n.pitchValue) > 1;
      if (skips(voice[k - 1]) || skips(voice[k + 1])) shortTally.skipped++;
    }
  }
}

/**
 * The generator narrates itself at length - every note, every retry. That is
 * useful when chasing one exercise and ruinous across thousands: it dominated
 * the runtime and buried the report. Kept for the report itself.
 */
const realLog = console.log;
const quiet = { log: () => {}, warn: () => {}, error: () => {} };
function silenced<T>(fn: () => T): T {
  const { log, warn, error } = console;
  Object.assign(console, quiet);
  try { return fn(); } finally { Object.assign(console, { log, warn, error }); }
}

const TIME_SIGS: Record<string, any> = {
  "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
  "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
  "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
};

/** The component's voicing table, verbatim - this is what a user can pick. */
const VOICINGS: Record<string, any> = {
  "4 Part Mixed": { numofParts: 4, parts: {
    Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Alto: { order: 2, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] },
    Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
    Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,24], currentRange: [9,18] } } },
  "3 Part Mixed": { numofParts: 3, parts: {
    Soprano: { order: 2, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Alto: { order: 1, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] },
    Baritone: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,26], currentRange: [9,18] } } },
  "3 Part Treble": { numofParts: 3, parts: {
    Soprano1: { order: 2, smallName: "S1", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Soprano2: { order: 1, smallName: "S2", clef: ClefType.Treble, range: [18,32], currentRange: [22,29] },
    Alto: { order: 0, smallName: "A", clef: ClefType.Treble, range: [14,30], currentRange: [21,27] } } },
  "3 Part Tenor/Bass": { numofParts: 3, parts: {
    Tenor: { order: 2, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
    Baritone: { order: 1, smallName: "B1", clef: ClefType.Bass, range: [2,26], currentRange: [6,16] },
    Bass: { order: 0, smallName: "B2", clef: ClefType.Bass, range: [2,24], currentRange: [2,11] } } },
  "2 Part Treble": { numofParts: 2, parts: {
    Soprano: { order: 1, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
    Alto: { order: 0, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] } } },
  "2 Part Tenor/Bass": { numofParts: 2, parts: {
    Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
    Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,24], currentRange: [9,18] } } },
};

const choralSelectable = (r: any) =>
  isSelectableRhythm(r) && !(r.pattern === true && containsRest(r));

/** What the level actually hands the generator, as applyUILPreset builds it. */
function presetVoicing(voicingName: string, preset: any) {
  const base = VOICINGS[voicingName];
  if (!base) return null;
  const parts: Record<string, any> = {};
  for (const [name, def] of Object.entries<any>(base.parts)) {
    const r = preset.voiceRanges?.[name];
    parts[name] = { ...def, currentRange: r ? [...r] : [...def.currentRange] };
  }
  return { numofParts: base.numofParts, parts };
}

type Cell = { label: string; runs: number; fails: number; errors: Set<string> };
const cells: Cell[] = [];

function run(label: string, make: () => void) {
  const cell: Cell = { label, runs: RUNS, fails: 0, errors: new Set() };
  for (let i = 0; i < RUNS; i++) {
    try { silenced(make); } catch (e: any) {
      cell.fails++;
      cell.errors.add(String(e?.message ?? e).slice(0, 80));
    }
  }
  cells.push(cell);
  return cell;
}

// ----------------------------------------------------------------- choral
for (const [levelName, preset] of Object.entries<any>(uilPresets)) {
  const rhythms = allRhythms.filter(
    (r) => preset.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest
  );
  for (const voicingName of preset.allowedVoicings) {
    const partsObject = presetVoicing(voicingName, preset);
    if (!partsObject) { realLog(`!! unknown voicing ${voicingName} in ${levelName}`); continue; }
    for (const tsName of Object.keys(TIME_SIGS)) {
      const timeSig = TIME_SIGS[tsName];
      const usable = rhythms.filter((r) => r.totalValue <= timeSig.tsPerMeasure);
      // The measure picker offers exactly these. The levels declare 24-56, but
      // the component pins to 8 and offers no more than 16 - sweeping 48 would
      // be testing an exercise nobody can ask for, and they are the slow ones.
      for (const measures of [2, 4, 8, 16]) {
        if (!usable.length || !canFillExercise(usable, timeSig.tsPerMeasure, measures * timeSig.tsPerMeasure)) {
          continue; // the UI will not let this be generated either
        }
        for (const key of preset.allowedKeys) {
          run(`${levelName} | ${voicingName} | ${key} | ${tsName} | ${measures}m`, () => {
            tallyShortNotes(generateChoralExercise({
              key, timeSig, partsObject, measures,
              maxSkip: preset.maxSkip, bpm: 72, selectedRhythms: usable,
              chords: fullChordSet, accidentalsByStep: true, nctProbability: 0.25,
              chromaticFrequency: 1, allowedChordNames: preset.allowedChordNames,
              voiceTexture: "full", stepwiseEighths: STEPWISE,
            } as any).voiceNotes);
          });
        }
      }
    }
  }
}

// --------------------------------------------------------------- textures
const l5 = uilPresets["UIL 5"];
for (const voiceTexture of ["full", "staggered", "independent"]) {
  for (const voicingName of l5.allowedVoicings) {
    const partsObject = presetVoicing(voicingName, l5);
    const usable = allRhythms.filter(
      (r) => l5.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest
    );
    run(`texture ${voiceTexture} | ${voicingName} | 16m`, () => {
      generateChoralExercise({
        key: "C", timeSig: TIME_SIGS["4/4"], partsObject, measures: 16,
        maxSkip: l5.maxSkip, bpm: 72, selectedRhythms: usable, chords: fullChordSet,
        accidentalsByStep: true, nctProbability: 0.25, chromaticFrequency: 3,
        allowedChordNames: l5.allowedChordNames, voiceTexture,
        stepwiseEighths: STEPWISE,
      } as any);
    });
  }
}

// ----------------------------------------------------------------- unison
const UNISON_RHYTHMS = ["quarter", "half", "eighthEighth", "dotHalf"];
for (const rhythmOnly of [false, true]) {
  for (const tsName of Object.keys(TIME_SIGS)) {
    for (const clef of ["treble", "bass", "alto", "tenor"]) {
      for (const measures of [1, 2, 4, 8, 16]) {
        if (rhythmOnly && clef !== "treble") continue; // one staff, one clef
        run(`unison ${rhythmOnly ? "rhythm" : "pitched"} | ${clef} | ${tsName} | ${measures}m`, () => {
          createNewSr({
            bpm: 60, clef, selectedClef: clef,
            timeSig: TIME_SIGS[tsName], selectedTimeSignature: tsName,
            measures, maxSkip: 4, tempo: 60, range: { min: 14, max: 21 },
            selectedRhythms: UNISON_RHYTHMS,
            rhythms: allRhythms.filter((r) => UNISON_RHYTHMS.includes(r.name)),
            scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]),
            key: "C", chords: ["1", "2", "3", "4", "5", "6", "7"],
            showSolfege: !rhythmOnly, rhythmOnly,
            showRhythmSyllables: true, syllableSystemId: "kodaly",
            partsObject: { numofParts: 1, parts: { Unison: {
              chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
          } as any);
        });
      }
    }
  }
}

// ------------------------------------------------------------------ report
const bad = cells.filter((c) => c.fails > 0).sort((a, b) => b.fails - a.fails);
const totalRuns = cells.reduce((s, c) => s + c.runs, 0);
const totalFails = cells.reduce((s, c) => s + c.fails, 0);
realLog("\n=== SWEEP ===");
realLog(`${cells.length} cells, ${totalRuns} exercises, ${RUNS} per cell`);
realLog(`failures: ${totalFails} (${((totalFails / totalRuns) * 100).toFixed(2)}%)`);
realLog(`cells with any failure: ${bad.length}`);
realLog(`stepwise eighths: ${STEPWISE ? "on" : "off"}`);
realLog(
  `short notes: ${shortTally.notes}, approached/left by skip: ${shortTally.skipped} ` +
    `(${((shortTally.skipped / Math.max(shortTally.notes, 1)) * 100).toFixed(1)}%)`
);
if (bad.length) {
  realLog("\nworst cells:");
  for (const c of bad.slice(0, 25)) {
    realLog(`  ${Math.round((c.fails / c.runs) * 100).toString().padStart(3)}%  ${c.label}`);
    for (const e of c.errors) realLog(`         ${e}`);
  }
}
