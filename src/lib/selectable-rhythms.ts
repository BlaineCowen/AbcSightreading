import { rhythms, type Rhythm } from "../resources/rhythms";

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
  if (rhythm.name.includes("thirtySecond")) return false;
  if (rhythm.name === "dotQuarter") return false;
  if (rhythm.rest) return SELECTABLE_RESTS.has(rhythm.name);
  return true;
}

export const selectableRhythms: Rhythm[] = rhythms.filter(isSelectableRhythm);

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
  return rhythm.totalValue >= 8 && rhythm.totalValue <= tsPerMeasure;
}
