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
    // The doc's level 1 is "Treble: SA" and "Tenor-Bass: TB" - two parts either
    // way. Both are offered now. The three-part tenor-bass voicing
    // cannot be written at this level: three men inside these ranges, moving by
    // no more than a third (maxSkip 2) on I, IV and V alone, failed 100% of the
    // time - before any of this session's range work as well. An option that
    // never produces an exercise is worse than one that is not offered.
    // No "Unison": single-line practice is its own page, and a one-part voicing
    // inside the choral generator only duplicated it. The Unison entry in
    // voiceRanges below stays - the range calibration page reads it for that
    // page's voice.
    allowedVoicings: ["2 Part Treble", "2 Part Tenor/Bass"],
    measureRange: [24, 28],
    maxSkip: 2,
    // Ceilings come from notes/uil-criteria.md; floors are opened downward from
    // it, because the doc's floors sit at the very bottom of each part and a
    // range a singer cannot actually use is the same as no range at all.
    //
    // The undivided Soprano is capped at F5 at every level. The doc allows its
    // Sop. I up to Ab5, but that column is the top of a *divided* treble part -
    // a soprano section reading at sight should not be sent above F. Soprano1
    // keeps the doc's higher ceiling, since it appears only in 3-Part Treble,
    // where it is exactly that divided top part.
    //
    // The lower voices are wider and more separated than the doc's columns.
    // Three men inside the doc's own Tenor/Baritone/Bass columns cannot be given
    // distinct chord tones without crossing: 3-Part Tenor/Bass failed 100% of
    // the time at level 1 and 58% at level 3. Same for the divided sopranos,
    // where the Alto is the anchor that has to come down.
    voiceRanges: {
      Soprano: [27, 31], Soprano1: [27, 31], Soprano2: [25, 30],
      Alto: [22, 28],
      Tenor: [19, 25], Baritone: [16, 23], Bass: [13, 21],
      Unison: [22, 28],
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
    // The doc names TB beside TBB here, and the three-part voicing fails 18% of
    // the time at this level's maxSkip, so the two-part one is the usable half.
    allowedVoicings: [
      "4 Part Mixed", "3 Part Mixed", "2 Part Treble",
      "3 Part Tenor/Bass", "2 Part Tenor/Bass",
    ],
    measureRange: [28, 32],
    maxSkip: 3,
    // Ceilings come from notes/uil-criteria.md; floors are opened downward from
    // it, because the doc's floors sit at the very bottom of each part and a
    // range a singer cannot actually use is the same as no range at all.
    //
    // The undivided Soprano is capped at F5 at every level. The doc allows its
    // Sop. I up to Ab5, but that column is the top of a *divided* treble part -
    // a soprano section reading at sight should not be sent above F. Soprano1
    // keeps the doc's higher ceiling, since it appears only in 3-Part Treble,
    // where it is exactly that divided top part.
    //
    // The lower voices are wider and more separated than the doc's columns.
    // Three men inside the doc's own Tenor/Baritone/Bass columns cannot be given
    // distinct chord tones without crossing: 3-Part Tenor/Bass failed 100% of
    // the time at level 1 and 58% at level 3. Same for the divided sopranos,
    // where the Alto is the anchor that has to come down.
    voiceRanges: {
      Soprano: [27, 31], Soprano1: [27, 32], Soprano2: [24, 30],
      Alto: [22, 29],
      Tenor: [18, 25], Baritone: [15, 24], Bass: [12, 21],
      Unison: [22, 29],
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
    // Ceilings come from notes/uil-criteria.md; floors are opened downward from
    // it, because the doc's floors sit at the very bottom of each part and a
    // range a singer cannot actually use is the same as no range at all.
    //
    // The undivided Soprano is capped at F5 at every level. The doc allows its
    // Sop. I up to Ab5, but that column is the top of a *divided* treble part -
    // a soprano section reading at sight should not be sent above F. Soprano1
    // keeps the doc's higher ceiling, since it appears only in 3-Part Treble,
    // where it is exactly that divided top part.
    //
    // The lower voices are wider and more separated than the doc's columns.
    // Three men inside the doc's own Tenor/Baritone/Bass columns cannot be given
    // distinct chord tones without crossing: 3-Part Tenor/Bass failed 100% of
    // the time at level 1 and 58% at level 3. Same for the divided sopranos,
    // where the Alto is the anchor that has to come down.
    voiceRanges: {
      Soprano: [26, 31], Soprano1: [27, 32], Soprano2: [24, 30],
      Alto: [21, 29],
      Tenor: [18, 25], Baritone: [15, 24], Bass: [12, 21],
      Unison: [21, 29],
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
    // Ceilings come from notes/uil-criteria.md; floors are opened downward from
    // it, because the doc's floors sit at the very bottom of each part and a
    // range a singer cannot actually use is the same as no range at all.
    //
    // The undivided Soprano is capped at F5 at every level. The doc allows its
    // Sop. I up to Ab5, but that column is the top of a *divided* treble part -
    // a soprano section reading at sight should not be sent above F. Soprano1
    // keeps the doc's higher ceiling, since it appears only in 3-Part Treble,
    // where it is exactly that divided top part.
    //
    // The lower voices are wider and more separated than the doc's columns.
    // Three men inside the doc's own Tenor/Baritone/Bass columns cannot be given
    // distinct chord tones without crossing: 3-Part Tenor/Bass failed 100% of
    // the time at level 1 and 58% at level 3. Same for the divided sopranos,
    // where the Alto is the anchor that has to come down.
    voiceRanges: {
      Soprano: [26, 31], Soprano1: [26, 32], Soprano2: [23, 30],
      Alto: [21, 29],
      Tenor: [17, 25], Baritone: [14, 24], Bass: [11, 21],
      Unison: [21, 29],
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
    // Everything except the two reversed-dot figures. An eighth followed by a
    // dotted quarter, and a dotted eighth followed by a sixteenth, both put the
    // short note on the beat and the long one off it - which is a different
    // reading skill from the rest of this list and not what the level is for.
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "dotHalfQuarter",
      "fourSixteenths",
      "wholeRest",
      "halfRest",
      "quarterRest",
      "eighthRest",
    ],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [48, 56],
    maxSkip: 6,
    // Ceilings come from notes/uil-criteria.md; floors are opened downward from
    // it, because the doc's floors sit at the very bottom of each part and a
    // range a singer cannot actually use is the same as no range at all.
    //
    // The undivided Soprano is capped at F5 at every level. The doc allows its
    // Sop. I up to Ab5, but that column is the top of a *divided* treble part -
    // a soprano section reading at sight should not be sent above F. Soprano1
    // keeps the doc's higher ceiling, since it appears only in 3-Part Treble,
    // where it is exactly that divided top part.
    //
    // The lower voices are wider and more separated than the doc's columns.
    // Three men inside the doc's own Tenor/Baritone/Bass columns cannot be given
    // distinct chord tones without crossing: 3-Part Tenor/Bass failed 100% of
    // the time at level 1 and 58% at level 3. Same for the divided sopranos,
    // where the Alto is the anchor that has to come down.
    voiceRanges: {
      Soprano: [25, 31], Soprano1: [26, 33], Soprano2: [23, 30],
      Alto: [21, 30],
      Tenor: [17, 26], Baritone: [14, 25], Bass: [11, 22],
      Unison: [21, 30],
    },
  },
};
