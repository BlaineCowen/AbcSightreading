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
  function generateChord(noteIndex: number, singlePartObject: any) {
    // get key
    var key = keyRendered[0];
    var keyObject = keySignatures[keyRendered];

    var scaleType = "Major";
    var generatedNote = "";
    var generatedScaleDegree = "";
    var generatedNotes = singlePartObject.noteSymbols;
    var generatedNoteLengths = singlePartObject.noteLengths;
    var generatedScaleDegrees = singlePartObject.scaleDegrees;
    var generatedPitchValues = singlePartObject.pitchValues;
    var noteValue = 2;
    var scaleDegreeToAdd: number = 0;
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

    // add gerneated note to note symbols , scale degree to scale degrees, and pitch value to pitch values
    generatedNotes.push(generatedNote);
    generatedNoteLengths.push(noteValue);
    generatedScaleDegrees.push(scaleDegreeToAdd);
    generatedPitchValues.push(pitchValue);

    singlePartObject.noteSymbols = generatedNotes;
    singlePartObject.scaleDegrees = generatedScaleDegrees;
    singlePartObject.pitchValues = generatedPitchValues;

    // update original partobject
    partsObject.parts[Object.keys(partsObject.parts)[partIndexArray[i]]] =
      singlePartObject;
  }
  //generate the list of notes
  function generateTune(partObject: any) {
    // get key
    var key = keyRendered[0];
    var keyObject = keySignatures[keyRendered];

    var scaleType = "Major";
    var generatedNote = "";
    var generatedScaleDegree = "";
    var generatedNotes: string[][] = [];
    var concatNoteString = "";
    var noteValue = 2;
    var tonic: any = key;
    var minRange = noteList.findIndex(
      (note) => note.name === baseNoteArray[partObject.selectedRange[0]]
    );
    // if min range not found, set to 0
    if (minRange === -1) {
      minRange = 0;
    }

    var maxRange = noteList.findIndex(
      (note) => note.name === baseNoteArray[partObject.selectedRange[1]]
    );

    var rangeNoteList = noteList.slice(minRange, maxRange);

    if (keyRendered.includes("m")) {
      scaleType = "Minor";
    }

    for (var i = 1; i <= numOfMeasures * 2; i++) {
      if (partObject.order === 0) {
        if (i === 1) {
          // push the tonic to the end of the generated tune as a whole note
          var possibleNotes = rangeNoteList.filter((note) => note.degree === 0);
          var randomIndex = Math.floor(Math.random() * possibleNotes.length);
          generatedNote = possibleNotes[randomIndex].name;
          generatedScaleDegree = "1";
          generatedNotes.push([generatedNote, generatedScaleDegree]);
        } else {
          var currentChord = renderedChordProgression[i - 1];

          // find all indexes in rangeNoteList that at % 7 = currentRootIndex
          var possibleBassNotes = rangeNoteList.filter(
            (note) => note.degree === currentChord.root
          );

          var randomIndex = Math.floor(
            Math.random() * possibleBassNotes.length
          );

          generatedNote = possibleBassNotes[randomIndex].name + noteValue;
          generatedScaleDegree = currentChord.root.toString();
          if (i % 2 === 0) {
            generatedNote += "|";
          }

          generatedNotes.push([generatedNote, generatedScaleDegree]);
        }
      } else {
        if (i === 1) {
          // call previous note any random note in the 1 chord
          var currentChord = renderedChordProgression[i - 1];

          var previousNotePossibilities = rangeNoteList.filter((note) =>
            currentChord.triadNotes.includes(note.degree)
          );

          var previousNote =
            previousNotePossibilities[
              Math.floor(Math.random() * previousNotePossibilities.length)
            ].name;
        }

        if (i !== 1) {
          var previousNote = generatedNotes[i - 2][0];
        }

        var currentChord = renderedChordProgression[i - 1];

        // find all indexes that have the same degree as triad notes
        var possibleNotes = rangeNoteList.filter((note) =>
          currentChord.triadNotes.includes(note.degree)
        );

        // find index in rangeNoteList that is the same as the previous note
        var previousNoteIndex = rangeNoteList.findIndex(
          (note) => note.name === previousNote
        );

        // find the closest possible note to the previous note
        // make an array with the indexes of the possible notes
        var possibleNoteIndexes = possibleNotes.map((note) =>
          rangeNoteList.findIndex((rangeNote) => rangeNote.name === note.name)
        );

        // find the closest note to the previous note index
        var closestNoteIndex = possibleNoteIndexes.reduce((prev, curr) =>
          Math.abs(curr - previousNoteIndex) <
          Math.abs(prev - previousNoteIndex)
            ? curr
            : prev
        );

        generatedNote = rangeNoteList[closestNoteIndex].name + noteValue;

        if (i % 2 === 0) {
          generatedNote += "|";
        }

        generatedScaleDegree =
          rangeNoteList[closestNoteIndex].degree.toString();

        // if generateScaleDegree === currentChord.sharedDegree, then add a ^ to the beginning of the note name
        if (currentChord.sharpScaleDegree !== undefined) {
          if (
            currentChord.sharpScaleDegree ===
            rangeNoteList[closestNoteIndex].degree
          ) {
            if (
              keyObject.flats &&
              keyObject.flats.findIndex(
                (degree) => degree === rangeNoteList[closestNoteIndex].degree
              ) >= 0
            ) {
              // note is a flat in key
              generatedNote = "=" + generatedNote;
            }
            // check if note is a sharp in key
            else if (
              keyObject.sharps &&
              keyObject.sharps.findIndex(
                (degree) => degree === rangeNoteList[closestNoteIndex].degree
              ) >= 0
            ) {
              generatedNote = "^^" + generatedNote;
            } else {
              generatedNote = "^" + generatedNote;
            }
          }
        }
        // do the same with flat scale degree
        if (currentChord.flatScaleDegree !== undefined) {
          if (
            currentChord.flatScaleDegree ===
            rangeNoteList[closestNoteIndex].degree
          ) {
            if (
              keyObject.sharps &&
              keyObject.sharps.findIndex(
                (degree) => degree === rangeNoteList[closestNoteIndex].degree
              ) >= 0
            ) {
              // note is a sharp in key
              generatedNote = "=" + generatedNote;
            } else if (
              keyObject.flats &&
              keyObject.flats.findIndex(
                (degree) => degree === rangeNoteList[closestNoteIndex].degree
              ) >= 0
            ) {
              generatedNote = "__" + generatedNote;
            } else {
              generatedNote = "_" + generatedNote;
            }
          }
        }

        generatedNotes.push([generatedNote, generatedScaleDegree]);
      }
    }
    var generatedTune = generatedNotes
      .map(([note, scaleDegree]) => note)
      .join("");
    return generatedTune;
  }

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
    partsObject.parts[partName].noteSymbols = [];
    partsObject.parts[partName].noteLengths = [];
    partsObject.parts[partName].scaleDegrees = [];
    partsObject.parts[partName].pitchValues = [];
    partsObject.parts[partName].concatNoteString = "";
  }

  var renderedChordProgression = generateChordProgression(
    timeSigRendered,
    numOfMeasures
  );

  // Example usage:
  var numOfNotes = 40;
  var noteList = createNoteList(tonic, numOfNotes);

  var generatedPartTunes: { [key: string]: string } = {};

  var newTuneObject: {
    [key: string]: {
      noteSymbols: string[];
      noteLengths: number[];
      scaleDegrees: number[];
      pitchValues: number[];
    };
  } = {};

  for (
    var noteIndex = 0;
    noteIndex < renderedChordProgression.length;
    noteIndex++
  ) {
    var chordProgressionIndex = noteIndex;

    // create index 0-x with x being the number of parts -1
    var partIndexArray = Array.from(
      Array(Object.keys(partsObject.parts).length).keys()
    );
    // shuffle the array
    partIndexArray.sort(() => Math.random() - 0.5);

    var chordTriadCopy = [
      ...chords[renderedChordProgression[chordProgressionIndex].name]
        .triadNotes,
    ];

    // loop through the array
    for (var i = 0; i < partIndexArray.length; i++) {
      if (chordTriadCopy.length === 0) {
        chordTriadCopy = [
          ...chords[renderedChordProgression[chordProgressionIndex].name]
            .triadNotes,
        ];
      }
      generateChord(
        noteIndex,
        partsObject.parts[Object.keys(partsObject.parts)[partIndexArray[i]]]
      );
    }
  }

  var prevNoteObj = {};
  var nextNoteObj = {};

  // concat the part string. add a | every 2 notes
  for (var i = 0; i < Object.keys(partsObject.parts).length; i++) {
    for (
      var j = 0;
      j <
      partsObject.parts[Object.keys(partsObject.parts)[i]].noteSymbols.length;
      j++
    ) {
      if (
        j !==
        partsObject.parts[Object.keys(partsObject.parts)[i]].noteSymbols
          .length -
          1
      ) {
        prevNoteObj = {
          name: partsObject.parts[
            Object.keys(partsObject.parts)[i]
          ].noteSymbols[j].replace(/\d+/g, ""),
          degree: parseInt(
            partsObject.parts[Object.keys(partsObject.parts)[i]].scaleDegrees[j]
          ),
          length: parseInt(
            partsObject.parts[Object.keys(partsObject.parts)[i]].noteLengths[j]
          ),
          pitchValue:
            partsObject.parts[Object.keys(partsObject.parts)[i]].pitchValues[j],
        };
        console.log("next note obj");
        console.log(nextNoteObj);

        nextNoteObj = {
          name: partsObject.parts[
            Object.keys(partsObject.parts)[i]
          ].noteSymbols[j + 1].replace(/\d+/g, ""),
          degree: parseInt(
            partsObject.parts[Object.keys(partsObject.parts)[i]].scaleDegrees[
              j + 1
            ]
          ),
          length: parseInt(
            partsObject.parts[Object.keys(partsObject.parts)[i]].noteLengths[
              j + 1
            ]
          ),
          pitchValue:
            partsObject.parts[Object.keys(partsObject.parts)[i]].pitchValues[
              j + 1
            ],
        };
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
      if (
        j ===
        partsObject.parts[Object.keys(partsObject.parts)[i]].noteSymbols
          .length -
          1
      ) {
        partsObject.parts[Object.keys(partsObject.parts)[i]].concatNoteString +=
          partsObject.parts[Object.keys(partsObject.parts)[i]].noteSymbols[j] +
          partsObject.parts[Object.keys(partsObject.parts)[i]].noteLengths[j];
        partsObject.parts[Object.keys(partsObject.parts)[i]].concatNoteString +=
          "|";
      }
    }

    // add barlines every 2 notes
  }

  for (const [partName, partObject] of Object.entries(partsObject.parts)) {
    generatedPartTunes[partName] = generateTune(partObject);
  }

  // get the first entry of the generatedPartTunes object
  var headerString = "";
  for (var i = 0; i < Object.keys(generatedPartTunes).length; i++) {
    // find the clef by matching the name to the part name object
    var partName = Object.keys(generatedPartTunes)[i];
    var clef = partsObject.parts[partName].clef;
    headerString += `V:${
      Object.keys(generatedPartTunes)[i][0]
    } clef=${clef} name="${partName}" snm="${partName[0]}"\n`;
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

  return [renderedString, renderedChordProgression];
}

export { createNewSr };
