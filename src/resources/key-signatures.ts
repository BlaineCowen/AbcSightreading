export const keySignatures: {
  [key: string]: {
    sharps: number[]; // Diatonic scale degrees (0-6) that are sharp
    flats: number[]; // Diatonic scale degrees (0-6) that are flat
    rootOffset: number; // Semitones from C (pitch class 0)
  };
} = {
  C: { sharps: [], flats: [], rootOffset: 0 },
  G: { sharps: [6], flats: [], rootOffset: 4 },
  D: { sharps: [6, 2], flats: [], rootOffset: 1 },
  A: { sharps: [6, 2, 5], flats: [], rootOffset: 5 },
  E: { sharps: [6, 2, 5, 1], flats: [], rootOffset: 2 },
  B: { sharps: [6, 2, 5, 1, 4], flats: [], rootOffset: 6 },
  "F#": { sharps: [6, 2, 5, 1, 4, 0], flats: [], rootOffset: 3 },
  "C#": { sharps: [6, 2, 5, 1, 4, 0, 3], flats: [], rootOffset: 0 },
  F: { sharps: [], flats: [3], rootOffset: 3 },
  Bb: { sharps: [], flats: [3, 0], rootOffset: 6 },
  Eb: { sharps: [], flats: [3, 0, 4], rootOffset: 2 },
  Ab: { sharps: [], flats: [3, 0, 4, 1], rootOffset: 5 },
  Db: { sharps: [], flats: [3, 0, 4, 1, 5], rootOffset: 1 },
  Gb: { sharps: [], flats: [3, 0, 4, 1, 5, 2], rootOffset: 4 },
  Cb: { sharps: [], flats: [3, 0, 4, 1, 5, 2, 6], rootOffset: 0 },

  // --- Minor Keys --- (Natural Minor definition)
  // sharps/flats encode KEY-RELATIVE diatonic degrees (0=tonic) of letters
  // raised/lowered by the key signature. Earlier these were mistakenly copied
  // verbatim from the parent major (e.g. Cm reused Eb's [3, 0, 4]) — wrong,
  // because the rootOffset shifts the degree of the same letter.
  Am: { sharps: [], flats: [], rootOffset: 5 },
  Em: { sharps: [1], flats: [], rootOffset: 2 }, // F# at degree 1
  Bm: { sharps: [1, 4], flats: [], rootOffset: 6 }, // F#=4, C#=1
  "F#m": { sharps: [0, 1, 4], flats: [], rootOffset: 3 }, // F#=0, C#=4, G#=1
  "C#m": { sharps: [0, 1, 3, 4], flats: [], rootOffset: 0 }, // F#=3, C#=0, G#=4, D#=1
  "G#m": { sharps: [0, 1, 3, 4, 6], flats: [], rootOffset: 4 }, // F#=6, C#=3, G#=0, D#=4, A#=1
  "D#m": { sharps: [0, 1, 2, 3, 4, 6], flats: [], rootOffset: 1 }, // F#=2, C#=6, G#=3, D#=0, A#=4, E#=1
  "A#m": { sharps: [0, 1, 2, 3, 4, 5, 6], flats: [], rootOffset: 5 },

  Dm: { sharps: [], flats: [5], rootOffset: 1 }, // Bb at degree 5
  Gm: { sharps: [], flats: [2, 5], rootOffset: 4 }, // Bb=2, Eb=5
  Cm: { sharps: [], flats: [2, 5, 6], rootOffset: 0 }, // Bb=6, Eb=2, Ab=5
  Fm: { sharps: [], flats: [2, 3, 5, 6], rootOffset: 3 }, // Bb=3, Eb=6, Ab=2, Db=5
  Bbm: { sharps: [], flats: [0, 2, 3, 5, 6], rootOffset: 6 }, // Bb=0, Eb=3, Ab=6, Db=2, Gb=5
  Ebm: { sharps: [], flats: [0, 2, 3, 4, 5, 6], rootOffset: 2 }, // Bb=4, Eb=0, Ab=3, Db=6, Gb=2, Cb=5
  Abm: { sharps: [], flats: [0, 1, 2, 3, 4, 5, 6], rootOffset: 5 },
};
