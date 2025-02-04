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

// create an object called a chord that has sseveral properties
var oneChord = {
  name: 1,
  major: true,
  triadNotes: [0, 4, 7],
  nextChordPossibilities: [2, 3, 4, 5, 6, 7],
};

const twoChord = {
  name: 2,
  root: 2,
  major: false,
  triadNotes: [2, 5, 9],
  nextChordPossibilities: [3, 5, 6],
};

const threeChord = {
  name: 3,
  root: 4,
  major: false,
  triadNotes: [4, 7, 11],
  nextChordPossibilities: [4, 6],
};

const fourChord = {
  name: 4,
  root: 5,
  major: true,
  triadNotes: [5, 9, 0],
  nextChordPossibilities: [1, 2, 5],
};

const fiveChord = {
  name: 5,
  root: 7,
  major: true,
  triadNotes: [7, 11, 2],
  nextChordPossibilities: [1, 6],
};

const sixChord = {
  name: 6,
  root: 9,
  major: false,
  triadNotes: [9, 0, 4],
  nextChordPossibilities: [2, 3, 4, 7],
};

const sevenChord = {
  name: 7,
  root: 11,
  major: false,
  triadNotes: [11, 2, 5],
  nextChordPossibilities: [1, 6],
};

//list of all possible notes
var noteList = [
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
];

//user selects range
var chosenRange = [0, noteList.length];
var possibleNotes = noteList.slice(chosenRange[0], chosenRange[1]);

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const threeEightTime = {
  abcValue: "3/8",
  maxLength: 3 / 8,
  beats: 1,
  compound: true,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sixEightTime = {
  abcValue: "6/8",
  maxLength: 3 / 4,
  beats: 2,
  compound: true,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

//gives probability of all rhythms
function getRhythmProbs() {
  var rhythmOddsTotal = 0;
  for (var i = 0; i < rhythmList.length; i++) {
    rhythmOddsTotal += rhythmList[i].oddsWeight; //allows you to weight rhythm chances differently
  }

  for (var i = 0; i < rhythmList.length; i++) {
    if (i == 0) {
      //prevents array -1
      rhythmList[i].maxRng = rhythmList[i].oddsWeight / rhythmOddsTotal;
      // console.log(rhythmList[i].name + "'s max rng is " + rhythmList[i].maxRng);
    } else if (i != 0) {
      rhythmList[i].maxRng =
        rhythmList[i].oddsWeight / rhythmOddsTotal + rhythmList[i - 1].maxRng;
      // console.log(rhythmList[i].name + "'s max rng is " + rhythmList[i].maxRng);
    }
  }
}
getRhythmProbs();

//function to get a random rhythm value for the generate measure rhythm function
function getRhythmValue() {
  const rand = Math.random();
  for (var i = 0; i < rhythmList.length; i++) {
    if (i == 0 && rand < rhythmList[i].maxRng) {
      return rhythmList[i];
    } else if (
      i > 0 &&
      rand >= rhythmList[i - 1].maxRng &&
      rand < rhythmList[i].maxRng
    ) {
      //if rng falls within a note's range, that note is chosen
      // console.log(rhythmList[i].name + "was chosen");
      return rhythmList[i];
    } else {
      continue;
    }
  }
}

var measureRhythm: any[] = [];
var rhythmABC: any[] = [];

//add the rhythm total for the measure
function add(accumulator: number, a: number) {
  return accumulator + a;
}

function getMeasureRhythm() {
  console.log(timeSigRendered);

  let rhythmSum = measureRhythm.reduce(add, 0); //reset the rhythm sum

  let remainingBeats = timeSigRendered.maxLength - rhythmSum; //get remaining beats so the total doesnt go over

  function meterCheck(rand: any) {
    var check = [];

    if (measureRhythm.length > 0) {
      for (var i = 0; i < measureRhythm.length; i++) {
        check.push(measureRhythm[i]);
      }
    }
    for (var i = 0; i < rand.meterValue.length; i++) {
      check.push(rand.meterValue[i]);
    }

    var checkSum = check.reduce(add, 0);

    return checkSum;
  }

  let i = 0;

  while (i < 100 && rhythmSum != timeSigRendered.maxLength) {
    //stops the loop if rhythm total adds up to max notes in measure

    i++;

    remainingBeats = timeSigRendered.maxLength - rhythmSum; //recalc remaining beats each loop

    let randomRhythm = getRhythmValue(); //get new random rhythm value

    if (isNaN(rhythmSum) == true) {
      //breaks loop if rhythmsum is not a number
      break;
    }

    if (
      timeSigRendered.compound == false &&
      randomRhythm &&
      randomRhythm.totalValue <= remainingBeats
    ) {
      if ([1 / 16, 5 / 16, 9 / 16, 13 / 16].includes(rhythmSum)) {
        //prevent quarter or larger on e of any beat

        while (randomRhythm && randomRhythm.totalValue >= 1 / 4) {
          randomRhythm = getRhythmValue();

          if (randomRhythm && randomRhythm.totalValue > remainingBeats) {
            //loops prevents going over measure limit
            randomRhythm = getRhythmValue();

            continue;
          }
        }
      } else if ([3 / 16, 7 / 16, 11 / 16].includes(rhythmSum)) {
        //prevent 8th or larger on "a" of any beat
        while (randomRhythm && randomRhythm.totalValue >= 1 / 8) {
          randomRhythm = getRhythmValue();

          if (randomRhythm && randomRhythm.totalValue > remainingBeats) {
            randomRhythm = getRhythmValue();

            continue;
          }
        }
      } else if ([1 / 8, 1 / 4, 3 / 8, 5 / 8, 7 / 8].includes(rhythmSum)) {
        //prevent dot 8th or larger on + of 1 or 2 or on beat 2
        if (
          measureRhythm.length > 0 &&
          measureRhythm[measureRhythm.length - 1] < 1 / 8
        ) {
          //checks if previous note was 16th. prevents quarters after 16ths
          while (
            randomRhythm &&
            randomRhythm.totalValue &&
            randomRhythm.totalValue >= 3 / 16
          ) {
            randomRhythm = getRhythmValue();

            if (
              randomRhythm &&
              randomRhythm.totalValue &&
              randomRhythm.totalValue > remainingBeats
            ) {
              randomRhythm = getRhythmValue();
              continue;
            }
          }
        }
        while (
          randomRhythm &&
          randomRhythm.totalValue &&
          randomRhythm.totalValue >= 3 / 16
        ) {
          randomRhythm = getRhythmValue();
          if (
            randomRhythm &&
            randomRhythm.totalValue &&
            randomRhythm.totalValue > remainingBeats
          ) {
            randomRhythm = getRhythmValue();
            continue;
          }
        }
      } else {
      }
    }

    if (randomRhythm && meterCheck(randomRhythm) > timeSigRendered.maxLength) {
      continue;
    } else {
      for (let i = 0; i < randomRhythm!.abcValue.length; i++) {
        measureRhythm.push((randomRhythm!.meterValue as number[])[i]);
        rhythmABC.push(randomRhythm!.abcValue[i]);
        rhythmSum = measureRhythm.reduce(add, 0);
      }
    }
  }

  return [measureRhythm, rhythmABC];
}

getMeasureRhythm();

//scale degrees

var chosenScaleDegrees: any[] = [];

function updateScaleDegrees() {
  chosenScaleDegrees = [1, 2, 3, 4, 5, 6, 7];
  var reindexedNotes = possibleNotes;
  var actualPossibleNotes = [];

  var tonic = keyRendered.charAt(0);
  var tonicList = [tonic, tonic.toLowerCase(), tonic + ","];
  // var tonicIndex = possibleNotes.indexOf(tonic); //don't think I need this
  for (let i = 0; i < possibleNotes.length; i++) {
    if (tonicList.includes(possibleNotes[i]) == false) {
      var notTonic = possibleNotes[i];
      reindexedNotes = reindexedNotes.slice(1, reindexedNotes.length);
      reindexedNotes.push(notTonic);
    }
    if (tonicList.includes(possibleNotes[i])) {
      break;
    }
  }

  for (const deg of chosenScaleDegrees) {
    if (reindexedNotes.length > deg) {
      actualPossibleNotes.push(reindexedNotes[deg]);
    }
    if (reindexedNotes.length > deg + 8) {
      actualPossibleNotes.push(reindexedNotes[deg + 8]);
    }
    if (reindexedNotes.length > deg + 16) {
      actualPossibleNotes.push(reindexedNotes[deg + 16]);
    }
  }

  console.log(actualPossibleNotes);
}

var maxLeaps = 2;

function generateChordProgression() {
  // for every 2 beats, randomly generate a chord. It could be the same chord as the previous one
  // it must start on 1 and end on 1
  // it must be at least 4 chords long
  // get length of measures and time signature
  // get the number of beats in the measure
}

//generate the list of notes
function generateTune(numOfMeasures: number) {
  notesToRender = "";

  var listOfNotes = []; //makes array of all the notes so you can see previous notes

  for (let measures = 1; measures <= numOfMeasures; measures++) {
    //loop through this once per measure

    var exerciseLength = rhythmABC.length; //find how many notes to produce

    measureRhythm = getMeasureRhythm()[0]; // get beat values for everything

    rhythmABC = getMeasureRhythm()[1]; //get values to abcjs
    exerciseLength = rhythmABC.length;
    for (let i = 0; i < exerciseLength; i++) {
      //loop once per note to render

      let currentBeat: number = measureRhythm.slice(0, i).reduce(add, 0); //current beat is the mearure rhythm array i number of notes long
      if (rhythmABC[i].toString().charAt(0) == "z") {
        notesToRender = notesToRender.concat(rhythmABC[i]);
        continue;
      }

      if (startTonic == true && i == 0 && measures == 1) {
        notesToRender = notesToRender.concat(" ");

        var nextNote = keyRendered.charAt(0); //gets the tonic
        notesToRender = notesToRender.concat(nextNote + rhythmABC[i]);
        listOfNotes.push(nextNote);
      } else {
        //add note in case start on tonic is false
        if (startTonic == false && i == 0 && measures == 1) {
          //need to add a space after previous note if we are on a downbeat

          var randomIndex = Math.floor(Math.random() * possibleNotes.length);

          let nextNote = possibleNotes[randomIndex];
          notesToRender = notesToRender.concat(nextNote + rhythmABC[i]);
          listOfNotes.push(nextNote);
          notesToRender = notesToRender.concat(nextNote + rhythmABC[i]);
        } else {
          var previousNote: string = listOfNotes[listOfNotes.length - 1];
          let randomIndex = Math.round(Math.random() * maxLeaps);
          var randomDirection = Math.random();
          if (randomDirection < 0.5) {
            randomDirection = -1;
          } else {
            randomDirection = 1;
          }
          randomIndex = randomIndex * randomDirection;

          if (
            possibleNotes.indexOf(previousNote) + randomIndex >
              possibleNotes.length - 1 ||
            possibleNotes.indexOf(previousNote) + randomIndex < 0
          ) {
            while (
              possibleNotes.indexOf(previousNote) + randomIndex >
                possibleNotes.length - 1 ||
              possibleNotes.indexOf(previousNote) + randomIndex < 0
            ) {
              randomIndex = Math.round(Math.random() * maxLeaps);
              randomDirection = Math.random();
              if (randomDirection < 0.5) {
                randomDirection = -1;
              } else {
                randomDirection = 1;
              }
            }
          }
          if (
            timeSigRendered.compound == false &&
            [1 / 4, 2 / 4, 3 / 4].includes(currentBeat)
          ) {
            notesToRender = notesToRender.concat(" ");
          }
          let nextNote =
            possibleNotes[possibleNotes.indexOf(previousNote) + randomIndex];
          listOfNotes.push(nextNote);
          notesToRender = notesToRender.concat(nextNote + rhythmABC[i]);
        }
      }
    }
    if ((measures + 1) % 4 == 0 && measures != numOfMeasures) {
      notesToRender = notesToRender + "|\n";
    } else {
      notesToRender = notesToRender + "|";
      measureRhythm = [];
      rhythmABC = [];
    }
  }
  notesToRender = notesToRender + "]";
  // console.log(notesToRender);
  return notesToRender;
}

var keyRendered = "G";

// var params = {
//     key: "Am",
//     timeSig: "4/4",
//     notes: "",
//     };

function createNewSr(params: any) {
  var keyRendered = params.key;
  var timeSigRendered = params.timeSig;
  var notesToRender = params.notes;
  var tempo = params.bpm;
  var numOfMeasures = params.measures;

  var renderedString =
    "X:1\nM:" +
    timeSigRendered +
    "\nL:1/32\nK:" +
    keyRendered +
    "\n" +
    "Q: 1/4=" +
    tempo +
    "\n" +
    notesToRender +
    "\n";

  return renderedString;
}

export { generateTune, createNewSr };
