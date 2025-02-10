// import type { ChordType } from "abcjs";
// import Index from "../pages/index.astro";
// import { render } from "astro/compiler-runtime";
import { nonChordToneGenerator } from "./nonChordToneGen";
// import { get } from "svelte/store";

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
  length?: number;
}

function checkForIllegalVoiceLeading(arr: number[]) {
  var sortedArr = [...arr].sort((a, b) => a - b);
  if (sortedArr.join(",") === arr.join(",")) {
    return true;
  } else {
    return false;
  }
}

function getRandomByWeight(
  arr: { name: any; weight: number }[],
  chords: ChordSet
) {
  if (arr.length === 0) {
    return null; // Handle empty array case
  }

  // change weight to weight * chords[arr[i].name].baseMultiplier
  arr = arr.map((element) => {
    return {
      name: element.name,
      weight: element.weight * chords[element.name].baseMultiplier * 100,
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

function getRandomRhythmByWeight(arr: { name: any; weight: number }[]) {
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

function generateRandomCombination(
  array: number[],
  targetSum: number,
  eighthsPerMeasure: number
) {
  let result: number[] = [];
  let largestNumber = Math.max(...array);
  let currentSum = 0;
  let currentCombination: number[] = [];
  let arrayToRandom = [];

  let totalRuns = 0;

  for (let i = 0; i < array.length; i++) {
    if (array[i] <= targetSum) {
      arrayToRandom.push({ name: array[i], weight: 10 / array[i] });
    }
  }
  // get the current sum of the array
  currentSum = array.reduce((a, b) => a + b, 0);
  let testMeasureSum = 0;
  while (currentSum !== targetSum && totalRuns < 1000) {
    // check if totalruns is getting high
    if (totalRuns >= 900) {
      console.log("Error: Could not find a valid combination");
    }
    let measureArray: number[] = [];
    let measureRhythm = 0;
    let measureRuns = 0;
    const maxMeasureRuns = 10;
    while (measureRhythm < eighthsPerMeasure) {
      let randomNumber = null;
      // check if last measure
      if (currentSum === targetSum - eighthsPerMeasure) {
        randomNumber = eighthsPerMeasure;
      } else {
        // make sure array is there
        if (arrayToRandom.length > 0) {
          let filteredArrayToRandom = arrayToRandom.filter(
            (element) => element.name + measureRhythm <= eighthsPerMeasure
          );
          randomNumber = getRandomRhythmByWeight(filteredArrayToRandom);

          if (randomNumber !== null) {
            randomNumber = randomNumber.name;
          }
        }
      }

      let testMeasureArray = [...measureArray];
      testMeasureArray.push(randomNumber);

      let testMeasureSum = testMeasureArray.reduce((a, b) => a + b, 0);

      if (testMeasureSum <= eighthsPerMeasure) {
        measureArray.push(randomNumber);
        measureRhythm += randomNumber;
      } else {
        measureRuns++;
        if (measureRuns >= maxMeasureRuns) {
          break;
        }
      }
    }
    let testCompleteArray = [...currentCombination];
    // add measure array to end of current combination
    testCompleteArray = testCompleteArray.concat(measureArray);

    // get the current sum of the array
    let testSum = testCompleteArray.reduce((a, b) => a + b, 0);
    // if the sum is less than the target sum, set the current combination to the test array
    if (testSum <= targetSum) {
      currentCombination = testCompleteArray;
      currentSum = testSum;
    }

    // increment the runs
    totalRuns++;
  }
  if (totalRuns >= 1000) {
    console.log("Error: Could not find a valid combination");
    return [];
  }

  result = currentCombination;
  // Choose a random element from the array
  console.log("random combination ");
  console.log(result);

  // loop through array
  for (let i = 0; i < result.length; i++) {
    if (result[i] === 4) {
      let diceRoll = Math.random();
      if (diceRoll < 0.5) {
        let dottedQuarterEighth = [3, 1];
        result.splice(i, 1, ...dottedQuarterEighth);
      }
    }
  }

  return result;
}

function generateChordProgression(
  timeSig: any,
  numOfMeasures: any,
  bassRangeNoteList: Note[],
  maxSkip: number,
  randNoteLengths: number[],
  chords: ChordSet
) {
  let bassNoteArray = [];
  let newMaxSkip = maxSkip;
  const tonicNotes = bassRangeNoteList.filter((note) => note.degree === 0);
  bassNoteArray.push(tonicNotes[Math.floor(Math.random() * tonicNotes.length)]);

  var chordGenFails = 0;

  var numOfChords = randNoteLengths.length;

  let prevBassNote = bassNoteArray[0];

  let bassDegrees = bassRangeNoteList.filter(
    (note) => Math.abs(note.pitchValue - prevBassNote.pitchValue) <= maxSkip
  );

  var chordProgression: any[] = [];
  let validProgression = false;
  while (!validProgression && chordGenFails < 100) {
    console.log("genchord progression chordGenFails ", chordGenFails);
    chordProgression = [];
    bassNoteArray = [tonicNotes[Math.floor(Math.random() * tonicNotes.length)]];

    for (let i = 0; i < numOfChords; i++) {
      if (i !== 0) {
        if (randNoteLengths[i] === 1 || randNoteLengths[i] === 3) {
          newMaxSkip = 1;
        } else {
          newMaxSkip = maxSkip;
        }
        prevBassNote = bassNoteArray[i - 1];
        bassDegrees = bassRangeNoteList.filter(
          (note) =>
            Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip
        );
      }
      if (i === 0) {
        const firstChord = {
          chord: chords["1"],
          length: randNoteLengths[i],
          triadDegrees: chords["1"].triadNotes,
        };

        chordProgression.push(firstChord);
      } else if (i === numOfChords - 3) {
        // The third-to-last chord must lead to 5
        let prevChord = chordProgression[chordProgression.length - 1];
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter(
            (chord: { name: string; weight: number; type: string }) =>
              (chords[chord.name].type === "tonic" ||
                chords[chord.name].type === "predominant") &&
              bassDegrees
                .map((note) => note.degree)
                .includes(chords[chord.name].root)
          );

        if (nextChordPossibilities.length === 0) {
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          // Restart the loop if no valid progression is found
          chordGenFails++;
          console.log("chordGenFails ", chordGenFails);

          break;
        }

        let nextChordInner = getRandomByWeight(nextChordPossibilities, chords);
        if (nextChordInner !== null) {
          let nextChordName = nextChordInner.name;
          let nextChord = {
            chord: chords[nextChordName],
            length: randNoteLengths[i],
            triadDegrees: chords[nextChordName].triadNotes,
          };
          let bassNoteToAdd = bassRangeNoteList
            .filter((note) => note.degree === chords[nextChordName].root)
            .filter(
              (note) =>
                Math.abs(note.pitchValue - prevBassNote.pitchValue) <=
                newMaxSkip
            );
          if (bassNoteToAdd.length > 0) {
            bassNoteArray.push(bassNoteToAdd[0]);
            chordProgression.push(nextChord);
          }
        } else {
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          console.log("chordGenFails ", chordGenFails);

          break;
        }
      } else if (i === numOfChords - 2) {
        // The second-to-last chord must be dominant
        let prevChord = chordProgression[chordProgression.length - 1];
        // prefer dominant
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter(
            (chord: { name: string; weight: number; type: string }) =>
              // prefer dominant chords
              chords[chord.name].type === "dominant" &&
              bassDegrees
                .map((note) => note.degree)
                .includes(chords[chord.name].root)
          );
        if (nextChordPossibilities.length === 0) {
          // if no dominant chords are found, try tonic chords
          nextChordPossibilities =
            prevChord.chord.nextChordPossibilities.filter(
              (chord: { name: string; weight: number; type: string }) =>
                chords[chord.name].type === "dominant-inversion" &&
                bassDegrees
                  .map((note) => note.degree)
                  .includes(chords[chord.name].root)
            );
        }

        // if still no valid progression is found restart the loop
        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          console.log("chordGenFails ", chordGenFails);
          break;
        }

        let nextChordInner = getRandomByWeight(nextChordPossibilities, chords);
        if (nextChordInner !== null) {
          let nextChordName = nextChordInner.name;
          let nextChord = {
            chord: chords[nextChordName],
            length: randNoteLengths[i],
            triadDegrees: chords[nextChordName].triadNotes,
          };
          let bassNoteToAdd = bassRangeNoteList
            .filter((note) => note.degree === chords[nextChordName].root)
            .filter(
              (note) =>
                Math.abs(note.pitchValue - prevBassNote.pitchValue) <=
                newMaxSkip
            );
          if (bassNoteToAdd.length > 0) {
            bassNoteArray.push(bassNoteToAdd[0]);
            chordProgression.push(nextChord);
          } else {
            console.log(
              `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
            );

            chordGenFails++;
            console.log("chordGenFails ", chordGenFails);

            break;
          }
        }
      } else if (i === numOfChords - 1) {
        let prevChord = chordProgression[chordProgression.length - 1];
        let noteLength = timeSig.eighthsPerMeasure;
        // The last chord must be "1"
        const nextChord = {
          chord: chords["1"],
          length: noteLength,
          triadDegrees: chords["1"].triadNotes,
        };
        let bassNoteToAdd = bassRangeNoteList
          .filter((note) => note.degree === chords["1"].root)
          .filter(
            (note) =>
              Math.abs(note.pitchValue - prevBassNote.pitchValue) <= newMaxSkip
          );
        if (bassNoteToAdd.length > 0) {
          bassNoteArray.push(bassNoteToAdd[0]);
          chordProgression.push(nextChord);
        } else {
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          console.log("chordGenFails ", chordGenFails);
          break;
        }
      } else {
        let prevChord = chordProgression[chordProgression.length - 1];
        prevBassNote = bassNoteArray[i - 1];
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter(
            (chord: { name: string; weight: number }) =>
              bassDegrees
                .map((note) => note.degree)
                .includes(chords[chord.name].root)
          );

        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          console.log(
            `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
          );

          chordGenFails++;
          console.log("chordGenFails ", chordGenFails);
          break;
        } else {
          let nextChordInner = getRandomByWeight(
            nextChordPossibilities,
            chords
          );
          if (nextChordInner === null) {
            chordGenFails++;
            break;
          } else {
            let nextChordName = nextChordInner.name;
            let nextChord = {
              chord: chords[nextChordName],
              length: randNoteLengths[i],
              triadDegrees: chords[nextChordName].triadNotes,
            };
            let bassNoteToAdd = bassRangeNoteList
              .filter((note) => note.degree === chords[nextChordName].root)
              .filter(
                (note) =>
                  Math.abs(note.pitchValue - prevBassNote.pitchValue) <=
                  newMaxSkip
              );
            if (bassNoteToAdd.length > 0) {
              bassNoteArray.push(bassNoteToAdd[0]);
              chordProgression.push(nextChord);
            } else {
              console.log(
                `No valid progression found for pre chord ${prevChord.chord.name} index ${i}`
              );
              chordGenFails++;
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

  return [chordProgression, bassNoteArray];
}

function createNoteList(tonic: string, numOfNotes: number) {
  var keyLetter = tonic[0].toUpperCase();
  var noteList = [];
  var octave = 0;
  var notes = ["C", "D", "E", "F", "G", "A", "B"];
  var indexOfOrigin = notes.indexOf(keyLetter);
  var index = notes.indexOf(keyLetter);

  var degree = 0;

  for (var i = 0; i < numOfNotes; i++) {
    var note = "";
    if (degree >= 7) {
      degree = 0;
    }

    if (octave === 0) {
      note = notes[index] + ",,,";
    } else if (octave === 1) {
      note = notes[index] + ",,";
    } else if (octave === 2) {
      note = notes[index] + ",";
    } else if (octave === 3) {
      note = notes[index];
    } else if (octave === 4) {
      note = notes[index].toLowerCase();
    } else if (octave === 5) {
      note = notes[index].toLowerCase() + "'";
    }

    noteList.push({ name: note, degree: degree, pitchValue: i });

    index++;
    degree++;

    if (index >= notes.length) {
      index = 0;
      octave++;
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

function createNewSr(params: any) {
  var importChords = params.chords;
  var keyRendered = params.key;
  var maxSkip = params.maxSkip;
  var level = params.level;
  var timeSigRendered = params.timeSig;
  var tempo = params.bpm;
  var numOfMeasures = params.measures;
  var tonic = keyRendered[0];
  var partsObject = JSON.parse(JSON.stringify(params.partsObject));

  // add note symbol, scale degree, and pitch value to each partsObject
  for (const [partName, partObject] of Object.entries(partsObject.parts)) {
    partsObject.parts[partName].concatNoteString = "";
    partsObject.parts[partName].completeNoteObject = [];
    partsObject.parts[partName].noteArray = [];
    // also change selected range to just be selectedrange[level]
    partsObject.parts[partName].selectedRange =
      partsObject.parts[partName].selectedRange[level];
  }

  function generateChord(params: any) {
    // get key
    var key = keyRendered[0];
    var maxSkip = params.maxSkip;
    var noteIndex = params.noteIndex;
    var keyObject = keySignatures[keyRendered];
    var partObject = params.partObject;
    var randPartIndex = params.randPartIndex;
    var chordTriadCopy = params.chordTriadCopy;
    var baseNoteArray = params.baseNoteArray;
    var currentChord = params.renderedChordProgression[params.noteIndex];

    var partName = Object.keys(partObject.parts)[randPartIndex];
    var partOrder = partObject.parts[partName].order;

    var scaleType = "Major";
    var generatedNote = "";

    var chordNoteObject: {
      partName: string;
      noteLength: number;
      name: string;
      degree: number;
      pitchValue: number;
    } = { partName: "", noteLength: 0, name: "", degree: 0, pitchValue: 0 };

    var noteLength = currentChord.length;
    var scaleDegreeToAdd: number = 0;
    var singlePartObject =
      partObject.parts[Object.keys(partObject.parts)[randPartIndex]];

    var prevNote: { pitchValue: number; name: string; degree: number } = {
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

    // var tonic: any = key;
    var minRange = noteList.findIndex(
      (note) => note.name === baseNoteArray[singlePartObject.selectedRange[0]]
    );
    // if min range not found, set to 0
    if (minRange === -1) {
      minRange = 0;
    }

    var maxRange = noteList.findIndex(
      (note) => note.name === baseNoteArray[singlePartObject.selectedRange[1]]
    );

    var rangeNoteList = noteList.slice(minRange, maxRange);

    if (keyRendered.includes("m")) {
      scaleType = "Minor";
    }

    var randomCloseNote: { name: string; degree: number; pitchValue: number } =
      { name: "", degree: 0, pitchValue: 0 };

    if (singlePartObject.order === 0) {
      scaleDegreeToAdd = renderedChordProgression[noteIndex].chord.root;
      var rangeNoteListFilter = rangeNoteList.filter(
        (note) => note.degree === scaleDegreeToAdd
      );
      if (prevNote.pitchValue === 0) {
        randomCloseNote =
          rangeNoteListFilter[
            Math.floor(Math.random() * rangeNoteListFilter.length)
          ];
      } else {
        // pick the closest note to the previous note
        randomCloseNote = rangeNoteListFilter.reduce((prev, curr) =>
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
          (note) => note.degree === scaleDegreeToAdd
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
          Object.keys(partsObject.parts).forEach((part: any) => {
            let degreeToCheck =
              partsObject.parts[part].chordNoteObject[noteIndex - 1].degree;
            if (
              degreeToCheck !== undefined &&
              degreeToCheck !== prevNote.degree
            ) {
              otherDegreesInChord.push(degreeToCheck);
            }
            if (Math.abs(degreeToCheck - prevNote.degree) % 8 === 4) {
              params.otherPartNotes.forEach((note: any) => {
                // check if that part has a next note
                if (note.partName === part) {
                  // make sure it is not the same note as previous note
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

        // let prevNoteDegree = prevNote.degree;

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
          maxSkip = 1;
        }

        var rangeNoteListFilter = rangeNoteList.filter(
          (note) =>
            chordTriadCopy.includes(note.degree) &&
            (bannedParFifthDegree === null ||
              note.degree !== bannedParFifthDegree) &&
            Math.abs(note.pitchValue - prevNote.pitchValue) <= maxSkip
        );
        if (rangeNoteListFilter.length === 0) {
          // you can repeat degrees
          rangeNoteListFilter = rangeNoteList.filter(
            (note) =>
              importChords[currentChord.chord.name].triadNotes.includes(
                note.degree
              ) &&
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
            (note) =>
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
        return false;
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
    };

    return chordNoteObject;
  }

  // Example usage:
  var numOfNotes = 40;
  var noteList = createNoteList(tonic, numOfNotes);
  const lowestPartName = Object.keys(partsObject.parts).reduce((prev, curr) =>
    partsObject.parts[prev].order < partsObject.parts[curr].order ? prev : curr
  );
  const bassNoteList = noteList.slice(
    noteList.findIndex(
      (note) =>
        note.name ===
        baseNoteArray[partsObject.parts[lowestPartName].selectedRange[0]]
    ),
    noteList.findIndex(
      (note) =>
        note.name ===
        baseNoteArray[partsObject.parts[lowestPartName].selectedRange[1]]
    )
  );

  var possibleLengths = [];
  var testTotal = timeSigRendered.eighthsPerMeasure;
  var fails = 0;
  while (testTotal > 1 && fails < 100) {
    console.log("genchord progression lengths ", fails);

    possibleLengths.push(testTotal);
    testTotal -= 2;
  }
  const randNoteLengths = generateRandomCombination(
    possibleLengths,
    timeSigRendered.eighthsPerMeasure * numOfMeasures,
    timeSigRendered.eighthsPerMeasure
  );

  const [renderedChordProgression, bassGenNoteArray] = generateChordProgression(
    timeSigRendered,
    numOfMeasures,
    bassNoteList,
    maxSkip,
    randNoteLengths,
    importChords
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

  while (totalLoopFails < maxTotalLoopFails) {
    let allPartsFails = 0;
    let noteIndex = 0;

    // Reset chordNoteObjects
    for (const partName in partsObject.parts) {
      partsObject.parts[partName].chordNoteObject = [];
    }

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
      // Shuffle the remaining elements using the Fisher-Yates shuffle algorithm
      // for (let i = result.length - 1; i > 0; i--) {
      //   const j = Math.floor(Math.random() * (i + 1));
      //   [result[i], result[j]] = [result[j], result[i]];
      // }
      for (let i = partIndexArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [partIndexArray[i], partIndexArray[j]] = [
          partIndexArray[j],
          partIndexArray[i],
        ];
      }
      partIndexArray.unshift(bassRandIndex);

      // Create a copy of the triad
      let chordTriadCopy = [
        ...importChords[
          renderedChordProgression[chordProgressionIndex].chord.name
        ].triadNotes,
      ];
      // take the bass degree out of chordTriadCopy
      let baseChordDegree = bassGenNoteArray[noteIndex].degree;
      chordTriadCopy.splice(chordTriadCopy.indexOf(baseChordDegree), 1);

      let chordObjectsToAdd = [];
      let noteArrayToCheck = Array(Object.keys(partsObject.parts).length).fill(
        0
      );

      let singlePartFails = 0;
      let success = true; // Track success of this iteration

      for (let i = 0; i < partIndexArray.length; i++) {
        if (chordTriadCopy.length === 0) {
          chordTriadCopy = [
            ...importChords[
              renderedChordProgression[chordProgressionIndex].chord.name
            ].triadNotes,
          ];
        }

        let genChordParams = {
          key: keyRendered,
          timeSig: timeSigRendered,
          maxSkip: maxSkip,
          tonic: tonic,
          noteIndex: noteIndex,
          baseNoteArray: baseNoteArray,
          chordTriadCopy: chordTriadCopy,
          otherPartNotes: chordObjectsToAdd,
          noteList: noteList,
          partObject: partsObject,
          partIndexArray: partIndexArray,
          randPartIndex: partIndexArray[i],
          partName: Object.keys(partsObject.parts)[partIndexArray[i]],
          renderedChordProgression: renderedChordProgression,
        };

        let chordObjectToAdd: any = {};
        singlePartFails = 0;
        while (singlePartFails < maxSinglePartFails) {
          if (i === 0) {
            chordObjectToAdd = {
              partName: Object.keys(partsObject.parts)[partIndexArray[i]],
              noteLength: randNoteLengths[noteIndex],
              name: bassGenNoteArray[noteIndex].name,
              degree: bassGenNoteArray[noteIndex].degree,
              pitchValue: bassGenNoteArray[noteIndex].pitchValue,
            };
          } else {
            chordObjectToAdd = generateChord(genChordParams);
          }
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
        let partName = Object.keys(partsObject.parts)[partIndexArray[partNum]];
        if (!partsObject.parts[partName].chordNoteObject) {
          console.error(
            "Error: chordNoteObject is undefined for part",
            partName
          );
          continue;
        }
        partsObject.parts[partName].chordNoteObject.push(
          chordObjectsToAdd[partNum]
        );
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
      // add linrear index to each chordNoteObject
      partsObject.parts[
        Object.keys(partsObject.parts)[partIndex]
      ].chordNoteObject[chordNoteIndex].noteLinearIndex = noteLinearIndex;
      // add the note to the completeNoteObject for each length of the note and add a noteLinearIndex
      for (
        var i = 0;
        i <
        partsObject.parts[Object.keys(partsObject.parts)[partIndex]]
          .chordNoteObject[chordNoteIndex].noteLength;
        i++
      ) {
        var newNote = false;
        if (i === 0) {
          newNote = true;
        }
        var noteLength =
          partsObject.parts[Object.keys(partsObject.parts)[partIndex]]
            .chordNoteObject[chordNoteIndex].noteLength;
        partsObject.parts[
          Object.keys(partsObject.parts)[partIndex]
        ].completeNoteObject.push({
          name: partsObject.parts[Object.keys(partsObject.parts)[partIndex]]
            .chordNoteObject[chordNoteIndex].name,
          noteLength: noteLength,
          noteLinearIndex: noteLinearIndex,
          newNote: newNote,
        });
        noteLinearIndex++;
      }
    }
  }

  function filterAccidentals(params: any) {
    const eighthsPerMeasure = params.eighthsPerMeasure;
    let partsObject = params.partsObject;
    let eighthCounter = 0;
    const key = params.key;

    // loop through the parts object
    Object.keys(partsObject.parts).forEach((partName) => {
      // loop through the completeNoteObject
      for (
        var i = 0;
        i < partsObject.parts[partName].completeNoteObject.length;
        i++
      ) {
        eighthCounter +=
          partsObject.parts[partName].completeNoteObject[0].noteLength;

        // check if there is an accidental
        var accidental =
          partsObject.parts[partName].completeNoteObject[i].name.match(
            /[_^=]/g
          );
        if (
          partsObject.parts[partName].completeNoteObject[i].name.match(/[_^=]/g)
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
        if (eighthCounter % eighthsPerMeasure === 0) {
          accidental = null;
          accidentalType = null;
          noteNameWithAccidental = "";
        }
      }
    });
  }

  filterAccidentals({
    eighthsPerMeasure: timeSigRendered.eighthsPerMeasure,
    partsObject: partsObject,
    key: keyRendered,
  });

  // loop through the parts object
  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    // get the part name
    var partName = Object.keys(partsObject.parts)[i];
    var sumOfNotes = 0;
    // loop through each chord
    for (
      var j = 0;
      j <
      partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject
        .length;
      j++
    ) {
      // make sure we aren't on last note
      if (
        j !==
          partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject
            .length -
            1 &&
        j !== 0
      ) {
        var prevNoteIndex = j;
        var nextNoteIndex = j + 1;

        var noteComboToAdd = nonChordToneGenerator(
          prevNoteIndex,
          partName,
          partsObject,
          noteList
        );

        // run each note through passing tone generator
        partsObject.parts[Object.keys(partsObject.parts)[i]].concatNoteString +=
          noteComboToAdd;

        sumOfNotes +=
          partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject[
            j
          ].noteLength;

        if (sumOfNotes % 8 === 0) {
          partsObject.parts[
            Object.keys(partsObject.parts)[i]
          ].concatNoteString += "|";
        }
      }
      // add a double barline at the end
      else if (
        j ===
        partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject
          .length -
          1
      ) {
        partsObject.parts[Object.keys(partsObject.parts)[i]].concatNoteString +=
          partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject[
            j
          ].name +
          partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject[
            j
          ].noteLength;
        partsObject.parts[Object.keys(partsObject.parts)[i]].concatNoteString +=
          "|";
      }
    }
  }

  function createConcatString(partsObject: any) {
    // loop through parts
    Object.keys(partsObject.parts).forEach((partName) => {
      var concatString = "";
      var totalNoteValue = 0;
      // loop through each note
      for (
        var i = 0;
        i < partsObject.parts[partName].completeNoteObject.length;
        i++
      ) {
        // check if previous notelength is a 3

        if (partsObject.parts[partName].completeNoteObject[i].newNote) {
          concatString +=
            partsObject.parts[partName].completeNoteObject[i].name +
            partsObject.parts[partName].completeNoteObject[i].noteLength;

          if (
            i !== 0 &&
            partsObject.parts[partName].completeNoteObject[i - 1].noteLength ===
              3
          ) {
            concatString += " ";
          }

          totalNoteValue +=
            partsObject.parts[partName].completeNoteObject[i].noteLength;
          if (totalNoteValue % timeSigRendered.eighthsPerMeasure === 0) {
            concatString += "|";
          }
        }
      }
      partsObject.parts[partName].concatNoteString = concatString;
    });
    return partsObject;
  }

  partsObject = createConcatString(partsObject);

  // get the first entry of the generatedPartTunes object
  var headerString = "";
  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    // find the clef by matching the name to the part name object
    var partName = Object.keys(partsObject.parts)[i];
    var smallName = partsObject.parts[partName].smallName;
    var clef = partsObject.parts[Object.keys(partsObject.parts)[i]].clef;
    var middleString = "";
    if (clef === "treble-8") {
      middleString = "octave=1";
    }
    headerString += `V:${smallName} clef=${clef} name="${partName}" snm="${smallName}" ${middleString}\n`;
  }

  var tuneBody = "";

  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    var partName = Object.keys(partsObject.parts)[i];
    var smallName = partsObject.parts[partName].smallName;

    tuneBody += `[V:${smallName}] ${partsObject.parts[partName].concatNoteString}] \n`;
  }

  var scoreString = "%%score ";
  Object.keys(partsObject.parts).forEach((partName) => {
    scoreString += partsObject.parts[partName].smallName + " ";
  });
  scoreString += "\n";

  var renderedString =
    `X:1 \n` +
    `T:SATB UIL Sight Reading \n` +
    `C:Blaine Cowen \n` +
    `M:${timeSigRendered.name}\n` +
    `L:1/8\n` +
    `Q:1/4=76 \n` +
    `${scoreString}` +
    `${headerString}` +
    `K: ${keyRendered} \n` +
    `%            End of header, start of tune body: \n` +
    `${tuneBody}`;

  console.log(renderedString);
  console.log(partsObject);

  return [renderedString, renderedChordProgression];
}

export { createNewSr };
