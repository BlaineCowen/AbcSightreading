/**
 * Do rhythm-only exercises generate at play-along video length? A 1:30 video
 * is 20-80 bars depending on tempo and meter (src/lib/play-along/timeline.ts),
 * far past the 16 the measure picker offers.
 */
import { createNewSr } from "../src/lib/generateUnison";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import { COMPOUND_METER_NAMES, timeSignatureFor } from "../src/lib/meter";
import { DEFAULT_RHYTHM_NAMES } from "../src/lib/selectable-rhythms";

const RUNS = Number(process.env.RUNS ?? 20);
const simple = ["quarter", "half", "eighthEighth", "dotHalf"];
const meters = [
  ...["2/4", "3/4", "4/4"].map((m) => ({ m, names: simple })),
  ...COMPOUND_METER_NAMES.map((m) => ({ m, names: DEFAULT_RHYTHM_NAMES.compound })),
];
let failures = 0;
for (const { m, names } of meters) {
  for (const measures of [24, 36, 48, 72]) {
    let fail = 0;
    const t0 = performance.now();
    for (let i = 0; i < RUNS; i++) {
      try {
        const out = createNewSr({
          bpm: 100, tempo: 100, clef: "treble", selectedClef: "treble",
          timeSig: timeSignatureFor(m), selectedTimeSignature: m, measures,
          maxSkip: 4, range: { min: 14, max: 21 }, selectedRhythms: names,
          rhythms: allRhythms.filter((r) => names.includes(r.name)),
          scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]), key: "C", chords: ["1"],
          showSolfege: false, rhythmOnly: true, allowTiesAcrossBarline: false,
          showRhythmSyllables: true, syllableSystemId: "kodaly",
          partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
        } as any);
        if (!Array.isArray(out) || !out[0]) fail++;
      } catch { fail++; }
    }
    failures += fail;
    console.log(`${m.padEnd(5)} ${String(measures).padStart(3)} bars: ${fail}/${RUNS} failed, ${((performance.now() - t0) / RUNS).toFixed(0)} ms each`);
  }
}
console.log(failures ? `${failures} failures` : "0 failures");
process.exit(failures ? 1 : 0);
