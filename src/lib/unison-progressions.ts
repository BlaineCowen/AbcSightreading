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
  /** For tests: a progression by id instead of a random one. */
  progressionId?: string;
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
const SEARCH_BUDGET = 20000;

const mod7 = (n: number) => ((n % 7) + 7) % 7;

/**
 * Writes the line, or returns null when no progression fits the selection
 * or no line could be found over this rhythm (the caller then uses the
 * older walk, so this never fails an exercise the walk would have written).
 */
export function writeProgressionLine(
  input: ProgressionLineInput,
): ProgressionLine | null {
  const { noteList, rhythm, barUnits, beatUnits, policy, shortCaps } = input;
  const selected = new Set(input.scaleDegrees.map(mod7));
  const pitches = noteList.filter((n) => selected.has(mod7(n.degree)));
  if (!pitches.length) return null;
  const chordByName = new Map(input.chords.map((c) => [c.name, c]));

  /** A progression fits when each of its chords is available and has a selected note in range. */
  const fits = (p: Progression) =>
    p.mode === (input.minor ? "minor" : "major") &&
    p.bars.flat().every((name) => {
      const c = chordByName.get(name);
      return !!c && pitches.some((n) => c.triadNotes.includes(mod7(n.degree)));
    });
  const usable = PROGRESSIONS.filter(
    (p) =>
      (input.progressionId ? p.id === input.progressionId : true) && fits(p),
  );
  if (!usable.length) return null;

  // Moves to reach a do, from each pitch: a line must be able to get home in the notes it has left.
  const isDo = (n: LineNote) => mod7(n.degree) === 0;
  const toHome = new Map<number, number>();
  // Where a skip may land is a matter of rhythm, not of whether home can be reached.
  const anyLength: SkipPolicy =
    policy.kind === "custom" ? { ...policy, landOn: undefined } : policy;
  pitches.filter(isDo).forEach((n) => toHome.set(n.pitchValue, 0));
  if (!toHome.size) return null;
  for (let changed = true; changed;) {
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

  // Each fitting progression in random order, until one takes a line over this rhythm.
  const shuffled = [...usable].sort(() => Math.random() - 0.5);
  for (const progression of shuffled) {
    const line = writeOver(progression);
    if (line) return line;
  }
  return null;

  function writeOver(progression: Progression): ProgressionLine | null {
    const harmony = barsFor(progression, input.measures);

    // Each slot: where it starts, its chord, whether it is sung, and whether it must be a chord tone.
    const split = splitAt(barUnits, beatUnits);
    const beats = Math.round(barUnits / beatUnits);
    let pos = 0;
    const slots = rhythm.map((r, k) => {
      const at = pos % barUnits;
      const bar =
        harmony[Math.min(harmony.length - 1, Math.floor(pos / barUnits))];
      const chord = chordByName.get(
        chordAt(harmony, pos, barUnits, beatUnits),
      )!;
      const strong =
        at === 0 || (at === split && (bar.length > 1 || beats >= 4));
      const slot = {
        k,
        chord,
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

    const isTone = (chord: Chord, n: LineNote) =>
      chord.triadNotes.includes(mod7(n.degree));
    const lowest = pitches[0].pitchValue;
    const highest = pitches[pitches.length - 1].pitchValue;
    const middle = (lowest + highest) / 2;

    /** How much a candidate is wanted after `prev` (and the move before it), given how often each pitch was sung. */
    const weight = (
      n: LineNote,
      prev: LineNote | null,
      before: LineNote | null,
      count: Map<number, number>,
      nct: boolean,
    ) => {
      let w = 1;
      if (prev) {
        const rise = n.pitchValue - prev.pitchValue;
        const d = Math.abs(rise);
        w = [0.35, 3, 2, 1.1, 0.7, 0.45, 0.3, 0.25][Math.min(d, 7)];
        // A third time on one pitch only when the harmony leaves little else
        // (IV over do re mi has only do to sing).
        if (d === 0 && before && before.pitchValue === prev.pitchValue)
          w *= 0.1;
        // A leap is answered by a step back the other way.
        if (before) {
          const last = prev.pitchValue - before.pitchValue;
          if (Math.abs(last) >= 3)
            w *= Math.sign(rise) === -Math.sign(last) && d <= 2 ? 2.5 : 0.4;
        }
      } else {
        // Start in the middle of the range rather than at its edges.
        w = 1 / (1 + Math.abs(n.pitchValue - middle) / 3);
      }
      if (nct) w *= 0.8;
      // Favour what has been sung least, so the line uses its range.
      return w / (1 + 0.25 * (count.get(n.pitchValue) ?? 0));
    };
    /** Weighted random order (Efraimidis-Spirakis keys). */
    const order = <T>(items: { item: T; w: number }[]) =>
      items
        .filter((x) => x.w > 0)
        .map((x) => ({ item: x.item, key: Math.random() ** (1 / x.w) }))
        .sort((a, b) => b.key - a.key)
        .map((x) => x.item);

    // Depth-first over the sung slots, each choice drawn in weighted random order.
    const chosen: LineNote[] = [];
    const count = new Map<number, number>();
    let budget = SEARCH_BUDGET;
    const candidatesAt = (j: number): LineNote[] => {
      const slot = sung[j];
      const prev = chosen[j - 1] ?? null;
      const before = chosen[j - 2] ?? null;
      const left = sung.length - 1 - j;
      const prevWasNct = j > 0 && !isTone(sung[j - 1].chord, prev!);
      // Held inside a figure (cap 0): the pitch repeats, whatever it is.
      if (
        prev &&
        slot.cap === 0 &&
        slots[slot.k - 1] &&
        !slots[slot.k - 1].rest
      )
        return [prev];
      const nextIsSungNeighbour =
        j < sung.length - 1 && sung[j + 1].k === slot.k + 1;
      const options: { item: LineNote; w: number }[] = [];
      for (const n of pitches) {
        const tone = isTone(slot.chord, n);
        if (j === 0 && !(tone && [0, 2, 4].includes(mod7(n.degree)))) continue;
        if (left === 0 && !(isDo(n) && tone)) continue;
        if (!tone && (slot.chordTone || !prev || !nextIsSungNeighbour))
          continue;
        if ((toHome.get(n.pitchValue) ?? Infinity) > left) continue;
        if (prev) {
          const d = Math.abs(n.pitchValue - prev.pitchValue);
          // A passing or neighbour note is approached by step, and the note after one leaves it by step.
          if (!tone && d !== 1) continue;
          if (prevWasNct && d !== 1) continue;
          if (d > slot.cap) continue;
          if (!isAllowedMove(prev, n, slot.length, policy)) continue;
        }
        options.push({ item: n, w: weight(n, prev, before, count, !tone) });
      }
      return order(options);
    };

    const stack: LineNote[][] = [];
    let j = 0;
    stack[0] = candidatesAt(0);
    while (j >= 0 && j < sung.length) {
      if (--budget < 0) return null;
      const next = stack[j].shift();
      if (!next) {
        // Nothing left here: step back and try the previous slot's next choice.
        j--;
        const undone = chosen.pop();
        if (undone)
          count.set(undone.pitchValue, (count.get(undone.pitchValue) ?? 1) - 1);
        continue;
      }
      chosen[j] = next;
      count.set(next.pitchValue, (count.get(next.pitchValue) ?? 0) + 1);
      j++;
      if (j < sung.length) stack[j] = candidatesAt(j);
    }
    if (j < sung.length) return null;

    // Every slot gets a note: a rest holds the last sung pitch (the first, before anything is sung).
    const notes: LineNote[] = [];
    let s = 0;
    for (const slot of slots) {
      if (slot.rest) notes.push(chosen[Math.max(0, s - 1)]);
      else notes.push(chosen[s++]);
    }
    const chordProgression = slots.map((slot) => ({
      chord: slot.chord,
      length: slot.length,
      triadDegrees: slot.chord.triadNotes,
    }));
    return { progression, harmony, chordProgression, notes };
  }
}
