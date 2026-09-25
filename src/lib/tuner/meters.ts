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

export type BeatNote = "half" | "quarter" | "dottedQuarter" | "eighth";

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
  { id: "2/4", beats: 2, beatNote: "quarter", subdivisions: [1, 2, 3, 4], defaultSubdivision: 1, groupStarts: [], kind: "simple" },
  { id: "3/4", beats: 3, beatNote: "quarter", subdivisions: [1, 2, 3, 4], defaultSubdivision: 1, groupStarts: [], kind: "simple" },
  { id: "4/4", beats: 4, beatNote: "quarter", subdivisions: [1, 2, 3, 4], defaultSubdivision: 1, groupStarts: [2], kind: "simple" },
  { id: "5/4", beats: 5, beatNote: "quarter", subdivisions: [1, 2, 3, 4], defaultSubdivision: 1, groupStarts: [3], kind: "simple", grouping: "3+2" },
  { id: "2/2", beats: 2, beatNote: "half", subdivisions: [1, 2, 4], defaultSubdivision: 1, groupStarts: [], kind: "simple" },
  { id: "6/8", beats: 2, beatNote: "dottedQuarter", subdivisions: [1, 3, 6], defaultSubdivision: 3, groupStarts: [], kind: "compound" },
  { id: "9/8", beats: 3, beatNote: "dottedQuarter", subdivisions: [1, 3, 6], defaultSubdivision: 3, groupStarts: [], kind: "compound" },
  { id: "12/8", beats: 4, beatNote: "dottedQuarter", subdivisions: [1, 3, 6], defaultSubdivision: 3, groupStarts: [2], kind: "compound" },
  { id: "5/8", beats: 5, beatNote: "eighth", subdivisions: [1, 2], defaultSubdivision: 1, groupStarts: [2], kind: "uneven", grouping: "2+3" },
  { id: "7/8", beats: 7, beatNote: "eighth", subdivisions: [1, 2], defaultSubdivision: 1, groupStarts: [2, 4], kind: "uneven", grouping: "2+2+3" },
];

export const meterById = (id: string): Meter => METERS.find((m) => m.id === id) ?? METERS[2];

export const BEAT_SYMBOL: Record<BeatNote, string> = {
  half: "𝅗𝅥",
  quarter: "♩",
  dottedQuarter: "♩.",
  eighth: "♪",
};

/** What a subdivision is called in a meter: in 6/8, three per beat are eighths. */
export function subdivisionLabel(meter: Meter, perBeat: number): string {
  if (perBeat === 1) return `Beat (${BEAT_SYMBOL[meter.beatNote]})`;
  if (perBeat === 3 && meter.beatNote !== "dottedQuarter") return "Triplets";
  const beatInSixteenths = { half: 8, quarter: 4, dottedQuarter: 6, eighth: 2 }[meter.beatNote];
  const each = beatInSixteenths / perBeat;
  return each === 2 ? "Eighths" : each === 1 ? "Sixteenths" : each === 4 ? "Quarters" : `${perBeat} per beat`;
}
