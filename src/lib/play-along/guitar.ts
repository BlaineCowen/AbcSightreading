/**
 * The pitched play-along's strummed guitar: Session Guitarist (Strummed
 * Acoustic, Kontakt) rendered by REAPER into one clip a chord, a file per
 * pattern and tempo (scripts/guitar/build.ts, the files in public/guitar/),
 * and laid under the exercise bar by bar from the progression the melody was
 * written over (`UnisonScore.harmony`). Tests: tests/unit/play-along-guitar.test.ts.
 *
 * Each clip is one steady bar of the pattern on one chord (the second bar of
 * a two-bar hold, so the pattern's own start-up never shows), with a little
 * of its release after. A bar of the exercise plays its chord's clip; a bar
 * split between two chords plays the first chord's clip up to the split and
 * the second's from it, so the strum carries on through the change. The
 * pattern changes with the phrases - its A variation in phrase 1, 3...,
 * its B or C in 2, 4 - and the last bar is an ending: one strum, left to
 * ring. The count-in strums the home chord in the A pattern, so the key is
 * in the ear before the first note.
 *
 * Meters: the 4/4 patterns serve 4/4 and 2/4 (a 2/4 bar is half a 4/4 bar,
 * the halves taken in turn); 3/4 has its own; the compound meters use a
 * triplet pattern written as 4/4 bars of triplets, one of which is a 12/8
 * bar, so 6/8 takes half and 9/8 three quarters, at quarter = dotted quarter.
 */
import { chordNamed } from "../unison-progressions";
import { isCompound, resolveMeter } from "../meter";

/** Pitch classes of the keys' tonics; a minor key is its tonic and an "m" (keyParts). */
const TONIC_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11, Cb: 11,
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

/** A key's tonic pitch class and mode: "F#m" is 6, minor. */
function keyParts(key: string): { tonic: number | undefined; minor: boolean } {
  const k = key.trim();
  const minor = k.length > 1 && k.endsWith("m");
  return { tonic: TONIC_PC[minor ? k.slice(0, -1) : k], minor };
}
const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** A chord as the guitar plays it: its root and quality, e.g. "Bb", "Gm", "C7". */
export interface GuitarChord {
  id: string;
  root: number;
  /** Semitones above the root, the root first (0, 4, 7 for a major chord). */
  intervals: number[];
}

/**
 * The chord a progression's chord name stands for in `key` (a minor key's
 * chords from its natural minor scale, as chords.ts spells them there, the
 * raised leading tone in m_V), or null when it is not one the guitar has.
 */
export function guitarChord(key: string, name: string): GuitarChord | null {
  const { tonic, minor } = keyParts(key);
  const scale = minor ? NATURAL_MINOR : MAJOR;
  const chord = chordNamed(name);
  if (tonic === undefined || !chord) return null;
  const pcOf = (degree: number) => {
    const d = ((degree % 7) + 7) % 7;
    let pc = tonic + scale[d];
    if (chord.sharpScaleDegree === d) pc += 1;
    if (chord.flatScaleDegree === d) pc -= 1;
    return ((pc % 12) + 12) % 12;
  };
  // The chord's own root is its first triad note: an inversion's `root` in
  // chords.ts is its bass note (vi in first inversion, "6-6", has mi there),
  // which named no chord the guitar has, so those bars were silent.
  const root = pcOf(chord.triadNotes[0] ?? chord.root);
  const intervals = [...new Set(chord.triadNotes.map((d) => (pcOf(d) - root + 12) % 12))].sort((a, b) => a - b);
  const quality = intervals.join(",");
  const suffix: Record<string, string> = { "0,4,7": "", "0,3,7": "m", "0,4,7,10": "7", "0,3,6": "dim", "0,3,7,10": "m7" };
  if (!(quality in suffix)) return null;
  // A diminished chord on the leading tone was never rendered; it is the
  // dominant seventh without its root, so the guitar strums V7 for it.
  if (quality === "0,3,6" && root === (tonic + 11) % 12) {
    const v = (tonic + 7) % 12;
    return { id: NAMES[v] + "7", root: v, intervals: [0, 4, 7, 10] };
  }
  // Minor's ii° is a predominant like iv, with two of its notes: the guitar
  // strums iv for it.
  if (quality === "0,3,6" && minor && root === (tonic + 2) % 12) {
    const iv = (tonic + 5) % 12;
    return { id: NAMES[iv] + "m", root: iv, intervals: [0, 3, 7] };
  }
  return { id: NAMES[root] + suffix[quality], root, intervals };
}

/** The guitar's patterns: Kontakt key switches in the saved template (scripts/guitar/template.RPP). */
export const GUITAR_SLOTS = {
  passengerA: 36,
  passengerC: 37,
  campfireA: 38,
  campfireB: 39,
  waltzA: 40,
  waltzB: 41,
  irishC: 42,
  irishA: 43,
} as const;
export type GuitarSlot = keyof typeof GUITAR_SLOTS;

/** The styles offered for 4/4 and 2/4; 3/4 and the compound meters have one each. */
export const GUITAR_STYLES = [
  { id: "passenger", label: "Pop strum" },
  { id: "campfire", label: "Campfire" },
] as const;
export type GuitarStyle = (typeof GUITAR_STYLES)[number]["id"];

/** Which render a meter plays from: its feel, and how much of a rendered bar one of its bars is. */
export function guitarFeel(meter: string): { feel: "straight" | "waltz" | "triplet"; share: number } {
  const m = resolveMeter(meter);
  if (isCompound(meter)) return { feel: "triplet", share: m.beatsPerMeasure / 4 };
  if (m.beatsPerMeasure === 3) return { feel: "waltz", share: 1 };
  return { feel: "straight", share: m.beatsPerMeasure / 4 };
}

/** The A and B patterns (phrase 1 and phrase 2) for a meter and style. */
export function guitarSlots(meter: string, style: GuitarStyle): { a: GuitarSlot; b: GuitarSlot } {
  const { feel } = guitarFeel(meter);
  if (feel === "waltz") return { a: "waltzA", b: "waltzB" };
  if (feel === "triplet") return { a: "irishA", b: "irishC" };
  return style === "campfire" ? { a: "campfireA", b: "campfireB" } : { a: "passengerA", b: "passengerC" };
}

/** The tempos each feel is rendered at (quarter notes, or dotted quarters for triplets); a video warps from the nearest. */
export const GUITAR_TEMPOS: Record<"straight" | "waltz" | "triplet", number[]> = {
  // About a fifth apart, so no video warps a clip more than about 11%
  // (stretched much further, a held chord smears). Nothing slower is needed:
  // below GUITAR_DOUBLE_BELOW the guitar plays at twice the tempo, up to 130.
  straight: [75, 90, 110, 130],
  waltz: [75, 90, 110, 130],
  // Session Guitarist plays its triplet patterns from 65 up; slower is silence.
  triplet: [65, 80, 95, 115],
};

/**
 * Slow, a strummed bar has too few strums to carry the music: below these
 * tempos the guitar plays in double time, the pattern at twice the tempo,
 * two of its bars to each bar of music.
 */
export const GUITAR_DOUBLE_BELOW: Record<"straight" | "waltz" | "triplet", number> = { straight: 67, waltz: 67, triplet: 59 };

/** Whether the guitar plays in double time at `bpm` in `meter`. */
export function guitarDouble(meter: string, bpm: number): boolean {
  return bpm < GUITAR_DOUBLE_BELOW[guitarFeel(meter).feel];
}

/**
 * The guitar part in double time: each bar of music spans twice its share of
 * rendered bars, taken in order (a 4/4 bar is two rendered bars, the second
 * from its downbeat), and a split bar's two chords fall where they fall. The
 * count-in and the ending as in `guitarPart`.
 */
function doubleTimePart(
  harmony: string[][],
  o: { key: string; meter: string; style: GuitarStyle; splitAt: number; countInBars?: number },
): GuitarPiece[] {
  const share = guitarFeel(o.meter).share * 2;
  const { a, b } = guitarSlots(o.meter, o.style);
  const pieces: GuitarPiece[] = [];
  // From `start` to `end` of bar i (fractions of it), in rendered bars, cut at each rendered barline.
  const span = (i: number, start: number, end: number, chord: string, slot: GuitarSlot) => {
    let x = (i + start) * share;
    const stop = (i + end) * share;
    while (x < stop - 1e-9) {
      const bar = Math.floor(x + 1e-9);
      const y = Math.min(stop, bar + 1);
      pieces.push({ at: x / share, chord, slot, from: x - bar, to: y - bar });
      x = y;
    }
  };
  const home = guitarChord(o.key, "1")?.id;
  for (let i = -(o.countInBars ?? 0); i < 0 && home; i++) span(i, 0, 1, home, a);
  harmony.forEach((bar, i) => {
    const slot = Math.floor(i / 4) % 2 === 0 ? a : b;
    const chords = bar.map((name) => guitarChord(o.key, name)?.id ?? null);
    if (i === harmony.length - 1) {
      if (chords[0]) pieces.push({ at: i, chord: chords[chords.length - 1] ?? chords[0], slot: a, from: 0, to: 1, ending: true });
      return;
    }
    if (chords.length > 1) {
      if (chords[0]) span(i, 0, o.splitAt, chords[0], slot);
      if (chords[1]) span(i, o.splitAt, 1, chords[1], slot);
      return;
    }
    if (chords[0]) span(i, 0, 1, chords[0], slot);
  });
  return pieces;
}

/** The rendered tempo to warp from for `bpm`: the nearest by ratio. */
export function nearestGuitarTempo(feel: "straight" | "waltz" | "triplet", bpm: number): number {
  return GUITAR_TEMPOS[feel].reduce((best, t) => (Math.abs(Math.log(t / bpm)) < Math.abs(Math.log(best / bpm)) ? t : best));
}

/** The keys the Unison page offers. */
export const GUITAR_KEYS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m"];
/**
 * The keys whose chords are rendered: all twelve, since the page's playback
 * transpose can move any of its keys to any other.
 */
export const GUITAR_RENDER_KEYS = [...NAMES];

/** The key `semitones` above (or below) `key`, named by pitch class: the guitar's chords are. */
export function transposeKey(key: string, semitones: number): string {
  const { tonic, minor } = keyParts(key);
  if (tonic === undefined || !semitones) return key;
  return NAMES[(((tonic + semitones) % 12) + 12) % 12] + (minor ? "m" : "");
}

/**
 * One piece of the guitar part: play `chord` from the clip's `from` to its
 * `to` (fractions of a rendered bar), starting `at` (in bars from the first
 * bar of music), from pattern `slot`; `ending` is the final strum.
 */
export interface GuitarPiece {
  at: number;
  chord: string;
  slot: GuitarSlot;
  from: number;
  to: number;
  ending?: boolean;
}

/**
 * The guitar part for an exercise: its harmony (one or two chord names a bar)
 * in `key` and `meter`, the pattern alternating A and B by four-bar phrase,
 * the last bar an ending. Chords the guitar has no clip for are left out.
 */
export function guitarPart(
  harmony: string[][],
  o: { key: string; meter: string; style: GuitarStyle; splitAt: number; countInBars?: number; transpose?: number; double?: boolean },
): GuitarPiece[] {
  // The page's playback transpose moves the whole band, the guitar with it.
  const key = transposeKey(o.key, o.transpose ?? 0);
  if (o.double) return doubleTimePart(harmony, { ...o, key });
  const { share } = guitarFeel(o.meter);
  const { a, b } = guitarSlots(o.meter, o.style);
  const pieces: GuitarPiece[] = [];
  // A bar shorter than the rendered one takes the rendered bar's parts in
  // turn (2/4: its halves), so the pattern runs on rather than repeating;
  // counted from the first bar of music, the count-in's bars before it.
  const parts = Math.round(1 / share);
  const offsetOf = (i: number) => (parts > 1 ? (((i % parts) + parts) % parts) * share : 0);
  const home = guitarChord(key, "1")?.id;
  for (let i = -(o.countInBars ?? 0); i < 0 && home; i++) {
    pieces.push({ at: i, chord: home, slot: a, from: offsetOf(i), to: offsetOf(i) + share });
  }
  harmony.forEach((bar, i) => {
    const slot = Math.floor(i / 4) % 2 === 0 ? a : b;
    const offset = offsetOf(i);
    const chords = bar.map((name) => guitarChord(key, name)?.id ?? null);
    if (i === harmony.length - 1) {
      if (chords[0]) pieces.push({ at: i, chord: chords[chords.length - 1] ?? chords[0], slot: a, from: 0, to: 1, ending: true });
      return;
    }
    if (chords.length > 1) {
      // The split, as a fraction of this bar, then of the rendered bar.
      const split = o.splitAt * share;
      if (chords[0]) pieces.push({ at: i, chord: chords[0], slot, from: offset, to: offset + split });
      if (chords[1]) pieces.push({ at: i + o.splitAt, chord: chords[1], slot, from: offset + split, to: offset + share });
      return;
    }
    if (chords[0]) pieces.push({ at: i, chord: chords[0], slot, from: offset, to: offset + share });
  });
  return pieces;
}
