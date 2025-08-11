import {
  getNotesInRange,
  getScaleDegree,
  getPitchValue,
} from "../lib/note-utils";
import type { Key, Note } from "../lib/note-utils";

describe("Note Utilities", () => {
  const CMajor: Key = {
    tonic: "C",
    mode: "major",
  };

  const GMajor: Key = {
    tonic: "G",
    mode: "major",
    sharps: [3], // F# in G major
  };

  const FMajor: Key = {
    tonic: "F",
    mode: "major",
    flats: [6], // Bb in F major
  };

  describe("getNotesInRange", () => {
    test("should return correct notes for a simple range", () => {
      const range: [number, number] = [0, 2]; // C,, to E,,
      const notes = getNotesInRange(range, CMajor);

      expect(notes.length).toBe(3);
      expect(notes[0].name).toBe("C,,");
      expect(notes[0].degree).toBe(0);
      expect(notes[0].pitchValue).toBe(0);

      expect(notes[1].name).toBe("D,,");
      expect(notes[1].degree).toBe(1);
      expect(notes[1].pitchValue).toBe(1);

      expect(notes[2].name).toBe("E,,");
      expect(notes[2].degree).toBe(2);
      expect(notes[2].pitchValue).toBe(2);
    });

    test("should handle key signatures with accidentals", () => {
      const range: [number, number] = [3, 4]; // F,, to G,,
      const notes = getNotesInRange(range, GMajor);

      // Find F note
      const fNote = notes.find((n: Note) => n.name === "F,,");
      expect(fNote?.degree).toBe(6); // F is scale degree 6 in G major
    });

    test("should throw error for invalid range", () => {
      expect(() => {
        getNotesInRange([-1, 5], CMajor);
      }).toThrow("Invalid range");

      expect(() => {
        getNotesInRange([5, 3], CMajor);
      }).toThrow("Invalid range");
    });
  });

  describe("getScaleDegree", () => {
    test("should return correct scale degrees in C major", () => {
      expect(getScaleDegree("C,,", CMajor)).toBe(0);
      expect(getScaleDegree("D,,", CMajor)).toBe(1);
      expect(getScaleDegree("E,,", CMajor)).toBe(2);
    });

    test("should return correct scale degrees in G major", () => {
      expect(getScaleDegree("G,,", GMajor)).toBe(0);
      expect(getScaleDegree("A,,", GMajor)).toBe(1);
      expect(getScaleDegree("B,,", GMajor)).toBe(2);
    });
  });

  describe("getPitchValue", () => {
    test("should return correct indices for notes", () => {
      expect(getPitchValue("C,,")).toBe(0);
      expect(getPitchValue("G,,")).toBe(4);
      expect(getPitchValue("C,")).toBe(7);
      expect(getPitchValue("c")).toBe(21);
      expect(getPitchValue("c'")).toBe(28);
    });

    test("should return -1 for invalid notes", () => {
      expect(getPitchValue("X")).toBe(-1);
      expect(getPitchValue("")).toBe(-1);
    });
  });
});
