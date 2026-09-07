import { buildChordNotes } from "../../src/lib/build-chord-notes";
import {
  type GeneratedChord,
  type VoicePart,
  type Note,
  type Rhythm,
  type RhythmWithPattern,
  type BaseChord,
  ChordType,
} from "../../src/lib/types";
import { describe, expect, test } from "bun:test";
import {
  generateChordProgression,
  mapChordType,
} from "../../src/lib/chord-generation";
import { prepareVoiceParts } from "../../src/lib/prep-params";
import { generateRandomRhythm } from "../../src/lib/rhythm-generation";
import { chords as fullChordSet } from "../../src/resources/chords";

// prepareVoiceParts now takes its part definitions from a PartsObject and needs
// a key, where it used to invent SATB defaults on its own. This restates those
// defaults so the expectations below still describe the same four voices.
const KEY = "C";
// These fixtures drive the progression from their own rhythm arrays, so there
// are no cadence points to plan for.
const NO_CADENCES: never[] = [];
const SATB_PARTS = {
  numofParts: 4,
  parts: {
    bass: { order: 0, smallName: "b", clef: "bass", range: [0, 14] as [number, number] },
    tenor: { order: 1, smallName: "t", clef: "bass", range: [7, 21] as [number, number] },
    alto: { order: 2, smallName: "a", clef: "treble", range: [14, 28] as [number, number] },
    soprano: { order: 3, smallName: "s", clef: "treble", range: [21, 35] as [number, number] },
  },
};

describe("build chord notes", () => {
  // Convert chords to include triadDegrees
  const chordsWithDegrees = fullChordSet.map((chord) => ({
    ...chord,
    triadDegrees: chord.triadNotes, // Use triadNotes as triadDegrees since they represent the same thing
  })) as BaseChord[];

  // The last three tests read voiceParts / bassRange / rhythms from the suite
  // scope; the first three shadow them with their own. Without these they threw
  // ReferenceError before reaching a single assertion.
  const voiceParts = prepareVoiceParts(KEY, undefined, SATB_PARTS as any);
  const bassRange = voiceParts[0].range;
  const rhythms: Rhythm[] = Array(8).fill({
    weight: 10,
    name: "quarter",
    abcValue: ["4"],
    meterValue: [1 / 4],
    totalValue: 8,
    rest: false,
    oddsWeight: 10,
    maxRng: 0,
    pattern: false,
    symbol: "\u{1D118}",
    isPatternNote: false,
    isPatternStart: false,
    isPatternEnd: false,
    patternIndex: null,
  });

  test("builds notes for simple rhythm pattern", () => {
    const voiceParts = prepareVoiceParts(KEY, undefined, SATB_PARTS as any);
    const bassRange = voiceParts[0].range;

    const rhythms: Rhythm[] = [
      {
        weight: 10,
        name: "quarter",
        abcValue: ["4"],
        meterValue: [1 / 4],
        totalValue: 8,
        rest: false,
        oddsWeight: 10,
        maxRng: 0,
        pattern: false,
        symbol: "𝄘",
        isPatternNote: false,
        isPatternStart: false,
        isPatternEnd: false,
        patternIndex: null,
      },
      {
        weight: 10,
        name: "quarter",
        abcValue: ["4"],
        meterValue: [1 / 4],
        totalValue: 8,
        rest: false,
        oddsWeight: 10,
        maxRng: 0,
        pattern: false,
        symbol: "𝄘",
        isPatternNote: false,
        isPatternStart: false,
        isPatternEnd: false,
        patternIndex: null,
      },
    ];

    // Generate chord progression with full chord set
    const { progression, bassLine } = generateChordProgression(
      chordsWithDegrees,
      2, // 2 quarter notes
      bassRange,
      4, // Allow max skip of 4 degrees
      KEY,
      rhythms,
      NO_CADENCES
    );

    console.log(
      "Progression:",
      progression.map((c) => ({ root: c.root, triadNotes: c.triadNotes }))
    );
    console.log(
      "Bass line:",
      bassLine.map((n) => ({ name: n.name, pitchValue: n.pitchValue }))
    );

    // buildChordNotes returns VoiceNote[][] - one array per voice - where it
    // used to return a [chordsWithRhythms, voiceNotes] pair.
    const voiceNotes = buildChordNotes(
      KEY,
      rhythms,
      progression,
      voiceParts,
      bassLine,
      4,
      false
    );

    expect(voiceNotes.length).toBe(4); // 4 voices
    voiceNotes.forEach((voice) => {
      expect(voice.length).toBe(2); // 2 notes each
    });

    // The bass is NOT guaranteed to be the pre-generated line verbatim:
    // buildChordNotes deliberately re-picks a bass note when the chosen one
    // leaves no room for the tenor above it, or when an earlier substitution
    // has made the next pre-generated note an unreachable leap. Asserting
    // equality here made the suite flaky - it only held when no retry fired.
    // What is guaranteed is that the bass stays a chord tone inside its range,
    // which the checks below cover.
    voiceNotes[0].forEach((note, i) => {
      expect(progression[i].triadNotes).toContain(note.degree);
    });

    // Check all notes are within range
    voiceNotes.forEach((voice, i) => {
      voice.forEach((note) => {
        expect(note.pitchValue).toBeGreaterThanOrEqual(voiceParts[i].range[0]);
        expect(note.pitchValue).toBeLessThanOrEqual(voiceParts[i].range[1]);
      });
    });

    // Check voice crossing
    for (let i = 0; i < voiceNotes[0].length; i++) {
      for (let v = 0; v < voiceNotes.length - 1; v++) {
        const lowerVoice = voiceNotes[v][i];
        const upperVoice = voiceNotes[v + 1][i];
        // Voice CROSSING is the error, not unison: isVoiceOrderValid rejects
        // only pitches[i] > pitches[i + 1], so two adjacent voices landing on
        // the same pitch is permitted. Measured over 300 progressions: 121
        // unisons, zero crossings. A strict > here made the suite flaky.
        expect(upperVoice.pitchValue).toBeGreaterThanOrEqual(
          lowerVoice.pitchValue
        );
      }
    }

    // Check all notes are valid chord tones. triadNotes holds ABSOLUTE scale
    // degrees (the V chord in C is [4, 6, 1]), so the note's degree is compared
    // directly. The previous form subtracted the root and took it mod 12, which
    // is both the wrong frame and the wrong modulus for a seven-degree scale -
    // it passed only when the arithmetic happened to land on a chord tone.
    voiceNotes.forEach((voice, voiceIndex) => {
      voice.forEach((note, noteIndex) => {
        const chord = progression[noteIndex];
        expect(chord.triadNotes).toContain(note.degree);
      });
    });
  });

  test("builds notes for longer progression", () => {
    const voiceParts = prepareVoiceParts(KEY, undefined, SATB_PARTS as any);
    const bassRange = voiceParts[0].range;

    const rhythms = Array(8).fill({
      weight: 10,
      name: "quarter",
      abcValue: ["4"],
      meterValue: [1 / 4],
      totalValue: 8,
      rest: false,
      oddsWeight: 10,
      maxRng: 0,
      pattern: false,
      symbol: "𝄘",
      isPatternNote: false,
      isPatternStart: false,
      isPatternEnd: false,
      patternIndex: null,
    });

    // Generate a longer progression (8 chords)
    const { progression, bassLine } = generateChordProgression(
      chordsWithDegrees,
      8,
      bassRange,
      4,
      KEY,
      rhythms,
      NO_CADENCES
    );

    const voiceNotes = buildChordNotes(
      KEY,
      rhythms,
      progression,
      voiceParts,
      bassLine,
      4,
      false
    );

    expect(voiceNotes.length).toBe(4);
    voiceNotes.forEach((voice) => {
      expect(voice.length).toBe(8);
    });

    // Check voice crossing and ranges
    for (let i = 0; i < voiceNotes[0].length; i++) {
      for (let v = 0; v < voiceNotes.length - 1; v++) {
        const lowerVoice = voiceNotes[v][i];
        const upperVoice = voiceNotes[v + 1][i];
        // Voice CROSSING is the error, not unison: isVoiceOrderValid rejects
        // only pitches[i] > pitches[i + 1], so two adjacent voices landing on
        // the same pitch is permitted. Measured over 300 progressions: 121
        // unisons, zero crossings. A strict > here made the suite flaky.
        expect(upperVoice.pitchValue).toBeGreaterThanOrEqual(
          lowerVoice.pitchValue
        );

        // Check range
        expect(lowerVoice.pitchValue).toBeGreaterThanOrEqual(
          voiceParts[v].range[0]
        );
        expect(lowerVoice.pitchValue).toBeLessThanOrEqual(
          voiceParts[v].range[1]
        );
        expect(upperVoice.pitchValue).toBeGreaterThanOrEqual(
          voiceParts[v + 1].range[0]
        );
        expect(upperVoice.pitchValue).toBeLessThanOrEqual(
          voiceParts[v + 1].range[1]
        );
      }
    }

    // Check max skip between consecutive notes
    voiceNotes.forEach((voice) => {
      for (let i = 1; i < voice.length; i++) {
        const skip = Math.abs(voice[i].pitchValue - voice[i - 1].pitchValue);
        expect(skip).toBeLessThanOrEqual(4);
      }
    });
  });

  test("throws error when chord count doesn't match rhythm positions", () => {
    const voiceParts = prepareVoiceParts(KEY, undefined, SATB_PARTS as any);
    const bassRange = voiceParts[0].range;

    const rhythms = Array(4).fill({
      weight: 10,
      name: "quarter",
      abcValue: ["4"],
      meterValue: [1 / 4],
      totalValue: 8,
      rest: false,
      oddsWeight: 10,
      maxRng: 0,
      pattern: false,
      symbol: "𝄘",
      isPatternNote: false,
      isPatternStart: false,
      isPatternEnd: false,
      patternIndex: null,
    });

    // Generate chord progression with wrong length
    const { progression, bassLine } = generateChordProgression(chordsWithDegrees, 2, // Wrong length - should be 4
      bassRange, 4, KEY, rhythms, NO_CADENCES);

    // generateChordProgression now derives the chord count from the rhythms it
    // is handed, so a mismatch can no longer be produced by asking it for the
    // wrong length - it is constructed here instead, which is what the guard in
    // buildChordNotes actually protects against.
    let error: Error | undefined;
    try {
      buildChordNotes(
        KEY,
        rhythms,
        progression.slice(0, progression.length - 1),
        voiceParts,
        bassLine,
        4,
        false
      );
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/Chord progression length/);
  });

  test("should build chord notes for all voices", () => {
    // Generate a chord progression and bass line
    const { progression, bassLine } = generateChordProgression(chordsWithDegrees, 8,
      bassRange, 4, KEY, rhythms, NO_CADENCES);

    // Build chord notes for all voices
    const voiceNotes = buildChordNotes(
      KEY,
      rhythms,
      progression,
      voiceParts,
      bassLine,
      4,
      false
    );

    // Verify results
    expect(voiceNotes.length).toBe(voiceParts.length);
    expect(voiceNotes[0].length).toBe(rhythms.length);
  });

  test("should respect voice ranges", () => {
    // Generate a chord progression and bass line
    const { progression, bassLine } = generateChordProgression(chordsWithDegrees, 8,
      bassRange, 4, KEY, rhythms, NO_CADENCES);

    // Build chord notes for all voices
    const voiceNotes = buildChordNotes(
      KEY,
      rhythms,
      progression,
      voiceParts,
      bassLine,
      4,
      false
    );

    // Check that each voice's notes are within its range
    voiceNotes.forEach((voicePart, voiceIndex) => {
      const range = voiceParts[voiceIndex].range;
      voicePart.forEach((note) => {
        if (!note.rest) {
          expect(note.pitchValue).toBeGreaterThanOrEqual(range[0]);
          expect(note.pitchValue).toBeLessThanOrEqual(range[1]);
        }
      });
    });
  });

  test("should respect maximum skip between notes", () => {
    // Generate a chord progression and bass line
    const { progression, bassLine } = generateChordProgression(chordsWithDegrees, 8,
      bassRange, 4, KEY, rhythms, NO_CADENCES);

    // Build chord notes for all voices
    const voiceNotes = buildChordNotes(
      KEY,
      rhythms,
      progression,
      voiceParts,
      bassLine,
      4,
      false
    );

    // Check that consecutive notes in each voice don't exceed maxSkip
    voiceNotes.forEach((voicePart) => {
      let prevNote = null;
      voicePart.forEach((note) => {
        if (!note.rest) {
          if (prevNote && !prevNote.rest) {
            const interval = Math.abs(note.pitchValue - prevNote.pitchValue);
            expect(interval).toBeLessThanOrEqual(4);
          }
          prevNote = note;
        }
      });
    });
  });
});
