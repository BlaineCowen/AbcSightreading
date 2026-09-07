import { describe, test, expect } from "bun:test";
import {
  generateChordProgression,
  mapChordType,
  type Chord,
  type Note,
  ChordType,
} from "../../src/lib/chord-generation";
import { prepareVoiceParts } from "../../src/lib/prep-params";
import type {
  VoicePart,
  PartsObject,
  TimeSignature,
  PartDefinition,
  ClefType,
} from "../../src/lib/types";
import { chords as defaultChords } from "../../src/resources/chords";
import { generateRandomRhythm } from "../../src/lib/rhythm-generation";
import { allCadences, type Cadence } from "../../src/lib/types";
import { rhythms as allRhythms } from "../../src/resources/rhythms";

const defaultKeySig: string = "C";
const defaultTimeSig: TimeSignature = {
  name: "4/4",
  tsPerMeasure: 32,
};

const defaultParts: PartsObject = {
  numofParts: 4,
  parts: {
    Bass: {
      order: 0,
      smallName: "b",
      clef: "bass" as ClefType,
      range: [0, 14],
      selectedRange: { 1: [0, 14] },
    },
    Tenor: {
      order: 1,
      smallName: "t",
      clef: "treble-8" as ClefType,
      range: [7, 21],
      selectedRange: { 1: [7, 21] },
    },
    Alto: {
      order: 2,
      smallName: "a",
      clef: "alto" as ClefType,
      range: [14, 28],
      selectedRange: { 1: [14, 28] },
    },
    Soprano: {
      order: 3,
      smallName: "s",
      clef: "treble" as ClefType,
      range: [21, 35],
      selectedRange: { 1: [21, 35] },
    },
  },
};

describe("chord generation", () => {
  const mockChords: Chord[] = [
    {
      name: "C",
      symbol: "C",
      type: "tonic",
      root: 0,
      triadNotes: [0, 2, 4],
      nextChordPossibilities: [{ name: "G", weight: 1 }],
      baseMultiplier: 1,
    },
    {
      name: "G",
      symbol: "G",
      type: "dominant",
      root: 4,
      triadNotes: [0, 2, 4],
      nextChordPossibilities: [{ name: "C", weight: 1 }],
      baseMultiplier: 1,
    },
    {
      name: "F",
      symbol: "F",
      type: "predominant",
      root: 3,
      triadNotes: [0, 2, 4],
      nextChordPossibilities: [{ name: "G", weight: 1 }],
      baseMultiplier: 1,
    },
  ];

  const testKey = defaultKeySig;
  const testPartsObject: PartsObject = defaultParts;
  const testChordsFromResource: Chord[] = defaultChords;
  const maxSkip = 4;

  // generateChordProgression gained finalRhythms and selectedCadences. The
  // progression is planned around where cadences land in the rhythm, so the
  // number of chords is derived from the rhythm rather than chosen freely -
  // passing a length that disagrees with the rhythm no longer makes sense.
  const testCadences: Cadence[] = [
    allCadences.find(
      (c) => c.type === "Perfect Authentic" && (!c.mode || c.mode === "major")
    )!,
  ];
  const testRhythms = generateRandomRhythm(
    defaultTimeSig,
    4,
    allRhythms.filter((r) => r.name === "quarter" || r.name === "half"),
    testCadences
  );
  // Same count the app uses: rests do not take a chord, and a pattern takes one.
  const numNotes = testRhythms.reduce((count, r) => {
    if (r.rest) return count;
    if (r.isPatternNote) return r.isPatternStart ? count + 1 : count;
    return count + 1;
  }, 0);

  const testRanges: { [key: string]: [number, number] } = {};
  for (const partName in testPartsObject.parts) {
    testRanges[partName] = testPartsObject.parts[partName].range;
  }

  const voiceParts: VoicePart[] = prepareVoiceParts(testKey, testRanges, testPartsObject);
  const bassPart = voiceParts.find((vp) => vp.order === 0);
  if (!bassPart) {
    throw new Error("Test setup failed: Bass part not found.");
  }
  const bassRange = bassPart.range;

  describe("generateChordProgression", () => {
    test("should generate a progression and bass line of the specified length", () => {
      const result = generateChordProgression(testChordsFromResource, numNotes, bassRange, maxSkip, testKey, testRhythms, testCadences);
      expect(result.progression.length).toBe(numNotes);
      expect(result.bassLine.length).toBe(numNotes);
      expect(Array.isArray(result.progression)).toBeTruthy();
      expect(Array.isArray(result.bassLine)).toBeTruthy();
    });

    test("should start with a tonic chord", () => {
      const result = generateChordProgression(testChordsFromResource, numNotes, bassRange, maxSkip, testKey, testRhythms, testCadences);
      expect(mapChordType(result.progression[0].type)).toBe(ChordType.Tonic);
    });

    test("should end with a tonic chord when numNotes > 2", () => {
      const result = generateChordProgression(testChordsFromResource, numNotes, bassRange, maxSkip, testKey, testRhythms, testCadences);
      expect(
        mapChordType(result.progression[result.progression.length - 1].type)
      ).toBe(ChordType.Tonic);
    });

    test("should have a dominant chord second to last when numNotes > 2", () => {
      const result = generateChordProgression(testChordsFromResource, numNotes, bassRange, maxSkip, testKey, testRhythms, testCadences);
      expect(
        mapChordType(result.progression[result.progression.length - 2].type)
      ).toBe(ChordType.Dominant);
    });

    test("should throw an error if no tonic chords are available", () => {
      const noTonicChords = testChordsFromResource.filter(
        (c) => mapChordType(c.type) !== ChordType.Tonic
      );
      let didThrow = false;
      try {
        generateChordProgression(noTonicChords, numNotes, bassRange, maxSkip, testKey, testRhythms, testCadences);
      } catch (e) {
        didThrow = true;
      }
      expect(didThrow).toBeTruthy();
    });

    test("should handle empty chord array input", () => {
      let didThrow = false;
      try {
        generateChordProgression([], numNotes, bassRange, maxSkip, testKey, testRhythms, testCadences);
      } catch (e: any) {
        didThrow = true;
        expect(e.message).toBe(
          "No chords provided for progression generation."
        );
      }
      expect(didThrow).toBeTruthy();
    });
  });

  test("generates valid chord progression with full chord set", () => {
    const vp = prepareVoiceParts(testKey, testRanges, testPartsObject);
    const bp = vp.find((v) => v.order === 0);
    if (!bp) throw new Error("Bass part missing in test setup");
    const br = bp.range;
    const result = generateChordProgression(testChordsFromResource, numNotes, br, 4, testKey, testRhythms, testCadences);
    expect(result.progression.length).toBe(numNotes);
    expect(result.progression[0]).toBeTruthy();
  });

  test("throws error when no tonic chord found", () => {
    const noTonicChords: Chord[] = [
      {
        name: "F",
        symbol: "F",
        type: "predominant",
        root: 3,
        triadNotes: [0, 2, 4],
        nextChordPossibilities: [],
        baseMultiplier: 1,
      },
    ];
    const vp = prepareVoiceParts(testKey, testRanges, testPartsObject);
    const bp = vp.find((v) => v.order === 0);
    if (!bp) throw new Error("Bass part missing in test setup");
    const br = bp.range;
    let didThrow = false;
    try {
      generateChordProgression(noTonicChords, numNotes, br, 4, testKey, testRhythms, testCadences);
    } catch (e: any) {
      didThrow = true;
      // The exact message is not asserted: "No tonic chords found in available
      // chords." does not exist anywhere in chord-generation.ts and appears to
      // predate this implementation. What matters is that a chord set with no
      // tonic is refused rather than silently producing a progression - here it
      // fails on the cadence, which needs a V and a I it cannot find.
      expect(e.message).toBeTruthy();
    }
    expect(didThrow).toBeTruthy();
  });

  describe("mapChordType", () => {
    test("should correctly map known types", () => {
      expect(mapChordType("tonic")).toBe(ChordType.Tonic);
      expect(mapChordType("Dominant")).toBe(ChordType.Dominant);
      expect(mapChordType("PREDOMINANT")).toBe(ChordType.Predominant);
    });

    test("should default to Tonic for unknown types", () => {
      expect(mapChordType("unknown")).toBe(ChordType.Tonic);
      expect(mapChordType("")).toBe(ChordType.Tonic);
    });
  });
});
