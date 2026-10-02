import { ALL_LAND_ON, chipMoves, policyFor, type SkipChipId, type SkipSettings } from "./skip-settings";
import type { SkipMove, SkipPolicy } from "./skip-policy";
import type { DynamicMark } from "./dynamics";
import { rangeForSpan } from "./ladder";
import { timeSignatureFor } from "./meter";
import { selectableRhythms } from "./selectable-rhythms";
import type { Span } from "./unison-pools";

/**
 * NYSSMA Voice sight-reading levels I-V: Unison's first built-in presets.
 *
 * Source: NYSSMA Manual, Edition 33 (effective July 2023), p. 7-2, "Sight
 * Reading Criteria: Voice", as transcribed and checked by the owner. Spec:
 * docs/superpowers/specs/2026-10-01-nyssma-voice-levels-design.md, section 4.
 * Level VI needs compound meter, triplet eighths and hairpins, and is not here.
 *
 * Each level includes the ones before it. The chart sets no length: 8 bars.
 * Clef and pitch range stay the teacher's (the chart lets an example be
 * transposed to the singer): `span` is scale steps around do, placed on the do
 * at or above the teacher's range for each key drawn (rangeForSpan).
 */
export interface NyssmaLevel {
  /** Stable: the page remembers the active level by it. */
  id: string;
  label: string;
  short: string;
  /** One line for the picker. */
  summary: string;
  /** The key pool: one is drawn per exercise. */
  keys: string[];
  /** The meter pool, simple meters only (4/4, 2/4, 3/4). */
  meters: string[];
  /** Scale steps below and above do. */
  span: Span;
  /** 1-based; exactly the degrees inside the span. */
  scaleDegrees: number[];
  /** The exact-skips panel: on, the patterns that are on, and what a skip may land on. */
  skips: SkipSettings;
  rhythms: string[];
  bpm: number;
  dynamics: DynamicMark[];
  measures: number;
  /** Max skip: the widest interval (diatonic steps, 1 a 2nd) among the level's own skips; 1 with none. Applies only with exact skips off. */
  maxSkip: number;
  /** Max 8th / Max 16th skip: steps inside a figure (eighth pairs only step). Not linked, so Max skip can differ. */
  max8th: number;
  max16th: number;
  shortSkipsLinked: boolean;
}

const QUARTER = 8;
const HALF = 16;
const TEMPO = 72;
const MEASURES = 8;

const exact = (patterns: SkipChipId[], landOn: number[]): SkipSettings => ({
  exactOn: true,
  patterns,
  extraSkips: [],
  landOn,
});

const II_SKIPS: SkipChipId[] = ["do-mi-sol-up"];
const IV_SKIPS: SkipChipId[] = [...II_SKIPS, "do-sol-up"];
const V_SKIPS: SkipChipId[] = [...IV_SKIPS, "sol-mi-do-down", "sol-do-down", "sol-ti-re-up", "do-sol-down"];
const RHYTHMS_II = ["quarter", "half", "quarterRest"];
const RHYTHMS_III = [...RHYTHMS_II, "eighthEighth"];
const KEYS_IV = ["C", "F", "G", "D", "Eb"];
const METERS_III = ["4/4", "2/4", "3/4"];

// Eighth pairs (III-V) move by step only: a skip may land only on a quarter
// (or a half at V), never on an eighth.
const SHORT = { max8th: 1, max16th: 1, shortSkipsLinked: false };

/** Diatonic distance a listed skip travels (a ↕ row: its larger way round). */
function moveSpan(m: SkipMove): number {
  const mod = (n: number) => ((n % 7) + 7) % 7;
  const up = mod(m.to - m.from);
  const down = mod(m.from - m.to);
  return m.dir === "up" ? up : m.dir === "down" ? down : Math.max(up, down);
}

/** A level's Max skip, from its own skip list: the widest skip, or 1 (steps) with none. */
const widestSkip = (patterns: SkipChipId[]): number =>
  Math.max(1, ...patterns.flatMap((id) => chipMoves(id)).map(moveSpan));

export const nyssmaVoiceLevels: NyssmaLevel[] = [
  {
    id: "nyssma-voice-1", label: "NYSSMA Voice Level I", short: "Level I",
    summary: "C, F · 4/4 · do to sol, by step · quarter, half · mf",
    keys: ["C", "F"], meters: ["4/4"], span: [0, 4], scaleDegrees: [1, 2, 3, 4, 5],
    // Stepwise only: exact skips on with nothing chosen. Nothing to limit, so every landing is on.
    skips: exact([], [...ALL_LAND_ON]), maxSkip: widestSkip([]),
    rhythms: ["quarter", "half"], bpm: TEMPO, dynamics: ["mf"], measures: MEASURES, ...SHORT,
  },
  {
    id: "nyssma-voice-2", label: "NYSSMA Voice Level II", short: "Level II",
    summary: "+ G, 2/4 · do to la · Do-Mi-Sol ↑ on quarters · quarter rest",
    keys: ["C", "F", "G"], meters: ["4/4", "2/4"], span: [0, 5], scaleDegrees: [1, 2, 3, 4, 5, 6],
    skips: exact(II_SKIPS, [QUARTER]), maxSkip: widestSkip(II_SKIPS),
    rhythms: RHYTHMS_II, bpm: TEMPO, dynamics: ["mf"], measures: MEASURES, ...SHORT,
  },
  {
    id: "nyssma-voice-3", label: "NYSSMA Voice Level III", short: "Level III",
    summary: "+ 3/4 · eighth pairs",
    keys: ["C", "F", "G"], meters: METERS_III, span: [0, 5], scaleDegrees: [1, 2, 3, 4, 5, 6],
    skips: exact(II_SKIPS, [QUARTER]), maxSkip: widestSkip(II_SKIPS),
    rhythms: RHYTHMS_III, bpm: TEMPO, dynamics: ["mf"], measures: MEASURES, ...SHORT,
  },
  {
    id: "nyssma-voice-4", label: "NYSSMA Voice Level IV", short: "Level IV",
    summary: "+ D, E♭ · do to high do · + Do-Sol ↑ · p, f",
    keys: KEYS_IV, meters: METERS_III, span: [0, 7], scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
    skips: exact(IV_SKIPS, [QUARTER]), maxSkip: widestSkip(IV_SKIPS),
    rhythms: RHYTHMS_III, bpm: TEMPO, dynamics: ["p", "mf", "f"], measures: MEASURES, ...SHORT,
  },
  {
    id: "nyssma-voice-5", label: "NYSSMA Voice Level V", short: "Level V",
    summary: "low sol to la · + Sol-Mi-Do ↓, Sol-Do ↓, Sol-Ti-Re ↑, Do-Sol ↓ on quarters and halves · dotted quarter-eighth · mp",
    // A 9th from the sol below do, so Sol-Ti-Re ↑ and Do-Sol ↓ have their low sol.
    keys: KEYS_IV, meters: METERS_III, span: [-3, 5], scaleDegrees: [1, 2, 3, 4, 5, 6, 7],
    skips: exact(V_SKIPS, [QUARTER, HALF]), maxSkip: widestSkip(V_SKIPS),
    rhythms: [...RHYTHMS_III, "dotQuarterEighth"], bpm: TEMPO, dynamics: ["p", "mp", "mf", "f"],
    measures: MEASURES, ...SHORT,
  },
];

export const nyssmaById: Record<string, NyssmaLevel> = Object.fromEntries(
  nyssmaVoiceLevels.map((l) => [l.id, l])
);

/** The level's skip rule: exactly the skips it lists, landing where it says. */
export function nyssmaPolicy(level: NyssmaLevel): SkipPolicy {
  return policyFor(level.maxSkip, level.skips);
}

/** The level's range in a key, placed on the do at or above `anchorMin`. */
export function nyssmaRange(level: NyssmaLevel, key: string, anchorMin: number): { min: number; max: number } {
  const range = rangeForSpan(level.span, key, anchorMin);
  if (!range) throw new Error(`Unknown key ${key}`);
  return range;
}

/**
 * What the Unison page sends createNewSr for this level, in one key and
 * meter - for the scripts and tests, so they generate what the page does.
 */
export function nyssmaGenerationParams(
  level: NyssmaLevel,
  opts: { key: string; meter: string; clef: string; anchor: number; measures?: number }
): Record<string, unknown> {
  return {
    bpm: level.bpm, tempo: level.bpm, clef: opts.clef, selectedClef: opts.clef,
    timeSig: timeSignatureFor(opts.meter), selectedTimeSignature: opts.meter,
    measures: opts.measures ?? level.measures,
    // The generator reads the SkipPolicy under `maxSkip` (not the level's numeric maxSkip).
    maxSkip: nyssmaPolicy(level),
    range: nyssmaRange(level, opts.key, opts.anchor),
    rhythms: selectableRhythms.filter((r) => level.rhythms.includes(r.name)),
    selectedRhythms: level.rhythms,
    scaleDegrees: level.scaleDegrees, selectedSharpDegrees: [], selectedFlatDegrees: [],
    key: opts.key, showSolfege: true, lyricSystem: "movable", rhythmOnly: false,
    showRhythmSyllables: true, syllableSystemId: "kodaly",
    allowTiesAcrossBarline: false,
    maxEighthSkip: level.max8th, maxSixteenthSkip: level.max16th,
    accidentalsFollowStep: true,
    dynamics: level.dynamics,
    partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
  };
}
