/**
 * Do rhythm-only exercises generate at play-along video length? A 1:30 video
 * is 20-80 bars depending on tempo and meter (src/lib/play-along/timeline.ts),
 * far past the 16 the measure picker offers; each meter is checked up to the
 * longest exercise its videos write (maxBarsIn).
 */
import { createNewSr } from "../src/lib/generateUnison";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import { COMPOUND_METER_NAMES, timeSignatureFor } from "../src/lib/meter";
import { DEFAULT_RHYTHM_NAMES } from "../src/lib/selectable-rhythms";
import { maxBarsIn } from "../src/lib/play-along/backing-tracks";

const RUNS = Number(process.env.RUNS ?? 20);
const simple = ["quarter", "half", "eighthEighth", "dotHalf"];
const meters = [
  ...["2/4", "3/4", "4/4"].map((m) => ({ m, names: simple })),
  ...COMPOUND_METER_NAMES.map((m) => ({ m, names: DEFAULT_RHYTHM_NAMES.compound })),
];
let failures = 0;
for (const { m, names } of meters) {
  // The longest exercise a video in this meter writes (one for all its tracks), and shorter ones.
  for (const measures of [...new Set([24, 36, 48, maxBarsIn(m)])].sort((a, b) => a - b)) {
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
// Pitched (the pitched play-along video): every note, Max skip 4, at video
// lengths for slow to quick page tempos, in a sharp key, a flat key and minor.
for (const { m, names } of meters) {
  for (const key of ["G", "Bb", "Dm"]) {
    for (const measures of [24, 40, 64]) {
      let fail = 0;
      for (let i = 0; i < RUNS; i++) {
        try {
          const out = createNewSr({
            bpm: 90, tempo: 90, clef: "treble", selectedClef: "treble",
            timeSig: timeSignatureFor(m), selectedTimeSignature: m, measures,
            maxSkip: 4, range: { min: 14, max: 21 }, selectedRhythms: names,
            rhythms: allRhythms.filter((r) => names.includes(r.name)),
            scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]), key, chords: ["1", "2", "3", "4", "5", "6", "7"],
            showSolfege: true, rhythmOnly: false, allowTiesAcrossBarline: false,
            showRhythmSyllables: true, syllableSystemId: "kodaly",
            partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
          } as any);
          if (!Array.isArray(out) || !out[2]) fail++;
        } catch { fail++; }
      }
      failures += fail;
      if (fail) console.log(`pitched ${m} ${key} ${measures} bars: ${fail}/${RUNS} failed`);
    }
  }
}
console.log("pitched: every meter in G, Bb and Dm at 24, 40 and 64 bars checked");

console.log(failures ? `${failures} failures` : "0 failures");
process.exit(failures ? 1 : 0);
