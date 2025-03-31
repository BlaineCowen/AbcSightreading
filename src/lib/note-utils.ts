import { noteArray } from "../resources/noteArray";

export interface Note {
  name: string; // The ABC notation name (e.g., "C,", "D", "e'")
  degree: number; // Scale degree (0-6 for diatonic scale)
  pitchValue: number; // Index in noteArray
}

export interface Key {
  tonic: string; // Root note of the key
  mode: "major" | "minor";
  sharps?: number[]; // Scale degrees that are sharp
  flats?: number[]; // Scale degrees that are flat
}

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
 * Gets all possible notes within a range
 * @param range - Array of [min, max] indices from noteArray
 * @param key - Key object defining the tonic and mode
 * @returns Array of Note objects within the range
 */
export function getNotesInRange(range: [number, number], key: Key): Note[] {
  if (range[0] < 0 || range[1] >= noteArray.length || range[0] > range[1]) {
    throw new Error("Invalid range");
  }

  const tonicBase = key.tonic.charAt(0).toUpperCase();
  const notes: Note[] = [];

  for (let i = range[0]; i <= range[1]; i++) {
    const noteName = noteArray[i];
    const baseNote = noteName.charAt(0).toUpperCase();
    const degree =
      (baseNoteValues[baseNote] - baseNoteValues[tonicBase] + 7) % 7;

    notes.push({
      name: noteName,
      degree,
      pitchValue: i,
    });
  }

  return notes;
}

/**
 * Gets the scale degree (0-6) of a note in a given key
 * @param noteName - ABC notation note name
 * @param key - Key object
 * @returns Scale degree number
 */
export function getScaleDegree(noteName: string, key: Key): number {
  const baseNote = noteName.charAt(0).toUpperCase();
  const tonicBase = key.tonic.charAt(0).toUpperCase();
  return (baseNoteValues[baseNote] - baseNoteValues[tonicBase] + 7) % 7;
}

/**
 * Gets the pitch value (index in noteArray) for a given ABC notation note
 * @param noteName - ABC notation note name
 * @returns Index in noteArray or -1 if not found
 */
export function getPitchValue(noteName: string): number {
  return noteArray.indexOf(noteName);
}
