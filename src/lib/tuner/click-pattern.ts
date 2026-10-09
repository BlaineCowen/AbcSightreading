import type { ClickLevel } from "./click-sounds";

/**
 * What a bar of the click plays: one model for the metronome, the click under
 * a Unison exercise and the drum track under a Choral one (notes/metronome-plan.md).
 *
 * Each beat has a level - accent, normal, soft or off - and every beat is cut
 * into the same grid of slots (the subdivision: 2 for eighths, 3 for
 * triplets...), of which a mask says which sound. A full mask is today's
 * subdivision; a partial one is a rhythm: the off-beat, swing, 1-e-&. A beat's
 * level carries to its slots, so a silent beat is silent and a soft one soft.
 *
 * `beatLevels` and `subMask` are optional and absent by default, so settings
 * saved before them (beats, subdivision, accent) click exactly as they did.
 */

export type BeatLevel = "accent" | "normal" | "soft" | "off";
export const BEAT_LEVELS: BeatLevel[] = ["accent", "normal", "soft", "off"];

/** How loud each level plays, against the click's own gain. */
export const LEVEL_GAIN: Record<BeatLevel, number> = { accent: 1, normal: 1, soft: 0.45, off: 0 };

export interface PatternSettings {
  beats: number;
  /** Slots per beat: the grid. */
  subdivision: number;
  /** Beat 1 accented, when `beatLevels` does not say. */
  accent: boolean;
  /** One level a beat; ignored unless it has exactly `beats` of them. */
  beatLevels?: BeatLevel[] | null;
  /** Which slots of each beat sound, "1" or "0" per slot: "01" is the off-beat. Full when unset. */
  subMask?: string | null;
}

export interface ClickEvent {
  /** When, in beats from the bar's start. */
  at: number;
  /** Which sample: the downbeat's, a beat's, or a subdivision's. */
  level: ClickLevel;
  /** Against the sample's own gain (LEVEL_GAIN). */
  gain: number;
  /** Which slot of its beat, from 0 (the counting voice says a word per slot). */
  slot: number;
}

export const isBeatLevel = (v: unknown): v is BeatLevel => BEAT_LEVELS.includes(v as BeatLevel);

/** Each beat's level: as set, or beat 1 accented (when `accent`) and the rest normal. */
export function beatLevelsFor(s: Pick<PatternSettings, "beats" | "accent" | "beatLevels">): BeatLevel[] {
  const set = s.beatLevels;
  if (set && set.length === s.beats && set.every(isBeatLevel)) return [...set];
  return Array.from({ length: s.beats }, (_, i) => (i === 0 && s.accent ? "accent" : "normal"));
}

/** The grid as whole slots, at least one. */
export const gridOf = (subdivision: number) => Math.max(1, Math.round(subdivision) || 1);

/** Which slots sound: the mask when it fits the grid and sounds somewhere, else every slot. */
export function maskFor(subdivision: number, subMask?: string | null): boolean[] {
  const grid = gridOf(subdivision);
  if (subMask && subMask.length === grid && /^[01]+$/.test(subMask) && subMask.includes("1")) {
    return [...subMask].map((c) => c === "1");
  }
  return Array.from({ length: grid }, () => true);
}

/** One beat's clicks, `at` within the beat (0 to under 1). */
export function beatEvents(level: BeatLevel, subdivision: number, subMask?: string | null): ClickEvent[] {
  const gain = LEVEL_GAIN[level];
  if (gain === 0) return [];
  const mask = maskFor(subdivision, subMask);
  const grid = mask.length;
  const out: ClickEvent[] = [];
  mask.forEach((on, slot) => {
    if (!on) return;
    const level_: ClickLevel = slot > 0 ? "sub" : level === "accent" ? "downbeat" : "beat";
    out.push({ at: slot / grid, level: level_, gain, slot });
  });
  return out;
}

/** A bar's clicks in order. */
export function barEvents(s: PatternSettings): ClickEvent[] {
  return beatLevelsFor(s).flatMap((level, beat) =>
    beatEvents(level, s.subdivision, s.subMask).map((e) => ({ ...e, at: beat + e.at }))
  );
}

/** A mask kept only when it fits: for a store or a preset read back. */
export function subMaskFrom(value: unknown, subdivision: number): string | null {
  if (typeof value !== "string") return null;
  const grid = gridOf(subdivision);
  return value.length === grid && /^[01]+$/.test(value) && value.includes("1") && value.includes("0") ? value : null;
}

/** Levels kept only when they fit the bar. */
export function beatLevelsFrom(value: unknown, beats: number): BeatLevel[] | null {
  return Array.isArray(value) && value.length === beats && value.every(isBeatLevel) ? (value as BeatLevel[]) : null;
}

/**
 * The rhythms a beat can carry, for the picker (phase 2). `grid` is the
 * subdivision, `mask` the slots that sound; the full grids are the plain
 * subdivisions. Simple meters cut a quarter, compound a dotted quarter.
 */
export interface SubPattern {
  id: string;
  grid: number;
  mask: string;
  label: string;
  meter: "simple" | "compound";
  /** The beat as notation, ABC at L:1/16 (a quarter is 4, a dotted quarter 6), for the picker. */
  abc: string;
}

export const SUB_PATTERNS: SubPattern[] = [
  { id: "q", grid: 1, mask: "1", label: "Beats", meter: "simple", abc: "B4" },
  { id: "8", grid: 2, mask: "11", label: "Eighths", meter: "simple", abc: "B2B2" },
  { id: "8-off", grid: 2, mask: "01", label: "Off-beats (the &)", meter: "simple", abc: "z2B2" },
  { id: "3", grid: 3, mask: "111", label: "Triplets", meter: "simple", abc: "(3B2B2B2" },
  { id: "3-swing", grid: 3, mask: "101", label: "Swing (1 _ a)", meter: "simple", abc: "(3:2:2B4B2" },
  { id: "3-rest-first", grid: 3, mask: "011", label: "Triplet, first silent", meter: "simple", abc: "(3z2B2B2" },
  { id: "3-rest-last", grid: 3, mask: "110", label: "Triplet, last silent", meter: "simple", abc: "(3B2B2z2" },
  { id: "16", grid: 4, mask: "1111", label: "Sixteenths", meter: "simple", abc: "BBBB" },
  { id: "16-1e&", grid: 4, mask: "1110", label: "1 e &", meter: "simple", abc: "BBB2" },
  { id: "16-1&a", grid: 4, mask: "1011", label: "1 & a", meter: "simple", abc: "B2BB" },
  { id: "16-1ea", grid: 4, mask: "1101", label: "1 e _ a", meter: "simple", abc: "BB2B" },
  { id: "16-1a", grid: 4, mask: "1001", label: "1 _ _ a (dotted eighth, sixteenth)", meter: "simple", abc: "B3B" },
  { id: "16-e&a", grid: 4, mask: "0111", label: "_ e & a", meter: "simple", abc: "zBBB" },
  { id: "32", grid: 8, mask: "11111111", label: "Thirty-seconds", meter: "simple", abc: "B/B/B/B/B/B/B/B/" },
  { id: "c-q", grid: 1, mask: "1", label: "Beats", meter: "compound", abc: "B6" },
  { id: "c-8", grid: 3, mask: "111", label: "Eighths", meter: "compound", abc: "B2B2B2" },
  { id: "c-q8", grid: 3, mask: "101", label: "Quarter, eighth", meter: "compound", abc: "B4B2" },
  { id: "c-8q", grid: 3, mask: "110", label: "Eighth, quarter", meter: "compound", abc: "B2B4" },
  { id: "c-off", grid: 3, mask: "011", label: "Off-beat eighths", meter: "compound", abc: "z2B2B2" },
  { id: "c-16", grid: 6, mask: "111111", label: "Sixteenths", meter: "compound", abc: "BBBBBB" },
];

/** The picker's entry for a grid and mask (a full mask when unset). */
export function patternOf(subdivision: number, subMask: string | null | undefined, meter: "simple" | "compound"): SubPattern | undefined {
  const mask = maskFor(subdivision, subMask).map((on) => (on ? "1" : "0")).join("");
  return SUB_PATTERNS.find((p) => p.meter === meter && p.grid === gridOf(subdivision) && p.mask === mask);
}
