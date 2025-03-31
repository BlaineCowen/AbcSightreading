// THIS FILE IS WORKING DONT TOUCH

import { type VoicePart, type Note, type PartsObject } from "./types";
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";

// Helper to get diatonic degree (0-6) in a specific key
function getDiatonicDegree(
  pitchValue: number,
  keySignatureInfo: { sharps: number[]; flats: number[]; rootOffset: number }
): number {
  // Get the first letter of the note name from noteArray
  const noteName = noteArray[pitchValue];
  const baseLetter = noteName[0].toUpperCase();

  // Get the first letter of the key (e.g., 'F' from 'F' or 'F#')
  const keyLetter = String.fromCharCode(
    ((keySignatureInfo.rootOffset + 5) % 7) + 67
  ); // 67 is 'C'

  // Map letters in order from the key letter
  const letterOrder = ["C", "D", "E", "F", "G", "A", "B"];
  const keyIndex = letterOrder.indexOf(keyLetter);

  // Rotate the array so the key letter is at index 0
  const rotatedOrder = [
    ...letterOrder.slice(keyIndex),
    ...letterOrder.slice(0, keyIndex),
  ];

  // Find the degree by getting the index in the rotated order
  const degree = rotatedOrder.indexOf(baseLetter);
  return degree;
}

export function generatePossibleNotes(
  range: [number, number],
  key: string
): Note[] {
  const notes: Note[] = [];
  const keyInfo = keySignatures[key];
  if (!keyInfo) {
    throw new Error(`Key signature not found for key: ${key}`);
  }

  // Use array indices directly for pitch values
  for (let i = range[0]; i <= range[1]; i++) {
    const noteName = noteArray[i];
    if (!noteName) continue;

    // Calculate diatonic degree relative to the provided key
    const degree = getDiatonicDegree(i, keyInfo);

    if (degree !== -1) {
      notes.push({
        name: noteName,
        degree, // Diatonic degree (0-6)
        pitchValue: i, // Use array index as pitch value
      });
    }
  }
  return notes;
}

export function prepareVoiceParts(
  key: string,
  ranges?: {
    [key: string]: [number, number];
  },
  partsObject?: PartsObject
): VoicePart[] {
  if (!partsObject) {
    throw new Error("PartsObject is required for voice part preparation");
  }

  // Validate range format
  for (const [_, range] of Object.entries(ranges || {})) {
    if (!Array.isArray(range) || range.length !== 2) {
      throw new Error("Invalid range format");
    }
    if (range[0] < 0 || range[1] < 0) {
      throw new Error("Invalid range values");
    }
  }

  // Generate parts using provided ranges and key
  return Object.entries(partsObject.parts).map(([name, partDef]) => {
    const range = ranges?.[name] || partDef.range;
    return {
      range,
      smallName: partDef.smallName,
      possibleNotes: generatePossibleNotes(range, key),
      name,
      clef: partDef.clef,
      order: partDef.order, // Use order directly from partsObject
    };
  });
}

export function validateVoiceParts(voiceParts: VoicePart[], key: string): void {
  if (!voiceParts.length) {
    throw new Error("Voice parts must be a non-empty array");
  }

  // Check for missing smallName
  voiceParts.forEach((part) => {
    if (!part.smallName) {
      throw new Error("Missing smallName for voice part");
    }
  });

  // Check for negative ranges and validate possible notes
  voiceParts.forEach((part) => {
    if (part.range[0] < 0 || part.range[1] < 0) {
      throw new Error("Invalid range values");
    }

    // Validate that possibleNotes matches the range
    const expectedNotes = generatePossibleNotes(part.range, key);
    if (
      !part.possibleNotes ||
      part.possibleNotes.length !== expectedNotes.length ||
      !part.possibleNotes.every(
        (note: Note, i: number) =>
          note.name === expectedNotes[i].name &&
          note.degree === expectedNotes[i].degree &&
          note.pitchValue === expectedNotes[i].pitchValue
      )
    ) {
      throw new Error("Possible notes do not match voice part range");
    }
  });
}
