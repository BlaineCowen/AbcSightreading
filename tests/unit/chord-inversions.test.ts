import { describe, expect, test } from "bun:test";
import { chords as fullChordSet } from "../../src/resources/chords";
import { generateChoralExercise } from "../../src/lib/generateChoral";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

/**
 * An inversion names the note that belongs in its bass, and that note decides
 * what can follow. A seventh in the bass falls, so V4/2 goes to I6 and to
 * nothing else; V4/2 of IV goes to IV6.
 *
 * Both halves have to hold. Listing the right successor is not enough if the
 * bass is free to sit somewhere else, and pinning the bass is not enough if the
 * next chord cannot receive it. V4/2 landed on I6 every single time while
 * moving its bass correctly only 42% of the time, because the bass was also
 * being offered the leading tone - which is a different inversion, with the
 * opposite obligation.
 */

const byName = (n: string) => (fullChordSet as any[]).find((c) => c.name === n);

describe("chord inversion data", () => {
  test("an inversion entry's bass note is one of its own tones", () => {
    for (const chord of fullChordSet as any[]) {
      expect(chord.triadNotes).toContain(chord.root);
    }
  });

  test("the inverted sevenths resolve where their bass forces them", () => {
    // V4/2 has the seventh in the bass; a seventh falls, so I6 is the only
    // chord that can receive it. Same shape for V4/2 of IV into IV6.
    expect(byName("5-7-42").nextChordPossibilities.map((p: any) => p.name)).toEqual(["1-6"]);
    expect(byName("1-7-42").nextChordPossibilities.map((p: any) => p.name)).toEqual(["4-6"]);
    // V6/5 has the leading tone in the bass, which rises to the tonic.
    expect(byName("5-7-65").nextChordPossibilities.map((p: any) => p.name)).toEqual(["1"]);
  });

  test("V7/IV is a complete seventh chord", () => {
    // Its root used to be missing from its own tone list, which left it three
    // notes and put its flattened seventh permanently out of reach of the bass.
    const chord = byName("1-7");
    expect(chord.triadNotes.length).toBe(4);
    expect(chord.triadNotes).toContain(chord.root);
    expect(chord.flatScaleDegree).toBe(6);
  });
});

describe("inverted sevenths in generated exercises", () => {
  const PARTS = {
    numofParts: 4,
    parts: {
      Soprano: { order: 3, smallName: "S", clef: "treble", range: [21, 31], currentRange: [21, 31] },
      Alto: { order: 2, smallName: "A", clef: "treble", range: [19, 28], currentRange: [19, 28] },
      Tenor: { order: 1, smallName: "T", clef: "treble octave up", range: [15, 24], currentRange: [15, 24] },
      Bass: { order: 0, smallName: "B", clef: "bass", range: [11, 21], currentRange: [11, 21] },
    },
  };
  const RHYTHMS = ["whole", "half", "quarter"].map((n) =>
    allRhythms.find((r) => r.name === n)
  ) as any[];

  test("the seventh in the bass falls by step, into the right chord", () => {
    // Simple rhythms and no decoration, so one bass note is one chord position.
    let seen = 0;
    for (let i = 0; i < 25; i++) {
      let out: any;
      try {
        out = generateChoralExercise({
          key: "C", timeSig: { name: "4/4", tsPerMeasure: 32 }, partsObject: PARTS,
          measures: 16, maxSkip: 5, bpm: 72, selectedRhythms: RHYTHMS,
          chords: fullChordSet, accidentalsByStep: true, nctProbability: 0,
          chromaticFrequency: 3,
          allowedChordNames: ["1","2","4","5","6","5-7","1-6","4-6","1-7","5-7-42","1-7-42","5-7-65","5-7-43"],
        } as any);
      } catch {
        continue;
      }
      const bass = out?.voiceNotes?.find((v: any[]) => v[0]?.order === 0) ?? [];
      const prog = out?.chordProgression ?? [];
      if (bass.length !== prog.length) continue;
      for (let k = 0; k + 1 < prog.length; k++) {
        const expected: Record<string, string> = { "5-7-42": "1-6", "1-7-42": "4-6" };
        const want = expected[prog[k].name];
        if (!want) continue;
        seen++;
        expect(prog[k + 1].name).toBe(want);
        expect(bass[k + 1].pitchValue).toBe(bass[k].pitchValue - 1);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
