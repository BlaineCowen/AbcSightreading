import { ladder, stepHref } from "../ladder";
import { nyssmaVoiceLevels } from "../nyssma-presets";
import { TRACKS, trackById } from "./tracks";

/**
 * Everything a teacher can subscribe to, so the preset menu holds only what
 * they teach from: the site's own sets (abcStepByStep, UIL, NYSSMA Voice) and
 * the instrument tracks (src/lib/curriculum/tracks.ts). abcStepByStep is
 * subscribed until the teacher chooses otherwise (DEFAULT_SUBSCRIPTIONS).
 *
 * The built-in sets are free to subscribe to, signed out too (kept in this
 * browser); the instrument tracks are Pro. Ids are stored: never rename one.
 */

export const STEP_BY_STEP = "abc-step-by-step";
export const UIL_CHOIR = "uil-choir";
export const NYSSMA_VOICE = "nyssma-voice";

export interface BuiltinSet {
  id: string;
  name: string;
  /** Who it is for, one line. */
  level: string;
  blurb: string;
  facts: [string, string][];
  /** Where it opens. */
  href: string;
  color: "sky" | "mint" | "peach" | "butter";
}

export const BUILTIN_SETS: BuiltinSet[] = [
  {
    id: STEP_BY_STEP,
    name: "abcStepByStep",
    level: "Choir and voice",
    blurb: "From a first rhythm to four parts and past UIL 5, one new thing at a time.",
    facts: [["Steps", `${ladder.length}`], ["Pages", "Unison, then Choral"], ["Starts", "ta and ti-ti"]],
    href: stepHref(ladder[0]),
    color: "peach",
  },
  {
    id: UIL_CHOIR,
    name: "UIL",
    level: "Texas choir",
    blurb: "What each Texas UIL sight-reading level asks for, in every voicing it uses.",
    facts: [["Levels", "1 to 5"], ["Page", "Choral"], ["Voicings", "SATB, SSA, TTB and more"]],
    href: "/choral-sightreading",
    color: "sky",
  },
  {
    id: NYSSMA_VOICE,
    name: "NYSSMA Voice",
    level: "New York solo voice",
    blurb: "NYSSMA's solo voice sight-reading criteria: keys, meters, skips, rhythms, tempo and dynamics.",
    facts: [["Levels", `I to ${["I", "II", "III", "IV", "V"][nyssmaVoiceLevels.length - 1]}`], ["Page", "Unison"], ["Source", "NYSSMA Manual, Ed. 33"]],
    href: `/sightreading?nyssma=${nyssmaVoiceLevels[0].id}`,
    color: "mint",
  },
];

export const DEFAULT_SUBSCRIPTIONS = [STEP_BY_STEP];

export const isBuiltinSet = (id: unknown): id is string => typeof id === "string" && BUILTIN_SETS.some((s) => s.id === id);
/** Anything that can be subscribed to. */
export const isSubscribable = (id: unknown): id is string => isBuiltinSet(id) || (typeof id === "string" && id in trackById);
/** Whether subscribing needs Pro (the instrument tracks). */
export const needsPro = (id: string) => id in trackById;

/** A stored list, or the default when none was ever chosen (null). Unknown ids dropped, order kept. */
export function subscriptionsFrom(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [...DEFAULT_SUBSCRIPTIONS];
  return [...new Set(stored.filter(isSubscribable))];
}

export const ALL_SUBSCRIBABLE = [...BUILTIN_SETS.map((s) => s.id), ...TRACKS.map((t) => t.id)];
