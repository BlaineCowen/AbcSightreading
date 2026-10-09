/**
 * The piano levels: ten steps from the hands taking turns in C position to
 * reading what a beginner's Mozart sonata asks for (K. 545's first movement:
 * Alberti bass in sixteenths under a tune with scale runs, about ABRSM
 * Grade 5 or RCM Level 6-7 as repertoire).
 *
 * Every level is only a set of choices (`PianoSettings`): the page shows
 * every option at every level, each marked with the level it is first used
 * at (`unlockedAt`), and a teacher can choose any of them anywhere.
 *
 * The order is the method books' (Faber Piano Adventures, Alfred's Basic,
 * Bastien agree on it), checked against two published sight-reading
 * standards: ABRSM's parameters by grade (Grade 1: C, G, F major, five-finger
 * position, leaps to a 5th; Grade 2: a 6th's range, position changes, quarter
 * rests; Grade 3: keys to 3 flats and sharps with A, E, B, D and G minor,
 * outside the position, sixteenths; Grade 4: 6/8, chromatic notes; Grade 5:
 * four sharps or flats, syncopation, octave passages) and RCM's (hands
 * together from Level 3 in C, G, D, F and A, D minor; up to two sharps or
 * flats at Level 5, three at 6, four at 7, eight to twelve bars). Reading
 * research favours reading by interval, direction and pattern (chunks) over
 * note naming alone: the tune moves mostly by step and skip inside a
 * position, and the accompaniment is a repeated pattern a reader can take in
 * whole, as a chunk.
 *
 *    1  hands taking turns, C position, steps
 *    2  skips of a 3rd; G position
 *    3  hands together over a held root (I, V)
 *    4  fifths, held and rocking; IV; F major; 2/4; skips of a 4th
 *    5  the chord shapes, held and on each beat; eighths; A and D minor; dynamics
 *    6  the tune in the left hand; oom-pah; ii, vi; quarter rests; a 6th's reach
 *    7  broken chords, arpeggios, waltz; the dotted quarter; D major, E minor
 *    8  Alberti; thirds and sixths at cadences; an octave's reach; sixteenths;
 *       A, B flat major, G minor
 *    9  6/8; chromatic chords (V of V, of vi, of ii); E flat, B minor
 *   10  Alberti in sixteenths, syncopation, dotted eighths; four sharps or
 *       flats; 12 bars - a beginner's Mozart sonata
 *
 * Written against what Sight Reading Factory's piano levels do (8 October
 * 2026, notes/srf-piano-study.md): their left hand is a second tune and a
 * chord a coin flip on any long note. Here the accompaniment is one a method
 * book teaches, and the right hand takes a second note only at a cadence,
 * under the tune.
 *
 * Ids are stored as class progress and in links. Never rename or reuse one.
 */
import type { Progression } from "../unison-progressions";

export type LeftHandPattern =
  | "root" // the root, held for the chord
  | "fifth" // root and fifth together, held
  | "rocking" // root, fifth, root, fifth: one a beat
  | "block" // the chord in close position, held
  | "blockBeats" // the chord on every beat
  | "oompah" // root, chord, fifth, chord (2/4 and 4/4)
  | "broken" // root, fifth, third, fifth: one note a beat
  | "arpeggio" // root, third, fifth, third: one note a beat
  | "waltz" // root, then the chord twice (3/4)
  | "brokenEighths" // root, fifth, third, fifth in eighths (root, fifth, third a beat in 6/8)
  | "alberti" // low, high, middle, high in eighths, on the close shape
  | "albertiSixteenths"; // the same in sixteenths, as Mozart writes it

/** What is written when the hands take turns: not an accompaniment, the tune passed between them. */
export type Accompaniment = LeftHandPattern | "tune";

export type TuneHand = "right" | "left" | "either";

/** The harmony a teacher chooses from, by function; major and minor each read them in their own chords. */
export type ChordChoice = "I" | "V" | "IV" | "V7" | "ii" | "vi";

/** Everything an exercise can be asked for. A level is one of these. */
export interface PianoSettings {
  /** Keys to draw from: major ("C", "Bb") and minor ("Am", "F#m"). */
  keys: string[];
  /** Meters to draw from. */
  meters: string[];
  measures: number;
  /** Simple-meter figures (selectable-rhythms names); 6/8 takes its own, from these (compoundFigures). */
  rhythms: string[];
  /** Largest move in the tune, in diatonic steps (1 a step, 2 a 3rd, 7 an octave). */
  maxSkip: number;
  /** The tune's reach above its thumb, in diatonic steps: 4 a five-finger position, 5 a 6th, 7 an octave. */
  reach: number;
  /** Hands together, or taking turns a phrase at a time (each hand a five-finger tune). */
  together: boolean;
  tuneHand: TuneHand;
  /** Accompaniment patterns to draw from; each played only in the meters it suits (patternsFor). */
  patterns: LeftHandPattern[];
  chords: ChordChoice[];
  /** Chromatic chords in major: V of V, V of vi, V of ii (an altered note, F sharp in C, resolving). */
  chromatic: boolean;
  /** A third or sixth under the tune on long notes at cadences. */
  doubleNotes: boolean;
  /** A dynamic for each phrase. */
  dynamics: boolean;
  bpm: number;
}

export interface PianoLevel {
  /** Stable: stored as class progress and in links. Never rename. */
  id: string;
  number: number;
  label: string;
  /** One line: what is new at this level. */
  summary: string;
  /** Roughly where it sits against the exam boards' sight-reading tests. */
  compare: string;
  settings: PianoSettings;
}

export const ALL_KEYS = {
  major: ["C", "G", "F", "D", "Bb", "A", "Eb", "E", "Ab"],
  minor: ["Am", "Dm", "Em", "Gm", "Bm", "Cm", "F#m"],
};
export const ALL_METERS = ["4/4", "3/4", "2/4", "6/8"];
export const ALL_LENGTHS = [4, 8, 12, 16];

/** The simple-meter figures a teacher can choose, in the order they are taught. */
export const RHYTHM_CHOICES: { name: string; label: string }[] = [
  { name: "whole", label: "Whole" },
  { name: "half", label: "Half" },
  { name: "dotHalf", label: "Dotted half" },
  { name: "quarter", label: "Quarter" },
  { name: "eighthEighth", label: "Eighths" },
  { name: "quarterRest", label: "Quarter rest" },
  { name: "dotQuarterEighth", label: "Dotted quarter and eighth" },
  { name: "fourSixteenths", label: "Four sixteenths" },
  { name: "eighthSixteenthSixteenth", label: "Eighth, two sixteenths" },
  { name: "sixteenthSixteenthEighth", label: "Two sixteenths, eighth" },
  { name: "dotEighthSixteenth", label: "Dotted eighth and sixteenth" },
  { name: "eighthQuarterEighth", label: "Syncopation" },
];

/**
 * 6/8 takes compound figures, chosen to match the simple ones a teacher
 * picked: dotted quarters and three eighths always, sixteenths only when
 * sixteenths are chosen.
 */
export function compoundFigures(rhythms: string[]): string[] {
  const out = ["dotQuarter", "dotHalfCompound", "threeEighths", "quarterEighth", "eighthQuarter"];
  if (rhythms.includes("fourSixteenths") || rhythms.includes("eighthSixteenthSixteenth")) out.push("eighthTwoSixteenthsEighth", "twoEighthsTwoSixteenths");
  return out;
}

/** Chord names (chords.ts) for each choice, in major and in minor (harmonic minor's V). */
export const CHORD_NAMES: Record<ChordChoice, { major: string; minor: string | null }> = {
  I: { major: "1", minor: "1" },
  V: { major: "5", minor: "m_V" },
  IV: { major: "4", minor: "4" },
  V7: { major: "5-7", minor: "m_V7" },
  ii: { major: "2", minor: null },
  vi: { major: "6", minor: "6" },
};
export const CHROMATIC_CHORDS = ["5/5", "5/6", "5/2"];

/**
 * The progressions the piano draws from: one is used only when each of its
 * chords is chosen (writeProgressionLine). Four bars, repeated, each phrase
 * home on I.
 */
export const PIANO_PROGRESSIONS: Progression[] = [
  { id: "p-I-V-V-I", label: "I V V I", mode: "major", bars: [["1"], ["5"], ["5"], ["1"]] },
  { id: "p-I-I-V-I", label: "I I V I", mode: "major", bars: [["1"], ["1"], ["5"], ["1"]] },
  { id: "p-I-V-I-V-I", label: "I V I V I", mode: "major", bars: [["1"], ["5"], ["1"], ["5", "1"]] },
  { id: "p-I-V7-V7-I", label: "I V7 V7 I", mode: "major", bars: [["1"], ["5-7"], ["5-7"], ["1"]] },
  { id: "p-I-I-V7-I", label: "I I V7 I", mode: "major", bars: [["1"], ["1"], ["5-7"], ["1"]] },
  { id: "p-I-IV-V-I", label: "I IV V I", mode: "major", bars: [["1"], ["4"], ["5"], ["1"]] },
  { id: "p-I-IV-I-V-I", label: "I IV I V I", mode: "major", bars: [["1"], ["4"], ["1", "5"], ["1"]] },
  { id: "p-I-IV-V7-I", label: "I IV V7 I", mode: "major", bars: [["1"], ["4"], ["5-7"], ["1"]] },
  { id: "p-I-IV-I-V7-I", label: "I IV I V7 I", mode: "major", bars: [["1"], ["4"], ["1", "5-7"], ["1"]] },
  { id: "p-I-vi-IV-V-I", label: "I vi IV V I", mode: "major", bars: [["1"], ["6"], ["4", "5"], ["1"]] },
  { id: "p-I-ii-V7-I", label: "I ii V7 I", mode: "major", bars: [["1"], ["2"], ["5-7"], ["1"]] },
  { id: "p-I-vi-ii-V-I", label: "I vi ii V I", mode: "major", bars: [["1"], ["6"], ["2", "5"], ["1"]] },
  // Chromatic: the altered note is the secondary dominant's third, rising to the chord it leads to.
  { id: "p-I-IV-V/V-V-I", label: "I IV V/V V I", mode: "major", bars: [["1"], ["4", "5/5"], ["5"], ["1"]] },
  { id: "p-I-V/vi-vi-V-I", label: "I V/vi vi V I", mode: "major", bars: [["1"], ["5/6"], ["6", "5"], ["1"]] },
  { id: "p-I-V/ii-ii-V-I", label: "I V/ii ii V I", mode: "major", bars: [["1"], ["5/2"], ["2", "5"], ["1"]] },
  // Minor: harmonic minor's V (the raised leading tone, G sharp in A minor).
  { id: "p-i-i-V-i", label: "i i V i", mode: "minor", bars: [["1"], ["1"], ["m_V"], ["1"]] },
  { id: "p-i-V-V-i", label: "i V V i", mode: "minor", bars: [["1"], ["m_V"], ["m_V"], ["1"]] },
  { id: "p-i-iv-V-i", label: "i iv V i", mode: "minor", bars: [["1"], ["4"], ["m_V"], ["1"]] },
  { id: "p-i-iv-i-V-i", label: "i iv i V i", mode: "minor", bars: [["1"], ["4"], ["1", "m_V"], ["1"]] },
  { id: "p-i-iv-V7-i", label: "i iv V7 i", mode: "minor", bars: [["1"], ["4"], ["m_V7"], ["1"]] },
  { id: "p-i-VI-iv-V-i", label: "i VI iv V i", mode: "minor", bars: [["1"], ["6"], ["4", "m_V"], ["1"]] },
];

const R1 = ["whole", "half", "dotHalf", "quarter"];
const R5 = [...R1, "eighthEighth"];
const R6 = [...R5, "quarterRest"];
const R7 = [...R6, "dotQuarterEighth"];
const R8 = [...R7, "fourSixteenths", "eighthSixteenthSixteenth", "sixteenthSixteenthEighth"];
const R10 = [...R8, "dotEighthSixteenth", "eighthQuarterEighth"];

const base: PianoSettings = {
  keys: ["C"], meters: ["4/4", "3/4"], measures: 8, rhythms: R1, maxSkip: 1, reach: 4,
  together: false, tuneHand: "right", patterns: ["root"], chords: ["I", "V"],
  chromatic: false, doubleNotes: false, dynamics: false, bpm: 72,
};
const level = (number: number, summary: string, compare: string, s: Partial<PianoSettings>): PianoLevel => ({
  id: `piano-${String(number).padStart(2, "0")}`,
  number,
  label: `Level ${number}`,
  summary,
  compare,
  settings: { ...base, ...s },
});

export const PIANO_LEVELS: PianoLevel[] = [
  level(1, "Hands taking turns in C position, by step", "before ABRSM Grade 1, RCM Prep", {}),
  level(2, "Skips of a 3rd, and G position", "before ABRSM Grade 1, RCM Level 1", { keys: ["C", "G"], maxSkip: 2 }),
  level(3, "Hands together: the left hand holds the root", "RCM Level 3 begins hands together", {
    keys: ["C", "G"], maxSkip: 2, together: true, patterns: ["root"],
  }),
  level(4, "Fifths, held and rocking; IV; F major; skips of a 4th", "ABRSM Grade 1", {
    keys: ["C", "G", "F"], meters: ["4/4", "3/4", "2/4"], maxSkip: 3, together: true,
    patterns: ["fifth", "rocking", "root"], chords: ["I", "IV", "V"], bpm: 76,
  }),
  level(5, "Chord shapes, held and on each beat; eighths; A and D minor; dynamics", "ABRSM Grade 1-2", {
    keys: ["C", "G", "F", "Am", "Dm"], meters: ["4/4", "3/4", "2/4"], rhythms: R5, maxSkip: 4, together: true,
    patterns: ["block", "blockBeats", "fifth"], chords: ["I", "IV", "V7"], dynamics: true, bpm: 76,
  }),
  level(6, "The tune in the left hand; oom-pah; ii and vi; quarter rests; a 6th's reach", "ABRSM Grade 2", {
    keys: ["C", "G", "F", "Am", "Dm"], meters: ["4/4", "3/4", "2/4"], rhythms: R6, maxSkip: 4, reach: 5, together: true,
    tuneHand: "either", patterns: ["oompah", "blockBeats", "block"], chords: ["I", "ii", "IV", "V", "V7", "vi"], dynamics: true, bpm: 80,
  }),
  level(7, "Broken chords, arpeggios, the waltz; the dotted quarter; D major, E minor", "ABRSM Grade 2-3, RCM Level 4", {
    keys: ["C", "G", "F", "D", "Am", "Dm", "Em"], meters: ["4/4", "3/4", "2/4"], rhythms: R7, maxSkip: 4, reach: 5, together: true,
    tuneHand: "either", patterns: ["waltz", "broken", "arpeggio", "oompah"], chords: ["I", "ii", "IV", "V", "V7", "vi"], dynamics: true, bpm: 84,
  }),
  level(8, "Alberti; thirds and sixths at cadences; an octave's reach; sixteenths", "ABRSM Grade 3", {
    keys: ["C", "G", "F", "D", "A", "Bb", "Am", "Dm", "Em", "Gm"], meters: ["4/4", "3/4", "2/4"], rhythms: R8, maxSkip: 4, reach: 7,
    together: true, patterns: ["alberti", "brokenEighths", "waltz", "arpeggio"], chords: ["I", "ii", "IV", "V", "V7", "vi"],
    doubleNotes: true, dynamics: true, bpm: 88,
  }),
  level(9, "6/8, and chromatic chords (V of V, of vi, of ii)", "ABRSM Grade 4, RCM Level 6", {
    keys: ["C", "G", "F", "D", "A", "Bb", "Eb", "Am", "Dm", "Em", "Gm", "Bm"], meters: ["4/4", "3/4", "2/4", "6/8"], rhythms: R8, maxSkip: 5,
    reach: 7, together: true, patterns: ["alberti", "brokenEighths", "waltz", "arpeggio", "blockBeats"], chords: ["I", "ii", "IV", "V", "V7", "vi"],
    chromatic: true, doubleNotes: true, dynamics: true, bpm: 88,
  }),
  level(10, "Alberti in sixteenths, syncopation, dotted eighths; four sharps or flats: a beginner's Mozart sonata", "ABRSM Grade 5, RCM Level 7", {
    keys: [...ALL_KEYS.major, ...ALL_KEYS.minor], meters: ["4/4", "3/4", "2/4", "6/8"], measures: 12, rhythms: R10, maxSkip: 7,
    reach: 7, together: true, patterns: ["albertiSixteenths", "alberti", "brokenEighths", "waltz", "arpeggio"], chords: ["I", "ii", "IV", "V", "V7", "vi"],
    chromatic: true, doubleNotes: true, dynamics: true, bpm: 76,
  }),
];

export const pianoLevelById: Record<string, PianoLevel> = Object.fromEntries(PIANO_LEVELS.map((l) => [l.id, l]));
export const settingsFor = (levelId: string): PianoSettings => structuredClone((pianoLevelById[levelId] ?? PIANO_LEVELS[0]).settings);

/** Every accompaniment pattern, in the order the levels bring them in. */
export const ALL_PATTERNS: LeftHandPattern[] = [
  "root", "fifth", "rocking", "block", "blockBeats", "oompah", "broken", "arpeggio", "waltz", "brokenEighths", "alberti", "albertiSixteenths",
];

const COMPOUND_PATTERNS = new Set<LeftHandPattern>(["root", "fifth", "rocking", "block", "blockBeats", "brokenEighths", "alberti"]);

/**
 * Whether a pattern can be played in a meter: the waltz only in 3/4 (its 2/4
 * and 4/4 form is oom-pah), oom-pah not in 3/4, and in 6/8 only what fills a
 * dotted-quarter beat (held, rocking, on each beat, broken or Alberti eighths).
 */
export function patternFits(p: LeftHandPattern, meter: string): boolean {
  if (meter === "6/8") return COMPOUND_PATTERNS.has(p);
  if (p === "waltz") return meter === "3/4";
  if (p === "oompah") return meter !== "3/4";
  return true;
}

/** The patterns chosen that suit a meter, or block chords when none does. */
export function patternsFor(settings: Pick<PianoSettings, "patterns">, meter: string): LeftHandPattern[] {
  const ok = settings.patterns.filter((p) => patternFits(p, meter));
  return ok.length ? ok : ["block"];
}

/** What the right hand plays when the tune is in the left: the chord held, or on each beat. */
export const RIGHT_HAND_CHORDS: LeftHandPattern[] = ["block", "blockBeats"];

/**
 * The first level that uses a choice, for the "from Level n" mark beside
 * every option. Null when no level uses it (still on offer).
 */
export function unlockedAt(test: (s: PianoSettings) => boolean): number | null {
  return PIANO_LEVELS.find((l) => test(l.settings))?.number ?? null;
}
