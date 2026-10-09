/**
 * The piano levels, in the order piano method books teach: one new thing a
 * level, the new thing on familiar material, the right hand's tune always
 * over a left hand that plays the same chords.
 *
 *   1  C position, hands taking turns a phrase each; steps only
 *   2  the same with skips of a 3rd; G position
 *   3  hands together: the left hand holds the root, on I and V
 *   4  open fifths on I, IV and V
 *   5  block chords in the shapes a beginner learns (I, IV, V7); eighths
 *   6  F major; the chord repeated on each beat; ii and vi
 *   7  broken chords, and the waltz bass in 3/4
 *   8  Alberti bass; a third or sixth under the tune at cadences; an octave's reach
 *
 * Written against what Sight Reading Factory's piano levels do (8 October
 * 2026, notes/srf-piano-study.md): their left hand is a second tune and never
 * an accompaniment, and a chord is a coin flip on any note a quarter or
 * longer, the extra note above or below the tune at random. Here the left
 * hand is the accompaniment a method book teaches, and the right hand takes a
 * second note only at a cadence, under the tune.
 *
 * Ids are stored as class progress and in links. Never rename or reuse one.
 */
import type { Progression } from "../unison-progressions";

export type LeftHandPattern =
  | "tune" // a five-finger line, hands taking turns (levels 1-2)
  | "root" // the root, held for the chord
  | "fifth" // root and fifth together, held
  | "block" // the chord in close position, held
  | "blockBeats" // the chord on every beat
  | "broken" // root, fifth, third, fifth: one note a beat
  | "waltz" // root, then the chord twice (3/4)
  | "alberti"; // low, high, middle, high in eighths

export interface PianoLevel {
  /** Stable: stored as class progress and in links. Never rename. */
  id: string;
  number: number;
  label: string;
  /** One line: what is new at this level. */
  summary: string;
  keys: string[];
  meters: string[];
  /** Bars, by default; the length pill offers 4, 8 and 16. */
  measures: number;
  /** Simple-meter figures (selectable-rhythms names) the right hand reads. */
  rhythms: string[];
  /** Largest move in the tune, in diatonic steps (1 a step, 2 a 3rd). */
  maxSkip: number;
  /** The right hand's reach above its thumb, in diatonic steps: 4 is a five-finger position, 7 an octave. */
  reach: number;
  /** Hands take turns a phrase at a time (no left-hand chords), or play together. */
  together: boolean;
  /** Left-hand patterns, by meter; the first that suits the meter is drawn most. */
  leftHand: LeftHandPattern[];
  /** Chord names (chords.ts) the progressions may use. */
  chords: string[];
  /** A third or sixth under the tune on long notes at cadences. */
  rightHandThirds: boolean;
  bpm: number;
}

/**
 * The progressions the piano draws from, by the chords a level allows: a
 * progression is used only when each of its chords is one the level lists
 * (writeProgressionLine). Four bars, repeated, each phrase home on I.
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
];

const BASIC = ["quarter", "half", "whole", "dotHalf"];
const WITH_EIGHTHS = [...BASIC, "eighthEighth"];
const WITH_DOTTED = [...WITH_EIGHTHS, "dotQuarterEighth", "quarterRest"];

export const PIANO_LEVELS: PianoLevel[] = [
  {
    id: "piano-01", number: 1, label: "Level 1", summary: "C position, hands taking turns, steps",
    keys: ["C"], meters: ["4/4", "3/4"], measures: 8, rhythms: BASIC, maxSkip: 1, reach: 4,
    together: false, leftHand: ["tune"], chords: ["1", "5"], rightHandThirds: false, bpm: 72,
  },
  {
    id: "piano-02", number: 2, label: "Level 2", summary: "Skips of a 3rd, and G position",
    keys: ["C", "G"], meters: ["4/4", "3/4"], measures: 8, rhythms: BASIC, maxSkip: 2, reach: 4,
    together: false, leftHand: ["tune"], chords: ["1", "5"], rightHandThirds: false, bpm: 72,
  },
  {
    id: "piano-03", number: 3, label: "Level 3", summary: "Hands together: the left hand holds the root",
    keys: ["C", "G"], meters: ["4/4", "3/4"], measures: 8, rhythms: BASIC, maxSkip: 2, reach: 4,
    together: true, leftHand: ["root"], chords: ["1", "5"], rightHandThirds: false, bpm: 72,
  },
  {
    id: "piano-04", number: 4, label: "Level 4", summary: "Open fifths, and the IV chord",
    keys: ["C", "G"], meters: ["4/4", "3/4", "2/4"], measures: 8, rhythms: BASIC, maxSkip: 2, reach: 4,
    together: true, leftHand: ["fifth", "root"], chords: ["1", "4", "5"], rightHandThirds: false, bpm: 76,
  },
  {
    id: "piano-05", number: 5, label: "Level 5", summary: "Block chords (I, IV, V7), and eighth notes",
    keys: ["C", "G"], meters: ["4/4", "3/4", "2/4"], measures: 8, rhythms: WITH_EIGHTHS, maxSkip: 3, reach: 4,
    together: true, leftHand: ["block", "fifth"], chords: ["1", "4", "5-7"], rightHandThirds: false, bpm: 76,
  },
  {
    id: "piano-06", number: 6, label: "Level 6", summary: "F major, chords on every beat, ii and vi",
    keys: ["C", "G", "F"], meters: ["4/4", "3/4", "2/4"], measures: 8, rhythms: WITH_EIGHTHS, maxSkip: 3, reach: 4,
    together: true, leftHand: ["blockBeats", "block"], chords: ["1", "2", "4", "5", "5-7", "6"], rightHandThirds: false, bpm: 80,
  },
  {
    id: "piano-07", number: 7, label: "Level 7", summary: "Broken chords, and the waltz bass",
    keys: ["C", "G", "F", "D"], meters: ["4/4", "3/4", "2/4"], measures: 8, rhythms: WITH_DOTTED, maxSkip: 4, reach: 5,
    together: true, leftHand: ["waltz", "broken", "block"], chords: ["1", "2", "4", "5", "5-7", "6"], rightHandThirds: false, bpm: 84,
  },
  {
    id: "piano-08", number: 8, label: "Level 8", summary: "Alberti bass, thirds and sixths at cadences, an octave's reach",
    keys: ["C", "G", "F", "D", "Bb"], meters: ["4/4", "3/4", "2/4"], measures: 8, rhythms: WITH_DOTTED, maxSkip: 4, reach: 7,
    together: true, leftHand: ["alberti", "waltz", "broken"], chords: ["1", "2", "4", "5", "5-7", "6"], rightHandThirds: true, bpm: 88,
  },
];

export const pianoLevelById: Record<string, PianoLevel> = Object.fromEntries(PIANO_LEVELS.map((l) => [l.id, l]));

/** The patterns a level's left hand can play in a meter: the waltz only in 3/4, Alberti and broken chords not in 3/4's short bars. */
export function patternsFor(level: PianoLevel, meter: string): LeftHandPattern[] {
  const fits = (p: LeftHandPattern) => (p === "waltz" ? meter === "3/4" : true);
  const ok = level.leftHand.filter(fits);
  return ok.length ? ok : ["block"];
}
