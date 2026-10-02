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

export function isSelectableRhythm(rhythm: Rhythm): boolean {
  // Simple meter's picker. Compound figures (the dotted quarter among them)
  // have their own: selectableCompoundRhythms.
  if ((rhythm.meterKind ?? "simple") !== "simple") return false;
  if (rhythm.name.includes("thirtySecond")) return false;
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

/**
 * The picker's order: notes, then rests, each shortest first.
 *
 * The picker used to show the rhythm file's own order, which is the order the
 * figures were added to it - a dotted half beside a sixteenth pattern, rests
 * scattered through. Grouped and sorted, a director finds a figure by how long
 * it is. Figures of the same length keep a single note ahead of the patterns
 * that fill that length, and are otherwise left in file order.
 */
export type PickerGroupLabel = "Notes" | "Rests" | "Core" | "Sixteenths";

const COMPOUND_GROUPS = ["Core", "Rests", "Sixteenths"] as const;

export function rhythmPickerGroups<R extends Rhythm>(
  list: R[]
): { label: PickerGroupLabel; rhythms: R[] }[] {
  const ordered = (rs: R[]) =>
    rs
      .map((r, i) => ({ r, i }))
      .sort(
        (a, b) =>
          a.r.totalValue - b.r.totalValue ||
          a.r.abcValue.length - b.r.abcValue.length ||
          a.i - b.i
      )
      .map(({ r }) => r);
  // Compound meter groups as the spec does: the core figures, the ones with
  // rests, the ones with sixteenths.
  if (list.length > 0 && list.every((r) => r.meterKind === "compound")) {
    return COMPOUND_GROUPS.map((label) => ({
      label,
      rhythms: ordered(list.filter((r) => r.pickerGroup === label)),
    })).filter((g) => g.rhythms.length > 0);
  }
  return [
    { label: "Notes" as const, rhythms: ordered(list.filter((r) => !containsRest(r))) },
    { label: "Rests" as const, rhythms: ordered(list.filter((r) => containsRest(r))) },
  ].filter((g) => g.rhythms.length > 0);
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
