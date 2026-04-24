// Non-chord tone generation: subdivides chord tones into passing tones,
// neighbor tones, anticipations, and appoggiaturas. Key-aware accidentals
// and parallel-motion checking are applied before committing each NCT.

import type { VoiceNote, Rhythm } from "./types";
import { getRandomElement } from "./utils";
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";
import { getDiatonicDegree } from "./prep-params";

// --- NCT Definition Types ---
interface NctFunctionParams {
  currentNote: VoiceNote;
  nextNote: VoiceNote | null;
  patternRhythm: Rhythm;
  allNotes: VoiceNote[][];
  currentPartIndex: number;
  noteIndex: number; // index in allNotes[currentPartIndex] (== notesToProcess[i])
  key: string;
}

type NctFunction = (params: NctFunctionParams) => VoiceNote[] | null;

interface NctDefinition {
  name: string;
  check: (currentNote: VoiceNote, nextNote: VoiceNote | null) => boolean;
  generator: NctFunction;
}
// ---------------------------

/**
 * Create a VoiceNote at newPitchValue.
 *
 * In ABC notation the K: header already declares all key-signature sharps/flats,
 * so we must NOT add explicit ^ or _ prefixes for in-key notes — they are already
 * implied by the key signature.  `^C` in key of A is redundant (C already means
 * C# in that key) and causes many ABC renderers to display a spurious sharp.
 *
 * All Phase-1 NCTs are diatonic, so no explicit accidental is ever required.
 * If chromatic NCTs are added later they can be flagged individually here.
 */
function createNewNote(
  originalNote: VoiceNote,
  newPitchValue: number,
  newLength: number,
  key: string
): VoiceNote | null {
  const baseName = noteArray[newPitchValue];
  if (!baseName) {
    console.warn(`NCT_GEN Helper: Pitch value ${newPitchValue} not found in noteArray.`);
    return null;
  }

  const keyInfo = keySignatures[key];
  const degree = keyInfo ? getDiatonicDegree(newPitchValue, keyInfo) : 0;

  return {
    name: baseName, // No explicit prefix — K: header handles key-sig accidentals
    degree,
    pitchValue: newPitchValue,
    length: newLength,
    rest: false,
    order: originalNote.order,
    accidental: null,
    isCadenceEnd: false,
  };
}

// --- Parallel-motion check ---

/**
 * Returns true if the proposed nctNotes introduce a parallel P5 or P8 against
 * any other voice.
 *
 * Pitch values are diatonic (7 per octave), so:
 *   |a – b| % 7 === 4  →  perfect fifth
 *   |a – b| % 7 === 0 and |a – b| > 0  →  octave
 *
 * We check the motion from the first NCT note to the last NCT note against the
 * corresponding motion in every other voice (allNotes[v][noteIndex] →
 * allNotes[v][noteIndex + 1]).
 */
function checkParallelMotion(
  nctNotes: VoiceNote[],
  noteIndex: number,
  allNotes: VoiceNote[][],
  currentPartIndex: number
): boolean {
  if (nctNotes.length < 2) return false;

  const firstNct = nctNotes[0];
  const lastNct = nctNotes[nctNotes.length - 1];
  if (firstNct.rest || lastNct.rest) return false;

  const currentDir = Math.sign(lastNct.pitchValue - firstNct.pitchValue);
  if (currentDir === 0) return false; // stationary — no parallel motion possible

  for (let v = 0; v < allNotes.length; v++) {
    if (v === currentPartIndex) continue;

    const prevOther = allNotes[v][noteIndex];
    const nextOther = allNotes[v][noteIndex + 1];
    if (!prevOther || prevOther.rest || !nextOther || nextOther.rest) continue;

    const otherDir = Math.sign(nextOther.pitchValue - prevOther.pitchValue);
    if (otherDir === 0) continue; // other voice is stationary — no parallel motion

    if (currentDir !== otherDir) continue; // contrary/oblique — fine

    // Both voices moving the same direction: check intervals
    const intervalBefore = Math.abs(firstNct.pitchValue - prevOther.pitchValue) % 7;
    const intervalAfter = Math.abs(lastNct.pitchValue - nextOther.pitchValue) % 7;
    const rawIntervalAfter = Math.abs(lastNct.pitchValue - nextOther.pitchValue);

    const isParallelFifth = intervalBefore === 4 && intervalAfter === 4;
    const isParallelOctave =
      intervalBefore === 0 &&
      intervalAfter === 0 &&
      Math.abs(firstNct.pitchValue - prevOther.pitchValue) > 0 &&
      rawIntervalAfter > 0;

    if (isParallelFifth || isParallelOctave) {
      console.warn(
        `NCT_GEN: Parallel ${isParallelFifth ? "5th" : "octave"} detected ` +
          `between voice ${currentPartIndex} and ${v} at index ${noteIndex}. Rejecting NCT.`
      );
      return true;
    }
  }

  return false;
}
// ----------------------------

/**
 * Takes an array of voice notes and introduces non-chord tone patterns by
 * subdividing existing notes based on probability.
 *
 * @param notesToProcess - VoiceNote objects for the current part.
 * @param nctRhythms - Rhythm patterns allowed for substitutions.
 * @param allNotes - All voice notes (original chord tones, for parallel-motion checks).
 * @param currentPartIndex - Index of the current voice in allNotes.
 * @param probability - Chance (0–1) of attempting to subdivide a note.
 * @param key - Active key signature string (e.g. "C", "G", "Bb").
 */
export function generateNonChordTones(
  notesToProcess: VoiceNote[],
  nctRhythms: Rhythm[],
  allNotes: VoiceNote[][],
  currentPartIndex: number,
  probability: number = 0.1,
  key: string = "C"
): VoiceNote[] {
  const outputNotes: VoiceNote[] = [];

  if (!nctRhythms || nctRhythms.length === 0) {
    console.warn("NCT_GEN: No NCT rhythms provided. Returning original notes.");
    return [...notesToProcess];
  }

  const patternNctRhythms = nctRhythms.filter((r) => r.pattern);
  if (patternNctRhythms.length === 0) {
    console.warn("NCT_GEN: No *pattern* NCT rhythms provided. Returning original notes.");
    return [...notesToProcess];
  }

  const nctLibrary: NctDefinition[] = [
    { name: "Passing Tone", check: checkPassingTone, generator: generatePassingTone },
    { name: "Neighbor Tone", check: checkNeighborTone, generator: generateNeighborTone },
    { name: "Anticipation", check: checkAnticipation, generator: generateAnticipation },
    { name: "Appoggiatura", check: checkAppoggiatura, generator: generateAppoggiatura },
  ];

  for (let i = 0; i < notesToProcess.length; i++) {
    const originalNote = notesToProcess[i];

    // Find next non-rest note
    let nextNote: VoiceNote | null = null;
    for (let j = i + 1; j < notesToProcess.length; j++) {
      if (!notesToProcess[j].rest) {
        nextNote = notesToProcess[j];
        break;
      }
    }

    // Determine the next note (for pre-cadence check)
    const nextChordNote = notesToProcess[i + 1] ?? null;

    // Skip:
    //  - rests
    //  - the first chord (i === 0) — phrase openings must be pure chord tones
    //  - cadence-end notes (already on the long note itself)
    //  - the note immediately before a cadence end (allows only suspension-style treatment)
    //  - random chance
    if (
      originalNote.rest ||
      i === 0 ||
      originalNote.isCadenceEnd ||
      nextChordNote?.isCadenceEnd ||
      Math.random() >= probability
    ) {
      outputNotes.push(originalNote);
      continue;
    }

    console.log(
      `NCT_GEN: Triggered for note ${i}: ${originalNote.name} (${originalNote.length}), nextNote: ${nextNote?.name ?? "None"}`
    );

    const originalDuration = originalNote.length;

    const possibleRhythmicReplacements = patternNctRhythms.filter(
      (r) => r.totalValue === originalDuration
    );

    if (possibleRhythmicReplacements.length === 0) {
      outputNotes.push(originalNote);
      continue;
    }

    const selectedPatternRhythm = getRandomElement(possibleRhythmicReplacements);
    if (!selectedPatternRhythm) {
      outputNotes.push(originalNote);
      continue;
    }

    const possibleNctTypes = nctLibrary.filter((nct) =>
      nct.check(originalNote, nextNote)
    );

    if (possibleNctTypes.length === 0) {
      console.log(
        `NCT_GEN: No suitable NCT type for note ${i} (${originalNote.name} -> ${nextNote?.name ?? "None"}). Keeping original.`
      );
      outputNotes.push(originalNote);
      continue;
    }

    const selectedNctDefinition = getRandomElement(possibleNctTypes);
    if (!selectedNctDefinition) {
      outputNotes.push(originalNote);
      continue;
    }

    console.log(
      `NCT_GEN: Attempting ${selectedNctDefinition.name} with rhythm: ${selectedPatternRhythm.name}`
    );

    const generatedNctNotes = selectedNctDefinition.generator({
      currentNote: originalNote,
      nextNote,
      patternRhythm: selectedPatternRhythm,
      allNotes,
      currentPartIndex,
      noteIndex: i,
      key,
    });

    if (generatedNctNotes && generatedNctNotes.length > 0) {
      // Parallel-motion guard: revert to original if a P5 or P8 would result
      if (checkParallelMotion(generatedNctNotes, i, allNotes, currentPartIndex)) {
        console.log(`NCT_GEN: Parallel motion violation — keeping original note at ${i}.`);
        outputNotes.push(originalNote);
        continue;
      }

      console.log(`NCT_GEN: Generated ${generatedNctNotes.length} notes for ${selectedNctDefinition.name}.`);
      outputNotes.push(...generatedNctNotes);
    } else {
      console.log(
        `NCT_GEN: Generation failed for ${selectedNctDefinition.name}. Keeping original.`
      );
      outputNotes.push(originalNote);
    }
  }

  return outputNotes;
}

// ======== NCT Check Functions ==========

function checkPassingTone(currentNote: VoiceNote, nextNote: VoiceNote | null): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Possible when the interval to the next chord tone is a diatonic 3rd (2–4 semitones)
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff >= 2 && pitchDiff <= 4;
}

function checkNeighborTone(currentNote: VoiceNote, nextNote: VoiceNote | null): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Possible when next note is same pitch or a step away
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff <= 2;
}

function checkAnticipation(currentNote: VoiceNote, nextNote: VoiceNote | null): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Anticipation: current and next are a step apart
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff <= 2;
}

function checkAppoggiatura(currentNote: VoiceNote, nextNote: VoiceNote | null): boolean {
  if (
    !nextNote ||
    currentNote.pitchValue === undefined ||
    nextNote.pitchValue === undefined
  )
    return false;
  // Appoggiatura resolves by step to the next chord tone
  const pitchDiff = Math.abs(currentNote.pitchValue - nextNote.pitchValue);
  return pitchDiff >= 1 && pitchDiff <= 2;
}

// ======== NCT Generator Functions ==========

function generatePassingTone(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, nextNote, patternRhythm, key } = params;
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null;

  const pitch1 = currentNote.pitchValue;
  const pitch2 = nextNote.pitchValue;
  if (pitch1 === undefined || pitch2 === undefined) return null;

  // Diatonic step toward next note
  const direction = pitch1 < pitch2 ? 1 : -1;
  const passingPitch = pitch1 + direction;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, pitch1, len1, key);
  const note2 = createNewNote(currentNote, passingPitch, len2, key);

  return note1 && note2 ? [note1, note2] : null;
}

function generateNeighborTone(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, patternRhythm, key } = params;
  if (patternRhythm.abcValue.length !== 2) return null;

  const pitch1 = currentNote.pitchValue;
  if (pitch1 === undefined) return null;

  // Diatonic step up or down
  const direction = Math.random() < 0.5 ? 1 : -1;
  const neighborPitch = pitch1 + direction;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, pitch1, len1, key);
  const note2 = createNewNote(currentNote, neighborPitch, len2, key);

  return note1 && note2 ? [note1, note2] : null;
}

function generateAnticipation(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, nextNote, patternRhythm, key } = params;
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null;

  const pitch1 = currentNote.pitchValue;
  const pitch2 = nextNote.pitchValue;
  if (pitch1 === undefined || pitch2 === undefined) return null;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, pitch1, len1, key);
  const note2 = createNewNote(nextNote, pitch2, len2, key);

  return note1 && note2 ? [note1, note2] : null;
}

function generateAppoggiatura(params: NctFunctionParams): VoiceNote[] | null {
  // Accented NCT approached by leap, resolved by step
  const { currentNote, nextNote, patternRhythm, key } = params;
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null;

  const resolutionPitch = currentNote.pitchValue;
  if (resolutionPitch === undefined) return null;

  // Place the appoggiatura a diatonic step above or below the resolution
  const direction = Math.random() < 0.5 ? 1 : -1;
  const appoggiaturaPitch = resolutionPitch + direction;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, appoggiaturaPitch, len1, key);
  const note2 = createNewNote(currentNote, resolutionPitch, len2, key);

  return note1 && note2 ? [note1, note2] : null;
}
