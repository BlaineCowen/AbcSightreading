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

export function isSelectableRhythm(rhythm: Rhythm): boolean {
  if (rhythm.name.includes("thirtySecond")) return false;
  if (rhythm.name === "dotQuarter") return false;
  if (rhythm.rest) return SELECTABLE_RESTS.has(rhythm.name);
  return true;
}

export const selectableRhythms: Rhythm[] = rhythms.filter(isSelectableRhythm);
