/**
 * @file chord-progression.ts
 * @description Chord progression generation and utilities
 */

import type { Chord, Note } from "./types";
import { ChordType, ChordProgressionError } from "./types";
import { getNotesInRange } from "../../lib/note-utils";

/**
 * Cache for chord lookups to improve performance
 */
const chordCache = new Map<string, Chord>();

/**
 * Gets a chord by name from cache or generates it
 */
export function getChordByName(name: string): Chord {
  if (chordCache.has(name)) {
    return chordCache.get(name)!;
  }

  const chord = generateChord(name);
  chordCache.set(name, chord);
  return chord;
}

/**
 * Generates a chord based on its name
 */
export function generateChord(name: string): Chord {
  // Implementation of chord generation
  const chord: Chord = {
    name,
    symbol: name, // Default to name if no specific symbol mapping
    triadNotes: [],
    root: 0,
    type: ChordType.Tonic,
    nextChordPossibilities: [],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
    baseMultiplier: 1,
  };

  // ... chord generation logic here

  return chord;
}

/**
 * Gets a random note from possible notes that matches the given scale degree
 */
function getRandomNoteForDegree(
  notes: Note[],
  degree: number
): Note | undefined {
  const possibleNotes = notes.filter((n) => n.degree === degree);
  if (possibleNotes.length === 0) return undefined;
  return possibleNotes[Math.floor(Math.random() * possibleNotes.length)];
}

/**
 * Gets the closest note to the previous note that matches the given scale degree
 */
function getClosestNoteForDegree(
  notes: Note[],
  degree: number,
  previousNote: Note,
  maxSkip: number
): Note | undefined {
  const possibleNotes = notes.filter((n) => n.degree === degree);
  if (possibleNotes.length === 0) return undefined;

  return possibleNotes.reduce((closest, current) => {
    const currentDistance = Math.abs(
      current.pitchValue - previousNote.pitchValue
    );
    const closestDistance = Math.abs(
      closest.pitchValue - previousNote.pitchValue
    );

    // If current note is too far, keep the closest one
    if (currentDistance > maxSkip) return closest;

    // If closest note is too far but current isn't, use current
    if (closestDistance > maxSkip && currentDistance <= maxSkip) return current;

    // Otherwise pick the closer one
    return currentDistance < closestDistance ? current : closest;
  });
}

/**
 * Weighted random selection for chord progression
 */
export function getRandomByWeight(
  items: { name: string; weight: number }[],
  chords: Chord[]
): Chord {
  const totalWeight = items.reduce((sum, { weight }) => sum + weight, 0);
  let random = Math.random() * totalWeight;

  for (const { name, weight } of items) {
    random -= weight;
    if (random <= 0) {
      const chord = chords.find((c) => c.name === name);
      if (!chord) {
        throw new ChordProgressionError(`Chord ${name} not found`);
      }
      return chord;
    }
  }

  throw new ChordProgressionError("Failed to select weighted chord");
}

/**
 * Generates a chord progression based on parameters
 */
export function generateChordProgression(
  chords: Chord[],
  numChords: number,
  bassRange: [number, number],
  maxSkip: number,
  key: { tonic: string; mode: "major" | "minor" }
): [Chord[], Note[]] {
  let attempts = 0;
  const maxAttempts = 100;

  // Get all possible bass notes in range
  const bassNotes = getNotesInRange(bassRange, key);

  if (bassNotes.length === 0) {
    throw new Error(
      `No valid bass notes found in range [${bassRange[0]}, ${bassRange[1]}]`
    );
  }

  while (attempts < maxAttempts) {
    try {
      // Start with tonic chord
      const startChord = chords.find((c) => c.name === "1");
      if (!startChord) {
        throw new Error("No tonic chord found");
      }

      const progression: Chord[] = [startChord];
      const bassLine: Note[] = [];

      // Get first bass note (tonic)
      const firstNote = getRandomNoteForDegree(bassNotes, 0);
      if (!firstNote) {
        throw new Error("No tonic notes found in bass range");
      }
      bassLine.push(firstNote);

      // Generate remaining chords
      for (let i = 1; i < numChords; i++) {
        const prevChord = progression[i - 1];
        const prevNote = bassLine[i - 1];
        let nextChord: Chord;

        // Special handling for the last three chords to ensure proper cadence
        if (i >= numChords - 3) {
          if (i === numChords - 3) {
            // Pre-dominant
            nextChord =
              chords.find(
                (c) =>
                  c.type === ChordType.Predominant &&
                  c.nextChordPossibilities.some((p) => {
                    const next = chords.find((nc) => nc.name === p.name);
                    return next && next.type === ChordType.Dominant;
                  })
              ) || chords.find((c) => c.name === "4")!;
          } else if (i === numChords - 2) {
            // Dominant
            nextChord = chords.find((c) => c.name === "5")!;
          } else {
            // Tonic
            nextChord = chords.find((c) => c.name === "1")!;
          }
        } else {
          // Random weighted selection for other chords
          nextChord = getRandomByWeight(
            prevChord.nextChordPossibilities,
            chords
          );
        }

        if (!nextChord) {
          throw new Error(`No valid next chord found at position ${i}`);
        }

        // Get bass note for this chord
        const bassNote = getClosestNoteForDegree(
          bassNotes,
          nextChord.root,
          prevNote,
          maxSkip
        );
        if (!bassNote) {
          throw new Error(
            `No valid bass note found for chord ${nextChord.name} at position ${i}`
          );
        }

        progression.push(nextChord);
        bassLine.push(bassNote);
      }

      return [progression, bassLine];
    } catch (error) {
      attempts++;
      if (attempts === maxAttempts) {
        throw new Error(
          `Failed to generate chord progression after ${maxAttempts} attempts: ${error}`
        );
      }
    }
  }

  throw new Error("Failed to generate chord progression");
}

/**
 * Validates a chord progression
 */
export function validateChordProgression(progression: Chord[]): boolean {
  if (progression.length < 4) return false;

  // Check if it starts with tonic
  if (progression[0].type !== ChordType.Tonic) return false;

  // Check if it ends with proper cadence
  const last = progression.length - 1;
  return (
    progression[last].type === ChordType.Tonic &&
    progression[last - 1].type === ChordType.Dominant &&
    [ChordType.Predominant, ChordType.SecondaryDominant].includes(
      progression[last - 2].type
    )
  );
}
