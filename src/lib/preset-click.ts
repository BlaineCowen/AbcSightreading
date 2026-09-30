import { tuner } from "./tuner/store";
import { isClickSound, type ClickSound } from "./tuner/click-sounds";

/**
 * The click under an exercise, as a preset keeps it. It is the Tools
 * metronome's subdivision, accent and sound (playback-click.ts), so a preset
 * that holds "subdivide in eighths" puts that on the metronome when it loads.
 */
export type PresetClick = {
  subdivision: number;
  accent: boolean;
  sound: ClickSound;
  /** Click with the music, and the level. Optional: older presets lack them. */
  withMusic?: boolean;
  volume?: number;
};

/** What the Tools metronome is set to now. */
export function currentClick(): PresetClick {
  const s = tuner.get();
  return {
    subdivision: s.subdivision,
    accent: s.accent,
    sound: s.clickSound,
    withMusic: s.clickWithMusic,
    volume: s.metronomeVolume,
  };
}

/** A saved click, or null when it is missing or malformed (older presets). */
export function clickFrom(v: unknown): PresetClick | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const subdivision = Number(o.subdivision);
  if (!Number.isInteger(subdivision) || subdivision < 1 || subdivision > 6) return null;
  if (typeof o.accent !== "boolean" || !isClickSound(o.sound)) return null;
  const out: PresetClick = { subdivision, accent: o.accent, sound: o.sound };
  if (typeof o.withMusic === "boolean") out.withMusic = o.withMusic;
  if (typeof o.volume === "number" && o.volume >= 0 && o.volume <= 1) out.volume = o.volume;
  return out;
}

/** Put a preset's click on the Tools metronome. */
export function applyClick(c: PresetClick) {
  const s = tuner.get();
  tuner.setSubdivision(c.subdivision);
  tuner.setClickSound(c.sound);
  if (s.accent !== c.accent) tuner.toggleAccent();
  if (c.withMusic !== undefined) tuner.setClickWithMusic(c.withMusic);
  if (c.volume !== undefined) tuner.setMetronomeVolume(c.volume);
}

/** A number in [lo, hi], or the fallback. For levels and the like in old presets. */
export function numberIn(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
}
