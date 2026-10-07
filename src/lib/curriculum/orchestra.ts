import { D7, instrumentTrack, type FamilyDef, type InstrumentDef, type NoteStepDef } from "./band";
import type { Track } from "./types";

/**
 * Beginning orchestra: the band's rhythm thread (rhythm two steps ahead of
 * the notes), with the notes in the order string method books take them: D
 * major first, around the open strings, then G, then A, then C (low second
 * finger) and F (low first finger). Keys are read at pitch; the string bass
 * reads an octave above where it sounds.
 */
export const ORCHESTRA_THREAD: Record<number, NoteStepDef> = {
  3: { newNotes: "do, re, mi in D: the first three notes, by step", keys: ["D"], degrees: [1, 2, 3], span: [0, 2], maxSkip: 1 },
  4: { newNotes: "fa and so: the first five notes of D", keys: ["D"], degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 1 },
  5: { newNotes: "Skips: do, mi, so", keys: ["D"], degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 2 },
  6: { newNotes: "A new key: G major", keys: ["G"], degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 2 },
  7: { newNotes: "la", keys: ["D", "G"], degrees: [1, 2, 3, 4, 5, 6], span: [0, 5], maxSkip: 2 },
  8: { newNotes: "ti and high do: the D major scale", keys: ["D"], degrees: D7, span: [0, 7], maxSkip: 2 },
  9: { newNotes: "A third key: A major", keys: ["A"], degrees: [1, 2, 3, 4, 5, 6], span: [0, 5], maxSkip: 2 },
  10: { newNotes: "Below do: low so, la, ti", keys: ["D", "G"], degrees: D7, span: [-3, 5], maxSkip: 2 },
  11: { newNotes: "Wider skips: fourths and fifths", keys: ["D", "G", "A"], degrees: D7, span: [-3, 5], maxSkip: 4 },
  12: { newNotes: "D, G and A, the whole range", keys: ["D", "G", "A"], degrees: D7, span: [-3, 7], maxSkip: 4 },
  13: { newNotes: "C major: the low second finger", keys: ["C"], degrees: D7, span: [0, 7], maxSkip: 2 },
  14: { newNotes: "Higher: up to re and mi above high do", keys: ["D"], degrees: D7, span: [-3, 9], maxSkip: 4 },
  15: { newNotes: "F major: the low first finger", keys: ["F"], degrees: D7, span: [-3, 5], maxSkip: 2 },
  16: { newNotes: "6/8 on the notes you know", keys: ["D", "G", "A"], degrees: D7, span: [-3, 7], maxSkip: 2, compound: true },
  17: { newNotes: "Everything: five keys, every meter", keys: ["D", "G", "A", "C", "F"], degrees: D7, span: [-3, 7], maxSkip: 4 },
};

export const ORCHESTRA: FamilyDef = { family: "strings", prefix: "orch", level: "Beginning orchestra", thread: ORCHESTRA_THREAD, concertKeys: false };

export const ORCHESTRA_INSTRUMENTS: InstrumentDef[] = [
  {
    id: "violin",
    name: "Violin",
    blurb: "Violin in first position, from the open G string to B on the E string.",
    clef: "treble",
    instrumentProgram: 40,
    transposeSemitones: 0,
    anchor: 14, // C4: D on the open D string, G and A on the staff
    range: { min: 11, max: 27 }, // G3 to B5
    color: "peach",
  },
  {
    id: "viola",
    name: "Viola",
    blurb: "Viola in alto clef, first position, from the open C string to E on the A string.",
    clef: "alto",
    instrumentProgram: 41,
    transposeSemitones: 0,
    anchor: 10, // F3: D on the open D string, G and A on their open strings
    range: { min: 7, max: 23 }, // C3 to E5
    color: "sky",
  },
  {
    id: "cello",
    name: "Cello",
    blurb: "Cello in bass clef, first position, from the open C string to E on the A string.",
    clef: "bass",
    instrumentProgram: 42,
    transposeSemitones: 0,
    anchor: 3, // F2: D on the open D string, G and A on theirs
    range: { min: 0, max: 16 }, // C2 to E4
    color: "mint",
  },
  {
    id: "bass",
    name: "String bass",
    blurb: "String bass in bass clef, from the open E string up, sounding an octave below written.",
    clef: "bass",
    instrumentProgram: 43,
    transposeSemitones: -12,
    anchor: 3,
    range: { min: 2, max: 13 }, // written E2 to B3
    color: "butter",
  },
];

export const ORCHESTRA_TRACKS: Track[] = ORCHESTRA_INSTRUMENTS.map((i) => instrumentTrack(i, ORCHESTRA));
