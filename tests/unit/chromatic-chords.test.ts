import { describe, expect, test } from "bun:test";
import { generateChordProgression } from "../../src/lib/chord-generation";
import { generateRandomRhythm } from "../../src/lib/rhythm-generation";
import { prepareVoiceParts } from "../../src/lib/prep-params";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * Two of the four secondary dominants could never be chosen in a major key.
 *
 * A chromatic chord was only allowed when the previous chord contained a
 * diatonic *neighbour* of its raised note - the note's own natural form did not
 * count, and the previous chord's root was ignored on the grounds that the root
 * sits in the bass. In C major that made V/vi and V/ii unreachable from every
 * chord that leads to them: I, V, vi and I6 contain no F or A to step to G#, and
 * no B or D to step to C#. They are defined, weighted and reachable in the chord
 * graph, and appeared exactly zero times in 60 exercises.
 */

const KEY = "C";
const SATB = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble", range: [21, 35] as [number, number], currentRange: [25, 32] as [number, number] },
    Alto: { order: 2, smallName: "A", clef: "treble", range: [14, 32] as [number, number], currentRange: [21, 28] as [number, number] },
    Tenor: { order: 1, smallName: "T", clef: "treble octave up", range: [11, 27] as [number, number], currentRange: [14, 23] as [number, number] },
    Bass: { order: 0, smallName: "B", clef: "bass", range: [2, 21] as [number, number], currentRange: [9, 18] as [number, number] },
  },
};
const TIME_SIG = { name: "4/4", tsPerMeasure: 32 };
const CADENCES = [{ type: "PAC", progression: [] }] as any;
const RHYTHMS = ["whole", "half", "quarter"].map((n) =>
  allRhythms.find((r) => r.name === n)
) as any[];
/** The UIL level 5 harmonic vocabulary, which is where these chords live. */
const UIL5 = ["1", "2", "3", "4", "5", "6", "5-7", "5/5", "5/5-6", "5/6", "5/2"];

function chordNamesOver(runs: number, chromaticFrequency: number): string[] {
  const voiceParts = prepareVoiceParts(KEY, undefined, SATB as any);
  const chordSet = (fullChordSet as any[]).filter((c) => UIL5.includes(c.name));
  const seen: string[] = [];
  for (let i = 0; i < runs; i++) {
    try {
      const rhythms = generateRandomRhythm(TIME_SIG as any, 8, RHYTHMS, CADENCES);
      const count = rhythms.filter(
        (r: any) => !r.rest && (r.isPatternNote ? r.isPatternStart : true)
      ).length;
      const out = generateChordProgression(
        chordSet as any, count, voiceParts[0].range, 3, KEY,
        rhythms as any, CADENCES, true, chromaticFrequency
      );
      for (const c of out.progression) seen.push(c.name);
    } catch {
      // a refusal is a legitimate answer here; the reachability assertions below
      // only need the runs that did produce a progression
    }
  }
  return seen;
}

describe("chromatic chords", () => {
  test("V/vi and V/ii can actually be chosen", () => {
    const names = chordNamesOver(40, 5);
    expect(names.length).toBeGreaterThan(100);
    // Before the approach rule counted the raised note's own natural form, both
    // of these were zero no matter how high the slider went.
    expect(names.filter((n) => n === "5/6").length).toBeGreaterThan(0);
    expect(names.filter((n) => n === "5/2").length).toBeGreaterThan(0);
  });

  test("the slider still controls how many there are", () => {
    const isChromatic = (n: string) => n.includes("/");
    const low = chordNamesOver(30, 1).filter(isChromatic).length;
    const high = chordNamesOver(30, 5).filter(isChromatic).length;
    expect(high).toBeGreaterThan(low);
  });

  test("a chromatic bass note resolves by step", () => {
    // Upper voices have always managed this through forcedPitch; the bass had no
    // equivalent, so a substituted accidental went wherever the chord tones
    // allowed - G# walked to C instead of up to A in most of its appearances.
    let raised = 0;
    let resolved = 0;
    let failures = 0;
    for (let i = 0; i < 20; i++) {
      let out: any;
      try {
        out = generateChoralExercise({
          key: KEY, timeSig: TIME_SIG, partsObject: SATB, measures: 8,
          maxSkip: 3, bpm: 72, selectedRhythms: RHYTHMS, chords: fullChordSet,
          accidentalsByStep: true, nctProbability: 0, chromaticFrequency: 5,
          allowedChordNames: UIL5,
        } as any);
      } catch {
        failures++;
        continue;
      }
      const bass = out.voiceNotes.find((v: any[]) => v[0]?.order === 0) ?? [];
      for (let k = 0; k + 1 < bass.length; k++) {
        const note = bass[k];
        if (note.rest || note.accidental !== "sharp") continue;
        raised++;
        let j = k + 1;
        while (j < bass.length && bass[j].rest) j++;
        if (j < bass.length && bass[j].pitchValue === note.pitchValue + 1) resolved++;
      }
    }
    // Raising the chromatic count must not come at the cost of generating at all.
    expect(failures).toBe(0);
    if (raised > 0) {
      // Was around a third before the bass owed a resolution.
      expect(resolved / raised).toBeGreaterThan(0.7);
    }
  });
});
