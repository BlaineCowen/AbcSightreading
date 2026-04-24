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
  chordNotes: VoiceNote[];
}

export interface VoiceNote extends Note {
  length: number;
  rest: boolean;
  order?: number;
  accidental?:
    | "sharp"
    | "flat"
    | "natural"
    | "double-sharp"
    | "double-flat"
    | null;
  isCadenceEnd?: boolean; // Flag if this note is the end of a cadence
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
  isPatternNote?: boolean;
  isPatternStart?: boolean;
  isPatternEnd?: boolean;
  patternIndex?: number | null;
  isCadenceEnd?: boolean;
  cadenceType?: string;
}

// Add TimeSignature type definition
export interface TimeSignature {
  name: string; // e.g., "4/4", "3/4", "6/8"
  tsPerMeasure: number; // Number of base units (e.g., 32nd notes if L:1/32) per measure
  /** How many 32nd-note units form one beam group (one "beat" for beaming).
   *  Simple time (2/4, 3/4, 4/4): 8 (quarter note).
   *  Compound time (6/8, 9/8, 12/8): 12 (dotted quarter). */
  beamGroupSize: number;
}

// --- Add KeySignatureInfo --- New Interface
export interface KeySignatureInfo {
  sharps?: number[]; // Array of diatonic degrees (0-6) that are sharp
  flats?: number[]; // Array of diatonic degrees (0-6) that are flat
  // Add other properties if keySignatures object contains more info per key
}
// --- End KeySignatureInfo ---

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
  range: [number, number]; // The full possible range
  currentRange: [number, number]; // The currently selected range
}

// Add PartsObject type definition
export interface PartsObject {
  numofParts: number;
  parts: { [partName: string]: PartDefinition };
}

// New interface to describe requirements for a single step in a cadence
export interface CadenceStep {
  function: ChordType; // The required chord *function*
  requiredChord?: string; // Optional: Specific required chord symbol using Roman numerals (e.g., "V", "I", "IV", "vi")
  requiredInversion?: number; // Optional: 0 for root, 1 for first inv, etc.
}

// Update the Cadence type/interface
export type Cadence = {
  type: string;
  progression: CadenceStep[];
  isFinal: boolean;
  strength?: number | string;
};

// --- Array of Cadence Definitions (Updated) ---
export const allCadences: Cadence[] = [
  {
    type: "Perfect Authentic",
    progression: [
      { function: ChordType.Predominant },
      { function: ChordType.Dominant, requiredChord: "V" }, // Use Roman numeral
      { function: ChordType.Tonic, requiredChord: "I" }, // Use Roman numeral
    ],
    isFinal: true,
    strength: "strong",
  },
  {
    type: "Imperfect Authentic",
    progression: [
      { function: ChordType.Predominant },
      { function: ChordType.Dominant, requiredChord: "V" }, // Use Roman numeral
      { function: ChordType.Tonic, requiredChord: "I" }, // Use Roman numeral
    ],
    isFinal: true,
    strength: "strong",
  },
  {
    type: "Half",
    progression: [
      { function: ChordType.Dominant, requiredChord: "V" }, // Use Roman numeral
    ],
    isFinal: false,
    strength: "weak",
  },
  {
    type: "Plagal",
    progression: [
      { function: ChordType.Predominant, requiredChord: "IV" }, // Use Roman numeral
      { function: ChordType.Tonic, requiredChord: "I" }, // Use Roman numeral
    ],
    isFinal: true,
    strength: "moderate",
  },
  {
    type: "Deceptive",
    progression: [
      { function: ChordType.Dominant, requiredChord: "V" }, // Use Roman numeral
      { function: ChordType.Mediant, requiredChord: "vi" }, // Use Roman numeral (lowercase for minor)
    ],
    isFinal: false,
    strength: "weak",
  },
];
