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
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...presets, preset]));
  return preset;
}

export function deletePreset(id: string): void {
  const presets = getPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function renamePreset(id: string, name: string): void {
  const presets = getPresets().map((p) => (p.id === id ? { ...p, name } : p));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
