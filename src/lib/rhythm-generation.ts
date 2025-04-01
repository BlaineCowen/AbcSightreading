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
  const totalBeats = measures * timeSig.tsPerMeasure;
  let currentBeat = 0;

  if (!rhythms.length) {
    throw new Error("No rhythms provided");
  }

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

  if (timeSig.tsPerMeasure % beatGCD !== 0) {
    console.warn(
      `Time signature per measure (${timeSig.tsPerMeasure}) might not be perfectly divisible by the GCD of rhythm totalValues (${beatGCD}).`
    );
  }

  const usedRhythms = new Set<string>();
  const rhythmCounts = new Map<string, number>();
  rhythms.forEach((r) => rhythmCounts.set(r.name, 0));

  while (currentBeat < totalBeats) {
    const remainingBeats = totalBeats - currentBeat;
    const currentMeasurePosition = currentBeat % timeSig.tsPerMeasure;

    // Filter rhythms based on totalValue and measure position
    let possibleRhythms = rhythms.filter((r) => {
      // Basic length check
      if (r.totalValue > remainingBeats) return false;

      // Check if rhythm would fit in current measure
      const measureRemaining = timeSig.tsPerMeasure - currentMeasurePosition;
      if (r.totalValue > measureRemaining) return false;

      // Prevent long rhythms on weak beats
      if (
        currentMeasurePosition % 8 === 2 ||
        currentMeasurePosition % 8 === 6
      ) {
        // On "e" of any beat (2/32, 10/32, 18/32, 26/32)
        if (r.totalValue >= 8) return false; // No quarter notes or longer
      } else if (currentMeasurePosition % 8 === 4) {
        // On "+" of any beat (4/32, 12/32, 20/32, 28/32)
        if (r.totalValue >= 6) return false; // No dotted eighths or longer
      } else if (currentMeasurePosition % 8 === 6) {
        // On "a" of any beat (6/32, 14/32, 22/32, 30/32)
        if (r.totalValue >= 4) return false; // No eighth notes or longer
      }

      // Prevent certain rhythms after short notes
      if (result.length > 0) {
        const lastRhythm = result[result.length - 1];
        if (lastRhythm.totalValue <= 4) {
          // If last note was sixteenth or shorter
          if (r.totalValue >= 12) return false; // No dotted quarters or longer
        }
      }

      return true;
    });

    // If no single rhythm fits, try to find the smallest possible rhythm
    if (possibleRhythms.length === 0) {
      possibleRhythms = [
        rhythms.reduce((a, b) => (a.totalValue < b.totalValue ? a : b)),
      ];
    }

    // Select a rhythm randomly, weighted
    const weights = possibleRhythms.map((r) => {
      const count = rhythmCounts.get(r.name) || 0;
      return Math.max(1, 5 - count) * r.weight;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let selectedRhythm = possibleRhythms[0];
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedRhythm = possibleRhythms[i];
        break;
      }
    }

    // Add the selected rhythm(s)
    if (selectedRhythm.pattern) {
      // Verify pattern fits in measure
      const patternTotal = selectedRhythm.abcValue.reduce(
        (sum, v) => sum + parseInt(v),
        0
      );
      if (patternTotal > timeSig.tsPerMeasure - currentMeasurePosition) {
        // Skip this pattern and try again
        continue;
      }

      // Decompose pattern into individual notes
      let patternBeat = 0;
      selectedRhythm.abcValue.forEach((abcVal, i) => {
        const noteValue = parseInt(abcVal);
        const noteRhythm: RhythmWithPattern = {
          ...selectedRhythm,
          abcValue: [abcVal],
          totalValue: noteValue,
          meterValue: [selectedRhythm.meterValue[i]],
          isPatternNote: true,
          isPatternStart: i === 0,
          isPatternEnd: i === selectedRhythm.abcValue.length - 1,
          patternIndex: i,
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

    usedRhythms.add(selectedRhythm.name);
    rhythmCounts.set(
      selectedRhythm.name,
      (rhythmCounts.get(selectedRhythm.name) || 0) + 1
    );
  }

  console.log(
    `generateRandomRhythm finished. Total beats generated: ${currentBeat} / ${totalBeats}. Number of steps: ${result.length}`
  );
  return result;
}
