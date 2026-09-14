/**
 * How often do two voices suspend TOGETHER?
 *
 * `tandem_nct.py` reports 0.0% here and is wrong. It infers the chord at each
 * sampling point from the notes sounding there - which include the suspension
 * itself - so music21 spells a roman numeral that contains the dissonance and
 * the suspension is never flagged as a non-chord tone. Suspensions land exactly
 * on the chord change, i.e. exactly on the sampling point, so they are absorbed
 * systematically rather than occasionally. Passing tones fall between sampling
 * points and survive, which is why that script sees decoration at all.
 *
 * This works on the generator's own note and chord data instead, so nothing is
 * inferred: a suspension is a note that repeats the pitch before it, is not a
 * chord tone of the chord it is held into, and resolves down by step onto one.
 */
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { isSelectableRhythm, containsRest } from "../../src/lib/selectable-rhythms";
import { ClefType } from "../../src/lib/types";
import type { Chord, Rhythm, VoiceNote } from "../../src/lib/types";

const SATB = { numofParts: 4, parts: {
  Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
  Alto: { order: 2, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] },
  Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
  Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,24], currentRange: [9,18] } } } as any;

type Onset = { t: number; note: VoiceNote; prev: VoiceNote | null; next: VoiceNote | null };

const timeline = (v: VoiceNote[]): Onset[] => {
  const out: Onset[] = [];
  let t = 0;
  for (let i = 0; i < v.length; i++) {
    out.push({ t, note: v[i], prev: v[i - 1] ?? null, next: v[i + 1] ?? null });
    t += v[i].length;
  }
  return out;
};

/**
 * When each chord begins, in 32nd-note units.
 *
 * Recovered from the rhythm rather than from the notes: decoration subdivides
 * notes per voice, so the onsets common to all voices are a SUPERSET of the
 * chord boundaries (36 chords against 44 common onsets in a typical 16-bar
 * exercise) and cannot be matched up by counting. This walks the rhythm the
 * exercise was actually built from, consuming one chord per step exactly as
 * `generateChoralExercise` does when it decides how many chords to ask for -
 * a rest takes none, and a multi-note pattern takes one for the whole figure.
 */
function chordBoundaries(steps: Rhythm[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const step of steps) {
    const takesAChord = !step.rest && (!step.isPatternNote || step.isPatternStart);
    if (takesAChord) starts.push(t);
    t += step.totalValue;
  }
  return starts;
}

/** The chord sounding at `t` - the last one to have begun at or before it. */
const chordAt = (bounds: number[], prog: Chord[], t: number): Chord | null => {
  for (let i = bounds.length - 1; i >= 0; i--) if (t >= bounds[i]) return prog[i] ?? null;
  return null;
};

/** Is this onset a suspension - prepared, dissonant, resolving down by step? */
function isSuspension(e: Onset, chord: Chord | null): boolean {
  if (!chord || !e.prev || !e.next) return false;
  if (e.note.rest || e.prev.rest || e.next.rest) return false;
  if (e.note.pitchValue !== e.prev.pitchValue) return false;      // prepared: held over
  if (chord.triadNotes.includes(e.note.degree)) return false;      // dissonant against it
  if (e.next.pitchValue !== e.note.pitchValue - 1) return false;   // resolves down by step
  return chord.triadNotes.includes(e.next.degree);                 // onto a chord tone
}

const RUNS = Number(process.argv[2] ?? 40);
const p: any = (uilPresets as any)["UIL 5"];
const rhythms = allRhythms.filter(
  (r) => p.allowedRhythmNames.includes(r.name) && isSelectableRhythm(r) &&
         !(r.pattern === true && containsRest(r)) && !r.rest);

let exercises = 0, suspensions = 0, doubles = 0, unaligned = 0, repeatsNotSusp = 0;
const quiet = { log: () => {}, warn: () => {}, error: () => {} };
const real = { log: console.log, warn: console.warn, error: console.error };

for (let i = 0; i < RUNS; i++) {
  Object.assign(console, quiet);
  let out: any = null;
  try {
    out = generateChoralExercise({
      key: "C", timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
      partsObject: SATB, measures: 16, maxSkip: p.maxSkip, bpm: 72,
      selectedRhythms: rhythms, chords: fullChordSet, accidentalsByStep: true,
      nctProbability: 0.25, chromaticFrequency: 1,
      allowedChordNames: p.allowedChordNames, voiceTexture: "full",
    } as any);
  } catch { /* a failed generation is not this script's subject */ }
  Object.assign(console, real);
  if (!out) continue;
  exercises++;

  const lines = (out.voiceNotes as VoiceNote[][]).map(timeline);
  const bounds = chordBoundaries(out.rhythmSteps as Rhythm[]);
  // If the rhythm does not account for exactly the chords that were generated,
  // the mapping is wrong and every number below it would be fiction.
  if (bounds.length !== out.chordProgression.length) { unaligned++; continue; }

  const susp = lines.map((tl) => {
    const hits: number[] = [];
    for (const e of tl) {
      const held = e.prev && !e.note.rest && !e.prev.rest && e.note.pitchValue === e.prev.pitchValue;
      if (!held) continue;
      if (isSuspension(e, chordAt(bounds, out.chordProgression, e.t))) hits.push(e.t);
      else repeatsNotSusp++;
    }
    return hits;
  });
  suspensions += susp.reduce((n, s) => n + s.length, 0);
  for (let a = 0; a < susp.length; a++)
    for (let b = a + 1; b < susp.length; b++)
      for (const t of susp[a]) if (susp[b].includes(t)) doubles++;
}

console.log(`${exercises} exercises (${unaligned} skipped: chords did not align to onsets)`);
console.log(`  repeated pitches that are NOT suspensions: ${repeatsNotSusp}`);
console.log(`  suspensions:                               ${suspensions}`);
console.log(`  of those, paired as double suspensions:    ${doubles}` +
  (suspensions ? `  (${(100 * doubles / suspensions).toFixed(1)}% of suspensions)` : ""));
console.log(`  double suspensions per exercise:           ${(doubles / Math.max(exercises, 1)).toFixed(2)}`);
