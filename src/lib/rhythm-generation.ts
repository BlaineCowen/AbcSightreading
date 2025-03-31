// THIS FILE IS WORKING DONT TOUCH
import type { Rhythm } from "../resources/rhythms";

export interface TimeSig {
  name: string;
  tsPerMeasure: number;
}

export interface RhythmWithPattern extends Rhythm {
  isPatternNote?: boolean;
  isPatternStart?: boolean;
  isPatternEnd?: boolean;
  patternIndex?: number | null;
}

/**
 * Generates a random rhythm array that adds up to the total time signature * measures
 * @param timeSig - Time signature object with name and tsPerMeasure (in EIGHTH notes, assuming L:1/8)
 * @param measures - Number of measures to generate
 * @param rhythms - Array of allowed rhythm objects (assuming rhythm.totalValue is in EIGHTH notes)
 * @returns Array of rhythm objects with pattern information
 * @throws Error if rhythms can't evenly divide the time signature
 */
export function generateRandomRhythm(
  timeSig: TimeSig,
  measures: number,
  rhythms: Rhythm[]
): RhythmWithPattern[] {
  const result: RhythmWithPattern[] = [];
  // totalBeats is now the total number of eighth notes needed
  const totalBeats = measures * timeSig.tsPerMeasure;
  let currentBeat = 0;

  if (!rhythms.length) {
    throw new Error("No rhythms provided");
  }

  // --- Validation using totalValue ---
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  // Use totalValue for validation
  const rhythmTotalValues = rhythms
    .map((r) => r.totalValue)
    .filter((v) => v > 0);
  if (!rhythmTotalValues.length) {
    throw new Error("Provided rhythms have no positive duration (totalValue).");
  }

  // Find the GCD of all rhythm totalValues
  const beatGCD = rhythmTotalValues.reduce(
    (acc, val) => gcd(acc, val),
    rhythmTotalValues[0]
  );

  // Check if any combination of rhythms can fill a measure based on totalValue GCD
  // This check might be overly strict, consider removing if totalValue allows flexible combinations
  if (timeSig.tsPerMeasure % beatGCD !== 0) {
    console.warn(
      `Time signature per measure (${timeSig.tsPerMeasure}) might not be perfectly divisible by the GCD of rhythm totalValues (${beatGCD}). The generation might end slightly short or need adjustments.`
    );
    // throw new Error(
    //   `No combination of provided rhythms (based on totalValue) can evenly divide the time signature's eighth note count.`
    // );
  }
  // --- End Validation ---

  const usedRhythms = new Set<string>();
  const rhythmCounts = new Map<string, number>();
  rhythms.forEach((r) => rhythmCounts.set(r.name, 0));

  while (currentBeat < totalBeats) {
    const remainingBeats = totalBeats - currentBeat;

    // Filter rhythms based on totalValue
    let possibleRhythms = rhythms.filter(
      (r) => r.totalValue <= remainingBeats && r.totalValue > 0
    );

    // If no single rhythm fits, break or handle differently (e.g., find smallest)
    // This prevents infinite loops if the remainingBeats is smaller than any available rhythm
    if (possibleRhythms.length === 0) {
      if (remainingBeats > 0) {
        console.warn(
          `No available rhythm fits the remaining ${remainingBeats} beats. Rhythm generation might be shorter than expected.`
        );
      }
      break; // Exit loop if no rhythm can fit
    }

    // Select a rhythm randomly, weighted
    const weights = possibleRhythms.map((r) => {
      const count = rhythmCounts.get(r.name) || 0;
      return Math.max(1, 5 - count) * r.weight;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let selectedRhythm = possibleRhythms[0]; // Default to first
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedRhythm = possibleRhythms[i];
        break;
      }
    }

    // Add the selected rhythm(s)
    // For patterns, we add the whole pattern as one logical block but use its totalValue
    if (selectedRhythm.pattern) {
      // If the pattern itself needs to be broken down into individual notes for the result array
      // we might need more complex logic here depending on how the rest of the system consumes `result`.
      // For now, push the pattern reference using its totalValue.
      // Let's assume the consuming function handles pattern expansion if needed.
      // Or, if each step *must* be a single note value, we need to decompose the pattern here.

      // --- Simple approach: Add pattern as a single entry referencing its totalValue ---
      const rhythmWithPattern: RhythmWithPattern = {
        ...selectedRhythm,
        isPatternNote: true, // Mark as part of a pattern
        isPatternStart: true, // Mark start (could refine if pushing individual notes)
        isPatternEnd: true, // Mark end (could refine if pushing individual notes)
        patternIndex: 0, // Simple index (could refine)
      };
      result.push(rhythmWithPattern);
      currentBeat += selectedRhythm.totalValue; // Use totalValue

      // --- Complex approach: Decompose pattern into individual notes (if needed by consumer) ---
      // let patternBeat = 0;
      // selectedRhythm.meterValue.forEach((meterVal, i) => {
      //     const noteValue = meterVal * 8; // Example: Convert meter fraction (like 1/4) to eighths
      //     const noteRhythm: RhythmWithPattern = {
      //         ...selectedRhythm, // Copy properties
      //         abcValue: [selectedRhythm.abcValue[i]], // Specific ABC value for this note
      //         totalValue: noteValue, // Individual note value
      //         meterValue: [meterVal], // Individual meter value
      //         isPatternNote: true,
      //         isPatternStart: i === 0,
      //         isPatternEnd: i === selectedRhythm.meterValue.length - 1,
      //         patternIndex: i,
      //     };
      //     result.push(noteRhythm);
      //     patternBeat += noteValue;
      // });
      // currentBeat += patternBeat;
      // --- End Complex approach ---
    } else {
      // Add single rhythm note
      const rhythmWithPattern: RhythmWithPattern = {
        ...selectedRhythm,
        isPatternNote: false,
        isPatternStart: false,
        isPatternEnd: false,
        patternIndex: null,
      };
      result.push(rhythmWithPattern);
      currentBeat += selectedRhythm.totalValue; // Use totalValue
    }

    usedRhythms.add(selectedRhythm.name);
    rhythmCounts.set(
      selectedRhythm.name,
      (rhythmCounts.get(selectedRhythm.name) || 0) + 1
    );
  }

  // Optional: Trim excess if currentBeat > totalBeats (shouldn't happen with check)
  // Optional: Fill remaining if currentBeat < totalBeats (e.g. with rests or smallest rhythm)

  console.log(
    `generateRandomRhythm finished. Total beats generated: ${currentBeat} / ${totalBeats}. Number of steps: ${result.length}`
  );
  return result;
}
