import type {
  Rhythm,
  RhythmWithPattern,
  TimeSignature,
  Cadence,
} from "./types";

/**
 * Generates a random rhythm array, ensuring the longest single rhythm ends each 4-measure block.
 * Filters rhythms to:
 * - Exclude notes < quarter note (totalValue < 8).
 * - Exclude notes > measure length (totalValue > timeSig.tsPerMeasure).
 * - Exclude patterns containing notes < quarter note.
 * @param timeSig - Use TimeSignature type here
 * @param measures - Total number of measures.
 * @param availableRhythms - Array of ALL allowed rhythm objects.
 * @param selectedCadences - Array of planned Cadence objects.
 * @returns Array of rhythm objects with pattern and cadence information.
 * @throws Error if requirements can't be met.
 */
export function generateRandomRhythm(
  timeSig: TimeSignature,
  measures: number,
  availableRhythms: Rhythm[],
  selectedCadences: Cadence[],
  disableRhythmFilter: boolean = false
): RhythmWithPattern[] {
  let rhythms = [...availableRhythms]; // Start with all available rhythms

  if (!disableRhythmFilter) {
    // Filter rhythms:
    // - Exclude notes with totalValue < 8 (shorter than a quarter note)
    // - Exclude notes with totalValue > timeSig.tsPerMeasure (longer than a measure)
    // - Exclude patterns containing any note with value < 8
    // TODO: Add filter for dotted notes if needed
    rhythms = availableRhythms.filter((r) => {
      // Exclude if the total value is less than a quarter note
      if (r.totalValue < 8) {
        return false;
      }
      // Exclude if the total value is greater than the measure duration
      if (r.totalValue > timeSig.tsPerMeasure) {
        return false;
      }

      // If it's a pattern, check individual notes
      if (r.pattern) {
        // Check if any note within the pattern is < quarter note
        const containsShortNote = r.abcValue.some(
          (abcVal) => parseInt(abcVal) < 8
        );
        if (containsShortNote) {
          return false; // Exclude patterns containing short notes
        }
      }
      // Keep non-pattern notes >= 8 AND <= measure length,
      // and patterns with all notes >= 8 AND total pattern length <= measure length
      return true;
    });
  }

  if (!rhythms.length) {
    throw new Error(
      "No rhythms available after filtering for quarter notes or longer (value >= 8 and <= measure length)."
    );
  }

  const result: RhythmWithPattern[] = [];
  const totalBeats = measures * timeSig.tsPerMeasure;
  let currentBeat = 0;
  let cadenceIndex = 0; // Track which cadence we are working towards

  // --- Find Longest Single Rhythm (Needed for cadence points) ---
  const singleRhythms = rhythms.filter((r) => !r.pattern && r.totalValue > 0);
  const enforceCadence = singleRhythms.length > 0;
  let longestSingleRhythm: Rhythm = {
    name: "",
    abcValue: [],
    meterValue: [],
    totalValue: 0,
    rest: false,
    oddsWeight: 0,
    maxRng: 0,
    pattern: false,
    symbol: "",
    weight: 0,
  };
  let longestDuration = 0;

  if (enforceCadence) {
    longestSingleRhythm = singleRhythms.reduce(
      (longest, current) =>
        current.totalValue > longest.totalValue ? current : longest,
      singleRhythms[0]
    );
    longestDuration = longestSingleRhythm.totalValue;

    if (longestDuration > timeSig.tsPerMeasure * 4) {
      console.warn(
        `Longest single rhythm (${longestDuration}) is longer than a 4-measure block. Cadence enforcement might behave unexpectedly.`
      );
    }
  } else {
    console.warn(
      "No single (non-pattern) rhythms provided. Cadence points will not be enforced with a long note."
    );
  }
  // --- End Find Longest ---

  // --- Validation using totalValue ---
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  const rhythmTotalValues = rhythms
    .map((r) => r.totalValue)
    .filter((v) => v > 0);
  if (!rhythmTotalValues.length) {
    throw new Error("Provided rhythms have no positive duration (totalValue).");
  }

  const beatGCD = rhythmTotalValues.reduce(
    (acc, val) => gcd(acc, val),
    rhythmTotalValues[0]
  );

  if (beatGCD === 0) {
    // Handle case where filtering removed all rhythms
    throw new Error(
      "No rhythms remaining after filtering (value >= 8, <= measure length, and no patterns with notes < 8). Cannot calculate GCD."
    );
  }

  if (timeSig.tsPerMeasure % beatGCD !== 0) {
    console.warn(
      `Time signature per measure (${timeSig.tsPerMeasure}) might not be perfectly divisible by the GCD of rhythm totalValues (${beatGCD}).`
    );
  }
  // --- End Validation ---

  const usedRhythms = new Set<string>();
  const rhythmCounts = new Map<string, number>();
  rhythms.forEach((r) => rhythmCounts.set(r.name, 0));

  // --- Main Generation Loop ---
  while (currentBeat < totalBeats) {
    // --- Determine Current Cadence Block Target ---
    const currentMeasure = Math.floor(currentBeat / timeSig.tsPerMeasure);
    const measuresUntilNextCadence = 4 - (currentMeasure % 4);
    const beatsAtNextCadence =
      (Math.floor(currentMeasure / 4) + 1) * 4 * timeSig.tsPerMeasure;

    // Ensure target doesn't exceed total beats
    const blockEndTarget = Math.min(beatsAtNextCadence, totalBeats);
    let sectionEndTarget = blockEndTarget;

    // Target beat *before* placing the final long note, if enforcing cadence
    if (enforceCadence) {
      sectionEndTarget = blockEndTarget - longestDuration;
    }

    // Handle edge case: If the block is shorter than the longest note
    if (enforceCadence && sectionEndTarget < currentBeat) {
      // This implies the remaining space is less than longestDuration.
      // Fill the rest of the block without forcing the long note.
      sectionEndTarget = blockEndTarget;
      console.warn(
        `Block ending at ${blockEndTarget} is too short for longest note (${longestDuration}). Filling normally.`
      );
    }

    console.log(
      `Looping: currentBeat=${currentBeat}, blockEndTarget=${blockEndTarget}, sectionEndTarget=${sectionEndTarget}, cadenceIndex=${cadenceIndex}`
    );

    // --- Inner loop: Fill until sectionEndTarget ---
    while (currentBeat < sectionEndTarget) {
      const remainingBeatsInSection = sectionEndTarget - currentBeat;
      const currentMeasurePosition = currentBeat % timeSig.tsPerMeasure;
      const measureRemaining = timeSig.tsPerMeasure - currentMeasurePosition;

      // Filter possible rhythms using the already filtered list
      let possibleRhythms = rhythms.filter((r) => {
        // Basic length check for this section
        if (r.totalValue > remainingBeatsInSection) return false;
        // Check measure fit
        if (r.totalValue > measureRemaining) return false;

        // --- Keep Existing Placement Rules ---
        // Prevent long rhythms on weak beats (adjust logic if needed based on timeSig.tsPerMeasure)
        if (timeSig.tsPerMeasure >= 8) {
          // Assuming L:1/32, check rules for 4/4, 3/4 etc.
          if (
            currentMeasurePosition % 8 === 2 ||
            currentMeasurePosition % 8 === 6
          ) {
            // Off-beats in 4/4
            if (r.totalValue >= 8) return false; // Quarter note or longer
          } else if (currentMeasurePosition % 8 === 4) {
            // Beat 3 in 4/4
            if (r.totalValue >= 6) return false; // Dotted 8th or longer
          } // Add more rules if needed
        }
        // Prevent certain rhythms after short notes
        if (result.length > 0) {
          const lastRhythm = result[result.length - 1];
          if (lastRhythm.totalValue <= 4) {
            // After 16th or shorter
            if (r.totalValue >= 12) return false; // Prevent dotted quarter or longer
          }
        }
        // --- End Placement Rules ---

        // --- Pattern Fit Check ---
        if (r.pattern) {
          const patternTotal = r.abcValue.reduce(
            (sum, v) => sum + parseInt(v),
            0
          );
          if (currentBeat + patternTotal > sectionEndTarget) return false;
          if (patternTotal > measureRemaining) return false;
          // Add pattern-specific placement rules if needed
        }
        // --- End Pattern Check ---

        return true;
      });

      // Handle case where no rhythm fits after applying placement rules
      if (possibleRhythms.length === 0) {
        console.log(
          `[Debug] No possible rhythms after placement rules at beat ${currentBeat}. measureRemaining: ${measureRemaining}, remainingBeatsInSection: ${remainingBeatsInSection}. Attempting fallback.`
        );

        // Fallback 1: Try to find an exact fit for the remaining part of the measure
        // Ensure we are looking at the initially filtered 'rhythms' list
        const exactFitForMeasure = rhythms.find(
          (r) =>
            r.totalValue === measureRemaining && // Exactly fits the measure
            r.totalValue <= remainingBeatsInSection && // Also fits in the section
            r.totalValue > 0 && // Must have a positive duration
            !r.pattern // Prefer non-patterns for simple fill, can be adjusted
        );

        if (exactFitForMeasure) {
          possibleRhythms = [exactFitForMeasure];
          console.log(
            `[Debug] Fallback (1): Using exact fit for measure: ${exactFitForMeasure.name} (value: ${exactFitForMeasure.totalValue})`
          );
        } else {
          // Fallback 2: Try to find the largest rhythm that fits the measure and section
          const bestFittingFallback = rhythms
            .filter(
              (r) =>
                r.totalValue <= measureRemaining && // Must fit in the measure
                r.totalValue <= remainingBeatsInSection && // Must fit in the section
                r.totalValue > 0 // Must have a positive duration
            )
            .sort((a, b) => b.totalValue - a.totalValue); // Sort descending to get largest fit first

          if (bestFittingFallback.length > 0) {
            possibleRhythms = [bestFittingFallback[0]]; // Take the largest one that fits
            console.log(
              `[Debug] Fallback (2): No exact fit. Using largest fitting rhythm: ${possibleRhythms[0].name} (value: ${possibleRhythms[0].totalValue})`
            );
          } else {
            console.error(
              `CRITICAL: Fallback failed. Cannot find any rhythm to fit at beat ${currentBeat}. Remaining in section: ${remainingBeatsInSection}, Remaining in measure: ${measureRemaining}. Aborting block.`
            );
            currentBeat = sectionEndTarget; // Force moving to next section/cadence placement
            break; // Break from the inner while loop
          }
        }
      }

      // Select rhythm randomly (weighted)
      const weights = possibleRhythms.map((r) => {
        const count = rhythmCounts.get(r.name) || 0;
        return Math.max(1, 5 - count) * r.weight; // Example weighting
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      let selectedRhythm = possibleRhythms[0]; // Default
      for (let i = 0; i < possibleRhythms.length; i++) {
        if (weights[i] <= 0) continue;
        random -= weights[i];
        if (random <= 0) {
          selectedRhythm = possibleRhythms[i];
          break;
        }
      }

      // Add selected rhythm(s) to result
      if (selectedRhythm.pattern) {
        let patternBeat = 0;
        selectedRhythm.abcValue.forEach((abcVal, i) => {
          const noteValue = parseInt(abcVal);
          const noteRhythm: RhythmWithPattern = {
            ...selectedRhythm,
            name: selectedRhythm.name,
            abcValue: [abcVal],
            totalValue: noteValue,
            meterValue: [selectedRhythm.meterValue[i]],
            isPatternNote: true,
            isPatternStart: i === 0,
            isPatternEnd: i === selectedRhythm.abcValue.length - 1,
            patternIndex: i,
            weight: selectedRhythm.weight,
            pattern: true,
            rest: selectedRhythm.rest,
            oddsWeight: selectedRhythm.oddsWeight,
            maxRng: selectedRhythm.maxRng,
            symbol: selectedRhythm.symbol,
          };
          result.push(noteRhythm);
          patternBeat += noteValue;
        });
        currentBeat += patternBeat;
      } else {
        const rhythmWithPattern: RhythmWithPattern = {
          ...selectedRhythm,
          isPatternNote: false,
          isPatternStart: false,
          isPatternEnd: false,
          patternIndex: null,
        };
        result.push(rhythmWithPattern);
        currentBeat += selectedRhythm.totalValue;
      }
      // Update counts
      rhythmCounts.set(
        selectedRhythm.name,
        (rhythmCounts.get(selectedRhythm.name) || 0) + 1
      );
    } // --- End Inner loop ---

    // --- Place Cadence Note (Longest Single Rhythm) ---
    // Check if we are at a cadence point (or the very end) AND if the block was long enough
    if (
      enforceCadence &&
      currentBeat === sectionEndTarget &&
      blockEndTarget > sectionEndTarget
    ) {
      if (currentBeat < totalBeats) {
        // Ensure we haven't already finished
        console.log(
          `Placing cadence note (${longestSingleRhythm.name}) at beat ${currentBeat}`
        );
        const cadenceRhythm: RhythmWithPattern = {
          ...longestSingleRhythm,
          isPatternNote: false,
          isPatternStart: false,
          isPatternEnd: false,
          patternIndex: null,
          isCadenceEnd: true, // Mark as cadence end
          cadenceType: selectedCadences[cadenceIndex]?.type || "Unknown", // Add cadence type
        };
        result.push(cadenceRhythm);
        currentBeat += longestDuration;
        cadenceIndex++; // Move to the next planned cadence
      } else {
        // This case should ideally not be reached due to outer loop condition
        console.warn(
          "Reached section end exactly at totalBeats, skipping final cadence note placement logic."
        );
      }
    } else if (currentBeat < blockEndTarget) {
      // If the inner loop broke early OR the block was too short for longest note,
      // we might have a gap before the blockEndTarget. Fill it? Or just move on?
      // For now, let's just log and move to the next block boundary by setting currentBeat.
      // A more robust solution might involve gap filling here.
      console.warn(
        `Gap detected or block too short at beat ${currentBeat}. Target was ${blockEndTarget}. Moving to target.`
      );
      currentBeat = blockEndTarget;
    }
    // If currentBeat >= blockEndTarget, the loop condition `currentBeat < totalBeats` will handle termination or continuation.
  } // --- End Outer Loop ---

  // --- Final Validation ---
  const finalGeneratedBeats = result.reduce((sum, r) => sum + r.totalValue, 0);
  if (finalGeneratedBeats !== totalBeats) {
    console.error(
      `Generated rhythm mismatch! Expected ${totalBeats} beats, got ${finalGeneratedBeats}.`
    );
    // Consider adding logic to trim or pad the result if necessary
  }

  console.log(
    `generateRandomRhythm finished. Generated ${result.length} steps, ${finalGeneratedBeats}/${totalBeats} beats.`
  );
  return result;
}
