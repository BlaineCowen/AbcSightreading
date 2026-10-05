import { dynamicsSetFrom } from "./dynamics";
import { rangeForSpan } from "./ladder";
import { meterKindOf } from "./meter";
import { canonicalSkips } from "./skip-settings";

/**
 * Keys and meters on the Unison page as pools: one of each is drawn per
 * exercise, the way Choral's key picker works. And a range that follows the
 * key - a span of scale steps around do - for the NYSSMA levels, whose keys
 * change between exercises.
 */

/** "C,F" from a link; an old link names one key. Unknown names are dropped. */
export function parsePool(raw: string | null | undefined, allowed: readonly string[]): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => allowed.includes(s)))];
}

/** The pool a saved options object holds; one from before pools has a single key or meter. */
export function poolFrom(saved: unknown, single: unknown, allowed: readonly string[], fallback: string): string[] {
  const list = Array.isArray(saved)
    ? [...new Set(saved.filter((v): v is string => typeof v === "string" && allowed.includes(v)))]
    : [];
  if (list.length) return list;
  return typeof single === "string" && allowed.includes(single) ? [single] : [fallback];
}

/** A click on a key or meter: in or out of the pool. The last one stays. */
export function togglePoolMember(pool: readonly string[], item: string): string[] {
  if (!pool.includes(item)) return [...pool, item];
  return pool.length > 1 ? pool.filter((p) => p !== item) : [...pool];
}

/** One from the pool. A pool of one draws nothing, so a single key behaves as it always did. */
export function drawFromPool<T>(pool: readonly T[], random: () => number = Math.random): T {
  if (pool.length === 0) throw new Error("Nothing to draw from.");
  return pool.length === 1 ? pool[0] : pool[Math.floor(random() * pool.length)];
}

/**
 * A meter pool holds one kind, simple or compound, because the rhythm
 * selection follows the kind. A link or saved pool that mixes them keeps the
 * first meter's kind.
 */
export function sameKindPool(meters: readonly string[]): string[] {
  if (meters.length === 0) return [];
  const kind = meterKindOf(meters[0]);
  return meters.filter((m) => meterKindOf(m) === kind);
}

/**
 * A click on a meter: one of the pool's kind goes in or out; one of the other
 * kind replaces the pool (the page swaps the rhythm selection with it).
 */
export function meterPoolClick(pool: readonly string[], ts: string): string[] {
  if (pool.length === 0 || meterKindOf(pool[0]) !== meterKindOf(ts)) return [ts];
  return togglePoolMember(pool, ts);
}

export type Span = [below: number, above: number];

/** Scale steps below and above do: do inside it, at most two octaves wide. */
export function spanFrom(value: unknown): Span | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [below, above] = value.map(Number);
  const ok = Number.isInteger(below) && Number.isInteger(above) && below <= 0 && above >= 0 && above - below >= 1 && above - below <= 14;
  return ok ? [below, above] : null;
}

export const parseSpan = (raw: string | null | undefined): Span | null => (raw ? spanFrom(raw.split(",")) : null);

/** The pool in picker order; anything the order does not know goes last, as it was. */
const inOrder = (pool: readonly string[], order: readonly string[]) =>
  [...pool].sort((a, b) => rank(order, a) - rank(order, b));
const rank = (order: readonly string[], v: string) => {
  const i = order.indexOf(v);
  return i === -1 ? order.length : i;
};

/**
 * What "edited" compares: the saved options with the pools (and the dynamics and other skips) in a fixed order,
 * and the key, meter and placed range taken from that order. A pool is a set -
 * removing a key and adding it back is no edit. The stored options keep the
 * reader's order; only the comparison sorts. Fields keep their places, so a
 * signature already in this form comes back unchanged, and options from
 * before pools (no `selectedKeys`) pass through as they are.
 */
export function presetSignature(
  options: Record<string, unknown>,
  keyOrder: readonly string[],
  meterOrder: readonly string[]
): string {
  const out: Record<string, unknown> = { ...options };
  if (Array.isArray(options.selectedKeys) && options.selectedKeys.length) {
    const keys = inOrder(options.selectedKeys as string[], keyOrder);
    out.selectedKeys = keys;
    out.selectedKey = keys[0];
    const span = spanFrom(options.rangeSpan);
    const anchor = options.rangeAnchor;
    if (span && typeof anchor === "number") {
      const placed = rangeForSpan(span, keys[0], anchor);
      if (placed) out.selectedRange = placed;
    }
  }
  if (Array.isArray(options.selectedTimeSignatures) && options.selectedTimeSignatures.length) {
    const meters = inOrder(options.selectedTimeSignatures as string[], meterOrder);
    out.selectedTimeSignatures = meters;
    out.selectedTimeSignature = meters[0];
  }
  // Printed dynamics are a set too, compared soft to loud (dynamics.ts).
  if (Array.isArray(options.dynamics)) out.dynamics = dynamicsSetFrom(options.dynamics);
  // Other skips are a set as well: removing one and adding it back is no edit.
  if (Array.isArray(options.extraSkips)) out.extraSkips = canonicalSkips(options.extraSkips);
  return JSON.stringify(out);
}

/**
 * What the page saves - presets, localStorage, "edited" - for its key, meter
 * and range: the pools, and the range placed for the pool's first key. Never
 * the key or meter last drawn, or every Generate would mark a preset edited.
 */
export function setupSnapshot(s: {
  keys: string[];
  meters: string[];
  span: Span | null;
  anchor: number;
  range: { min: number; max: number };
}) {
  return {
    selectedKeys: [...s.keys],
    selectedKey: s.keys[0],
    selectedTimeSignatures: [...s.meters],
    selectedTimeSignature: s.meters[0],
    selectedRange: (s.span && rangeForSpan(s.span, s.keys[0], s.anchor)) || { ...s.range },
    ...(s.span ? { rangeSpan: [...s.span] as Span, rangeAnchor: s.anchor } : {}),
  };
}
