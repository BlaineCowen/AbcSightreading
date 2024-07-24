import type { ChordType } from "abcjs";
import Index from "../pages/index.astro";
import { render } from "astro/compiler-runtime";
import { nonChordToneGenerator } from "./nonChordToneGen";
import { get } from "svelte/store";

interface AbcObject {
  key: string;
  timeSig: string;
  parts: string;
  form: string;
  bpm: number;
  measures: number;
}

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

var chords: {
  [key: string]: {
    name: string;
    triadNotes: number[];
    root: number;
    nextChordPossibilities: { name: string; weight: number }[];

    sharpScaleDegree: number | undefined;
    flatScaleDegree: number | undefined;
  };
} = {
  "1": {
    name: "1",
    triadNotes: [0, 2, 4],
    root: 0,
    nextChordPossibilities: [
      { name: "1", weight: 10 },
      { name: "2", weight: 12 },
      { name: "3", weight: 1 },
      { name: "4", weight: 28 },
      { name: "5", weight: 41 },
      { name: "6", weight: 9 },
      { name: "7", weight: 6 },
      { name: "5/5", weight: 10 },
      { name: "5/6", weight: 10 },
      { name: "5/4", weight: 10 },
      { name: "m4", weight: 10 },
      { name: "1-7", weight: 10 },
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "2": {
    name: "2",
    root: 1,
    triadNotes: [1, 3, 5],
    nextChordPossibilities: [
      { name: "2", weight: 10 },
      { name: "5", weight: 72 },
      { name: "7", weight: 26 },
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "3": {
    name: "3",
    root: 2,
    triadNotes: [2, 4, 6],
    nextChordPossibilities: [
      { name: "4", weight: 53 },
      { name: "5", weight: 6 },
      { name: "6", weight: 32 },
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "4": {
    name: "4",
    root: 3,
    triadNotes: [3, 5, 0],
    nextChordPossibilities: [
      { name: "1", weight: 22 }, // Adjust the weight as needed
      { name: "2", weight: 13 }, // Adjust the weight as needed
      { name: "5", weight: 39 },
      { name: "7", weight: 23 }, // Adjust the weight as needed
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "5": {
    name: "5",
    root: 4,
    triadNotes: [4, 6, 1],
    nextChordPossibilities: [
      { name: "1", weight: 83 },
      { name: "6", weight: 17 },
      { name: "5/5", weight: 10 },
      { name: "5/6", weight: 10 },
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "6": {
    name: "6",
    root: 5,
    triadNotes: [5, 0, 2],
    nextChordPossibilities: [
      { name: "1", weight: 12 },
      { name: "2", weight: 30 },
      { name: "3", weight: 8 },
      { name: "4", weight: 7 },
      { name: "7", weight: 9 },
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "7": {
    name: "7",
    root: 6,
    triadNotes: [6, 1, 3],
    nextChordPossibilities: [
      { name: "1", weight: 90 }, // Adjust the weight as needed
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "5/5": {
    name: "5/5",
    root: 1,
    triadNotes: [1, 3, 5],
    nextChordPossibilities: [{ name: "5", weight: 100 }],
    sharpScaleDegree: 3,
    flatScaleDegree: undefined,
  },
  "5/6": {
    name: "5/6",
    root: 2,
    triadNotes: [2, 4, 6],
    nextChordPossibilities: [{ name: "6", weight: 100 }],
    sharpScaleDegree: 4,
    flatScaleDegree: undefined,
  },
  "5/4": {
    name: "5/4",
    root: 6,
    triadNotes: [6, 1, 3],
    nextChordPossibilities: [{ name: "4", weight: 100 }],
    sharpScaleDegree: 1,
    flatScaleDegree: undefined,
  },
  m4: {
    name: "m4",
    root: 3,
    triadNotes: [3, 5, 0],
    nextChordPossibilities: [{ name: "1", weight: 100 }],
    sharpScaleDegree: undefined,
    flatScaleDegree: 5,
  },
  "1-7": {
    name: "1-7",
    root: 0,
    triadNotes: [0, 2, 4, 6],
    nextChordPossibilities: [{ name: "4", weight: 100 }],
    sharpScaleDegree: undefined,
    flatScaleDegree: 6,
  },
};

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

function checkForIllegalVoiceLeading(arr: number[]) {
  var sortedArr = [...arr].sort((a, b) => a - b);
  if (sortedArr.join(",") === arr.join(",")) {
    return true;
  } else {
    return false;
  }
}

function getRandomByWeight(arr: { name: any; weight: number }[]) {
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

  let runs = 0;

  for (let i = 0; i < array.length; i++) {
    if (array[i] <= targetSum) {
      arrayToRandom.push({ name: array[i], weight: 10 / array[i] });
    }
  }
  // get the current sum of the array
  currentSum = array.reduce((a, b) => a + b, 0);

  while (currentSum !== targetSum || runs < 100) {
    let measureArray: number[] = [];
    let measureRhythm = 0;
    while (measureRhythm < eighthsPerMeasure) {
      let randomNumber = null;
      if (currentSum === targetSum - eighthsPerMeasure) {
        randomNumber = eighthsPerMeasure;
      } else {
        if (arrayToRandom.length > 0) {
          randomNumber = getRandomByWeight(arrayToRandom);

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
    runs++;
  }
  if (runs >= 1000) {
    console.log("Error: Could not find a valid combination");
    return [];
  }
  result = currentCombination;
  // Choose a random element from the array

  return result;
}

function generateChordProgression(timeSig: any, numOfMeasures: any) {
  var eighthsPerMeasure = timeSig.eighthsPerMeasure;
  var possibleLengths = [];
  var testTotal = eighthsPerMeasure;
  while (testTotal > 1) {
    possibleLengths.push(testTotal);
    testTotal -= 2;
  }
  var noteLength = 0;
  var randNoteLengths = generateRandomCombination(
    possibleLengths,
    timeSig.eighthsPerMeasure * numOfMeasures,
    eighthsPerMeasure
  );
  // make last note a whole note
  randNoteLengths[randNoteLengths.length - 1] = eighthsPerMeasure;

  var numOfChords = randNoteLengths.length;

  var chordProgression: any[] = [];
  let validProgression = false;
  while (!validProgression) {
    chordProgression = [];

    for (let i = 0; i < numOfChords; i++) {
      if (i === 0) {
        const firstChord = {
          chord: chords["1"],
          length: randNoteLengths[i],
          triadDegrees: chords["1"].triadNotes,
        };

        chordProgression.push(firstChord);
      } else if (i === numOfChords - 3) {
        // The third-to-last chord must lead to 5
        const lastChord = chordProgression[chordProgression.length - 1];
        const nextChordPossibilities =
          lastChord.chord.nextChordPossibilities.filter(
            (chord: { name: string; weight: number }) =>
              chord.name === "1" || chord.name === "2" || chord.name === "4"
          );

        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          break;
        }

        const nextChordInner = getRandomByWeight(nextChordPossibilities);
        if (nextChordInner !== null) {
          const nextChordName = nextChordInner.name;
          const nextChord = {
            chord: chords[nextChordName],
            length: randNoteLengths[i],
            triadDegrees: chords[nextChordName].triadNotes,
          };

          chordProgression.push(nextChord);
        } else {
          break;
        }
      } else if (i === numOfChords - 2) {
        // The second-to-last chord must be "5"
        const nextChord = {
          chord: chords["5"],
          length: randNoteLengths[i],
          triadDegrees: chords["5"].triadNotes,
        };
        chordProgression.push(nextChord);
      } else if (i === numOfChords - 1) {
        noteLength = eighthsPerMeasure;
        // The last chord must be "1"
        const nextChord = {
          chord: chords["1"],
          length: noteLength,
          triadDegrees: chords["1"].triadNotes,
        };
        chordProgression.push(nextChord);
      } else {
        const lastChord = chordProgression[chordProgression.length - 1];
        const nextChordInner = getRandomByWeight(
          lastChord.chord.nextChordPossibilities
        );
        if (nextChordInner === null) {
          break;
        } else {
          const nextChordName = nextChordInner.name;
          const nextChord = {
            chord: chords[nextChordName],
            length: randNoteLengths[i],
            triadDegrees: chords[nextChordName].triadNotes,
          };
          chordProgression.push(nextChord);
        }
      }
    }

    if (chordProgression.length === numOfChords) {
      validProgression = true;
    }
  }

  return chordProgression;
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
      note = notes[index] + ",,";
    } else if (octave === 1) {
      note = notes[index] + ",";
    } else if (octave === 2) {
      note = notes[index];
    } else if (octave === 3) {
      note = notes[index].toLowerCase();
    } else if (octave === 4) {
      note = notes[index].toLowerCase() + "'";
    } else if (octave === 5) {
      note = notes[index].toLowerCase() + "''";
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

function createNewSr(params: any) {
  function generateChord(params: any) {
    // get key
    var key = keyRendered[0];
    var keyObject = keySignatures[keyRendered];
    var partObject = params.partObject;
    var randPartIndex = params.randPartIndex;
    var baseNoteArray = params.baseNoteArray;
    var currentChord = params.renderedChordProgression[params.noteIndex];

    var partName = Object.keys(partObject.parts)[randPartIndex];
    var partOrder = partObject.parts[partName].order;

    var scaleType = "Major";
    var generatedNote = "";
    var chordNoteObject: {
      noteLength: number;
      name: string;
      degree: number;
      pitchValue: number;
    } = { noteLength: 0, name: "", degree: 0, pitchValue: 0 };
    var noteLength = currentChord.length;
    var scaleDegreeToAdd: number = 0;
    var singlePartObject =
      partObject.parts[Object.keys(partObject.parts)[randPartIndex]];

    var aboveIndex = baseNoteArray.length - 1;
    var belowIndex = 0;

    var prevNote: { pitchValue: number } = { pitchValue: 0 };
    var nextNote = {};

    if (singlePartObject.chordNoteObject.length > 0) {
      prevNote =
        singlePartObject.chordNoteObject[
          singlePartObject.chordNoteObject.length - 1
        ];
    }

    var tonic: any = key;
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

    if (partOrder === 0) {
      aboveIndex =
        partObject.parts[Object.keys(partObject.parts)[1]].noteArray[noteIndex];
    } else if (
      partOrder > 0 &&
      partOrder < Object.keys(partObject.parts).length - 1
    ) {
      aboveIndex =
        partObject.parts[Object.keys(partObject.parts)[partOrder + 1]]
          .noteArray[noteIndex];
      belowIndex =
        partObject.parts[Object.keys(partObject.parts)[partOrder - 1]]
          .noteArray[noteIndex];
    } else if (partOrder === Object.keys(partObject.parts).length - 1) {
      belowIndex =
        partObject.parts[Object.keys(partObject.parts)[partOrder - 1]]
          .noteArray[noteIndex];
    }

    var rangeNoteList = noteList.slice(minRange, maxRange);

    if (keyRendered.includes("m")) {
      scaleType = "Minor";
    }
    if (singlePartObject.order === 0) {
      scaleDegreeToAdd = renderedChordProgression[noteIndex].chord.root;
    } else if (singlePartObject.order !== 0) {
      // pull a random number from triad copy and erase from list
      var randomIndex = Math.floor(Math.random() * chordTriadCopy.length);
      scaleDegreeToAdd = chordTriadCopy[randomIndex];

      chordTriadCopy.splice(chordTriadCopy.indexOf(scaleDegreeToAdd), 1);
    } else {
      // throw error
      console.log("error in order");
    }

    var possibleNotes = rangeNoteList.filter(
      (note) => note.degree === scaleDegreeToAdd
    );

    var closestPossibleNote = null;

    // find closest note to prev note
    if (prevNote.pitchValue !== 0) {
      closestPossibleNote = possibleNotes.reduce((prev, curr) =>
        Math.abs(curr.pitchValue - prevNote.pitchValue) <
        Math.abs(prev.pitchValue - prevNote.pitchValue)
          ? curr
          : prev
      );
    }

    if (closestPossibleNote) {
      generatedNote = closestPossibleNote.name;

      // find the index of the note in the original notesList
      var pitchValue = closestPossibleNote.pitchValue;
    } else {
      var randomPossibleNote = Math.floor(Math.random() * possibleNotes.length);

      generatedNote = possibleNotes[randomPossibleNote].name;

      // find the index of the note in the original notesList
      var pitchValue = possibleNotes[randomPossibleNote].pitchValue;
    }

    // see if it is a sharp or flat scale degree in hte chord
    var accidental = null;
    if (currentChord.sharpScaleDegree === scaleDegreeToAdd) {
      accidental = "^";
      if (keyObject.sharps?.indexOf(scaleDegreeToAdd) !== -1) {
        accidental = "^^";
      } else if (keyObject.flats?.indexOf(scaleDegreeToAdd) !== -1) {
        accidental = "=";
      }
    }
    if (currentChord.flatScaleDegree === scaleDegreeToAdd) {
      accidental = "_";
      if (keyObject.sharps?.indexOf(scaleDegreeToAdd) !== -1) {
        accidental = "=";
      } else if (keyObject.flats?.indexOf(scaleDegreeToAdd) !== -1) {
        accidental = "__";
      }
    }

    if (accidental) {
      generatedNote = accidental + generatedNote;
    }

    chordNoteObject = {
      noteLength: noteLength,
      name: generatedNote,
      degree: scaleDegreeToAdd,
      pitchValue: pitchValue,
    };

    return chordNoteObject;
  }

  var keyRendered = params.key;
  var timeSigRendered = params.timeSig;
  var notesToRender = params.notes;
  var tempo = params.bpm;
  var numOfMeasures = params.measures;
  var tonic = keyRendered[0];
  var partsObject = params.partsObject;
  // add note symbol, scale degree, and pitch value to each partsObject
  for (const [partName, partObject] of Object.entries(partsObject.parts)) {
    partsObject.parts[partName].concatNoteString = "";
    partsObject.parts[partName].completeNoteObject = [];
    partsObject.parts[partName].noteArray = [];
  }

  var renderedChordProgression = generateChordProgression(
    timeSigRendered,
    numOfMeasures
  );

  // Example usage:
  var numOfNotes = 40;
  var noteList = createNoteList(tonic, numOfNotes);
  var legalVoiceLeading = true;

  // make an array of 0's of length of the number of parts
  var arrToCheck = Array.from(
    Array(Object.keys(partsObject.parts).length).keys()
  );
  var partIndexArray: number[] = [];

  while (legalVoiceLeading) {
    // reset chordNoteObjects
    for (const [partName, partObject] of Object.entries(partsObject.parts)) {
      partsObject.parts[partName].chordNoteObject = [];
    }

    for (
      var noteIndex = 0;
      noteIndex < renderedChordProgression.length;
      noteIndex++
    ) {
      var chordProgressionIndex = noteIndex;

      // create index 0-x with x being the number of parts -1
      partIndexArray = Array.from(
        Array(Object.keys(partsObject.parts).length).keys()
      );
      // shuffle the array
      partIndexArray.sort(() => Math.random() - 0.5);

      var chordTriadCopy = [
        ...chords[renderedChordProgression[chordProgressionIndex].chord.name]
          .triadNotes,
      ];

      // create blank chordObjectToAdd
      var chordObjectsToAdd = [];
      var noteArrayToCheck = Array.from(
        Array(Object.keys(partsObject.parts).length).keys()
      );

      // loop through the array
      for (var i = 0; i < partIndexArray.length; i++) {
        // make an array of notes with length of parts

        if (chordTriadCopy.length === 0) {
          chordTriadCopy = [
            ...chords[
              renderedChordProgression[chordProgressionIndex].chord.name
            ].triadNotes,
          ];
        }

        var genChordParams = {
          key: keyRendered,
          timeSig: timeSigRendered,
          tonic: tonic,
          baseNoteArray: baseNoteArray,
          chordTriadCopy: chordTriadCopy,
          noteList: noteList,
          partObject: partsObject,
          partIndexArray: partIndexArray,
          randPartIndex: partIndexArray[i],
          partName: Object.keys(partsObject.parts)[partIndexArray[i]],
          noteIndex: noteIndex,
          renderedChordProgression: renderedChordProgression,
        };

        var chordObjectToAdd = generateChord(genChordParams);

        // add to array
        chordObjectsToAdd.push(chordObjectToAdd);

        var randPartIndex =
          partsObject.parts[Object.keys(partsObject.parts)[partIndexArray[i]]]
            .order;

        noteArrayToCheck[randPartIndex] = chordObjectToAdd.pitchValue;

        if (i === partIndexArray.length - 1) {
          // check for illegal voice leading
          var legalVoiceLeading = checkForIllegalVoiceLeading(noteArrayToCheck);

          if (!legalVoiceLeading) {
            noteIndex--;
            break;
          } else {
            // add to the complete note object
            for (var partNum = 0; partNum < partIndexArray.length; partNum++) {
              partsObject.parts[
                Object.keys(partsObject.parts)[partIndexArray[partNum]]
              ].chordNoteObject.push(chordObjectsToAdd[partNum]);
            }
          }
        }
      }
    }

    if (legalVoiceLeading) {
      break;
    }
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
          1
      ) {
        var prevNoteIndex = j;
        var nextNoteIndex = j + 1;

        console.log("prev note obj");
        console.log(prevNoteObj);

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
    Object.keys(partsObject.parts).forEach((partName) => {
      var concatString = "";
      var totalNoteValue = 0;
      for (
        var i = 0;
        i < partsObject.parts[partName].completeNoteObject.length;
        i++
      ) {
        if (partsObject.parts[partName].completeNoteObject[i].newNote) {
          concatString +=
            partsObject.parts[partName].completeNoteObject[i].name +
            partsObject.parts[partName].completeNoteObject[i].noteLength;

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
    var clef = partsObject.parts[Object.keys(partsObject.parts)[i]].clef;
    var middleString = "";
    if (clef === "treble-8") {
      middleString = "octave=1";
    }
    headerString += `V:${partName[0]} clef=${clef} name="${partName}" snm="${partName[0]}" ${middleString}\n`;
  }

  var tuneBody = "";

  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    var partName = Object.keys(partsObject.parts)[i];

    tuneBody += `[V:${partName[0]}] ${partsObject.parts[partName].concatNoteString}] \n`;
  }

  var renderedString =
    `X:1 \n` +
    `T:SATB UIL Sight Reading \n` +
    `C:Blaine Cowen \n` +
    `M:C\n` +
    `L:1/8\n` +
    `Q:1/4=76 \n` +
    `%%score S A T B \n` +
    `${headerString}` +
    `K: ${keyRendered} \n` +
    `%            End of header, start of tune body: \n` +
    `${tuneBody}`;

  console.log(renderedString);
  console.log(partsObject);

  return [renderedString, renderedChordProgression];
}

export { createNewSr };
