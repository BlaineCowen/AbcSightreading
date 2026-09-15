/** Build a real sectional exercise end to end, and report on the joins. */
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { buildSectionalExercise, classicSectionalShape, joinSectionAbc } from "../../src/lib/sectional-form";
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

const main = async () => {
let rough = 0, built = 0, generations = 0;
const RUNS = 12;
for (let run = 0; run < RUNS; run++) {
  const { log, warn, error } = console;
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    const result = buildSectionalExercise(
      (section) => {
        generations++;
        const out: any = generateChoralExercise({
          key: "C", timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
          partsObject: SATB, measures: section.measures, maxSkip: p.maxSkip, bpm: 72,
          selectedRhythms: rhythms, chords: fullChordSet, accidentalsByStep: true,
          nctProbability: 0.25, chromaticFrequency: 1,
          allowedChordNames: p.allowedChordNames, voiceTexture: "full",
        } as any);
        return { voices: out.voiceNotes, abc: out.abcString };
      },
      { sections: classicSectionalShape(), maxSkip: p.maxSkip, shortEndingAfter: "A'" }
    );
    built++;
    rough += result.roughSeams.length;
    if (run === 0) {
      Object.assign(console, { log, warn, error });
      console.log("first run:");
      console.log("  sections:", result.sections.map((s) => `${s.label}@m${s.startsAtBar}(${s.measures})`).join(" "));
      console.log("  total bars:", result.totalMeasures, " short ending at bar:", result.shortEndingBar);
      console.log("  notes per voice:", result.voices.map((v) => v.length).join(", "));
      const a = result.sections.find((s) => s.label === "A")!;
      const ap = result.sections.find((s) => s.label === "A'")!;
      const same = JSON.stringify(a.voices.map(v => v.map(n => n.pitchValue)))
                === JSON.stringify(ap.voices.map(v => v.map(n => n.pitchValue)));
      console.log("  A' restates A exactly:", same);
      console.log("  rough seams:", result.roughSeams.length ? result.roughSeams : "none");
      const joined = joinSectionAbc(result.sections);
      if (joined) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync("/tmp/sectional.abc", joined, "utf8");
        const bodyBars = joined.split("\n").filter(l => l.startsWith("[V:"))
          .map(l => (l.match(/\|/g) || []).length);
        console.log("  joined ABC written, bars per voice:", bodyBars.join(", "));
      }
    }
  } catch (e) {
    Object.assign(console, { log, warn, error });
    console.log("run failed:", e instanceof Error ? e.message.slice(0, 60) : e);
  } finally { Object.assign(console, { log, warn, error }); }
}
console.log(`\n${built}/${RUNS} pieces built, ${generations} section generations, ${rough} rough seams total`);

};
await main();
