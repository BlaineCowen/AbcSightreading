/** How long OUR generator holds a chord, measured the same way. */
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { isSelectableRhythm, containsRest } from "../../src/lib/selectable-rhythms";
import { ClefType } from "../../src/lib/types";

const SATB = { numofParts: 4, parts: {
  Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
  Alto: { order: 2, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] },
  Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
  Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,24], currentRange: [9,18] } } } as any;

const p: any = (uilPresets as any)["UIL 5"];
const rhythms = allRhythms.filter(
  (r) => p.allowedRhythmNames.includes(r.name) && isSelectableRhythm(r) && !(r.pattern === true && containsRest(r)) && !r.rest);

const spans: number[] = [];
let bars = 0;
const { log, warn, error } = console;
for (let i = 0; i < 40; i++) {
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    const out: any = generateChoralExercise({
      key: "C", timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
      partsObject: SATB, measures: 16, maxSkip: p.maxSkip, bpm: 72,
      selectedRhythms: rhythms, chords: fullChordSet, accidentalsByStep: true,
      nctProbability: 0, chromaticFrequency: 1,
      allowedChordNames: p.allowedChordNames, voiceTexture: "full",
    } as any);
    // The bass carries one note per chord step, so its note lengths ARE the
    // harmonic rhythm - 32nd-note units, 8 to a quarter-note beat.
    const bass = (out.voiceNotes ?? []).find((v: any[]) => v[0]?.order === 0) ?? [];
    const prog = out.chordProgression ?? [];
    let k = 0, held = 0, lastName = "";
    for (const note of bass) {
      if (note.rest) continue;
      const name = prog[k]?.name ?? "?";
      if (name === lastName) held += note.length;
      else { if (lastName) spans.push(held / 8); held = note.length; lastName = name; }
      k++;
    }
    if (lastName) spans.push(held / 8);
    bars += 16;
  } catch {} finally { Object.assign(console, { log, warn, error }); }
}
const counts = new Map<number, number>();
for (const s of spans) counts.set(s, (counts.get(s) ?? 0) + 1);
const tot = spans.length;
console.log("OURS  (UIL 5, 16 bars, 40 exercises, no decoration)");
console.log("  how long a chord lasts, in quarter-note beats");
for (const beats of [...counts.keys()].sort((a, b) => a - b)) {
  const label = beats === 1 ? "1 beat" : beats === 2 ? "2 beats (half bar)" : beats === 4 ? "4 beats (a full bar)" : `${beats} beats`;
  console.log(`    ${label.padEnd(22)} ${String(counts.get(beats)).padStart(4)}  ${(100*counts.get(beats)!/tot).toFixed(1).padStart(5)}%`);
}
const mean = spans.reduce((a, b) => a + b, 0) / tot;
console.log(`    mean ${mean.toFixed(2)} beats   longest ${Math.max(...spans)} beats   ${tot} chord spans over ${bars} bars`);
console.log(`    chord changes per bar: ${(tot / bars).toFixed(2)}`);
