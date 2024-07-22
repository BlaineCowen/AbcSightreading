export function nonChordToneGenerator(
  prevNote: any,
  nextNote: any,
  noteList: any
) {
  var possibleNonChordTones: {
    [key: string]: {
      value: string;
      weight: number;
      possible: boolean;
      function: any;
    };
  } = {
    passingTone: {
      value: "Passing Tone",
      weight: 1,
      possible: false,
      function: passingTone,
    },
    neighboringTone: {
      value: "Neighboring Tone",
      weight: 1,
      possible: false,
      function: neighboringTone,
    },
    anticipation: {
      value: "Anticipation",
      weight: 1,
      possible: true,
      function: anticipation,
    },
  };
  // get distance between 2 notes
  const distance = Math.abs(prevNote.pitchValue - nextNote.pitchValue);

  if (distance === 0) {
    // set neighboring tone to possible
    possibleNonChordTones.neighboringTone.possible = true;
  }
  if (distance === 2) {
    // set passing tone to possible
    possibleNonChordTones.passingTone.possible = true;
  }

  var concatString = "";

  function passingTone(prevNote: any, nextNote: any, noteList: any) {
    var prevPitchValue = prevNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;
    const newPitchValue = Math.floor((prevPitchValue + nextPitchValue) / 2);
    const newPitchLength = Math.floor(prevNote.noteLength / 2);
    console.log(noteList);

    const newPitchDegree = noteList[newPitchValue].degree;
    const newPitchName = noteList[newPitchValue].name;
    //   change previous note length /2
    prevNote.noteLength = newPitchLength;

    const newConcatString =
      prevNote.name + prevNote.noteLength + newPitchName + newPitchLength;
    return newConcatString;
  }

  function neighboringTone(prevNote: any, nextNote: any, noteList: any) {
    var prevPitchValue = prevNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;
    const upOrDown = Math.random() < 0.5 ? -1 : 1;
    const newPitchValue = Math.floor(prevPitchValue + upOrDown);
    const newPitchLength = Math.floor(prevNote.noteLength / 2);
    console.log(noteList);

    const newPitchDegree = noteList[newPitchValue].degree;
    const newPitchName = noteList[newPitchValue].name;
    //   change previous note length /2
    prevNote.noteLength = newPitchLength;

    const newConcatString =
      prevNote.name + prevNote.noteLength + newPitchName + newPitchLength;
    return newConcatString;
  }

  function anticipation(prevNote: any, nextNote: any, noteList: any) {
    var prevPitchValue = prevNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;
    const newPitchValue = nextPitchValue;
    const newPitchLength = Math.floor(prevNote.noteLength / 2);
    console.log(noteList);

    const newPitchDegree = noteList[newPitchValue].degree;
    const newPitchName = noteList[newPitchValue].name;
    //   change previous note length /2
    prevNote.noteLength = newPitchLength;

    const newConcatString =
      prevNote.name + prevNote.noteLength + newPitchName + newPitchLength;
    return newConcatString;
  }

  //   get a random number between 0 and 10
  const diceRoll = Math.floor(Math.random() * 10);

  if (diceRoll === 0) {
    // pick a random nonchord function that is possible
    // get length where possible is true
    const indexesOfPossibleNonChordTones = [];
    for (const key in possibleNonChordTones) {
      if (possibleNonChordTones[key].possible) {
        indexesOfPossibleNonChordTones.push(key);
      }
    }
    // get random index from possible nonchordtones
    const randomNonChordToneIndex = Math.floor(
      Math.random() * indexesOfPossibleNonChordTones.length
    );

    const randomNonChordToneFunction =
      possibleNonChordTones[
        indexesOfPossibleNonChordTones[randomNonChordToneIndex]
      ].function;

    concatString = randomNonChordToneFunction(prevNote, nextNote, noteList);
  } else {
    concatString = prevNote.name + prevNote.noteLength;
  }

  return concatString;
}
