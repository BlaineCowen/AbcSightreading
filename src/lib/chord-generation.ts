// THIS FILE IS WORKING DONT TOUCH
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";
import {
  type Note,
  type Chord,
  type ChordPossibility,
  ChordType,
  type VoicePart,
  type VoiceNote,
  type RhythmWithPattern,
  type Cadence,
  type CadenceStep,
  type KeySignatureInfo,
  type TimeSignature,
} from "./types";
import { getDiatonicDegree } from "./prep-params";

// Remove duplicate interface declarations since they're imported
export {
  type Note,
  type Chord,
  type ChordPossibility,
  ChordType,
  type VoicePart,
  type VoiceNote,
  type Rhythm,
} from "./types";

/**
 * Generates a chord progression and corresponding bass line, respecting cadences.
 */
export function generateChordProgression(
  allChords: Chord[],
  length: number,
  bassRange: [number, number],
  maxSkip: number,
  key: string,
  finalRhythms: RhythmWithPattern[],
  selectedCadences: Cadence[]
): { progression: Chord[]; bassLine: Note[] } {
  console.log(
    "\n=== Starting Chord Progression Generation (with Cadences) ==="
  );
  console.log("Input Chords:", allChords.map((c) => c.name).join(", "));
  console.log("Initial Length Param:", length);
  console.log("Bass Range:", JSON.stringify(bassRange));
  console.log("Max Skip:", maxSkip);
  console.log("Key:", key);
  console.log("Cadence Plan:", selectedCadences.map((c) => c.type).join(", "));

  // Validate inputs
  if (!allChords || allChords.length === 0) {
    throw new Error("No chords provided for progression generation.");
  }
  if (!finalRhythms || finalRhythms.length === 0) {
    throw new Error("Rhythm information is required for cadence placement.");
  }
  const keyInfo = keySignatures[key];
  if (!keyInfo) {
    throw new Error(
      `Key signature ${key} not found in keySignatures database.`
    );
  }

  // --- Determine Actual Chord Positions from Rhythms ---
  const chordIndicesMap: number[] = []; // Maps chord index (0, 1, ...) to rhythm index
  finalRhythms.forEach((rhythm, index) => {
    if (!rhythm.rest && (rhythm.isPatternNote ? rhythm.isPatternStart : true)) {
      chordIndicesMap.push(index);
    }
  });
  const actualNumChords = chordIndicesMap.length;
  if (actualNumChords === 0)
    throw new Error("No chord positions found in rhythm array.");
  if (actualNumChords !== length) {
    console.warn(
      `Length mismatch: Input length ${length}, actual chord positions from rhythm ${actualNumChords}. Using ${actualNumChords}.`
    );
    length = actualNumChords; // Correct the length
  }
  console.log(`Actual number of chords to generate: ${length}`);

  // --- Pre-Scan Rhythms for Cadence Constraints ---
  console.log("\n--- Mapping Cadence Constraints --- ");
  const cadenceConstraints = new Map<
    number,
    { requiredChord: Chord; step: CadenceStep }
  >();
  let cadencePlanIndex = 0;

  for (let chordIdx = 0; chordIdx < length; chordIdx++) {
    const rhythmIndex = chordIndicesMap[chordIdx];
    const rhythm = finalRhythms[rhythmIndex];

    if (rhythm.isCadenceEnd && cadencePlanIndex < selectedCadences.length) {
      const cadence = selectedCadences[cadencePlanIndex];
      const cadenceLen = cadence.progression.length;
      console.log(
        `Mapping Cadence ${cadencePlanIndex + 1} (${
          cadence.type
        }) ending at chord index ${chordIdx} (rhythm index ${rhythmIndex}), length ${cadenceLen}`
      );

      if (cadenceLen === 0) {
        console.warn(`Cadence ${cadence.type} has an empty progression.`);
        cadencePlanIndex++;
        continue;
      }

      for (let stepIdx = 0; stepIdx < cadenceLen; stepIdx++) {
        const cadenceStep = cadence.progression[stepIdx];
        // Calculate the chord index for this step of the cadence
        const targetChordIndex = chordIdx - (cadenceLen - 1 - stepIdx);

        if (targetChordIndex < 0) {
          console.warn(
            `Cadence step ${stepIdx + 1} of '${
              cadence.type
            }' at chord index ${chordIdx} falls before start of piece.`
          );
          continue;
        }

        let requiredChord: Chord | undefined;
        if (cadenceStep.requiredChord) {
          // Find chord matching the specific symbol (e.g., "V", "I")
          requiredChord = allChords.find(
            (c) => c.symbol === cadenceStep.requiredChord
          );
          if (!requiredChord) {
            console.warn(
              `Cadence requires symbol '${cadenceStep.requiredChord}' but not found in chord list. Attempting fallback by function.`
            );
            // Fallback: find *any* chord matching the function if symbol fails
            const functionalMatches = allChords.filter(
              (c) => c.type === cadenceStep.function
            );
            requiredChord =
              functionalMatches.length > 0 ? functionalMatches[0] : undefined;
          }
        } else {
          // If no specific symbol, use function (less common for cadences, but possible)
          const functionalMatches = allChords.filter(
            (c) => c.type === cadenceStep.function
          );
          console.warn(
            `Cadence step ${stepIdx + 1} only specified function '${
              cadenceStep.function
            }'. Using first available match.`
          );
          requiredChord =
            functionalMatches.length > 0 ? functionalMatches[0] : undefined;
        }

        if (requiredChord) {
          console.log(
            `  Constraint: Chord Index ${targetChordIndex} must be ${requiredChord.name} (Symbol: ${requiredChord.symbol})`
          );
          if (cadenceConstraints.has(targetChordIndex)) {
            console.warn(
              `  WARNING: Overwriting constraint at index ${targetChordIndex}. Was ${
                cadenceConstraints.get(targetChordIndex)?.requiredChord.name
              }, now ${requiredChord.name}. Check for overlapping cadences.`
            );
          }
          cadenceConstraints.set(targetChordIndex, {
            requiredChord,
            step: cadenceStep,
          });
        } else {
          // This is a critical failure - cannot fulfill the cadence plan
          throw new Error(
            `Cannot satisfy cadence constraint for step ${stepIdx + 1} (Req: ${
              cadenceStep.requiredChord || cadenceStep.function
            }) at chord index ${targetChordIndex}. No matching chord found in available list.`
          );
        }
      }
      cadencePlanIndex++;
    }
  }
  console.log(
    "Cadence constraints mapped:",
    cadenceConstraints.size > 0
      ? Object.fromEntries(cadenceConstraints)
      : "None"
  );

  // --- Generation Loop with Retries ---
  let availableChordsForAttempt = [...allChords]; // Chords available for the current attempt
  let outerAttempts = length * 2; // More generous retry limit
  const maxOuterAttempts = outerAttempts; // Store original limit for message
  let attemptError: Error | null = null; // Declare error variable OUTSIDE the loop

  while (outerAttempts > 0) {
    let progression: Chord[] = [];
    let bassLine: Note[] = [];
    let success = false;

    try {
      console.log(
        `\n--- Generation Attempt ${maxOuterAttempts - outerAttempts + 1} ---`
      );
      // Use the chords available for *this* attempt
      let currentAvailableChords = [...availableChordsForAttempt];
      console.log(
        `Available Chords for this attempt: ${currentAvailableChords
          .map((c) => c.name)
          .join(", ")}`
      );

      progression = [];
      bassLine = [];

      const tonicChords = currentAvailableChords.filter(
        (c) => c.type === "tonic"
      );
      if (tonicChords.length === 0) {
        throw new Error(
          "No tonic chords left in available set for this attempt."
        );
      }
      const maxInnerAttempts = 20; // Limit attempts per chord position

      // Step 1: Initial chord (Index 0)
      let firstChord: Chord | null = null;
      let firstBassNote: Note | null = null;
      let firstChordAttempts = 0;
      while (!firstBassNote && firstChordAttempts < maxInnerAttempts) {
        firstChordAttempts++;
        const constraint = cadenceConstraints.get(0);
        if (constraint) {
          firstChord =
            currentAvailableChords.find(
              (c) => c.name === constraint.requiredChord.name
            ) || null;
          if (!firstChord)
            throw new Error(
              `Required first cadence chord ${constraint.requiredChord.name} not in available set.`
            );
          console.log(
            `Attempt ${firstChordAttempts}: First chord forced by cadence: ${firstChord.name}`
          );
        } else {
          firstChord =
            tonicChords[Math.floor(Math.random() * tonicChords.length)];
          console.log(
            `Attempt ${firstChordAttempts}: Selected random tonic: ${firstChord.name}`
          );
        }
        firstBassNote = findValidBassNote(
          firstChord!,
          bassRange,
          undefined,
          maxSkip,
          key
        );
        if (!firstBassNote) {
          console.log(
            `No valid bass note for first chord ${
              firstChord!.name
            }, retrying selection if possible...`
          );
          if (constraint)
            throw new Error(
              `Cannot find bass note for forced first cadence chord ${
                firstChord!.name
              }`
            );
          firstChord = null; // Allow selection retry
        }
      }
      if (!firstChord || !firstBassNote)
        throw new Error(
          `Failed to find valid first chord/bass note after ${maxInnerAttempts} attempts.`
        );
      progression.push(firstChord);
      bassLine.push(firstBassNote);
      console.log(
        `Added first chord ${firstChord.name} with bass ${firstBassNote.name}`
      );

      // Step 2: Generate remaining chords (Indices 1 to length-1)
      for (let i = 1; i < length; i++) {
        console.log(`\nGenerating chord ${i + 1} of ${length} (Index ${i})`);
        const prevChord = progression[i - 1];
        const prevBassNote = bassLine[i - 1];
        let currentChord: Chord | null = null;
        let currentBassNote: Note | null = null;
        let validChordFound = false;
        let innerAttempts = 0;

        while (!validChordFound && innerAttempts < maxInnerAttempts) {
          innerAttempts++;
          console.log(` Inner attempt ${innerAttempts} for index ${i}`);
          let targetChord: Chord | null = null;

          // A. Check if cadence forces this chord
          const constraint = cadenceConstraints.get(i);
          if (constraint) {
            targetChord =
              currentAvailableChords.find(
                (c) => c.name === constraint.requiredChord.name
              ) || null;
            if (!targetChord)
              throw new Error(
                `Required cadence chord ${constraint.requiredChord.name} not in current available set at index ${i}.`
              );
            console.log(
              ` Position ${i} forced by cadence to be ${targetChord.name}`
            );
            if (
              !prevChord.nextChordPossibilities.some(
                (p) => p.name === targetChord!.name
              )
            ) {
              throw new Error(
                `Cadence constraint violation: Cannot transition from ${prevChord.name} to required ${targetChord.name} at index ${i}`
              );
            }
            console.log(
              ` Transition from ${prevChord.name} to forced ${targetChord.name} is valid.`
            );
            // If forced, this is the only chord to try
          } else {
            // B. Not forced - Apply lookahead & standard rules
            let possibleNextChords = currentAvailableChords.filter((c) =>
              prevChord.nextChordPossibilities.some((p) => p.name === c.name)
            );
            if (possibleNextChords.length === 0) {
              console.log(
                ` No chords in available set can follow ${prevChord.name}.`
              );
              // Attempt to recover by allowing any chord? Or just fail?
              // Forcing a retry is safer.
              throw new Error(
                `Dead end: No available successor for ${prevChord.name} at index ${i}.`
              );
            }

            // Lookahead: Check constraint on next chord (i+1)
            const nextConstraint = cadenceConstraints.get(i + 1);
            if (nextConstraint) {
              // Find the actual Chord object for the next constraint, assign null if undefined
              const requiredNextChordObj =
                currentAvailableChords.find(
                  (c) => c.name === nextConstraint.requiredChord.name
                ) || null;
              if (!requiredNextChordObj)
                throw new Error(
                  `Required next cadence chord ${nextConstraint.requiredChord.name} not in current available set.`
                );

              console.log(
                ` Lookahead: Next chord (index ${i + 1}) forced to ${
                  requiredNextChordObj.name
                }. Filtering current options.`
              );
              possibleNextChords = possibleNextChords.filter((c) =>
                // Check if chord 'c' has the requiredNextChordObj's name in its possibilities
                c.nextChordPossibilities.some(
                  (p) => p.name === requiredNextChordObj!.name
                )
              );
              if (possibleNextChords.length === 0) {
                throw new Error(
                  `Lookahead failed: No available chords at index ${i} (following ${
                    prevChord.name
                  }) can lead to required ${
                    requiredNextChordObj.name
                  } at index ${i + 1}`
                );
              }
              console.log(
                ` Remaining possibilities after lookahead: ${possibleNextChords
                  .map((c) => c.name)
                  .join(", ")}`
              );
            }

            // Apply standard penultimate/last chord rules ONLY if not constrained
            const isLast = i === length - 1;
            const isPenultimate = i === length - 2;
            // Only apply if this step AND the next step are NOT cadence-constrained
            if (isLast && !cadenceConstraints.has(i)) {
              const tonics = possibleNextChords.filter(
                (c) => c.type === "tonic"
              );
              if (tonics.length > 0) possibleNextChords = tonics;
              console.log(" Applying 'last chord is tonic' rule.");
            } else if (
              isPenultimate &&
              !cadenceConstraints.has(i) &&
              !cadenceConstraints.has(i + 1)
            ) {
              const dominants = possibleNextChords.filter(
                (c) => c.type === "dominant"
              );
              if (dominants.length > 0) possibleNextChords = dominants;
              console.log(
                " Applying 'penultimate is dominant if possible' rule."
              );
            }

            if (possibleNextChords.length === 0) {
              console.log(
                ` No possibilities remain after applying rules/lookahead for index ${i}.`
              );
              // This usually means the previous chord choice led to a dead end. Trigger outer retry.
              throw new Error(
                `Dead end after rules/lookahead at index ${i} following ${prevChord.name}.`
              );
            }

            // Select from possibilities (weighted random)
            const validPossibilities = prevChord.nextChordPossibilities.filter(
              (p) => possibleNextChords.some((c) => c.name === p.name)
            );
            targetChord = selectNextChord(
              validPossibilities,
              possibleNextChords
            );
          } // End else (not forced by cadence)

          if (!targetChord) {
            // Should only happen if selection failed
            console.log(
              `Failed to select target chord at index ${i} (Attempt ${innerAttempts})`
            );
            continue; // Retry inner loop
          }
          console.log(`Trying chord ${targetChord.name} for index ${i}`);

          // C. Find bass note for the target chord
          currentBassNote = findValidBassNote(
            targetChord,
            bassRange,
            prevBassNote,
            maxSkip,
            key
          );

          if (currentBassNote) {
            console.log(
              `Found valid bass note ${currentBassNote.name} for ${targetChord.name}`
            );
            currentChord = targetChord; // Confirm choice
            validChordFound = true;
          } else {
            console.log(`Could not find bass note for ${targetChord.name}.`);
            if (constraint) {
              // If the chord was forced by cadence, this attempt failed hard
              throw new Error(
                `Cannot find bass note for forced cadence chord ${targetChord.name} at index ${i}`
              );
            }
            // If not forced, maybe another chord from possibleNextChords would work?
            console.log(
              ` Bass note failed for ${targetChord.name}. Retrying inner loop to select different chord.`
            );
            // Mark this specific chord as unusable *for this inner attempt*?
            // Or just let the random selection try again? Letting it retry is simpler.
            targetChord = null; // Allow inner loop to retry selection
          }
        } // End inner attempts loop

        if (!validChordFound || !currentChord || !currentBassNote) {
          // If inner loop failed all attempts for this position 'i'
          throw new Error(
            `Failed to find valid chord/bass combination for index ${i} after ${maxInnerAttempts} attempts.`
          );
        }

        progression.push(currentChord);
        bassLine.push(currentBassNote);
        console.log(
          `Added chord ${i + 1}: ${currentChord.name} with bass ${
            currentBassNote.name
          }`
        );
      } // End main chord generation loop (i)

      // Success for this outer attempt
      success = true;
      attemptError = null;
    } catch (error: any) {
      console.error("\n--- ERROR during generation attempt --- ");
      console.error(error.message);
      console.log(
        " Progression state at failure:",
        progression.map((c) => c.name).join(" ")
      );
      attemptError = error;

      // --- Strategy for Retry: Remove Problematic Precursor ---
      if (progression.length > 0) {
        const problemPrecursor = progression[progression.length - 1];
        console.log(
          `Removing chord ${problemPrecursor.name} from available set for next attempt.`
        );
        availableChordsForAttempt = availableChordsForAttempt.filter(
          (c) => c.name !== problemPrecursor.name
        );
        if (availableChordsForAttempt.length < 2) {
          console.error("Too few chords remaining after removal. Aborting.");
          outerAttempts = 0;
        }
      } else {
        console.log("Failed on first chord, cannot remove precursor.");
        outerAttempts = 0;
      }
      // --- End Retry Strategy ---
    } // End try-catch block for outer attempt

    if (success) {
      console.log("\n=== Final Progression Successful ===");
      console.log("Chords:", progression.map((c) => c.name).join(" "));
      console.log("Bass line:", bassLine.map((n) => n.name).join(" "));
      return { progression, bassLine };
    }

    // Decrement outer attempts and loop again if necessary
    outerAttempts--;
    if (outerAttempts <= 0) {
      console.log("Maximum outer attempts reached.");
    }
  } // End outer attempts loop

  // If all outer attempts failed
  console.error("\n=== ALL GENERATION ATTEMPTS FAILED ===");
  if (attemptError) {
    console.error("Last error:", attemptError.message);
  }
  throw new Error(
    `Failed to generate valid progression after all attempts. Last error: ${
      attemptError?.message || "Unknown"
    }`
  );
}

// Helper function to convert diatonic scale degree (0-6) to chromatic pitch class (0-11)
function diatonicToChromatic(diatonic: number): number {
  // Map of how many semitones each scale degree is from the root
  const semitones = [0, 2, 4, 5, 7, 9, 11];
  return semitones[diatonic];
}

// Helper function to find a valid bass note for a chord
function findValidBassNote(
  chord: Chord,
  bassRange: [number, number],
  prevNote: Note | undefined,
  maxSkip: number,
  key: string
): Note | null {
  console.log("\n=== Finding Valid Bass Note ===");
  console.log("Chord:", chord);
  console.log("Bass Range:", bassRange);
  console.log("Previous Note:", prevNote);
  console.log("Max Skip:", maxSkip);
  console.log("Key:", key);

  // Get target degree based on chord root
  const targetDegree = chord.root;
  console.log("Target Degree:", targetDegree);

  const keyInfo = keySignatures[key];
  if (!keyInfo) {
    throw new Error(`Key signature not found for key: ${key}`);
  }

  const possibleNotes: Note[] = [];

  // For each pitch in the bass range
  for (let pitch = bassRange[0]; pitch <= bassRange[1]; pitch++) {
    const noteName = noteArray[pitch];
    if (!noteName) continue;

    // Use getDiatonicDegree to get the correct scale degree for this pitch in the current key
    const degree = getDiatonicDegree(pitch, keyInfo);

    if (degree === targetDegree) {
      // Check if this degree needs an accidental based on the chord
      let finalNoteName = noteName;
      const chromaticDegree = diatonicToChromatic(targetDegree);

      if (chord.sharpScaleDegree === targetDegree) {
        // If this degree should be sharp in this chord
        if (chord.type === "secondary-dominant") {
          // For secondary dominants, check if the degree is already sharp/flat in key
          if (keySignatures[key].sharps?.includes(chromaticDegree)) {
            finalNoteName = "^^" + noteName; // Double sharp if already sharp
          } else if (keySignatures[key].flats?.includes(chromaticDegree)) {
            finalNoteName = "=" + noteName; // Natural if flat
          } else {
            finalNoteName = "^" + noteName; // Sharp if natural
          }
        }
      } else if (chord.flatScaleDegree === targetDegree) {
        // If this degree should be flat in this chord
        if (keySignatures[key].sharps?.includes(chromaticDegree)) {
          finalNoteName = "=" + noteName; // Natural if sharp
        } else if (keySignatures[key].flats?.includes(chromaticDegree)) {
          finalNoteName = "__" + noteName; // Double flat if already flat
        } else {
          finalNoteName = "_" + noteName; // Flat if natural
        }
      }

      possibleNotes.push({
        name: finalNoteName,
        degree: targetDegree,
        pitchValue: pitch,
      });
    }
  }

  console.log(
    "Found possible notes:",
    possibleNotes.map((n) => `${n.name} (pitch: ${n.pitchValue})`)
  );

  // If no previous note, just take the middle note
  if (!prevNote) {
    const middleIndex = Math.floor(possibleNotes.length / 2);
    return possibleNotes[middleIndex] || null;
  }

  // Sort by distance from previous note
  possibleNotes.sort((a, b) => {
    const distA = Math.abs(a.pitchValue - prevNote.pitchValue);
    const distB = Math.abs(b.pitchValue - prevNote.pitchValue);
    return distA - distB;
  });

  // Return first note within maxSkip distance
  for (const note of possibleNotes) {
    if (Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip) {
      return note;
    }
  }

  return null;
}

/**
 * Helper to get octave markers for a pitch value
 */
function getOctaveMarkers(pitch: number): string {
  const octave = Math.floor(pitch / 7);
  return octave <= 0 ? ",".repeat(-octave) : "'".repeat(octave);
}

/**
 * Helper to map string chord types to ChordType enum
 */
export function mapChordType(type: string): ChordType {
  switch (type.toLowerCase()) {
    case "tonic":
      return ChordType.Tonic;
    case "predominant":
      return ChordType.Predominant;
    case "dominant":
      return ChordType.Dominant;
    case "mediant":
      return ChordType.Mediant;
    case "leading-tone":
      return ChordType.LeadingTone;
    case "secondary-dominant":
      return ChordType.SecondaryDominant;
    default:
      return ChordType.Tonic; // Default to tonic for unknown types
  }
}

/**
 * Helper to find valid note for a voice part
 */
function findValidVoiceNote(
  chord: Chord,
  range: [number, number],
  prevNote?: Note,
  maxSkip: number = 4,
  otherVoiceNotes: Note[] = []
): Note {
  const noteNames = ["C", "D", "E", "F", "G", "A", "B"];
  const octaves = Math.floor((range[1] - range[0]) / 7) + 1;

  // Get all possible chord tones within range
  let possibleNotes = chord.triadNotes
    .flatMap((degree) =>
      Array.from({ length: octaves }, (_, i) => {
        const pitch = range[0] + degree + i * 7;
        const octaveMarkers = getOctaveMarkers(pitch);
        return {
          name: noteNames[degree % 7] + octaveMarkers,
          degree,
          pitchValue: pitch,
        };
      })
    )
    .filter(
      (note) =>
        // Strictly enforce range
        note.pitchValue >= range[0] &&
        note.pitchValue <= range[1] &&
        // Within max skip if previous note exists
        (!prevNote ||
          Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip) &&
        // No voice crossing with other parts
        !otherVoiceNotes.some(
          (other) =>
            other &&
            !other.rest &&
            Math.abs(note.pitchValue - other.pitchValue) < 2
        )
    );

  if (possibleNotes.length === 0) {
    throw new Error(
      `No valid notes found in range [${range[0]}, ${range[1]}] for chord ${chord.name}`
    );
  }

  // If we have a previous note, prefer:
  // 1. The same note if it's in the chord (repeated notes are good!)
  // 2. The closest note within maxSkip
  if (prevNote) {
    // Try to find the same note first if it's in range
    const sameNote = possibleNotes.find(
      (n) => n.pitchValue === prevNote.pitchValue
    );
    if (sameNote) {
      return sameNote;
    }

    // Sort by distance from previous note
    possibleNotes.sort((a, b) => {
      const distA = Math.abs(a.pitchValue - prevNote.pitchValue);
      const distB = Math.abs(b.pitchValue - prevNote.pitchValue);
      return distA - distB;
    });
  }

  return possibleNotes[0];
}

// Function to select next chord based on weights
function selectNextChord(
  possibilities: ChordPossibility[],
  availableChords: Chord[]
): Chord | null {
  if (
    !possibilities ||
    possibilities.length === 0 ||
    !availableChords ||
    availableChords.length === 0
  )
    return null;

  // Filter possibilities further to only include those actually available
  const validPossibilities = possibilities.filter((p) =>
    availableChords.some((c) => c.name === p.name)
  );
  if (validPossibilities.length === 0) return null; // No intersection

  const totalWeight = validPossibilities.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight <= 0) {
    // Handle cases with zero weights
    const fallbackChord = availableChords.find(
      (c) => c.name === validPossibilities[0].name
    );
    return fallbackChord || null;
  }
  let random = Math.random() * totalWeight;

  for (const possibility of validPossibilities) {
    random -= possibility.weight;
    if (random <= 0) {
      const nextChord = availableChords.find(
        (c) => c.name === possibility.name
      );
      return nextChord || null; // Return null if find fails unexpectedly
    }
  }
  // Fallback if something went wrong with weights/random
  const fallbackChord = availableChords.find(
    (c) => c.name === validPossibilities[validPossibilities.length - 1].name
  );
  return fallbackChord || null;
}

// Helper function to generate a tonic chord
function generateTonicChord(): Chord {
  return {
    root: 0, // F in F major
    type: "tonic",
    name: "F",
    triadNotes: [0, 2, 4], // Root position triad (F, A, C)
    symbol: "F",
    nextChordPossibilities: [{ name: "dominant", weight: 1 }],
    baseMultiplier: 1,
  };
}

// Helper function to generate the next chord
function generateNextChord(prevChord: Chord, isLast: boolean): Chord {
  if (isLast) {
    return generateTonicChord(); // End on tonic
  }

  // For now, just alternate between tonic and dominant
  if (prevChord.type === "tonic") {
    return {
      root: 4, // C in F major
      type: "dominant",
      name: "C",
      triadNotes: [4, 6, 1], // Root position triad (C, E, G)
      symbol: "C",
      nextChordPossibilities: [{ name: "tonic", weight: 1 }],
      baseMultiplier: 1,
    };
  } else {
    return generateTonicChord();
  }
}
