import {
  prepareVoiceParts,
  validateVoiceParts,
  generatePossibleNotes,
} from "../../src/lib/prep-params";
import type { VoicePart, Note } from "../../src/lib/types";
import { describe, expect, test } from "bun:test";
import { noteArray } from "../../src/resources/noteArray";

const NOTE_NAMES = ["C", "D", "E", "F", "G", "A", "B"];

type VoiceRanges = { [key: string]: [number, number] };

// prepareVoiceParts / generatePossibleNotes / validateVoiceParts all gained a
// `key` parameter, and prepareVoiceParts now takes the part definitions from a
// PartsObject rather than inventing them from the range keys. These helpers
// restate the old defaults so the expectations below still describe the same
// four SATB parts, in the same order.
const KEY = "C";

const PART_DEFS: Record<string, { order: number; smallName: string; clef: string; range: [number, number] }> = {
  bass: { order: 0, smallName: "b", clef: "bass", range: [0, 14] },
  tenor: { order: 1, smallName: "t", clef: "bass", range: [7, 21] },
  alto: { order: 2, smallName: "a", clef: "treble", range: [14, 28] },
  soprano: { order: 3, smallName: "s", clef: "treble", range: [21, 35] },
};

/** A PartsObject covering exactly the voices named in `ranges`, in SATB order. */
function partsFor(ranges?: VoiceRanges) {
  const names = ranges ? Object.keys(ranges) : Object.keys(PART_DEFS);
  const parts: Record<string, any> = {};
  for (const name of names) {
    const def = PART_DEFS[name] ?? {
      order: Object.keys(parts).length,
      smallName: name[0],
      clef: "treble",
      range: ranges?.[name] ?? [0, 14],
    };
    parts[name] = { ...def, range: ranges?.[name] ?? def.range };
  }
  return { numofParts: names.length, parts };
}

describe("Voice Part Preparation", () => {
  test("prepareVoiceParts creates valid voice parts", () => {
    const ranges: VoiceRanges = {
      bass: [0, 14] as [number, number],
      tenor: [7, 21] as [number, number],
      alto: [14, 28] as [number, number],
      soprano: [21, 35] as [number, number],
    };

    const voiceParts = prepareVoiceParts(KEY, ranges, partsFor(ranges));
    expect(voiceParts.length).toBe(4);

    // Check bass voice part
    expect(voiceParts[0].smallName).toBe("b");
    expect(voiceParts[0].range[0]).toBe(0);
    expect(voiceParts[0].range[1]).toBe(14);
    // Check first note (index 0)
    expect(voiceParts[0].possibleNotes[0].name).toBe("C,,");
    expect(voiceParts[0].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[0].possibleNotes[0].pitchValue).toBe(0);
    // Check last note (index 14)
    expect(voiceParts[0].possibleNotes[14].name).toBe("C");
    expect(voiceParts[0].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[0].possibleNotes[14].pitchValue).toBe(14);

    // Check tenor voice part
    expect(voiceParts[1].smallName).toBe("t");
    expect(voiceParts[1].range[0]).toBe(7);
    expect(voiceParts[1].range[1]).toBe(21);
    // Check first note (index 7)
    expect(voiceParts[1].possibleNotes[0].name).toBe("C,");
    expect(voiceParts[1].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[1].possibleNotes[0].pitchValue).toBe(7);
    // Check last note (index 21)
    expect(voiceParts[1].possibleNotes[14].name).toBe("c");
    expect(voiceParts[1].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[1].possibleNotes[14].pitchValue).toBe(21);

    // Check alto voice part
    expect(voiceParts[2].smallName).toBe("a");
    expect(voiceParts[2].range[0]).toBe(14);
    expect(voiceParts[2].range[1]).toBe(28);
    // Check first note (index 14)
    expect(voiceParts[2].possibleNotes[0].name).toBe("C");
    expect(voiceParts[2].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[2].possibleNotes[0].pitchValue).toBe(14);
    // Check last note (index 28)
    expect(voiceParts[2].possibleNotes[14].name).toBe("c'");
    expect(voiceParts[2].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[2].possibleNotes[14].pitchValue).toBe(28);

    // Check soprano voice part
    expect(voiceParts[3].smallName).toBe("s");
    expect(voiceParts[3].range[0]).toBe(21);
    expect(voiceParts[3].range[1]).toBe(35);
    // Check first note (index 21)
    expect(voiceParts[3].possibleNotes[0].name).toBe("c");
    expect(voiceParts[3].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[3].possibleNotes[0].pitchValue).toBe(21);
    // Check last note (index 35)
    expect(voiceParts[3].possibleNotes[14].name).toBe("c''");
    expect(voiceParts[3].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[3].possibleNotes[14].pitchValue).toBe(35);
  });

  test("validateVoiceParts accepts valid ranges", () => {
    const voiceParts: VoicePart[] = [
      {
        smallName: "b",
        range: [0, 12] as [number, number],
        possibleNotes: generatePossibleNotes([0, 12], KEY),
      },
      {
        smallName: "t",
        range: [12, 24] as [number, number],
        possibleNotes: generatePossibleNotes([12, 24], KEY),
      },
    ];

    try {
      validateVoiceParts(voiceParts, KEY);
      expect(true).toBe(true);
    } catch (e) {
      expect(true).toBe(false);
    }
  });

  test("validateVoiceParts rejects invalid range format", () => {
    const voiceParts: VoicePart[] = [
      {
        smallName: "b",
        range: [0, 12] as [number, number],
        possibleNotes: generatePossibleNotes([0, 12], KEY),
      },
      {
        smallName: "t",
        range: [24, 36] as [number, number],
        possibleNotes: generatePossibleNotes([24, 36], KEY),
      },
    ];

    try {
      validateVoiceParts(voiceParts, KEY);
      expect(true).toBe(false);
    } catch (e) {
      expect(true).toBe(true);
    }
  });

  test("validateVoiceParts rejects negative range values", () => {
    const voiceParts: VoicePart[] = [
      {
        smallName: "b",
        range: [-1, 12] as [number, number],
        possibleNotes: generatePossibleNotes([-1, 12], KEY),
      },
    ];

    try {
      validateVoiceParts(voiceParts, KEY);
      expect(true).toBe(false);
    } catch (e) {
      expect(true).toBe(true);
    }
  });

  test("validateVoiceParts accepts overlapping ranges", () => {
    const voiceParts: VoicePart[] = [
      {
        smallName: "b",
        range: [0, 15] as [number, number],
        possibleNotes: generatePossibleNotes([0, 15], KEY),
      },
      {
        smallName: "t",
        range: [7, 21] as [number, number],
        possibleNotes: generatePossibleNotes([7, 21], KEY),
      },
    ];

    try {
      validateVoiceParts(voiceParts, KEY);
      expect(true).toBe(true);
    } catch (e) {
      expect(true).toBe(false);
    }
  });

  test("validateVoiceParts accepts non-overlapping ranges", () => {
    const voiceParts: VoicePart[] = [
      {
        smallName: "b",
        range: [0, 7] as [number, number],
        possibleNotes: generatePossibleNotes([0, 7], KEY),
      },
      {
        smallName: "t",
        range: [8, 14] as [number, number],
        possibleNotes: generatePossibleNotes([8, 14], KEY),
      },
    ];

    try {
      validateVoiceParts(voiceParts, KEY);
      expect(true).toBe(true);
    } catch (e) {
      expect(true).toBe(false);
    }
  });

  test("validateVoiceParts rejects invalid possible notes", () => {
    const voiceParts: VoicePart[] = [
      {
        range: [0, 7] as [number, number],
        smallName: "b",
        possibleNotes: [
          { name: "C1", degree: 0, pitchValue: 12 }, // Wrong pitch value
          { name: "D1", degree: 2, pitchValue: 14 }, // Wrong pitch value
          { name: "E1", degree: 4, pitchValue: 16 }, // Wrong pitch value
        ],
      },
    ];

    let error: Error | undefined;
    try {
      validateVoiceParts(voiceParts, KEY);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe("Possible notes do not match voice part range");
  });
});

describe("prepareVoiceParts", () => {
  test("returns default voice parts when no ranges provided", () => {
    const voiceParts = prepareVoiceParts(KEY, undefined, partsFor());
    expect(voiceParts.length).toBe(4);
    expect(voiceParts[0].smallName).toBe("b"); // bass
    // Check first note (C0)
    expect(voiceParts[0].possibleNotes[0].name).toBe("C,,");
    expect(voiceParts[0].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[0].possibleNotes[0].pitchValue).toBe(0);
    // Check last note (D1)
    expect(voiceParts[0].possibleNotes[14].name).toBe("C");
    expect(voiceParts[0].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[0].possibleNotes[14].pitchValue).toBe(14);

    expect(voiceParts[1].smallName).toBe("t"); // tenor
    // Check first note (index 7)
    expect(voiceParts[1].possibleNotes[0].name).toBe("C,");
    expect(voiceParts[1].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[1].possibleNotes[0].pitchValue).toBe(7);
    // Check last note (index 21)
    expect(voiceParts[1].possibleNotes[14].name).toBe("c");
    expect(voiceParts[1].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[1].possibleNotes[14].pitchValue).toBe(21);

    expect(voiceParts[2].smallName).toBe("a"); // alto
    // Check first note (index 14)
    expect(voiceParts[2].possibleNotes[0].name).toBe("C");
    expect(voiceParts[2].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[2].possibleNotes[0].pitchValue).toBe(14);
    // Check last note (index 28)
    expect(voiceParts[2].possibleNotes[14].name).toBe("c'");
    expect(voiceParts[2].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[2].possibleNotes[14].pitchValue).toBe(28);

    expect(voiceParts[3].smallName).toBe("s"); // soprano
    // Check first note (index 21)
    expect(voiceParts[3].possibleNotes[0].name).toBe("c");
    expect(voiceParts[3].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[3].possibleNotes[0].pitchValue).toBe(21);
    // Check last note (index 35)
    expect(voiceParts[3].possibleNotes[14].name).toBe("c''");
    expect(voiceParts[3].possibleNotes[14].degree).toBe(0);
    expect(voiceParts[3].possibleNotes[14].pitchValue).toBe(35);
  });

  test("uses custom ranges when provided", () => {
    const customRanges = {
      bass: [0, 12] as [number, number],
      tenor: [6, 18] as [number, number],
      alto: [12, 24] as [number, number],
      soprano: [18, 30] as [number, number],
    };
    const voiceParts = prepareVoiceParts(KEY, customRanges, partsFor(customRanges));
    expect(voiceParts.length).toBe(4);
    expect(voiceParts[0].range[0]).toBe(0);
    expect(voiceParts[0].range[1]).toBe(12);
    // Check first note (index 0)
    expect(voiceParts[0].possibleNotes[0].name).toBe("C,,");
    expect(voiceParts[0].possibleNotes[0].degree).toBe(0);
    expect(voiceParts[0].possibleNotes[0].pitchValue).toBe(0);
    // Check last note (index 12)
    expect(voiceParts[0].possibleNotes[12].name).toBe("A,");
    expect(voiceParts[0].possibleNotes[12].degree).toBe(5);
    expect(voiceParts[0].possibleNotes[12].pitchValue).toBe(12);

    expect(voiceParts[1].range[0]).toBe(6);
    expect(voiceParts[1].range[1]).toBe(18);
    // Check first note (index 6)
    expect(voiceParts[1].possibleNotes[0].name).toBe("B,,");
    expect(voiceParts[1].possibleNotes[0].degree).toBe(6);
    expect(voiceParts[1].possibleNotes[0].pitchValue).toBe(6);
    // Check last note (index 18)
    expect(voiceParts[1].possibleNotes[12].name).toBe("G");
    expect(voiceParts[1].possibleNotes[12].degree).toBe(4);
    expect(voiceParts[1].possibleNotes[12].pitchValue).toBe(18);

    expect(voiceParts[2].range[0]).toBe(12);
    expect(voiceParts[2].range[1]).toBe(24);
    // Check first note (index 12)
    expect(voiceParts[2].possibleNotes[0].name).toBe("A,");
    expect(voiceParts[2].possibleNotes[0].degree).toBe(5);
    expect(voiceParts[2].possibleNotes[0].pitchValue).toBe(12);
    // Check last note (index 24)
    expect(voiceParts[2].possibleNotes[12].name).toBe("f");
    expect(voiceParts[2].possibleNotes[12].degree).toBe(3);
    expect(voiceParts[2].possibleNotes[12].pitchValue).toBe(24);

    expect(voiceParts[3].range[0]).toBe(18);
    expect(voiceParts[3].range[1]).toBe(30);
    // Check first note (index 18)
    expect(voiceParts[3].possibleNotes[0].name).toBe("G");
    expect(voiceParts[3].possibleNotes[0].degree).toBe(4);
    expect(voiceParts[3].possibleNotes[0].pitchValue).toBe(18);
    // Check last note (index 30)
    expect(voiceParts[3].possibleNotes[12].name).toBe("e'");
    expect(voiceParts[3].possibleNotes[12].degree).toBe(2);
    expect(voiceParts[3].possibleNotes[12].pitchValue).toBe(30);
  });

  test("throws error for invalid range format", () => {
    const invalidRanges = {
      bass: [0] as [number],
      tenor: [6, 18] as [number, number],
      alto: [12, 24] as [number, number],
      soprano: [18, 30] as [number, number],
    };
    let error: Error | undefined;
    try {
      prepareVoiceParts(KEY, invalidRanges as any, partsFor());
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe("Invalid range format");
  });

  test("throws error for invalid range values", () => {
    const invalidRanges = {
      bass: [-1, 12] as [number, number],
      tenor: [6, 18] as [number, number],
      alto: [12, 24] as [number, number],
      soprano: [18, 30] as [number, number],
    };
    let error: Error | undefined;
    try {
      prepareVoiceParts(KEY, invalidRanges, partsFor(invalidRanges));
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe("Invalid range values");
  });
});

describe("validateVoiceParts", () => {
  test("validates correctly formatted voice parts", () => {
    const voiceParts: VoicePart[] = [
      {
        range: [0, 12],
        smallName: "b",
        possibleNotes: generatePossibleNotes([0, 12], KEY),
      },
      {
        range: [6, 18],
        smallName: "t",
        possibleNotes: generatePossibleNotes([6, 18], KEY),
      },
      {
        range: [12, 24],
        smallName: "a",
        possibleNotes: generatePossibleNotes([12, 24], KEY),
      },
      {
        range: [18, 30],
        smallName: "s",
        possibleNotes: generatePossibleNotes([18, 30], KEY),
      },
    ];
    let error: Error | undefined;
    try {
      validateVoiceParts(voiceParts, KEY);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBe(undefined);
  });

  test("throws error for empty array", () => {
    let error: Error | undefined;
    try {
      validateVoiceParts([], KEY);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe("Voice parts must be a non-empty array");
  });

  test("throws error for missing smallName", () => {
    const voiceParts: VoicePart[] = [
      {
        range: [0, 12] as [number, number],
        smallName: "",
        possibleNotes: generatePossibleNotes([0, 12], KEY),
      },
      {
        range: [6, 18] as [number, number],
        smallName: "t",
        possibleNotes: generatePossibleNotes([6, 18], KEY),
      },
    ];
    let error: Error | undefined;
    try {
      validateVoiceParts(voiceParts, KEY);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe("Missing smallName for voice part");
  });

  test("throws error for invalid range values", () => {
    const voiceParts: VoicePart[] = [
      {
        range: [-1, 12] as [number, number],
        smallName: "b",
        possibleNotes: generatePossibleNotes([-1, 12], KEY),
      },
      {
        range: [6, 18] as [number, number],
        smallName: "t",
        possibleNotes: generatePossibleNotes([6, 18], KEY),
      },
    ];
    let error: Error | undefined;
    try {
      validateVoiceParts(voiceParts, KEY);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe("Invalid range values");
  });
});
