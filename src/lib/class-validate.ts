/**
 * What the classes API accepts. Pure, so the rules are tested without a
 * database (tests/unit/class-validate.test.ts).
 *
 * A class's progress is a set of preset keys it has passed:
 *
 *   step:<ladder step id>   a step of the ladder (src/lib/ladder.ts)
 *   uil:<UIL level key>     "uil:UIL 3"
 *   saved:<preset id>       one of the director's own saved presets
 *   track:<step id>:<part>  half of a curriculum track's step (src/lib/curriculum)
 *   nyssma:<level id>       a NYSSMA Voice level ("nyssma:nyssma-voice-3")
 *   tmea:<level id>         a TMEA All-State level ("tmea:tmea-voice-2-alto")
 *
 * Built-in presets have no database row, so they are named rather than
 * referenced; a saved preset is both, so deleting it deletes its checkmarks.
 */
import { ladderById } from "./ladder";
import { uilPresets } from "./uil-presets";
import { nyssmaById } from "./nyssma-presets";
import { tmeaById } from "./tmea-presets";
import { parseTrackKey } from "./curriculum/subscriptions";

export const MAX_CLASSES = 50;
export const MAX_CLASS_NAME_LENGTH = 60;

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkClassName(value: unknown): Checked<string> {
  if (typeof value !== "string" || !value.trim()) return { ok: false, error: "A class needs a name." };
  const name = value.trim();
  if (name.length > MAX_CLASS_NAME_LENGTH) {
    return { ok: false, error: `Class names are at most ${MAX_CLASS_NAME_LENGTH} characters.` };
  }
  return { ok: true, value: name };
}

export type PresetKey =
  | { kind: "step"; id: string }
  | { kind: "uil"; level: string }
  | { kind: "saved"; id: string }
  | { kind: "track"; stepId: string; part: "rhythm" | "notes" }
  | { kind: "nyssma"; id: string }
  | { kind: "tmea"; id: string };

/**
 * A preset key the API will store, or null. Steps and levels must exist; a
 * saved preset's id is only shaped here - that it belongs to the caller is the
 * API's to check, against the database.
 */
export function parsePresetKey(value: unknown): PresetKey | null {
  if (typeof value !== "string") return null;
  const colon = value.indexOf(":");
  if (colon < 0) return null;
  const kind = value.slice(0, colon);
  const rest = value.slice(colon + 1);
  if (kind === "step" && ladderById[rest]) return { kind, id: rest };
  if (kind === "uil" && uilPresets[rest]) return { kind, level: rest };
  if (kind === "saved" && /^[A-Za-z0-9_-]{1,64}$/.test(rest)) return { kind, id: rest };
  if (kind === "nyssma" && Object.hasOwn(nyssmaById, rest)) return { kind, id: rest };
  if (kind === "tmea" && Object.hasOwn(tmeaById, rest)) return { kind, id: rest };
  if (kind === "track") {
    const t = parseTrackKey(value);
    if (t) return { kind, ...t };
  }
  return null;
}

export const presetKeyOf = {
  step: (id: string) => `step:${id}`,
  uil: (level: string) => `uil:${level}`,
  saved: (id: string) => `saved:${id}`,
  track: (stepId: string, part: "rhythm" | "notes") => `track:${stepId}:${part}`,
  nyssma: (id: string) => `nyssma:${id}`,
  tmea: (id: string) => `tmea:${id}`,
};

/** The most items a class's own course list may hold (a course is at most about 40). */
export const MAX_COURSE_STEPS = 300;

/** A class's own list of course steps: valid keys, no repeats. Ownership of saved presets is the API's to check. */
export function checkCourseSteps(value: unknown): Checked<string[] | null> {
  if (value === null) return { ok: true, value: null };
  if (!Array.isArray(value)) return { ok: false, error: "Course steps are a list." };
  if (value.length > MAX_COURSE_STEPS) return { ok: false, error: `A course holds at most ${MAX_COURSE_STEPS} steps.` };
  const seen = new Set<string>();
  for (const k of value) {
    if (!parsePresetKey(k)) return { ok: false, error: "Unknown step in the course." };
    if (seen.has(k as string)) return { ok: false, error: "A step is listed twice." };
    seen.add(k as string);
  }
  return { ok: true, value: value as string[] };
}

/** A class as the API hands it back: its passes keyed by preset key. */
export interface ClassWithProgress {
  id: string;
  name: string;
  position: number;
  /** The course it follows (class-course.ts), or null before one is chosen. */
  course: string | null;
  /** Its own list of the course's steps (hidden, reordered, presets added), or null for the course as written. */
  courseSteps: string[] | null;
  /** Preset key -> when it was passed (epoch ms). */
  passed: Record<string, number>;
}
