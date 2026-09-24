/**
 * What the presets API accepts. Pure, so the rules are tested without a
 * database (tests/unit/preset-validate.test.ts).
 *
 * The API stores `params` as an opaque blob - each page knows its own settings
 * shape and already copes with old or partial presets when loading one - so
 * the checks here are about size and which list, not about the settings.
 */

/** The lists presets are kept in: choral's, and unison's. */
export const PRESET_STORES = ["abcsr_presets", "abcsr_unison_presets"] as const;
export type PresetStore = (typeof PRESET_STORES)[number];

export const MAX_NAME_LENGTH = 80;
/** Generous: a choral preset is about 1.5 KB of JSON. */
export const MAX_PARAMS_BYTES = 32 * 1024;
export const MAX_PRESETS_PER_STORE = 200;

export function isPresetStore(value: unknown): value is PresetStore {
  return typeof value === "string" && (PRESET_STORES as readonly string[]).includes(value);
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkName(value: unknown): Checked<string> {
  if (typeof value !== "string") return { ok: false, error: "A preset needs a name." };
  const name = value.trim();
  if (!name) return { ok: false, error: "A preset needs a name." };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Preset names are at most ${MAX_NAME_LENGTH} characters.` };
  }
  return { ok: true, value: name };
}

export function checkParams(value: unknown): Checked<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Preset settings must be an object." };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
  if (bytes > MAX_PARAMS_BYTES) return { ok: false, error: "Those settings are too large to save." };
  return { ok: true, value: value as Record<string, unknown> };
}

export interface NewPreset {
  store: PresetStore;
  name: string;
  params: Record<string, unknown>;
  /** Kept when importing from the browser, so the list keeps its order. */
  createdAt?: Date;
}

/** One preset as the page sends it: `{ store, name, params, createdAt? }`. */
export function checkNewPreset(body: unknown, store?: PresetStore): Checked<NewPreset> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Expected a preset." };
  const b = body as Record<string, unknown>;
  const s = store ?? b.store;
  if (!isPresetStore(s)) return { ok: false, error: "Unknown preset list." };
  const name = checkName(b.name);
  if (!name.ok) return name;
  const params = checkParams(b.params);
  if (!params.ok) return params;
  const created = typeof b.createdAt === "number" ? new Date(b.createdAt) : undefined;
  const createdAt =
    created && !Number.isNaN(created.getTime()) && created.getTime() <= Date.now()
      ? created
      : undefined;
  return { ok: true, value: { store: s, name: name.value, params: params.value, createdAt } };
}

/**
 * A batch of browser-saved presets being copied into an account, minus any
 * already there. A preset counts as already there when name and creation time
 * both match, so importing twice - two tabs, or a retry after a dropped
 * response - never doubles the list.
 */
export function presetsToImport(
  incoming: NewPreset[],
  existing: { name: string; createdAt: Date }[]
): NewPreset[] {
  const key = (name: string, at?: Date) => `${name}\u0000${at?.getTime() ?? ""}`;
  const seen = new Set(existing.map((p) => key(p.name, p.createdAt)));
  const out: NewPreset[] = [];
  for (const p of incoming) {
    const k = key(p.name, p.createdAt);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
