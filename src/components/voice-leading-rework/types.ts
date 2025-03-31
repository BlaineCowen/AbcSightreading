/**
 * @file types.ts
 * @description Type definitions for the voice leading system
 */

import type { Rhythm } from "../../resources/rhythms";

/**
 * Enumeration of possible clef types
 */
export enum ClefType {
  Treble = "treble",
  TrebleOctaveDown = "treble-8",
  Bass = "bass",
  Alto = "alto",
  Tenor = "tenor",
}

/**
 * Enumeration of possible accidental types
 */
export enum AccidentalType {
  Sharp = "^",
  DoubleSharp = "^^",
  Flat = "_",
  DoubleFlat = "__",
  Natural = "=",
}

/**
 * Enumeration of chord types
 */
export enum ChordType {
  Tonic = "tonic",
  Predominant = "predominant",
  Dominant = "dominant",
  DominantInversion = "dominant-inversion",
  Mediant = "mediant",
  LeadingTone = "leading-tone",
  SecondaryDominant = "secondary-dominant",
  Plagal = "plagal",
  TonicInversion = "tonic-inversion",
}

/**
 * Represents a musical note with its properties
 */
export interface Note {
  name: string; // ABC notation name of the note (e.g., "C", "D,", "e'")
  degree: number; // Scale degree (0-6)
  pitchValue: number; // Numeric value representing pitch height
  length?: number; // Duration in eighth notes
}

/**
 * Represents a chord and its properties
 */
export interface Chord {
  name: string;
  symbol: string;
  triadNotes: number[];
  root: number;
  type: ChordType;
  nextChordPossibilities: { name: string; weight: number }[];
  sharpScaleDegree?: number;
  flatScaleDegree?: number;
  baseMultiplier: number;
}

/**
 * Represents a chord note with its properties
 */
export interface ChordNote {
  partName: string;
  noteLength: number;
  name: string;
  degree: number;
  pitchValue: number;
  isPatternEnd?: boolean;
  rhythm?: {
    pattern: boolean;
  };
}

/**
 * Represents a time signature
 */
export interface TimeSignature {
  name: string;
  tsPerMeasure: number;
}

/**
 * Represents a part's configuration
 */
export interface Part {
  order: number;
  smallName: string;
  clef: ClefType;
  range: number[];
  selectedRange: {
    [level: number]: [number, number];
  };
  concatNoteString?: string;
  completeNoteObject?: ChordNote[];
  noteArray?: Note[];
  chordNoteObject?: ChordNote[];
}

/**
 * Represents the structure of parts in a choral piece
 */
export interface PartsObject {
  numofParts: number;
  parts: {
    [key: string]: {
      order: number;
      smallName: string;
      clef: ClefType;
      range: [number, number];
      selectedRange: {
        [level: number]: [number, number];
      };
      concatNoteString?: string;
      completeNoteObject?: any[];
      noteArray?: any[];
    };
  };
}

export interface VoicePart {
  order: number;
  smallName: string;
  clef: ClefType;
  range: [number, number];
  selectedRange: {
    [level: number]: [number, number]; // abc notation indices
  };
  concatNoteString?: string;
  completeNoteObject?: any[];
  noteArray?: any[];
}

export type VoicePartArray = VoicePart[];
/**
 * Parameters for creating a new sight-reading exercise
 */
export interface CreateSrParams {
  chords: Chord[];
  key: string;
  maxSkip: number;
  level: number;
  timeSig: TimeSignature;
  bpm: number;
  measures: number;
  partsObject: PartsObject;
  rhythms: Rhythm[];
}

/**
 * Custom error types
 */
export class VoiceLeadingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceLeadingError";
  }
}

export class ChordProgressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChordProgressionError";
  }
}

export interface UILRange {
  min: number;
  max: number;
}

export interface UILRanges {
  [key: string]: {
    Soprano?: UILRange;
    SopranoI?: UILRange;
    SopranoII?: UILRange;
    Alto?: UILRange;
    Tenor?: UILRange;
    TenorI?: UILRange;
    Baritone?: UILRange;
    Bass?: UILRange;
  };
}

// UIL ranges by level based on documentation
// Using ABC notation indices (0 = C,,, 7 = C,, 14 = C,, etc.)
export const UIL_RANGES: UILRanges = {
  1: {
    Soprano: { min: 28, max: 32 }, // c' to g'
    Alto: { min: 21, max: 28 }, // c to c'
    TenorI: { min: 16, max: 23 }, // E to e
    Bass: { min: 8, max: 16 }, // C, to E
  },
  2: {
    SopranoI: { min: 28, max: 33 }, // c' to a'
    SopranoII: { min: 26, max: 32 }, // a to g'
    Alto: { min: 21, max: 29 }, // c to d'
    TenorI: { min: 16, max: 24 }, // E to f
    Baritone: { min: 13, max: 21 }, // B, to c
    Bass: { min: 8, max: 16 }, // C, to E
  },
  3: {
    SopranoI: { min: 28, max: 33 }, // c' to a'
    SopranoII: { min: 26, max: 32 }, // a to g'
    Alto: { min: 21, max: 29 }, // c to d'
    TenorI: { min: 16, max: 24 }, // E to f
    Baritone: { min: 13, max: 21 }, // B, to c
    Bass: { min: 8, max: 16 }, // C, to E
  },
  4: {
    // Slightly expanded from Level 3
    SopranoI: { min: 28, max: 34 }, // c' to b'
    SopranoII: { min: 26, max: 33 }, // a to a'
    Alto: { min: 20, max: 30 }, // B to e'
    TenorI: { min: 15, max: 25 }, // D to g
    Baritone: { min: 12, max: 22 }, // A, to d
    Bass: { min: 7, max: 17 }, // C, to F
  },
  5: {
    // Full extended ranges
    SopranoI: { min: 27, max: 35 }, // b to c''
    SopranoII: { min: 25, max: 33 }, // g to a'
    Alto: { min: 19, max: 31 }, // A to f'
    TenorI: { min: 14, max: 26 }, // C to a
    Baritone: { min: 11, max: 23 }, // G, to e
    Bass: { min: 6, max: 18 }, // B,, to G
  },
};
