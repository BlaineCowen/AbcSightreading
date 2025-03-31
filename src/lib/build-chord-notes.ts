import {
  type VoicePart,
  type VoiceNote,
  type Note,
  type Chord,
  type Rhythm,
} from "./types";
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";

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

  if (chord.sharpScaleDegree === degree) {
    if (isFlattedInKey) {
      // If the note is flat in the key and needs to be raised, make it natural
      return { accidental: "natural", prefix: "=" };
    } else if (isSharpenedInKey) {
      // If already sharp in key and needs to be raised, make it double sharp
      return { accidental: "double-sharp", prefix: "^^" };
    } else {
      // If natural in key and needs to be raised, make it sharp
      return { accidental: "sharp", prefix: "^" };
    }
  } else if (chord.flatScaleDegree === degree) {
    if (isFlattedInKey) {
      // If already flat in key and needs to be lowered, make it double flat
      return { accidental: "double-flat", prefix: "__" };
    } else if (isSharpenedInKey) {
      // If sharp in key and needs to be lowered, make it natural
      return { accidental: "natural", prefix: "=" };
    } else {
      // If natural in key and needs to be lowered, make it flat
      return { accidental: "flat", prefix: "_" };
    }
  }

  return { accidental: null, prefix: "" };
}

function getMaxSkip(prevNote: Note | undefined, nextNote: Note): number {
  // If either note has an accidental, enforce step-wise motion
  if (prevNote?.accidental || nextNote.accidental) {
    return 2; // Allow only step-wise motion (2 semitones)
  }
  return 4; // Default max skip
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
  console.log("  -> Entering buildChordNotes");
  const allVoiceNotes: VoiceNote[][] = voiceParts.map(() => []);
  const keyInfo = keySignatures[key];
  if (!keyInfo) throw new Error(`Key signature not found for key: ${key}`);

  // Count non-rest positions that need chords
  const chordPositions = rhythms.filter((r) => !r.rest).length;

  // Validate inputs
  if (progression.length !== chordPositions) {
    throw new Error(
      `Chord progression length (${progression.length}) does not match number of non-rest positions (${chordPositions})`
    );
  }

  if (bassLine.length !== chordPositions) {
    throw new Error(
      `Bass line length (${bassLine.length}) does not match number of non-rest positions (${chordPositions})`
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

    console.log(
      `[${voicePart.name}] Initial notes in range [${voicePart.range[0]},${voicePart.range[1]}]: ${validNotes.length}`
    );

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
    console.log(
      `[${voicePart.name}] Notes matching chord tones (${degreesToUse}): ${validNotes.length}`
    );

    // Apply voice leading if we have a previous note
    if (previousNote && !previousNote.rest) {
      validNotes = validNotes.filter(
        (note) => Math.abs(note.pitchValue - previousNote.pitchValue) <= maxSkip
      );
      console.log(
        `[${voicePart.name}] Notes after voice leading filter: ${validNotes.length}`
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

    console.log(
      `[${voicePart.name}] Notes after voice crossing check: ${validNotes.length}`
    );

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
      // If no previous note, select from the lower third of the valid range for lower voices,
      // middle third for middle voices, and upper third for higher voices
      const rangePosition = voicePart.order / (voiceParts.length - 1); // 0 to 1
      const index = Math.floor(validNotes.length * rangePosition);
      selectedNote = validNotes[Math.min(index, validNotes.length - 1)];
    }

    console.log(
      `[${voicePart.name}] Selected note: ${selectedNote.name} (Degree: ${selectedNote.degree}, Pitch: ${selectedNote.pitchValue})`
    );

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
    allVoiceNotes.forEach((voice) => {
      voice.length = 0;
    });

    for (let stepIndex = 0; stepIndex < rhythms.length; stepIndex++) {
      const rhythm = rhythms[stepIndex];
      const isFirstStep = stepIndex === 0;

      if (rhythm.rest) {
        // For rests, add rest notes to all parts
        voiceParts.forEach((_, voiceIndex) => {
          allVoiceNotes[voiceIndex].push({
            name: "z",
            degree: 0,
            pitchValue: 0,
            length: rhythm.totalValue,
            rest: true,
          });
        });
        continue;
      }

      const currentChord = chordProgression[chordIndex];
      if (!currentChord) {
        console.error(
          `    -> ERROR: Chord undefined at chordIndex ${chordIndex} for step ${
            stepIndex + 1
          }`
        );
        return false;
      }

      if (isFirstStep)
        console.log(
          `      Processing STEP 1 (Rhythm: ${rhythm.name}, Chord: ${currentChord.symbol})`
        );

      const maxStepRetries = 5;
      let stepRetryCount = 0;
      let stepSuccess = false;

      while (stepRetryCount < maxStepRetries && !stepSuccess) {
        stepRetryCount++;
        if (isFirstStep)
          console.log(`          Step 1 Attempt ${stepRetryCount}`);

        const stepNotesAttempt: (VoiceNote | null)[] = new Array(
          voiceParts.length
        ).fill(null);
        const pitchCheckArray: number[] = new Array(voiceParts.length).fill(0);
        let stepGenerationFailed = false;

        // Process Bass First - Use the provided bassLine
        const bassPartInfo = voiceParts.find((vp) => vp.order === 0);
        const otherPartsInfo = voiceParts.filter((vp) => vp.order !== 0);
        const shuffledOtherParts = shuffleArray([...otherPartsInfo]);

        if (isFirstStep)
          console.log(
            `            Shuffle Order for Attempt ${stepRetryCount}: Bass, ${shuffledOtherParts
              .map((p) => p.name)
              .join(", ")}`
          );

        // Process Bass First using the provided bassLine
        if (!bassPartInfo) {
          console.error("            Bass part definition not found!");
          stepGenerationFailed = true;
        } else {
          const bassVoiceIndex = voiceParts.findIndex((vp) => vp.order === 0);
          if (isFirstStep)
            console.log(`            Processing Bass part first (Order: 0)`);

          const bassNote = bassLine[chordIndex];
          if (!bassNote) {
            console.error(
              `            Bass note missing for chord index ${chordIndex}`
            );
            stepGenerationFailed = true;
          } else {
            const generatedBassNote: VoiceNote = {
              ...bassNote,
              length: rhythm.totalValue,
              rest: false,
            };
            stepNotesAttempt[bassVoiceIndex] = generatedBassNote;
            pitchCheckArray[bassVoiceIndex] = generatedBassNote.pitchValue;
            if (isFirstStep)
              console.log(
                `            Bass note generated: ${generatedBassNote.name}, (Pitch: ${generatedBassNote.pitchValue})`
              );
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

            if (isFirstStep)
              console.log(
                `            Processing ${actualPartName} (Order: ${voicePart.order})`
              );

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
                if (isFirstStep)
                  console.warn(
                    `            [${actualPartName}] No valid notes found after filtering.`
                  );
                throw new Error(
                  `No valid notes for ${actualPartName} after filtering`
                );
              }

              let finalNoteName = selectedNote.name;
              const noteDegree = selectedNote.degree;
              const notePitchClass = selectedNote.pitchValue % 12;
              if (
                currentChord.sharpScaleDegree !== undefined &&
                noteDegree === currentChord.sharpScaleDegree
              ) {
                const accidentalInfo = determineAccidental(
                  noteDegree,
                  currentChord,
                  keySignatures,
                  key
                );
                finalNoteName = accidentalInfo.prefix + selectedNote.name;
                selectedNote.accidental = accidentalInfo.accidental;
              } else if (
                currentChord.flatScaleDegree !== undefined &&
                noteDegree === currentChord.flatScaleDegree
              ) {
                const accidentalInfo = determineAccidental(
                  noteDegree,
                  currentChord,
                  keySignatures,
                  key
                );
                finalNoteName = accidentalInfo.prefix + selectedNote.name;
                selectedNote.accidental = accidentalInfo.accidental;
              }

              generatedVoiceNote = {
                ...selectedNote,
                name: finalNoteName,
                length: rhythm.totalValue,
                rest: false,
              };
            } catch (e: any) {
              if (isFirstStep)
                console.error(
                  `            [${actualPartName}] Error finding note: ${e.message}`
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
              if (isFirstStep)
                console.error(
                  `            [${actualPartName}] Generated note is unexpectedly null.`
                );
              stepGenerationFailed = true;
              break;
            }
          }
        }

        // Post-Attempt Checks
        if (stepGenerationFailed) {
          if (isFirstStep)
            console.warn(
              `          Step 1 Attempt ${stepRetryCount} FAILED generation.`
            );
          continue; // Try step again
        }

        // Create array of [order, pitch] pairs and sort by order
        const voiceOrderPitches = voiceParts.map((part, index) => ({
          order: part.order,
          pitch: pitchCheckArray[index],
        }));
        voiceOrderPitches.sort((a, b) => a.order - b.order);
        const orderedPitches = voiceOrderPitches.map((v) => v.pitch);

        if (isFirstStep) {
          console.log(
            `          Step 1 Attempt ${stepRetryCount} Pitches (Original): [${pitchCheckArray.join(
              ","
            )}]`
          );
          console.log(
            `          Step 1 Attempt ${stepRetryCount} Pitches (By Voice Order): [${orderedPitches.join(
              ","
            )}]`
          );
        }

        // Check voice order using the correctly ordered pitchCheckArray
        if (isVoiceOrderValid(orderedPitches)) {
          stepNotesAttempt.forEach((note, voiceIndex) => {
            // Ensure we push to the correct original index in allVoiceNotes
            if (note) allVoiceNotes[voiceIndex].push(note);
          });
          stepSuccess = true;
          if (isFirstStep)
            console.log(
              `          Step 1 Attempt ${stepRetryCount} SUCCEEDED.`
            );
        } else {
          if (isFirstStep) {
            console.warn(
              `          Step 1 Attempt ${stepRetryCount} FAILED voice order validation. Ordered pitches: [${orderedPitches.join(
                ","
              )}]`
            );
          }
        }
      }

      if (!stepSuccess) {
        console.error(
          `    -> FAILED to generate valid notes for step ${
            stepIndex + 1
          } (Rhythm: ${rhythm.name}, Chord: ${
            currentChord.symbol
          }) after ${maxStepRetries} attempts.`
        );
        return false; // Fail entire process
      }

      // Increment chordIndex only AFTER a successful non-rest step
      chordIndex++;
    }

    return true;
  }

  console.log(
    `  -> Starting main retry loop (max attempts: ${maxTotalLoopFails})`
  );
  while (totalLoopFails < maxTotalLoopFails) {
    console.log(`    Attempt #${totalLoopFails + 1}...`);
    if (processRhythms(rhythms, progression, voiceParts, bassLine, maxSkip)) {
      console.log("  -> Successfully generated notes within max attempts.");
      return allVoiceNotes;
    }
    totalLoopFails++;
    console.warn(`    Attempt #${totalLoopFails} failed. Retrying...`);
  }

  console.error(
    `  -> FAILED to build valid notes after ${maxTotalLoopFails} attempts.`
  );
  throw new Error("Failed to build valid notes after max attempts");
}

/**
 * Helper to get octave markers for a pitch value
 */
function getOctaveMarkers(pitch: number): string {
  const octave = Math.floor(pitch / 7);
  return octave <= 0 ? ",".repeat(-octave) : "'".repeat(octave);
}
