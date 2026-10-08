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
   * both offered 2/4. UIL choir sight-reading is simple meter only, so no level
   * lists a compound meter (the criteria once said 6/8 at level 4, in error).
   */
  allowedMeters: string[];
  /** [min, max] measure count */
  measureRange: [number, number];
  /** Maximum melodic skip in diatonic steps */
  maxSkip: number;
  /** UIL level number */
  level: number;
  /** The cadences the level allows, by type (types.ts allCadences); all when left out. */
  allowedCadenceTypes?: string[];
  /** A dotted quarter and eighth only on a strong beat (Level 2: "on strong beats only"). */
  dottedOnStrongBeats?: boolean;
  /** Level 5's 6A version: the 5A length plus 12-16 measures (measureRange is the 5A one). */
  longVersion?: [number, number];
  /** The level says to avoid rests: none in the rhythm list, and no rest as a phrase's breath. */
  noRests?: boolean;
  /** Voice ranges by part name → [min, max] noteArray indices */
  voiceRanges?: Record<string, [number, number]>;
}

export const uilPresets: Record<string, UILPreset> = {
  "UIL 1": {
    label: "UIL Level 1",
    level: 1,
    // UIL's current criteria (uiltexas.org, read 7 October 2026; the level now
    // covers 1C varsity and all middle-school and 3A/2A/1A non-varsity
    // choirs): F and G major, I IV V or V7, authentic, half and plagal cadences.
    allowedKeys: ["F", "G"],
    allowedChordNames: ["1", "4", "5", "5-7"],
    allowedCadenceTypes: ["Perfect Authentic", "Perfect Authentic 6/4", "Imperfect Authentic", "Half", "Plagal"],
    // Whole, dotted half, half and quarter notes and a few eighth pairs; no
    // rests ("avoid using rests"): UIL's current Level 1 wording, which Blaine
    // quoted on 7 October 2026 (notes/uil-criteria.md). His Level 1 pieces
    // agree: an eighth pair in one bar in twelve (SA) to one in five (TB),
    // dotted half and quarter at phrase ends (TB). The rhythm draw keeps the
    // eighths rare (favorLongerNotes; barShapeWeight for two parts).
    allowedRhythmNames: ["whole", "dotHalf", "half", "quarter", "eighthEighth"],
    noRests: true,
    // UIL now lists SATB, SAB, SSA/SA and TTB/TBB/TB here. Offered: SA and TB,
    // written melody first; the others join as each gets a writer of its own
    // (Blaine, 7 October 2026), rather than the general one. The three-part tenor-bass voicing
    // cannot be written at this level: three men inside these ranges, moving by
    // no more than a third (maxSkip 2) on I, IV and V alone, failed 100% of the
    // time - before any of this session's range work as well. An option that
    // never produces an exercise is worse than one that is not offered.
    // No "Unison": single-line practice is its own page, and a one-part voicing
    // inside the choral generator only duplicated it. The Unison entry in
    // voiceRanges below stays - the range calibration page reads it for that
    // page's voice.
    // 3/4 and 4/4 only (UIL dropped 2/4 at this level).
    allowedMeters: ["4/4", "3/4"],
    allowedVoicings: ["2 Part Treble", "2 Part Tenor/Bass"],
    // About 24 measures in 4/4, 32 in 3/4 (requiredMeasures converts by beats).
    measureRange: [24, 26],
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
    // F and G major, no modulation; I IV V V7 and an occasional ii or vi;
    // authentic, half and plagal cadences ("no use of the deceptive cadence").
    allowedKeys: ["F", "G"],
    allowedChordNames: ["1", "2", "4", "5", "6", "5-7"],
    allowedCadenceTypes: ["Perfect Authentic", "Perfect Authentic 6/4", "Imperfect Authentic", "Half", "Plagal"],
    // Whole, dotted half, half, quarter, some eighth pairs; a dotted quarter and
    // eighth on strong beats only; avoid rests.
    allowedRhythmNames: ["whole", "dotHalf", "half", "quarter", "eighthEighth", "dotQuarterEighth"],
    noRests: true,
    dottedOnStrongBeats: true,
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
    // 3 Part Treble (SSA) is written melody first here (three-part-treble.ts),
    // in the texture of Blaine's Level 2 SSA piece.
    allowedVoicings: [
      "4 Part Mixed", "3 Part Mixed", "3 Part Treble", "2 Part Treble", "2 Part Tenor/Bass",
    ],
    // About 24 measures in 4/4, 32 in 3/4.
    measureRange: [24, 26],
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
    allowedCadenceTypes: ["Perfect Authentic", "Perfect Authentic 6/4", "Imperfect Authentic", "Half", "Plagal"],
    // Whole, dotted half, half, quarter, eighth in pairs; dotted quarter-eighth
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "wholeRest",
      "halfRest",
      "quarterRest",
    ],
    allowedMeters: ["4/4", "3/4"],
    // 3 Part Treble: melody first, as his two Level 3 SSA pieces (three-part-treble.ts).
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "2 Part Treble", "3 Part Tenor/Bass"],
    measureRange: [32, 36],
    maxSkip: 4,
    // Hand-calibrated by Blaine against UIL's own range staves on
    // /range-calibration (April 2026), and confirmed correct again in
    // September. Do not re-derive these from notes/uil-criteria.md: its MIDI
    // range numbers do not match UIL's published staves, and rebuilding the
    // ranges from them in September moved nearly every voice (sopranos up by as
    // much as a sixth) until they were restored. Change a range by
    // recalibrating on that page, not from the doc. The sopranos' top came down
    // from f' to e' at Blaine's request (29 Sept 2026): this is the level the
    // Choral page opens on, and F sat too high for it.
    voiceRanges: {
      Soprano: [21, 30], Soprano1: [21, 30], Soprano2: [20, 30],
      Alto: [19, 28],
      Tenor: [16, 24], Baritone: [12, 22], Bass: [12, 21],
      Unison: [21, 30],
    },
  },

  "UIL 4": {
    label: "UIL Level 4",
    level: 4,
    // B flat, E flat, F, C, G, D, A major; no modulation and no altered tones
    // (UIL names none at this level - the secondary dominants are Level 5's);
    // I IV V V7 ii iii vi; authentic, half and plagal cadences.
    allowedKeys: ["Bb", "Eb", "F", "C", "G", "D", "A"],
    allowedChordNames: ["1", "2", "3", "4", "5", "6", "5-7"],
    allowedCadenceTypes: ["Perfect Authentic", "Perfect Authentic 6/4", "Imperfect Authentic", "Half", "Plagal"],
    // Eighth, quarter, half and whole notes and their rests; "dotted values
    // using eighths or longer" (so no dotted eighth and sixteenth, which UIL
    // keeps for Level 5); no sixteenths, no triplets.
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "wholeRest",
      "halfRest",
      "quarterRest",
      "eighthRest",
    ],
    allowedMeters: ["4/4", "3/4", "2/4"],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"],
    // About 32 measures in 4/4, 42 in 3/4.
    measureRange: [32, 34],
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
    // Major keys up through four sharps and four flats, with a possible
    // modulation to the relative minor - no minor keys of their own (Blaine:
    // UIL pieces are major; minor is practice outside the levels).
    allowedKeys: ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"],
    // The altered tones UIL names: fi (V/V), si (V/vi), di (V/ii), te (V7/IV,
    // as I7); "other altered tones are discouraged".
    allowedChordNames: [
      "1", "2", "3", "4", "5", "6", "7",
      "5-7", "5/5", "5/5-6", "5/6-6", "5/2-6", "5/6", "5/2", "1-7",
      "2-6", "4-64", "6-6",
    ],
    // Simple syncopation and ties across barlines; dotted patterns including an
    // occasional dotted eighth and sixteenth; "other sixteenth note patterns
    // and triplets are forbidden".
    allowedRhythmNames: [
      "whole",
      "dotHalf",
      "half",
      "quarter",
      "eighthEighth",
      "dotQuarterEighth",
      "eighthQuarterEighth",
      "dotEighthSixteenth",
      "wholeRest",
      "halfRest",
      "quarterRest",
      "eighthRest",
    ],
    allowedMeters: ["4/4", "3/4", "2/4"],
    allowedVoicings: ["4 Part Mixed", "3 Part Mixed", "3 Part Treble", "3 Part Tenor/Bass"],
    // 32-36 measures for 5A; 6A adds 12-16 more (longVersion). Blaine's Level 5
    // pieces stop at bar 32 for 5A and run on for 6A.
    measureRange: [32, 36],
    longVersion: [44, 52],
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
