import { rhythms, type Rhythm } from "../resources/rhythms";
import type { MeterKind } from "./meter";

/**
 * The rhythms a user can actually pick, and the single source of truth for it.
 *
 * This lived inline in AbcjsSingle.svelte, which meant anything else reasoning
 * about "what can appear in an exercise" - the rhythm checks in scripts/, a
 * shared link's ?rhythms= list - had to restate the rule and could drift from
 * it. Everything downstream assumes these durations: they all tile a beat, so
 * notes land on the grid the barlines and rhythm syllables expect.
 */
export const SELECTABLE_RESTS = new Set([
  "eighthRestEighth",
  "quarterRest",
  "halfRest",
  "wholeRest",
]);

/**
 * True if any part of the rhythm is a rest, including one buried inside a
 * pattern.
 *
 * The top-level `rest` flag is not enough: `eighthRestEighth` is a *pattern*
 * whose first element is a rest and whose second is a pitched eighth, so its own
 * `rest` is `false`. Anything filtering on `rhythm.rest` alone lets it through.
 */
export function containsRest(rhythm: Rhythm): boolean {
  return rhythm.rest || rhythm.abcValue.some((v) => String(v).startsWith("z"));
}

const NOT_OFFERED = new Set(["dotHalfQuarter"]);

export function isSelectableRhythm(rhythm: Rhythm): boolean {
  // Simple meter's picker. Compound figures (the dotted quarter among them)
  // have their own: selectableCompoundRhythms.
  if ((rhythm.meterKind ?? "simple") !== "simple") return false;
  if (rhythm.name.includes("thirtySecond")) return false;
  // Dotted half + quarter is a dotted half and a quarter, both on offer; as
  // one figure it only fitted 4/4 (removed 8 October 2026).
  if (NOT_OFFERED.has(rhythm.name)) return false;
  if (rhythm.rest) return SELECTABLE_RESTS.has(rhythm.name);
  return true;
}

export const selectableRhythms: Rhythm[] = rhythms.filter(isSelectableRhythm);

/** Compound meter's picker: every compound figure that has a picker group. */
export function isSelectableCompoundRhythm(rhythm: Rhythm): boolean {
  return rhythm.meterKind === "compound" && rhythm.pickerGroup !== undefined;
}

export const selectableCompoundRhythms: Rhythm[] = rhythms.filter(isSelectableCompoundRhythm);

/** The figures a meter of this kind offers - and the only ones it generates. */
export function selectableRhythmsFor(kind: MeterKind): Rhythm[] {
  return kind === "compound" ? selectableCompoundRhythms : selectableRhythms;
}

/**
 * Whether a selected rhythm can actually appear in a choral exercise.
 *
 * `generateChoral` drops anything shorter than a quarter, because every
 * standalone note takes its own chord and a bare eighth would mean the harmony
 * changing twice a beat; and anything longer than a measure, because it has
 * nowhere to fit. Neither is visible in the picker, so a user can tick
 * `wholeRest` in 3/4 and get nothing, with no message - the same silent-drop
 * that hid eighth notes and rests from choral for so long.
 *
 * Exported so the UI can say so instead of the generator quietly deciding.
 */
export function canAppearInChoral(
  rhythm: Rhythm,
  tsPerMeasure: number
): boolean {
  if (rhythm.totalValue < 8 || rhythm.totalValue > tsPerMeasure) return false;
  // A rest as long as a measure silences the whole choir for a bar, because
  // choral rests are block rests - every voice sings the same rhythm, so one
  // rest is everybody's rest. A bar of nothing is not an exercise.
  if (rhythm.rest && rhythm.totalValue >= tsPerMeasure) return false;
  return true;
}

export type PickerGroupLabel = "Notes" | "Rests" | "Core" | "Sixteenths";

/**
 * The picker's order, chosen by Blaine (8 October 2026, by dragging the
 * figures into place): longest note first in simple meter, then the beat's
 * subdivisions, then the dotted and syncopated figures; compound meter the
 * same way. The groups are the picker's headings.
 */
export const PICKER_ORDER: Record<MeterKind, { label: PickerGroupLabel; names: string[] }[]> = {
  simple: [
    {
      label: "Notes",
      names: [
        "whole", "dotHalf", "half", "quarter", "eighthEighth", "fourSixteenths", "eighthSixteenthSixteenth",
        "sixteenthSixteenthEighth", "dotEighthSixteenth", "sixteenthEighthSixteenth", "dotQuarterEighth",
        "eighthDotQuarter", "eighthQuarterEighth",
      ],
    },
    { label: "Rests", names: ["quarterRest", "eighthRestEighth", "halfRest", "wholeRest"] },
  ],
  compound: [
    { label: "Core", names: ["dotHalfCompound", "dotQuarter", "quarterEighth", "eighthQuarter", "threeEighths"] },
    { label: "Rests", names: ["dotQuarterRest", "quarterEighthRest", "eighthRestTwoEighths", "twoEighthsEighthRest", "dotHalfRest"] },
    {
      label: "Sixteenths",
      names: ["quarterTwoSixteenths", "twoSixteenthsTwoEighths", "eighthTwoSixteenthsEighth", "twoEighthsTwoSixteenths", "sixSixteenths"],
    },
  ],
};

/**
 * The picker's groups and order (PICKER_ORDER). A figure the list does not
 * name (one added later) is never lost: it goes to the end of its group, by
 * the old rule (a rest is a Rest, a compound figure by its pickerGroup),
 * shortest first.
 */
export function rhythmPickerGroups<R extends Rhythm>(
  list: R[]
): { label: PickerGroupLabel; rhythms: R[] }[] {
  const kind: MeterKind = list.length > 0 && list.every((r) => r.meterKind === "compound") ? "compound" : "simple";
  const groups = PICKER_ORDER[kind].map((g) => ({
    label: g.label,
    rhythms: g.names.map((n) => list.find((r) => r.name === n)).filter((r): r is R => r !== undefined),
  }));
  const named = new Set(PICKER_ORDER[kind].flatMap((g) => g.names));
  const groupOf = (r: R): PickerGroupLabel =>
    kind === "compound" ? ((r.pickerGroup as PickerGroupLabel) ?? "Core") : containsRest(r) ? "Rests" : "Notes";
  const extras = list.filter((r) => !named.has(r.name)).sort((a, b) => a.totalValue - b.totalValue);
  for (const r of extras) {
    const g = groups.find((x) => x.label === groupOf(r));
    if (g) g.rhythms.push(r);
    else groups.push({ label: groupOf(r), rhythms: [r] });
  }
  return groups.filter((g) => g.rhythms.length > 0);
}

/** What a fresh selection is, per kind: eighths and quarters, or compound's Core set. */
export const DEFAULT_RHYTHM_NAMES: Record<MeterKind, string[]> = {
  simple: ["eighthEighth", "quarter"],
  compound: selectableCompoundRhythms.filter((r) => r.pickerGroup === "Core").map((r) => r.name),
};

/**
 * Saved rhythm names, resolved against the figures this kind of meter offers.
 * A preset, link or old save can name the other kind's figures - or nothing
 * real - and a selection must never come back empty, so that falls back to the
 * kind's defaults.
 */
export function resolveRhythmSelection(names: unknown, kind: MeterKind): Rhythm[] {
  const pool = selectableRhythmsFor(kind);
  const wanted = Array.isArray(names) ? names : [];
  const resolved = wanted
    .map((name) => pool.find((r) => r.name === name))
    .filter((r): r is Rhythm => r !== undefined);
  if (resolved.length > 0) return resolved;
  return DEFAULT_RHYTHM_NAMES[kind]
    .map((name) => pool.find((r) => r.name === name))
    .filter((r): r is Rhythm => r !== undefined);
}

/** Each kind's last selection, kept while the reader moves between them. */
export type RhythmMemory = Partial<Record<MeterKind, string[]>>;

/**
 * Moving between a simple and a compound meter puts away one kind's selection
 * and brings back the other's - Core, the first time. 4/4 -> 6/8 -> 4/4
 * restores what the teacher had ticked in 4/4.
 */
export function switchRhythmKind(
  memory: RhythmMemory,
  from: MeterKind,
  to: MeterKind,
  current: string[]
): { memory: RhythmMemory; selection: Rhythm[] } {
  if (from === to) return { memory, selection: resolveRhythmSelection(current, to) };
  const next: RhythmMemory = { ...memory, [from]: [...current] };
  return { memory: next, selection: resolveRhythmSelection(next[to] ?? [], to) };
}
