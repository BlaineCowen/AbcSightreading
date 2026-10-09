/**
 * Every piano level in every key and meter it offers, at 4, 8 and 16 bars,
 * RUNS times each (default 20): does it generate, and does it keep the rules?
 *
 *   - every bar full in both hands; no parallel fifths or octaves between the
 *     tune and the bass (pianoFault)
 *   - the tune inside the right hand's position
 *   - where a chord starts, the tune is on one of its notes
 *   - the left hand only ever plays the chord's notes
 *   - right-hand second notes only at level 8, under the tune
 *
 * And the numbers measured on Sight Reading Factory's piano levels
 * (notes/srf-piano-study.md): the bass on the chord's root where a chord
 * starts, and a 2nd or 7th sounding between the hands.
 *
 *   bun run scripts/check-piano.ts          RUNS=40 LEVEL=piano-05
 */
import { generatePianoExercise, type PianoExercise } from "../src/lib/piano/generatePiano";
import { PIANO_LEVELS } from "../src/lib/piano/levels";
import { chordDegrees, degreeOf, rightHandPosition } from "../src/lib/piano/voicing";
import { splitAt } from "../src/lib/unison-progressions";
import { beatUnitOf, timeSignatureFor } from "../src/lib/meter";
import { keySignatures } from "../src/resources/key-signatures";

const RUNS = Number(process.env.RUNS ?? 20);
const ONLY = process.env.LEVEL;
const quiet = { log: console.log, warn: console.warn };

type Ev = { start: number; end: number; pitches: number[] };
function events(notes: PianoExercise["rh"]): Ev[] {
  let t = 0;
  return notes.map((n) => {
    const e = { start: t, end: t + n.length, pitches: n.rest ? [] : n.pitches };
    t += n.length;
    return e;
  });
}
const at = (evs: Ev[], t: number) => evs.find((e) => e.start <= t && t < e.end);

const LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11];
function semitone(key: string, pv: number): number {
  const ks = keySignatures[key];
  const deg = degreeOf(key, pv);
  const alter = ks.sharps.includes(deg) ? 1 : ks.flats.includes(deg) ? -1 : 0;
  return Math.floor(pv / 7) * 12 + LETTER_SEMI[pv % 7] + alter;
}

let failures = 0;
let problems = 0;
for (const level of PIANO_LEVELS) {
  if (ONLY && level.id !== ONLY) continue;
  const stat = { n: 0, spans: 0, root: 0, moments: 0, clash: 0, beats: 0, beatClash: 0, thirds: 0 };
  for (const key of level.keys) for (const meter of level.meters) for (const measures of [4, 8, 16]) {
    const barUnits = timeSignatureFor(meter).tsPerMeasure;
    const beat = beatUnitOf(meter);
    const pos = rightHandPosition(key, level.reach);
    for (let i = 0; i < RUNS; i++) {
      let ex: PianoExercise;
      Object.assign(console, { log() {}, warn() {} });
      try {
        ex = generatePianoExercise({ levelId: level.id, key, meter, measures });
      } catch (e) {
        Object.assign(console, quiet);
        failures++;
        console.log(`FAIL ${level.id} ${key} ${meter} ${measures}: ${e instanceof Error ? e.message : e}`);
        continue;
      } finally {
        Object.assign(console, quiet);
      }
      stat.n++;
      const say = (what: string) => {
        problems++;
        if (problems <= 30) console.log(`${level.id} ${key} ${meter} ${measures}: ${what}\n${ex.abc}`);
      };
      const rh = events(ex.rh), lh = events(ex.lh);
      for (const e of rh) {
        if (!e.pitches.length) continue;
        const top = Math.max(...e.pitches);
        if (top < pos.low || top > pos.high) say(`tune outside its position at ${e.start}`);
        if (e.pitches.length > 1 && !level.rightHandThirds) say(`a right-hand chord at level ${level.number}`);
      }
      // Chord spans: where each starts, the tune is on a chord note and the left hand plays only chord notes.
      const first = splitAt(barUnits, beat);
      let t = 0;
      for (const bar of ex.harmony) {
        const spans = bar.length === 1 ? [[bar[0], 0, barUnits]] : [[bar[0], 0, first], [bar[1], first, barUnits]];
        for (const [name, from, to] of spans as [string, number, number][]) {
          const tones = chordDegrees(name);
          const r = at(rh, t + from);
          if (r && r.pitches.length && r.start === t + from && !r.pitches.every((p) => tones.includes(degreeOf(key, p)))) say(`tune off ${name} where it starts, bar ${t / barUnits + 1}`);
          if (level.together) for (const e of lh) if (e.start >= t + from && e.start < t + to && !e.pitches.every((p) => tones.includes(degreeOf(key, p)))) say(`left hand off ${name}, bar ${t / barUnits + 1}`);
          const l = at(lh, t + from);
          if (l && l.pitches.length && level.together) {
            stat.spans++;
            if (degreeOf(key, Math.min(...l.pitches)) === tones[0]) stat.root++;
          }
        }
        t += barUnits;
      }
      // Every moment both hands sound: a 2nd or a 7th between them?
      const starts = [...new Set([...rh, ...lh].map((e) => e.start))];
      for (const s of starts) {
        const a = at(rh, s), b = at(lh, s);
        if (!a?.pitches.length || !b?.pitches.length) continue;
        stat.moments++;
        const clash = a.pitches.some((x) => b.pitches.some((y) => [1, 2, 10, 11].includes(Math.abs(semitone(key, x) - semitone(key, y)) % 12)));
        if (clash) stat.clash++;
        if (s % beat === 0) { stat.beats++; if (clash) stat.beatClash++; }
      }
      stat.thirds += ex.rh.filter((n) => n.pitches.length > 1).length;
    }
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
  console.log(
    `${level.id} ${String(stat.n).padStart(5)} exercises | bass on the root where a chord starts ${pct(stat.root, stat.spans)} | a 2nd or 7th between the hands ${pct(stat.clash, stat.moments)}, on a beat ${pct(stat.beatClash, stat.beats)} | right-hand thirds ${(stat.thirds / Math.max(1, stat.n)).toFixed(1)} an exercise`,
  );
}
console.log(`\nfailures: ${failures}   rule breaks: ${problems}`);
if (failures || problems) process.exit(1);
