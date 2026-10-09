import { beatLevelsFrom, gridOf, subMaskFrom, type BeatLevel } from "./click-pattern";
import { toClickSound, type ClickSound } from "./click-sounds";
import { customMeter, meterById } from "./meters";
import { BPM_MAX, BPM_MIN } from "./metronome";
import { assistantFrom, type AssistantSettings } from "./practice-assistant";
import { voiceFrom, type VoiceSettings } from "./voice-count";

/**
 * The metronome's presets (notes/metronome-plan.md, phase 4): a few built in
 * (swing, backbeat, off-beats, 3+3+2), which set the feel and keep the tempo,
 * and the singer's own, which keep everything: meter (custom ones too),
 * tempo, beat levels, subdivision and its rhythm, sound, the counting voice
 * and the practice assistant. Kept in this browser with the tuner's settings.
 */
export interface MetronomePreset {
  id: string;
  name: string;
  meter: string;
  /** Absent: the tempo stays as it is (the built-in ones). */
  bpm?: number;
  subdivision: number;
  subMask: string | null;
  beatLevels: BeatLevel[] | null;
  clickSound?: ClickSound;
  voice?: VoiceSettings;
  assistant?: AssistantSettings;
}

export const MAX_PRESETS = 24;

export const QUICK_PRESETS: MetronomePreset[] = [
  { id: "q-swing", name: "Swing", meter: "4/4", subdivision: 3, subMask: "101", beatLevels: null },
  { id: "q-backbeat", name: "Backbeat (2 and 4)", meter: "4/4", subdivision: 1, subMask: null, beatLevels: ["soft", "accent", "soft", "accent"] },
  { id: "q-offbeat", name: "Off-beats", meter: "4/4", subdivision: 2, subMask: "01", beatLevels: null },
  { id: "q-332", name: "3+3+2", meter: "8/8:3+3+2", subdivision: 1, subMask: null, beatLevels: null },
];

/** A preset read back from storage, or null when it cannot be used. */
export function presetFrom(value: unknown): MetronomePreset | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string" || typeof o.meter !== "string") return null;
  const meter = customMeter(o.meter);
  if (!meter) return null;
  const subdivision = meter.subdivisions.includes(Number(o.subdivision)) ? Number(o.subdivision) : meter.defaultSubdivision;
  const bpm = Number(o.bpm);
  return {
    id: o.id,
    name: o.name.slice(0, 40),
    meter: meter.id,
    bpm: Number.isFinite(bpm) && bpm >= BPM_MIN && bpm <= BPM_MAX ? Math.round(bpm) : undefined,
    subdivision,
    subMask: subMaskFrom(o.subMask, gridOf(subdivision)),
    beatLevels: beatLevelsFrom(o.beatLevels, meter.beats),
    clickSound: toClickSound(o.clickSound) ?? undefined,
    voice: o.voice ? voiceFrom(o.voice) : undefined,
    assistant: o.assistant ? assistantFrom(o.assistant) : undefined,
  };
}

export const presetsFrom = (value: unknown): MetronomePreset[] =>
  Array.isArray(value) ? value.map(presetFrom).filter((p): p is MetronomePreset => !!p).slice(0, MAX_PRESETS) : [];

/** A short line saying what a preset is: "7/8 (3+2+2) · 120 · eighths". */
export function presetSummary(p: MetronomePreset): string {
  const m = meterById(p.meter);
  const name = m.id.split(":")[0] + (m.kind === "uneven" && m.grouping ? ` (${m.grouping})` : "");
  return [name, p.bpm ? `${p.bpm} bpm` : null].filter(Boolean).join(" · ");
}
