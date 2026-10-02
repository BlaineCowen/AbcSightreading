/**
 * Which melodic moves a unison line may make (NYSSMA Voice levels spec).
 *
 * Two kinds: a largest skip (Max skip, the page's control since the start),
 * or a list of the skips allowed (Custom skips - NYSSMA's "Do-Mi-Sol
 * ascending"). A step or a repeated note is always allowed.
 *
 * Distances are diatonic: pitchValue indexes noteArray, seven to the octave,
 * so 1 is a 2nd, 2 a 3rd, 4 a 5th, 7 an octave. Moves name scale degrees 1-7;
 * the generator's own `degree` is 0-based (do = 0).
 */

export type SkipDir = "up" | "down" | "both";

/** One listed skip: from one scale degree (1-7) to another, in a direction. */
export interface SkipMove {
  from: number;
  to: number;
  dir: SkipDir;
}

export type SkipPolicy =
  | { kind: "max"; maxSkip: number }
  /** `landOn`: the note lengths (32nds) a skip may land on; unset means any. */
  | { kind: "custom"; moves: SkipMove[]; landOn?: number[] };

/** A note as the rule sees it. `degree` is 0-based, as in the generator. */
export interface SkipNote {
  pitchValue: number;
  degree: number;
  /** Altered by the chord it is sung over (a selected chromatic degree). */
  chromatic?: boolean;
}

export const DEFAULT_MAX_SKIP = 4;
/** Step or repeat only: what an altered note's neighbour gets under "accidentals follow step". */
export const STEP_ONLY: SkipPolicy = { kind: "max", maxSkip: 1 };

const OCTAVE = 7;
const mod7 = (n: number) => ((n % 7) + 7) % 7;

/**
 * May the line move from `prev` to `next`, a note `nextLength` 32nds long?
 *
 * - A step or a repeat (distance <= 1): always.
 * - max: distance <= maxSkip - exactly the rule the generator always had.
 * - custom: never onto or off a chromatic note; a simple interval (less than
 *   an octave) whose degrees and direction match a listed move, in any
 *   octave; and, when `landOn` is set, onto one of those lengths.
 */
export function isAllowedMove(
  prev: SkipNote,
  next: SkipNote,
  nextLength: number,
  policy: SkipPolicy
): boolean {
  const rise = next.pitchValue - prev.pitchValue;
  const distance = Math.abs(rise);
  if (distance <= 1) return true;
  if (policy.kind === "max") return distance <= policy.maxSkip;
  if (prev.chromatic || next.chromatic) return false;
  if (distance >= OCTAVE) return false;
  if (policy.landOn && !policy.landOn.includes(nextLength)) return false;
  const from = mod7(prev.degree) + 1;
  const to = mod7(next.degree) + 1;
  const dir: SkipDir = rise > 0 ? "up" : "down";
  return policy.moves.some(
    (m) => m.from === from && m.to === to && (m.dir === "both" || m.dir === dir)
  );
}

/**
 * The widest move the policy allows, in diatonic steps - 1 when only steps
 * are allowed. The generator divides by it to estimate how many notes it
 * needs to get home.
 */
export function largestSkip(policy: SkipPolicy): number {
  if (policy.kind === "max") return policy.maxSkip;
  let widest = 1;
  for (const m of policy.moves) {
    if (m.dir !== "down") widest = Math.max(widest, mod7(m.to - m.from));
    if (m.dir !== "up") widest = Math.max(widest, mod7(m.from - m.to));
  }
  return widest;
}

const DIRS: readonly SkipDir[] = ["up", "down", "both"];
const isDegree = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7;

/** A well-formed row. From and to differ: a unison or an octave is not a skip. */
export function isSkipMove(v: unknown): v is SkipMove {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return isDegree(m.from) && isDegree(m.to) && m.from !== m.to && DIRS.includes(m.dir as SkipDir);
}

/**
 * Whatever arrived as `maxSkip` - a number from older callers and scripts, or
 * a policy from the page (it crosses the wire as JSON) - as a policy.
 */
export function toSkipPolicy(value: unknown): SkipPolicy {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "max", maxSkip: Math.max(1, Math.round(value)) };
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.kind === "max") return toSkipPolicy(v.maxSkip);
    if (v.kind === "custom") {
      const moves = Array.isArray(v.moves)
        ? v.moves.filter(isSkipMove).map((m) => ({ from: m.from, to: m.to, dir: m.dir }))
        : [];
      const landOn = Array.isArray(v.landOn)
        ? v.landOn.filter((l): l is number => Number.isInteger(l) && (l as number) > 0)
        : [];
      return landOn.length ? { kind: "custom", moves, landOn } : { kind: "custom", moves };
    }
  }
  return { kind: "max", maxSkip: DEFAULT_MAX_SKIP };
}
