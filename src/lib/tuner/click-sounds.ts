/**
 * What the metronome sounds like.
 *
 * It used to be a square wave - 1.6 kHz on the downbeat, 1 kHz on beats - held
 * for 40 ms: a buzzy electronic beep, hard on the ear over a practice session.
 * A good click is percussive and short, with its accent carried by pitch, the
 * way a real metronome's bell or a player's woodblock does it.
 *
 * So the clicks are recorded samples from the FluidR3 General MIDI soundfont
 * (MIT licence), which the app already serves from its own origin for playback
 * (/api/soundfont, see the proxy). The General MIDI drum map names them:
 * 33 metronome click (A1), 34 metronome bell (B♭1), 75 claves (E♭5),
 * 76 and 77 high and low woodblock (E5, F5). Measured: the click decays 30 dB in
 * 20 ms, the woodblocks in about 210 ms, the bell rings for 440 ms.
 *
 * Until the samples have loaded - or if they cannot - the metronome falls back
 * to a synthesized tick, a short sine rather than the old square.
 */

export type ClickSound = "woodblock" | "clickbell" | "claves" | "beep";
/** Downbeat, a group's first beat (7/8's 3 and 5), any other beat, a subdivision. */
export type ClickLevel = "downbeat" | "group" | "beat" | "sub";

export const CLICK_SOUNDS: { id: ClickSound; label: string }[] = [
  { id: "woodblock", label: "Woodblock" },
  { id: "clickbell", label: "Click & bell" },
  { id: "claves", label: "Claves" },
  { id: "beep", label: "Beep" },
];

export const isClickSound = (v: unknown): v is ClickSound =>
  CLICK_SOUNDS.some((s) => s.id === v);

/** Sample name -> the soundfont file that holds it. */
export const SAMPLES = {
  click: "A1",
  bell: "Bb1",
  claves: "Eb5",
  hiBlock: "E5",
  loBlock: "F5",
} as const;
export type SampleName = keyof typeof SAMPLES;

export interface Voice {
  sample: SampleName;
  /** 0..1 before the loudness boost. */
  gain: number;
  /** Playback rate: above 1 raises the pitch, which is how claves accent. */
  rate: number;
}

/** Which sample each click plays, and how loud; null means the synthesized tick. */
export function voiceFor(sound: ClickSound, level: ClickLevel): Voice | null {
  switch (sound) {
    case "woodblock":
      return {
        downbeat: { sample: "hiBlock", gain: 1, rate: 1 },
        group: { sample: "hiBlock", gain: 0.7, rate: 1 },
        beat: { sample: "loBlock", gain: 0.8, rate: 1 },
        sub: { sample: "loBlock", gain: 0.35, rate: 1.06 },
      }[level] as Voice;
    case "clickbell":
      return {
        // The click and bell are recorded quieter than the woodblocks (peaks
        // 0.11 and 0.13 against 0.21-0.24), so they are raised to match.
        downbeat: { sample: "bell", gain: 1.8, rate: 1 },
        group: { sample: "click", gain: 2, rate: 1.12 },
        beat: { sample: "click", gain: 1.7, rate: 1 },
        sub: { sample: "click", gain: 0.8, rate: 0.9 },
      }[level] as Voice;
    case "claves":
      return {
        downbeat: { sample: "claves", gain: 1, rate: 1.19 },
        group: { sample: "claves", gain: 0.85, rate: 1.1 },
        beat: { sample: "claves", gain: 0.75, rate: 1 },
        sub: { sample: "claves", gain: 0.35, rate: 1 },
      }[level] as Voice;
    default:
      return null;
  }
}

/** The synthesized tick's pitch at each level. */
export const TICK_HZ: Record<ClickLevel, number> = { downbeat: 1600, group: 1300, beat: 1000, sub: 700 };
export const TICK_GAIN: Record<ClickLevel, number> = { downbeat: 1, group: 0.85, beat: 0.7, sub: 0.35 };

/**
 * The samples peak around 0.2 (a piano note is 0.3-0.5); abcjs boosts its own
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
      (Object.keys(SAMPLES) as SampleName[]).map(async (name) => {
        try {
          const res = await fetch(`/api/soundfont/percussion-mp3/${SAMPLES[name]}.mp3`);
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
