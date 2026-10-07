import type { SavedPreset } from "./preset-storage";

/**
 * Which preset a practice page was showing, kept across a reload.
 *
 * The settings themselves already survive a reload (the address, or the
 * page's own saved options), but which preset they came from did not: after
 * Save current and a reload the picker read "Choose…", and with no preset to
 * compare against, every tab lit its "changed" dot, so the preset looked lost.
 * Now the page remembers the preset and what it held (`sig`, whatever the page
 * compares against for "edited"), and puts both back.
 *
 * Only on a reload or back/forward: a fresh visit, or a link someone shared,
 * opens as it always has rather than wearing the last preset used here.
 */
export type ActivePresetRecord = {
  label: string;
  /** "UIL 3" for a UIL level (Choral), or a NYSSMA level id (Unison, nyssma-presets.ts). */
  level?: string | null;
  stepId?: string | null;
  /** A saved preset, whole, so Revert works without loading the list. */
  saved?: SavedPreset<any> | null;
  /** Half of a curriculum track's step: "track:band-trumpet-03:notes". */
  trackKey?: string | null;
  sig: unknown;
};

const key = (page: string) => `sr-active-preset-${page}`;

export function rememberActivePreset(page: string, rec: ActivePresetRecord | null) {
  try {
    if (rec) sessionStorage.setItem(key(page), JSON.stringify(rec));
    else sessionStorage.removeItem(key(page));
  } catch {}
}

/** The preset to put back, when this load is a reload or back/forward. */
export function activePresetToRestore(page: string): ActivePresetRecord | null {
  try {
    const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav || (nav.type !== "reload" && nav.type !== "back_forward")) return null;
    const raw = sessionStorage.getItem(key(page));
    const rec = raw ? (JSON.parse(raw) as ActivePresetRecord) : null;
    return rec && typeof rec.label === "string" && rec.label ? rec : null;
  } catch {
    return null;
  }
}

/**
 * The "edited" signature to compare against after a reload. A record saved
 * before the page gained a setting (exact skips, say) lacks that field, so
 * compared as it was the preset would read "edited" once for nothing. The
 * missing fields take the page's values, in the page's order, and fields the
 * page no longer has are dropped; a field the record does have keeps its
 * value, so a real edit still shows. Unreadable: the page's own settings.
 */
export function restoredSignature(sig: unknown, current: Record<string, unknown>): string {
  const fresh = JSON.stringify(current);
  if (typeof sig !== "string") return fresh;
  let stored: unknown;
  try {
    stored = JSON.parse(sig);
  } catch {
    return fresh;
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return fresh;
  const s = stored as Record<string, unknown>;
  const keys = Object.keys(current);
  if (keys.length === Object.keys(s).length && keys.every((k) => k in s)) return sig;
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, k in s ? s[k] : current[k]])));
}
