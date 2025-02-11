import { chords as allChords } from "../resources/chords";
import { type Rhythm } from "../resources/rhythms";

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

function generateRandomRhythmCombination(
  rhythmArray: Rhythm[],
  targetSum: number,
  tsPerMeasure: number
): { numbers: number[]; rhythmObjects: Rhythm[] } {
  let numberResult: number[] = [];
  let rhythmResult: Rhythm[] = [];
  let currentSum = 0;
  let currentCombination: number[] = [];

  let totalRuns = 0;

  // sort array desc
  rhythmArray.sort((a, b) => b.totalValue - a.totalValue);

  for (let i = 0; i < rhythmArray.length; i++) {
    if (rhythmArray[i].totalValue <= targetSum) {
      // ass weight to each rhythm
      rhythmArray[i].weight = rhythmArray[i].totalValue;
    }
  }
  // // get the current sum of the array
  // currentSum = rhythmArray.reduce((a, b) => a + b.totalValue, 0);

  // make a copy of rhythm array to randomize
  let rhythmArrayToRandom = [...rhythmArray];

  // let testMeasureSum = 0;
  while (currentSum !== targetSum && totalRuns < 1000) {
    // check if totalruns is getting high
    if (totalRuns >= 900) {
      console.log("Error: Could not find a valid combination");
    }
    let measureArray: number[] = [];
    let measureRhythmArr: Rhythm[] = [];

    let measureRhythm = 0;

    let measureRuns = 0;

    const maxMeasureRuns = 10;

    while (measureRhythm < tsPerMeasure) {
      let randomRhythm: Rhythm | null = null;
      // check if last measure
      if (currentSum === targetSum - rhythmArray[0].totalValue) {
        randomRhythm = rhythmArray[0];
      } else {
        // make sure array is there
        if (rhythmArrayToRandom.length > 0) {
          let filteredArrayToRandom = rhythmArrayToRandom.filter(
            (element) => element.totalValue + measureRhythm <= tsPerMeasure
          );

          randomRhythm = getRandomRhythmByWeight(filteredArrayToRandom);
        }
      }

      let testMeasureArray = [...measureArray];
      if (randomRhythm !== null) {
        testMeasureArray.push(randomRhythm.totalValue);
        let testMeasureSum = testMeasureArray.reduce((a, b) => a + b, 0);
        if (testMeasureSum <= tsPerMeasure) {
          for (let i = 0; i < randomRhythm.abcValue.length; i++) {
            measureArray.push(parseInt(randomRhythm.abcValue[i]));
          }

          measureRhythmArr.push(randomRhythm);

          measureRhythm += randomRhythm.totalValue;
        }
      } else {
        measureRuns++;
        if (measureRuns >= maxMeasureRuns) {
          break;
        }
      }
    }
    let testCompleteArray = [...currentCombination];
    let testCompleteRhythmArr = [...rhythmResult];
    // add measure array to end of current combination
    testCompleteArray = testCompleteArray.concat(measureArray);
    testCompleteRhythmArr = testCompleteRhythmArr.concat(measureRhythmArr);

    // get the current sum of the array
    let testSum = testCompleteArray.reduce((a, b) => a + b, 0);
    // if the sum is less than the target sum, set the current combination to the test array
    if (testSum <= targetSum) {
      currentCombination = testCompleteArray;
      currentSum = testSum;
      rhythmResult = testCompleteRhythmArr;
    }

    // increment the runs
    totalRuns++;
  }
  if (totalRuns >= 1000) {
    console.log("Error: Could not find a valid combination");
    return { numbers: [], rhythmObjects: [] };
  }

  numberResult = currentCombination;
  // Choose a random element from the array
  console.log("random combination ");
  console.log(numberResult);

  return { numbers: numberResult, rhythmObjects: rhythmResult };
}

function generateChordProgression(
  timeSig: any,
  numOfMeasures: any,
  bassRangeNoteList: Note[],
  maxSkip: number,
  randNoteLengths: number[],
  chords: ChordSet,
  scaleDegrees: number[]
) {
  let bassNoteArray = [];
  let newMaxSkip = maxSkip;

  // const tonicNotes = bassRangeNoteList.filter((note) => note.degree === 0);
  // bassNoteArray.push(tonicNotes[Math.floor(Math.random() * tonicNotes.length)]);

  // make sure that in chords[objects].nextChordPossibilities, the chord name is in the chords object
  for (const chord in chords) {
    if (chords[chord].nextChordPossibilities) {
      chords[chord].nextChordPossibilities = chords[
        chord
      ].nextChordPossibilities.filter(
        (chord: { name: string }) => chords[chord.name]
      );
    }
  }

  var chordGenFails = 0;

  var numOfChords = randNoteLengths.length;

  bassRangeNoteList = bassRangeNoteList.filter((note) =>
    scaleDegrees.includes(note.degree)
  );

  // pick a random note from bassRangeNoteList degree 0,2,4
  let tonicNotes = bassRangeNoteList.filter((note) =>
    [0, 2, 4].includes(note.degree)
  );

  bassNoteArray.push(tonicNotes[Math.floor(Math.random() * tonicNotes.length)]);

  let prevBassNote = bassNoteArray[0];
  let prevChord = {
    chord: chords["1"],
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
          chord: chords["1"],
          length: randNoteLengths[i],
          triadDegrees: chords["1"].triadNotes,
        };

        chordProgression.push(firstChord);
      } else if (i === numOfChords - 3) {
        // The third-to-last chord must lead to 5
        prevChord = chordProgression[chordProgression.length - 1];
        let nextChordPossibilities =
          prevChord.chord.nextChordPossibilities.filter(
            (chord: { name: string; weight: number }) => {
              if (!chords[chord.name]) {
                console.warn(`Chord ${chord.name} not found in chords object`);
                return false;
              }
              return bassDegrees
                .map((note) => note.degree)
                .some((degree) =>
                  chords[chord.name].triadNotes.includes(degree)
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
            chord: chords[nextChordName],
            length: randNoteLengths[i],
            triadDegrees: chords[nextChordName].triadNotes,
          };
          let bassNoteToAdd = bassDegrees
            .filter((note) =>
              chords[nextChordName].triadNotes.includes(note.degree)
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
            if (!chords[chord.name]) return false;
            return (
              (chords[chord.name].type === "dominant" ||
                chords[chord.name].type === "predominant") &&
              bassDegrees
                .map((note) => note.degree)
                .some((degree) =>
                  chords[chord.name].triadNotes.includes(degree)
                )
            );
          });
        if (nextChordPossibilities.length === 0) {
          // if no dominant chords are found, try tonic chords
          nextChordPossibilities =
            prevChord.chord.nextChordPossibilities.filter((chord) => {
              if (!chords[chord.name]) return false;
              return (
                (chords[chord.name].type === "dominant-inversion" ||
                  chords[chord.name].type === "tonic") &&
                bassDegrees
                  .map((note) => note.degree)
                  .some((degree) =>
                    chords[chord.name].triadNotes.includes(degree)
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
            chord: chords[nextChordName],
            length: randNoteLengths[i],
            triadDegrees: chords[nextChordName].triadNotes,
          };
          let bassNoteToAdd = bassDegrees
            .filter((note) =>
              chords[nextChordName].triadNotes.includes(note.degree)
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
          chord: chords["1"],
          length: randNoteLengths[i],
          triadDegrees: chords["1"].triadNotes,
        };
        let bassNoteToAdd = bassDegrees
          .filter((note) => chords["1"].triadNotes.includes(note.degree))
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
            if (!chords[chord.name]) return false;
            return bassDegrees
              .map((note) => note.degree)
              .some((degree) => chords[chord.name].triadNotes.includes(degree));
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
              chord: chords[nextChordName],
              length: randNoteLengths[i],
              triadDegrees: chords[nextChordName].triadNotes,
            };
            let bassNoteToAdd = bassDegrees
              .filter((note) =>
                chords[nextChordName].triadNotes.includes(note.degree)
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
  var clef = params.clef;
  var importChords = params.chords;
  var keyRendered = params.key;
  var maxSkip = params.maxSkip;
  var timeSigRendered = params.timeSig;
  var selectedRange = [params.range.min, params.range.max + 1];
  var tempo = params.bpm;
  var numOfMeasures = params.measures;
  var rhythms = params.rhythms;
  var scaleDegrees: number[] = Array.from(params.scaleDegrees);
  // subtract 1 from each scale degree
  scaleDegrees = scaleDegrees.map((degree: number) => degree - 1);

  var tonic = keyRendered[0];
  var partsObject = JSON.parse(JSON.stringify(params.partsObject));

  // add selected range to partsObject
  partsObject.parts.Unison.selectedRange = selectedRange;

  // filter chords to only include chords that are in the chords object
  importChords = Object.fromEntries(
    Object.entries(allChords).filter(([name]) => importChords.includes(name))
  );

  // and change all next chord possibilities to only include chords that are in the chords object
  for (const chord in importChords) {
    importChords[chord].nextChordPossibilities = importChords[
      chord
    ].nextChordPossibilities.filter((chord: { name: string }) =>
      Object.keys(importChords).includes(chord.name)
    );
  }

  // add note symbol, scale degree, and pitch value to each partsObject
  for (const [partName, partObject] of Object.entries(partsObject.parts)) {
    partsObject.parts[partName].concatNoteString = "";
    partsObject.parts[partName].completeNoteObject = [];
    partsObject.parts[partName].noteArray = [];
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
    var bassGenNoteArray = params.bassGenNoteArray;

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
      scaleDegreeToAdd = bassGenNoteArray[noteIndex].degree;
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
          // maxSkip = 1;
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
    };

    return chordNoteObject;
  }

  // Example usage:
  var numOfNotes = 40;
  var noteList = createNoteList(tonic, numOfNotes);
  const unisonNoteList = noteList.slice(
    noteList.findIndex((note) => note.name === baseNoteArray[selectedRange[0]]),
    noteList.findIndex((note) => note.name === baseNoteArray[selectedRange[1]])
  );

  // var testTotal = timeSigRendered.tsPerMeasure;
  // var fails = 0;
  // while (testTotal > 1 && fails < 100) {
  //   console.log("genchord progression lengths ", fails);

  //   possibleLengths.push(testTotal);
  //   testTotal -= 2;
  // }
  const randNoteLengthsResult: { numbers: number[]; rhythmObjects: Rhythm[] } =
    generateRandomRhythmCombination(
      rhythms,
      timeSigRendered.tsPerMeasure * numOfMeasures,
      timeSigRendered.tsPerMeasure
    );

  const randNoteLengths = randNoteLengthsResult.numbers;
  const randRhythmObjects = randNoteLengthsResult.rhythmObjects;

  const [renderedChordProgression, bassGenNoteArray] = generateChordProgression(
    timeSigRendered,
    numOfMeasures,
    unisonNoteList,
    maxSkip,
    randNoteLengths,
    importChords,
    scaleDegrees as any
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
          bassGenNoteArray: bassGenNoteArray,
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
      // add linear index to each chordNoteObject
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
        if (tsCounter % tsPerMeasure === 0) {
          accidental = null;
          accidentalType = null;
          noteNameWithAccidental = "";
        }
      }
    });
  }

  filterAccidentals({
    tsPerMeasure: timeSigRendered.tsPerMeasure,
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

        sumOfNotes +=
          partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject[
            j
          ].noteLength;

        if (sumOfNotes % 8 === 0) {
          partsObject.parts[
            Object.keys(partsObject.parts)[i]
          ].concatNoteString += "|";
        }
        // if (sumOfNotes % 16 === 0) {
        //   partsObject.parts[
        //     Object.keys(partsObject.parts)[i]
        //   ].concatNoteString += "\n";
        // }
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
        i < partsObject.parts[partName].chordNoteObject.length;
        i++
      ) {
        // check if previous notelength is a 3
        let addSpace = false;
        // find the index of the randrhythmobject.abcValue recursively
        let matchRIndex = 0;

        for (let r = 0; r < randRhythmObjects.length; r++) {
          if (addSpace) {
            break;
          }
          for (let s = 0; s < randRhythmObjects[r].abcValue.length; s++) {
            if (matchRIndex !== i) {
              matchRIndex++;
            }
            if (matchRIndex === i) {
              // check if we are the last of the array
              if (s === randRhythmObjects[r].abcValue.length - 1) {
                addSpace = true;
                break;
              } else {
                addSpace = false;
                break;
              }
            }
          }
          if (matchRIndex === i) {
            break;
          }
        }

        if (addSpace) {
          concatString += " ";
        }

        concatString +=
          partsObject.parts[partName].chordNoteObject[i].name +
          partsObject.parts[partName].chordNoteObject[i].noteLength;

        // if (
        //   i !== 0 &&
        //   partsObject.parts[partName].chordNoteObject[i - 1].noteLength ===
        //     3
        // ) {
        //   concatString += " ";
        // }

        totalNoteValue +=
          partsObject.parts[partName].chordNoteObject[i].noteLength;
        if (totalNoteValue % timeSigRendered.tsPerMeasure === 0) {
          concatString += "|";
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
    var middleString = "";
    if (clef === "treble-8") {
      middleString = "octave=1";
    }
    headerString += `V:${smallName} name="${partName}" snm="${smallName}" ${middleString}\n`;
  }

  var tuneBody = "";

  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    var partName = Object.keys(partsObject.parts)[i];
    var smallName = partsObject.parts[partName].smallName;

    tuneBody += `[V:1] ${partsObject.parts[partName].concatNoteString}] \n`;
  }

  var scoreString = "%%score ";
  Object.keys(partsObject.parts).forEach((partName) => {
    scoreString += partsObject.parts[partName].smallName + " ";
  });
  scoreString += "\n";

  var renderedString =
    `X:1 \n` +
    `M:${timeSigRendered.name}\n` +
    `L:1/32\n` +
    `Q:1/4=${tempo} \n` +
    `${scoreString}` +
    `${headerString}` +
    `K: ${keyRendered} clef=${clef} \n` +
    `%            End of header, start of tune body: \n` +
    `${tuneBody}`;

  console.log(renderedString);
  console.log(partsObject);

  return [renderedString, renderedChordProgression];
}

export { createNewSr };
