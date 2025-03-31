import type { Note, Key } from "./note-utils";
import { getNotesInRange } from "./note-utils";

export interface VoicePart {
  selectedRange: [number, number]; // ABC notation indices
  clef: string;
  possibleNotes?: Note[]; // Notes available in this part's range
  chordNotes?: Note[]; // Notes chosen for chords
  subdivideNotes?: Note[]; // Notes for subdivisions
  nonChordTones?: Note[]; // Non-chord tones
  smallName: string; // Short name for the part (e.g. "S" for Soprano)
}

/**
 * Enriches voice parts with possible notes based on their range and key
 * @param parts - Array of voice parts to enrich
 * @param key - The key signature to use
 * @returns Enriched voice parts with possibleNotes arrays
 */
export function enrichVoiceParts(parts: VoicePart[], key: Key): VoicePart[] {
  return parts.map((part) => {
    const possibleNotes = getNotesInRange(part.selectedRange, key);

    return {
      ...part,
      possibleNotes,
      chordNotes: [],
      subdivideNotes: [],
      nonChordTones: [],
    };
  });
}

/**
 * Validates that a note is within a part's range
 * @param note - The note to check
 * @param part - The voice part to check against
 * @returns boolean indicating if the note is in range
 */
export function isNoteInRange(note: Note, part: VoicePart): boolean {
  const [min, max] = part.selectedRange;
  return note.pitchValue >= min && note.pitchValue <= max;
}
