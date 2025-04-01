import {
  type VoicePart,
  type VoiceNote,
  type Note,
  type Chord,
  type Rhythm,
} from "./types";
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";
import { generatePossibleNotes } from "./prep-params";

// Function to check voice leading (Ensure this is defined or imported)
function isVoiceOrderValid(pitches: number[]): boolean {
  for (let i = 0; i < pitches.length - 1; i++) {
    if (pitches[i] > pitches[i + 1]) {
      return false;
    }
  }
  return true;
}

// Helper function to shuffle an array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function determineAccidental(
  degree: number,
  chord: Chord,
  keySignatures: any,
  key: string
): {
  accidental:
    | "sharp"
    | "flat"
    | "natural"
    | "double-sharp"
    | "double-flat"
    | null;
  prefix: string;
} {
  const keyInfo = keySignatures[key];
  if (!keyInfo) {
    throw new Error(`Key signature not found for key: ${key}`);
  }

  // Check if this degree is already flat in the key signature
  const isFlattedInKey = keyInfo.flats?.includes(degree);
  // Check if this degree is already sharp in the key signature
  const isSharpenedInKey = keyInfo.sharps?.includes(degree);

  console.log(
    `\nAccidental check for degree ${degree} in ${key} with chord ${chord.name}:`
  );
  console.log(
    `  Key signature: ${
      isFlattedInKey ? "flat" : isSharpenedInKey ? "sharp" : "natural"
    }`
  );
  console.log(
    `  Chord wants: ${
      chord.sharpScaleDegree === degree
        ? "sharp"
        : chord.flatScaleDegree === degree
        ? "flat"
        : "natural"
    }`
  );
  console.log(
    `  Chord scale degrees: flat=${chord.flatScaleDegree}, sharp=${chord.sharpScaleDegree}`
  );

  let result: {
    accidental:
      | "sharp"
      | "flat"
      | "natural"
      | "double-sharp"
      | "double-flat"
      | null;
    prefix: string;
  };

  if (chord.sharpScaleDegree === degree) {
    if (isFlattedInKey) {
      // If the note is flat in the key and needs to be raised, make it natural
      result = { accidental: "natural", prefix: "=" };
    } else if (isSharpenedInKey) {
      // If already sharp in key and needs to be raised, make it double sharp
      result = { accidental: "double-sharp", prefix: "^^" };
    } else {
      // If natural in key and needs to be raised, make it sharp
      result = { accidental: "sharp", prefix: "^" };
    }
  } else if (chord.flatScaleDegree === degree) {
    if (isFlattedInKey) {
      // If already flat in key and needs to be lowered, make it double flat
      result = { accidental: "double-flat", prefix: "__" };
    } else if (isSharpenedInKey) {
      // If sharp in key and needs to be lowered, make it natural
      result = { accidental: "natural", prefix: "=" };
    } else {
      // If natural in key and needs to be lowered, make it flat
      result = { accidental: "flat", prefix: "_" };
    }
  } else {
    result = { accidental: null, prefix: "" };
  }

  console.log(
    `  Result: ${result.accidental || "none"} (prefix: ${
      result.prefix || "none"
    })\n`
  );
  return result;
}

function getMaxSkip(defaultValue: number = 4, minValue: number = 2): number {
  return defaultValue;
}

/**
 * Builds chord notes for all voices based on rhythms and chord progression
 */
export function buildChordNotes(
  key: string,
  rhythms: Rhythm[],
  progression: Chord[],
  voiceParts: VoicePart[],
  bassLine: Note[],
  maxSkip: number
): VoiceNote[][] {
  const keyInfo = keySignatures[key];
  if (!keyInfo) throw new Error(`Key signature not found for key: ${key}`);

  // Count chords needed - patterns count as one chord
  const chordPositions = rhythms.reduce((count, rhythm) => {
    if (rhythm.rest) return count;
    if (rhythm.isPatternNote) {
      // Only count the start of a pattern
      return rhythm.isPatternStart ? count + 1 : count;
    }
    return count + 1;
  }, 0);

  // Validate inputs
  if (progression.length !== chordPositions) {
    throw new Error(
      `Chord progression length (${
        progression.length
      }) does not match number of chord positions needed (${chordPositions}). Rhythms: ${rhythms
        .map((r) => r.name)
        .join(", ")}`
    );
  }

  if (bassLine.length !== chordPositions) {
    throw new Error(
      `Bass line length (${bassLine.length}) does not match number of chord positions needed (${chordPositions})`
    );
  }

  let totalLoopFails = 0;
  const maxTotalLoopFails = 10;

  function findPreviousGeneratedPitch(voiceNotes: VoiceNote[]): number | null {
    for (let i = voiceNotes.length - 1; i >= 0; i--) {
      if (!voiceNotes[i].rest) {
        return voiceNotes[i].pitchValue;
      }
    }
    return null;
  }

  function findValidVoiceNote(
    voicePart: VoicePart,
    chord: Chord,
    usedTriadDegrees: number[],
    otherVoiceNotes: VoiceNote[],
    maxSkip: number,
    previousNote?: VoiceNote
  ): Note | null {
    // Get all notes in range - strictly enforce the voice part range
    let validNotes = voicePart.possibleNotes.filter((note) => {
      // Double check range enforcement
      if (
        note.pitchValue < voicePart.range[0] ||
        note.pitchValue > voicePart.range[1]
      ) {
        return false;
      }
      return true;
    });

    // 1. First try unused chord tones
    const availableTriadDegrees = chord.triadNotes.filter(
      (deg) => !usedTriadDegrees.includes(deg)
    );

    let degreesToUse = availableTriadDegrees;
    if (degreesToUse.length === 0) {
      // If no unused tones, allow root or fifth
      degreesToUse = [chord.triadNotes[0], chord.triadNotes[2]];
    }

    // Filter by chord tones
    validNotes = validNotes.filter((note) =>
      degreesToUse.includes(note.degree)
    );

    // Apply voice leading if we have a previous note
    if (previousNote && !previousNote.rest) {
      validNotes = validNotes.filter(
        (note) => Math.abs(note.pitchValue - previousNote.pitchValue) <= maxSkip
      );
    }

    // Check voice crossing - ensure strict ordering with no equal pitches allowed
    validNotes = validNotes.filter((note) => {
      return otherVoiceNotes.every((otherNote) => {
        if (otherNote.order === undefined || voicePart.order === undefined)
          return true;

        // Higher voices must be strictly higher than lower voices
        if (voicePart.order > otherNote.order) {
          return note.pitchValue > otherNote.pitchValue;
        } else {
          return note.pitchValue < otherNote.pitchValue;
        }
      });
    });

    if (validNotes.length === 0) {
      return null;
    }

    // Select note based on position in voice's range
    let selectedNote: Note;
    if (previousNote && !previousNote.rest) {
      // If we have a previous note, find the closest valid note
      selectedNote = validNotes.reduce((closest, current) => {
        const currentDiff = Math.abs(
          current.pitchValue - previousNote.pitchValue
        );
        const closestDiff = Math.abs(
          closest.pitchValue - previousNote.pitchValue
        );
        return currentDiff < closestDiff ? current : closest;
      });
    } else {
      // If no previous note, select from the lower third for lower voices,
      // middle third for middle voices, and upper third for higher voices
      const rangePosition = voicePart.order / (voiceParts.length - 1); // 0 to 1
      const index = Math.floor(validNotes.length * rangePosition);
      selectedNote = validNotes[Math.min(index, validNotes.length - 1)];
    }

    return selectedNote;
  }

  function processRhythms(
    rhythms: Rhythm[],
    chordProgression: Chord[],
    voiceParts: VoicePart[],
    bassLine: Note[],
    maxSkip: number
  ): boolean {
    let chordIndex = 0;

    // Clear existing chord notes
    voiceParts.forEach((part) => {
      part.chordNotes = [];
    });

    for (let stepIndex = 0; stepIndex < rhythms.length; stepIndex++) {
      const rhythm = rhythms[stepIndex];

      if (rhythm.rest) {
        // For rests, add rest notes to all parts with proper length
        voiceParts.forEach((part) => {
          part.chordNotes.push({
            name: "z",
            degree: 0,
            pitchValue: 0,
            length: parseInt(rhythm.abcValue[0]),
            rest: true,
            order: part.order,
          });
        });
        continue;
      }

      // Get current chord - only increment after processing
      const currentChord = chordProgression[chordIndex];
      if (!currentChord) {
        console.error(
          `Error: Chord undefined at chordIndex ${chordIndex} for step ${
            stepIndex + 1
          }`
        );
        return false;
      }

      const maxStepRetries = 5;
      let stepRetryCount = 0;
      let stepSuccess = false;

      while (stepRetryCount < maxStepRetries && !stepSuccess) {
        stepRetryCount++;

        const stepNotesAttempt: (VoiceNote | null)[] = new Array(
          voiceParts.length
        ).fill(null);
        const pitchCheckArray: number[] = new Array(voiceParts.length).fill(0);
        let stepGenerationFailed = false;

        // Process Bass First - Use the provided bassLine
        const bassPartInfo = voiceParts.find((vp) => vp.order === 0);
        const otherPartsInfo = voiceParts.filter((vp) => vp.order !== 0);
        const shuffledOtherParts = shuffleArray([...otherPartsInfo]);

        // Process Bass First using the provided bassLine
        if (!bassPartInfo) {
          console.error("Bass part definition not found!");
          stepGenerationFailed = true;
        } else {
          const bassVoiceIndex = voiceParts.findIndex((vp) => vp.order === 0);

          const bassNote = bassLine[chordIndex];
          if (!bassNote) {
            console.error(`Bass note missing for chord index ${chordIndex}`);
            stepGenerationFailed = true;
          } else {
            const generatedBassNote: VoiceNote = {
              ...bassNote,
              length: parseInt(rhythm.abcValue[0]),
              rest: false,
              order: 0,
            };
            stepNotesAttempt[bassVoiceIndex] = generatedBassNote;
            pitchCheckArray[bassVoiceIndex] = generatedBassNote.pitchValue;
          }
        }

        // Process other voices
        if (!stepGenerationFailed) {
          for (const voicePart of shuffledOtherParts) {
            const actualPartName = voicePart.name;
            const originalVoiceIndex = voiceParts.findIndex(
              (vp) => vp.name === actualPartName
            );
            let generatedVoiceNote: VoiceNote | null = null;

            try {
              // Get used triad degrees from all parts that have been processed in this step
              const usedTriadDegrees: number[] = stepNotesAttempt
                .filter((note): note is VoiceNote => note !== null)
                .map((note) => note.degree);

              // Get other voice notes from this step
              const otherVoiceNotes = stepNotesAttempt.filter(
                (note, idx) => note !== null && idx !== originalVoiceIndex
              ) as VoiceNote[];

              const selectedNote = findValidVoiceNote(
                voicePart,
                currentChord,
                usedTriadDegrees,
                otherVoiceNotes,
                maxSkip,
                stepNotesAttempt[originalVoiceIndex] as VoiceNote
              );

              if (!selectedNote) {
                throw new Error(
                  `No valid notes for ${actualPartName} after filtering`
                );
              }

              let finalNoteName = selectedNote.name;
              const noteDegree = selectedNote.degree;
              const accidentalInfo = determineAccidental(
                noteDegree,
                currentChord,
                keySignatures,
                key
              );

              if (accidentalInfo.accidental) {
                finalNoteName = accidentalInfo.prefix + selectedNote.name;
              }

              generatedVoiceNote = {
                ...selectedNote,
                name: finalNoteName,
                length: parseInt(rhythm.abcValue[0]),
                rest: false,
                order: voicePart.order,
                accidental: accidentalInfo.accidental,
              };
            } catch (e: any) {
              console.error(
                `Error finding note for ${actualPartName}: ${e.message}`
              );
              stepGenerationFailed = true;
              break;
            }

            // Store results in the *original* order
            stepNotesAttempt[originalVoiceIndex] = generatedVoiceNote;
            if (generatedVoiceNote) {
              pitchCheckArray[originalVoiceIndex] =
                generatedVoiceNote.pitchValue;
            } else if (!stepGenerationFailed) {
              console.error(
                `Generated note is unexpectedly null for ${actualPartName}`
              );
              stepGenerationFailed = true;
              break;
            }
          }
        }

        // Post-Attempt Checks
        if (stepGenerationFailed) {
          continue; // Try step again
        }

        // Create array of [order, pitch] pairs and sort by order
        const voiceOrderPitches = voiceParts.map((part, index) => ({
          order: part.order,
          pitch: pitchCheckArray[index],
        }));
        voiceOrderPitches.sort((a, b) => a.order - b.order);
        const orderedPitches = voiceOrderPitches.map((v) => v.pitch);

        // Check voice order using the correctly ordered pitchCheckArray
        if (isVoiceOrderValid(orderedPitches)) {
          stepNotesAttempt.forEach((note, voiceIndex) => {
            // Ensure we push to the correct original index in allVoiceNotes
            if (note) voiceParts[voiceIndex].chordNotes.push(note);
          });
          stepSuccess = true;
        }
      }

      if (!stepSuccess) {
        console.error(
          `Failed to generate valid notes for step ${stepIndex + 1} (Rhythm: ${
            rhythm.name
          }, Chord: ${currentChord.symbol}) after ${maxStepRetries} attempts.`
        );
        return false; // Fail entire process
      }

      // Increment chord index after successfully processing the step
      if (rhythm.isPatternNote) {
        // Only increment at the end of a pattern
        if (rhythm.isPatternEnd) {
          chordIndex++;
        }
      } else {
        // For non-pattern notes, increment after processing
        chordIndex++;
      }
    }

    return true;
  }

  while (totalLoopFails < maxTotalLoopFails) {
    if (processRhythms(rhythms, progression, voiceParts, bassLine, maxSkip)) {
      return voiceParts.map((part) => part.chordNotes);
    }
    totalLoopFails++;
  }

  throw new Error("Failed to build valid notes after max attempts");
}

/**
 * Helper to get octave markers for a pitch value
 */
function getOctaveMarkers(pitch: number): string {
  const octave = Math.floor(pitch / 7);
  return octave <= 0 ? ",".repeat(-octave) : "'".repeat(octave);
}

function generateBassNote(
  chord: Chord,
  rhythm: Rhythm,
  key: string,
  range: [number, number],
  previousNote?: VoiceNote,
  maxSkip?: number
): VoiceNote {
  if (rhythm.rest) {
    return {
      name: "z",
      degree: -1,
      pitchValue: -1,
      length: rhythm.isPatternNote
        ? parseInt(rhythm.abcValue[0])
        : rhythm.totalValue,
      rest: true,
    };
  }

  const possibleNotes = generatePossibleNotes(range, key).filter(
    (note: Note) => note.degree === chord.root
  );

  if (!possibleNotes.length) {
    throw new Error(
      `No possible bass notes found for chord ${chord.name} in range [${range[0]}, ${range[1]}]`
    );
  }

  let selectedNote: Note;
  if (!previousNote || previousNote.rest) {
    selectedNote =
      possibleNotes[Math.floor(Math.random() * possibleNotes.length)];
  } else {
    const effectiveMaxSkip = maxSkip || getMaxSkip();
    const validNotes = possibleNotes.filter(
      (note: Note) =>
        Math.abs(note.pitchValue - previousNote.pitchValue) <= effectiveMaxSkip
    );
    if (!validNotes.length) {
      throw new Error(
        `No valid bass notes within max skip of ${effectiveMaxSkip} from previous note ${previousNote.name}`
      );
    }
    selectedNote = validNotes[Math.floor(Math.random() * validNotes.length)];
  }

  const accidentalInfo = determineAccidental(
    selectedNote.degree,
    chord,
    keySignatures,
    key
  );
  const generatedBassNote: VoiceNote = {
    ...selectedNote,
    name: accidentalInfo.prefix + selectedNote.name,
    length: rhythm.isPatternNote
      ? parseInt(rhythm.abcValue[0])
      : rhythm.totalValue,
    rest: false,
    accidental: accidentalInfo.accidental,
  };

  return generatedBassNote;
}

function generateVoiceNote(
  chord: Chord,
  rhythm: Rhythm,
  key: string,
  range: [number, number],
  previousNote?: VoiceNote,
  otherNotes: VoiceNote[] = [],
  maxSkip?: number
): VoiceNote {
  if (rhythm.rest) {
    return {
      name: "z",
      degree: -1,
      pitchValue: -1,
      length: rhythm.isPatternNote
        ? parseInt(rhythm.abcValue[0])
        : rhythm.totalValue,
      rest: true,
    };
  }

  // Get all possible notes for this voice part in the given range
  const possibleNotes = generatePossibleNotes(range, key).filter((note: Note) =>
    chord.triadNotes.includes(note.degree)
  );

  if (!possibleNotes.length) {
    throw new Error(
      `No possible notes found for chord ${chord.name} in range [${range[0]}, ${range[1]}]`
    );
  }

  // Filter notes based on voice leading rules
  let validNotes = possibleNotes;
  if (previousNote && !previousNote.rest) {
    const effectiveMaxSkip = maxSkip || getMaxSkip();
    validNotes = validNotes.filter(
      (note: Note) =>
        Math.abs(note.pitchValue - previousNote.pitchValue) <= effectiveMaxSkip
    );
  }

  // Filter out notes that would create parallel fifths
  if (previousNote && !previousNote.rest && otherNotes.length > 0) {
    validNotes = validNotes.filter((note: Note) => {
      // Check for parallel fifths with each other voice
      return !otherNotes.some((otherNote) => {
        if (otherNote.rest) return false;
        const prevInterval =
          Math.abs(previousNote.pitchValue - otherNote.pitchValue) % 7;
        const newInterval =
          Math.abs(note.pitchValue - otherNote.pitchValue) % 7;
        return prevInterval === 4 && newInterval === 4;
      });
    });
  }

  if (!validNotes.length) {
    throw new Error(
      `No valid notes found for chord ${chord.name} after applying voice leading rules`
    );
  }

  const selectedNote =
    validNotes[Math.floor(Math.random() * validNotes.length)];
  const accidentalInfo = determineAccidental(
    selectedNote.degree,
    chord,
    keySignatures,
    key
  );
  const generatedVoiceNote: VoiceNote = {
    ...selectedNote,
    name: accidentalInfo.prefix + selectedNote.name,
    length: rhythm.isPatternNote
      ? parseInt(rhythm.abcValue[0])
      : rhythm.totalValue,
    rest: false,
    accidental: accidentalInfo.accidental,
  };

  return generatedVoiceNote;
}
