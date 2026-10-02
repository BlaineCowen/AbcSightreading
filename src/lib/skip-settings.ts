import { isSkipMove, type SkipMove, type SkipPolicy } from "./skip-policy";

/**
 * The Unison page's skip controls as data (NYSSMA Voice levels spec, section 1):
 * Max skip or Custom skips, the rows, the quick-add chips, what a skip may
 * land on - and how they are kept in presets and URLs. Pure, so it is tested
 * here rather than in the component.
 */

export type SkipMode = "max" | "custom";

export interface SkipSettings {
  skipMode: SkipMode;
  /** Kept while in Max skip mode too, so switching back restores the list. */
  customSkips: SkipMove[];
  /** Lengths (32nds) a skip may land on. All four: no limit. */
  skipLandOn: number[];
}

export const LAND_ON_CHOICES: readonly { length: number; label: string }[] = [
  { length: 4, label: "Eighth" },
  { length: 8, label: "Quarter" },
  { length: 12, label: "Dotted quarter" },
  { length: 16, label: "Half" },
];
export const ALL_LAND_ON: number[] = LAND_ON_CHOICES.map((c) => c.length);

export const SKIP_DEGREES: readonly { value: number; label: string }[] = [
  "do", "re", "mi", "fa", "sol", "la", "ti",
].map((name, k) => ({ value: k + 1, label: `${k + 1} ${name}` }));

const up = (from: number, to: number): SkipMove => ({ from, to, dir: "up" });
const down = (from: number, to: number): SkipMove => ({ from, to, dir: "down" });
const both = (from: number, to: number): SkipMove => ({ from, to, dir: "both" });
/** Scale degree n, wrapped into 1-7. */
const deg = (n: number) => ((((n - 1) % 7) + 7) % 7) + 1;

/** Perfect 4ths and 5ths, both ways. Fa-ti and ti-fa are the tritone, left out. */
const FOURTHS_AND_FIFTHS: SkipMove[] = [
  ...[1, 2, 3, 5, 6, 7].map((a) => both(a, deg(a + 3))), // a 4th up, a 5th down
  ...[1, 2, 3, 4, 5, 6].map((a) => both(a, deg(a + 4))), // a 5th up, a 4th down
];

export type SkipChipId =
  | "do-mi-sol-up" | "do-sol-up" | "sol-mi-do-down" | "sol-do-down"
  | "do-sol-down" | "sol-ti-re-up" | "tonic-triad" | "fourths-fifths";

/** One click adds the rows, which stay editable. "Clear" is the page's own button. */
export const SKIP_CHIPS: readonly { id: SkipChipId; label: string; moves: SkipMove[] }[] = [
  { id: "do-mi-sol-up", label: "Do-Mi-Sol ↑", moves: [up(1, 3), up(3, 5)] },
  { id: "do-sol-up", label: "Do-Sol ↑", moves: [up(1, 5)] },
  { id: "sol-mi-do-down", label: "Sol-Mi-Do ↓", moves: [down(5, 3), down(3, 1)] },
  { id: "sol-do-down", label: "Sol-Do ↓", moves: [down(5, 1)] },
  { id: "do-sol-down", label: "Do-Sol ↓", moves: [down(1, 5)] },
  { id: "sol-ti-re-up", label: "Sol-Ti-Re ↑", moves: [up(5, 7), up(7, 2)] },
  { id: "tonic-triad", label: "Tonic triad ↕", moves: [both(1, 3), both(3, 5), both(1, 5)] },
  { id: "fourths-fifths", label: "4ths & 5ths ↕", moves: FOURTHS_AND_FIFTHS },
];

/** A chip's rows, as copies. */
export function chipMoves(id: SkipChipId): SkipMove[] {
  return (SKIP_CHIPS.find((c) => c.id === id)?.moves ?? []).map((m) => ({ ...m }));
}

/** Add rows: one already listed is left alone, and the other direction of one makes it ↕. */
export function addMoves(list: SkipMove[], add: SkipMove[]): SkipMove[] {
  const out = list.map((m) => ({ ...m }));
  for (const m of add) {
    const same = out.find((o) => o.from === m.from && o.to === m.to);
    if (!same) out.push({ ...m });
    else if (same.dir !== m.dir && same.dir !== "both") same.dir = "both";
  }
  return out;
}

/** Turn one land-on value on or off, in note-value order. The last one stays on. */
export function toggleLandOn(list: number[], length: number): number[] {
  if (list.includes(length)) return list.length > 1 ? list.filter((l) => l !== length) : [...list];
  return ALL_LAND_ON.filter((l) => l === length || list.includes(l));
}

/** The rule these controls describe. */
export function policyFor(maxSkip: number, s: SkipSettings): SkipPolicy {
  if (s.skipMode === "max") return { kind: "max", maxSkip };
  const moves = s.customSkips.filter(isSkipMove).map((m) => ({ ...m }));
  const limited = ALL_LAND_ON.some((l) => !s.skipLandOn.includes(l));
  return limited ? { kind: "custom", moves, landOn: [...s.skipLandOn] } : { kind: "custom", moves };
}

/** The settings in a saved options object; one without them is Max skip mode. */
export function skipSettingsFrom(options: unknown): SkipSettings {
  const o = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
  const customSkips = Array.isArray(o.customSkips)
    ? o.customSkips.filter(isSkipMove).map((m) => ({ from: m.from, to: m.to, dir: m.dir }))
    : [];
  const landOn = Array.isArray(o.skipLandOn)
    ? ALL_LAND_ON.filter((l) => (o.skipLandOn as unknown[]).includes(l))
    : [];
  return {
    skipMode: o.skipMode === "custom" ? "custom" : "max",
    customSkips,
    skipLandOn: landOn.length ? landOn : [...ALL_LAND_ON],
  };
}

const DIR_CODE = { up: "u", down: "d", both: "b" } as const;
const CODE_DIR = { u: "up", d: "down", b: "both" } as const;

/** Custom skips only: `skipMode=custom&skips=1u3,3u5&skipLand=8`. Max skip mode adds nothing. */
export function writeSkipParams(s: SkipSettings, params: URLSearchParams): void {
  if (s.skipMode !== "custom") return;
  params.set("skipMode", "custom");
  params.set("skips", s.customSkips.map((m) => `${m.from}${DIR_CODE[m.dir]}${m.to}`).join(","));
  params.set("skipLand", s.skipLandOn.join(","));
}

/** The settings a link carries, or null for a link in Max skip mode (every old link). */
export function readSkipParams(params: URLSearchParams): SkipSettings | null {
  if (params.get("skipMode") !== "custom") return null;
  const customSkips = (params.get("skips") ?? "").split(",").flatMap((text) => {
    const m = /^([1-7])([udb])([1-7])$/.exec(text.trim());
    if (!m) return [];
    const move = { from: Number(m[1]), to: Number(m[3]), dir: CODE_DIR[m[2] as keyof typeof CODE_DIR] };
    return isSkipMove(move) ? [move] : [];
  });
  const skipLandOn = (params.get("skipLand") ?? "").split(",").map(Number);
  return skipSettingsFrom({ skipMode: "custom", customSkips, skipLandOn });
}

/**
 * Can a line in custom mode get from every selected degree to every other,
 * by steps between selected neighbours and the listed skips? Ignores the
 * range and the landing limit - a quick check before generating, so the
 * teacher hears "add a skip", not "increase Max Skip". Max skip mode keeps
 * the page's own gap check, so this says true for it.
 */
export function degreesConnected(degrees: number[], policy: SkipPolicy): boolean {
  const selected = [...new Set(degrees.filter((d) => d >= 1 && d <= 7))];
  if (selected.length <= 1 || policy.kind === "max") return true;
  const nextOf = (d: number) => [
    ...[deg(d + 1), deg(d - 1)].filter((s) => selected.includes(s)),
    ...policy.moves.filter((m) => m.from === d && selected.includes(m.to)).map((m) => m.to),
  ];
  return selected.every((start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) for (const n of nextOf(queue.shift()!)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    return seen.size === selected.length;
  });
}
