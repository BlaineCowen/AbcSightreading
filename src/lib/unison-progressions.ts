/**
 * Harmony first, for diatonic Unison exercises: a chord progression is chosen
 * before a note is written, repeated through the exercise, and the line is
 * written against it. Tests: tests/unit/unison-progressions.test.ts.
 *
 * The older walk (generateUnison.ts generateChordProgression) works the other
 * way round: it picks a chord for almost every note, to justify wherever the
 * line went, so the harmony under it changes every note or two and nothing
 * built on it (a bass, a pad) sits with the melody. Here the harmony is a
 * short progression a bar or half a bar at a time, the kind a band plays, and
 * the melody belongs to it:
 *
 * - On a strong beat (the downbeat, the middle of a four-beat bar, wherever
 *   the chord changes) and on any note longer than a beat, the melody sings a
 *   note of the chord.
 * - Elsewhere it may sing another scale note as a passing or neighbour note:
 *   approached by step and left by step, never into a rest or the end.
 * - Every move is one the exercise allows (its skips, exact skips too, and
 *   Max 8th / 16th skip inside a figure); it starts on do, mi or so and ends
 *   on do.
 *
 * The progression repeats every four bars, each time ending at home; lengths
 * that are not whole phrases take the progression's last bars to finish.
 * Chromatic progressions are for later: with an altered note selected the
 * older walk writes the exercise.
 *
 * The writer returns exactly what the older walk returns, a chord and a note
 * per rhythm slot, so everything after it (spelling, solfège, chord symbols,
 * the ABC) is unchanged.
 */
import type { Chord } from "../types/ChordSet";
import type { RhythmWithPattern } from "./types";
import { isAllowedMove, type SkipPolicy } from "./skip-policy";
import { figureCap, type ShortCaps } from "./short-note-skips";
import { chords as ALL_CHORDS } from "../resources/chords";

export interface Progression {
  id: string;
  /** How it reads, in Roman numerals. */
  label: string;
  mode: "major" | "minor";
  /** Four bars, each one chord or two (the bar split in half), as chord names in chords.ts. */
  bars: string[][];
}

/**
 * The progressions an exercise is written over: one chosen per exercise,
 * repeated. Minor uses the natural minor's own chords (v, not V: the raised
 * leading tone is an altered note, for the chromatic progressions to come).
 */
export const PROGRESSIONS: Progression[] = [
  {
    id: "I-IV-V-I",
    label: "I IV V I",
    mode: "major",
    bars: [["1"], ["4"], ["5"], ["1"]],
  },
  {
    id: "I-IV-I-V-I",
    label: "I IV I V I",
    mode: "major",
    bars: [["1"], ["4"], ["1", "5"], ["1"]],
  },
  {
    id: "I-V-vi-IV-I",
    label: "I V vi IV I",
    mode: "major",
    bars: [["1"], ["5"], ["6", "4"], ["1"]],
  },
  {
    id: "I-vi-IV-V-I",
    label: "I vi IV V I",
    mode: "major",
    bars: [["1"], ["6"], ["4", "5"], ["1"]],
  },
  {
    id: "I-ii-V-I",
    label: "I ii V I",
    mode: "major",
    bars: [["1"], ["2"], ["5"], ["1"]],
  },
  {
    id: "I-vi-ii-V-I",
    label: "I vi ii V I",
    mode: "major",
    bars: [["1"], ["6"], ["2", "5"], ["1"]],
  },
  {
    id: "i-iv-v-i",
    label: "i iv v i",
    mode: "minor",
    bars: [["1"], ["4"], ["5"], ["1"]],
  },
  {
    id: "i-VI-iv-v-i",
    label: "i VI iv v i",
    mode: "minor",
    bars: [["1"], ["6"], ["4", "5"], ["1"]],
  },
  {
    id: "i-VI-VII-i",
    label: "i VI VII i",
    mode: "minor",
    bars: [["1"], ["6"], ["7"], ["1"]],
  },
  {
    id: "i-VII-VI-VII-i",
    label: "i VII VI VII i",
    mode: "minor",
    bars: [["1"], ["7"], ["6", "7"], ["1"]],
  },
];

/** The progression's bars laid over `measures` bars: repeated, and finishing on its own last bars. */
export function barsFor(
  progression: Progression,
  measures: number,
): string[][] {
  const n = progression.bars.length;
  const out: string[][] = [];
  const whole = Math.floor(measures / n);
  for (let k = 0; k < whole; k++) out.push(...progression.bars);
  const left = measures - whole * n;
  if (left > 0) out.push(...progression.bars.slice(n - left));
  return out;
}

/** Where a split bar's second chord starts: half way, or after the first of two uneven halves (3/4: 2 + 1). */
export function splitAt(barUnits: number, beatUnits: number): number {
  const beats = Math.max(1, Math.round(barUnits / beatUnits));
  return Math.ceil(beats / 2) * beatUnits;
}

/** The chord name sounding at `pos` (32nds from the start). */
export function chordAt(
  bars: string[][],
  pos: number,
  barUnits: number,
  beatUnits: number,
): string {
  const bar = bars[Math.min(bars.length - 1, Math.floor(pos / barUnits))];
  const at = pos % barUnits;
  return bar.length > 1 && at >= splitAt(barUnits, beatUnits) ? bar[1] : bar[0];
}

// ------------------------------------------------------------- chromatic

/**
 * Chords the chromatic progressions need that chords.ts lacks: the borrowed
 * minor tonic (me), the flat seventh chord (te, rock's ♭VII) and the
 * Neapolitan (ra, in minor, where its le is the key's own). Each alters one
 * note, as chords.ts's do, which is what the spelling reads.
 */
export const EXTRA_CHORDS: Chord[] = [
  { name: "u_borrowed_i", symbol: "i", root: 0, chordFamily: "u_borrowed_i", triadNotes: [0, 2, 4], nextChordPossibilities: [], type: "tonic", sharpScaleDegree: undefined, flatScaleDegree: 2, baseMultiplier: 1 } as Chord,
  { name: "u_b7", symbol: "♭VII", root: 6, chordFamily: "u_b7", triadNotes: [6, 1, 3], nextChordPossibilities: [], type: "predominant", sharpScaleDegree: undefined, flatScaleDegree: 6, baseMultiplier: 1 } as Chord,
  { name: "u_N", symbol: "♭II", root: 1, chordFamily: "u_N", triadNotes: [1, 3, 5], nextChordPossibilities: [], type: "predominant", sharpScaleDegree: undefined, flatScaleDegree: 1, baseMultiplier: 1 } as Chord,
];

/** A chord by name: chords.ts, then the ones above. */
export function chordNamed(name: string): Chord | undefined {
  return ALL_CHORDS.find((c) => c.name === name) ?? EXTRA_CHORDS.find((c) => c.name === name);
}

export type Alteration = "sharp" | "flat";

/**
 * What a chromatic phrase does with one altered note (degree 0-based, as the
 * generator counts). With `progressions`, a chord of its own carries it: the
 * note is a chord tone, on a strong beat if the line likes, resolving by step
 * into the next chord. Without, it is a chromatic passing or neighbour note
 * over the phrase's diatonic chords: on a weak beat, stepped into, resolving
 * by step the way it leans.
 */
export interface ChromaticNote {
  degree: number;
  alter: Alteration;
  progressions?: string[][][];
}

/** The chromatic notes with a chord of their own, by mode. Everything else is a passing note. */
const CHROMATIC_CHORDS: Record<"major" | "minor", ChromaticNote[]> = {
  major: [
    // fi: V/V, fa fi so.
    { degree: 3, alter: "sharp", progressions: [[["1"], ["4", "5/5"], ["5"], ["1"]], [["1"], ["2", "5/5"], ["5"], ["1"]]] },
    // si: V/vi, to la.
    { degree: 4, alter: "sharp", progressions: [[["1"], ["5/6", "6"], ["4", "5"], ["1"]], [["1"], ["4", "5/6"], ["6", "5"], ["1"]]] },
    // di: V/ii, to re.
    { degree: 0, alter: "sharp", progressions: [[["1"], ["5/2"], ["2", "5"], ["1"]], [["1"], ["6", "5/2"], ["2", "5"], ["1"]]] },
    // te: V7/IV or the flat seventh chord, down to la.
    { degree: 6, alter: "flat", progressions: [[["1"], ["1-7"], ["4", "5"], ["1"]], [["1"], ["u_b7"], ["4"], ["1"]]] },
    // le: the borrowed iv, down to so.
    { degree: 5, alter: "flat", progressions: [[["1"], ["4"], ["m4"], ["1"]], [["1"], ["m4"], ["5"], ["1"]]] },
    // me: the borrowed minor tonic, down to re.
    { degree: 2, alter: "flat", progressions: [[["1"], ["u_borrowed_i"], ["5"], ["1"]], [["1"], ["4"], ["u_borrowed_i", "5"], ["1"]]] },
  ],
  minor: [
    // The Neapolitan (lowered 2: ra do-based, te la-based), down to the tonic
    // and on to the leading tone.
    { degree: 1, alter: "flat", progressions: [[["1"], ["4"], ["u_N", "5"], ["1"]]] },
    // The raised leading tone (si la-based, ti do-based): harmonic minor's
    // major V (chords.ts m_V), up to the tonic.
    { degree: 6, alter: "sharp", progressions: [[["1"], ["4"], ["m_V"], ["1"]], [["1"], ["6"], ["4", "m_V"], ["1"]], [["1"], ["m_V"], ["4", "m_V"], ["1"]]] },
  ],
};

/** How `alter` of `degree` is written in a chromatic phrase: over a chord of its own, or passing. */
export function chromaticNoteFor(degree: number, alter: Alteration, minor: boolean): ChromaticNote {
  return (
    CHROMATIC_CHORDS[minor ? "minor" : "major"].find((c) => c.degree === degree && c.alter === alter) ?? {
      degree,
      alter,
    }
  );
}

/**
 * A short exercise's chromatic phrase, cut to `r` bars so that it keeps its
 * chromatic chord: from that chord's bar to the end, or (one bar) the chord
 * and home in a bar.
 */
function chromaticTail(bars: string[][], r: number, isChromatic: (name: string) => boolean): string[][] {
  if (r >= bars.length) return bars;
  const at = bars.findIndex((b) => b.some(isChromatic));
  if (r === 1) {
    const chord = bars[at]?.find(isChromatic);
    return chord ? [[chord, "1"]] : [["1"]];
  }
  const from = Math.min(at, bars.length - r);
  const tail = bars.slice(from, from + r);
  tail[tail.length - 1] = ["1"];
  return tail;
}

// ------------------------------------------------------------------ writing

type LineNote = {
  name: string;
  degree: number;
  pitchValue: number;
  [k: string]: unknown;
};

export interface ProgressionLineInput {
  /** The notes of the range, low to high (the walk's `unisonNoteList`). */
  noteList: LineNote[];
  /** Selected scale degrees, 0-based. */
  scaleDegrees: number[];
  /** The chords available (the walk's filtered list); a progression is used only if all its chords are here. */
  chords: Chord[];
  rhythm: RhythmWithPattern[];
  barUnits: number;
  beatUnits: number;
  measures: number;
  minor: boolean;
  policy: SkipPolicy;
  shortCaps: ShortCaps;
  /** Selected chromatic degrees, 0-based: each gets a chromatic phrase. */
  sharps?: number[];
  flats?: number[];
  /** For tests: a progression by id instead of a random one. */
  progressionId?: string;
  /** The progressions to choose from, when not the table above (the piano levels have their own, I and V only at first). */
  progressions?: Progression[];
}

export interface ProgressionLine {
  progression: Progression;
  /** The chord names, bar by bar (one or two a bar). */
  harmony: string[][];
  /** Per rhythm slot, as generateChordProgression returns them. */
  chordProgression: { chord: Chord; length: number; triadDegrees: number[] }[];
  notes: LineNote[];
}

/** How many tries the search gets (nodes visited) before the writer gives up on this rhythm. */
const SEARCH_BUDGET = 8000;
/** How much more an altered note is wanted where one may go: it is what the phrase is for. */
const ALTERED_WEIGHT = 4;
/** A repeated pitch, and a return to the note two before (A-B-A), against a step (3). */
const REPEAT_WEIGHT = 0.35;
const ABA_WEIGHT = 0.35;

const mod7 = (n: number) => ((n % 7) + 7) % 7;

/** Lines written over different progressions before the one that marks time least is kept. */
const LINE_CHOICES = 4;

/**
 * How much a line marks time: each sung note on the pitch before it, and
 * half for each return to the pitch two before (mi re mi). A note held
 * inside a figure (cap 0, a pair on one pitch) is the figure's, not the
 * line's, and does not count; a rest is not sung.
 */
export function markingTime(notes: LineNote[], rhythm: { rest?: boolean }[]): number {
  const sung = notes.filter((_, k) => !rhythm[k]?.rest).map((n) => n.pitchValue);
  let cost = 0;
  for (let k = 1; k < sung.length; k++) {
    if (sung[k] === sung[k - 1]) cost += 1;
    else if (k >= 2 && sung[k] === sung[k - 2]) cost += 0.5;
  }
  return cost;
}

/** A note the line may sing: a natural note of the range, or one altered. */
type Cand = { note: LineNote; alter: Alteration | null; tone: boolean };

/**
 * Writes the line, or returns null when no progression fits the selection
 * or no line could be found over this rhythm (the caller then uses the
 * older walk, so this never fails an exercise the walk would have written).
 *
 * With chromatic notes selected the phrases pair up: a diatonic progression,
 * then a chromatic one, so the altered note comes after the key is set. Odd
 * phrases (1, 3...) are the diatonic progression, even ones chromatic, each
 * selected note taking its turn; a four-bar exercise is the chromatic phrase.
 */
export function writeProgressionLine(input: ProgressionLineInput): ProgressionLine | null {
  const { noteList, rhythm, barUnits, beatUnits, policy, shortCaps } = input;
  const selected = new Set(input.scaleDegrees.map(mod7));
  const pitches = noteList.filter((n) => selected.has(mod7(n.degree)));
  if (!pitches.length) return null;
  const chordByName = new Map<string, Chord>(EXTRA_CHORDS.map((c) => [c.name, c]));
  for (const c of input.chords) chordByName.set(c.name, c);
  // Minor's major V carries the raised leading tone, chosen or not by its own note.
  if (input.minor) {
    const v = chordNamed("m_V");
    if (v && !chordByName.has(v.name)) chordByName.set(v.name, v);
  }

  /** A progression fits when each of its chords is available and has a selected note in range. */
  const fits = (p: Progression) =>
    p.mode === (input.minor ? "minor" : "major") &&
    p.bars.flat().every((name) => {
      const c = chordByName.get(name);
      return !!c && pitches.some((n) => c.triadNotes.includes(mod7(n.degree)));
    });
  const usable = (input.progressions ?? PROGRESSIONS).filter((p) => (input.progressionId ? p.id === input.progressionId : true) && fits(p));
  if (!usable.length) return null;

  // The chromatic notes, in a random order of turns, each with the progressions that fit it.
  const inRange = (pv: number) => noteList.some((n) => n.pitchValue === pv);
  const chromatics = [
    ...(input.sharps ?? []).map((d) => chromaticNoteFor(mod7(d), "sharp", input.minor)),
    ...(input.flats ?? []).map((d) => chromaticNoteFor(mod7(d), "flat", input.minor)),
  ]
    .map((c) => {
      // The altered note needs a place in the range with its resolution there too.
      const placeable = noteList.some(
        (n) => mod7(n.degree) === c.degree && inRange(n.pitchValue + (c.alter === "sharp" ? 1 : -1)),
      );
      if (!placeable) return null;
      if (!c.progressions) return c;
      const ok = c.progressions.filter((bars) =>
        bars.flat().every((name) => {
          const chord = chordByName.get(name);
          return (
            !!chord &&
            noteList.some((n) => chord.triadNotes.includes(mod7(n.degree)) && (selected.has(mod7(n.degree)) || mod7(n.degree) === c.degree))
          );
        }),
      );
      // No chord progression fits the selection: the note passes instead.
      return ok.length ? { ...c, progressions: ok } : { degree: c.degree, alter: c.alter };
    })
    .filter((c): c is ChromaticNote => !!c)
    .sort(() => Math.random() - 0.5);
  if ((input.sharps?.length ?? 0) + (input.flats?.length ?? 0) > 0 && !chromatics.length) return null;

  // Moves to reach a do, from each pitch: a line must be able to get home in the notes it has left.
  const isDo = (n: LineNote) => mod7(n.degree) === 0;
  const toHome = new Map<number, number>();
  // Where a skip may land is a matter of rhythm, not of whether home can be reached.
  const anyLength: SkipPolicy = policy.kind === "custom" ? { ...policy, landOn: undefined } : policy;
  pitches.filter(isDo).forEach((n) => toHome.set(n.pitchValue, 0));
  if (!toHome.size) return null;
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of pitches) {
      for (const b of pitches) {
        const d = toHome.get(b.pitchValue);
        if (d === undefined || !isAllowedMove(a, b, 0, anyLength)) continue;
        if ((toHome.get(a.pitchValue) ?? Infinity) > d + 1) {
          toHome.set(a.pitchValue, d + 1);
          changed = true;
        }
      }
    }
  }

  // Each fitting progression in random order: lines over up to LINE_CHOICES
  // of them, keeping the one that marks time least. In a narrow range with
  // few skips a chord can leave one note to sing (V over do to la, rising
  // skips only: re, bar after bar), and another progression need not.
  const shuffled = [...usable].sort(() => Math.random() - 0.5);
  let best: { line: ProgressionLine; cost: number } | null = null;
  let written = 0;
  for (const progression of shuffled) {
    const line = writeOver(progression);
    if (!line) continue;
    const cost = markingTime(line.notes, rhythm);
    if (!best || cost < best.cost) best = { line, cost };
    if (++written >= LINE_CHOICES || cost === 0) break;
  }
  return best?.line ?? null;

  function writeOver(progression: Progression): ProgressionLine | null {
    // The plan: which phrases are chromatic, and over what.
    const phraseCount = Math.max(1, Math.ceil(input.measures / 4));
    const lastBars = input.measures - 4 * (phraseCount - 1);
    const picked = new Map<ChromaticNote, string[][]>();
    const harmony: string[][] = [];
    /** For each bar, the chromatic note its phrase is for (null: a diatonic phrase). */
    const barChromatic: (ChromaticNote | null)[] = [];
    for (let p = 0; p < phraseCount; p++) {
      const chromatic = chromatics.length && (phraseCount === 1 || p % 2 === 1) ? chromatics[Math.floor(p / 2) % chromatics.length] : null;
      let bars = progression.bars;
      if (chromatic?.progressions) {
        // One progression per note, so its phrases rhyme when it comes back.
        if (!picked.has(chromatic)) picked.set(chromatic, chromatic.progressions[Math.floor(Math.random() * chromatic.progressions.length)]);
        bars = picked.get(chromatic)!;
      }
      const isChromaticChord = (name: string) => {
        const c = chordByName.get(name);
        return !!chromatic && !!c && (chromatic.alter === "sharp" ? c.sharpScaleDegree : c.flatScaleDegree) === chromatic.degree;
      };
      const take = p === phraseCount - 1 ? lastBars : 4;
      const cut =
        take >= bars.length ? bars : chromatic?.progressions ? chromaticTail(bars, take, isChromaticChord) : bars.slice(bars.length - take);
      for (const b of cut) {
        harmony.push(b);
        barChromatic.push(chromatic);
      }
    }

    // Each slot: where it starts, its chord, whether it is sung, and whether it must be a chord tone.
    const split = splitAt(barUnits, beatUnits);
    const beats = Math.round(barUnits / beatUnits);
    let pos = 0;
    const slots = rhythm.map((r, k) => {
      const at = pos % barUnits;
      const barIndex = Math.min(harmony.length - 1, Math.floor(pos / barUnits));
      const bar = harmony[barIndex];
      const chord = chordByName.get(chordAt(harmony, pos, barUnits, beatUnits))!;
      const strong = at === 0 || (at === split && (bar.length > 1 || beats >= 4));
      const chromatic = barChromatic[barIndex];
      const slot = {
        k,
        chord,
        /** The phrase (four bars) the slot is in. */
        phrase: Math.floor(barIndex / 4),
        chromatic,
        /** The altered note this chord carries, if it is the phrase's. */
        carries:
          chromatic && (chromatic.alter === "sharp" ? chord.sharpScaleDegree : chord.flatScaleDegree) === chromatic.degree,
        length: r.totalValue,
        rest: (r as any).rest === true,
        chordTone: strong || r.totalValue > beatUnits,
        /** Inside a figure: the cap on the move onto it (0 holds the pitch). */
        cap: figureCap(k, rhythm as any, shortCaps),
      };
      pos += r.totalValue;
      return slot;
    });
    const sung = slots.filter((s) => !s.rest);
    if (!sung.length) return null;

    /**
     * Can the note after sung slot `j` be the resolution of the phrase's
     * altered note? It must follow at once, and be either a note of its
     * chord or on a weak beat (where it may pass on).
     */
    const resolvesAfter = (j: number) => {
      const slot = sung[j];
      const next = sung[j + 1];
      if (!slot.chromatic || !next || next.k !== slot.k + 1) return false;
      const target = mod7(slot.chromatic.degree + (slot.chromatic.alter === "sharp" ? 1 : -1));
      return !next.chordTone || next.chord.triadNotes.includes(target);
    };
    /**
     * Where each chromatic phrase must have sung its altered note by: the
     * last sung slot that could still carry it and resolve.
     */
    const deadline = new Map<number, number>();
    sung.forEach((slot, j) => {
      if (!slot.chromatic) return;
      const could = slot.chromatic.progressions ? slot.carries : !slot.chordTone;
      if (could && resolvesAfter(j)) deadline.set(slot.phrase, j);
    });
    // A chromatic phrase with nowhere to put its note: this rhythm will not do.
    for (let p = 0; p < phraseCount; p++) {
      const has = sung.some((s) => s.phrase === p && s.chromatic);
      if (has && !deadline.has(p)) return null;
    }

    const lowest = pitches[0].pitchValue;
    const highest = pitches[pitches.length - 1].pitchValue;
    const middle = (lowest + highest) / 2;
    const step = (alter: Alteration) => (alter === "sharp" ? 1 : -1);

    /** How much a candidate is wanted after `prev` (and the move before it), given how often each pitch was sung. */
    const weight = (c: Cand, prev: Cand | null, before: Cand | null, count: Map<number, number>) => {
      const n = c.note;
      let w = 1;
      if (prev) {
        const rise = n.pitchValue - prev.note.pitchValue;
        const d = Math.abs(rise);
        w = [REPEAT_WEIGHT, 3, 2, 1.1, 0.7, 0.45, 0.3, 0.25][Math.min(d, 7)];
        // A chromatic step (fa to fi) is a semitone, not a repeat.
        if (d === 0 && c.alter !== prev.alter) w = 3;
        // A third time on one pitch only when the harmony leaves little else
        // (IV over do re mi has only do to sing).
        else if (d === 0 && before && before.note.pitchValue === prev.note.pitchValue) w *= 0.1;
        // A leap is answered by a step back the other way.
        if (before) {
          const last = prev.note.pitchValue - before.note.pitchValue;
          if (Math.abs(last) >= 3) w *= Math.sign(rise) === -Math.sign(last) && d <= 2 ? 2.5 : 0.4;
          // Back to the note two before (mi re mi) sounds like marking time:
          // as in unison-phrasing.ts, a step run carries on instead.
          else if (d !== 0 && n.pitchValue === before.note.pitchValue) w *= ABA_WEIGHT;
        }
      } else {
        // Start in the middle of the range rather than at its edges.
        w = 1 / (1 + Math.abs(n.pitchValue - middle) / 3);
      }
      if (!c.tone) w *= 0.8;
      if (c.alter) w *= ALTERED_WEIGHT;
      // Favour what has been sung least, so the line uses its range.
      return w / (1 + 0.25 * (count.get(n.pitchValue) ?? 0));
    };
    /** Weighted random order (Efraimidis-Spirakis keys). */
    const order = <T,>(items: { item: T; w: number }[]) =>
      items
        .filter((x) => x.w > 0)
        .map((x) => ({ item: x.item, key: Math.random() ** (1 / x.w) }))
        .sort((a, b) => b.key - a.key)
        .map((x) => x.item);

    const sungNote = (c: Cand) => ({ pitchValue: c.note.pitchValue, degree: c.note.degree, chromatic: !!c.alter });
    const homeFrom = (c: Cand) => (c.alter ? (toHome.get(c.note.pitchValue + step(c.alter)) ?? Infinity) + 1 : toHome.get(c.note.pitchValue) ?? Infinity);

    // Depth-first over the sung slots, each choice drawn in weighted random order.
    const chosen: Cand[] = [];
    const count = new Map<number, number>();
    let budget = SEARCH_BUDGET;
    const candidatesAt = (j: number): Cand[] => {
      const slot = sung[j];
      const prev = chosen[j - 1] ?? null;
      const before = chosen[j - 2] ?? null;
      const left = sung.length - 1 - j;
      // Held inside a figure (cap 0): the pitch repeats, whatever it is.
      if (prev && slot.cap === 0 && slots[slot.k - 1] && !slots[slot.k - 1].rest) return [prev];
      const nextIsSungNeighbour = j < sung.length - 1 && sung[j + 1].k === slot.k + 1;
      const phraseHasAltered = () => {
        for (let i = j - 1; i >= 0 && sung[i].phrase === slot.phrase; i--) if (chosen[i].alter) return true;
        return false;
      };
      const mustAlter = deadline.get(slot.phrase) === j && !phraseHasAltered();
      const options: { item: Cand; w: number }[] = [];
      for (const n of noteList) {
        const deg = mod7(n.degree);
        const forms: Cand[] = [];
        const altered = slot.chromatic && slot.chromatic.degree === deg ? slot.chromatic.alter : null;
        if (slot.carries && altered) {
          // Under the chord that alters it, this degree is only ever the altered note.
          forms.push({ note: n, alter: altered, tone: true });
        } else {
          if (selected.has(deg)) forms.push({ note: n, alter: null, tone: slot.chord.triadNotes.includes(deg) });
          // A chromatic passing note: on a weak beat, never against its own natural in the chord.
          if (altered && !slot.chromatic!.progressions && !slot.chordTone && !slot.chord.triadNotes.includes(deg))
            forms.push({ note: n, alter: altered, tone: false });
        }
        for (const c of forms) {
          if (mustAlter && !c.alter) continue;
          if (j === 0 && (c.alter || !(c.tone && [0, 2, 4].includes(deg)))) continue;
          if (left === 0 && !(isDo(n) && c.tone && !c.alter)) continue;
          if (!c.tone && (slot.chordTone && !c.alter ? true : !prev || !nextIsSungNeighbour)) continue;
          if (c.alter && (!prev || !resolvesAfter(j))) continue;
          if (homeFrom(c) > left) continue;
          if (prev) {
            const d = Math.abs(n.pitchValue - prev.note.pitchValue);
            // An altered note resolves by step the way it leans.
            if (prev.alter && n.pitchValue - prev.note.pitchValue !== step(prev.alter)) continue;
            if (prev.alter && c.alter) continue;
            // A passing or neighbour note (altered too) is approached by step, and the note after one leaves it by step.
            if ((!c.tone || c.alter) && d > 1) continue;
            if (!c.tone && !c.alter && d !== 1) continue;
            if (!prev.tone && !prev.alter && d !== 1) continue;
            if (d > slot.cap) continue;
            if (!isAllowedMove(sungNote(prev), sungNote(c), slot.length, policy, sung[j - 1].length)) continue;
          }
          options.push({ item: c, w: weight(c, prev, before, count) });
        }
      }
      return order(options);
    };

    const stack: Cand[][] = [];
    let j = 0;
    stack[0] = candidatesAt(0);
    while (j >= 0 && j < sung.length) {
      if (--budget < 0) return null;
      const next = stack[j].shift();
      if (!next) {
        // Nothing left here: step back and try the previous slot's next choice.
        j--;
        const undone = chosen.pop();
        if (undone) count.set(undone.note.pitchValue, (count.get(undone.note.pitchValue) ?? 1) - 1);
        continue;
      }
      chosen[j] = next;
      count.set(next.note.pitchValue, (count.get(next.note.pitchValue) ?? 0) + 1);
      j++;
      if (j < sung.length) stack[j] = candidatesAt(j);
    }
    if (j < sung.length) return null;

    // Every slot gets a note: a rest holds the last sung pitch (the first, before anything is sung).
    const notes: LineNote[] = [];
    const chordProgression: ProgressionLine["chordProgression"] = [];
    let s = 0;
    for (const slot of slots) {
      const c = slot.rest ? chosen[Math.max(0, s - 1)] : chosen[s++];
      notes.push(c.note);
      // The spelling reads the altered note from the chord: a passing one
      // borrows the alteration on its own copy of the chord.
      let chord = slot.chord;
      if (!slot.rest && c.alter && !slot.carries) {
        chord = { ...chord, ...(c.alter === "sharp" ? { sharpScaleDegree: mod7(c.note.degree) } : { flatScaleDegree: mod7(c.note.degree) }) };
      }
      chordProgression.push({ chord, length: slot.length, triadDegrees: chord.triadNotes });
    }
    return { progression, harmony, chordProgression, notes };
  }
}
