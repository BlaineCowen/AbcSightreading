import { describe, expect, test } from "bun:test";
import { createNewSr } from "../lib/generateUnison";
import { rhythms } from "../resources/rhythms";

const sampleParams = {
  selectedRhythms: [
    "eighthEighth",
    "fourSixteenths",
    "eighthSixteenthSixteenth",
  ],
  selectedTimeSignature: "4/4",
  chords: ["1", "4", "5"],
  clef: "treble",
  key: "C",
  maxSkip: 2,
  level: 1,
  timeSig: {
    name: "4/4",
    tsPerMeasure: 8,
  },
  bpm: 120,
  measures: 4,
  partsObject: {
    parts: {
      Unison: {
        chordNoteObject: [],
        order: 0,
        smallName: "U",
        selectedRange: [8, 15],
      },
    },
  },
  range: {
    min: 8,
    max: 15,
  },
  rhythms: rhythms.filter((r) =>
    ["eighthEighth", "fourSixteenths", "eighthSixteenthSixteenth"].includes(
      r.name
    )
  ),
  scaleDegrees: new Set([0, 2, 4, 5, 7]),
  showSolfege: true,
};

describe("generateUnison", () => {
  test("should generate music notation", () => {
    const [notation, progression] = createNewSr(sampleParams);
    expect(notation).toBeTruthy();
    expect(progression).toBeTruthy();
  });

  test("should work with scale degrees 1,3,5,6", () => {
    const params = {
      ...sampleParams,
      scaleDegrees: new Set([0, 4, 7, 9]), // 1,3,5,6 in zero-based indexing
    };

    const [notation, progression] = createNewSr(params);
    expect(notation).toBeTruthy();
    expect(progression).toBeTruthy();

    // Check if the generated notes only use the specified scale degrees
    if (typeof notation === "string") {
      const notes =
        notation.match(
          /[A-G][,']*|[a-g][,']*|\^[A-G][,']*|\^[a-g][,']*|_[A-G][,']*|_[a-g][,']*|=[A-G][,']*|=[a-g][,']*|z/g
        ) || [];
      console.log("Generated notes:", notes);

      // Convert notes to scale degrees and verify they're in our set
      const scaleSteps = notes
        .map((note: string) => {
          // Skip rests
          if (note === "z") return null;

          // Basic note to number mapping (C=0, D=2, E=4, F=5, G=7, A=9, B=11)
          const baseNote = note
            .replace(/[,']*/g, "")
            .replace(/[\^_=]/g, "")
            .toUpperCase();
          const baseMap: Record<string, number> = {
            C: 0,
            D: 2,
            E: 4,
            F: 5,
            G: 7,
            A: 9,
            B: 11,
          };
          const step = baseMap[baseNote as keyof typeof baseMap];

          return step % 12;
        })
        .filter((step: number | null): step is number => step !== null);

      const allowedDegrees = [0, 4, 7, 9]; // 1,3,5,6
      scaleSteps.forEach((step: number) => {
        expect(allowedDegrees).toContain(step);
      });
    }
  });
});
