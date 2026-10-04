/**
 * The bass line under a pitched play-along video: one chord a bar, its root
 * held for the whole bar. Tests: tests/unit/play-along-bass.test.ts.
 *
 * The Unison generator gives every melody note its own chord, and they change
 * about every note and a half (82 changes in 116 notes over 32 bars), often
 * inverted - a bass following them would move on almost every note. So each
 * bar takes the one chord that best fits the bar's melody: each note on one
 * of the chord's tones counts for it and each off them against it, weighted
 * by how long the note is and how strong its beat (the downbeat most). The
 * candidates are the chords the generator used in the bar, slightly
 * preferred, and the six main diatonic triads: choosing only among the
 * generator's own put 70% of the sung time on a chord tone, where the best
 * triad a bar reaches about 80%. The last bar is the home chord and the
 * one before it the dominant when the melody there allows, so the line ends
 * like a cadence. A bar of rests keeps the chord before it. A diminished
 * chord on the leading tone (vii, or minor's raised vii) takes the dominant's
 * root: it is a dominant without its root, and the leading tone held a bar in
 * the bass sounded unsettled; minor's own VII, a whole tone below, stays.
 *
 * An exercise written over a progression (unison-progressions.ts) carries
 * its harmony, and the bass plays that instead (`progressionChords`): the
 * melody was written against those chords, so nothing need be guessed. A bar
 * with two chords splits where the progression splits it.
 */
import { keySignatures } from "../../resources/key-signatures";
import { chordNamed, splitAt } from "../unison-progressions";

/** What the bass needs of a chord: its root and tones as scale degrees (0-6), and any chromatic step. */
export interface HarmonyChord {
  name: string;
  root: number;
  triadNotes: number[];
  sharpScaleDegree?: number;
  flatScaleDegree?: number;
}

/** A melody note as the bass reads it: length in 32nds, scale degree (0-6), its chord. */
export interface HarmonyNote {
  length: number;
  degree: number;
  rest?: boolean;
  chord: HarmonyChord | null;
}

export interface BarChord {
  /** Scale degree of the root, 0-6 (0 the key's tonic). */
  root: number;
  /** A chromatic root (a secondary leading-tone chord, say): raised, lowered or neither. */
  shift: "up" | "down" | null;
  name: string;
}

const TONIC: BarChord = { root: 0, shift: null, name: "1" };
/** I, ii, iii, IV, V, vi as scale-degree triads (vii's diminished triad left out: it rarely carries a bar). */
const DIATONIC: HarmonyChord[] = [0, 1, 2, 3, 4, 5].map((r) => ({ name: String(r + 1), root: r, triadNotes: [r, (r + 2) % 7, (r + 4) % 7] }));
/** How much a chord the generator chose for the bar is preferred, as a share of the bar's weight. */
const OWN_PREFERENCE = 0.08;
const DOMINANT_TONES = [4, 6, 1];

const isTone = (chord: HarmonyChord, degree: number) =>
  chord.triadNotes.some((t) => ((t % 7) + 7) % 7 === ((degree % 7) + 7) % 7);

/** How much a note's place in the bar counts: the downbeat most, then the other beats. */
function beatWeight(at: number, beatUnits: number): number {
  if (at === 0) return 2;
  if (at % beatUnits === 0) return 1.4;
  return 1;
}

/** vii (or minor's raised vii) as the bass: the dominant's root, the chord it stands in for. */
function dominantForLeadingTone(chord: BarChord, minor: boolean): BarChord {
  const leadingTone = chord.root === 6 && (minor ? chord.shift === "up" : chord.shift === null);
  return leadingTone ? { root: 4, shift: null, name: "5" } : chord;
}

function rootOf(chord: HarmonyChord): BarChord {
  const shift = chord.sharpScaleDegree === chord.root ? "up" : chord.flatScaleDegree === chord.root ? "down" : null;
  return { root: chord.root, shift, name: chord.name };
}

/**
 * One chord a bar for the exercise `notes`, in bars of `barUnits` 32nds with
 * beats of `beatUnits`. Notes are assumed not to cross a barline (the video
 * writes its exercises with ties across the barline off).
 */
export function barChords(notes: HarmonyNote[], barUnits: number, beatUnits: number, minor = false): BarChord[] {
  const bars: { note: HarmonyNote; at: number }[][] = [];
  let pos = 0;
  for (const note of notes) {
    const bar = Math.floor(pos / barUnits);
    (bars[bar] ??= []).push({ note, at: pos - bar * barUnits });
    pos += note.length;
  }
  const count = Math.ceil(pos / barUnits);
  const out: BarChord[] = [];
  let previous: BarChord = TONIC;
  for (let b = 0; b < count; b++) {
    const sung = (bars[b] ?? []).filter((x) => !x.note.rest);
    const score = (chord: HarmonyChord) =>
      sung.reduce((sum, { note, at }) => sum + note.length * beatWeight(at, beatUnits) * (isTone(chord, note.degree) ? 1 : -0.6), 0);
    if (sung.length === 0) {
      out.push(previous);
      continue;
    }
    // The chords the generator itself used in this bar, each once, first; then the diatonic triads.
    const own = [...new Map(sung.filter((x) => x.note.chord).map((x) => [x.note.chord!.name, x.note.chord!])).values()];
    const ownNames = new Set(own.map((c) => c.name));
    const weight = sung.reduce((sum, { note, at }) => sum + note.length * beatWeight(at, beatUnits), 0);
    const rated = (c: HarmonyChord) => score(c) + (ownNames.has(c.name) ? OWN_PREFERENCE * weight : 0);
    const candidates = [...own, ...DIATONIC.filter((d) => !ownNames.has(d.name))];
    // Best fit; on a tie, the earlier - the generator's own, from the bar's first sung note.
    let best = candidates[0];
    for (const c of candidates) if (rated(c) > rated(best)) best = c;
    previous = dominantForLeadingTone(rootOf(best), minor);
    out.push(previous);
  }

  // A cadence: the home chord last, the dominant before it when the melody there fits it.
  if (out.length >= 1) out[out.length - 1] = TONIC;
  if (out.length >= 3) {
    const sung = (bars[out.length - 2] ?? []).filter((x) => !x.note.rest);
    const dominant: HarmonyChord = { name: "5", root: 4, triadNotes: DOMINANT_TONES };
    const fit = sung.reduce((sum, { note, at }) => sum + note.length * beatWeight(at, beatUnits) * (isTone(dominant, note.degree) ? 1 : -0.6), 0);
    if (sung.length && fit > 0) out[out.length - 2] = { root: 4, shift: null, name: "5" };
  }
  return out;
}

/** A bar of the bass: one chord, or two splitting the bar (splitAt). */
export type BassBar = BarChord | BarChord[];

/** The bass for an exercise written over a progression: its chords' roots, bar by bar. */
export function progressionChords(harmony: string[][]): BassBar[] {
  const toBar = (name: string): BarChord => {
    const chord = chordNamed(name);
    return chord ? rootOf(chord) : { root: 0, shift: null, name };
  };
  return harmony.map((bar) => (bar.length > 1 ? bar.map(toBar) : toBar(bar[0])));
}

/** Note lengths one note can be, longest first (32nds), in simple and in compound meter (dotted beats). */
const WRITABLE_SIMPLE = [32, 24, 16, 12, 8, 4];
const WRITABLE_COMPOUND = [48, 24, 12, 4];

/** A bar's length as one note, or tied notes where one will not do (9/8's 36 is a dotted half tied to a dotted quarter). */
function tiedLength(letter: string, units: number, compound: boolean): string {
  const writable = compound ? WRITABLE_COMPOUND : WRITABLE_SIMPLE;
  const parts: number[] = [];
  let left = units;
  while (left > 0) {
    const w = writable.find((x) => x <= left) ?? left;
    parts.push(w);
    left -= w;
  }
  return parts.map((p) => `${letter}${p}`).join("-");
}

/**
 * The ABC pitch of a root in the bass register, E2 to D3 (where every letter
 * falls once), spelled for `key`: a raised or lowered root gets the accidental
 * it needs against the key signature (raising a flatted note is a natural).
 */
export function bassNote(key: string, chord: BarChord): string {
  const info = keySignatures[key];
  if (!info) throw new Error(`Unknown key ${key}`);
  const letterIndex = (info.rootOffset + chord.root) % 7;
  // E, F, G, A, B, then c d - E2..D3: "E," "F," "G," "A," "B," "C" "D".
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const name = letters[letterIndex];
  const pitch = letterIndex >= 2 ? `${name},` : name;
  if (!chord.shift) return pitch;
  const keyRaises = info.sharps.includes(chord.root);
  const keyLowers = info.flats.includes(chord.root);
  if (chord.shift === "up") return `${keyLowers ? "=" : keyRaises ? "^^" : "^"}${pitch}`;
  return `${keyRaises ? "=" : keyLowers ? "__" : "_"}${pitch}`;
}

/**
 * The bass as an ABC tune: one note a bar (two where a bar has two chords),
 * on bass guitar (MIDI program 33), in the exercise's key and meter.
 */
export function bassAbc(chords: BassBar[], o: { key: string; meter: string; barUnits: number; program?: number }): string {
  const compound = /\/8$/.test(o.meter);
  const split = splitAt(o.barUnits, compound ? 12 : 8);
  const bar = (c: BassBar) =>
    Array.isArray(c)
      ? `${tiedLength(bassNote(o.key, c[0]), split, compound)} ${tiedLength(bassNote(o.key, c[1]), o.barUnits - split, compound)}`
      : tiedLength(bassNote(o.key, c), o.barUnits, compound);
  const body = chords.map(bar).join(" |") + " |]";
  return `X:1\nM:${o.meter}\nL:1/32\n%%MIDI program ${o.program ?? 33}\nK:${o.key} clef=bass\n${body}\n`;
}

/** The exercise's melody notes as the bass reads them, from a generated UnisonScore's part. */
export function harmonyNotes(chordNoteObject: { noteLength: number; degree: number; chord: HarmonyChord | null; rhythm?: { rest?: boolean } | null }[]): HarmonyNote[] {
  return chordNoteObject.map((n) => ({ length: n.noteLength, degree: n.degree, rest: n.rhythm?.rest === true, chord: n.chord }));
}
