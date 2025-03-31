export const keySignatures: {
  [key: string]: {
    sharps: number[]; // Diatonic scale degrees (0-6) that are sharp
    flats: number[]; // Diatonic scale degrees (0-6) that are flat
    rootOffset: number; // Semitones from C (pitch class 0)
  };
} = {
  C: { sharps: [], flats: [], rootOffset: 0 },
  G: { sharps: [3], flats: [], rootOffset: 7 }, // F#
  D: { sharps: [3, 0], flats: [], rootOffset: 2 }, // F#, C#
  A: { sharps: [3, 0, 4], flats: [], rootOffset: 9 }, // F#, C#, G#
  E: { sharps: [3, 0, 4, 1], flats: [], rootOffset: 4 }, // F#, C#, G#, D#
  B: { sharps: [3, 0, 4, 1, 5], flats: [], rootOffset: 11 }, // F#, C#, G#, D#, A#
  "F#": { sharps: [3, 0, 4, 1, 5, 2], flats: [], rootOffset: 6 }, // F#, C#, G#, D#, A#, E#
  "C#": { sharps: [3, 0, 4, 1, 5, 2, 6], flats: [], rootOffset: 1 }, // F#, C#, G#, D#, A#, E#, B#

  F: { sharps: [], flats: [6], rootOffset: 5 }, // Bb
  Bb: { sharps: [], flats: [6, 2], rootOffset: 10 }, // Bb, Eb
  Eb: { sharps: [], flats: [6, 2, 5], rootOffset: 3 }, // Bb, Eb, Ab
  Ab: { sharps: [], flats: [6, 2, 5, 0], rootOffset: 8 }, // Bb, Eb, Ab, Db
  Db: { sharps: [], flats: [6, 2, 5, 0, 3], rootOffset: 1 }, // Bb, Eb, Ab, Db, Gb
  Gb: { sharps: [], flats: [6, 2, 5, 0, 3, 1], rootOffset: 6 }, // Bb, Eb, Ab, Db, Gb, Cb
  Cb: { sharps: [], flats: [6, 2, 5, 0, 3, 1, 4], rootOffset: 11 }, // Bb, Eb, Ab, Db, Gb, Cb, Fb

  // --- Minor Keys --- (Natural Minor definition)
  Am: { sharps: [], flats: [], rootOffset: 9 },
  Em: { sharps: [3], flats: [], rootOffset: 4 }, // F#
  Bm: { sharps: [3, 0], flats: [], rootOffset: 11 }, // F#, C#
  "F#m": { sharps: [3, 0, 4], flats: [], rootOffset: 6 }, // F#, C#, G#
  "C#m": { sharps: [3, 0, 4, 1], flats: [], rootOffset: 1 }, // F#, C#, G#, D#
  "G#m": { sharps: [3, 0, 4, 1, 5], flats: [], rootOffset: 8 }, // F#, C#, G#, D#, A#
  "D#m": { sharps: [3, 0, 4, 1, 5, 2], flats: [], rootOffset: 3 }, // F#, C#, G#, D#, A#, E#
  "A#m": { sharps: [3, 0, 4, 1, 5, 2, 6], flats: [], rootOffset: 10 }, // F#, C#, G#, D#, A#, E#, B#

  Dm: { sharps: [], flats: [6], rootOffset: 2 }, // Bb
  Gm: { sharps: [], flats: [6, 2], rootOffset: 7 }, // Bb, Eb
  Cm: { sharps: [], flats: [6, 2, 5], rootOffset: 0 }, // Bb, Eb, Ab
  Fm: { sharps: [], flats: [6, 2, 5, 0], rootOffset: 5 }, // Bb, Eb, Ab, Db
  Bbm: { sharps: [], flats: [6, 2, 5, 0, 3], rootOffset: 10 }, // Bb, Eb, Ab, Db, Gb
  Ebm: { sharps: [], flats: [6, 2, 5, 0, 3, 1], rootOffset: 3 }, // Bb, Eb, Ab, Db, Gb, Cb
  Abm: { sharps: [], flats: [6, 2, 5, 0, 3, 1, 4], rootOffset: 8 }, // Bb, Eb, Ab, Db, Gb, Cb, Fb
};
