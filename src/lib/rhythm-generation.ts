import type {
  Rhythm,
  RhythmWithPattern,
  TimeSignature,
  Cadence,
} from "./types";

/**
 * Length in 32nd-note units of one element of a rhythm's `abcValue`.
 * Rest elements are written with a leading "z" (e.g. eighthRestEighth is
 * ["z4", "4"]), so a bare parseInt would yield NaN and silently corrupt every
 * running total downstream.
 */
function abcDuration(abcVal: string): number {
  return parseInt(String(abcVal).replace(/^[a-z]+/i, ""), 10);
}

/** True when an `abcValue` element is a rest. */
function isRestValue(abcVal: string): boolean {
  return String(abcVal).startsWith("z");
}

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
  disableRhythmFilter: boolean = false,
  allowTiesAcrossBarline: boolean = false
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
          (abcVal) => abcDuration(abcVal) < 8
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

  /**
   * May this rhythm run past the barline? Only a plain note can: a pattern is
   * a beamed group that has to stay inside one measure, and a rest that spans
   * a barline is just two rests, which reads worse than keeping it whole.
   */
  const canCrossBarline = (r: Rhythm) =>
    allowTiesAcrossBarline && !r.pattern && !r.rest;

  /** Durations that need a dot: dotted eighth, quarter and half, in 32nds. */
  const DOTTED_UNITS = new Set([6, 12, 24]);

  /**
   * A note split across a barline must land on two plainly written halves. A
   * dotted note either side of the tie reads as an addition rather than a
   * continuation - a whole note starting on beat 4 of 4/4 would come out
   * "quarter tied to dotted half" - so those crossings are refused and the
   * rhythm is placed somewhere it can be written cleanly instead.
   *
   * Notes never exceed one measure (filtered above), so a crossing splits in
   * exactly two.
   */
  const crossesCleanly = (r: Rhythm, measureRemaining: number) => {
    if (r.totalValue <= measureRemaining) return true; // does not cross
    return (
      !DOTTED_UNITS.has(measureRemaining) &&
      !DOTTED_UNITS.has(r.totalValue - measureRemaining)
    );
  };

  /**
   * Would placing this rhythm here leave a hole nothing can fill? If the
   * remainder of the measure is shorter than the shortest note available, the
   * measure can never be completed. With ties on there is no such thing: any
   * note can start in the gap and spill over the barline.
   */
  const leavesInsolubleGap = (r: Rhythm, measurePosition: number) => {
    if (r.pattern || r.rest || allowTiesAcrossBarline) return false;
    const newMeasurePos = measurePosition + r.totalValue;
    if (newMeasurePos <= 0 || newMeasurePos >= timeSig.tsPerMeasure) {
      return false;
    }
    const remainder = timeSig.tsPerMeasure - newMeasurePos;
    if (remainder <= 0) return false;
    const nonRestCandidates = rhythms.filter(
      (rr) => !rr.rest && !rr.pattern && rr.totalValue > 0
    );
    if (nonRestCandidates.length === 0) return false;
    const minNonRest = nonRestCandidates.reduce(
      (min, rr) => (rr.totalValue < min ? rr.totalValue : min),
      nonRestCandidates[0].totalValue
    );
    return remainder < minNonRest;
  };

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
    // Prefer whole (fills measure) > half (fills half-measure) > everything else.
    // Dotted notes feel rushed as phrase endings; whole and half notes are cleaner.
    const measureFill = singleRhythms.find(
      (r) => r.totalValue === timeSig.tsPerMeasure
    );
    const halfFill = singleRhythms.find(
      (r) => r.totalValue === timeSig.tsPerMeasure / 2
    );
    longestSingleRhythm =
      measureFill ||
      halfFill ||
      singleRhythms.reduce(
        (longest, current) =>
          current.totalValue > longest.totalValue ? current : longest,
        singleRhythms[0]
      );
    longestDuration = longestSingleRhythm.totalValue;

    if (longestDuration > timeSig.tsPerMeasure * 4) {
      console.warn(
        `Cadence rhythm (${longestDuration}) is longer than a 4-measure block. Cadence enforcement might behave unexpectedly.`
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

  // Reserving a long note for the cadence is itself a choice that can dead-end:
  // it carves a tail off the block, and what is left may not tile even when the
  // whole block would. A block that fails this way is refilled once without the
  // reservation. Holds the start beat of the block that opted out.
  let cadenceOptOutAt = -1;

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
    if (enforceCadence && currentBeat !== cadenceOptOutAt) {
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

    // The fill is a depth-first walk, and a greedy walk can paint itself into a
    // corner: a half rest in 3/4 leaves 8 units that nothing can occupy, and no
    // amount of looking one step ahead catches every such case. So each choice
    // is recorded, and a dead end rewinds to the last one, marks it unusable at
    // that position, and takes a different route. A selection is only refused
    // once every route has been tried.
    const blockStartBeat = currentBeat;
    const blockStartResultLen = result.length;
    let fillFailed = false;
    const trail: { beat: number; resultLen: number; name: string }[] = [];
    const blocked = new Map<number, Set<string>>();
    let backtracks = 0;
    const maxBacktracks = 400;

    const backtrack = (): boolean => {
      if (trail.length === 0 || backtracks >= maxBacktracks) return false;
      backtracks++;
      const step = trail.pop() as { beat: number; resultLen: number; name: string };
      // Everything explored beyond this decision belongs to the subtree we are
      // abandoning, so its exclusions no longer apply.
      for (const beat of [...blocked.keys()]) {
        if (beat > step.beat) blocked.delete(beat);
      }
      const excluded = blocked.get(step.beat) ?? new Set<string>();
      excluded.add(step.name);
      blocked.set(step.beat, excluded);

      result.length = step.resultLen;
      currentBeat = step.beat;
      const count = rhythmCounts.get(step.name) ?? 0;
      if (count > 0) rhythmCounts.set(step.name, count - 1);
      return true;
    };

    // --- Inner loop: Fill until sectionEndTarget ---
    while (currentBeat < sectionEndTarget) {
      const remainingBeatsInSection = sectionEndTarget - currentBeat;
      const currentMeasurePosition = currentBeat % timeSig.tsPerMeasure;
      const measureRemaining = timeSig.tsPerMeasure - currentMeasurePosition;

      // Choices already shown to dead-end from this exact position.
      const blockedHere = blocked.get(currentBeat);

      // Filter possible rhythms using the already filtered list
      let possibleRhythms = rhythms.filter((r) => {
        if (blockedHere?.has(r.name)) return false;
        // Basic length check for this section
        if (r.totalValue > remainingBeatsInSection) return false;
        // Check measure fit. A note may run past the barline only when ties
        // are on, in which case the writer splits it into tied notes either
        // side of the bar. Patterns and rests never cross one.
        if (r.totalValue > measureRemaining && !canCrossBarline(r)) return false;
        if (!crossesCleanly(r, measureRemaining)) return false;

        // --- Placement Rules ---
        // In L:1/32: quarter-note beat positions are multiples of 8.
        // The "and" of each beat falls at positions where % 8 === 4.
        // Allow notes up to dotted-quarter (12) at "and" positions but block half-note+ to
        // keep rhythms from starting on off-beats with excessively long values.
        if (timeSig.tsPerMeasure >= 8) {
          const pos = currentMeasurePosition % 8;
          if (pos === 2 || pos === 6) {
            // 16th-note off-beats: block quarter-note or longer
            if (r.totalValue >= 8) return false;
          } else if (pos === 4) {
            // "and" of each beat: block half-note or longer (allow quarter/dotted-quarter)
            if (r.totalValue >= 16) return false;
          }
        }
        // After a very short note (sixteenth or shorter), don't allow a large jump to a long note
        if (result.length > 0) {
          const lastRhythm = result[result.length - 1];
          if (lastRhythm.totalValue <= 4 && r.totalValue >= 16) return false;
        }
        // --- End Placement Rules ---

        // --- Lookahead: prevent placing a rhythm that would leave an insoluble gap ---
        if (leavesInsolubleGap(r, currentMeasurePosition)) return false;
        // --- End Lookahead ---

        // --- Pattern Fit Check ---
        if (r.pattern) {
          const patternTotal = r.abcValue.reduce(
            (sum, v) => sum + abcDuration(v),
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
            !blockedHere?.has(r.name) &&
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
                !blockedHere?.has(r.name) &&
                (r.totalValue <= measureRemaining || canCrossBarline(r)) && // Must fit the measure, or be allowed to tie past it
                crossesCleanly(r, measureRemaining) && // ...and split into two undotted halves
                r.totalValue <= remainingBeatsInSection && // Must fit in the section
                r.totalValue > 0 && // Must have a positive duration
                // Placing a note the lookahead rejected is what leaves a
                // measure that can never be completed - and the abort that
                // follows drops the rest of the bar, running two half-filled
                // measures together.
                !leavesInsolubleGap(r, currentMeasurePosition)
            )
            .sort((a, b) => b.totalValue - a.totalValue); // Sort descending to get largest fit first

          if (bestFittingFallback.length > 0) {
            possibleRhythms = [bestFittingFallback[0]]; // Take the largest one that fits
            console.log(
              `[Debug] Fallback (2): No exact fit. Using largest fitting rhythm: ${possibleRhythms[0].name} (value: ${possibleRhythms[0].totalValue})`
            );
          } else if (backtrack()) {
            // Rewound to the previous choice with that route excluded; retry.
            continue;
          } else {
            console.error(
              `CRITICAL: no rhythm fits at beat ${currentBeat} and every route has been tried (${backtracks} backtracks). Remaining in section: ${remainingBeatsInSection}, remaining in measure: ${measureRemaining}.`
            );
            fillFailed = true;
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

      trail.push({
        beat: currentBeat,
        resultLen: result.length,
        name: selectedRhythm.name,
      });

      // Add selected rhythm(s) to result
      if (selectedRhythm.pattern) {
        let patternBeat = 0;
        selectedRhythm.abcValue.forEach((abcVal, i) => {
          // A pattern element carries its own rest marker, so the rest flag
          // comes from the element rather than from the pattern as a whole.
          const noteValue = abcDuration(abcVal);
          const isRest = isRestValue(abcVal);
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
            rest: isRest,
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

    if (fillFailed) {
      // Every route through this block failed. If the only thing constraining
      // it was the reserved cadence note, hand the block back and refill it
      // without one before giving up.
      if (sectionEndTarget < blockEndTarget && cadenceOptOutAt !== blockStartBeat) {
        console.warn(
          `Refilling the block at ${blockStartBeat} without a reserved cadence note.`
        );
        result.length = blockStartResultLen;
        currentBeat = blockStartBeat;
        cadenceOptOutAt = blockStartBeat;
        continue;
      }
      currentBeat = sectionEndTarget; // Give up on this block.
    }

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
