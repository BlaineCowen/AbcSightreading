/**
 * Max 8th skip and Max 16th skip (Unison page, Skips section).
 *
 * They cap the moves between the short notes INSIDE a figure: from one eighth
 * or sixteenth to the next within the same rhythm figure - exactly where the
 * old "Move 8th Notes" off tied ti-ti onto one pitch. The move onto a figure's
 * first note follows Max skip, or the exact skips. 0 is that old tie (the
 * note repeats the pitch), 1 allows steps, more allows skips up to that size.
 * The caps also hold with exact skips on: both must allow the move.
 *
 * Distances are diatonic, as in skip-policy.ts (1 a step, 2 a 3rd).
 */

export interface ShortCaps {
  /** Largest move onto an eighth (or any short note longer than a sixteenth) inside a figure. */
  eighth: number;
  /** Largest move onto a sixteenth (or shorter) inside a figure. */
  sixteenth: number;
}

/** No cap: Move 8th Notes on, as the generator had it. */
export const NO_SHORT_CAPS: ShortCaps = Object.freeze({ eighth: Infinity, sixteenth: Infinity });

/** The figure flags the generator puts on each note's rhythm. */
export interface FigureNote {
  totalValue: number;
  isPatternNote?: boolean;
  isPatternStart?: boolean;
  isCadenceEnd?: boolean;
}

/**
 * Is note `i` a short note following a short note in the same figure? (Not a
 * figure's first note, and never a cadence end.) This is the condition the
 * old ti-ti tie used, unchanged, so a cap of 0 writes exactly what it did.
 */
export function insideFigure(i: number, rhythms: readonly (FigureNote | undefined)[]): boolean {
  if (i === 0) return false;
  const r = rhythms[i];
  const prev = rhythms[i - 1];
  if (!r || !prev || r.isCadenceEnd) return false;
  return r.totalValue <= 4 && prev.totalValue <= 4 && r.isPatternNote === true && r.isPatternStart !== true;
}

/** The largest move allowed onto note `i`: its cap inside a figure, otherwise none. */
export function figureCap(i: number, rhythms: readonly (FigureNote | undefined)[], caps: ShortCaps): number {
  if (!insideFigure(i, rhythms)) return Infinity;
  return rhythms[i]!.totalValue <= 2 ? caps.sixteenth : caps.eighth;
}

const isCap = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The caps from the generator's params: `maxEighthSkip` / `maxSixteenthSkip`
 * when given, else the old `moveOnEighthNotes` flag (off, or missing as it
 * always defaulted, is both 0; on is no cap).
 */
export function shortCapsFrom(params: {
  maxEighthSkip?: unknown;
  maxSixteenthSkip?: unknown;
  moveOnEighthNotes?: unknown;
}): ShortCaps {
  const legacy = params.moveOnEighthNotes ? NO_SHORT_CAPS : { eighth: 0, sixteenth: 0 };
  return {
    eighth: isCap(params.maxEighthSkip) ? Math.max(0, Math.round(params.maxEighthSkip)) : legacy.eighth,
    sixteenth: isCap(params.maxSixteenthSkip) ? Math.max(0, Math.round(params.maxSixteenthSkip)) : legacy.sixteenth,
  };
}

/** The page's controls. */
export interface ShortSkipSettings {
  max8th: number;
  max16th: number;
  /** The three steppers move together. */
  linked: boolean;
}

export const MAX_SKIP_RANGE = { min: 1, max: 8 } as const;
export const SHORT_SKIP_RANGE = { min: 0, max: 8 } as const;
const clamp = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, Math.round(v)));

/**
 * The settings in a saved options object (preset, localStorage, a link's
 * params, a ladder step). New fields win. Without them: moveEighthNotes
 * false is 0 and 0, unlinked; true, or nothing saved, is linked to Max skip.
 */
export function shortSkipsFrom(options: unknown, maxSkip: number): ShortSkipSettings {
  const o = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
  if (isCap(o.max8th) || isCap(o.max16th)) {
    return {
      max8th: clamp(isCap(o.max8th) ? o.max8th : maxSkip, SHORT_SKIP_RANGE),
      max16th: clamp(isCap(o.max16th) ? o.max16th : maxSkip, SHORT_SKIP_RANGE),
      linked: o.shortSkipsLinked === true,
    };
  }
  if (o.moveEighthNotes === false) return { max8th: 0, max16th: 0, linked: false };
  const v = clamp(maxSkip, SHORT_SKIP_RANGE);
  return { max8th: v, max16th: v, linked: true };
}

export type SkipStepper = "maxSkip" | "max8th" | "max16th";

/** One stepper changed. Linked: all three take the value (Max skip no lower than 1). */
export function setShortSkip<T extends ShortSkipSettings & { maxSkip: number }>(
  s: T,
  which: SkipStepper,
  value: number
): T {
  if (s.linked) {
    const v = clamp(value, SHORT_SKIP_RANGE);
    return { ...s, maxSkip: clamp(v, MAX_SKIP_RANGE), max8th: v, max16th: v };
  }
  return { ...s, [which]: clamp(value, which === "maxSkip" ? MAX_SKIP_RANGE : SHORT_SKIP_RANGE) };
}

/** `max8th=1&max16th=0&shortSkipsLinked=false`, always written, so a link says what it plays. */
export function writeShortSkipParams(s: ShortSkipSettings, params: URLSearchParams): void {
  params.set("max8th", String(s.max8th));
  params.set("max16th", String(s.max16th));
  params.set("shortSkipsLinked", String(s.linked));
}

/** The fields a link carries, ready for shortSkipsFrom; empty for an old link. */
export function readShortSkipParams(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of ["max8th", "max16th"] as const) {
    const v = params.get(name);
    if (v !== null && v.trim() !== "" && Number.isFinite(Number(v))) out[name] = Number(v);
  }
  if (params.has("shortSkipsLinked")) out.shortSkipsLinked = params.get("shortSkipsLinked") === "true";
  return out;
}
