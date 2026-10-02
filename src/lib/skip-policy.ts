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
 * - custom: a ↕ row is symmetric (its two degrees in either order, either
 *   direction); ↑ and ↓ rows are directed. Never onto or off a chromatic note; a simple interval (less than
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
    (m) =>
      m.dir === "both"
        ? (m.from === from && m.to === to) || (m.from === to && m.to === from)
        : m.from === from && m.to === to && m.dir === dir
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
    // ↕ is symmetric: both orderings, both directions, so the wider of the two.
  }
  return widest;
}

/**
 * Of the pitches a line may sing, the ones it can't be trapped on. With exact
 * skips a pitch can be a dead end: low sol in C4-C5 when the only skip from sol
 * is down to do (below the range) and no neighbour is selected - a line that
 * started there sang it for the whole exercise. Kept: each pitch with a move
 * on to another kept pitch (a step to a neighbour in the list, or an allowed
 * skip onto any note value - the landing limit only says where a skip may
 * fall) and a way, in moves like that, to a kept pitch `isHome` accepts.
 * Repeated until nothing changes, since dropping one pitch can strand another.
 * Empty, or without a home pitch, when the list can't make an exercise.
 * Max skip mode keeps every pitch, as it always has.
 */
export function livePitches<T extends SkipNote>(
  notes: readonly T[],
  policy: SkipPolicy,
  isHome: (note: T) => boolean
): T[] {
  if (policy.kind === "max") return [...notes];
  const anyLength: SkipPolicy = { kind: "custom", moves: policy.moves };
  const movesTo = (a: T, b: T) => a.pitchValue !== b.pitchValue && isAllowedMove(a, b, 0, anyLength);
  let live = [...notes];
  for (;;) {
    const onward = live.filter((a) => live.some((b) => movesTo(a, b)));
    const home = new Set(onward.filter(isHome));
    for (let grew = true; grew; ) {
      grew = false;
      for (const a of onward) {
        if (!home.has(a) && onward.some((b) => home.has(b) && movesTo(a, b))) {
          home.add(a);
          grew = true;
        }
      }
    }
    const next = onward.filter((a) => home.has(a));
    if (next.length === live.length) return live;
    live = next;
  }
}

/** The lengths (32nds) of the notes these rhythms sing - rests left out. */
export function sungLengths(rhythms: readonly { abcValue: readonly string[] }[]): number[] {
  return [
    ...new Set(
      rhythms.flatMap((r) =>
        r.abcValue.filter((v) => !String(v).startsWith("z")).map((v) => parseInt(String(v), 10))
      )
    ),
  ].filter((l) => l > 0);
}

/**
 * The policy as these rhythms can use it. With exact skips limited to some
 * note values, rhythms that never sing one of them can never sing a skip:
 * the line is stepwise, so it is treated as stepwise - and the checks that
 * say "add a skip" or "select the notes in between" see that, instead of
 * listed skips that promise a way between notes the line can never take.
 */
export function landablePolicy(
  policy: SkipPolicy,
  rhythms: readonly { abcValue: readonly string[] }[]
): SkipPolicy {
  if (policy.kind !== "custom" || !policy.landOn || policy.moves.length === 0) return policy;
  const landOn = policy.landOn;
  return sungLengths(rhythms).some((l) => landOn.includes(l)) ? policy : { kind: "custom", moves: [] };
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
