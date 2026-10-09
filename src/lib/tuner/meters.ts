/**
 * The time signatures the metronome offers, and what each one clicks.
 *
 * A meter is counted in beats, not in its lower number: 6/8 is two
 * dotted-quarter beats, each of three eighths, so it clicks twice a bar with a
 * natural subdivision of three - the way it is felt and conducted. The tempo is
 * the beat's, and the metronome says which note that is (♩, ♩., 𝅗𝅥, ♪).
 *
 * The uneven meters are counted in eighths, grouped: 5/8 as 2+3, 7/8 as 2+2+3,
 * with a lighter accent where each group starts after the first.
 */

export type BeatNote =
  | "whole" | "dottedHalf" | "half" | "quarter" | "dottedQuarter" | "eighth" | "dottedEighth" | "sixteenth";

export interface Meter {
  id: string;
  /** Clicks per bar at the beat level. */
  beats: number;
  beatNote: BeatNote;
  /** The subdivisions that make sense in this meter, as clicks per beat. */
  subdivisions: number[];
  /** The subdivision a meter starts on - compound meters feel their three. */
  defaultSubdivision: number;
  /** Beats (0-based, after the first) that start a group: a lighter accent. */
  groupStarts: number[];
  kind: "simple" | "compound" | "uneven";
  /** How it is felt, when that is not obvious: "2+3". */
  grouping?: string;
}

export const METERS: Meter[] = [
  { id: "2/4", beats: 2, beatNote: "quarter", subdivisions: [1, 2, 3, 4, 8], defaultSubdivision: 1, groupStarts: [], kind: "simple" },
  { id: "3/4", beats: 3, beatNote: "quarter", subdivisions: [1, 2, 3, 4, 8], defaultSubdivision: 1, groupStarts: [], kind: "simple" },
  { id: "4/4", beats: 4, beatNote: "quarter", subdivisions: [1, 2, 3, 4, 8], defaultSubdivision: 1, groupStarts: [2], kind: "simple" },
  { id: "5/4", beats: 5, beatNote: "quarter", subdivisions: [1, 2, 3, 4, 8], defaultSubdivision: 1, groupStarts: [3], kind: "simple", grouping: "3+2" },
  { id: "2/2", beats: 2, beatNote: "half", subdivisions: [1, 2, 4], defaultSubdivision: 1, groupStarts: [], kind: "simple" },
  { id: "6/8", beats: 2, beatNote: "dottedQuarter", subdivisions: [1, 3, 6], defaultSubdivision: 3, groupStarts: [], kind: "compound" },
  { id: "9/8", beats: 3, beatNote: "dottedQuarter", subdivisions: [1, 3, 6], defaultSubdivision: 3, groupStarts: [], kind: "compound" },
  { id: "12/8", beats: 4, beatNote: "dottedQuarter", subdivisions: [1, 3, 6], defaultSubdivision: 3, groupStarts: [2], kind: "compound" },
  { id: "5/8", beats: 5, beatNote: "eighth", subdivisions: [1, 2], defaultSubdivision: 1, groupStarts: [2], kind: "uneven", grouping: "2+3" },
  { id: "7/8", beats: 7, beatNote: "eighth", subdivisions: [1, 2], defaultSubdivision: 1, groupStarts: [2, 4], kind: "uneven", grouping: "2+2+3" },
];

/**
 * The subdivision to carry from one meter to the next. Across simple and
 * compound it moves by meaning, not number: eighths are 2 per quarter but 3
 * per dotted quarter, sixteenths 4 and 6. Otherwise it is unchanged.
 */
export function carrySubdivision(from: Meter, to: Meter, subdivision: number): number {
  const pairs: [number, number][] = [[2, 3], [4, 6]]; // [simple, compound]
  if (from.kind === "simple" && to.kind === "compound") return pairs.find(([a]) => a === subdivision)?.[1] ?? subdivision;
  if (from.kind === "compound" && to.kind === "simple") return pairs.find(([, b]) => b === subdivision)?.[0] ?? subdivision;
  return subdivision;
}

/** A meter by id: one of the table's, or a custom one ("11/8", "7/8:3+2+2"); 4/4 when it is neither. */
export const meterById = (id: string): Meter => METERS.find((m) => m.id === id) ?? customMeter(id) ?? METERS[2];

/**
 * Custom time signatures (Blaine: "custom time signatures and stuff"). Any
 * top number up to `MAX_TOP` over 1, 2, 4, 8 or 16, and optionally its
 * grouping in units of the bottom number: "7/8:3+2+2". Read the way the table
 * reads its own:
 * - a top number of 6, 9, 12... (or a grouping all in threes) is compound,
 *   counted in dotted beats (6/4 two dotted halves, 9/16 three dotted eighths),
 *   over 4, 8 or 16;
 * - an odd top over 8 or 16 (5, 7, 11...) is uneven, counted in the bottom
 *   note and grouped, by default in twos with the three last (11/8 2+2+2+2+3);
 *   so is any other grouping;
 * - anything else is simple, counted in the bottom note.
 * An uneven meter's groups are heard: their first beats click at full level
 * and the beats inside them soft (`groupLevels`).
 */
export const MAX_TOP = 32;
export const BOTTOMS = [1, 2, 4, 8, 16] as const;

const NOTE_OF: Record<number, BeatNote> = { 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "sixteenth" };
const DOTTED_OF: Record<number, BeatNote> = { 4: "dottedHalf", 8: "dottedQuarter", 16: "dottedEighth" };

/** The default grouping of an uneven top number: twos, the three last (7 is 2+2+3). */
export function defaultGrouping(top: number): number[] {
  if (top < 2) return [top];
  const groups = Array.from({ length: Math.floor(top / 2) }, () => 2);
  if (top % 2) groups[groups.length - 1] = 3;
  return groups;
}

/** The groupings of `top` into twos and threes, the default first; at most `limit`. */
export function groupingsOf(top: number, limit = 12): number[][] {
  const out: number[][] = [];
  const walk = (left: number, acc: number[]) => {
    if (out.length >= limit * 4) return;
    if (left === 0) return void out.push(acc);
    if (left >= 2) walk(left - 2, [...acc, 2]);
    if (left >= 3) walk(left - 3, [...acc, 3]);
  };
  walk(top, []);
  const key = (g: number[]) => g.join("+");
  const def = key(defaultGrouping(top));
  return out.sort((a, b) => Number(key(b) === def) - Number(key(a) === def)).slice(0, limit);
}

/** Reads "N/D" or "N/D:a+b+c"; undefined when it is not a meter this metronome can count. */
export function customMeter(id: string): Meter | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})(?::(\d+(?:\+\d+)*))?$/.exec(id.trim());
  if (!m) return undefined;
  const top = Number(m[1]), bottom = Number(m[2]);
  if (top < 1 || top > MAX_TOP || !(BOTTOMS as readonly number[]).includes(bottom)) return undefined;
  let groups: number[] | undefined = m[3]?.split("+").map(Number);
  if (groups && (groups.some((g) => g < 1 || g > 9) || groups.reduce((a, b) => a + b, 0) !== top)) return undefined;
  const name = `${top}/${bottom}`;
  const table = METERS.find((x) => x.id === name);
  // A grouping that says what the table's meter already does is that meter.
  if (table && (!groups || groups.join("+") === (table.grouping ?? (table.kind === "compound" ? groups.map(() => 3).join("+") : "")))) return table;
  if (groups && groups.length === 1) groups = undefined;

  const compound = bottom >= 4 && top >= 6 && top % 3 === 0 && (!groups || groups.every((g) => g === 3));
  if (compound) {
    const beats = top / 3;
    return {
      id: name, beats, beatNote: DOTTED_OF[bottom], subdivisions: [1, 3, 6], defaultSubdivision: 3,
      groupStarts: beats === 4 ? [2] : [], kind: "compound",
    };
  }
  const uneven = !!groups || (bottom >= 8 && top >= 5 && top % 2 === 1);
  if (uneven) {
    const g = groups ?? defaultGrouping(top);
    const grouping = g.join("+");
    const starts = g.slice(0, -1).map((_, i) => g.slice(0, i + 1).reduce((a, b) => a + b, 0));
    // Plain "7/8" only for the grouping it means by itself; "5/4" is the table's 3+2, so 2+3 is "5/4:2+3".
    const plain = !table && grouping === defaultGrouping(top).join("+");
    return {
      id: plain ? name : `${name}:${grouping}`, beats: top, beatNote: NOTE_OF[bottom],
      subdivisions: bottom >= 8 ? [1, 2] : [1, 2, 3, 4], defaultSubdivision: 1, groupStarts: starts, kind: "uneven", grouping,
    };
  }
  return {
    id: name, beats: top, beatNote: NOTE_OF[bottom],
    subdivisions: bottom === 16 ? [1, 2] : bottom === 8 ? [1, 2, 3, 4] : bottom <= 2 ? [1, 2, 4] : [1, 2, 3, 4, 8],
    defaultSubdivision: 1, groupStarts: top >= 4 ? [Math.ceil(top / 2)] : [], kind: "simple",
  };
}

/** Is this one of the table's meters (a button of its own), or a custom one? */
export const isTableMeter = (id: string) => METERS.some((m) => m.id === id);

/** The time signature as written, "7/8", without its grouping. */
export const meterName = (m: Meter) => m.id.split(":")[0];

/**
 * The levels an uneven meter starts with, so its groups are heard: beat 1
 * accented, each group's first beat normal, the beats inside a group soft
 * (7/8 2+2+3: > . - . - . -). Null for other meters (beat 1 alone accented,
 * as ever). Only volume marks a group, never a third pitch: that was tried
 * and was more distracting than useful (metronome-meters.test.ts).
 */
export function groupLevels(m: Meter): ("accent" | "normal" | "soft")[] | null {
  if (m.kind !== "uneven") return null;
  return Array.from({ length: m.beats }, (_, i) => (i === 0 ? "accent" : m.groupStarts.includes(i) ? "normal" : "soft"));
}

export const BEAT_SYMBOL: Record<BeatNote, string> = {
  whole: "𝅝",
  dottedHalf: "𝅗𝅥.",
  half: "𝅗𝅥",
  quarter: "♩",
  dottedQuarter: "♩.",
  eighth: "♪",
  dottedEighth: "♪.",
  sixteenth: "𝅘𝅥𝅯",
};

/** What a subdivision is called in a meter: in 6/8, three per beat are eighths. */
export function subdivisionLabel(meter: Meter, perBeat: number): string {
  if (perBeat === 1) return `Beat (${BEAT_SYMBOL[meter.beatNote]})`;
  const dotted = meter.kind === "compound";
  if (perBeat === 3 && !dotted) return "Triplets";
  const beatInSixteenths = { whole: 16, dottedHalf: 12, half: 8, quarter: 4, dottedQuarter: 6, eighth: 2, dottedEighth: 3, sixteenth: 1 }[meter.beatNote];
  const each = beatInSixteenths / perBeat;
  return each === 8 ? "Halves" : each === 4 ? "Quarters" : each === 2 ? "Eighths" : each === 1 ? "Sixteenths" : each === 0.5 ? "Thirty-seconds" : each === 0.25 ? "Sixty-fourths" : `${perBeat} per beat`;
}
