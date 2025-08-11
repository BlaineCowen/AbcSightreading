import { describe, test, expect } from "bun:test";
import { createNewSr } from "../../components/voice-leading-rework/sight-reading";
import {
  ClefType,
  type TimeSignature,
  type VoicePart,
  VoiceLeadingError,
  type Note,
  type Chord,
  ChordType,
  type ChordNote,
} from "../../components/voice-leading/types";
import { rhythms } from "../../resources/rhythms";
import { chords as resourceChords } from "../../resources/chords";

// Helper function to convert string chord type to ChordType enum
function convertChordType(type: string): ChordType {
  switch (type) {
    case "tonic":
      return ChordType.Tonic;
    case "predominant":
      return ChordType.Predominant;
    case "dominant":
      return ChordType.Dominant;
    case "dominant-inversion":
      return ChordType.DominantInversion;
    case "mediant":
      return ChordType.Mediant;
    case "leading-tone":
      return ChordType.LeadingTone;
    case "secondary-dominant":
      return ChordType.SecondaryDominant;
    case "plagal":
      return ChordType.Plagal;
    case "tonic-inversion":
      return ChordType.TonicInversion;
    default:
      throw new Error(`Unknown chord type: ${type}`);
  }
}

// Convert resource chords to match our ChordType enum
const chords = resourceChords.map((chord) => ({
  ...chord,
  type: convertChordType(chord.type),
})) as Chord[];

describe("Voice Leading Generation", () => {
  const timeSig: TimeSignature = {
    name: "4/4",
    tsPerMeasure: 32,
  };

  const partsObj = {
    Soprano: {
      range: [16, 28], // C4 to C6
      clef: "treble",
    },
    Alto: {
      range: [12, 23], // G3 to B4
      clef: "treble",
    },
    Bass: {
      range: [0, 16], // C2 to C4
      clef: "bass",
    },
  };

  const voicePartCombinations = {
    "2-part": {
      numofParts: 2,
      parts: {
        Soprano: {
          order: 1,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28] as [number, number], // C4 to C6
          selectedRange: { 1: [16, 28] as [number, number] },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16] as [number, number], // C2 to C4
          selectedRange: { 1: [0, 16] as [number, number] },
        },
      },
    },
    "3-part": {
      numofParts: 3,
      parts: {
        Soprano: {
          order: 2,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28] as [number, number], // C4 to C6
          selectedRange: { 1: [16, 28] as [number, number] },
        },
        Alto: {
          order: 1,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23] as [number, number], // G3 to B4
          selectedRange: { 1: [12, 23] as [number, number] },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16] as [number, number], // C2 to C4
          selectedRange: { 1: [0, 16] as [number, number] },
        },
      },
    },
    "4-part": {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28] as [number, number], // C4 to C6
          selectedRange: { 1: [16, 28] as [number, number] },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23] as [number, number], // G3 to B4
          selectedRange: { 1: [12, 23] as [number, number] },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19] as [number, number], // C3 to G4
          selectedRange: { 1: [8, 19] as [number, number] },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16] as [number, number], // C2 to C4
          selectedRange: { 1: [0, 16] as [number, number] },
        },
      },
    },
  };

  // Test handling all rests
  test("handles all rest rhythms correctly", () => {
    const partsObj = voicePartCombinations["2-part"];

    const params = {
      bpm: 60,
      key: "C",
      timeSig,
      level: 1,
      measures: 4,
      maxSkip: 4,
      partsObject: partsObj,
      chords,
      // Filter to only include rest rhythms
      rhythms: rhythms.filter((r) => r.rest === true && r.totalValue === 8),
    };

    const [abcString, progression] = createNewSr(params);

    // Basic checks for progression
    expect(progression.length).toBeGreaterThanOrEqual(4); // Minimum 4 chords
    expect(progression.length).toBeLessThanOrEqual(params.measures); // Maximum equal to measure count
    expect(progression[0].type).toBe(ChordType.Tonic); // First chord is tonic
    expect(progression[progression.length - 1].type).toBe(ChordType.Tonic); // Last chord is tonic

    // Check if ABC string contains rests
    expect(abcString).toContain("z8");

    // Check if all parts have rests in their content section (not in the header)
    for (const partName of Object.keys(partsObj.parts)) {
      const partData = abcString.split(`[V:${partName}]`)[1];
      expect(partData !== undefined).toBe(true);
      if (partData) {
        expect(partData.includes("z8")).toBe(true);
        // Check no actual notes are present
        const hasNotes = /[A-Ga-g][',.]/g.test(partData);
        expect(hasNotes).toBe(false);
      }
    }

    // Print the ABC string for verification
    console.log("All rests ABC string:", abcString);
  });

  Object.entries(voicePartCombinations).forEach(([name, partsObj]) => {
    test(`generates valid voice leading for ${name}`, () => {
      // Run multiple tests to ensure we get variety
      const numTests = 5;
      const allProgressions: Chord[][] = [];

      for (let i = 0; i < numTests; i++) {
        const testMeasures = 8; // Increased from 4 to 8 measures

        const params = {
          bpm: 60,
          key: "C",
          timeSig,
          level: 1,
          measures: testMeasures,
          maxSkip: 4,
          partsObject: partsObj,
          chords,
          rhythms: rhythms.filter((r) => r.totalValue === 8),
        };

        const [abcString, progression] = createNewSr(params);
        allProgressions.push(progression);

        // Basic checks for progression
        expect(progression.length).toBeGreaterThanOrEqual(4); // Minimum 4 chords
        expect(progression.length).toBeLessThanOrEqual(testMeasures); // Maximum equal to measure count
        expect(progression[0].type).toBe(ChordType.Tonic); // First chord is tonic
        expect(progression[progression.length - 1].type).toBe(ChordType.Tonic); // Last chord is tonic

        // Print the progression for debugging
        console.log(
          `Test ${i + 1} Progression:`,
          progression.map((c) => `${c.symbol}(${c.type})`).join(" -> ")
        );

        // Print the ABC string for debugging
        console.log(abcString);
      }

      // Analyze all progressions to ensure variety
      const usedChordTypes = new Set<ChordType>();
      const usedChordSymbols = new Set<string>();

      allProgressions.forEach((progression) => {
        progression.forEach((chord) => {
          usedChordTypes.add(chord.type);
          usedChordSymbols.add(chord.symbol);
        });
      });

      // We should see at least 3 different chord types across all progressions
      // (Since with fewer measures we might have fewer chord types)
      expect(usedChordTypes.size).toBeGreaterThanOrEqual(3);
      console.log("Used chord types:", Array.from(usedChordTypes));

      // We should see at least 4 different chord symbols across all progressions
      expect(usedChordSymbols.size).toBeGreaterThanOrEqual(4);
      console.log("Used chord symbols:", Array.from(usedChordSymbols));

      // Only check for progressions if we have more than minimal chords
      if (allProgressions.some((prog) => prog.length > 4)) {
        // Check for common chord progressions
        const hasPreDominantToDominant = allProgressions.some((progression) => {
          return progression.some(
            (chord, i) =>
              i < progression.length - 1 &&
              chord.type === ChordType.Predominant &&
              progression[i + 1].type === ChordType.Dominant
          );
        });
        expect(hasPreDominantToDominant).toBe(true);

        // Check for secondary dominants (only if we have longer progressions)
        const hasSecondaryDominant = allProgressions.some((progression) =>
          progression.some(
            (chord) => chord.type === ChordType.SecondaryDominant
          )
        );
        expect(hasSecondaryDominant).toBe(true);
      }
    });
  });
});
