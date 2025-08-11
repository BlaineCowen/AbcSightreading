import {
  enrichVoiceParts,
  isNoteInRange,
  type VoicePart,
} from "../lib/part-utils";
import type { Key, Note } from "../lib/note-utils";

describe("Part Utilities", () => {
  const CMajor: Key = {
    tonic: "C",
    mode: "major",
  };

  const testParts: VoicePart[] = [
    {
      selectedRange: [21, 28], // c to c' (middle C to high C)
      clef: "treble",
      smallName: "S",
    },
    {
      selectedRange: [14, 21], // C to c (low C to middle C)
      clef: "bass",
      smallName: "B",
    },
  ];

  describe("enrichVoiceParts", () => {
    test("should add possible notes to each part", () => {
      const enriched = enrichVoiceParts(testParts, CMajor);

      // Check soprano part
      expect(enriched[0].possibleNotes).toBeDefined();
      expect(enriched[0].possibleNotes?.length).toBe(8); // c to c' (8 notes)
      expect(enriched[0].possibleNotes?.[0].name).toBe("c");
      expect(enriched[0].possibleNotes?.[7].name).toBe("c'");

      // Check bass part
      expect(enriched[1].possibleNotes).toBeDefined();
      expect(enriched[1].possibleNotes?.length).toBe(8); // C to c (8 notes)
      expect(enriched[1].possibleNotes?.[0].name).toBe("C");
      expect(enriched[1].possibleNotes?.[7].name).toBe("c");
    });

    test("should initialize empty arrays for chord notes and non-chord tones", () => {
      const enriched = enrichVoiceParts(testParts, CMajor);

      enriched.forEach((part) => {
        expect(part.chordNotes).toEqual([]);
        expect(part.subdivideNotes).toEqual([]);
        expect(part.nonChordTones).toEqual([]);
      });
    });
  });

  describe("isNoteInRange", () => {
    test("should correctly identify notes in range", () => {
      const part = testParts[0]; // Soprano part
      const inRangeNote: Note = {
        name: "c",
        degree: 0,
        pitchValue: 21,
      };
      const outOfRangeNote: Note = {
        name: "C",
        degree: 0,
        pitchValue: 14,
      };

      expect(isNoteInRange(inRangeNote, part)).toBe(true);
      expect(isNoteInRange(outOfRangeNote, part)).toBe(false);
    });
  });
});
