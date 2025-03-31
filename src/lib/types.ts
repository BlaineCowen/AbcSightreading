export interface Note {
  name: string;
  degree: number;
  pitchValue: number;
  rest?: boolean;
  accidental?:
    | "sharp"
    | "flat"
    | "natural"
    | "double-sharp"
    | "double-flat"
    | null; // Track the type of accidental
}

export interface VoicePart {
  range: [number, number]; // min and max pitch values
  smallName: string;
  possibleNotes: Note[];
  name: string; // Full name, e.g., "Soprano"
  clef: string; // Clef name, e.g., "treble", "bass", "treble-8"
  order: number; // Order for voice leading checks (e.g., 0=Bass, 3=Soprano)
}

export interface VoiceNote extends Note {
  length: number;
  rest: boolean;
  order?: number;
}

export interface ChordPossibility {
  name: string;
  weight: number;
}

export enum ChordType {
  Tonic = "tonic",
  Predominant = "predominant",
  Dominant = "dominant",
  DominantInversion = "dominant-inversion",
  Mediant = "mediant",
  LeadingTone = "leading-tone",
  SecondaryDominant = "secondary-dominant",
}

// Consolidated Chord Type
export interface Chord {
  name: string;
  symbol: string;
  type: string; // Keep as string for now, or map to ChordType enum if preferred later
  root: number; // Diatonic scale degree (0-6) relative to the key
  triadNotes: number[]; // Diatonic intervals (0-6) above the root (e.g., [0, 2, 4] for major)
  nextChordPossibilities: ChordPossibility[];
  baseMultiplier: number;
  sharpScaleDegree?: number; // Optional: Diatonic degree (0-6) to be sharped
  flatScaleDegree?: number; // Optional: Diatonic degree (0-6) to be flatted
  // Add any other essential properties from ChordSet.ts if needed (e.g., chordFamily?)
  chordFamily?: string;
}

export interface Rhythm {
  weight: number;
  name: string;
  abcValue: string[];
  meterValue: number[];
  totalValue: number;
  singleNoteValue?: number; // Value of individual note in a pattern
  rest: boolean;
  oddsWeight: number;
  maxRng: number;
  pattern?: boolean;
  symbol: string;
  isPatternNote?: boolean;
  isPatternStart?: boolean;
  isPatternEnd?: boolean;
  patternIndex?: number | null;
}

export interface RhythmWithPattern extends Rhythm {
  pattern: boolean;
  isPatternNote: boolean;
  isPatternStart: boolean;
  isPatternEnd: boolean;
  patternIndex: number | null;
}

// Add TimeSignature type definition
export interface TimeSignature {
  name: string; // e.g., "4/4", "3/4"
  tsPerMeasure: number; // Number of base units (e.g., 32nd notes if L:1/32) per measure
}

// Add ClefType Enum
export enum ClefType {
  Treble = "treble",
  Bass = "bass",
  Alto = "alto",
  Tenor = "tenor",
  Percussion = "perc",
  TrebleOctaveDown = "treble-8", // Example for Tenor voice
  BassOctaveUp = "bass+8",
  // Add others as needed
}

// Add PartDefinition type (used within PartsObject)
export interface PartDefinition {
  order: number;
  smallName: string;
  clef: ClefType; // Use the enum
  range: [number, number];
  selectedRange: { [level: number]: [number, number] }; // If level selection is used
}

// Add PartsObject type definition
export interface PartsObject {
  numofParts: number;
  parts: { [partName: string]: PartDefinition };
}
