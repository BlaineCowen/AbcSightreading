import { chords } from "../resources/chords";
import type { Chord } from "../types/ChordSet";
import { type Rhythm } from "../resources/rhythms";
import { noteArray } from "../resources/noteArray";

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
  let numberResult: number[] = [];
  let rhythmResult: Rhythm[] = [];
  let currentSum = 0;
  let currentCombination: number[] = [];
  let totalRuns = 0;

  if (!rhythmArray || rhythmArray.length === 0) {
    throw new Error("No rhythms provided for generation");
  }

  // Sort array by duration (descending)
  rhythmArray.sort((a, b) => b.totalValue - a.totalValue);

  // Weight rhythms based on their duration and how well they fit in measures
  rhythmArray = rhythmArray.map((r) => ({
    ...r,
    weight: r.totalValue <= tsPerMeasure ? r.totalValue : 1,
  }));

  while (currentSum !== targetSum && totalRuns < 1000) {
    let measureArray: number[] = [];
    let measureRhythmArr: Rhythm[] = [];
    let measureRhythm = 0;
    let measureRuns = 0;
    const maxMeasureRuns = 20; // Increased from 10 to allow more attempts

    // Fill current measure
    while (measureRhythm < tsPerMeasure && measureRuns < maxMeasureRuns) {
      const remainingInMeasure = tsPerMeasure - measureRhythm;
      const remainingTotal = targetSum - currentSum - measureRhythm;

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

      // If no rhythms fit, try to find exact matches for remaining space
      if (filteredRhythms.length === 0) {
        filteredRhythms = rhythmArray.filter(
          (r) => r.totalValue === remainingInMeasure
        );
      }

      // If still no matches, try the smallest available rhythm
      if (filteredRhythms.length === 0) {
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
          if (selectedRhythm.pattern) {
            for (let i = 0; i < selectedRhythm.abcValue.length; i++) {
              const value = parseInt(selectedRhythm.abcValue[i]);
              measureArray.push(value);
              measureRhythmArr.push({
                ...selectedRhythm,
                abcValue: [selectedRhythm.abcValue[i]],
                totalValue: value,
                singleNoteValue: value,
                isPatternNote: true,
                isPatternStart: i === 0,
                isPatternEnd: i === selectedRhythm.abcValue.length - 1,
                patternIndex: i,
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
    }

    totalRuns++;
  }

  if (totalRuns >= 1000 || currentSum !== targetSum) {
    console.warn("Could not find valid rhythm combination");
    return { numbers: [], rhythmObjects: [] };
  }

  return { numbers: currentCombination, rhythmObjects: rhythmResult };
}

function generateChordProgression(
  timeSig: any,
  numOfMeasures: any,
  bassRangeNoteList: Note[],
  maxSkip: number,
  randNoteLengths: number[],
  chords: Chord[],
  scaleDegrees: number[]
) {
  console.log("Initial bassRangeNoteList:", bassRangeNoteList);
  console.log("Scale degrees:", scaleDegrees);

  let bassNoteArray = [];
  let newMaxSkip = maxSkip;

  // const tonicNotes = bassRangeNoteList.filter((note) => note.degree === 0);
  // bassNoteArray.push(tonicNotes[Math.floor(Math.random() * tonicNotes.length)]);

  // make sure that in chords[objects].nextChordPossibilities, the chord name is in the chords object
  for (const chord in chords) {
    if (chords[chord].nextChordPossibilities) {
      chords[chord].nextChordPossibilities = chords[
        chord
      ].nextChordPossibilities.filter((chord: { name: string }) =>
        chords.find((c) => c.name === chord.name)
      );
    }
  }

  var chordGenFails = 0;

  var numOfChords = randNoteLengths.length;

  console.log(
    "Before filtering bassRangeNoteList:",
    bassRangeNoteList.map((n) => ({ degree: n.degree, name: n.name }))
  );
  console.log("Filtering for scale degrees:", scaleDegrees);

  bassRangeNoteList = bassRangeNoteList.filter((note) => {
    const included = scaleDegrees.includes(note.degree);
    if (!included) {
      console.log(
        `Note ${note.name} (degree ${note.degree}) excluded - not in scale degrees`
      );
    }
    return included;
  });

  console.log(
    "After filtering bassRangeNoteList:",
    bassRangeNoteList.map((n) => ({ degree: n.degree, name: n.name }))
  );

  if (bassRangeNoteList.length === 0) {
    throw new Error(
      "No valid notes found in range for the selected scale degrees"
    );
  }

  // pick a random note from bassRangeNoteList degree 0,2,4
  let tonicNotes = bassRangeNoteList.filter((note) =>
    [0, 2, 4].includes(note.degree)
  );

  console.log(
    "Tonic notes found:",
    tonicNotes.map((n) => ({ degree: n.degree, name: n.name }))
  );

  if (tonicNotes.length === 0) {
    throw new Error(
      "No tonic notes found in the selected range and scale degrees"
    );
  }

  bassNoteArray.push(tonicNotes[Math.floor(Math.random() * tonicNotes.length)]);

  let prevBassNote = bassNoteArray[0];
  let prevChord = {
    chord: chords[0],
    length: 8,
    triadDegrees: [0, 2, 4],
  };

  let bassDegrees = bassRangeNoteList.filter(
    (note) =>
      Math.abs(note.pitchValue - prevBassNote.pitchValue) <= maxSkip &&
      scaleDegrees.includes(note.degree)
  );

  var chordProgression: any[] = [];

  let validProgression = false;

  while (!validProgression && chordGenFails < 100) {
    console.log("genchord progression chordGenFails ", chordGenFails);
    chordProgression = [];
    bassNoteArray = [tonicNotes[Math.floor(Math.random() * tonicNotes.length)]];

    for (let i = 0; i < numOfChords; i++) {
      newMaxSkip = maxSkip;
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

        // todo add eighth note check
        bassDegrees = bassRangeNoteList.filter(
          (note) =>
            Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip
        );
        if (bassDegrees.length === 0) {
          console.log("No valid bass degrees found");
          chordGenFails++;
          bassNoteArray.pop();
          console.log("chordGenFails ", chordGenFails);
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
          prevChord.chord.nextChordPossibilities.filter(
            (chord: { name: string; weight: number }) => {
              if (!chords.find((c) => c.name === chord.name)) {
                console.warn(`Chord ${chord.name} not found in chords object`);
                return false;
              }
              return bassDegrees
                .map((note) => note.degree)
                .some((degree) =>
                  chords
                    .find((c) => c.name === chord.name)
                    ?.triadNotes.includes(degree)
                );
            }
          );

        if (nextChordPossibilities.length === 0) {
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          // Restart the loop if no valid progression is found
          chordGenFails++;
          // erase last bass note
          bassNoteArray.pop();

          console.log("chordGenFails ", chordGenFails);

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
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          bassNoteArray.pop();
          console.log("chordGenFails ", chordGenFails);

          break;
        }
      } else if (i === numOfChords - 2) {
        // The second-to-last chord must be dominant
        prevChord = chordProgression[chordProgression.length - 1];

        // prefer dominant
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter((chord) => {
            if (!chords.find((c) => c.name === chord.name)) return false;
            return (
              (chords.find((c) => c.name === chord.name)?.type === "dominant" ||
                chords.find((c) => c.name === chord.name)?.type ===
                  "predominant") &&
              bassDegrees
                .map((note) => note.degree)
                .some((degree) =>
                  chords
                    .find((c) => c.name === chord.name)
                    ?.triadNotes.includes(degree)
                )
            );
          });
        if (nextChordPossibilities.length === 0) {
          // if no dominant chords are found, try tonic chords
          nextChordPossibilities =
            prevChord.chord.nextChordPossibilities.filter((chord) => {
              if (!chords.find((c) => c.name === chord.name)) return false;
              return (
                (chords.find((c) => c.name === chord.name)?.type ===
                  "dominant-inversion" ||
                  chords.find((c) => c.name === chord.name)?.type ===
                    "tonic") &&
                bassDegrees
                  .map((note) => note.degree)
                  .some((degree) =>
                    chords
                      .find((c) => c.name === chord.name)
                      ?.triadNotes.includes(degree)
                  )
              );
            });
        }

        // if still no valid progression is found restart the loop
        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          bassNoteArray.pop();
          console.log("chordGenFails ", chordGenFails);
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
            console.log(
              `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
            );

            chordGenFails++;
            bassNoteArray.pop();
            console.log("chordGenFails ", chordGenFails);

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
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          bassNoteArray.pop();
          console.log("chordGenFails ", chordGenFails);
          break;
        }
      } else {
        prevChord = chordProgression[chordProgression.length - 1];
        prevBassNote = bassNoteArray[i - 1];
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter((chord) => {
            if (!chords.find((c) => c.name === chord.name)) return false;
            return bassDegrees
              .map((note) => note.degree)
              .some((degree) =>
                chords
                  .find((c) => c.name === chord.name)
                  ?.triadNotes.includes(degree)
              );
          });

        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          bassNoteArray.pop();
          console.log("chordGenFails ", chordGenFails);
          break;
        } else {
          let nextChordInner = getRandomByWeight(
            nextChordPossibilities,
            chords
          );
          if (nextChordInner === null) {
            chordGenFails++;
            bassNoteArray.pop();
            console.log("chordGenFails ", chordGenFails);
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
              console.log(
                `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
              );
              chordGenFails++;
              bassNoteArray.pop();
              console.log("chordGenFails ", chordGenFails);

              break;
            }
          }
        }
      }
    }

    if (chordProgression.length === numOfChords) {
      validProgression = true;
    }
  }

  if (chordGenFails >= 100) {
    console.log("Error: Could not find a valid chord progression");
    return [];
  }
  console.log(
    "chordProgression ",
    chordProgression.map((chord) => chord.chord.name)
  );
  return [chordProgression, bassNoteArray];
}

function createNoteList(tonic: string, numOfNotes: number) {
  var keyLetter = tonic[0].toUpperCase();
  var noteList = [];
  var notes = ["C", "D", "E", "F", "G", "A", "B"];
  var indexOfOrigin = notes.indexOf(keyLetter);
  var index = notes.indexOf(keyLetter);
  var degree = 0;

  // Calculate minimum number of notes needed to cover all UIL ranges
  // UIL ranges use ABC notation indices from noteArray
  // We need to cover from C,, (index 0) to c'' (index 35)
  const minNotes = 40;

  // Use the larger of numOfNotes or minNotes
  const totalNotes = Math.max(numOfNotes, minNotes);

  // Start from a lower index to ensure we have enough notes in both directions
  // Start from C,, (index 0) and go up to c''' (index 42)
  for (let currentNoteIndex = 0; currentNoteIndex < 42; currentNoteIndex++) {
    if (degree >= 7) {
      degree = 0;
    }

    // Get the ABC notation from noteArray
    const abcNote = noteArray[currentNoteIndex];
    if (!abcNote) {
      break; // Stop if we've reached the end of noteArray
    }

    noteList.push({
      name: abcNote,
      degree: degree,
      pitchValue: currentNoteIndex,
    });

    index++;
    degree++;

    if (index >= notes.length) {
      index = 0;
    }
  }

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
  if (currentChord.chord.sharpScaleDegree === scaleDegreeToAdd) {
    accidental = "^";
    if (keyObject.sharps?.indexOf(scaleDegreeToAdd) !== -1) {
      accidental = "^^";
    } else if (keyObject.flats?.indexOf(scaleDegreeToAdd) !== -1) {
      accidental = "=";
    }
  }

  if (currentChord.chord.flatScaleDegree === scaleDegreeToAdd) {
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
  console.log(`Note ${params.noteIndex}:`, {
    noteLength,
    pattern: params.randRhythmObjects[params.noteIndex]?.pattern,
    abcValue: params.randRhythmObjects[params.noteIndex]?.abcValue,
    patternIndex: params.randRhythmObjects[params.noteIndex]?.patternIndex,
    isPatternStart: params.randRhythmObjects[params.noteIndex]?.isPatternStart,
    isPatternEnd: params.randRhythmObjects[params.noteIndex]?.isPatternEnd,
    name: params.randRhythmObjects[params.noteIndex]?.name,
  });

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

function createConcatString(
  partsObject: PartsObject,
  params: { timeSig: { tsPerMeasure: number }; showSolfege: boolean }
) {
  var concatString = "";

  Object.keys(partsObject.parts).forEach((part: string) => {
    var singlePartObject = partsObject.parts[part];
    var measureString = "";
    var tsCount = 0;

    if (partsObject.numofParts && partsObject.numofParts > 1) {
      concatString += `[V:${part}] `;
    }

    singlePartObject.chordNoteObject.forEach(
      (note: ChordNoteObject, index: number) => {
        if (tsCount === 0) {
          measureString = "";
        }

        measureString += `${note.name}${note.noteLength}`;

        const isEndOfMeasure =
          tsCount + note.noteLength >= params.timeSig.tsPerMeasure;
        const isLastNote =
          index === singlePartObject.chordNoteObject.length - 1;
        const nextNote = singlePartObject.chordNoteObject[index + 1];

        // Debug log for pattern checking
        console.log(`Concat Note ${index}:`, {
          name: note.name,
          length: note.noteLength,
          rhythm: note.rhythm?.name,
          pattern: note.rhythm?.pattern,
          isPatternStart: note.isPatternStart,
          isPatternEnd: note.isPatternEnd,
          nextIsPattern: nextNote?.rhythm?.pattern,
          nextIsStart: nextNote?.isPatternStart,
        });

        // Add space if:
        // 1. End of measure
        // 2. Last note in sequence
        // 3. Current note is end of pattern
        // 4. Current note is not part of a pattern
        const shouldAddSpace =
          isEndOfMeasure ||
          isLastNote ||
          note.isPatternEnd ||
          !note.rhythm?.pattern;

        if (shouldAddSpace) {
          measureString += " ";
          console.log(`Added space after note ${index} because:`, {
            isEndOfMeasure,
            isLastNote,
            isPatternEnd: note.isPatternEnd,
            notInPattern: !note.rhythm?.pattern,
          });
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
        solfegeString += solfege[note.degree] + " ";
      });
      concatString += solfegeString + "\n";
    }
  });

  return concatString;
}

interface ChordType {
  name: string;
  triadNotes: number[];
  type: string;
  root: number;
  nextChordPossibilities: { name: string; weight: number }[];
  baseMultiplier: number;
}

interface ChordMap {
  [key: string]: ChordSet;
}

interface ChordArray extends Array<ChordSet> {}

export function createNewSr(params: any) {
  try {
    if (!params) {
      throw new Error("No parameters provided for music generation");
    }
    console.log("[Debug] createNewSr: Initial params", {
      selectedRhythms: params.selectedRhythms,
      rhythms: params.rhythms, // assuming this is where the full list comes from
      timeSig: params.timeSig,
      measures: params.measures,
      scaleDegrees: params.scaleDegrees,
      selectedTimeSignature: params.selectedTimeSignature,
    });

    if (!params.selectedRhythms || params.selectedRhythms.length === 0) {
      console.error(
        "[Debug] createNewSr: No rhythms selected in params.selectedRhythms!"
      );
      throw new Error("No rhythms selected");
    }

    if (!params.selectedTimeSignature) {
      throw new Error("No time signature selected");
    }

    // Convert scale degrees from 1-based to 0-based
    if (params.scaleDegrees) {
      const oneBasedDegrees = Array.from(params.scaleDegrees) as number[];
      params.scaleDegrees = new Set(
        oneBasedDegrees.map((deg) => (deg - 1) % 12)
      );
      console.log(
        "Converted scale degrees from",
        oneBasedDegrees,
        "to",
        Array.from(params.scaleDegrees)
      );
    }

    const solfege = ["do", "re", "mi", "fa", "so", "la", "ti"];
    let importChords = params.chords;
    let filteredChords = chords.filter((chord) =>
      importChords.includes(chord.name)
    );

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

    var clef = params.clef;
    var keyRendered = params.key;
    var maxSkip = params.maxSkip;
    var level = params.level;
    var timeSig = params.timeSig;
    var bpm = params.bpm;
    var measures = params.measures;

    var partsObject = params.partsObject;

    // add selected range to partsObject
    partsObject.parts.Unison.selectedRange = [
      params.range.min,
      params.range.max + 1,
    ];

    // Initialize variables
    var numOfNotes = 40;
    var noteList = createNoteList(keyRendered[0], numOfNotes);
    const unisonNoteList = noteList.slice(
      noteList.findIndex(
        (note) => note.name === baseNoteArray[params.range.min]
      ),
      noteList.findIndex(
        (note) => note.name === baseNoteArray[params.range.max + 1]
      )
    );

    const randNoteLengthsResult = generateRandomRhythmCombination(
      params.rhythms,
      timeSig.tsPerMeasure * measures,
      timeSig.tsPerMeasure
    );
    console.log(
      "[Debug] createNewSr: Result from generateRandomRhythmCombination",
      randNoteLengthsResult
    );

    const randNoteLengths = randNoteLengthsResult.numbers;
    const randRhythmObjects = randNoteLengthsResult.rhythmObjects;

    if (!randNoteLengths || randNoteLengths.length === 0) {
      console.error(
        "[Debug] createNewSr: generateRandomRhythmCombination returned no numbers!"
      );
      // Potentially throw an error or handle empty rhythm sequence
      // For now, let's log and see if the original error ("No valid notes found in range...") still occurs
    }
    if (!randRhythmObjects || randRhythmObjects.length === 0) {
      console.error(
        "[Debug] createNewSr: generateRandomRhythmCombination returned no rhythmObjects!"
      );
      // Potentially throw an error or handle empty rhythm sequence
    }

    let [renderedChordProgression, bassGenNoteArray] = generateChordProgression(
      timeSig,
      measures,
      unisonNoteList,
      maxSkip,
      randNoteLengths,
      filteredChords,
      Array.from(params.scaleDegrees)
    );

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

    // Reset chordNoteObjects and initialize completeNoteObject
    for (const partName in partsObject.parts) {
      partsObject.parts[partName].chordNoteObject = [];
      partsObject.parts[partName].completeNoteObject = [];
    }

    while (totalLoopFails < maxTotalLoopFails) {
      let allPartsFails = 0;
      let noteIndex = 0;

      while (
        partsObject.parts[Object.keys(partsObject.parts)[0]].chordNoteObject
          .length < renderedChordProgression.length
      ) {
        let chordProgressionIndex = noteIndex;

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
        break;
      }
    }

    if (totalLoopFails >= maxTotalLoopFails) {
      console.error(
        "Error: Could not find a valid voice leading after 100 attempts"
      );
    }

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
            if (
              partsObject.parts[partName].completeNoteObject[i].name ===
              noteNameWithAccidental
            ) {
              console.log("found accidental");
            }
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

    // Remove the redundant loop and directly use createConcatString
    const tuneBody = createConcatString(partsObject as PartsObject, {
      timeSig: timeSig,
      showSolfege: params.showSolfege === true,
    });

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

    // get the first entry of the generatedPartTunes object
    var headerString = "";
    for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
      var partName = Object.keys(partsObject.parts)[i];
      var smallName = partsObject.parts[partName].smallName;
      var middleString = "";
      if (clef === "treble-8") {
        middleString = "octave=1";
      }
      headerString += `V:${smallName} ${middleString}\n`;
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

    console.log(renderedString);
    console.log(partsObject);

    return [renderedString, renderedChordProgression];
  } catch (error) {
    console.error("[Debug] createNewSr: Error caught", error);
    console.error("An error occurred:", error);
    return [null, null];
  }
}
