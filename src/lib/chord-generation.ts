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
 * Returns true if an UPPER voice in the previous chord has a diatonic neighbor of the
 * next chord's chromatic degree. The root is excluded because it is typically in the bass,
 * and the bass is excluded from taking the chromatic note when accidentalsByStep is on.
 * Falls back to including the root for minor-key chords where the tonic (root of i) is
 * the most natural approach to the raised leading tone.
 */
function hasApproachableAccidental(prevChord: Chord, nextChord: Chord): boolean {
  const chromDeg = nextChord.sharpScaleDegree ?? nextChord.flatScaleDegree;
  if (chromDeg === undefined || chromDeg === null) return true;
  const adjDegrees = [(chromDeg - 1 + 7) % 7, (chromDeg + 1) % 7];

  // Check non-root tones first (upper voices). The root is normally carried by the bass
  // which cannot take the chromatic note when accidentalsByStep is on.
  const nonRootTones = prevChord.triadNotes.filter((deg) => deg !== prevChord.root);
  if (nonRootTones.some((deg) => adjDegrees.includes(deg))) return true;

  // Fallback: allow the root as an approach source for minor-mode chords (e.g., i→V
  // in harmonic minor, where the tonic A is adjacent to the raised leading tone G#).
  // This is musically valid: the tonic in an upper voice can step to the leading tone.
  if (nextChord.mode === "minor" || prevChord.mode === "minor") {
    return prevChord.triadNotes.some((deg) => adjDegrees.includes(deg));
  }

  return false;
}

/**
 * Returns true if at least one successor of `candChord` (within `availableChords`) contains
 * the resolution tone for its chromatic degree. Raised degrees resolve up; flatted degrees down.
 */
function hasResolvableAccidental(candChord: Chord, availableChords: Chord[]): boolean {
  const chromDeg = candChord.sharpScaleDegree ?? candChord.flatScaleDegree;
  if (chromDeg === undefined || chromDeg === null) return true;
  const isRaised = candChord.sharpScaleDegree !== undefined && candChord.sharpScaleDegree !== null;
  const resolutionDeg = isRaised ? (chromDeg + 1) % 7 : (chromDeg - 1 + 7) % 7;
  const possibleSuccessors = availableChords.filter((c) =>
    candChord.nextChordPossibilities.some((p) => p.name === c.name)
  );
  return possibleSuccessors.some((c) => c.triadNotes.includes(resolutionDeg));
}

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
  selectedCadences: Cadence[],
  accidentalsByStep: boolean = false,
  chromaticFrequency: number = 1
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
          key,
          accidentalsByStep
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

      // Track whether the previous bass was a chromatic-bass note (V⁶/V style)
      // that must resolve by step. Reset to undefined each outer attempt.
      let forcedNextBassPitch: number | undefined = undefined;
      {
        const fc = firstChord;
        const fChromDeg = fc.sharpScaleDegree ?? fc.flatScaleDegree;
        if (
          accidentalsByStep &&
          fChromDeg !== undefined && fChromDeg !== null &&
          fc.root === fChromDeg
        ) {
          const isRaised = fc.sharpScaleDegree !== undefined && fc.sharpScaleDegree !== null;
          forcedNextBassPitch = firstBassNote.pitchValue + (isRaised ? 1 : -1);
        }
      }

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

            // Accidental approach feasibility: only allow secondary dominants when the
            // previous chord contains a diatonic neighbor of the chromatic tone.
            // This ensures at least one voice can approach the accidental by step.
            if (accidentalsByStep) {
              const approachable = possibleNextChords.filter((c) =>
                hasApproachableAccidental(prevChord, c)
              );
              if (approachable.length > 0) possibleNextChords = approachable;

              // Resolution feasibility: only pick a chromatic chord when at least one of
              // its successors has the resolution tone, so the raised/lowered note can
              // always be followed by the required step.
              const resolvable = possibleNextChords.filter((c) =>
                hasResolvableAccidental(c, currentAvailableChords)
              );
              if (resolvable.length > 0) possibleNextChords = resolvable;

              // Direct resolution: if the PREVIOUS chord had a chromatic degree, the
              // CURRENT chord must contain the resolution tone so forcedPitch can be
              // satisfied. (hasResolvableAccidental only ensures a *future* successor has
              // it — without this, e.g. V/V → ii is allowed even though ii lacks G.)
              const chromDegPrev = prevChord.sharpScaleDegree ?? prevChord.flatScaleDegree;
              if (chromDegPrev !== undefined && chromDegPrev !== null) {
                const isRaisedPrev = prevChord.sharpScaleDegree !== undefined && prevChord.sharpScaleDegree !== null;
                const resDeg = isRaisedPrev
                  ? (chromDegPrev + 1) % 7
                  : (chromDegPrev - 1 + 7) % 7;
                const directResolving = possibleNextChords.filter((c) =>
                  c.triadNotes.includes(resDeg)
                );
                if (directResolving.length > 0) possibleNextChords = directResolving;
              }

              // Cadence look-ahead resolution: if the NEXT position is cadence-forced,
              // exclude current candidates whose chromatic degree doesn't resolve into
              // that forced chord. Without this, e.g. V/V can be chosen here even though
              // the next forced cadence chord (IV) has no G for F# to resolve into.
              if (nextConstraint) {
                const forcedNextChord = currentAvailableChords.find(
                  (c) => c.name === nextConstraint.requiredChord.name
                );
                if (forcedNextChord) {
                  const cadenceResolvable = possibleNextChords.filter((c) => {
                    const chromDeg = c.sharpScaleDegree ?? c.flatScaleDegree;
                    if (chromDeg === undefined || chromDeg === null) return true;
                    const isRaised = c.sharpScaleDegree !== undefined && c.sharpScaleDegree !== null;
                    const resDeg = isRaised ? (chromDeg + 1) % 7 : (chromDeg - 1 + 7) % 7;
                    return forcedNextChord.triadNotes.includes(resDeg);
                  });
                  if (cadenceResolvable.length > 0) possibleNextChords = cadenceResolvable;
                }
              }

              // Chromatic-bass approach: V⁶/V-type chords (chord.root === chromDeg) can
              // only be selected when the previous bass note is exactly one diatonic step
              // from any chromatic-bass pitch in the bass range.
              const chromBassApproachable = possibleNextChords.filter((c) => {
                const cChromDeg = c.sharpScaleDegree ?? c.flatScaleDegree;
                if (cChromDeg === undefined || cChromDeg === null || c.root !== cChromDeg) return true;
                for (let p = bassRange[0]; p <= bassRange[1]; p++) {
                  if (getDiatonicDegree(p, keyInfo) === cChromDeg &&
                      Math.abs(p - prevBassNote.pitchValue) === 1) {
                    return true;
                  }
                }
                return false;
              });
              if (chromBassApproachable.length > 0) possibleNextChords = chromBassApproachable;

              // Bass resolution: if the previous chord had a chromatic bass (V⁶/V),
              // only allow chords that can provide the forced resolution pitch in the bass.
              if (forcedNextBassPitch !== undefined) {
                const bassResolvable = possibleNextChords.filter((c) => {
                  for (let p = bassRange[0]; p <= bassRange[1]; p++) {
                    if (p === forcedNextBassPitch) {
                      const deg = getDiatonicDegree(p, keyInfo);
                      if (c.triadNotes.includes(deg)) return true;
                    }
                  }
                  return false;
                });
                if (bassResolvable.length > 0) possibleNextChords = bassResolvable;
              }
            }

            // Select from possibilities (weighted random).
            // Boost chromatic chord weights by chromaticFrequency multiplier.
            const validPossibilities = prevChord.nextChordPossibilities
              .filter((p) => possibleNextChords.some((c) => c.name === p.name))
              .map((p) => {
                if (chromaticFrequency === 1) return p;
                const chord = possibleNextChords.find((c) => c.name === p.name);
                const isChromatic = chord &&
                  ((chord.sharpScaleDegree !== undefined && chord.sharpScaleDegree !== null) ||
                   (chord.flatScaleDegree !== undefined && chord.flatScaleDegree !== null));
                return isChromatic ? { ...p, weight: p.weight * chromaticFrequency } : p;
              });
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

          // C. Find bass note for the target chord.
          // At cadence-forced positions, allow larger bass leaps — cadential bass
          // motion (V→I is a descending 5th) is disjunct by nature and not subject
          // to the same stepwise maxSkip that governs the middle of phrases
          // (Aldwell/Schachter: "bass lines are often quite disjunct, particularly
          // at the ends of phrases").
          const effectiveMaxSkip = constraint ? 7 : maxSkip;
          currentBassNote = findValidBassNote(
            targetChord,
            bassRange,
            prevBassNote,
            effectiveMaxSkip,
            key,
            accidentalsByStep,
            forcedNextBassPitch
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

        // Update forced bass pitch: set when this chord placed a chromatic bass
        // note (V⁶/V style), requiring the next bass to resolve by step.
        forcedNextBassPitch = undefined;
        const newChromDeg = currentChord.sharpScaleDegree ?? currentChord.flatScaleDegree;
        if (
          accidentalsByStep &&
          newChromDeg !== undefined && newChromDeg !== null &&
          currentChord.root === newChromDeg
        ) {
          const isRaised = currentChord.sharpScaleDegree !== undefined && currentChord.sharpScaleDegree !== null;
          forcedNextBassPitch = currentBassNote.pitchValue + (isRaised ? 1 : -1);
        }
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

        // Protect chords that are essential for cadences or starting the progression.
        // Removing these would make subsequent attempts structurally impossible.
        const cadenceRequiredNames = new Set(
          [...cadenceConstraints.values()].map((c) => c.requiredChord.name)
        );
        const isProtected =
          problemPrecursor.type === "tonic" ||
          problemPrecursor.type === "dominant" ||
          cadenceRequiredNames.has(problemPrecursor.name);

        if (isProtected) {
          console.log(
            `Chord ${problemPrecursor.name} is protected (${problemPrecursor.type}/cadence-required) — not removing from available set.`
          );
        } else {
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

// Helper function to find a valid bass note for a chord.
// Allows root position (5/3) and first inversion (6/3) — the 3rd in the bass.
// First inversion is the standard voice-leading tool for smooth stepwise bass motion
// when root position would require a skip exceeding maxSkip (Aldwell/Schachter Ch. 8).
// Second inversion (6/4) is avoided as it is dissonant in simple chorale style.
// When accidentalsByStep is on, chromatically-altered degrees are excluded from the bass
// UNLESS chord.root === chromDeg (chromatic-bass inversions like V⁶/V), in which case
// step approach is enforced instead. forcedPitch forces the returned note to a specific
// pitch value (used to enforce bass resolution after a chromatic-bass note).
function findValidBassNote(
  chord: Chord,
  bassRange: [number, number],
  prevNote: Note | undefined,
  maxSkip: number,
  key: string,
  accidentalsByStep: boolean = false,
  forcedPitch?: number
): Note | null {
  console.log("\n=== Finding Valid Bass Note ===");
  console.log("Chord:", chord);
  console.log("Bass Range:", bassRange);
  console.log("Previous Note:", prevNote);
  console.log("Max Skip:", maxSkip);
  console.log("Key:", key);

  // Root and 3rd are both valid in the bass (root position and first inversion).
  // The 5th (second inversion / 6/4) is avoided for diatonic chords in basic chorale style.
  const targetDegrees = new Set([chord.root, chord.triadNotes[1]]);

  // When accidentalsByStep is on, keep the chromatic degree out of the bass so it is
  // always handled by an upper voice that can approach it by step.
  // Exception: chromatic-bass inversions (V⁶/V) where chord.root === chromDeg — the
  // chromatic degree IS the intended bass note. Leave targetDegrees intact and enforce
  // step approach below after possibleNotes is built.
  if (accidentalsByStep) {
    const chromDeg = chord.sharpScaleDegree ?? chord.flatScaleDegree;
    if (chromDeg !== undefined && chromDeg !== null && chord.root !== chromDeg) {
      targetDegrees.delete(chromDeg);
      if (targetDegrees.size < 2 && chord.triadNotes[2] !== undefined) {
        targetDegrees.add(chord.triadNotes[2]); // 5th — second inversion as inversion fallback
      }
    }
  }

  console.log("Target Degrees (root + 3rd):", [...targetDegrees]);

  const keyInfo = keySignatures[key];
  if (!keyInfo) {
    throw new Error(`Key signature not found for key: ${key}`);
  }

  let possibleNotes: Note[] = [];

  // For each pitch in the bass range
  for (let pitch = bassRange[0]; pitch <= bassRange[1]; pitch++) {
    const noteName = noteArray[pitch];
    if (!noteName) continue;

    // Use getDiatonicDegree to get the correct scale degree for this pitch in the current key
    const degree = getDiatonicDegree(pitch, keyInfo);

    if (!targetDegrees.has(degree)) continue;

    // Apply accidental prefix using diatonic key-signature degrees (not chromatic pitch classes).
    // Previous code incorrectly compared chromatic values against the diatonic-degree arrays,
    // which produced ^B instead of =B in flat keys (e.g. F major, where B is degree 6 = flat).
    let finalNoteName = noteName;

    if (chord.sharpScaleDegree === degree) {
      if (keyInfo.sharps?.includes(degree)) {
        finalNoteName = "^^" + noteName; // already sharp in key → double-sharp
      } else if (keyInfo.flats?.includes(degree)) {
        finalNoteName = "=" + noteName;  // flat in key → raise to natural
      } else {
        finalNoteName = "^" + noteName;  // natural in key → raise to sharp
      }
    } else if (chord.flatScaleDegree === degree) {
      if (keyInfo.sharps?.includes(degree)) {
        finalNoteName = "=" + noteName;  // sharp in key → lower to natural
      } else if (keyInfo.flats?.includes(degree)) {
        finalNoteName = "__" + noteName; // already flat in key → double-flat
      } else {
        finalNoteName = "_" + noteName;  // natural in key → lower to flat
      }
    }

    possibleNotes.push({
      name: finalNoteName,
      degree,
      pitchValue: pitch,
    });
  }

  console.log(
    "Found possible notes:",
    possibleNotes.map((n) => `${n.name} (pitch: ${n.pitchValue}, degree: ${n.degree})`)
  );

  // Chromatic-bass chord (V⁶/V): the chromatic degree is the intended bass.
  // It must be approached by exactly one diatonic step from the previous bass note.
  const chromDegBass = chord.sharpScaleDegree ?? chord.flatScaleDegree;
  if (
    accidentalsByStep &&
    chromDegBass !== undefined && chromDegBass !== null &&
    chord.root === chromDegBass
  ) {
    if (!prevNote) return null; // Cannot place chromatic bass without a previous note
    const stepApproachable = possibleNotes.filter(
      (n) => n.degree !== chromDegBass || Math.abs(n.pitchValue - prevNote.pitchValue) === 1
    );
    if (stepApproachable.length > 0) possibleNotes = stepApproachable;
    else return null; // No step-approachable chromatic bass pitch in range
  }

  // If no previous note, prefer root position (structural stability at phrase start).
  // Fall back to inversions only if no root is in range.
  if (!prevNote) {
    const rootNotes = possibleNotes.filter((n) => n.degree === chord.root);
    const pool = rootNotes.length > 0 ? rootNotes : possibleNotes;
    const middleIndex = Math.floor(pool.length / 2);
    return pool[middleIndex] || null;
  }

  // Among reachable chord tones, prefer the one closest to the midpoint of the bass range.
  // This "midrange preference" avoids landing on extreme positions that create dead ends
  // (e.g., V root at the very bottom of the range where I root is 3+ steps away with maxSkip=2).
  // Prefer root position over first inversion when both candidates score equally well.
  const midpoint = (bassRange[0] + bassRange[1]) / 2;

  const reachable = possibleNotes.filter(
    (n) => Math.abs(n.pitchValue - prevNote.pitchValue) <= maxSkip
  );

  if (reachable.length === 0) return null;

  // Forced resolution pitch: used when the previous bass was a chromatic-bass note
  // (V⁶/V) that must resolve by step. Return the exact pitch or null to trigger retry.
  if (forcedPitch !== undefined) {
    const atForced = reachable.filter((n) => n.pitchValue === forcedPitch);
    if (atForced.length > 0) return atForced[0];
    return null;
  }

  // Primary: prefer the note closest to the range midpoint (avoids extreme positions
  // that create dead ends when navigating with tight maxSkip in short ranges).
  // Tiebreak 1: prefer root over inversion (structural stability).
  // Tiebreak 2: prefer closer to prevNote (smooth voice leading).
  return reachable.reduce((best, n) => {
    const bestMidDist = Math.abs(best.pitchValue - midpoint);
    const nMidDist = Math.abs(n.pitchValue - midpoint);
    if (nMidDist < bestMidDist) return n;
    if (nMidDist > bestMidDist) return best;
    // Equal midrange: prefer root over inversion
    const nIsRoot = n.degree === chord.root;
    const bestIsRoot = best.degree === chord.root;
    if (nIsRoot && !bestIsRoot) return n;
    if (!nIsRoot && bestIsRoot) return best;
    // Equal everything: prefer closer to prevNote
    return Math.abs(n.pitchValue - prevNote.pitchValue) <
      Math.abs(best.pitchValue - prevNote.pitchValue)
      ? n
      : best;
  });
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
