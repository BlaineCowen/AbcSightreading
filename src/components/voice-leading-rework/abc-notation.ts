/**
 * @file abc-notation.ts
 * @description ABC notation utilities for music generation
 */

import type { Note, TimeSignature, PartsObject } from "./types";
import { ClefType, UIL_RANGES } from "./types";

/**
 * Base note array for ABC notation
 */
export const baseNoteArray = ["C", "D", "E", "F", "G", "A", "B"];

/**
 * Converts a note to ABC notation
 */
export function toAbcNotation(note: Note): string {
  const octaveMarkers = getOctaveMarkers(note.pitchValue);
  return `${note.name}${octaveMarkers}${note.length || ""}`;
}

/**
 * Gets octave markers for ABC notation
 */
export function getOctaveMarkers(pitch: number): string {
  // In noteArray.ts:
  // C,, to B,, is index 0-6 (double comma)
  // C, to B, is index 7-13 (single comma)
  // C to B is index 14-20 (no markers)
  // c to b is index 21-27 (lowercase)
  // c' to b' is index 28-34 (single prime)
  // c'' to b'' is index 35-41 (double prime)
  // c''' is index 42 (triple prime)

  if (pitch <= 6) return ",,";
  if (pitch <= 13) return ",";
  if (pitch <= 20) return "";
  if (pitch <= 27) return ""; // Note will be lowercase
  if (pitch <= 34) return "'";
  if (pitch <= 41) return "''";
  return "'''";
}

/**
 * Gets clef string for ABC notation
 */
function getClefString(clef: ClefType): string {
  switch (clef) {
    case ClefType.Treble:
      return "treble";
    case ClefType.TrebleOctaveDown:
      return "treble-8";
    case ClefType.Bass:
      return "bass";
    case ClefType.Alto:
      return "alto";
    case ClefType.Tenor:
      return "tenor";
    default:
      return "treble";
  }
}

/**
 * Gets octave transposition based on part and level
 */
function getOctaveTransposition(
  partName: string,
  clef: ClefType,
  level: number
): string {
  // Bass clef parts need to be transposed down
  if (clef === ClefType.Bass) {
    return " octave=-2";
  }
  // Tenor parts using treble clef need to be transposed down
  if (clef === ClefType.TrebleOctaveDown) {
    return " octave=-1";
  }
  return "";
}

/**
 * Formats the ABC score header according to instructions
 */
export function formatAbcScore(
  key: string,
  timeSig: { name: string },
  bpm: number,
  partsObject: PartsObject
): string {
  // Build header string for each part
  var headerString = "";
  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    // find the clef by matching the name to the part name object
    var partName = Object.keys(partsObject.parts)[i];
    var smallName = partsObject.parts[partName].smallName;
    var clef = partsObject.parts[partName].clef;
    var middleString = "";
    if (clef === "treble-8") {
      middleString = "octave=1";
    }
    headerString += `V:${smallName} clef=${clef} name="${partName}" snm="${smallName}" ${middleString}\n`;
  }

  // Build score string
  var scoreString = "%%score ";
  Object.keys(partsObject.parts).forEach((partName) => {
    scoreString += partsObject.parts[partName].smallName + " ";
  });
  scoreString = scoreString.trim() + "\n";

  // Assemble final header
  return (
    `X:1\n` +
    `T:SATB UIL Sight Reading\n` +
    `C:Blaine Cowen\n` +
    `M:${timeSig.name}\n` +
    `L:1/8\n` +
    `Q:1/4=76\n` +
    `${scoreString}` +
    `${headerString}` +
    `K: ${key}\n` +
    `%            End of header, start of tune body:\n`
  );
}

/**
 * Formats a measure of notes into ABC notation using rhythm abc values
 */
export function measureToAbc(notes: Note[]): string {
  return notes
    .map((note) => {
      if (note.name === "z") {
        return `z${note.length}`; // Use rhythm's abc value directly
      }

      // Get the base note name
      const baseName = note.name[0];

      // Determine if it should be uppercase or lowercase
      const noteName =
        note.pitchValue <= 20 ? baseName.toUpperCase() : baseName.toLowerCase();

      // Get octave markers
      const octaveMarkers = getOctaveMarkers(note.pitchValue);

      return `${noteName}${octaveMarkers}${note.length}`;
    })
    .join(" ");
}
