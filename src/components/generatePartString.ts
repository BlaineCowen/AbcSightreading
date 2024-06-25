import Index from "../pages/index.astro";

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
  },
  "2": {
    name: "2",
    root: 1,
    triadNotes: [1, 3, 5],
    nextChordPossibilities: ["3", "5", "6"],
  },
  "3": {
    name: "3",
    root: 2,
    triadNotes: [2, 4, 6],
    nextChordPossibilities: ["4", "6"],
  },
  "4": {
    name: "4",
    root: 3,
    triadNotes: [3, 5, 0],
    nextChordPossibilities: ["1", "2", "5"],
  },
  "5": {
    name: "5",
    root: 4,
    triadNotes: [4, 6, 1],
    nextChordPossibilities: ["1", "6"],
  },
  "6": {
    name: "6",
    root: 5,
    triadNotes: [5, 0, 2],
    nextChordPossibilities: ["2", "3", "4", "7"],
  },
  "7": {
    name: "7",
    root: 6,
    triadNotes: [6, 1, 3],
    nextChordPossibilities: ["1", "6"],
  },
  "5/5": {
    name: "5/5",
    root: 1,
    triadNotes: [1, 3, 5],
    nextChordPossibilities: ["5"],
  },
  "5/6": {
    name: "5/6",
    root: 2,
    triadNotes: [3, 5, 0],
    nextChordPossibilities: ["6"],
  },
  "5/4": {
    name: "5/4",
    root: 6,
    triadNotes: [6, 1, 3],
    nextChordPossibilities: ["4"],
  },
  m4: {
    name: "m4",
    root: 3,
    triadNotes: [3, 5, 0],
    nextChordPossibilities: ["1"],
  },
};

//list of all possible notes
// var noteList = [
//   "C,",
//   "D,",
//   "E,",
//   "F,",
//   "G,",
//   "A,",
//   "B,",
//   "C",
//   "D",
//   "E",
//   "F",
//   "G",
//   "A",
//   "B",
//   "c",
//   "d",
//   "e",
//   "f",
//   "g",
//   "a",
//   "b",
//   "c'",
//   "d'",
//   "e'",
//   "f'",
//   "g'",
//   "a'",
//   "b'",
//   "c''",
//   "d''",
//   "e''",
//   "f''",
// ];

//user selects range
// var chosenRange = [0, noteList.length];
// var possibleNotes = noteList.slice(chosenRange[0], chosenRange[1]);

var notesToRender = "";

//list all time sigs

const twoFourTime = {
  abcValue: "2/4", //text value to give abcjs
  maxLength: 0.5, //max length of each measure
  beats: 2, //how many beats are in each measure (not really used)
  compound: false, //if compound
};

const threeFourTime = {
  abcValue: "3/4",
  maxLength: 0.75,
  beats: 3,
  compound: false,
};

const fourFourTime = {
  abcValue: "4/4",
  maxLength: 1,
  beats: 4,
  compound: false,
};

const cutTime = {
  abcValue: "C|",
  maxLength: 1,
  beats: 4,
  compound: false,
};

const threeEightTime = {
  abcValue: "3/8",
  maxLength: 3 / 8,
  beats: 1,
  compound: true,
};

const sixEightTime = {
  abcValue: "6/8",
  maxLength: 3 / 4,
  beats: 2,
  compound: true,
};

const nineEightTime = {
  abcValue: "9/8",
  maxLength: 9 / 8,
  beats: 3,
  compound: true,
};

var timeSigList = [fourFourTime];

var timeSigRendered = fourFourTime;

//rhythms

const thirtySecond = {
  name: "thirtySecond",
  abcValue: ["1"], //text value for the abcjs engine to add to tune
  meterValue: [1 / 32], //value to calculate each note's length
  totalValue: 1 / 32, //value to calculate the combined length
  rest: false, //if rest
  oddsWeight: 0, //weight of the rhythm value chosen by the user
  maxRng: 0, //used for the odds range in getRhythm
};

const sixteenth = {
  name: "sixteenth",
  abcValue: ["2"],
  meterValue: [1 / 16],
  totalValue: 1 / 16,
  rest: false,
  oddsWeight: 10,
  maxRng: 0,
};

const sixteenthRest = {
  name: "sixteenthRest",
  abcValue: ["z2"],
  meterValue: [1 / 16],
  totalValue: 1 / 16,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const dotSixteenth = {
  name: "dotSixteenth",
  abcValue: ["3"],
  meterValue: [3 / 32],
  totalValue: 3 / 32,
  rest: false,
  oddsWeight: 0,
  maxRng: 0,
};

const dotSixteenthRest = {
  name: "dotSixteenthRest",
  abcValue: ["z3"],
  meterValue: [1 / 16],
  totalValue: 1 / 16,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const eighth = {
  name: "eighth",
  abcValue: ["4"],
  meterValue: [1 / 8],
  totalValue: 1 / 8,
  rest: false,
  oddsWeight: 10,
  maxRng: 0,
};

const eigthRest = {
  name: "eigthRest",
  abcValue: ["z4"],
  meterValue: [1 / 8],
  totalValue: 1 / 8,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const dotEighth = {
  name: "dotEighth",
  abcValue: ["6"],
  meterValue: [3 / 16],
  totalValue: 3 / 16,
  rest: false,
  oddsWeight: 0,
  maxRng: 0,
};

const dotEigthRest = {
  name: "dotEigthRest",
  abcValue: ["z6"],
  meterValue: [3 / 16],
  totalValue: 3 / 16,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const quarter = {
  name: "quarter",
  abcValue: ["8"],
  meterValue: [1 / 4],
  totalValue: 1 / 4,
  rest: false,
  oddsWeight: 10,
  maxRng: 0,
};

const quarterRest = {
  name: "quarterRest",
  abcValue: ["z8"],
  meterValue: [1 / 4],
  totalValue: 1 / 4,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const dotQuarter = {
  name: "dotQuarter",
  abcValue: ["12"],
  meterValue: [3 / 8],
  totalValue: 3 / 8,
  rest: false,
  oddsWeight: 10,
  maxRng: 0,
};

const dotQuarterRest = {
  name: "dotQuarterRest",
  abcValue: ["z12"],
  meterValue: [3 / 8],
  totalValue: 3 / 8,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const half = {
  name: "half",
  abcValue: ["16"],
  meterValue: [1 / 2],
  totalValue: 1 / 2,
  rest: false,
  oddsWeight: 10,
  maxRng: 0,
};

const halfRest = {
  name: "halfRest",
  abcValue: ["z16"],
  meterValue: [1 / 2],
  totalValue: 1 / 2,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const dotHalf = {
  name: "dotHalf",
  abcValue: ["24"],
  meterValue: 3 / 4,
  totalValue: 3 / 4,
  rest: false,
  oddsWeight: 0,
  maxRng: 0,
};

const dotHalfRest = {
  name: "dotHalfRest",
  abcValue: ["z24"],
  meterValue: [3 / 4],
  totalValue: 3 / 4,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

const whole = {
  name: "whole",
  abcValue: ["32"],
  meterValue: [1],
  totalValue: 1,
  rest: false,
  oddsWeight: 0,
  maxRng: 0,
};

const wholeRest = {
  name: "wholeRest",
  abcValue: ["z32"],
  meterValue: [1],
  totalValue: 1,
  rest: true,
  oddsWeight: 0,
  maxRng: 0,
};

//patterns

const fourEigths = {
  name: "fourEigths",
  abcValue: ["4", "4", "4", "4"],
  meterValue: [1 / 8, 1 / 8, 1 / 8, 1 / 8],
  totalValue: 1 / 2,
  rest: false,
  chunk: true,
  oddsWeight: 0,
  maxRng: 0,
};

const eighthQtrEighth = {
  name: "eighthQtrEighth",
  abcValue: ["4", "8", "4"],
  meterValue: [1 / 8, 1 / 4, 1 / 8],
  totalValue: 1 / 2,
  rest: false,
  chunk: true,
  oddsWeight: 0,
  maxRng: 0,
};

const fourSixteenths = {
  name: "fourSixteenths",
  abcValue: ["2", "2", "2", "2"],
  meterValue: [1 / 16, 1 / 16, 1 / 16, 1 / 16],
  totalValue: 1 / 4,
  rest: false,
  chunk: true,
  oddsWeight: 0,
  maxRng: 0,
};

const eighthSixteenthSixteenth = {
  name: "eighthSixteenthSixteenth",
  abcValue: ["4", "2", "2"],
  meterValue: [1 / 8, 1 / 16, 1 / 16],
  totalValue: 1 / 4,
  rest: false,
  chunk: true,
  oddsWeight: 0,
  maxRng: 0,
};

const sixteenthSixteenthEighth = {
  name: "sixteenthSixteenthEighth",
  abcValue: ["2", "2", "4"],
  meterValue: [1 / 16, 1 / 16, 1 / 8],
  totalValue: 1 / 4,
  rest: false,
  chunk: true,
  oddsWeight: 0,
  maxRng: 0,
};

const dotEighthSixteenth = {
  name: "dotEighthSixteenth",
  abcValue: ["6", "2"],
  meterValue: [3 / 16, 1 / 16],
  totalValue: 1 / 4,
  rest: false,
  chunk: true,
  oddsWeight: 0,
  maxRng: 0,
};

//array of all rhythm values

let rhythmList = [
  thirtySecond,
  sixteenth,
  dotSixteenth,
  eighth,
  dotEighth,
  quarter,
  dotQuarter,
  half,
  dotHalf,
  whole,
  sixteenthRest,
  dotSixteenthRest,
  eigthRest,
  dotEigthRest,
  quarterRest,
  dotQuarterRest,
  halfRest,
  dotHalfRest,
  wholeRest,
  fourEigths,
  eighthQtrEighth,
  fourSixteenths,
  eighthSixteenthSixteenth,
  sixteenthSixteenthEighth,
  dotEighthSixteenth,
];

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
  //generate the list of notes
  function generateTune(partObject: any) {
    // get key
    var key = keyRendered[0];
    var scaleType = "Major";
    var generatedNote = "";
    var generatedScaleDegree = "";
    var generatedNotes: string[][] = [];
    var noteValue = 2;
    var tonic: any = key;
    console.log(partObject.selectedRange);
    console.log(noteList);
    console.log(baseNoteArray);

    var minRange = noteList.findIndex(
      (note) => note.name === baseNoteArray[partObject.selectedRange[0]]
    );
    console.log(minRange);
    // if min range not found, set to 0
    if (minRange === -1) {
      minRange = 0;
    }

    var maxRange = noteList.findIndex(
      (note) => note.name === baseNoteArray[partObject.selectedRange[1]]
    );
    console.log(maxRange);

    var rangeNoteList = noteList.slice(minRange, maxRange);

    // log part name
    console.log(rangeNoteList);

    if (keyRendered.includes("m")) {
      scaleType = "Minor";
    }

    for (var i = 1; i <= numOfMeasures * 2; i++) {
      if (partObject.order === 0) {
        if (i === 1) {
          console.log(rangeNoteList);

          // push the tonic to the end of the generated tune as a whole note
          var possibleNotes = rangeNoteList.filter((note) => note.degree === 0);
          var randomIndex = Math.floor(Math.random() * possibleNotes.length);
          generatedNote = possibleNotes[randomIndex].name + noteValue;
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
        var currentChord = renderedChordProgression[i - 1];
        // log current chord
        console.log(currentChord);

        // find all indexes that are % x = 0 with the triadnotes
        // pick a random triad note
        var randomDegreeInChord =
          currentChord.triadNotes[
            Math.floor(Math.random() * currentChord.triadNotes.length)
          ];
        console.log("randomDegreeInChord: " + randomDegreeInChord);

        // find all notes in the range that have the same degree as the randomDegreeInChord
        var possibleNotes = rangeNoteList.filter(
          (note) => note.degree === randomDegreeInChord
        );
        console.log("possibleNotes: ");
        console.log(possibleNotes);

        // pick a random note from the possible notes
        var randomIndex = Math.floor(Math.random() * possibleNotes.length);

        generatedNote = possibleNotes[randomIndex].name + noteValue;
        console.log("generatedNote: " + generatedNote);

        if (i % 2 === 0) {
          generatedNote += "|";
        }

        generatedScaleDegree = randomDegreeInChord.toString();
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

  var renderedChordProgression = generateChordProgression(
    timeSigRendered,
    numOfMeasures
  );

  // Example usage:
  var numOfNotes = 32;
  var noteList = createNoteList(tonic, numOfNotes);

  var generatedPartTunes: { [key: string]: string } = {};

  for (const [partName, partObject] of Object.entries(partsObject.parts)) {
    generatedPartTunes[partName] = generateTune(partObject);
  }

  var sopranoPart = "abc";

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

  for (var i = 0; i < Object.keys(generatedPartTunes).length; i++) {
    var partName = Object.keys(generatedPartTunes)[i];
    tuneBody += `[V:${partName[0]}] ${generatedPartTunes[partName]}] \n`;
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
