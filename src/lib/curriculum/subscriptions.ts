import { stepOfKey, trackById } from "./tracks";

/**
 * What a teacher's subscriptions and own versions of steps may hold, checked
 * the same on the server (/api/tracks) and in the browser.
 */

/** "track:band-trumpet-03:notes" -> its parts, or null. */
export function parseTrackKey(key: string): { stepId: string; part: "rhythm" | "notes" } | null {
  const found = stepOfKey(key);
  return found ? { stepId: found.step.id, part: found.part } : null;
}

export const isTrackId = (id: unknown): id is string => typeof id === "string" && id in trackById;

/** The largest own version of a step kept, as JSON: a step's options are about 1.5 KB. */
export const MAX_OVERRIDE_BYTES = 16_000;

export function checkOverride(options: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!options || typeof options !== "object" || Array.isArray(options)) return { ok: false, error: "That is not a set of options." };
  if (JSON.stringify(options).length > MAX_OVERRIDE_BYTES) return { ok: false, error: "That version is too large to keep." };
  return { ok: true, value: options as Record<string, unknown> };
}

/** Overrides as stored: keyed by track key, only keys that still name a step. */
export function overridesFrom(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (parseTrackKey(k) && v && typeof v === "object" && !Array.isArray(v)) out[k] = v as Record<string, unknown>;
  }
  return out;
}
