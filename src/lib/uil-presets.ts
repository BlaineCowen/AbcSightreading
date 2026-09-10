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
    // Derived from notes/uil-criteria.md, which gives these as sounding MIDI:
    // Sop 72-80, Sop II 69-77, Alto 65-74, Ten 60-68, Bari 57-65, Bass 52-60.
    // Every clef this app uses carries an octave=-1 or transpose=-12, so a
    // pitchValue sounds an octave below its nominal ABC pitch - the indices
    // below are the doc's pitches with that shift applied, rounded inward to a
    // diatonic note. The ranges these replaced sounded a fourth to a fifth too
    // low and were three to five notes too wide.
    voiceRanges: {
      Soprano: [28, 32], Soprano1: [28, 32], Soprano2: [26, 31],
      Alto: [24, 29],
      Tenor: [21, 25], Baritone: [19, 24], Bass: [16, 21],
      Unison: [24, 29],
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
    // Derived from notes/uil-criteria.md, which gives these as sounding MIDI:
    // Sop 72-80, Sop II 69-77, Alto 65-74, Ten 60-68, Bari 57-65, Bass 52-60.
    // Every clef this app uses carries an octave=-1 or transpose=-12, so a
    // pitchValue sounds an octave below its nominal ABC pitch - the indices
    // below are the doc's pitches with that shift applied, rounded inward to a
    // diatonic note. The ranges these replaced sounded a fourth to a fifth too
    // low and were three to five notes too wide.
    voiceRanges: {
      Soprano: [28, 32], Soprano1: [28, 32], Soprano2: [26, 31],
      Alto: [24, 29],
      Tenor: [21, 25], Baritone: [19, 24], Bass: [16, 21],
      Unison: [24, 29],
    },
  },

  "UIL 4": {
    label: "UIL Level 4",
    level: 4,
    // Major keys up to 3 sharps or flats: Ab, Eb, Bb, F, C, G, D, A
    allowedKeys: ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A"],
    // I, IV, V, V7, ii, vi, secondary dominants
    allowedChordNames: ["1", "2", "3", "4", "5", "6", "5-7", "5/5", "5/5-6",
      "5/6-6",
      "5/2-6", "5/6", "5/2"],
    // All simple rhythms including syncopation and dotted patterns
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "eighthDotQuarter",
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
    // Level 4 says only "expands slightly beyond Level 3", so this is Level 3's
    // documented ranges opened downward by a third and left at the same ceiling.
    // Downward, deliberately: a singer reads more comfortably below the top of
    // the range than above it, and the old ranges pinned the soprano at its
    // ceiling because the bottom of its range sat in tenor territory and could
    // never be used. Soprano notes in the top quarter of the range: 41% -> 24%.
    voiceRanges: {
      Soprano: [26, 32], Soprano1: [26, 32], Soprano2: [24, 31],
      Alto: [22, 29],
      Tenor: [19, 25], Baritone: [17, 24], Bass: [14, 21],
      Unison: [22, 29],
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
      "5-7", "5/5", "5/5-6",
      "5/6-6",
      "5/2-6", "5/6", "5/2", "m4", "1-7", "2-6", "4-64", "6-6",
      "m_i", "m_i6", "m_iv", "m_iid", "m_V", "m_V7", "m_VI", "m_VII", "m_III", "m_viid",
    ],
    // All rhythm types
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "eighthDotQuarter",
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
    // "Fully extended vocal ranges" - Level 3's documented ranges opened a third
    // downward and a step up, so this is the only level whose ceiling rises
    // above the documented Level 3 top. Soprano notes in the top quarter of the
    // range: 42% -> 29%, and the soprano finally uses its lower half at all
    // (0.03 -> 1.45 notes per exercise at the bottom).
    voiceRanges: {
      Soprano: [26, 33], Soprano1: [26, 33], Soprano2: [24, 32],
      Alto: [22, 30],
      Tenor: [19, 26], Baritone: [17, 25], Bass: [14, 22],
      Unison: [22, 30],
    },
  },
};
