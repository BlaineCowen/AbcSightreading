import { isSkipMove, type SkipMove, type SkipPolicy } from "./skip-policy";

/**
 * The Unison page's skip controls as data (NYSSMA Voice levels spec, section 1):
 * Max skip, and the "Choose exact skips" panel - an on/off switch, pattern
 * toggles, other skips, and what a skip may land on - and how they are kept
 * in presets and URLs. Pure, so it is tested here rather than in the component.
 */

export interface SkipSettings {
  /** "Only allow these skips". Off: Max skip rules, and the choices below are kept for later. */
  exactOn: boolean;
  /** Ids of the patterns that are on, in SKIP_CHIPS order. */
  patterns: SkipChipId[];
  /** Other skips, in the order they were added. */
  extraSkips: SkipMove[];
  /** Lengths (32nds) a skip may land on. All four: no limit. */
  landOn: number[];
}

export const LAND_ON_CHOICES: readonly { length: number; label: string; icon: string }[] = [
  { length: 4, label: "eighth", icon: "eighth" },
  { length: 8, label: "quarter", icon: "quarter" },
  { length: 12, label: "dotted quarter", icon: "dotQuarter" },
  { length: 16, label: "half", icon: "half" },
];
export const ALL_LAND_ON: number[] = LAND_ON_CHOICES.map((c) => c.length);

/** Max skip mode, nothing chosen: what a page, preset or link without the fields gets. */
export const DEFAULT_SKIP_SETTINGS: SkipSettings = Object.freeze({
  exactOn: false,
  patterns: Object.freeze([]),
  extraSkips: Object.freeze([]),
  landOn: Object.freeze([...ALL_LAND_ON]),
}) as unknown as SkipSettings;

/** Solfège for scale degrees 1-7, as the panel names them. */
export const DEGREE_NAMES = ["do", "re", "mi", "fa", "sol", "la", "ti"] as const;
export const DIR_ARROWS = { up: "↗", down: "↘", both: "↕" } as const;

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

/** The patterns: each one on allows its rows. Ids are saved in presets and links - keep them stable. */
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
const CHIP_IDS: readonly string[] = SKIP_CHIPS.map((c) => c.id);

/** A pattern's rows, as copies. */
export function chipMoves(id: SkipChipId): SkipMove[] {
  return (SKIP_CHIPS.find((c) => c.id === id)?.moves ?? []).map((m) => ({ ...m }));
}

/** Known ids only, once each, in SKIP_CHIPS order. */
function cleanPatterns(ids: readonly unknown[]): SkipChipId[] {
  return SKIP_CHIPS.map((c) => c.id).filter((id) => ids.includes(id));
}

/** One key per distinct skip: a ↕ row is the same either way round. */
const moveKey = (m: SkipMove) =>
  m.dir === "both" ? `${Math.min(m.from, m.to)}b${Math.max(m.from, m.to)}` : `${m.from}${m.dir}${m.to}`;

/** Rows once each, first one kept. */
function unique(moves: SkipMove[]): SkipMove[] {
  const seen = new Set<string>();
  return moves.filter((m) => !seen.has(moveKey(m)) && !!seen.add(moveKey(m))).map((m) => ({ ...m }));
}

/** Turn a pattern on or off. Turning one on turns exact skips on; turning one off leaves the switch alone. */
export function togglePattern(s: SkipSettings, id: SkipChipId): SkipSettings {
  const on = s.patterns.includes(id);
  return {
    ...s,
    exactOn: on ? s.exactOn : true,
    patterns: cleanPatterns(on ? s.patterns.filter((p) => p !== id) : [...s.patterns, id]),
  };
}

/** The "Only allow these skips" switch. Every choice is kept either way. */
export function setExactOn(s: SkipSettings, exactOn: boolean): SkipSettings {
  return { ...s, exactOn };
}

/** Add an other skip. One already there, or a unison, changes nothing. */
export function addExtraSkip(list: SkipMove[], move: SkipMove): SkipMove[] {
  if (!isSkipMove(move)) return list;
  const key = moveKey(move);
  return list.some((m) => moveKey(m) === key) ? list : [...list, { from: move.from, to: move.to, dir: move.dir }];
}

/** Turn one land-on value on or off, in note-value order. The last one stays on. */
export function toggleLandOn(list: number[], length: number): number[] {
  if (list.includes(length)) return list.length > 1 ? list.filter((l) => l !== length) : [...list];
  return ALL_LAND_ON.filter((l) => l === length || list.includes(l));
}

/** The rule these controls describe: Max skip, or the union of the patterns on and the other skips. */
export function policyFor(maxSkip: number, s: SkipSettings): SkipPolicy {
  if (!s.exactOn) return { kind: "max", maxSkip };
  const moves = unique([
    ...s.patterns.flatMap((id) => chipMoves(id)),
    ...s.extraSkips.filter(isSkipMove),
  ]);
  const limited = ALL_LAND_ON.some((l) => !s.landOn.includes(l));
  return limited ? { kind: "custom", moves, landOn: [...s.landOn] } : { kind: "custom", moves };
}

/** The settings in a saved options object. Anything missing or malformed falls back to the default (Max skip). */
export function skipSettingsFrom(options: unknown): SkipSettings {
  const o = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
  const extraSkips = Array.isArray(o.extraSkips)
    ? unique(o.extraSkips.filter(isSkipMove))
    : [];
  const landOn = Array.isArray(o.landOn)
    ? ALL_LAND_ON.filter((l) => (o.landOn as unknown[]).includes(l))
    : [];
  return {
    exactOn: o.exactOn === true,
    patterns: Array.isArray(o.patterns) ? cleanPatterns(o.patterns) : [],
    extraSkips: extraSkips.map((m) => ({ from: m.from, to: m.to, dir: m.dir })),
    landOn: landOn.length ? landOn : [...ALL_LAND_ON],
  };
}

const DIR_CODE = { up: "u", down: "d", both: "b" } as const;
const CODE_DIR = { u: "up", d: "down", b: "both" } as const;
const SKIP_PARAMS = ["exactSkips", "skipPatterns", "skips", "skipLand"] as const;

/**
 * `exactSkips=1&skipPatterns=do-mi-sol-up&skips=2u5,6b4&skipLand=8,16`, each
 * only when it differs from the default - so Max skip with nothing chosen
 * adds nothing, and the choices survive a reload with the switch off.
 */
export function writeSkipParams(s: SkipSettings, params: URLSearchParams): void {
  if (s.exactOn) params.set("exactSkips", "1");
  if (s.patterns.length) params.set("skipPatterns", s.patterns.join(","));
  if (s.extraSkips.length) params.set("skips", s.extraSkips.map((m) => `${m.from}${DIR_CODE[m.dir]}${m.to}`).join(","));
  if (ALL_LAND_ON.some((l) => !s.landOn.includes(l))) params.set("skipLand", s.landOn.join(","));
}

/** The settings a link carries, or null for a link without any (every old link: Max skip mode). */
export function readSkipParams(params: URLSearchParams): SkipSettings | null {
  if (!SKIP_PARAMS.some((p) => params.has(p))) return null;
  const list = (name: string) => (params.get(name) ?? "").split(",").map((t) => t.trim());
  const extraSkips = list("skips").flatMap((text) => {
    const m = /^([1-7])([udb])([1-7])$/.exec(text);
    return m ? [{ from: Number(m[1]), to: Number(m[3]), dir: CODE_DIR[m[2] as keyof typeof CODE_DIR] }] : [];
  });
  return skipSettingsFrom({
    exactOn: params.get("exactSkips") === "1",
    patterns: list("skipPatterns"),
    extraSkips,
    landOn: list("skipLand").map(Number),
  });
}

/**
 * Can a line with exact skips get from every selected degree to every other,
 * by steps between selected neighbours and the allowed skips? Ignores the
 * range and the landing limit - a quick check before generating, so the
 * teacher hears "add a skip", not "increase Max Skip". Max skip mode keeps
 * the page's own gap check, so this says true for it.
 */
export function degreesConnected(degrees: number[], policy: SkipPolicy): boolean {
  const selected = [...new Set(degrees.filter((d) => d >= 1 && d <= 7))];
  if (selected.length <= 1 || policy.kind === "max") return true;
  const nextOf = (d: number) => [
    ...[deg(d + 1), deg(d - 1)].filter((s) => selected.includes(s)),
    ...policy.moves.flatMap((m) => {
      if (m.from === d) return selected.includes(m.to) ? [m.to] : [];
      if (m.dir === "both" && m.to === d) return selected.includes(m.from) ? [m.from] : []; // ↕ is symmetric
      return [];
    }),
  ];
  return selected.every((start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) for (const n of nextOf(queue.shift()!)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    return seen.size === selected.length;
  });
}
