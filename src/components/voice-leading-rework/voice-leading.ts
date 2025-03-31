/**
 * @file voice-leading.ts
 * @description Core voice leading functions and utilities
 */

import type { Note } from "./types";
import { VoiceLeadingError } from "./types";
import { noteArray } from "../../resources/noteArray";

const baseNoteValues: { [key: string]: number } = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
};

/**
 * Cache for note range calculations
 */
const noteRangeCache = new Map<string, Note[]>();

/**
 * Retries voice leading generation with exponential backoff
 */
export async function retryVoiceLeading<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * Math.pow(2, attempt))
        );
      }
    }
  }

  throw lastError || new Error("Voice leading generation failed");
}

/**
 * Checks for illegal voice leading between two chords
 */
export function checkForIllegalVoiceLeading(
  currentNotes: Note[],
  previousNotes: Note[]
): boolean {
  // If we don't have enough notes to compare, no illegal voice leading
  if (currentNotes.length < 2 || previousNotes.length < 2) {
    return false;
  }

  // Check for parallel fifths
  for (let i = 0; i < currentNotes.length - 1; i++) {
    for (let j = i + 1; j < currentNotes.length; j++) {
      const currentInterval = Math.abs(
        currentNotes[i].pitchValue - currentNotes[j].pitchValue
      );
      const previousInterval = Math.abs(
        previousNotes[i].pitchValue - previousNotes[j].pitchValue
      );

      // If both intervals are perfect fifths (7 semitones)
      if (currentInterval === 7 && previousInterval === 7) {
        // Check if both voices moved in the same direction
        const voice1Motion =
          currentNotes[i].pitchValue - previousNotes[i].pitchValue;
        const voice2Motion =
          currentNotes[j].pitchValue - previousNotes[j].pitchValue;

        if (
          (voice1Motion > 0 && voice2Motion > 0) ||
          (voice1Motion < 0 && voice2Motion < 0)
        ) {
          return true; // Found parallel fifths
        }
      }
    }
  }

  return false;
}

/**
 * Finds the closest scale degrees within a given range
 */
export function findClosestDegrees(
  currentDegree: number,
  possibleDegrees: number[],
  range: [number, number]
): number[] {
  return possibleDegrees
    .filter((degree) => isDegreeWithinRange(degree, range[0], range[1]))
    .sort((a, b) => Math.abs(a - currentDegree) - Math.abs(b - currentDegree));
}

/**
 * Checks if a degree is within a given range
 */
export function isDegreeWithinRange(
  degree: number,
  min: number,
  max: number
): boolean {
  return degree >= min && degree <= max;
}
