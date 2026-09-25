/** Choral's presets. Other modules keep their own list - see `store` below. */
const STORAGE_KEY = 'abcsr_presets';

/** Unison's presets: a different set of settings, so a different list. */
export const UNISON_PRESET_STORE = 'abcsr_unison_presets';

export interface PresetParams {
  /** The key most recently used. Kept for presets saved before `keys` existed. */
  key: string;
  /** The pool of keys to randomise between. Optional for the same reason. */
  keys?: string[];
  timeSig: string;
  voicing: string;
  measures: number;
  maxSkip: number;
  bpm: number;
  selectedRhythmNames: string[];
  allowedChordNames: string[] | undefined;
  nctProbability: number;
  /** Eighths move by step or repeat. Optional, for presets saved before it. */
  stepwiseEighths?: boolean;
  /**
   * Whether parts enter one at a time. Optional: presets saved before this
   * existed must still load.
   *
   * "independent" is no longer offered and neither is what it did, but it stays
   * in this union because presets saved while it was are still on disk and in
   * shared links. `isVoiceTextureMode` in the component is what decides, and it
   * does not accept it - so an old preset loads with everything else intact and
   * the texture back at All voices, rather than failing to load at all.
   */
  voiceTexture?: "full" | "staggered" | "independent";
  /** Per-rhythm frequency multipliers. Optional, for presets saved before it. */
  rhythmBias?: Record<string, number>;
  voiceRanges: Record<string, [number, number]>;
}

/**
 * A named set of settings. `P` is choral's by default; unison saves its own
 * options object, under its own storage key, so the two lists never mix - a
 * choral preset has no clef and a unison one has no voicing.
 */
export interface SavedPreset<P = PresetParams> {
  id: string;
  name: string;
  createdAt: number;
  params: P;
}

export function getPresets<P = PresetParams>(store: string = STORAGE_KEY): SavedPreset<P>[] {
  try {
    return JSON.parse(localStorage.getItem(store) ?? '[]');
  } catch {
    return [];
  }
}

export function savePreset<P = PresetParams>(
  name: string,
  params: P,
  store: string = STORAGE_KEY
): SavedPreset<P> {
  const presets = getPresets<P>(store);
  const preset: SavedPreset<P> = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    createdAt: Date.now(),
    params,
  };
  try {
    localStorage.setItem(store, JSON.stringify([...presets, preset]));
  } catch (e) {
    throw new Error('Could not save preset: storage quota exceeded.', { cause: e });
  }
  return preset;
}

export function deletePreset(id: string, store: string = STORAGE_KEY): boolean {
  const presets = getPresets(store);
  const next = presets.filter((p) => p.id !== id);
  if (next.length === presets.length) return false;
  try {
    localStorage.setItem(store, JSON.stringify(next));
  } catch (e) {
    throw new Error('Could not delete preset: storage quota exceeded.', { cause: e });
  }
  return true;
}

/**
 * Renames a preset, saves over its settings, or both. Returns the preset as it
 * now is, or null when there is no such preset in this list.
 */
export function updatePreset<P = PresetParams>(
  id: string,
  change: { name?: string; params?: P },
  store: string = STORAGE_KEY
): SavedPreset<P> | null {
  const presets = getPresets<P>(store);
  let updated: SavedPreset<P> | null = null;
  const next = presets.map((p) => {
    if (p.id !== id) return p;
    updated = {
      ...p,
      ...(change.name !== undefined && { name: change.name }),
      ...(change.params !== undefined && { params: change.params }),
    };
    return updated;
  });
  if (!updated) return null;
  try {
    localStorage.setItem(store, JSON.stringify(next));
  } catch (e) {
    throw new Error('Could not save preset: storage quota exceeded.', { cause: e });
  }
  return updated;
}

export function renamePreset(id: string, name: string, store: string = STORAGE_KEY): boolean {
  return updatePreset(id, { name }, store) !== null;
}
