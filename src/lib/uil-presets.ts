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
  /**
   * Meters the level permits, from notes/uil-criteria.md.
   *
   * These were stated in the criteria and nowhere in the code, so choosing a
   * level left every meter available - level 2 and 3 are 3/4 and 4/4 only, and
   * both offered 2/4. Listed as the app spells them, so 6/8 at level 4 is
   * absent because the page does not offer compound meters at all.
   */
  allowedMeters: string[];
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
    allowedMeters: ["4/4", "3/4", "2/4"],
    allowedVoicings: ["2 Part Treble", "2 Part Tenor/Bass"],
    measureRange: [24, 28],
    maxSkip: 2,
    // Hand-calibrated by Blaine against UIL's own range staves on
    // /range-calibration (April 2026), and confirmed correct again in
    // September. Do not re-derive these from notes/uil-criteria.md: its MIDI
    // range numbers do not match UIL's published staves, and rebuilding the
    // ranges from them in September moved nearly every voice (sopranos up by as
    // much as a sixth) until they were restored. Change a range by
    // recalibrating on that page, not from the doc.
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
    // The doc names TB beside TBB here, and the three-part voicing fails 18% of
    // the time at this level's maxSkip, so the two-part one is the usable half.
    // No "3 Part Tenor/Bass". The doc names TBB here, but three men inside these
    // ranges moving by no more than a fourth, on I, IV, V and V7 alone, cannot
    // be written: 78% of 16-measure exercises failed outright, and opening every
    // range by a fourth at both ends only brought that to 48%. The two-part
    // voicing the doc names beside it fails 0%. An option that rarely produces
    // an exercise is worse than one that is not offered - the same call as
    // level 1.
    allowedMeters: ["4/4", "3/4"],
    allowedVoicings: [
      "4 Part Mixed", "3 Part Mixed", "2 Part Treble", "2 Part Tenor/Bass",
    ],
    measureRange: [28, 32],
    maxSkip: 3,
    // Hand-calibrated by Blaine against UIL's own range staves on
    // /range-calibration (April 2026), and confirmed correct again in
    // September. Do not re-derive these from notes/uil-criteria.md: its MIDI
    // range numbers do not match UIL's published staves, and rebuilding the
    // ranges from them in September moved nearly every voice (sopranos up by as
    // much as a sixth) until they were restored. Change a range by
    // recalibrating on that page, not from the doc.
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
    allowedMeters: ["4/4", "3/4"],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "2 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [32, 36],
    maxSkip: 4,
    // Hand-calibrated by Blaine against UIL's own range staves on
    // /range-calibration (April 2026), and confirmed correct again in
    // September. Do not re-derive these from notes/uil-criteria.md: its MIDI
    // range numbers do not match UIL's published staves, and rebuilding the
    // ranges from them in September moved nearly every voice (sopranos up by as
    // much as a sixth) until they were restored. Change a range by
    // recalibrating on that page, not from the doc.
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
    allowedChordNames: ["1", "2", "3", "4", "5", "6", "5-7", "5/5", "5/5-6",
      "5/6-6",
      "5/2-6", "5/6", "5/2"],
    // Simple rhythms and dotted patterns, but not the two reversed-dot figures:
    // an eighth then a dotted quarter, and a dotted eighth then a sixteenth.
    // Both put the short note on the beat and the long one off it, which is a
    // different reading skill from the rest of this list. Level 5 excludes them
    // too, and level 3 never had them.
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
      "eighthRest",
    ],
    allowedMeters: ["4/4", "3/4"],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [36, 48],
    maxSkip: 5,
    // Hand-calibrated by Blaine against UIL's own range staves on
    // /range-calibration (April 2026), and confirmed correct again in
    // September. Do not re-derive these from notes/uil-criteria.md: its MIDI
    // range numbers do not match UIL's published staves, and rebuilding the
    // ranges from them in September moved nearly every voice (sopranos up by as
    // much as a sixth) until they were restored. Change a range by
    // recalibrating on that page, not from the doc.
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
      "5-7", "5/5", "5/5-6",
      "5/6-6",
      "5/2-6", "5/6", "5/2", "m4", "1-7", "2-6", "4-64", "6-6",
      "m_i", "m_i6", "m_iv", "m_iid", "m_V", "m_V7", "m_VI", "m_VII", "m_III", "m_viid",
    ],
    // Everything except the two reversed-dot figures - see level 4. Sixteenths
    // in a row are still here; they are only fast, not turned around.
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
    allowedMeters: ["4/4", "3/4", "2/4"],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [48, 56],
    maxSkip: 6,
    // Hand-calibrated by Blaine against UIL's own range staves on
    // /range-calibration (April 2026), and confirmed correct again in
    // September. Do not re-derive these from notes/uil-criteria.md: its MIDI
    // range numbers do not match UIL's published staves, and rebuilding the
    // ranges from them in September moved nearly every voice (sopranos up by as
    // much as a sixth) until they were restored. Change a range by
    // recalibrating on that page, not from the doc.
    voiceRanges: {
      Soprano: [21, 31], Soprano1: [21, 32], Soprano2: [20, 31],
      Alto: [19, 28],
      Tenor: [15, 24], Baritone: [12, 22], Bass: [11, 21],
      Unison: [21, 30],
    },
  },
};
