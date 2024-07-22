import type { ChordType } from "abcjs";
import Index from "../pages/index.astro";
import { render } from "astro/compiler-runtime";
import { nonChordToneGenerator } from "./nonChordToneGen";

interface AbcObject {
  key: string;
  timeSig: string;
  parts: string;
  form: string;
  bpm: number;
  measures: number;
}

var startTonic = true;

//list of all posible keys
var keyList = [
  "A",
  "Am",
  "Ab",
  "Bb",
  "Bbm",
  "B",
  "Bm",
  "C",
  "Cm",
  "C",
  "C#m",
  "Db",
  "D",
  "Dm",
  "Eb",
  "Ebm",
  "F",
  "Fm",
  "F#",
  "F#m",
  "Gb",
  "G",
  "Gm",
  "G#",
  "G#m",
];

//for when user selects certain keys
var possibleKeys = ["G"];

//make an array of all possible time signatures
var possibleTimeSigs = ["4/4"];

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
    nextChordPossibilities: string[];
    sharpScaleDegree: number | undefined;
    flatScaleDegree: number | undefined;
  };
} = {
  "1": {
    name: "1",
    triadNotes: [0, 2, 4],
    root: 0,
    nextChordPossibilities: [
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "5/5",
      "5/6",
      "5/4",
      "m4",
    ],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "2": {
    name: "2",
    root: 1,
    triadNotes: [1, 3, 5],
    nextChordPossibilities: ["3", "5", "6"],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "3": {
    name: "3",
    root: 2,
    triadNotes: [2, 4, 6],
    nextChordPossibilities: ["4", "6"],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "4": {
    name: "4",
    root: 3,
    triadNotes: [3, 5, 0],
    nextChordPossibilities: ["1", "2", "5"],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "5": {
    name: "5",
    root: 4,
    triadNotes: [4, 6, 1],
    nextChordPossibilities: ["1", "6"],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "6": {
    name: "6",
    root: 5,
    triadNotes: [5, 0, 2],
    nextChordPossibilities: ["2", "3", "4", "7"],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "7": {
    name: "7",
    root: 6,
    triadNotes: [6, 1, 3],
    nextChordPossibilities: ["1", "6"],
    sharpScaleDegree: undefined,
    flatScaleDegree: undefined,
  },
  "5/5": {
    name: "5/5",
    root: 1,
    triadNotes: [1, 3, 5],
    nextChordPossibilities: ["5"],
    sharpScaleDegree: 3,
    flatScaleDegree: undefined,
  },
  "5/6": {
    name: "5/6",
    root: 2,
    triadNotes: [2, 4, 6],
    nextChordPossibilities: ["6"],
    sharpScaleDegree: 4,
    flatScaleDegree: undefined,
  },
  "5/4": {
    name: "5/4",
    root: 6,
    triadNotes: [6, 1, 3],
    nextChordPossibilities: ["4"],
    sharpScaleDegree: 1,
    flatScaleDegree: undefined,
  },
  m4: {
    name: "m4",
    root: 3,
    triadNotes: [3, 5, 0],
    nextChordPossibilities: ["1"],
    sharpScaleDegree: undefined,
    flatScaleDegree: 5,
  },
  "1-7": {
    name: "1-7",
    root: 0,
    triadNotes: [0, 2, 4, 6],
    nextChordPossibilities: ["4"],
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
    flats: undefined,
    sharps: undefined,
  },
  G: {
    flats: undefined,
    sharps: [6],
  },
  D: {
    flats: undefined,
    sharps: [6, 2],
  },
  A: {
    flats: undefined,
    sharps: [6, 2, 5],
  },
  E: {
    flats: undefined,
    sharps: [6, 2, 5, 1],
  },
  B: {
    flats: undefined,
    sharps: [6, 2, 5, 1, 4],
  },
  F: {
    flats: [3],
    sharps: undefined,
  },
  Bb: {
    flats: [3, 0],
    sharps: undefined,
  },
  Eb: {
    flats: [3, 0, 4],
    sharps: undefined,
  },
  Ab: {
    flats: [3, 0, 4, 1],
    sharps: undefined,
  },
  Db: {
    flats: [3, 0, 4, 1, 5],
    sharps: undefined,
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

function generateChordProgression(timeSig: any, numOfMeasures: any) {
  var denominator = timeSig.split("/")[1];
  var numOfChords = numOfMeasures * 2;

  var chordProgression: any[] = [];
  let validProgression = false;
  while (!validProgression) {
    chordProgression = [];

    for (let i = 0; i < numOfChords; i++) {
      if (i === 0) {
        const firstChord = chords["1"];

        chordProgression.push(firstChord);
      } else if (i === numOfChords - 3) {
        // The third-to-last chord must lead to 5
        const lastChord = chordProgression[chordProgression.length - 1];
        const nextChordPossibilities = lastChord.nextChordPossibilities.filter(
          (chord: string) => chord === "1" || chord === "2" || chord === "4"
        );

        if (nextChordPossibilities.length === 0) {
          // Restart the loop if no valid progression is found
          break;
        }

        const nextChordName =
          nextChordPossibilities[
            Math.floor(Math.random() * nextChordPossibilities.length)
          ];
        const nextChord = chords[nextChordName];
        chordProgression.push(nextChord);
      } else if (i === numOfChords - 2) {
        // The second-to-last chord must be "5"
        const nextChord = chords["5"];
        chordProgression.push(nextChord);
      } else if (i === numOfChords - 1) {
        // The last chord must be "1"
        const nextChord = chords["1"];
        chordProgression.push(nextChord);
      } else {
        const lastChord = chordProgression[chordProgression.length - 1];
        const nextChordName =
          lastChord.nextChordPossibilities[
            Math.floor(Math.random() * lastChord.nextChordPossibilities.length)
          ];
        const nextChord = chords[nextChordName];
        chordProgression.push(nextChord);
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

    noteList.push({ name: note, degree: degree });

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
    var partOrder = params.partOrder;
    var baseNoteArray = params.baseNoteArray;

    var scaleType = "Major";
    var generatedNote = "";
    var chordNoteObject: {
      noteLength: number;
      name: string;
      degree: number;
      pitchValue: number;
    } = { noteLength: 0, name: "", degree: 0, pitchValue: 0 };
    var noteLength = 2;
    var scaleDegreeToAdd: number = 0;
    var singlePartObject =
      partObject.parts[Object.keys(partObject.parts)[partOrder]];

    var aboveIndex = baseNoteArray.length - 1;
    var belowIndex = 0;

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
      scaleDegreeToAdd = renderedChordProgression[noteIndex].root;
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
    var randomPossibleNote = Math.floor(Math.random() * possibleNotes.length);
    generatedNote = possibleNotes[randomPossibleNote].name;

    // find the index of the note in the original notesList
    var pitchValue = noteList.findIndex(
      (note) => note.name === possibleNotes[randomPossibleNote].name
    );

    chordNoteObject = {
      noteLength: noteLength,
      name: generatedNote,
      degree: scaleDegreeToAdd,
      pitchValue: pitchValue,
    };

    return chordNoteObject;
  }
  //generate the list of notes

  // var keyRendered = params.key;
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
    // reset chordNoteObject
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
        ...chords[renderedChordProgression[chordProgressionIndex].name]
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
            ...chords[renderedChordProgression[chordProgressionIndex].name]
              .triadNotes,
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
          partOrder: partIndexArray[i],
          noteIndex: noteIndex,
          renderedChordProgression: renderedChordProgression,
        };

        var chordObjectToAdd = generateChord(genChordParams);

        // add to array
        chordObjectsToAdd.push(chordObjectToAdd);

        var partOrder =
          partsObject.parts[Object.keys(partsObject.parts)[partIndexArray[i]]]
            .order;

        noteArrayToCheck[partOrder] = chordObjectToAdd.pitchValue;

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

  // concat the part string. add a | every 2 notes
  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    for (
      var j = 0;
      j <
      partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject
        .length;
      j++
    ) {
      if (
        j !==
        partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject
          .length -
          1
      ) {
        prevNoteObj =
          partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject[
            j
          ];

        nextNoteObj =
          partsObject.parts[Object.keys(partsObject.parts)[i]].chordNoteObject[
            j + 1
          ];

        console.log("prev note obj");
        console.log(prevNoteObj);

        var noteComboToAdd = nonChordToneGenerator(
          prevNoteObj,
          nextNoteObj,
          noteList
        );

        // run each note through passing tone generator
        partsObject.parts[Object.keys(partsObject.parts)[i]].concatNoteString +=
          noteComboToAdd;
        if ((j + 1) % 2 === 0) {
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

  // get the first entry of the generatedPartTunes object
  var headerString = "";
  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    // find the clef by matching the name to the part name object
    var partName = Object.keys(partsObject.parts)[i];
    var clef = partsObject.parts[Object.keys(partsObject.parts)[i]].clef;
    var middleString = "";
    if (clef === "treble-8") {
      middleString = 'transpose=12 middle="B,"';
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
    `L:1/4\n` +
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
