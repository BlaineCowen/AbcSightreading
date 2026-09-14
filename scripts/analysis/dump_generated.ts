/** Write generated exercises out as ABC, so the same analyser can read them. */
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { uilPresets } from "../../src/lib/uil-presets";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { isSelectableRhythm, containsRest } from "../../src/lib/selectable-rhythms";
import { ClefType } from "../../src/lib/types";
import { writeFileSync, mkdirSync } from "node:fs";

const SATB = { numofParts: 4, parts: {
  Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [21,35], currentRange: [25,32] },
  Alto: { order: 2, smallName: "A", clef: ClefType.Treble, range: [14,32], currentRange: [21,28] },
  Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11,27], currentRange: [14,23] },
  Bass: { order: 0, smallName: "B", clef: ClefType.Bass, range: [2,24], currentRange: [9,18] } } } as any;
const p: any = (uilPresets as any)["UIL 5"];
const rhythms = allRhythms.filter(
  (r) => p.allowedRhythmNames.includes(r.name) && isSelectableRhythm(r) && !(r.pattern === true && containsRest(r)) && !r.rest);

mkdirSync("/tmp/generated", { recursive: true });
const { log, warn, error } = console;
let n = 0;
for (let i = 0; i < 25; i++) {
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    const out: any = generateChoralExercise({
      key: "C", timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
      partsObject: SATB, measures: 16, maxSkip: p.maxSkip, bpm: 72,
      selectedRhythms: rhythms, chords: fullChordSet, accidentalsByStep: true,
      nctProbability: 0.25, chromaticFrequency: 1,
      allowedChordNames: p.allowedChordNames, voiceTexture: "full",
    } as any);
    writeFileSync(`/tmp/generated/gen-${i}.abc`, out.abcString, "utf8");
    n++;
  } catch {} finally { Object.assign(console, { log, warn, error }); }
}
console.log(`wrote ${n} exercises`);
