import { buildChordNotes } from "../lib/build-chord-notes";
import {
  type GeneratedChord,
  type VoicePart,
  type Note,
  type Rhythm,
  type RhythmWithPattern,
  type BaseChord,
  ChordType,
} from "../lib/types";
import { describe, expect, test } from "bun:test";
import {
  generateChordProgression,
  mapChordType,
} from "../lib/chord-generation";
import { prepareVoiceParts } from "../lib/prep-params";
import { generateRandomRhythm } from "../lib/rhythm-generation";
import { chords as fullChordSet } from "../resources/chords";

describe("build chord notes", () => {
  // Convert chords to include triadDegrees
  const chordsWithDegrees = fullChordSet.map((chord) => ({
    ...chord,
    triadDegrees: chord.triadNotes, // Use triadNotes as triadDegrees since they represent the same thing
  })) as BaseChord[];

  test("builds notes for simple rhythm pattern", () => {
    const voiceParts = prepareVoiceParts();
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
      4 // Allow max skip of 4 degrees
    );

    console.log(
      "Progression:",
      progression.map((c) => ({ root: c.root, triadNotes: c.triadNotes }))
    );
    console.log(
      "Bass line:",
      bassLine.map((n) => ({ name: n.name, pitchValue: n.pitchValue }))
    );

    const [chordsWithRhythms, voiceNotes] = buildChordNotes(
      rhythms,
      progression,
      voiceParts,
      bassLine
    );

    expect(chordsWithRhythms.length).toBe(2);
    expect(voiceNotes.length).toBe(4); // 4 voices
    voiceNotes.forEach((voice) => {
      expect(voice.length).toBe(2); // 2 notes each
    });

    // Check bass line matches input
    expect(voiceNotes[0][0].pitchValue).toBe(bassLine[0].pitchValue);
    expect(voiceNotes[0][1].pitchValue).toBe(bassLine[1].pitchValue);

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
        expect(upperVoice.pitchValue).toBeGreaterThan(lowerVoice.pitchValue);
      }
    }

    // Check all notes are valid chord tones
    voiceNotes.forEach((voice, voiceIndex) => {
      voice.forEach((note, noteIndex) => {
        const chord = progression[noteIndex];
        const relativeDegree = (note.degree - chord.root + 12) % 12;
        expect(chord.triadNotes).toContain(relativeDegree);
      });
    });
  });

  test("builds notes for longer progression", () => {
    const voiceParts = prepareVoiceParts();
    const bassRange = voiceParts[0].range;

    // Generate a longer progression (8 chords)
    const { progression, bassLine } = generateChordProgression(
      chordsWithDegrees,
      8,
      bassRange,
      4
    );

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

    const [chordsWithRhythms, voiceNotes] = buildChordNotes(
      rhythms,
      progression,
      voiceParts,
      bassLine
    );

    expect(chordsWithRhythms.length).toBe(8);
    expect(voiceNotes.length).toBe(4);
    voiceNotes.forEach((voice) => {
      expect(voice.length).toBe(8);
    });

    // Check voice crossing and ranges
    for (let i = 0; i < voiceNotes[0].length; i++) {
      for (let v = 0; v < voiceNotes.length - 1; v++) {
        const lowerVoice = voiceNotes[v][i];
        const upperVoice = voiceNotes[v + 1][i];
        expect(upperVoice.pitchValue).toBeGreaterThan(lowerVoice.pitchValue);

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
    const voiceParts = prepareVoiceParts();
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
    const { progression, bassLine } = generateChordProgression(
      chordsWithDegrees,
      2, // Wrong length - should be 4
      bassRange,
      4
    );

    let error: Error | undefined;
    try {
      buildChordNotes(rhythms, progression, voiceParts, bassLine);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/Chord progression length/);
  });

  test("should build chord notes for all voices", () => {
    // Generate a chord progression and bass line
    const { progression, bassLine } = generateChordProgression(
      chordsWithDegrees,
      8,
      bassRange,
      4
    );

    // Build chord notes for all voices
    const voiceNotes = buildChordNotes(
      rhythms,
      progression,
      voiceParts,
      bassLine
    );

    // Verify results
    expect(voiceNotes.length).toBe(voiceParts.length);
    expect(voiceNotes[0].length).toBe(rhythms.length);
  });

  test("should respect voice ranges", () => {
    // Generate a chord progression and bass line
    const { progression, bassLine } = generateChordProgression(
      chordsWithDegrees,
      8,
      bassRange,
      4
    );

    // Build chord notes for all voices
    const voiceNotes = buildChordNotes(
      rhythms,
      progression,
      voiceParts,
      bassLine
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
    const { progression, bassLine } = generateChordProgression(
      chordsWithDegrees,
      8,
      bassRange,
      4
    );

    // Build chord notes for all voices
    const voiceNotes = buildChordNotes(
      rhythms,
      progression,
      voiceParts,
      bassLine
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
