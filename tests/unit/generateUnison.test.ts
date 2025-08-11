import { describe, expect, test } from "bun:test";
import { createNewSr } from "../lib/generateUnison";
import { rhythms } from "../resources/rhythms";

const exactParams = {
  bpm: 60,
  clef: "treble",
  timeSig: {
    name: "4/4",
    tsPerMeasure: 32,
  },
  measures: 16,
  maxSkip: 4,
  tempo: 60,
  range: {
    min: 14,
    max: 19,
  },
  selectedRhythms: ["quarter"],
  rhythms: rhythms.filter((r) => r.name === "quarter"),
  scaleDegrees: new Set([1, 3, 5, 6]), // Using natural 1-based scale degrees
  selectedClef: "treble",
  selectedTimeSignature: "4/4",
  key: "C",
  chords: ["1", "2", "3", "4", "5", "6", "7"],
  showSolfege: false,
  partsObject: {
    numofParts: 1,
    parts: {
      Unison: {
        chordNoteObject: [],
        order: 0,
        smallName: "U",
        selectedRange: [14, 19],
      },
    },
  },
};

describe("generateUnison", () => {
  test("should work with exact parameters", () => {
    console.log("Testing with params:", JSON.stringify(exactParams, null, 2));
    const [notation, progression] = createNewSr(exactParams);
    console.log("Generated notation:", notation);
    expect(notation).toBeTruthy();
    expect(progression).toBeTruthy();

    if (typeof notation === "string") {
      const notes =
        notation.match(
          /[A-G][,']*|[a-g][,']*|\^[A-G][,']*|\^[a-g][,']*|_[A-G][,']*|_[a-g][,']*|=[A-G][,']*|=[a-g][,']*|z/g
        ) || [];
      console.log("Generated notes:", notes);

      // Convert notes to scale degrees and verify they're in our set
      const scaleSteps = notes
        .map((note: string) => {
          if (note === "z") return null;

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

      console.log("Scale steps found:", scaleSteps);

      // Convert to 1-based for comparison since we're using 1-based input
      const oneBasedSteps = scaleSteps.map((step) => (step + 1) % 12 || 12);
      console.log("One-based steps:", oneBasedSteps);

      const allowedDegrees = Array.from(exactParams.scaleDegrees);
      console.log("Allowed degrees (one-based):", allowedDegrees);

      oneBasedSteps.forEach((step: number) => {
        expect(allowedDegrees).toContain(step);
      });
    }
  });
});
