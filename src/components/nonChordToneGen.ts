export function nonChordToneGenerator(
  noteIndex: number,
  partName: string,
  partsObject: any,
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
      possible: false,
      function: anticipation,
    },
    suspension: {
      value: "Suspension",
      weight: 1,
      possible: true,
      function: suspension,
    },
  };

  var currNote = partsObject.parts[partName].chordNoteObject[noteIndex];
  var nextNote = partsObject.parts[partName].chordNoteObject[noteIndex + 1];

  var indexToReplace = partsObject.parts[partName].completeNoteObject.findIndex(
    (note: any) => note.noteLinearIndex === currNote.noteLinearIndex
  );

  // get distance between 2 notes
  const distance = Math.abs(currNote.pitchValue - nextNote.pitchValue);

  if (distance === 0) {
    // set neighboring tone to possible
    possibleNonChordTones.neighboringTone.possible = true;
    possibleNonChordTones.anticipation.possible = true;
    possibleNonChordTones.suspension.possible = true;

    // possibleNonChordTones.neighboringTone.possible = true;
  }
  if (distance === 1) {
    // set neighboring tone to possible
    possibleNonChordTones.neighboringTone.possible = true;
    possibleNonChordTones.anticipation.possible = true;
    possibleNonChordTones.suspension.possible = true;
  }
  if (distance === 2) {
    // set passing tone to possible
    possibleNonChordTones.passingTone.possible = true;
  }

  var newNotes = [];

  function passingTone(currNote: any, nextNote: any, noteList: any) {
    var currPitchValue = currNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;

    const secondNotePitchValue = Math.floor(
      (currPitchValue + nextPitchValue) / 2
    );
    const newCurrPitchLength = Math.floor(currNote.noteLength / 2);

    const secondPitchDegree = noteList[secondNotePitchValue].degree;
    const secondPitchName = noteList[secondNotePitchValue].name;

    const newNotes = [
      {
        name: currNote.name,
        degree: currNote.degree,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex,
        newNote: true,
      },
      {
        name: secondPitchName,
        degree: secondPitchDegree,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex + 1,
        newNote: true,
      },
    ];

    return newNotes;
  }

  function neighboringTone(currNote: any, nextNote: any, noteList: any) {
    var currPitchValue = currNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;
    const upOrDown = Math.random() < 0.5 ? -1 : 1;
    const secondNotePitchValue = Math.floor(currPitchValue + upOrDown);
    const newCurrPitchLength = Math.floor(currNote.noteLength / 2);

    const secondPitchDegree = noteList[secondNotePitchValue].degree;
    const secondPitchName = noteList[secondNotePitchValue].name;
    //   change currious note length /2
    currNote.noteLength = newCurrPitchLength;

    const newNotes = [
      {
        name: currNote.name,
        degree: currNote.degree,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex,
        newNote: true,
      },
      {
        name: secondPitchName,
        degree: secondPitchDegree,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex + 1,
        newNote: true,
      },
    ];
    return newNotes;
  }

  function anticipation(currNote: any, nextNote: any, noteList: any) {
    // only if distance = 1
    var currPitchValue = currNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;

    const secondNotePitchValue = nextPitchValue;
    const newCurrPitchLength = Math.floor(currNote.noteLength / 2);

    const secondPitchDegree = noteList[secondNotePitchValue].degree;
    const secondPitchName = noteList[secondNotePitchValue].name;
    //   change currious note length /2
    currNote.noteLength = newCurrPitchLength;

    const newNotes = [
      {
        name: currNote.name,
        degree: currNote.degree,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex,
        newNote: true,
      },
      {
        name: secondPitchName,
        degree: secondPitchDegree,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex + 1,
        newNote: true,
      },
    ];
    return newNotes;
  }

  function appoggiatura(currNote: any, nextNote: any, noteList: any) {
    // distance must be a 1
    var currPitchValue = currNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;
    const movementDirection = currPitchValue > nextPitchValue ? -1 : 1;
    const upOrDown = Math.random() < 0.5 ? -1 : 1;
    const newCurrPitchValue = currNote.pitchValue;
    const newCurrPitchLength = Math.floor(currNote.noteLength / 2);

    const secondPitchDegree = noteList[newCurrPitchValue].degree;
    const secondPitchName = noteList[newCurrPitchValue].name;
    //   change currious note length /2
    currNote.noteLength = newCurrPitchLength;

    const newNotes = [
      {
        name: currNote.name,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex,
        newNote: true,
      },
      {
        name: secondPitchName,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex + 1,
        newNote: true,
      },
    ];
    return newNotes;
  }

  function suspension(currNote: any, nextNote: any, noteList: any) {
    var currPitchValue = currNote.pitchValue;
    const nextPitchValue = nextNote.pitchValue;

    const newCurrPitchValue = currPitchValue + 1;
    const newCurrPitchLength = currNote.noteLength;

    const secondPitchDegree = noteList[newCurrPitchValue].degree;
    const secondPitchName = noteList[newCurrPitchValue].name;
    //   change currious note length /2
    currNote.noteLength = newCurrPitchLength;

    const newNotes = [
      {
        name: currNote.name,
        degreee: secondPitchDegree,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex,
        newNote: true,
      },
      {
        name: secondPitchName,
        noteLength: newCurrPitchLength,
        noteLinearIndex: currNote.noteLinearIndex + 1,
        newNote: false,
      },
    ];
    return newNotes;
  }
  //   get a random number between 0 and 10
  const diceRoll = Math.floor(Math.random() * 5);

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

    newNotes = randomNonChordToneFunction(currNote, nextNote, noteList);
  } else {
    newNotes = [
      {
        name: currNote.name,
        noteLength: currNote.noteLength,
        noteLinearIndex: currNote.noteLinearIndex,
        newNote: true,
      },
    ];
  }

  // replace the note with the new notes
  partsObject.parts[partName].completeNoteObject.splice(
    indexToReplace,
    newNotes.length,
    ...newNotes
  );

  return partsObject;
}
