const STORAGE_KEY = 'abcsr_presets';

export interface PresetParams {
  key: string;
  timeSig: string;
  voicing: string;
  measures: number;
  maxSkip: number;
  bpm: number;
  selectedRhythmNames: string[];
  allowedChordNames: string[] | undefined;
  nctProbability: number;
  voiceRanges: Record<string, [number, number]>;
}

export interface SavedPreset {
  id: string;
  name: string;
  createdAt: number;
  params: PresetParams;
}

export function getPresets(): SavedPreset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function savePreset(name: string, params: PresetParams): SavedPreset {
  const presets = getPresets();
  const preset: SavedPreset = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    createdAt: Date.now(),
    params,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...presets, preset]));
  } catch (e) {
    throw new Error('Could not save preset: storage quota exceeded.', { cause: e });
  }
  return preset;
}

export function deletePreset(id: string): boolean {
  const presets = getPresets();
  const next = presets.filter((p) => p.id !== id);
  if (next.length === presets.length) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    throw new Error('Could not delete preset: storage quota exceeded.', { cause: e });
  }
  return true;
}

export function renamePreset(id: string, name: string): boolean {
  const presets = getPresets();
  let found = false;
  const next = presets.map((p) => {
    if (p.id === id) {
      found = true;
      return { ...p, name };
    }
    return p;
  });
  if (!found) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    throw new Error('Could not rename preset: storage quota exceeded.', { cause: e });
  }
  return true;
}
