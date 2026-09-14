import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";
import { uilPresets } from "../../src/lib/uil-presets";

/**
 * A chromatic note in the bass has to be reachable.
 *
 * The deadlock escape in build-chord-notes substitutes a different chord tone
 * when the planned bass cannot be used. Past retry 8 it was allowed to pick the
 * ALTERED degree with nothing governing how the bass got there - and it cannot
 * arm an approach, because the previous note is already written. Every bass
 * accidental that arrived by leap traced to that branch.
 *
 * It now prefers a candidate the bass can actually reach: stepping onto the
 * altered note is fine and stays, leaping onto it is dropped while anything else
 * remains. A preference, not a rule - if nothing else is reachable the leap
 * stands and the escape still escapes, which is why this asserts a rate rather
 * than an absolute.
 *
 * Minor, because minor raises its leading tone on every V and so produces four
 * to seven times the accidentals of major. This ran at 45-55% before the
 * inversions went in, 73% after them, and 98% once the escape stopped leaping.
 */

const SATB = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble octave=-1", range: [25, 31], currentRange: [25, 31] },
    Alto: { order: 2, smallName: "A", clef: "treble octave=-1", range: [21, 28], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble transpose=-12", range: [16, 24], currentRange: [16, 24] },
    Bass: { order: 0, smallName: "B", clef: "bass octave=-1", range: [9, 19], currentRange: [9, 19] },
  },
} as any;

const MINOR_INV = ["m_i6", "m_iid6", "m_iv6", "m_iv64", "m_V6", "m_V64", "m_VI6", "m_viid6"];

function bassAccidentalApproach(runs = 60) {
  const preset: any = (uilPresets as any)["UIL 5"];
  const rhythms = allRhythms.filter(
    (r) => preset.allowedRhythmNames.includes(r.name) && !r.rest
  );
  const names = [
    ...new Set([
      ...(preset.allowedChordNames as string[]).filter((n) => n.startsWith("m_")),
      ...MINOR_INV,
    ]),
  ];
  const keys = ["Am", "Em", "Dm", "Gm", "Cm", "Bm"];
  let total = 0;
  let byStep = 0;
  for (let i = 0; i < runs; i++) {
    let out: any;
    try {
      out = generateChoralExercise({
        key: keys[i % keys.length],
        timeSig: { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
        partsObject: SATB,
        measures: 8,
        maxSkip: preset.maxSkip,
        bpm: 72,
        selectedRhythms: rhythms,
        chords: fullChordSet,
        accidentalsByStep: true,
        nctProbability: 0.3,
        chromaticFrequency: 1,
        allowedChordNames: names,
      } as any);
    } catch {
      continue;
    }
    if (!out?.voiceNotes) continue;
    const bass = out.voiceNotes.find((v: any[]) => v.some((n) => n.order === 0));
    if (!bass) continue;
    for (let k = 0; k < bass.length; k++) {
      const note = bass[k];
      if (note.rest || !note.accidental) continue;
      let prev = null;
      for (let j = k - 1; j >= 0; j--) {
        if (!bass[j].rest) {
          prev = bass[j];
          break;
        }
      }
      if (!prev) continue;
      total++;
      if (Math.abs(note.pitchValue - prev.pitchValue) <= 1) byStep++;
    }
  }
  return { total, byStep, rate: total ? byStep / total : 1 };
}

describe("a chromatic note in the bass is approached by step", () => {
  test("nearly always, in minor", () => {
    const { total, rate } = bassAccidentalApproach();
    // There have to be accidentals for the rate to mean anything - but both of
    // these numbers used to sit INSIDE the natural spread of a randomised
    // generator, so the test went red a few runs in a hundred while nothing was
    // wrong. Measured over twelve trials of sixty exercises: the count ranges
    // 44-65 and the rate 0.93-1.00, and before an unrelated change to the
    // doubling filter the count ranged 37-69 and the rate down to 0.903. The
    // old thresholds of 40 and 0.9 were inside both of those.
    //
    // These are set below the observed floor rather than at it. They still
    // catch what they are for: the regression this guards ran at 0.73, and a
    // rate over 25-odd accidentals is plenty to tell 0.73 from 0.95.
    expect(total).toBeGreaterThan(25);
    expect(rate).toBeGreaterThan(0.85);
    // Full minor-key generations, enough of them for the rate to mean
    // something, and the search backtracks - so this runs for several seconds
    // and the number varies run to run. Against bun's 5s default it went red
    // now and then as a TIMEOUT, which reads exactly like a regression in the
    // generator and is not one. The sample size is the point, so the budget
    // moves rather than the loop.
  }, 30_000);
});
