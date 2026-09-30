/**
 * What the metronome sounds like.
 *
 * Five sounds, chosen by ear from Ludwig Peter Müller's metronome recordings
 * (December 2020, CC0 1.0, public domain - public/clicks/CREDITS.txt). Each is
 * three short files in public/clicks: the accent on beat 1 (the recording's
 * "hi"), the beat (its "lo"), and the subdivision, the beat raised in pitch -
 * quartz by 5 semitones, the rest by an octave - and played quieter. Only beat
 * 1 is accented: a different pitch on each group's first beat as well read as
 * a tune (A F E F) rather than a pulse.
 *
 * They replaced four General MIDI drums (woodblock, click and bell, claves, a
 * synthesized beep); settings and presets naming those are mapped across
 * (toClickSound). The synthesized tick is still the stand-in while the files
 * load, or if they cannot.
 */

export type ClickSound = "quartz" | "block" | "tick" | "sine" | "square";
/** Downbeat, a group's first beat (played as a beat), any other beat, a subdivision. */
export type ClickLevel = "downbeat" | "group" | "beat" | "sub";

export const CLICK_SOUNDS: { id: ClickSound; label: string }[] = [
  { id: "quartz", label: "Quartz" },
  { id: "block", label: "Block" },
  { id: "tick", label: "Tick" },
  { id: "sine", label: "Sine" },
  { id: "square", label: "Square" },
];

export const DEFAULT_CLICK_SOUND: ClickSound = "quartz";

export const isClickSound = (v: unknown): v is ClickSound =>
  CLICK_SOUNDS.some((s) => s.id === v);

/** The sounds that came before, and the new one nearest each. */
const LEGACY: Record<string, ClickSound> = { woodblock: "block", clickbell: "quartz", claves: "tick", beep: "sine" };

/** A saved sound, old names included; null when it is not one. */
export function toClickSound(v: unknown): ClickSound | null {
  if (isClickSound(v)) return v;
  return typeof v === "string" && v in LEGACY ? LEGACY[v] : null;
}

export type ClickPart = "accent" | "beat" | "sub";
export type SampleName = `${ClickSound}-${ClickPart}`;
const PARTS: ClickPart[] = ["accent", "beat", "sub"];

/** Every sample, in a fixed order: the order gives each its drum note. */
export const SAMPLE_NAMES: SampleName[] = CLICK_SOUNDS.flatMap((c) => PARTS.map((p) => `${c.id}-${p}` as SampleName));
export const sampleUrl = (name: SampleName) => `/clicks/${name}.wav`;

/**
 * The drum note each sample plays as in abcjs's drum track (the Choral click).
 * abcjs caches samples by instrument and note, so every sample needs a note of
 * its own; the soundfont proxy serves these notes from public/clicks. MIDI 60
 * (C4) up - no General MIDI drum the app plays is up there.
 */
export const DRUM_NOTE_BASE = 60;
export const drumNoteFor = (name: SampleName) => DRUM_NOTE_BASE + SAMPLE_NAMES.indexOf(name);
export const sampleForDrumNote = (midi: number): SampleName | null => SAMPLE_NAMES[midi - DRUM_NOTE_BASE] ?? null;

/** Each sound's subdivision level, as it was chosen. */
const SUB_LEVEL: Record<ClickSound, number> = { quartz: 0.35, block: 0.4, tick: 0.4, sine: 0.35, square: 0.35 };

export interface Voice {
  sample: SampleName;
  /** 0..1 before the loudness boost. */
  gain: number;
  /** Playback rate; the subdivision's pitch is in its file, so 1. */
  rate: number;
}

/** Which sample each click plays, and how loud. */
export function voiceFor(sound: ClickSound, level: ClickLevel): Voice | null {
  const id = isClickSound(sound) ? sound : DEFAULT_CLICK_SOUND;
  if (level === "downbeat") return { sample: `${id}-accent`, gain: 1, rate: 1 };
  if (level === "sub") return { sample: `${id}-sub`, gain: SUB_LEVEL[id], rate: 1 };
  return { sample: `${id}-beat`, gain: 0.8, rate: 1 };
}

/** The synthesized tick's pitch at each level. */
export const TICK_HZ: Record<ClickLevel, number> = { downbeat: 1600, group: 1300, beat: 1000, sub: 700 };
export const TICK_GAIN: Record<ClickLevel, number> = { downbeat: 1, group: 0.85, beat: 0.7, sub: 0.35 };

/**
 * The samples peak around 0.19 (a piano note is 0.3-0.5); abcjs boosts its own
 * by 3x for the same reason.
 */
export const SAMPLE_BOOST = 3;

/** The decoded samples, loaded once per AudioContext. */
export class SampleBank {
  private buffers = new Map<SampleName, AudioBuffer>();
  private loading: Promise<void> | null = null;

  load(ctx: BaseAudioContext): Promise<void> {
    if (typeof fetch === "undefined" || typeof ctx.decodeAudioData !== "function") return Promise.resolve();
    this.loading ??= Promise.all(
      SAMPLE_NAMES.map(async (name) => {
        try {
          const res = await fetch(sampleUrl(name));
          if (!res.ok) return;
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // Offline or blocked: the tick stands in for this one.
        }
      })
    ).then(() => {});
    return this.loading;
  }

  get(name: SampleName): AudioBuffer | undefined {
    return this.buffers.get(name);
  }
}
