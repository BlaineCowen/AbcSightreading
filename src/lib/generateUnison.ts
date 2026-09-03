import { chords } from "../resources/chords";
import type { Chord } from "../types/ChordSet";
import { type Rhythm } from "../resources/rhythms";
import { noteArray } from "../resources/noteArray";
import { generateRandomRhythm } from "./rhythm-generation";
import {
  defaultSyllableSystem,
  type SyllableSystem,
} from "../resources/rhythm-syllables";
import type { Cadence, RhythmWithPattern } from "./types";

// interface AbcObject {
//   key: string;
//   timeSig: string;
//   parts: string;
//   form: string;
//   bpm: number;
//   measures: number;
// }

let baseNoteArray = [
  "C,,",
  "D,,",
  "E,,",
  "F,,",
  "G,,",
  "A,,",
  "B,,",
  "C,",
  "D,",
  "E,",
  "F,",
  "G,",
  "A,",
  "B,",
  "C",
  "D",
  "E",
  "F",
  "G",
  "A",
  "B",
  "c",
  "d",
  "e",
  "f",
  "g",
  "a",
  "b",
  "c'",
  "d'",
  "e'",
  "f'",
  "g'",
  "a'",
  "b'",
  "c''",
];

interface ChordSet {
  [key: string]: {
    name: string;
    triadNotes: number[];
    root: number;
    chordFamily?: string;
    nextChordPossibilities: { name: string; weight: number }[];
    type: string;
    sharpScaleDegree: number | undefined;
    flatScaleDegree: number | undefined;
    baseMultiplier: number;
  };
}

var keySignatures: {
  [key: string]: {
    flats: number[] | undefined;
    sharps: number[] | undefined;
  };
} = {
  C: {
    flats: [],
    sharps: [],
  },
  G: {
    flats: [],
    sharps: [6],
  },
  D: {
    flats: [],
    sharps: [6, 2],
  },
  A: {
    flats: [],
    sharps: [6, 2, 5],
  },
  E: {
    flats: [],
    sharps: [6, 2, 5, 1],
  },
  B: {
    flats: [],
    sharps: [6, 2, 5, 1, 4],
  },
  F: {
    flats: [3],
    sharps: [],
  },
  Bb: {
    flats: [3, 0],
    sharps: [],
  },
  Eb: {
    flats: [3, 0, 4],
    sharps: [],
  },
  Ab: {
    flats: [3, 0, 4, 1],
    sharps: [],
  },
  Db: {
    flats: [3, 0, 4, 1, 5],
    sharps: [],
  },
};

interface Note {
  name: string;
  degree: number;
  pitchValue: number;
}

interface GenerateChordParams {
  key: string;
  maxSkip: number;
  noteIndex: number;
  partObject: any;
  randPartIndex: number;
  chordTriadCopy: number[];
  baseNoteArray: string[];
  renderedChordProgression: any[];
  bassGenNoteArray: Note[];
  randRhythmObjects: Rhythm[];
  otherPartNotes: any[];
  noteList: Note[];
  chords: Chord[];
  sharpScaleDegrees: Set<number>;
  flatScaleDegrees: Set<number>;
}

interface ChordNoteObject {
  partName: string;
  noteLength: number;
  name: string;
  degree: number;
  pitchValue: number;
  chord: any;
  rhythm: Rhythm | null;
  isPatternStart: boolean;
  isPatternEnd: boolean;
  patternIndex: number | null;
}

function checkForIllegalVoiceLeading(arr: number[]) {
  // if array length is 1, return true
  if (arr.length === 1) {
    return true;
  }
  var sortedArr = [...arr].sort((a, b) => a - b);
  if (sortedArr.join(",") === arr.join(",")) {
    return true;
  } else {
    return false;
  }
}

function getRandomByWeight(
  arr: { name: any; weight: number }[],
  chords: Chord[]
) {
  if (arr.length === 0) {
    return null; // Handle empty array case
  }

  // change weight to weight * chords[arr[i].name].baseMultiplier
  arr = arr.map((element) => {
    const chord = chords.find((c) => c.name === element.name);
    if (!chord) {
      console.warn(`Chord ${element.name} not found`);
      return element;
    }
    return {
      name: element.name,
      weight: element.weight * chord.baseMultiplier * 100,
    };
  });

  // Shuffle the array (Fisher-Yates shuffle)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  var totalWeight = arr.reduce((acc, val) => acc + val.weight, 0);
  var randomNum = Math.floor(Math.random() * totalWeight);
  var weightSum = 0;

  for (var i = 0; i < arr.length; i++) {
    weightSum += arr[i].weight;
    if (randomNum < weightSum) {
      // Use < instead of <=
      return arr[i];
    }
  }

  return arr[arr.length - 1]; // Fallback, though normally shouldn't be reached
}

function getRandomRhythmByWeight(arr: Rhythm[]) {
  if (arr.length === 0) {
    return null; // Handle empty array case
  }

  // Shuffle the array (Fisher-Yates shuffle)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  var totalWeight = arr.reduce((acc, val) => acc + val.weight, 0);
  var randomNum = Math.floor(Math.random() * totalWeight);
  var weightSum = 0;

  for (var i = 0; i < arr.length; i++) {
    weightSum += arr[i].weight;
    if (randomNum < weightSum) {
      // Use < instead of <=
      return arr[i];
    }
  }

  return arr[arr.length - 1]; // Fallback, though normally shouldn't be reached
}

export function generateRandomRhythmCombination(
  rhythmArray: Rhythm[],
  targetSum: number,
  tsPerMeasure: number
): { numbers: number[]; rhythmObjects: Rhythm[] } {
  // console.log("=== RHYTHM COMBINATION GENERATION START ===");
  // console.log("🔍 Rhythm generation params:", {
  //   rhythmArrayLength: rhythmArray?.length || 0,
  //   targetSum,
  //   tsPerMeasure,
  // });

  if (!rhythmArray || rhythmArray.length === 0) {
    console.error("❌ No rhythms provided for generation");
    throw new Error("No rhythms provided for generation");
  }

  // console.log(
  //   "📝 Available rhythms:",
  //   rhythmArray.map((r) => ({
  //     name: r.name,
  //     totalValue: r.totalValue,
  //     pattern: r.pattern,
  //     abcValue: r.abcValue,
  //   }))
  // );

  let numberResult: number[] = [];
  let rhythmResult: Rhythm[] = [];
  let currentSum = 0;
  let currentCombination: number[] = [];
  let totalRuns = 0;

  // Sort array by duration (descending)
  rhythmArray.sort((a, b) => b.totalValue - a.totalValue);

  // Weight rhythms based on their duration and how well they fit in measures
  rhythmArray = rhythmArray.map((r) => ({
    ...r,
    weight: r.totalValue <= tsPerMeasure ? r.totalValue : 1,
  }));

  // console.log(
  //   "📝 Sorted and weighted rhythms:",
  //   rhythmArray.map((r) => ({
  //     name: r.name,
  //     totalValue: r.totalValue,
  //     weight: r.weight,
  //   }))
  // );

  while (currentSum !== targetSum && totalRuns < 1000) {
    // console.log(
    //   `🔄 Rhythm generation attempt ${
    //     totalRuns + 1
    //   }/1000, currentSum: ${currentSum}, targetSum: ${targetSum}`
    // );
    let measureArray: number[] = [];
    let measureRhythmArr: Rhythm[] = [];
    let measureRhythm = 0;
    let measureRuns = 0;
    const maxMeasureRuns = 20; // Increased from 10 to allow more attempts

    // Fill current measure
    while (measureRhythm < tsPerMeasure && measureRuns < maxMeasureRuns) {
      const remainingInMeasure = tsPerMeasure - measureRhythm;
      const remainingTotal = targetSum - currentSum - measureRhythm;

      // console.log(
      //   `📝 Measure fill attempt ${
      //     measureRuns + 1
      //   }, remainingInMeasure: ${remainingInMeasure}, remainingTotal: ${remainingTotal}`
      // );

      // Filter rhythms that can fit in both the measure and total remaining space
      let filteredRhythms = rhythmArray.filter((r) => {
        const rhythmValue = r.totalValue;
        return (
          rhythmValue <= remainingInMeasure &&
          rhythmValue <= remainingTotal &&
          (remainingInMeasure % rhythmValue === 0 ||
            remainingInMeasure - rhythmValue >= 8)
        ); // Ensure we don't leave awkward small gaps
      });

      // console.log(
      //   `📝 Filtered rhythms for this measure:`,
      //   filteredRhythms.map((r) => ({
      //     name: r.name,
      //     totalValue: r.totalValue,
      //   }))
      // );

      // If no rhythms fit, try to find exact matches for remaining space
      if (filteredRhythms.length === 0) {
        // console.log("⚠️ No rhythms fit, trying exact matches");
        filteredRhythms = rhythmArray.filter(
          (r) => r.totalValue === remainingInMeasure
        );
      }

      // If still no matches, try the smallest available rhythm
      if (filteredRhythms.length === 0) {
        // console.log("⚠️ Still no matches, trying smallest rhythm");
        const smallestRhythm = rhythmArray
          .filter((r) => r.totalValue <= remainingInMeasure)
          .sort((a, b) => a.totalValue - b.totalValue)[0];
        if (smallestRhythm) {
          filteredRhythms = [smallestRhythm];
        }
      }

      if (filteredRhythms.length > 0) {
        const selectedRhythm = getRandomRhythmByWeight(filteredRhythms);
        if (selectedRhythm) {
          // console.log(
          //   `✅ Selected rhythm: ${selectedRhythm.name} (value: ${selectedRhythm.totalValue})`
          // );
          if (selectedRhythm.pattern) {
            for (let i = 0; i < selectedRhythm.abcValue.length; i++) {
              const noteAbcValue = selectedRhythm.abcValue[i];
              const isNoteRest = noteAbcValue.startsWith("z");
              const value = parseInt(noteAbcValue.replace(/^[a-z]+/i, ""));
              measureArray.push(value);
              measureRhythmArr.push({
                ...selectedRhythm,
                abcValue: [noteAbcValue],
                totalValue: value,
                singleNoteValue: value,
                isPatternNote: true,
                isPatternStart: i === 0,
                isPatternEnd: i === selectedRhythm.abcValue.length - 1,
                patternIndex: i,
                rest: isNoteRest,
              });
            }
          } else {
            measureArray.push(selectedRhythm.totalValue);
            measureRhythmArr.push({
              ...selectedRhythm,
              singleNoteValue: selectedRhythm.totalValue,
              isPatternNote: false,
              isPatternStart: false,
              isPatternEnd: false,
              patternIndex: null,
            });
          }
          measureRhythm = measureArray.reduce((a, b) => a + b, 0);
        }
      }
      measureRuns++;
    }

    // Only add the measure if it's complete or we're at the end
    const measureSum = measureArray.reduce((a, b) => a + b, 0);
    if (measureSum === tsPerMeasure || currentSum + measureSum === targetSum) {
      currentCombination = currentCombination.concat(measureArray);
      currentSum += measureSum;
      rhythmResult = rhythmResult.concat(measureRhythmArr);
      // console.log(`✅ Added measure, new currentSum: ${currentSum}`);
    }

    totalRuns++;
  }

  if (totalRuns >= 1000 || currentSum !== targetSum) {
    console.error("❌ Could not find valid rhythm combination");
    console.error("🔍 Final state:", {
      currentSum,
      targetSum,
      totalRuns,
      currentCombination,
    });
    return { numbers: [], rhythmObjects: [] };
  }

  // console.log("✅ Rhythm combination generated successfully");
  // console.log("📊 Final result:", {
  //   numbers: currentCombination,
  //   rhythmObjects: rhythmResult.length,
  //   totalValue: currentCombination.reduce((a, b) => a + b, 0),
  // });
  // console.log("=== RHYTHM COMBINATION GENERATION COMPLETE ===");

  return { numbers: currentCombination, rhythmObjects: rhythmResult };
}

/**
 * Determines if two consecutive eighth notes should be tied based on user settings and position in the piece.
 * @param index - The current note index.
 * @param moveOnEighthNotes - The flag from user settings.
 * @param rhythms - The array of rhythm objects, which may have cadence info.
 * @returns True if the notes should be tied.
 */
function shouldTieEighthNotes(
  index: number,
  moveOnEighthNotes: boolean,
  rhythms: RhythmWithPattern[]
): boolean {
  // If user wants notes to move, don't tie.
  if (moveOnEighthNotes) {
    return false;
  }

  // Not applicable for the first note.
  if (index === 0) {
    return false;
  }

  // Cadence Protection: Don't tie if it's a cadence point.
  if (rhythms[index]?.isCadenceEnd) {
    return false;
  }

  const isCurrentEighth = rhythms[index]?.totalValue <= 4;
  const isPreviousEighth = rhythms[index - 1]?.totalValue <= 4;

  return isCurrentEighth && isPreviousEighth;
}

function generateChordProgression(
  timeSig: any,
  numOfMeasures: any,
  bassRangeNoteList: Note[],
  maxSkip: number,
  randNoteLengths: number[],
  chords: Chord[],
  scaleDegrees: number[],
  moveOnEighthNotes: boolean,
  randRhythmObjects: RhythmWithPattern[],
  accidentalsFollowStep: boolean
) {
  // console.log("=== CHORD PROGRESSION GENERATION START ===");
  // console.log("🔍 Initial bassRangeNoteList:", bassRangeNoteList);
  // console.log("🔍 Scale degrees:", scaleDegrees);
  // console.log("🔍 Other params:", {
  //   timeSig,
  //   numOfMeasures,
  //   maxSkip,
  //   randNoteLengthsLength: randNoteLengths.length,
  //   chordsLength: chords.length,
  // });

  let bassNoteArray = [];
  let newMaxSkip = maxSkip;

  console.log("🔍 Chords:", chords);

  // const tonicNotes = bassRangeNoteList.filter((note) => note.degree === 0);
  // bassNoteArray.push(tonicNotes[Math.floor(Math.random() * tonicNotes.length)]);

  // make sure that in chords[objects].nextChordPossibilities, the chord name is in the chords object
  // console.log("🔍 Filtering chord nextChordPossibilities...");
  for (const chord in chords) {
    if (chords[chord].nextChordPossibilities) {
      const originalLength = chords[chord].nextChordPossibilities.length;
      chords[chord].nextChordPossibilities = chords[
        chord
      ].nextChordPossibilities.filter((chord: { name: string }) =>
        chords.find((c) => c.name === chord.name)
      );
      const filteredLength = chords[chord].nextChordPossibilities.length;
      if (originalLength !== filteredLength) {
        // console.log(
        //   `📝 Filtered chord ${chords[chord].name}: ${originalLength} -> ${filteredLength} possibilities`
        // );
      }
    }
  }

  var chordGenFails = 0;

  var numOfChords = randNoteLengths.length;
  // console.log("📊 Number of chords to generate:", numOfChords);

  // console.log(
  //   "🔍 Before filtering bassRangeNoteList:",
  //   bassRangeNoteList.map((n) => ({ degree: n.degree, name: n.name }))
  // );
  // console.log("🔍 Filtering for scale degrees:", scaleDegrees);

  const originalBassRangeLength = bassRangeNoteList.length;
  bassRangeNoteList = bassRangeNoteList.filter((note) => {
    const included = scaleDegrees.includes(note.degree);
    // if (!included) {
    //   console.log(
    //     `❌ Note ${note.name} (degree ${note.degree}) excluded - not in scale degrees`
    //   );
    // }
    return included;
  });

  // console.log(
  //   "🔍 After filtering bassRangeNoteList:",
  //   bassRangeNoteList.map((n) => ({ degree: n.degree, name: n.name }))
  // );
  // console.log(
  //   `📊 Filtered ${originalBassRangeLength} -> ${bassRangeNoteList.length} notes`
  // );

  if (bassRangeNoteList.length === 0) {
    console.error(
      "❌ CRITICAL ERROR: No valid notes found in range for the selected scale degrees"
    );
    console.error("🔍 Debug info:", {
      originalBassRangeLength,
      scaleDegrees: Array.from(scaleDegrees),
      originalNotes: bassRangeNoteList.map((n) => ({
        name: n.name,
        degree: n.degree,
      })),
    });
    throw new Error(
      "No valid notes found in range for the selected scale degrees"
    );
  }

  // pick a random note from bassRangeNoteList degree 0,2,4
  let tonicNotes = bassRangeNoteList.filter((note) =>
    [0, 2, 4].includes(note.degree)
  );

  // console.log(
  //   "🔍 Tonic notes found:",
  //   tonicNotes.map((n) => ({ degree: n.degree, name: n.name }))
  // );

  if (tonicNotes.length === 0) {
    console.error(
      "❌ CRITICAL ERROR: No tonic notes found in the selected range and scale degrees"
    );
    console.error("🔍 Debug info:", {
      bassRangeNoteList: bassRangeNoteList.map((n) => ({
        name: n.name,
        degree: n.degree,
      })),
      scaleDegrees: Array.from(scaleDegrees),
      tonicDegrees: [0, 2, 4],
    });
    throw new Error(
      "No tonic notes found in the selected range and scale degrees. Please adjust the settings."
    );
  }

  bassNoteArray.push(tonicNotes[Math.floor(Math.random() * tonicNotes.length)]);

  let prevBassNote = bassNoteArray[0];
  let prevChord = {
    chord: chords[0],
    length: 8,
    triadDegrees: chords[0].triadNotes,
  };

  let bassDegrees = bassRangeNoteList.filter(
    (note) =>
      Math.abs(note.pitchValue - prevBassNote.pitchValue) <= maxSkip &&
      scaleDegrees.includes(note.degree)
  );

  var chordProgression: any[] = [];

  let validProgression = false;

  while (!validProgression && chordGenFails < 100) {
    // console.log(`🔄 Chord progression attempt ${chordGenFails + 1}/100`);
    chordProgression = [];
    bassNoteArray = [tonicNotes[Math.floor(Math.random() * tonicNotes.length)]];

    for (let i = 0; i < numOfChords; i++) {
      // console.log(`📝 Generating chord ${i + 1}/${numOfChords}`);
      newMaxSkip = maxSkip;

      if (
        shouldTieEighthNotes(
          i,
          moveOnEighthNotes,
          randRhythmObjects as RhythmWithPattern[]
        )
      ) {
        const prevChord = chordProgression[i - 1];
        chordProgression.push(prevChord);
        bassNoteArray.push(bassNoteArray[i - 1]);
        continue;
      }

      if (i !== 0) {
        // todo add eighth note check
        if (randNoteLengths[i] <= 4) {
          // newMaxSkip = 1;
        } else {
          newMaxSkip = maxSkip;
        }
        prevBassNote = bassNoteArray[i - 1];

        prevChord = chordProgression[i - 1];

        // check if prev note was an accidental note
        if (accidentalsFollowStep) {
          if (
            (prevChord.chord.sharpScaleDegree !== undefined &&
              prevChord.chord.sharpScaleDegree === prevBassNote.degree) ||
            (prevChord.chord.flatScaleDegree !== undefined &&
              prevChord.chord.flatScaleDegree === prevBassNote.degree)
          ) {
            newMaxSkip = 1;
          } else {
            newMaxSkip = maxSkip;
          }
        }

        // todo add eighth note check
        bassDegrees = bassRangeNoteList.filter(
          (note) =>
            Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip
        );
        if (bassDegrees.length === 0) {
          // console.log(`❌ No valid bass degrees found for chord ${i}`);
          chordGenFails++;
          bassNoteArray.pop();
          // console.log("chordGenFails ", chordGenFails);
          break;
        }
      }
      if (i === 0) {
        const firstChord = {
          chord: chords[0],
          length: randNoteLengths[i],
          triadDegrees: chords[0].triadNotes,
        };

        chordProgression.push(firstChord);
      } else if (i === numOfChords - 3) {
        // The third-to-last chord must lead to 5
        prevChord = chordProgression[chordProgression.length - 1];
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter((possibleNext) => {
            const nextChordInfo = chords.find(
              (c) => c.name === possibleNext.name
            );
            if (!nextChordInfo) return false;

            // Is it reachable with the general maxSkip?
            const isGenerallyReachable = bassDegrees.some((bassNote) =>
              nextChordInfo.triadNotes.includes(bassNote.degree)
            );
            if (!isGenerallyReachable) return false;

            // If accidentals must be approached by step...
            if (accidentalsFollowStep) {
              const isAltered =
                nextChordInfo.sharpScaleDegree !== undefined ||
                nextChordInfo.flatScaleDegree !== undefined;

              if (isAltered) {
                // ...check if it can be reached by a step (interval <= 2)
                const isStepwiseReachable = bassRangeNoteList.some(
                  (bassNote) =>
                    nextChordInfo.triadNotes.includes(bassNote.degree) &&
                    Math.abs(bassNote.pitchValue - prevBassNote.pitchValue) <= 2
                );
                return isStepwiseReachable;
              }
            }
            return true;
          });

        if (nextChordPossibilities.length === 0) {
          // console.log(
          //   `❌ No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          // );

          // Restart the loop if no valid progression is found
          chordGenFails++;
          // erase last bass note
          bassNoteArray.pop();

          // console.log("chordGenFails ", chordGenFails);

          break;
        }

        let nextChordInner = getRandomByWeight(nextChordPossibilities, chords);
        if (nextChordInner !== null) {
          let nextChordName = nextChordInner.name;
          let nextChord = {
            chord: chords.find((c) => c.name === nextChordName),
            length: randNoteLengths[i],
            triadDegrees: chords.find((c) => c.name === nextChordName)
              ?.triadNotes,
          };
          let bassNoteToAdd = bassDegrees
            .filter((note) =>
              chords
                .find((c) => c.name === nextChordName)
                ?.triadNotes.includes(note.degree)
            )
            .filter(
              (note) =>
                Math.abs(note.pitchValue - prevBassNote.pitchValue) <=
                newMaxSkip
            );
          if (bassNoteToAdd.length > 0) {
            bassNoteArray.push(
              bassNoteToAdd[Math.floor(Math.random() * bassNoteToAdd.length)]
            );
            chordProgression.push(nextChord);
          }
        } else {
          // console.log(
          //   `❌ No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          // );

          chordGenFails++;
          bassNoteArray.pop();
          // console.log("chordGenFails ", chordGenFails);

          break;
        }
      } else if (i === numOfChords - 2) {
        // The second-to-last chord must be dominant
        prevChord = chordProgression[chordProgression.length - 1];

        // prefer dominant
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter((possibleNext) => {
            const nextChordInfo = chords.find(
              (c) => c.name === possibleNext.name
            );
            if (!nextChordInfo) return false;

            // Pre-filter for cadence
            const isCadentialChord =
              nextChordInfo.type === "dominant" ||
              nextChordInfo.type === "predominant";
            if (!isCadentialChord) return false;

            // Is it reachable with the general maxSkip?
            const isGenerallyReachable = bassDegrees.some((bassNote) =>
              nextChordInfo.triadNotes.includes(bassNote.degree)
            );
            if (!isGenerallyReachable) return false;

            // If accidentals must be approached by step...
            if (accidentalsFollowStep) {
              const isAltered =
                nextChordInfo.sharpScaleDegree !== undefined ||
                nextChordInfo.flatScaleDegree !== undefined;

              if (isAltered) {
                // ...check if it can be reached by a step (interval <= 2)
                const isStepwiseReachable = bassRangeNoteList.some(
                  (bassNote) =>
                    nextChordInfo.triadNotes.includes(bassNote.degree) &&
                    Math.abs(bassNote.pitchValue - prevBassNote.pitchValue) <= 2
                );
                return isStepwiseReachable;
              }
            }
            return true;
          });
        if (nextChordPossibilities.length === 0) {
          // if no dominant chords are found, try tonic chords
          nextChordPossibilities =
            prevChord.chord.nextChordPossibilities.filter((possibleNext) => {
              const nextChordInfo = chords.find(
                (c) => c.name === possibleNext.name
              );
              if (!nextChordInfo) return false;

              // Pre-filter for cadence
              const isCadentialChord =
                nextChordInfo.type === "dominant-inversion" ||
                nextChordInfo.type === "tonic";
              if (!isCadentialChord) return false;

              // Is it reachable with the general maxSkip?
              const isGenerallyReachable = bassDegrees.some((bassNote) =>
                nextChordInfo.triadNotes.includes(bassNote.degree)
              );
              if (!isGenerallyReachable) return false;

              // If accidentals must be approached by step...
              if (accidentalsFollowStep) {
                const isAltered =
                  nextChordInfo.sharpScaleDegree !== undefined ||
                  nextChordInfo.flatScaleDegree !== undefined;

                if (isAltered) {
                  // ...check if it can be reached by a step (interval <= 2)
                  const isStepwiseReachable = bassRangeNoteList.some(
                    (bassNote) =>
                      nextChordInfo.triadNotes.includes(bassNote.degree) &&
                      Math.abs(bassNote.pitchValue - prevBassNote.pitchValue) <=
                        2
                  );
                  return isStepwiseReachable;
                }
              }
              return true;
            });
        }

        // if still no valid progression is found restart the loop
        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          // console.log(
          //   `❌ No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          // );

          chordGenFails++;
          bassNoteArray.pop();
          // console.log("chordGenFails ", chordGenFails);
          break;
        }

        let nextChordInner = getRandomByWeight(nextChordPossibilities, chords);
        if (nextChordInner !== null) {
          let nextChordName = nextChordInner.name;
          let nextChord = {
            chord: chords.find((c) => c.name === nextChordName),
            length: randNoteLengths[i],
            triadDegrees: chords.find((c) => c.name === nextChordName)
              ?.triadNotes,
          };
          let bassNoteToAdd = bassDegrees
            .filter((note) =>
              chords
                .find((c) => c.name === nextChordName)
                ?.triadNotes.includes(note.degree)
            )
            .filter(
              (note) =>
                Math.abs(note.pitchValue - prevBassNote.pitchValue) <=
                newMaxSkip
            )
            .slice(0, 1); // Take only the first note
          if (bassNoteToAdd.length > 0) {
            bassNoteArray.push(
              bassNoteToAdd[Math.floor(Math.random() * bassNoteToAdd.length)]
            );
            chordProgression.push(nextChord);
          } else {
            // console.log(
            //   `❌ No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
            // );

            chordGenFails++;
            bassNoteArray.pop();
            // console.log("chordGenFails ", chordGenFails);

            break;
          }
        }
      } else if (i === numOfChords - 1) {
        prevChord = chordProgression[chordProgression.length - 1];

        // The last chord must be "1"
        const nextChord = {
          chord: chords[0],
          length: randNoteLengths[i],
          triadDegrees: chords[0].triadNotes,
        };
        let bassNoteToAdd = bassDegrees
          .filter((note) => chords[0].triadNotes.includes(note.degree))
          .filter(
            (note) =>
              Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip
          );
        if (bassNoteToAdd.length > 0) {
          bassNoteArray.push(
            bassNoteToAdd[Math.floor(Math.random() * bassNoteToAdd.length)]
          );
          chordProgression.push(nextChord);
        } else {
          // console.log(
          //   `❌ No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          // );

          chordGenFails++;
          bassNoteArray.pop();
          // console.log("chordGenFails ", chordGenFails);
          break;
        }
      } else {
        prevChord = chordProgression[chordProgression.length - 1];
        prevBassNote = bassNoteArray[i - 1];
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter((possibleNext) => {
            const nextChordInfo = chords.find(
              (c) => c.name === possibleNext.name
            );
            if (!nextChordInfo) return false;

            // Is it reachable with the general maxSkip?
            const isGenerallyReachable = bassDegrees.some((bassNote) =>
              nextChordInfo.triadNotes.includes(bassNote.degree)
            );
            if (!isGenerallyReachable) return false;

            // If accidentals must be approached by step...
            if (accidentalsFollowStep) {
              const isAltered =
                nextChordInfo.sharpScaleDegree !== undefined ||
                nextChordInfo.flatScaleDegree !== undefined;

              if (isAltered) {
                // ...check if it can be reached by a step (interval <= 2)
                const isStepwiseReachable = bassRangeNoteList.some(
                  (bassNote) =>
                    nextChordInfo.triadNotes.includes(bassNote.degree) &&
                    Math.abs(bassNote.pitchValue - prevBassNote.pitchValue) <= 2
                );
                return isStepwiseReachable;
              }
            }

            // If not altered (or rule is off), and generally reachable, it's valid.
            return true;
          });

        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          // console.log(
          //   `❌ No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          // );

          chordGenFails++;
          // erase last bass note
          bassNoteArray.pop();

          // console.log("chordGenFails ", chordGenFails);
          break;
        } else {
          let nextChordInner = getRandomByWeight(
            nextChordPossibilities,
            chords
          );
          if (nextChordInner === null) {
            chordGenFails++;
            bassNoteArray.pop();
            // console.log("chordGenFails ", chordGenFails);
            break;
          } else {
            let nextChordName = nextChordInner.name;
            let nextChord = {
              chord: chords.find((c) => c.name === nextChordName),
              length: randNoteLengths[i],
              triadDegrees: chords.find((c) => c.name === nextChordName)
                ?.triadNotes,
            };
            let bassNoteToAdd = bassDegrees
              .filter((note) =>
                chords
                  .find((c) => c.name === nextChordName)
                  ?.triadNotes.includes(note.degree)
              )
              .filter(
                (note) =>
                  Math.abs(note.pitchValue - prevBassNote.pitchValue) <=
                  newMaxSkip
              );
            if (bassNoteToAdd.length > 0) {
              bassNoteArray.push(
                bassNoteToAdd[Math.floor(Math.random() * bassNoteToAdd.length)]
              );
              chordProgression.push(nextChord);
            } else {
              // console.log(
              //   `❌ No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
              // );
              chordGenFails++;
              bassNoteArray.pop();
              // console.log("chordGenFails ", chordGenFails);

              break;
            }
          }
        }
      }
    }

    if (chordProgression.length === numOfChords) {
      validProgression = true;
      // console.log("✅ Valid chord progression found!");
    }
  }

  if (chordGenFails >= 100) {
    console.error(
      "❌ Could not find a valid chord progression after 100 attempts"
    );
    throw new Error(
      "Could not generate a melody with the selected options. Please adjust the settings, such as increasing the Max Skip or adding more scale degrees."
    );
  }
  // console.log(
  //   "✅ Chord progression generated:",
  //   chordProgression.map((chord) => chord.chord.name)
  // );
  // console.log("=== CHORD PROGRESSION GENERATION COMPLETE ===");
  return [chordProgression, bassNoteArray];
}

function createNoteList(tonic: string, numOfNotes: number) {
  const keyLetter = tonic[0].toUpperCase();
  const notes = ["C", "D", "E", "F", "G", "A", "B"];
  const tonicIndex = notes.indexOf(keyLetter);

  if (tonicIndex === -1) {
    console.error(`Invalid tonic: ${tonic}`);
    return [];
  }

  // Create a mapping from note letter to scale degree based on the tonic
  const degreeMap = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const noteName = notes[(tonicIndex + i) % 7];
    degreeMap.set(noteName, i);
  }

  const noteList = [];
  // Use the full noteArray to ensure all possible notes are mapped
  for (
    let currentNoteIndex = 0;
    currentNoteIndex < noteArray.length;
    currentNoteIndex++
  ) {
    const abcNote = noteArray[currentNoteIndex];
    if (!abcNote) continue;

    // Extract the base note letter (e.g., from "C,," or "^F'")
    const noteLetter = abcNote.replace(/[^A-Ga-g]/g, "").toUpperCase();
    const degree = degreeMap.get(noteLetter);

    if (degree !== undefined) {
      noteList.push({
        name: abcNote,
        degree: degree,
        pitchValue: currentNoteIndex,
      });
    }
  }

  console.log("✅ Note list created with correct degrees for key:", tonic);
  return noteList;
}

function findClosestDegrees(
  prevNoteDegree: number,
  otherDegreesInChord: number[]
) {
  const modulo = 8; // Assuming degrees are from 0 to 11 for a chromatic scale. Adjust if needed.

  // Function to calculate modular distance
  const modDist = (a: number, b: number, mod: number) =>
    (((a - b + mod) % mod) + mod) % mod;

  // Find the closest degree above
  let closestDegreeAbove = otherDegreesInChord.reduce((prev, curr) => {
    const prevDist = modDist(prev, prevNoteDegree, modulo);
    const currDist = modDist(curr, prevNoteDegree, modulo);
    return currDist > 0 && currDist < prevDist ? curr : prev;
  });

  // Find the closest degree below
  let closestDegreeBelow = otherDegreesInChord.reduce((prev, curr) => {
    const prevDist = modDist(prevNoteDegree, prev, modulo);
    const currDist = modDist(prevNoteDegree, curr, modulo);
    return currDist > 0 && currDist < prevDist ? curr : prev;
  });

  return { closestDegreeAbove, closestDegreeBelow };
}

// Function to check if a degree is within the cyclical range
function isDegreeWithinRange(
  degree: number,
  closestDegreeBelow: number,
  closestDegreeAbove: number
): boolean {
  if (closestDegreeBelow <= closestDegreeAbove) {
    return degree >= closestDegreeBelow && degree <= closestDegreeAbove;
  } else {
    return degree >= closestDegreeBelow || degree <= closestDegreeAbove;
  }
}

function generateChord(params: GenerateChordParams) {
  // get key
  var key = params.key;
  var maxSkip = params.maxSkip;
  var noteIndex = params.noteIndex;
  var keyObject = keySignatures[key];
  var partObject = params.partObject;
  var randPartIndex = params.randPartIndex;
  var chordTriadCopy = params.chordTriadCopy;
  var baseNoteArray = params.baseNoteArray;
  var currentChord = params.renderedChordProgression[params.noteIndex];
  var bassGenNoteArray = params.bassGenNoteArray;
  var noteList = params.noteList;

  var partName = Object.keys(partObject.parts)[randPartIndex];
  var partOrder = partObject.parts[partName].order;

  var scaleType = "Major";
  var generatedNote = "";

  var chordNoteObject: ChordNoteObject = {
    partName: "",
    noteLength: 0,
    name: "",
    degree: 0,
    pitchValue: 0,
    chord: null,
    rhythm: null,
    isPatternStart: false,
    isPatternEnd: false,
    patternIndex: null,
  };

  var noteLength = currentChord.length;
  var scaleDegreeToAdd: number = 0;
  var singlePartObject =
    partObject.parts[Object.keys(partObject.parts)[randPartIndex]];

  var prevNote: Note = {
    pitchValue: 0,
    name: "",
    degree: 0,
  };

  if (singlePartObject.chordNoteObject.length > 0) {
    prevNote =
      singlePartObject.chordNoteObject[
        singlePartObject.chordNoteObject.length - 1
      ];
  }

  var minRange = noteList.findIndex(
    (note: Note) =>
      note.name === baseNoteArray[singlePartObject.selectedRange[0]]
  );
  if (minRange === -1) {
    minRange = 0;
  }

  var maxRange = noteList.findIndex(
    (note: Note) =>
      note.name === baseNoteArray[singlePartObject.selectedRange[1]]
  );

  var rangeNoteList = noteList.slice(minRange, maxRange);

  if (key.includes("m")) {
    scaleType = "Minor";
  }

  var randomCloseNote: Note = { name: "", degree: 0, pitchValue: 0 };

  if (singlePartObject.order === 0) {
    scaleDegreeToAdd = bassGenNoteArray[noteIndex].degree;
    var rangeNoteListFilter = rangeNoteList.filter(
      (note: Note) => note.degree === scaleDegreeToAdd
    );
    if (prevNote.pitchValue === 0) {
      randomCloseNote =
        rangeNoteListFilter[
          Math.floor(Math.random() * rangeNoteListFilter.length)
        ];
    } else {
      // pick the closest note to the previous note
      randomCloseNote = rangeNoteListFilter.reduce((prev: Note, curr: Note) =>
        Math.abs(curr.pitchValue - prevNote.pitchValue) <
        Math.abs(prev.pitchValue - prevNote.pitchValue)
          ? curr
          : prev
      );
    }
  } else if (singlePartObject.order !== 0) {
    // check if prev note is undefined
    if (!prevNote) {
      console.log("Error: Previous note is undefined");
      return false;
    }

    if (prevNote.pitchValue === 0) {
      // pitch a random scale degree in chordtriad copy
      var scaleDegreeToAdd: number =
        chordTriadCopy[Math.floor(Math.random() * chordTriadCopy.length)];

      var rangeNoteListFilter = rangeNoteList.filter(
        (note: Note) => note.degree === scaleDegreeToAdd
      );

      randomCloseNote =
        rangeNoteListFilter[
          Math.floor(Math.random() * rangeNoteListFilter.length)
        ];
    }
    if (prevNote.pitchValue !== 0) {
      let otherDegreesInChord: number[] = [];
      let bannedParFifthDegree: number | null = null;

      try {
        Object.keys(partObject.parts).forEach((part: string) => {
          let degreeToCheck =
            partObject.parts[part].chordNoteObject[noteIndex - 1]?.degree;
          if (
            degreeToCheck !== undefined &&
            degreeToCheck !== prevNote.degree
          ) {
            otherDegreesInChord.push(degreeToCheck);
          }
          if (Math.abs(degreeToCheck - prevNote.degree) % 8 === 4) {
            params.otherPartNotes.forEach((note: any) => {
              if (note.partName === part) {
                if (note.degree !== degreeToCheck) {
                  bannedParFifthDegree = (note.degree + 1) % 8;
                }
              }
            });
          }
        });
      } catch (error) {
        console.error("An error occurred:", error);
      }

      let closestDegreeAbove = 0;
      let closestDegreeBelow = 0;

      if (otherDegreesInChord.length !== 0) {
        // let { closestDegreeAbove, closestDegreeBelow } = findClosestDegrees(
        //   prevNoteDegree,
        //   otherDegreesInChord
        // );
      }

      // check if last note is an accidental
      // see if .name includes [^, ^^, =, _, __ ]
      console.log("prevNote.name:", prevNote.name);
      var prevNoteAccidental = prevNote.name.match(/[_^=]/g);

      if (prevNoteAccidental) {
        // maxSkip = 1;
      }

      var rangeNoteListFilter = rangeNoteList.filter((note: Note) => {
        const currentChordObj = params.chords.find(
          (c) => c.name === currentChord.chord.name
        );
        return (
          currentChordObj?.triadNotes.includes(note.degree) &&
          (bannedParFifthDegree === null ||
            note.degree !== bannedParFifthDegree) &&
          Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip
        );
      });
      if (rangeNoteListFilter.length === 0) {
        // you can repeat degrees
        rangeNoteListFilter = rangeNoteList.filter(
          (note: Note) =>
            params.chords
              .find((c) => c.name === currentChord.chord.name)
              ?.triadNotes.includes(note.degree) &&
            (bannedParFifthDegree === null ||
              note.degree !== bannedParFifthDegree) &&
            Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip
        );
      }
      // if still 0 return
      if (rangeNoteListFilter.length === 0) {
        return false;
      }
      if (closestDegreeAbove === closestDegreeAbove) {
        var notesWithinRange = rangeNoteListFilter;
      } else {
        var notesWithinRange = rangeNoteListFilter.filter(
          (note: Note) =>
            Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip &&
            isDegreeWithinRange(
              prevNote.degree,
              closestDegreeBelow,
              closestDegreeAbove
            )
        );
      }

      if (notesWithinRange.length === 0) {
        return false;
      }

      randomCloseNote =
        notesWithinRange[Math.floor(Math.random() * notesWithinRange.length)];

      scaleDegreeToAdd = randomCloseNote.degree;
    }
    chordTriadCopy.splice(chordTriadCopy.indexOf(scaleDegreeToAdd), 1);
  }
  if (randomCloseNote === undefined) {
    return false;
  }

  generatedNote = randomCloseNote.name;

  // find the index of the note in the original notesList
  var pitchValue = randomCloseNote.pitchValue;

  var distance = Math.abs(pitchValue - prevNote.pitchValue);

  // see if it is a sharp or flat scale degree in hte chord
  var accidental = null;
  if (
    currentChord.chord.sharpScaleDegree === scaleDegreeToAdd &&
    params.sharpScaleDegrees.has(scaleDegreeToAdd)
  ) {
    accidental = "^";
    if (keyObject.sharps?.indexOf(scaleDegreeToAdd) !== -1) {
      accidental = "^^";
    } else if (keyObject.flats?.indexOf(scaleDegreeToAdd) !== -1) {
      accidental = "=";
    }
  }

  if (
    currentChord.chord.flatScaleDegree === scaleDegreeToAdd &&
    params.flatScaleDegrees.has(scaleDegreeToAdd)
  ) {
    accidental = "_";
    if (keyObject.sharps?.indexOf(scaleDegreeToAdd) !== -1) {
      accidental = "=";
    } else if (keyObject.flats?.indexOf(scaleDegreeToAdd) !== -1) {
      accidental = "__";
    }
  }
  if (accidental) {
    if (
      distance > 1 ||
      pitchValue >= maxRange - 1 ||
      pitchValue <= minRange + 1
    ) {
      // try again
      // return false;
      generatedNote = accidental + generatedNote;
    } else {
      generatedNote = accidental + generatedNote;
    }
  }

  chordNoteObject = {
    partName: partName,
    noteLength: noteLength,
    name: generatedNote,
    degree: scaleDegreeToAdd,
    pitchValue: pitchValue,
    chord: currentChord.chord,
    rhythm: params.randRhythmObjects[params.noteIndex],
    isPatternStart: Boolean(
      params.randRhythmObjects[params.noteIndex]?.pattern &&
        params.randRhythmObjects[params.noteIndex]?.isPatternStart
    ),
    isPatternEnd: Boolean(
      params.randRhythmObjects[params.noteIndex]?.pattern &&
        params.randRhythmObjects[params.noteIndex]?.isPatternEnd
    ),
    patternIndex:
      params.randRhythmObjects[params.noteIndex]?.patternIndex ?? null,
  };

  // Debug log for pattern properties
  // console.log(`Note ${params.noteIndex}:`, {
  //   noteLength,
  //   pattern: params.randRhythmObjects[params.noteIndex]?.pattern,
  //   abcValue: params.randRhythmObjects[params.noteIndex]?.abcValue,
  //   patternIndex: params.randRhythmObjects[params.noteIndex]?.patternIndex,
  //   isPatternStart: params.randRhythmObjects[params.noteIndex]?.isPatternStart,
  //   isPatternEnd: params.randRhythmObjects[params.noteIndex]?.isPatternEnd,
  //   name: params.randRhythmObjects[params.noteIndex]?.name,
  // });

  return chordNoteObject;
}

interface PartsObject {
  parts: {
    [key: string]: {
      chordNoteObject: ChordNoteObject[];
      order: number;
      smallName: string;
      selectedRange: number[];
    };
  };
  numofParts?: number;
}

const solfege = ["do", "re", "mi", "fa", "so", "la", "ti"];
const sharpSolfege = ["di", "ri", "fi", "si", "li"];
const flatSolfege = ["re", "me", "se", "le", "te"];
const sharpSolfegeMap = { 0: "di", 1: "ri", 3: "fi", 4: "si", 5: "li" };
const flatSolfegeMap = { 1: "ra", 2: "me", 4: "se", 5: "le", 6: "te" };

/**
 * The rhythm syllable for one note.
 *
 * @param offsetInMeasure - where the note starts, in 32nd-note units from the
 *   barline. createConcatString's `tsCount` is exactly this.
 * @param beatUnits - length of one beat in 32nd-note units (8 for a quarter).
 *
 * Resolution order: a named figure wins outright (so a system can spell out
 * anything, rests included), then rests, then notes of a beat or longer, and
 * finally the note's position on the sixteenth grid within its beat. That last
 * rule is what makes an eighth read "ti" on the beat and "ki" off it, and it
 * generalises to figures nobody has enumerated.
 */
function rhythmSyllableFor(
  note: ChordNoteObject,
  offsetInMeasure: number,
  beatUnits: number,
  system: SyllableSystem
): string {
  const named = note.rhythm?.name ? system.byName[note.rhythm.name] : undefined;
  const fromName = named?.[note.patternIndex ?? 0];
  if (fromName !== undefined) return fromName;

  if (note.rhythm?.rest) return system.rest;

  if (note.noteLength >= beatUnits) {
    const beats = Math.round(note.noteLength / beatUnits);
    return beats <= 1 ? system.beat : system.sustain(beats);
  }

  const slotWidth = beatUnits / system.slots.length;
  const slot = Math.floor((offsetInMeasure % beatUnits) / slotWidth);
  return system.slots[slot % system.slots.length];
}

function createConcatString(
  partsObject: PartsObject,
  params: {
    timeSig: { tsPerMeasure: number; beamGroupSize?: number };
    showSolfege: boolean;
    showRhythmSyllables?: boolean;
    syllableSystem?: SyllableSystem;
  }
) {
  var concatString = "";

  Object.keys(partsObject.parts).forEach((part: string) => {
    console.log("part:", part);
    var singlePartObject = partsObject.parts[part];
    var measureString = "";
    var tsCount = 0;
    let activeAccidentals = new Map<string, string>();

    if (partsObject.numofParts && partsObject.numofParts > 1) {
      concatString += `[V:${part}] `;
    }

    singlePartObject.chordNoteObject.forEach(
      (note: ChordNoteObject, index: number) => {
        if (tsCount === 0) {
          measureString = "";
          activeAccidentals.clear();
        }

        let processedNoteName = note.name;
        console.log("note.name:", note.name);
        const accidentalMatch = note.name.match(/[_^=]+/);
        const currentAccidental = accidentalMatch ? accidentalMatch[0] : null;
        const noteKey = currentAccidental
          ? note.name.replace(currentAccidental, "")
          : note.name;

        const lastAppliedAccidental = activeAccidentals.get(noteKey);

        if (currentAccidental) {
          if (lastAppliedAccidental !== currentAccidental) {
            activeAccidentals.set(noteKey, currentAccidental);
            processedNoteName = note.name;
          } else {
            processedNoteName = noteKey;
          }
        } else {
          if (lastAppliedAccidental && lastAppliedAccidental !== "=") {
            processedNoteName = "=" + noteKey;
            activeAccidentals.set(noteKey, "=");
          }
        }

        // Rhythm syllables ride as ABC annotations rather than a w: lyric
        // line, because lyrics skip rests entirely (abc_parse.js) and the rest
        // needs to carry a syllable too.
        if (params.showRhythmSyllables) {
          const syllable = rhythmSyllableFor(
            note,
            tsCount,
            params.timeSig.beamGroupSize ?? 8,
            params.syllableSystem ?? defaultSyllableSystem
          );
          if (syllable) measureString += `"_${syllable}"`;
        }

        if (note.rhythm?.rest) {
          measureString += `z${note.noteLength} `;
        } else {
          measureString += `${processedNoteName}${note.noteLength}`;
        }

        const isEndOfMeasure =
          tsCount + note.noteLength >= params.timeSig.tsPerMeasure;
        const isLastNote =
          index === singlePartObject.chordNoteObject.length - 1;
        const nextNote = singlePartObject.chordNoteObject[index + 1];

        // Debug log for pattern checking
        // console.log(`Concat Note ${index}:`, {
        //   name: note.name,
        //   length: note.noteLength,
        //   rhythm: note.rhythm?.name,
        //   pattern: note.rhythm?.pattern,
        //   isPatternStart: note.isPatternStart,
        //   isPatternEnd: note.isPatternEnd,
        //   nextIsPattern: nextNote?.rhythm?.pattern,
        //   nextIsStart: nextNote?.isPatternStart,
        // });

        // Insert a space at every beam-group boundary so abcjs beams notes
        // correctly within each beat. beamGroupSize drives this: 8 for simple
        // time (quarter-note beat), 12 for compound time (dotted-quarter beat).
        // Non-pattern notes (quarter, half, whole) always get a space.
        // The barline "|" already breaks beams at measure boundaries.
        const afterNote = tsCount + note.noteLength;
        const beamGroupSize = params.timeSig.beamGroupSize ?? 8;
        if (afterNote % beamGroupSize === 0 || !note.rhythm?.pattern) {
          measureString += " ";
        }

        tsCount += note.noteLength;

        if (tsCount >= params.timeSig.tsPerMeasure) {
          concatString += measureString + "|";
          tsCount = 0;
        }
      }
    );

    concatString += "\n";

    if (params.showSolfege) {
      let solfegeString = "w: ";
      singlePartObject.chordNoteObject.forEach((note: ChordNoteObject) => {
        // ABC aligns lyrics to notes only - a rest consumes no slot - so
        // emitting a token here would shift every later syllable one note left.
        if (note.rhythm?.rest) return;

        let syllable = "";
        const accidentalMatch = note.name.match(/[_^=]+/);
        const accidental = accidentalMatch ? accidentalMatch[0] : null;

        if (accidental === "^" || accidental === "^^") {
          syllable =
            sharpSolfegeMap[note.degree as keyof typeof sharpSolfegeMap] ||
            solfege[note.degree];
        } else if (accidental === "_" || accidental === "__") {
          syllable =
            flatSolfegeMap[note.degree as keyof typeof flatSolfegeMap] ||
            solfege[note.degree];
        } else {
          syllable = solfege[note.degree];
        }
        solfegeString += syllable + " ";
      });
      concatString += solfegeString + "\n";
    }
  });

  return concatString;
}

/** The single line of a 1-line staff sits at pitch 6, which abcjs writes as `B`.
 *  Every rhythm-only note uses it, and %%percmap turns it into a snare hit. */
const RHYTHM_STAFF_NOTE = "B";

/** GM percussion voice for the rhythm staff. Claves has the sharpest onset of
 *  the usable drums in FluidR3_GM - 4.6ms to peak against acoustic-snare's
 *  12.4ms - and decays in 358ms, so consecutive eighth notes stay distinct
 *  instead of smearing. */
const RHYTHM_STAFF_DRUM = "claves";

/**
 * Builds a rhythm-only exercise: a one-line percussion staff with no pitches,
 * every note sounding as an identical acoustic snare stroke.
 *
 * Rhythm durations are already chosen independently of pitch, so this skips the
 * whole chord/voice-leading engine and only runs the rhythm generator. It reuses
 * createConcatString unchanged -- that function reads only name, noteLength and
 * rhythm off each note, so a fixed pitch is all it needs.
 */
function createRhythmOnlySr(params: any) {
  const timeSig = params.timeSig;
  const measures = params.measures;

  const numCadences = Math.ceil(measures / 4);
  const selectedCadences: Cadence[] = Array(numCadences).fill({ type: "V-I" });

  const randRhythmObjects = generateRandomRhythm(
    timeSig,
    measures,
    params.rhythms,
    selectedCadences,
    true // disable the "quarter note or longer" filter
  );

  if (!randRhythmObjects || randRhythmObjects.length === 0) {
    console.error("❌ generateRandomRhythm returned no rhythmObjects!");
    throw new Error("Failed to generate rhythm objects");
  }

  const chordNoteObject = randRhythmObjects.map((rhythm) => ({
    partName: "Unison",
    noteLength: rhythm.totalValue,
    name: RHYTHM_STAFF_NOTE,
    degree: 0,
    pitchValue: 0,
    chord: null,
    rhythm: rhythm,
    isPatternStart: rhythm.isPatternStart === true,
    isPatternEnd: rhythm.isPatternEnd === true,
    patternIndex: rhythm.patternIndex ?? null,
  }));

  const partsObject = {
    numofParts: 1,
    parts: {
      Unison: {
        order: 0,
        smallName: "U",
        selectedRange: [0, 0],
        chordNoteObject,
      },
    },
  };

  const tuneBody = createConcatString(partsObject as PartsObject, {
    timeSig: timeSig,
    showSolfege: false, // no scale degrees to name in rhythm-only mode
    showRhythmSyllables: params.showRhythmSyllables === true,
  });

  // clef=perc is what puts the synth on the percussion kit (MIDI program 128),
  // which in turn is what makes %%percmap take effect. %%MIDI beat with equal
  // values removes abcjs's default downbeat accent so every stroke is identical;
  // 127 is the maximum velocity, because the claves sample is intrinsically
  // quiet (raw peak 0.16 against a piano note's 0.3-0.5).
  const renderedString =
    `X:1 \n` +
    `M:${timeSig.name}\n` +
    `L:1/32\n` +
    `%%percmap ${RHYTHM_STAFF_NOTE} ${RHYTHM_STAFF_DRUM} normal\n` +
    `%%MIDI beat 127 127 127 1\n` +
    // Syllables ride as annotations, whose default 12pt is sized for chord
    // symbols above the staff. At that size adjacent syllables under a short
    // note collide - "syn" and "co" touch at 0px under an eighth-quarter pair.
    (params.showRhythmSyllables === true
      ? `%%annotationfont Helvetica 10\n`
      : "") +
    `V:U\n` +
    `K:C clef=perc stafflines=1 \n` +
    `%            End of header, start of tune body: \n` +
    `${tuneBody}`;

  return [renderedString, []];
}

export function createNewSr(params: any) {
  try {
    // console.log("=== UNISON SIGHT READING GENERATION START ===");
    // console.log("🔍 Initial params received:", {
    //   selectedRhythms: params.selectedRhythms,
    //   rhythms: params.rhythms,
    //   timeSig: params.timeSig,
    //   measures: params.measures,
    //   scaleDegrees: params.scaleDegrees,
    //   selectedTimeSignature: params.selectedTimeSignature,
    //   range: params.range,
    //   key: params.key,
    //   clef: params.clef,
    //   maxSkip: params.maxSkip,
    //   chords: params.chords,
    //   partsObject: params.partsObject,
    // });

    if (!params) {
      throw new Error("No parameters provided for music generation");
    }

    // Validate critical parameters
    // console.log("🔍 Validating parameters...");

    if (!params.selectedRhythms || params.selectedRhythms.length === 0) {
      console.error("❌ No rhythms selected in params.selectedRhythms!");
      throw new Error("No rhythms selected");
    }

    // Rhythm-only exercises need no key, range or scale degrees, so they branch
    // off before the pitch-related validation below.
    if (params.rhythmOnly) {
      return createRhythmOnlySr(params);
    }

    if (!params.selectedTimeSignature) {
      console.error("❌ No time signature selected");
      throw new Error("No time signature selected");
    }

    if (!params.range || typeof params.range !== "object") {
      console.error("❌ Invalid or missing range parameter:", params.range);
      throw new Error("Invalid range parameter");
    }

    if (!params.key) {
      console.error("❌ No key specified");
      throw new Error("No key specified");
    }

    // console.log("✅ Basic parameter validation passed");

    // Convert scale degrees from 1-based to 0-based
    if (params.scaleDegrees) {
      const oneBasedDegrees = Array.from(params.scaleDegrees) as number[];
      params.scaleDegrees = new Set(
        oneBasedDegrees.map((deg) => (deg - 1) % 12)
      );
      // console.log(
      //   "🔄 Converted scale degrees from",
      //   oneBasedDegrees,
      //   "to",
      //   Array.from(params.scaleDegrees)
      // );
    } else {
      console.warn("⚠️ No scale degrees provided, using default");
      params.scaleDegrees = new Set([0, 1, 2, 3, 4, 5, 6]); // Default to all degrees
    }

    if (params.selectedSharpDegrees) {
      const oneBasedSharpDegrees = Array.from(
        params.selectedSharpDegrees
      ) as number[];
      params.selectedSharpDegrees = new Set(
        oneBasedSharpDegrees.map((deg) => (deg - 1) % 12)
      );
    }

    if (params.selectedFlatDegrees) {
      const oneBasedFlatDegrees = Array.from(
        params.selectedFlatDegrees
      ) as number[];
      params.selectedFlatDegrees = new Set(
        oneBasedFlatDegrees.map((deg) => (deg - 1) % 12)
      );
    }

    // console.log("🔍 Processing chords...");
    const solfege = ["do", "re", "mi", "fa", "so", "la", "ti"];

    // console.log("📋 Import chords:", importChords);

    console.log("🔍 Sharp scale degrees:", sharpScaleDegrees);
    console.log("🔍 Flat scale degrees:", flatScaleDegrees);
    console.log("🔍 Natural scale degrees:", params.scaleDegrees);

    let filteredChords = chords.filter((chord) => {
      // always include 1 chord
      if (chord.name === "1") {
        return true;
      }

      // Include chords containing selected natural scale degrees
      if (
        Array.from(params.scaleDegrees as Set<number>).some((degree: number) =>
          chord.triadNotes.includes(degree)
        )
      ) {
        return true;
      }

      // Include chords containing selected sharp scale degrees, if the set exists
      if (
        sharpScaleDegrees?.size > 0 &&
        Array.from(sharpScaleDegrees as Set<number>).some((degree: number) =>
          chord.triadNotes.includes(degree)
        )
      ) {
        return true;
      }

      // Include chords containing selected flat scale degrees, if the set exists
      if (
        flatScaleDegrees?.size > 0 &&
        Array.from(flatScaleDegrees as Set<number>).some((degree: number) =>
          chord.triadNotes.includes(degree)
        )
      ) {
        return true;
      }

      return false;
    });

    console.log("🔍 Filtered chords:", filteredChords);

    if (filteredChords.length === 0) {
      console.error("❌ No valid chords found after filtering");
      throw new Error("No valid chords found");
    }

    // Helper function to find a chord by name
    function getChordByName(name: string): Chord | undefined {
      return filteredChords.find(
        (c) => c && typeof c === "object" && c.name === name
      );
    }

    // Update next chord possibilities to only include valid chords
    filteredChords = filteredChords.map((chord) => {
      return {
        ...chord,
        nextChordPossibilities: chord.nextChordPossibilities.filter((next) =>
          filteredChords.some((c) => c.name === next.name)
        ),
      };
    });

    // console.log("✅ Chord processing complete");

    var clef = params.clef;
    var keyRendered = params.key;
    var maxSkip = params.maxSkip;
    var level = params.level;
    var timeSig = params.timeSig;
    var bpm = params.bpm;
    var measures = params.measures;
    var sharpScaleDegrees = params.selectedSharpDegrees || [];
    var flatScaleDegrees = params.selectedFlatDegrees || [];

    // console.log("🔍 Extracted parameters:", {
    //   clef,
    //   keyRendered,
    //   maxSkip,
    //   level,
    //   timeSig,
    //   bpm,
    //   measures,
    // });

    var partsObject = params.partsObject;

    // add selected range to partsObject
    // console.log("🔍 Setting range for Unison part:", {
    //   min: params.range.min,
    //   max: params.range.max + 1,
    // });

    partsObject.parts.Unison.selectedRange = [
      params.range.min,
      params.range.max + 1,
    ];

    // Initialize variables
    var numOfNotes = 40;
    // console.log("🔍 Creating note list for key:", keyRendered[0]);
    var noteList = createNoteList(keyRendered[0], numOfNotes);
    // console.log("📝 Note list created, length:", noteList.length);
    // console.log(
    //   "📝 First 10 notes:",
    //   noteList.slice(0, 10).map((n) => ({
    //     name: n.name,
    //     degree: n.degree,
    //     pitchValue: n.pitchValue,
    //   }))
    // );

    // console.log("🔍 Finding unison note range...");
    const minIndex = noteList.findIndex(
      (note) => note.name === baseNoteArray[params.range.min]
    );
    const maxIndex = noteList.findIndex(
      (note) => note.name === baseNoteArray[params.range.max + 1]
    );

    // console.log("📊 Range indices:", {
    //   minIndex,
    //   maxIndex,
    //   minNote: baseNoteArray[params.range.min],
    //   maxNote: baseNoteArray[params.range.max + 1],
    // });

    if (minIndex === -1) {
      console.error(
        "❌ Could not find min note in baseNoteArray:",
        baseNoteArray[params.range.min]
      );
      throw new Error(`Invalid range min: ${params.range.min}`);
    }
    if (maxIndex === -1) {
      console.error(
        "❌ Could not find max note in baseNoteArray:",
        baseNoteArray[params.range.max + 1]
      );
      throw new Error(`Invalid range max: ${params.range.max}`);
    }

    const unisonNoteList = noteList.slice(minIndex, maxIndex);
    // console.log("📝 Unison note list created, length:", unisonNoteList.length);
    // console.log(
    //   "📝 Unison notes:",
    //   unisonNoteList.map((n) => ({
    //     name: n.name,
    //     degree: n.degree,
    //     pitchValue: n.pitchValue,
    //   }))
    // );

    // console.log("🔍 Generating rhythm combination...");
    // console.log("📊 Rhythm generation params:", {
    //   rhythms: params.rhythms.length,
    //   targetSum: timeSig.tsPerMeasure * measures,
    //   tsPerMeasure: timeSig.tsPerMeasure,
    // });

    // Use the new rhythm generation library
    const numCadences = Math.ceil(params.measures / 4);
    const selectedCadences: Cadence[] = Array(numCadences).fill({
      type: "V-I",
    });

    const randRhythmObjects = generateRandomRhythm(
      params.timeSig,
      params.measures,
      params.rhythms,
      selectedCadences,
      true // <-- This is the new flag to disable the filter
    );
    const randNoteLengths = randRhythmObjects.map((r) => r.totalValue);

    if (!randRhythmObjects || randRhythmObjects.length === 0) {
      console.error("❌ generateRandomRhythm returned no rhythmObjects!");
      throw new Error("Failed to generate rhythm objects");
    }

    // console.log("🔍 Generating chord progression...");
    // console.log("📊 Chord progression params:", {
    //   timeSig,
    //   measures,
    //   unisonNoteListLength: unisonNoteList.length,
    //   maxSkip,
    //   randNoteLengthsLength: randNoteLengths.length,
    //   filteredChordsLength: filteredChords.length,
    //   scaleDegrees: Array.from(params.scaleDegrees),
    // });

    let [renderedChordProgression, bassGenNoteArray] = generateChordProgression(
      timeSig,
      measures,
      unisonNoteList,
      maxSkip,
      randNoteLengths,
      filteredChords,
      Array.from(params.scaleDegrees),
      params.moveOnEighthNotes,
      randRhythmObjects,
      params.accidentalsFollowStep
    );

    // console.log("✅ Chord progression generated:", {
    //   progressionLength: renderedChordProgression?.length || 0,
    //   bassArrayLength: bassGenNoteArray?.length || 0,
    // });

    if (!renderedChordProgression || renderedChordProgression.length === 0) {
      console.error("❌ No chord progression generated");
      throw new Error("Failed to generate chord progression");
    }

    if (!bassGenNoteArray || bassGenNoteArray.length === 0) {
      console.error("❌ No bass notes generated");
      throw new Error("Failed to generate bass notes");
    }

    // make an array of 0's of length of the number of parts
    var arrToCheck = Array.from(
      Array(Object.keys(partsObject.parts).length).keys()
    );
    var partIndexArray: number[] = [];
    var legalVoiceLeading = true;

    let totalLoopFails = 0;
    const maxTotalLoopFails = 100;
    const maxSinglePartFails = 20;
    const maxAllPartsFails = 20;

    // console.log("🔍 Starting voice generation loop...");

    // Reset chordNoteObjects and initialize completeNoteObject
    for (const partName in partsObject.parts) {
      partsObject.parts[partName].chordNoteObject = [];
      partsObject.parts[partName].completeNoteObject = [];
    }

    while (totalLoopFails < maxTotalLoopFails) {
      // console.log(
      //   `🔄 Voice generation attempt ${totalLoopFails + 1}/${maxTotalLoopFails}`
      // );
      let allPartsFails = 0;
      let noteIndex = 0;

      while (
        partsObject.parts[Object.keys(partsObject.parts)[0]].chordNoteObject
          .length < renderedChordProgression.length
      ) {
        // console.log(
        //   `📝 Generating note ${noteIndex + 1}/${
        //     renderedChordProgression.length
        //   }`
        // );
        let chordProgressionIndex = noteIndex;

        if (
          shouldTieEighthNotes(
            noteIndex,
            params.moveOnEighthNotes,
            randRhythmObjects
          )
        ) {
          // console.log(`📝 Eighth note hold for note ${noteIndex}, copying previous note.`);
          for (
            let partNum = 0;
            partNum < Object.keys(partsObject.parts).length;
            partNum++
          ) {
            let partName = Object.keys(partsObject.parts)[partNum];
            const prevNoteObject =
              partsObject.parts[partName].chordNoteObject[noteIndex - 1];

            const newNoteObject = {
              ...prevNoteObject,
              noteLength: randRhythmObjects[noteIndex].totalValue,
              rhythm: randRhythmObjects[noteIndex],
              isPatternStart: Boolean(
                randRhythmObjects[noteIndex]?.isPatternStart
              ),
              isPatternEnd: Boolean(randRhythmObjects[noteIndex]?.isPatternEnd),
              patternIndex: randRhythmObjects[noteIndex]?.patternIndex ?? null,
            };
            partsObject.parts[partName].chordNoteObject.push(newNoteObject);
          }
          noteIndex++;
          continue;
        }

        let partIndexArray = Array.from(
          Array(Object.keys(partsObject.parts).length).keys()
        );
        let bassPartObjectIndex = Object.keys(partsObject.parts).findIndex(
          (part) => partsObject.parts[part].order === 0
        );
        let bassRandIndex = partIndexArray.indexOf(bassPartObjectIndex);
        partIndexArray.splice(bassRandIndex, 1);

        for (let i = partIndexArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [partIndexArray[i], partIndexArray[j]] = [
            partIndexArray[j],
            partIndexArray[i],
          ];
        }
        partIndexArray.unshift(bassRandIndex);

        // Create a copy of the triad
        const currentChord = getChordByName(
          renderedChordProgression[chordProgressionIndex].chord.name
        );
        let chordTriadCopy = currentChord ? [...currentChord.triadNotes] : [];

        // If we need to refill the triad notes
        if (chordTriadCopy.length === 0) {
          const chord = getChordByName(
            renderedChordProgression[chordProgressionIndex].chord.name
          );
          chordTriadCopy = chord ? [...chord.triadNotes] : [];
        }

        // take the bass degree out of chordTriadCopy
        let baseChordDegree = bassGenNoteArray[noteIndex].degree;
        chordTriadCopy.splice(chordTriadCopy.indexOf(baseChordDegree), 1);

        let chordObjectsToAdd = [];
        let noteArrayToCheck = Array(
          Object.keys(partsObject.parts).length
        ).fill(0);

        let singlePartFails = 0;
        let success = true; // Track success of this iteration

        for (let i = 0; i < partIndexArray.length; i++) {
          if (chordTriadCopy.length === 0) {
            chordTriadCopy = [
              ...(getChordByName(
                renderedChordProgression[chordProgressionIndex].chord.name
              )?.triadNotes || []),
            ];
          }

          let genChordParams = {
            key: keyRendered,
            timeSig: timeSig,
            maxSkip: maxSkip,
            tonic: keyRendered[0],
            noteIndex: noteIndex,
            baseNoteArray: baseNoteArray,
            bassGenNoteArray: bassGenNoteArray,
            chordTriadCopy: chordTriadCopy,
            otherPartNotes: chordObjectsToAdd,
            noteList: noteList,
            partObject: partsObject,
            partIndexArray: partIndexArray,
            randPartIndex: partIndexArray[i],
            partName: Object.keys(partsObject.parts)[partIndexArray[i]],
            renderedChordProgression: renderedChordProgression,
            chords: filteredChords,
            randRhythmObjects: randRhythmObjects,
            sharpScaleDegrees: sharpScaleDegrees,
            flatScaleDegrees: flatScaleDegrees,
          };

          let chordObjectToAdd: any = {};
          singlePartFails = 0;
          while (singlePartFails < maxSinglePartFails) {
            chordObjectToAdd = generateChord(genChordParams);
            if (Object.keys(chordObjectToAdd).length === 0) {
              singlePartFails++;
            } else {
              break;
            }
          }

          if (singlePartFails >= maxSinglePartFails) {
            // console.log(
            //   `❌ Failed to generate chord for part ${i} after ${maxSinglePartFails} attempts`
            // );
            allPartsFails++;
            success = false;
            break;
          }

          // Add to array
          chordObjectsToAdd.push(chordObjectToAdd);

          let randPartIndex =
            partsObject.parts[Object.keys(partsObject.parts)[partIndexArray[i]]]
              .order;
          noteArrayToCheck[randPartIndex] = chordObjectToAdd.pitchValue;
        }

        if (!success || !checkForIllegalVoiceLeading(noteArrayToCheck)) {
          // If there are errors, retry for the same chord
          // console.log(`❌ Voice leading check failed for note ${noteIndex}`);
          allPartsFails++;
          if (allPartsFails >= maxAllPartsFails) {
            totalLoopFails++;
            break;
          }
          continue;
        }

        // Add to the complete note object
        for (let partNum = 0; partNum < partIndexArray.length; partNum++) {
          let partName = Object.keys(partsObject.parts)[
            partIndexArray[partNum]
          ];
          if (!partsObject.parts[partName].chordNoteObject) {
            console.error(
              "Error: chordNoteObject is undefined for part",
              partName
            );
            continue;
          }
          // Add rhythm information to the note object
          const noteObj = chordObjectsToAdd[partNum];
          noteObj.rhythm = randRhythmObjects[noteIndex];
          partsObject.parts[partName].chordNoteObject.push(noteObj);
        }

        // Move to the next note
        noteIndex++;
        allPartsFails = 0; // Reset part failures for the next note
      }

      // Check if the song is fully rendered
      if (
        partsObject.parts[Object.keys(partsObject.parts)[0]].chordNoteObject
          .length === renderedChordProgression.length
      ) {
        console.log("✅ Voice generation completed successfully");
        break;
      }
    }

    if (totalLoopFails >= maxTotalLoopFails) {
      console.error(
        "❌ Could not find a valid voice leading after 100 attempts"
      );
      throw new Error("Failed to generate valid voice leading");
    }

    // console.log("🔍 Processing complete note objects...");

    var prevNoteObj = {};
    var nextNoteObj = {};

    // create a new array in each part to contain complete notes
    for (
      var partIndex = 0;
      partIndex < Object.keys(partsObject.parts).length;
      partIndex++
    ) {
      // create linear index when starting each new part
      var noteLinearIndex = 1;

      // loop through the chordNoteObject
      for (
        var chordNoteIndex = 0;
        chordNoteIndex <
        partsObject.parts[Object.keys(partsObject.parts)[partIndex]]
          .chordNoteObject.length;
        chordNoteIndex++
      ) {
        const currentNote =
          partsObject.parts[Object.keys(partsObject.parts)[partIndex]]
            .chordNoteObject[chordNoteIndex];

        // add linear index to each chordNoteObject
        currentNote.noteLinearIndex = noteLinearIndex;

        // add the note to the completeNoteObject for each length of the note and add a noteLinearIndex
        for (var i = 0; i < currentNote.noteLength; i++) {
          var newNote = i === 0;
          // Check if this is a new pattern by comparing the rhythm's totalValue with singleNoteValue
          var newPattern =
            i === 0 &&
            currentNote.rhythm?.pattern &&
            currentNote.rhythm.totalValue >
              currentNote.rhythm.singleNoteValue &&
            currentNote.rhythm.isPatternStart;
          var endPattern =
            i === currentNote.noteLength - 1 &&
            currentNote.rhythm?.pattern &&
            currentNote.rhythm.isPatternEnd;

          partsObject.parts[
            Object.keys(partsObject.parts)[partIndex]
          ].completeNoteObject.push({
            name: currentNote.name,
            noteLength: currentNote.noteLength,
            noteLinearIndex: noteLinearIndex,
            newNote: newNote,
            newPattern: newPattern,
            endPattern: endPattern,
            isPatternNote: currentNote.rhythm?.isPatternNote || false,
            patternIndex: currentNote.rhythm?.patternIndex || null,
          });
          noteLinearIndex++;
        }
      }
    }

    // console.log("🔍 Filtering accidentals...");

    function filterAccidentals(params: any) {
      const tsPerMeasure = params.tsPerMeasure;
      let partsObject = params.partsObject;
      let tsCounter = 0;
      const key = params.key;

      // loop through the parts object
      Object.keys(partsObject.parts).forEach((partName) => {
        // loop through the completeNoteObject
        for (
          var i = 0;
          i < partsObject.parts[partName].completeNoteObject.length;
          i++
        ) {
          tsCounter +=
            partsObject.parts[partName].completeNoteObject[0].noteLength;

          // check if there is an accidental
          var accidental =
            partsObject.parts[partName].completeNoteObject[i].name.match(
              /[_^=]/g
            );
          if (
            partsObject.parts[partName].completeNoteObject[i].name.match(
              /[_^=]/g
            )
          ) {
            var noteNameWithAccidental =
              partsObject.parts[partName].completeNoteObject[i].name;
            noteNameWithAccidental = noteNameWithAccidental.replace(
              /[_^=]/gi,
              ""
            );
            var accidentalType = partsObject.parts[partName].completeNoteObject[
              i
            ].name
              .match(/[_^=]/g)
              .join("");
          } else {
            // if (
            //   partsObject.parts[partName].completeNoteObject[i].name ===
            //   noteNameWithAccidental
            // ) {
            //   console.log("found accidental");
            // }
          }
          if (tsCounter % tsPerMeasure === 0) {
            accidental = null;
            accidentalType = null;
            noteNameWithAccidental = "";
          }
        }
      });
    }

    filterAccidentals({
      tsPerMeasure: timeSig.tsPerMeasure,
      partsObject: partsObject,
      key: keyRendered,
    });

    // console.log("🔍 Creating concatenated string...");

    // Remove the redundant loop and directly use createConcatString
    const tuneBody = createConcatString(partsObject as PartsObject, {
      timeSig: timeSig,
      showSolfege: params.showSolfege === true,
    });

    // console.log("✅ Tune body created, length:", tuneBody.length);

    // Save the concatenated string back to each part
    Object.keys(partsObject.parts).forEach((part) => {
      let partString = "";
      const singlePartObject = partsObject.parts[part];
      let tsCount = 0;
      let measureString = "";

      singlePartObject.chordNoteObject.forEach(
        (note: ChordNoteObject, index: number) => {
          if (tsCount === 0) {
            measureString = "";
          }

          measureString += `${note.name}${note.noteLength}`;

          const isEndOfMeasure =
            tsCount + note.noteLength >= timeSig.tsPerMeasure;
          const isLastNote =
            index === singlePartObject.chordNoteObject.length - 1;
          const nextNote = singlePartObject.chordNoteObject[index + 1];

          const shouldAddSpace =
            isEndOfMeasure ||
            isLastNote ||
            (note.isPatternEnd && nextNote?.isPatternStart) ||
            !note.rhythm?.pattern;

          if (shouldAddSpace) {
            measureString += " ";
          }

          tsCount += note.noteLength;

          if (tsCount >= timeSig.tsPerMeasure) {
            partString += measureString + "|";
            tsCount = 0;
          }
        }
      );

      partsObject.parts[part].concatNoteString = partString;
    });

    // console.log("🔍 Creating final ABC string...");

    // get the first entry of the generatedPartTunes object
    var headerString = "";
    for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
      var partName = Object.keys(partsObject.parts)[i];
      var smallName = partsObject.parts[partName].smallName;
      headerString += `V:${smallName}\n`;
    }

    var scoreString = "%%score ";
    scoreString += "\n";

    var renderedString =
      `X:1 \n` +
      `M:${timeSig.name}\n` +
      `L:1/32\n` +
      `${scoreString}` +
      `${headerString}` +
      `K: ${keyRendered} clef=${clef} \n` +
      `%            End of header, start of tune body: \n` +
      `${tuneBody}`;

    console.log("✅ Final ABC string created");
    // console.log(
    //   "📝 Final string preview:",
    //   renderedString.substring(0, 200) + "..."
    // );
    // console.log("📊 Parts object summary:", {
    //   parts: Object.keys(partsObject.parts),
    //   chordNoteObjects: Object.keys(partsObject.parts).map(
    //     (p) => partsObject.parts[p].chordNoteObject?.length || 0
    //   ),
    // });

    // console.log("=== UNISON SIGHT READING GENERATION COMPLETE ===");

    return [renderedString, renderedChordProgression];
  } catch (error) {
    console.error("=== UNISON SIGHT READING GENERATION FAILED ===");
    console.error("❌ Error caught in createNewSr:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      params: params
        ? {
            selectedRhythms: params.selectedRhythms?.length,
            rhythms: params.rhythms?.length,
            timeSig: params.timeSig,
            measures: params.measures,
            range: params.range,
            key: params.key,
          }
        : "No params",
    });
    return [null, null];
  }
}
