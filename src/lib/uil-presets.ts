/**
 * Texas UIL Choir Sight-Reading presets (Levels 1–5).
 *
 * Sources: notes/uil-criteria.md
 *
 * Each preset defines the constraints that govern what the generator is allowed
 * to produce for that classification level.
 */

export interface UILPreset {
  /** Human-readable label */
  label: string;
  /** Allowed key signatures for this level (ABC key strings) */
  allowedKeys: string[];
  /** Chord names (from resources/chords.ts) allowed at this level */
  allowedChordNames: string[];
  /** Rhythm names (from resources/rhythms.ts) allowed at this level */
  allowedRhythmNames: string[];
  /** Allowed voicing names (must match keys in possibleVoicing in AbcjsChoral.svelte) */
  allowedVoicings: string[];
  /** [min, max] measure count */
  measureRange: [number, number];
  /** Maximum melodic skip in diatonic steps */
  maxSkip: number;
  /** UIL level number */
  level: number;
  /** Voice ranges by part name → [min, max] noteArray indices */
  voiceRanges?: Record<string, [number, number]>;
}

export const uilPresets: Record<string, UILPreset> = {
  "UIL 1": {
    label: "UIL Level 1",
    level: 1,
    // C, F, G major
    allowedKeys: ["C", "F", "G"],
    // I, IV, V only
    allowedChordNames: ["1", "4", "5"],
    // Whole, half, quarter notes and rests
    allowedRhythmNames: ["whole", "half", "quarter", "wholeRest", "halfRest", "quarterRest"],
    // Treble: SA, Tenor-Bass: TB
    allowedVoicings: ["2 Part Treble", "3 Part Tenor/Bass", "Unison"],
    measureRange: [24, 28],
    maxSkip: 2,
    voiceRanges: {
      Soprano: [22, 30], Soprano1: [22, 30], Soprano2: [22, 29],
      Alto: [21, 29],
      Tenor: [19, 24], Baritone: [14, 20], Bass: [14, 21],
      Unison: [21, 28],
    },
  },

  "UIL 2": {
    label: "UIL Level 2",
    level: 2,
    // C, F, G, D major
    allowedKeys: ["C", "F", "G", "D"],
    // I, IV, V, V7
    allowedChordNames: ["1", "4", "5", "5-7"],
    // Whole, half, quarter, eighth; dotted quarter-eighth
    allowedRhythmNames: [
      "whole",
      "half",
      "quarter",
      "dotQuarterEighth",
      "wholeRest",
      "halfRest",
      "quarterRest",
    ],
    // Mixed: SATB, SAB; Treble: SSA/SA; Tenor-Bass: TBB/TB
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "2 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [28, 32],
    maxSkip: 3,
    voiceRanges: {
      Soprano: [22, 30], Soprano1: [22, 30], Soprano2: [22, 29],
      Alto: [21, 28],
      Tenor: [17, 24], Baritone: [14, 21], Bass: [14, 21],
      Unison: [21, 28],
    },
  },

  "UIL 3": {
    label: "UIL Level 3",
    level: 3,
    // Bb, F, C, G, D major
    allowedKeys: ["Bb", "F", "C", "G", "D"],
    // I, IV, V, V7, ii, vi
    allowedChordNames: ["1", "2", "4", "5", "6", "5-7"],
    // Whole, dotted half, half, quarter, eighth in pairs; dotted quarter-eighth
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "dotHalfQuarter",
      "wholeRest",
      "halfRest",
      "quarterRest",
    ],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "2 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [32, 36],
    maxSkip: 4,
    voiceRanges: {
      Soprano: [21, 31], Soprano1: [21, 31], Soprano2: [20, 30],
      Alto: [19, 28],
      Tenor: [16, 24], Baritone: [12, 22], Bass: [12, 21],
      Unison: [21, 30],
    },
  },

  "UIL 4": {
    label: "UIL Level 4",
    level: 4,
    // Major keys up to 3 sharps or flats: Ab, Eb, Bb, F, C, G, D, A
    allowedKeys: ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A"],
    // I, IV, V, V7, ii, vi, secondary dominants
    allowedChordNames: ["1", "2", "3", "4", "5", "6", "5-7", "5/5", "5/6", "5/2"],
    // All simple rhythms including syncopation and dotted patterns
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "dotQuarter",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "dotHalfQuarter",
      "dotEighthSixteenth",
      "wholeRest",
      "halfRest",
      "quarterRest",
      "eighthRest",
    ],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [36, 48],
    maxSkip: 5,
    voiceRanges: {
      Soprano: [21, 31], Soprano1: [21, 31], Soprano2: [20, 29],
      Alto: [19, 28],
      Tenor: [16, 24], Baritone: [12, 22], Bass: [12, 21],
      Unison: [21, 30],
    },
  },

  "UIL 5": {
    label: "UIL Level 5",
    level: 5,
    // Major and minor keys up to 4 sharps or flats
    allowedKeys: ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m"],
    // Full harmonic range including secondary dominants, seventh chords, and minor mode
    allowedChordNames: [
      "1", "2", "3", "4", "5", "6", "7",
      "5-7", "5/5", "5/6", "5/2", "m4", "1-7", "2-6", "4-64", "6-6",
      "m_i", "m_i6", "m_iv", "m_iid", "m_V", "m_V7", "m_VI", "m_VII", "m_III", "m_viid",
    ],
    // All rhythm types
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "dotQuarter",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "dotHalfQuarter",
      "dotEighthSixteenth",
      "fourSixteenths",
      "wholeRest",
      "halfRest",
      "quarterRest",
      "eighthRest",
    ],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [48, 56],
    maxSkip: 6,
    voiceRanges: {
      Soprano: [21, 31], Soprano1: [21, 32], Soprano2: [20, 31],
      Alto: [19, 28],
      Tenor: [15, 24], Baritone: [12, 22], Bass: [11, 21],
      Unison: [21, 30],
    },
  },
};
