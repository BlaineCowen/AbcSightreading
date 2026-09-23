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
// What the page adds to a major selection: the diatonic inversions, and the
// chromatic-bass inversions of the three secondary dominants (V⁶/V, V⁶/vi,
// V⁶/ii) - the chords whose accidental IS the planned bass note, and the ones
// every bass accidental reached by leap was on. See withInversions in
// AbcjsChoral.svelte.
const MAJOR_INV = ["1-6", "1-64", "2-6", "4-6", "4-64", "5-6", "5-64", "6-6", "5/5-6", "5/6-6", "5/2-6"];

/** Which way an accidental resolves: up if raised, down if lowered. */
const resolveDir = (n: any): number => {
  if (n.accidental === "sharp" || n.accidental === "double-sharp") return 1;
  if (n.accidental === "flat" || n.accidental === "double-flat") return -1;
  if (n.accidental === "natural") return n.wasRaised === true ? 1 : n.wasRaised === false ? -1 : 0;
  return 0;
};

function bassAccidentalApproach(runs = 60, mode: "minor" | "major" = "minor") {
  const preset: any = (uilPresets as any)["UIL 5"];
  const rhythms = allRhythms.filter(
    (r) => preset.allowedRhythmNames.includes(r.name) && !r.rest
  );
  const names =
    mode === "minor"
      ? [
          ...new Set([
            ...(preset.allowedChordNames as string[]).filter((n) => n.startsWith("m_")),
            ...MINOR_INV,
          ]),
        ]
      : [
          ...new Set([
            ...(preset.allowedChordNames as string[]).filter((n) => !n.startsWith("m_")),
            ...MAJOR_INV,
          ]),
        ];
  const keys = mode === "minor" ? ["Am", "Em", "Dm", "Gm", "Cm", "Bm"] : ["G", "C", "F", "D", "Bb", "Eb"];
  let total = 0;
  let byStep = 0;
  let resolved = 0;
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
    const sounding = bass.filter((n: any) => !n.rest);
    for (let k = 0; k < sounding.length; k++) {
      const note = sounding[k];
      if (!note.accidental) continue;
      // The nearest notes either side that are not a repeat of this one.
      const isRepeat = (p: any) =>
        p.pitchValue === note.pitchValue && p.accidental === note.accidental;
      const prev = sounding.slice(0, k).reverse().find((p: any) => !isRepeat(p));
      const next = sounding.slice(k + 1).find((p: any) => !isRepeat(p));
      if (!prev || !next) continue;
      total++;
      if (Math.abs(note.pitchValue - prev.pitchValue) <= 1) byStep++;
      const dir = resolveDir(note);
      if (dir !== 0 && next.pitchValue === note.pitchValue + dir) resolved++;
    }
  }
  return {
    total,
    byStep,
    rate: total ? byStep / total : 1,
    resolvedRate: total ? resolved / total : 1,
  };
}

describe("a chromatic note in the bass is approached by step and resolved by step", () => {
  test("nearly always, in minor", () => {
    const { total, rate, resolvedRate } = bassAccidentalApproach();
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
    // Resolution too, since 22 September 2026: a raised bass note steps up, a
    // lowered one steps down. Measured over 765 minor-key bass accidentals at
    // 100%; it had been 97%.
    expect(resolvedRate).toBeGreaterThan(0.9);
    // Full minor-key generations, enough of them for the rate to mean
    // something, and the search backtracks - so this runs for several seconds
    // and the number varies run to run. Against bun's 5s default it went red
    // now and then as a TIMEOUT, which reads exactly like a regression in the
    // generator and is not one. The sample size is the point, so the budget
    // moves rather than the loop.
  }, 30_000);

  test("nearly always, in major, with the chromatic-bass chords on", () => {
    // Major is where the planned chromatic bass notes live - V⁶/V, V⁶/ii,
    // V⁶/vi - and where the rule was broken most: 8.0% of bass accidentals at
    // UIL 5 in G were approached by leap or left unresolved, every leap on one
    // of those chords. Three things fixed it, all in the deadlock escape in
    // build-chord-notes and in what the progression offers: a planned
    // accidental that would be reached by leap from where the bass really is
    // (an earlier substitution having moved it) is re-picked within a step or
    // the chord is sung in root position; an accidental the escape writes
    // itself has to be payable by the next chord; and the note before a
    // chromatic-bass chord stays within a step of it. Measured over 869 bass
    // accidentals across all eighteen UIL 5 keys: 100% approached and 100%
    // resolved. The thresholds sit well under that, because one fault in a
    // sample this size is two points. Eighty exercises rather than sixty
    // because the COUNT is the loose end: at sixty it ranged 30-62 over thirty
    // trials, close enough to the floor of 25 that the test went red once in
    // a full run while every rate was 1.000.
    const { total, rate, resolvedRate } = bassAccidentalApproach(80, "major");
    expect(total).toBeGreaterThan(25);
    expect(rate).toBeGreaterThan(0.93);
    expect(resolvedRate).toBeGreaterThan(0.93);
  }, 30_000);
});
