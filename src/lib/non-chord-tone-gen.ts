// this file will create none chord tones
// It will take a voicepart array, look at the chord notes, and split them into smaller rhythms
// It will weight the highest part more to create a melody (order: 0)

import type { VoiceNote, Note, Rhythm } from "./types";
import { getRandomElement } from "./utils";
import { noteArray } from "../resources/noteArray"; // Needed for pitch calculations

// --- NCT Definition Types ---
interface NctFunctionParams {
  currentNote: VoiceNote;
  nextNote: VoiceNote | null; // Next non-rest note
  patternRhythm: Rhythm; // The rhythmic pattern being used
  allNotes: VoiceNote[][]; // Add all notes
  currentPartIndex: number; // Add current part index
}

type NctFunction = (params: NctFunctionParams) => VoiceNote[] | null;

interface NctDefinition {
  name: string;
  check: (currentNote: VoiceNote, nextNote: VoiceNote | null) => boolean; // Function to check if possible
  generator: NctFunction;
}
// ---------------------------

/**
 * Takes an array of voice notes and introduces non-chord tone patterns
 * by subdividing existing notes based on probability.
 *
 * @param notesToProcess - The array of VoiceNote objects for the current part.
 * @param nctRhythms - An array of Rhythms (should be patterns) allowed for substitutions.
 * @param allNotes - All voice notes generated so far (for context).
 * @param currentPartIndex - The index of the current voice part within allNotes.
 * @param probability - The chance (0.0 to 1.0) of attempting to subdivide a note.
 * @returns A new array of VoiceNote objects representing the voice part with potential NCT rhythms.
 */
export function generateNonChordTones(
  notesToProcess: VoiceNote[],
  nctRhythms: Rhythm[],
  allNotes: VoiceNote[][], // Add all notes
  currentPartIndex: number, // Add current part index
  probability: number = 0.1 // Lowered default probability
): VoiceNote[] {
  const outputNotes: VoiceNote[] = [];

  if (!nctRhythms || nctRhythms.length === 0) {
    console.warn("NCT_GEN: No NCT rhythms provided. Returning original notes.");
    return [...notesToProcess];
  }

  const patternNctRhythms = nctRhythms.filter((r) => r.pattern);
  if (patternNctRhythms.length === 0) {
    console.warn(
      "NCT_GEN: No *pattern* NCT rhythms provided. Returning original notes."
    );
    return [...notesToProcess];
  }

  // Define available NCT types
  const nctLibrary: NctDefinition[] = [
    {
      name: "Passing Tone",
      check: checkPassingTone,
      generator: generatePassingTone,
    },
    {
      name: "Neighbor Tone",
      check: checkNeighborTone,
      generator: generateNeighborTone,
    },
    {
      name: "Anticipation",
      check: checkAnticipation,
      generator: generateAnticipation,
    },
    {
      name: "Appoggiatura",
      check: checkAppoggiatura,
      generator: generateAppoggiatura,
    },
    // Add Suspension, Appoggiatura etc. here following the same pattern
  ];

  for (let i = 0; i < notesToProcess.length; i++) {
    const originalNote = notesToProcess[i];

    // --- Find next non-rest note for interval check ---
    let nextNote: VoiceNote | null = null;
    for (let j = i + 1; j < notesToProcess.length; j++) {
      if (!notesToProcess[j].rest) {
        nextNote = notesToProcess[j];
        break;
      }
    }
    // --------------------------------------------------

    // Skip rests, cadence ends, or if random chance fails
    if (
      originalNote.rest ||
      originalNote.isCadenceEnd ||
      Math.random() >= probability
    ) {
      outputNotes.push(originalNote);
      continue;
    }

    // --- Trigger Log ---
    console.log(
      `NCT_GEN: Triggered for note ${i}: ${originalNote.name} (${
        originalNote.length
      }), nextNote: ${nextNote?.name ?? "None"}`
    );

    const originalDuration = originalNote.length;

    // Find NCT *rhythmic patterns* that exactly match the original duration
    const possibleRhythmicReplacements = patternNctRhythms.filter(
      (r) => r.totalValue === originalDuration
    );

    if (possibleRhythmicReplacements.length === 0) {
      // No suitable replacement *rhythm* found, keep original note
      outputNotes.push(originalNote);
      continue;
    }

    // Select a random *rhythmic pattern*
    const selectedPatternRhythm = getRandomElement(
      possibleRhythmicReplacements
    );
    if (!selectedPatternRhythm) {
      outputNotes.push(originalNote);
      continue;
    }

    // --- Determine possible NCT *types* based on interval ---
    const possibleNctTypes = nctLibrary.filter((nct) =>
      nct.check(originalNote, nextNote)
    );

    if (possibleNctTypes.length === 0) {
      console.log(
        `NCT_GEN: No suitable NCT *type* found for note ${i} (${
          originalNote.name
        } -> ${nextNote?.name ?? "None"}). Keeping original.`
      );
      outputNotes.push(originalNote);
      continue;
    }

    // Select a random NCT type function
    const selectedNctDefinition = getRandomElement(possibleNctTypes);
    if (!selectedNctDefinition) {
      // Should not happen if possibleNctTypes.length > 0
      outputNotes.push(originalNote);
      continue;
    }

    console.log(
      `NCT_GEN: Attempting NCT type: ${selectedNctDefinition.name} with rhythm pattern: ${selectedPatternRhythm.name}`
    );

    // --- Generate the NCT notes ---
    const generatedNctNotes = selectedNctDefinition.generator({
      currentNote: originalNote,
      nextNote: nextNote,
      patternRhythm: selectedPatternRhythm,
      allNotes: allNotes, // Pass context
      currentPartIndex: currentPartIndex, // Pass context
    });

    if (generatedNctNotes && generatedNctNotes.length > 0) {
      console.log(
        `NCT_GEN:   -> Successfully generated ${generatedNctNotes.length} notes.`
      );
      outputNotes.push(...generatedNctNotes);
      generatedNctNotes.forEach((n) =>
        console.log(`NCT_GEN:     -> New note:`, {
          name: n.name,
          length: n.length,
          pitchVal: n.pitchValue,
          degree: n.degree,
        })
      );
    } else {
      console.log(
        `NCT_GEN:   -> Failed to generate notes for type ${selectedNctDefinition.name}. Keeping original.`
      );
      outputNotes.push(originalNote); // Fallback to original note if generation fails
    }
  } // End loop through notesToProcess

  return outputNotes;
}

// ======== NCT Check Functions ==========

function checkPassingTone(
  currentNote: VoiceNote,
  nextNote: VoiceNote | null
): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Possible if interval is a diatonic 3rd (abs pitch diff approx 2 or 3/4 semitones)
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff >= 2 && pitchDiff <= 4; // Adjust semitone diff as needed
}

function checkNeighborTone(
  currentNote: VoiceNote,
  nextNote: VoiceNote | null
): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Possible if notes are same pitch or step apart
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff <= 2;
}

function checkAnticipation(
  currentNote: VoiceNote,
  nextNote: VoiceNote | null
): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Possible if notes are same pitch or step apart
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff <= 2;
}

function checkAppoggiatura(
  currentNote: VoiceNote,
  nextNote: VoiceNote | null
): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Possible if resolution interval is a step
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff >= 1 && pitchDiff <= 2; // Needs step resolution to next note (original note is resolution)
}

// ======== NCT Generator Functions ==========

// -- Simplified createNewNote Helper --
function createNewNote(
  originalNote: VoiceNote, // Can be current or next depending on NCT context
  newPitchValue: number,
  newLength: number
  // Removed key parameter
): VoiceNote | null {
  const newNoteName = noteArray[newPitchValue]; // Get base name (e.g., "C", "f'")
  if (!newNoteName) {
    console.warn(`NCT_GEN Helper: Pitch value ${newPitchValue} not found.`);
    return null;
  }

  // Simplified: No accidental calculation, copy degree as placeholder
  return {
    name: newNoteName, // Use base name directly
    degree: originalNote.degree, // Placeholder - Copied from original context note
    pitchValue: newPitchValue,
    length: newLength,
    rest: false,
    order: originalNote.order,
    accidental: null, // Explicitly set to null
    isCadenceEnd: false,
  };
}

// -- Updated Generators to call simplified helper --

function generatePassingTone(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, nextNote, patternRhythm } = params; // Removed key
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null; // Basic passing tone needs 2 notes

  const pitch1 = currentNote.pitchValue;
  const pitch2 = nextNote.pitchValue;
  if (pitch1 === undefined || pitch2 === undefined) return null;

  // Find the diatonic note between pitch1 and pitch2
  const direction = pitch1 < pitch2 ? 1 : -1;
  const passingPitchValue = pitch1 + direction; // Simplistic - needs diatonic check!
  // TODO: Use a proper diatonic step function here, considering key signature

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, pitch1, len1);
  const note2 = createNewNote(currentNote, passingPitchValue, len2);

  return note1 && note2 ? [note1, note2] : null;
}

function generateNeighborTone(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, patternRhythm } = params; // Removed key
  if (patternRhythm.abcValue.length !== 2) return null; // Basic neighbor tone needs 2 notes

  const pitch1 = currentNote.pitchValue;
  if (pitch1 === undefined) return null;

  // Go up or down a diatonic step
  const direction = Math.random() < 0.5 ? 1 : -1;
  const neighborPitchValue = pitch1 + direction; // Simplistic - needs diatonic check!
  // TODO: Use a proper diatonic step function here

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, pitch1, len1);
  const note2 = createNewNote(currentNote, neighborPitchValue, len2);

  return note1 && note2 ? [note1, note2] : null;
}

function generateAnticipation(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, nextNote, patternRhythm } = params; // Removed key
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null;

  const pitch1 = currentNote.pitchValue;
  const pitch2 = nextNote.pitchValue; // The pitch to anticipate
  if (pitch1 === undefined || pitch2 === undefined) return null;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, pitch1, len1);
  const note2 = createNewNote(nextNote, pitch2, len2);

  return note1 && note2 ? [note1, note2] : null;
}

function generateAppoggiatura(params: NctFunctionParams): VoiceNote[] | null {
  // Accented NCT, approached by leap, resolved by step (usually opposite direction)
  // Typically falls ON the beat where currentNote was.
  const { currentNote, nextNote, patternRhythm } = params;
  // Appoggiatura resolves to currentNote's pitch
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null;
  const resolutionPitch = currentNote.pitchValue;
  if (resolutionPitch === undefined) return null;

  // TODO: Use proper diatonic step calculation for appoggiatura pitch
  // Appoggiatura is typically a step away from the resolution note
  // Needs context of previous note to determine leap approach direction.
  // For now, just make it a step above/below resolution pitch.
  const direction = Math.random() < 0.5 ? 1 : -1; // Simplistic choice
  const appoggiaturaPitch = resolutionPitch + direction;

  const len1 = parseInt(patternRhythm.abcValue[0]); // Appoggiatura duration
  const len2 = parseInt(patternRhythm.abcValue[1]); // Resolution duration
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  // Note 1 IS the NCT (Appoggiatura)
  // Use currentNote for context for the appoggiatura note itself?
  const note1 = createNewNote(currentNote, appoggiaturaPitch, len1);
  // Note 2 is the resolution (original pitch)
  const note2 = createNewNote(currentNote, resolutionPitch, len2);

  return note1 && note2 ? [note1, note2] : null;
}

// TODO: Add generateSuspension, generateAppoggiatura etc.
