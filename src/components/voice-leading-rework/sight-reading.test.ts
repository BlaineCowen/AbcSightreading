import { createNewSr } from "./sight-reading";
import { noteArray } from "../../resources/noteArray";
import {
  ClefType,
  ChordType,
  type Chord,
  type PartsObject,
  UIL_RANGES,
} from "./types";
import { describe, expect, test } from "bun:test";
import type { Rhythm } from "../../resources/rhythms";
import { chords } from "../../resources/chords";
import { rhythms } from "../../resources/rhythms";
import ABCJS from "abcjs";

console.log("Starting test file execution");

describe("createNewSr", () => {
  console.log("Starting test suite");

  const baseParams = {
    bpm: 60,
    key: "F",
    timeSig: {
      name: "4/4",
      tsPerMeasure: 32,
    },
    level: 1,
    measures: 8,
    maxSkip: 3,
    rhythms: [
      {
        name: "quarter",
        abcValue: ["8"],
        meterValue: [4],
        totalValue: 8,
        singleNoteValue: 8,
        weight: 1,
        pattern: false,
        rest: false,
        oddsWeight: 1,
        maxRng: 0.5,
        symbol: "♩",
        isPatternNote: false,
        isPatternStart: false,
        isPatternEnd: false,
        patternIndex: null,
      },
      {
        name: "eighthEighth",
        abcValue: ["4", "4"],
        meterValue: [2, 2],
        totalValue: 8,
        singleNoteValue: 4,
        weight: 1,
        pattern: true,
        rest: false,
        oddsWeight: 1,
        maxRng: 1.0,
        symbol: "♫",
        isPatternNote: true,
        isPatternStart: true,
        isPatternEnd: true,
        patternIndex: 0,
      },
    ] as Rhythm[],
  };

  console.log("Base params initialized");

  test("should generate correct ABC notation format with proper rhythm", () => {
    console.log("Starting first test");
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    if (!result) {
      throw new Error("Failed to generate sight reading exercise");
    }

    const [abcString, progression] = result;

    // Log the ABC string for debugging
    console.log("ABC String:", abcString);

    // Verify ABC notation format
    expect(abcString).toMatch(
      /^X:1\nT:SATB UIL Sight Reading\nC:Blaine Cowen\nM:4\/4\nL:1\/8\nQ:1\/4=76\n%%score S A T B/
    );

    // Verify it contains the correct clef
    expect(abcString).toContain("clef=treble");

    // Verify key signature
    expect(abcString).toContain("K: F");

    // Verify it has the correct number of measures (each measure ends with |)
    const sopranoLine = abcString
      .split("\n")
      .find((line) => line.startsWith("[V:S]"));
    // Extract just the soprano part content and count all bar lines
    const sopranoContent = sopranoLine
      ?.split("[V:S] ")[1]
      .split(" [V:A]")[0]
      .replace(/\n/g, "")
      .replace(/\s+/g, " ")
      .trim();
    // Count all bar lines (| and |]) in the soprano part
    const barLines = sopranoContent?.match(/\|(?:\])?(?=\s|$)/g);
    console.log("Soprano content:", sopranoContent);
    console.log("Bar lines:", barLines);
    expect(barLines?.length).toBe(baseParams.measures); // We expect exactly 8 measures

    // Verify note lengths (should be 8 for eighth notes in L:1/8)
    expect(abcString).toMatch(/[A-Ga-g][,']*8/);

    // Verify each measure has 8 beats worth of notes (for 4/4 time)
    const measurePattern = /\|([^|]+)\|/g;
    const measureMatches = abcString.match(measurePattern);
    expect(measureMatches).toBeTruthy();
    if (measureMatches) {
      console.log("Measures found:", measureMatches);
      measureMatches.forEach((measure: string) => {
        console.log("Checking measure:", measure);
        // Count all notes and rests in the measure
        const notes = measure.match(/[A-Ga-g][,']*\d+|z\d+/g) || [];
        console.log("Notes found:", notes);

        // Sum up the note lengths
        const totalBeats = notes.reduce((sum: number, note: string) => {
          const length = parseInt(note.match(/\d+/)?.[0] || "0");
          return sum + length;
        }, 0);

        // Each measure should have 32 beats (in 1/32 units)
        expect(totalBeats).toBe(32);

        // Check that each note has a valid length
        notes.forEach((note: string) => {
          const length = parseInt(note.match(/\d+/)?.[0] || "0");
          expect(length).toBeGreaterThan(0);
          expect(length % 4).toBe(0); // Should be divisible by 4 (eighth notes or longer)
        });
      });
    }
  });

  test("should generate notes for a chord in range", () => {
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    if (!result) {
      throw new Error("Failed to generate sight reading exercise");
    }

    const [abcString, progression] = result;

    // Extract notes from ABC string
    const notes = abcString.match(/[A-Ga-g][,']*\d+/g) || [];
    expect(notes.length).toBeGreaterThan(0);

    // Check that each note is in the correct range for its part
    const partRanges = {
      S: [16, 28],
      A: [12, 23],
      T: [8, 19],
      B: [0, 16],
    };

    const partNotes = abcString.split(/\[V:[SATB]\]/).slice(1);
    partNotes.forEach((partSection, index) => {
      const partName = "SATB"[index];
      const range = partRanges[partName as keyof typeof partRanges];
      const partNoteMatches = partSection.match(/[A-Ga-g][,']*\d+/g) || [];

      partNoteMatches.forEach((note) => {
        const pitch = noteArray.indexOf(note.replace(/\d+$/, ""));
        expect(pitch).toBeGreaterThanOrEqual(range[0]);
        expect(pitch).toBeLessThanOrEqual(range[1]);
      });
    });
  });

  test("should handle different ranges", () => {
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    expect(result).toBeTruthy();
    if (!result) return;

    const [abcString, progression] = result;

    // Extract notes from ABC string
    const notes = abcString.match(/[A-Ga-g][,']*\d+/g) || [];
    expect(notes.length).toBeGreaterThan(0);

    // Check that each note is in the correct range for its part
    const partRanges = {
      S: [16, 28],
      A: [12, 23],
      T: [8, 19],
      B: [0, 16],
    };

    const partNotes = abcString.split(/\[V:[SATB]\]/).slice(1);
    partNotes.forEach((partSection, index) => {
      const partName = "SATB"[index];
      const range = partRanges[partName as keyof typeof partRanges];
      const partNoteMatches = partSection.match(/[A-Ga-g][,']*\d+/g) || [];

      partNoteMatches.forEach((note) => {
        const pitch = noteArray.indexOf(note.replace(/\d+$/, ""));
        expect(pitch).toBeGreaterThanOrEqual(range[0]);
        expect(pitch).toBeLessThanOrEqual(range[1]);
      });
    });
  });

  test("should handle different chords", () => {
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    expect(result).toBeTruthy();
    if (!result) return;

    const [abcString, progression] = result;
    expect(abcString).toBeTruthy();
    expect(progression).toBeTruthy();
  });

  test("should respect maxSkip constraint", () => {
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    expect(result).toBeTruthy();
    if (!result) return;

    const [abcString, progression] = result;

    // Extract notes from ABC string
    const notes = abcString.match(/[A-Ga-g][,']*\d+/g) || [];
    expect(notes.length).toBeGreaterThan(0);

    // Check that each note is within maxSkip of the previous note within its part
    const partNotes = abcString.split(/\[V:[SATB]\]/).slice(1);
    partNotes.forEach((partSection) => {
      const partNoteMatches = partSection.match(/[A-Ga-g][,']*\d+/g) || [];
      partNoteMatches.forEach((note, index) => {
        if (index === 0) return;
        const prevNote = partNoteMatches[index - 1].replace(/\d+$/, "");
        const currentNote = note.replace(/\d+$/, "");
        const prevPitch = noteArray.indexOf(prevNote);
        const currentPitch = noteArray.indexOf(currentNote);

        // Skip if either note is not found (might be a rest)
        if (prevPitch === -1 || currentPitch === -1) return;

        // Calculate the step difference
        const prevOctave = Math.floor(prevPitch / 7);
        const currentOctave = Math.floor(currentPitch / 7);
        const prevStep = prevPitch % 7;
        const currentStep = currentPitch % 7;

        // Calculate total steps between notes
        const stepDiff = Math.abs(
          (prevOctave - currentOctave) * 7 + (prevStep - currentStep)
        );
        expect(stepDiff).toBeLessThanOrEqual(baseParams.maxSkip);
      });
    });
  });

  test("should handle multiple parts", () => {
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    expect(result).toBeTruthy();
    if (!result) return;

    const [abcString, progression] = result;

    // Check that all parts are present
    expect(abcString).toContain("[V:S]");
    expect(abcString).toContain("[V:A]");
    expect(abcString).toContain("[V:T]");
    expect(abcString).toContain("[V:B]");
  });

  test("should respect UIL ranges for each level", () => {
    console.log("Starting UIL ranges test");
    const levels = [1, 2, 3, 4, 5];

    levels.forEach((level) => {
      console.log(`\n=== Testing Level ${level} ===\n`);
      const partsObject: PartsObject = {
        numofParts: 4,
        parts: {
          Soprano: {
            order: 3,
            smallName: "S",
            clef: ClefType.Treble,
            range: [16, 28],
            selectedRange: {
              1: [16, 28],
              2: [16, 28],
              3: [16, 28],
              4: [16, 28],
              5: [16, 28],
            },
          },
          Alto: {
            order: 2,
            smallName: "A",
            clef: ClefType.Treble,
            range: [12, 23],
            selectedRange: {
              1: [12, 23],
              2: [12, 23],
              3: [12, 23],
              4: [12, 23],
              5: [12, 23],
            },
          },
          Tenor: {
            order: 1,
            smallName: "T",
            clef: ClefType.TrebleOctaveDown,
            range: [8, 19],
            selectedRange: {
              1: [8, 19],
              2: [8, 19],
              3: [8, 19],
              4: [8, 19],
              5: [8, 19],
            },
          },
          Bass: {
            order: 0,
            smallName: "B",
            clef: ClefType.Bass,
            range: [0, 16],
            selectedRange: {
              1: [0, 16],
              2: [0, 16],
              3: [0, 16],
              4: [0, 16],
              5: [0, 16],
            },
          },
        },
      };

      const result = createNewSr(
        baseParams.bpm,
        baseParams.key,
        baseParams.timeSig,
        level,
        baseParams.measures,
        baseParams.maxSkip,
        partsObject,
        baseParams.rhythms
      );

      expect(result).toBeTruthy();
      if (!result) return;

      const [abcString, progression] = result;

      // Extract notes from ABC string
      const notes = abcString.match(/[A-Ga-g][,']*\d+/g) || [];
      expect(notes.length).toBeGreaterThan(0);

      // Check that each note is within the UIL range for the current level
      const partNotes = abcString.split(/\[V:[SATB]\]/).slice(1);
      const partNames = ["Soprano", "Alto", "Tenor", "Bass"];
      partNotes.forEach((partSection, index) => {
        const partName = partNames[index];
        const part = partsObject.parts[partName];
        const range = part.selectedRange[level];
        const partNoteMatches = partSection.match(/[A-Ga-g][,']*\d+/g) || [];

        partNoteMatches.forEach((note) => {
          const pitch = noteArray.indexOf(note.replace(/\d+$/, ""));
          expect(pitch).toBeGreaterThanOrEqual(range[0]);
          expect(pitch).toBeLessThanOrEqual(range[1]);
        });
      });
    });
  });

  test("should generate notes within valid ranges and from noteArray", () => {
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    expect(result).toBeTruthy();
    if (!result) return;

    const [abcString, progression] = result;

    // Extract notes from ABC string
    const notes = abcString.match(/[A-Ga-g][,']*\d+/g) || [];
    expect(notes.length).toBeGreaterThan(0);

    // Check that each note exists in noteArray
    notes.forEach((note) => {
      const noteName = note.replace(/\d+$/, "");
      expect(noteArray.includes(noteName)).toBe(true);
    });
  });

  test("should ensure all notes exist in noteArray", () => {
    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    const result = createNewSr(
      baseParams.bpm,
      baseParams.key,
      baseParams.timeSig,
      baseParams.level,
      baseParams.measures,
      baseParams.maxSkip,
      partsObject,
      baseParams.rhythms
    );

    expect(result).toBeTruthy();
    if (!result) return;

    const [abcString, progression] = result;

    // Extract notes from ABC string
    const notes = abcString.match(/[A-Ga-g][,']*\d+/g) || [];
    expect(notes.length).toBeGreaterThan(0);

    // Check that each note exists in noteArray
    notes.forEach((note) => {
      const noteName = note.replace(/\d+$/, "");
      expect(noteArray.includes(noteName)).toBe(true);
    });
  });

  test("should generate valid ABC notation for different parameters", () => {
    // Test different parameters
    const testParams = [
      {
        timeSig: { name: "3/4", tsPerMeasure: 24 },
        measures: 4,
        key: "G",
      },
      {
        timeSig: { name: "6/8", tsPerMeasure: 24 },
        measures: 6,
        key: "D",
      },
    ];

    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    testParams.forEach(({ timeSig, measures, key }) => {
      const result = createNewSr(
        baseParams.bpm,
        key,
        timeSig,
        baseParams.level,
        measures,
        baseParams.maxSkip,
        partsObject,
        baseParams.rhythms
      );

      expect(result).toBeTruthy();
      if (!result) return;

      const [abcString, progression] = result;

      // Verify basic ABC notation structure
      expect(abcString).toMatch(/^X:1/); // Should start with X:1
      expect(abcString).toMatch(/T:SATB UIL Sight Reading/); // Should have title
      expect(abcString).toMatch(new RegExp(`M:${timeSig.name}`)); // Should have correct time signature
      expect(abcString).toMatch(new RegExp(`K: ${key}`)); // Should have correct key

      // Verify parts
      expect(abcString).toContain("[V:S]"); // Should have Soprano part
      expect(abcString).toContain("[V:A]"); // Should have Alto part
      expect(abcString).toContain("[V:T]"); // Should have Tenor part
      expect(abcString).toContain("[V:B]"); // Should have Bass part

      // Count measures in each part
      const parts = abcString.split(/\[V:[SATB]\]/).slice(1);
      parts.forEach((part) => {
        const barLines = part.match(/\|(?:\])?(?=\s|$)/g);
        expect(barLines?.length).toBe(measures);

        // Check that each measure has the correct number of beats
        const measureContent = part.split(/\|/).slice(1, -1); // Remove first and last empty parts
        measureContent.forEach((measure) => {
          const notes = measure.match(/[A-Ga-g][,']*\d+|z\d+/g) || [];
          const totalBeats = notes.reduce((sum, note) => {
            const length = parseInt(note.match(/\d+/)?.[0] || "0");
            return sum + length;
          }, 0);
          expect(totalBeats).toBe(timeSig.tsPerMeasure);
        });
      });
    });
  });

  test("should handle different rhythm combinations", () => {
    const testRhythms = [
      // Test quarter notes and eighth notes
      [
        rhythms.find((r) => r.name === "quarter")!,
        rhythms.find((r) => r.name === "eighthEighth")!,
      ],
      // Test with rests
      [
        rhythms.find((r) => r.name === "quarterRest")!,
        rhythms.find((r) => r.name === "quarter")!,
      ],
      // Test with dotted rhythms
      [
        rhythms.find((r) => r.name === "dotQuarter")!,
        rhythms.find((r) => r.name === "eighthRest")!,
      ],
    ];

    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    testRhythms.forEach((rhythms, index) => {
      console.log(`Testing rhythm combination ${index + 1}`);

      const result = createNewSr(
        baseParams.bpm,
        baseParams.key,
        baseParams.timeSig,
        baseParams.level,
        baseParams.measures,
        baseParams.maxSkip,
        partsObject,
        rhythms
      );

      expect(result).toBeTruthy();
      if (!result) return;

      const [abcString, progression] = result;

      // Verify that all rhythm values used in the ABC string match the expected values
      const parts = abcString.split(/\[V:[SATB]\]/).slice(1);
      parts.forEach((part) => {
        const measureContent = part.split(/\|/).slice(1, -1); // Remove first and last empty parts
        measureContent.forEach((measure) => {
          const notes = measure.match(/[A-Ga-g][,']*\d+|z\d+/g) || [];
          notes.forEach((note) => {
            const length = parseInt(note.match(/\d+/)?.[0] || "0");
            // Check that the note length matches one of the allowed rhythm values
            const validLengths = rhythms.flatMap((r) =>
              r.abcValue.map((v) => v)
            );
            expect(validLengths).toContain(length.toString());
          });

          // Check that each measure has the correct total duration
          const totalBeats = notes.reduce((sum, note) => {
            const length = parseInt(note.match(/\d+/)?.[0] || "0");
            return sum + length;
          }, 0);
          expect(totalBeats).toBe(baseParams.timeSig.tsPerMeasure);
        });
      });

      // If testing rests, verify that rests are present when they should be
      if (rhythms.some((r) => r.rest)) {
        expect(abcString).toMatch(/z\d+/);
      }

      // If testing patterns, verify that pattern notes appear together
      if (rhythms.some((r) => r.pattern)) {
        const patternRhythms = rhythms.filter((r) => r.pattern);
        patternRhythms.forEach((pattern) => {
          const patternValues = pattern.abcValue.map((v) =>
            String(parseInt(v))
          );
          const patternRegex = new RegExp(
            `[A-Ga-g][,']*${patternValues[0]}\\s*[A-Ga-g][,']*${patternValues[1]}`
          );
          expect(abcString).toMatch(patternRegex);
        });
      }
    });
  });

  test("should generate varied rhythms across measures", () => {
    const rhythmOptions = [
      {
        name: "quarter",
        abcValue: ["8"],
        meterValue: [4],
        totalValue: 8,
        weight: 1,
        pattern: false,
        rest: false,
        oddsWeight: 1,
        maxRng: 0.5,
        symbol: "♩",
      },
      {
        name: "eighthEighth",
        abcValue: ["4", "4"],
        meterValue: [2, 2],
        totalValue: 8,
        weight: 1,
        pattern: true,
        rest: false,
        oddsWeight: 1,
        maxRng: 1.0,
        symbol: "♫",
      },
      {
        name: "dottedQuarter",
        abcValue: ["12"],
        meterValue: [6],
        totalValue: 12,
        weight: 1,
        pattern: false,
        rest: false,
        oddsWeight: 1,
        maxRng: 0.5,
        symbol: "♩.",
      },
    ] as Rhythm[];

    const partsObject: PartsObject = {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [16, 28],
          selectedRange: {
            1: [16, 28],
            2: [16, 28],
            3: [16, 28],
            4: [16, 28],
            5: [16, 28],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 23],
          selectedRange: {
            1: [12, 23],
            2: [12, 23],
            3: [12, 23],
            4: [12, 23],
            5: [12, 23],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [8, 19],
          selectedRange: {
            1: [8, 19],
            2: [8, 19],
            3: [8, 19],
            4: [8, 19],
            5: [8, 19],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [0, 16],
          selectedRange: {
            1: [0, 16],
            2: [0, 16],
            3: [0, 16],
            4: [0, 16],
            5: [0, 16],
          },
        },
      },
    };

    // Run multiple generations to ensure randomness
    const results = Array.from({ length: 5 }, () =>
      createNewSr(
        baseParams.bpm,
        baseParams.key,
        baseParams.timeSig,
        baseParams.level,
        baseParams.measures,
        baseParams.maxSkip,
        partsObject,
        rhythmOptions
      )
    );

    // Extract rhythm patterns from each generation
    const rhythmPatterns = results
      .map((result) => {
        if (!result) return null;
        const [abcString] = result;

        // Get soprano line rhythms
        const sopranoLine = abcString
          .split("\n")
          .find((line) => line.startsWith("[V:S]"));

        if (!sopranoLine) return null;

        // Extract rhythm values
        const rhythms = sopranoLine
          .match(/[A-Ga-g][,']*(\d+)/g)
          ?.map((note) => note.match(/\d+/)?.[0]);

        return rhythms;
      })
      .filter(Boolean);

    // Verify we have different rhythm patterns across generations
    const uniquePatterns = new Set(
      rhythmPatterns.map((pattern) => pattern?.join(","))
    );
    expect(uniquePatterns.size).toBeGreaterThan(1);

    // Check that each generation uses multiple rhythm values
    rhythmPatterns.forEach((pattern) => {
      if (!pattern) return;
      const uniqueRhythmsInPattern = new Set(pattern);
      expect(uniqueRhythmsInPattern.size).toBeGreaterThan(1);
    });
  });
});
