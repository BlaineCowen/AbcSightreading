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
  Am: { sharps: [], flats: [], rootOffset: 9 },
  Em: { sharps: [6], flats: [], rootOffset: 4 },
  Bm: { sharps: [6, 2], flats: [], rootOffset: 11 },
  "F#m": { sharps: [6, 2, 5], flats: [], rootOffset: 6 },
  "C#m": { sharps: [6, 2, 5, 1], flats: [], rootOffset: 1 },
  "G#m": { sharps: [6, 2, 5, 1, 4], flats: [], rootOffset: 8 },
  "D#m": { sharps: [6, 2, 5, 1, 4, 0], flats: [], rootOffset: 3 },
  "A#m": { sharps: [6, 2, 5, 1, 4, 0, 3], flats: [], rootOffset: 10 },

  Dm: { sharps: [], flats: [3], rootOffset: 2 },
  Gm: { sharps: [], flats: [3, 0], rootOffset: 7 },
  Cm: { sharps: [], flats: [3, 0, 4], rootOffset: 0 },
  Fm: { sharps: [], flats: [3, 0, 4, 1], rootOffset: 5 },
  Bbm: { sharps: [], flats: [3, 0, 4, 1, 5], rootOffset: 10 },
  Ebm: { sharps: [], flats: [3, 0, 4, 1, 5, 2], rootOffset: 3 },
  Abm: { sharps: [], flats: [3, 0, 4, 1, 5, 2, 6], rootOffset: 8 },
};
