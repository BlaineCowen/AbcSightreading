import { describe, expect, test } from "bun:test";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { chords as fullChordSet } from "../../src/resources/chords";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * Two adjacent voices a diatonic step apart is the harshest vertical interval
 * this texture can make, and it is where the clash investigation started.
 *
 * Decoration was the loud source and is guarded in non-chord-tone-gen; this is
 * the quiet one, in the chord tones themselves. Measured before the guard it was
 * 4 sonorities in 2867, and always the identical chord: a V7 whose 7th sits in
 * the alto directly under the root in the soprano.
 */

const PARTS = {
  numofParts: 4,
  parts: {
    Soprano: { order: 3, smallName: "S", clef: "treble", range: [21, 35], currentRange: [25, 32] },
    Alto: { order: 2, smallName: "A", clef: "treble", range: [14, 32], currentRange: [21, 28] },
    Tenor: { order: 1, smallName: "T", clef: "treble octave up", range: [11, 27], currentRange: [14, 23] },
    Bass: { order: 0, smallName: "B", clef: "bass", range: [2, 21], currentRange: [9, 18] },
  },
};
const RHYTHMS = ["whole", "half", "quarter"].map((n) =>
  allRhythms.find((r) => r.name === n)
) as any[];

function exercises(count: number, overrides: Record<string, unknown> = {}) {
  const out: any[] = [];
  let refused = 0;
  for (let i = 0; i < count; i++) {
    try {
      const result = generateChoralExercise({
        key: "C", timeSig: { name: "4/4", tsPerMeasure: 32 }, partsObject: PARTS,
        measures: 8, maxSkip: 3, bpm: 72, selectedRhythms: RHYTHMS,
        chords: fullChordSet, accidentalsByStep: true, nctProbability: 0,
        chromaticFrequency: 1,
        allowedChordNames: ["1", "2", "3", "4", "5", "6", "5-7"],
        ...overrides,
      } as any);
      if (result?.voiceNotes) out.push(result.voiceNotes);
      else refused++;
    } catch {
      refused++;
    }
  }
  return { out, refused };
}

/** Every moment where the sounding pitches change. */
function sonorities(voices: any[][]) {
  const onsets = new Set<number>();
  for (const v of voices) {
    let t = 0;
    for (const n of v) { onsets.add(t); t += n.length; }
  }
  const at = (v: any[], time: number) => {
    let t = 0;
    for (const n of v) { if (time < t + n.length) return n; t += n.length; }
    return null;
  };
  return [...onsets].sort((a, b) => a - b).map((t) => voices.map((v) => at(v, t)));
}

describe("vertical spacing", () => {
  test("adjacent voices are never a step apart", () => {
    const { out, refused } = exercises(120);
    // The guard fails the step and lets the retry re-pick, so it must not cost
    // whole exercises - a clash is bad, an exercise that will not generate is
    // worse.
    expect(refused).toBe(0);
    expect(out.length).toBe(120);

    let checked = 0;
    for (const voices of out) {
      const byOrder = [...voices].sort((a, b) => (a[0]?.order ?? 0) - (b[0]?.order ?? 0));
      for (const moment of sonorities(byOrder)) {
        checked++;
        for (let i = 0; i + 1 < moment.length; i++) {
          const low = moment[i];
          const high = moment[i + 1];
          if (!low || !high || low.rest || high.rest) continue;
          expect(Math.abs(high.pitchValue - low.pitchValue)).not.toBe(1);
        }
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  test("still holds with decoration on, where it is hardest", () => {
    // Decoration on is the setting that produced the most residual clashes while
    // the guard was only a preference - about one exercise in fifty, against
    // none at all with decoration off. So this is the configuration worth
    // spending the sample on: it is what tells a preference apart from a rule.
    const { out, refused } = exercises(100, { nctProbability: 0.6 });
    expect(refused).toBe(0);
    for (const voices of out) {
      const byOrder = [...voices].sort((a, b) => (a[0]?.order ?? 0) - (b[0]?.order ?? 0));
      for (const moment of sonorities(byOrder)) {
        for (let i = 0; i + 1 < moment.length; i++) {
          const low = moment[i];
          const high = moment[i + 1];
          if (!low || !high || low.rest || high.rest) continue;
          expect(Math.abs(high.pitchValue - low.pitchValue)).not.toBe(1);
        }
      }
    }
  });
});
