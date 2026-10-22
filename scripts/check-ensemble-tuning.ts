/**
 * Does the Ensemble tab hear which parts are out of tune? A synthesised
 * four-part take (harmonic tones with vibrato, a progression of eight chords)
 * with faults planted - the alto 30 cents flat in chord 3, the tenor 20 cents
 * sharp throughout, the bass's chord 6 40 cents high - run through the
 * same steps as the page (src/lib/ensemble-tuning: Basic Pitch, separation
 * windows, held pitch, parts), with no browser.
 *
 *   bun run scripts/check-ensemble-tuning.ts          (KIND=instruments for the other model, A4=442)
 */
import { readFileSync } from "node:fs";
import { instantiatePolyPitch } from "../src/lib/ensemble-tuning/polypitch";
import { measureWindow, windowJob } from "../src/lib/ensemble-tuning/measure";
import {
  assignParts, combineReadings, partNames, planWindows, roughCents, summarise, tuningOf, type MeasuredNote,
} from "../src/lib/ensemble-tuning/tuning";

const KIND = (process.env.KIND ?? "voices") as "voices" | "instruments";
const A4 = Number(process.env.A4 ?? 440);
const SR = 44100;
const CHORD = 1.0; // seconds a chord

// Soprano, alto, tenor, bass (MIDI) for I IV V I vi ii V I in C.
const CHORDS = [
  [72, 67, 64, 48], [72, 69, 65, 53], [71, 67, 62, 55], [72, 67, 64, 48],
  [72, 69, 64, 57], [74, 69, 65, 50], [74, 67, 59, 55], [72, 67, 64, 48],
];
const detune = (part: number, chord: number) =>
  (part === 1 && chord === 2 ? -30 : 0) + (part === 2 ? 20 : 0) + (part === 3 && chord === 5 ? 40 : 0);

const len = Math.round(CHORDS.length * CHORD * SR + SR * 0.5);
const mix = new Float32Array(len);
const aOffset = 1200 * Math.log2(A4 / 440);
CHORDS.forEach((chord, c) => {
  chord.forEach((midi, p) => {
    const f0 = 440 * 2 ** ((midi - 69) / 12) * 2 ** ((detune(p, c) + aOffset) / 1200);
    const s0 = Math.round(c * CHORD * SR), n = Math.round(CHORD * SR * 0.97);
    const phase = new Array(8).fill(0);
    const vibRate = 5 + p * 0.37, vibPhase = p + c;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.04, (n / SR - t) / 0.06);
      const f = f0 * 2 ** ((18 * Math.sin(2 * Math.PI * vibRate * t + vibPhase) * Math.min(1, t / 0.3)) / 1200);
      let v = 0;
      for (let h = 0; h < phase.length; h++) {
        phase[h] += (2 * Math.PI * f * (h + 1)) / SR;
        v += Math.sin(phase[h]) / (h + 1) ** 1.3;
      }
      mix[s0 + i] += 0.12 * env * v;
    }
  });
});

const pp = await instantiatePolyPitch(await WebAssembly.compile(readFileSync("public/omnipitch/polypitch-1.wasm")));
let t = performance.now();
const found = pp.basicPitchNotes(mix, SR, KIND === "voices");
console.log(`${found.length} notes found in ${((performance.now() - t) / 1000).toFixed(2)} s (${KIND})`);
const notes: MeasuredNote[] = found.map((n) => ({
  start: n.start, end: n.end, midi: n.midi, velocity: n.velocity, a440Cents: roughCents(n.cents, n.amp), measured: false, sure: true,
}));
t = performance.now();
for (const w of planWindows(notes)) {
  for (const r of measureWindow(pp, windowJob(mix, SR, notes, w))) {
    const read = combineReadings(r.held, r.harmonic);
    if (read) Object.assign(notes[r.j], { a440Cents: read.cents, sure: read.sure, measured: true, curve: r.curve });
  }
}
console.log(`measured in ${((performance.now() - t) / 1000).toFixed(2)} s, ${notes.filter((n) => n.measured).length}/${notes.length} from their own curve`);

const parts = assignParts(notes, 4);
const names = partNames(4, KIND);
if (process.env.DEBUG) {
  notes
    .map((n, j) => ({ n, j }))
    .sort((p, q) => p.n.start - q.n.start || q.n.midi - p.n.midi)
    .forEach(({ n, j }) =>
      console.log(
        `  ${n.start.toFixed(2)}-${n.end.toFixed(2)} midi ${n.midi} ${names[parts[j]].padEnd(7)} held ${n.a440Cents.toFixed(1).padStart(6)}${n.sure ? "" : " UNSURE"}` +
          (n.curve ? ` centre ${n.curve.center.toFixed(1).padStart(6)} drawn ${n.curve.drawn} pts ${n.curve.drift.length}` : " (rough)")
      )
    );
}
const { parts: summary, all } = summarise(notes, parts, names, A4);

// Each planted note: is it there, in the right part, at the right tuning?
let failures = 0;
const fail = (msg: string) => (failures++, console.log("  FAIL " + msg));
CHORDS.forEach((chord, c) => {
  chord.forEach((midi, p) => {
    const want = detune(p, c);
    const j = notes.findIndex((n) => n.start < c * CHORD + 0.3 && n.end > c * CHORD + 0.5 && tuningOf(n, A4).midi === midi + Math.round(want / 100));
    if (j < 0) return fail(`chord ${c + 1} ${names[p]} ${midi}: not heard`);
    const got = tuningOf(notes[j], A4);
    const wantCents = want - 100 * Math.round(want / 100);
    if (parts[j] !== p) fail(`chord ${c + 1} ${names[p]}: given to ${names[parts[j]]}`);
    if (notes[j].sure && Math.abs(got.cents - wantCents) > 8) fail(`chord ${c + 1} ${names[p]}: ${got.cents.toFixed(1)}¢, planted ${wantCents}`);
  });
});
const extra = notes.length - CHORDS.length * 4;
for (const s of summary) {
  console.log(`  ${s.name.padEnd(8)} ${s.notes} notes, mean ${s.meanCents.toFixed(1)}¢, in tune ${(s.inTune * 100).toFixed(0)}%, off ${s.offNotes}`);
}
console.log(`  Everyone mean ${all.meanCents.toFixed(1)}¢; ${extra} notes more than written`);
if (summary[2].meanCents < 15) fail(`the tenor should lean ~20¢ sharp, reads ${summary[2].meanCents.toFixed(1)}`);
if (Math.abs(summary[0].meanCents) > 6) fail(`the soprano should read in tune, reads ${summary[0].meanCents.toFixed(1)}`);
console.log(failures ? `${failures} failures` : "clean");
process.exit(failures ? 1 : 0);
