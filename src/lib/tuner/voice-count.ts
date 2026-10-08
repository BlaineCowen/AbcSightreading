/**
 * The metronome's counting voice (notes/metronome-plan.md, phase 5): a robot
 * voice saying the count with the click, or instead of it, in Counting (1 e & a)
 * or Kodály (ta, ti-ti). The words are files built by scripts/voice/build.ts
 * into public/voice/robot/, each started early by its measured lead-in so its
 * vowel lands on the beat.
 *
 * The words follow the page's syllables (rhythm-syllables.ts): Counting's
 * 1 e & a and compound 1 la li / 1 ta la ta li ta, Kodály's ta, ti ki ti ki and
 * ti ri ti ri ti ri; triplets, which neither table names, are "1 trip let" and
 * "tri o la".
 */

/** Every word, by key, and how espeak is asked to say it. */
export const VOICE_WORDS: Record<string, string> = {
  "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
  "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve",
  e: "ee", and: "and", a: "uh",
  trip: "trip", let: "let",
  la: "lah", li: "lee", ta: "tah",
  ti: "tee", ki: "kee", ri: "ree",
  tri: "tree", o: "oh",
};

export type VoiceSystem = "counting" | "kodaly";
export type VoiceMode = "off" | "voice" | "both";

export interface VoiceSettings {
  /** Off, the voice alone, or the voice with the click. */
  mode: VoiceMode;
  system: VoiceSystem;
  /** 0-1, against the click's level. */
  volume: number;
}

export const DEFAULT_VOICE: VoiceSettings = { mode: "off", system: "counting", volume: 0.8 };

export function voiceFrom(value: unknown): VoiceSettings {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const mode = o.mode === "voice" || o.mode === "both" || o.mode === "off" ? o.mode : DEFAULT_VOICE.mode;
  const system = o.system === "kodaly" || o.system === "counting" ? o.system : DEFAULT_VOICE.system;
  const v = Number(o.volume);
  return { mode, system, volume: Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_VOICE.volume };
}

/** A subdivision is said only when its slot is at least this long; faster, only the beats are counted. */
export const MIN_SPOKEN_SLOT_S = 0.15;

/**
 * The word for each slot of a beat (`grid` slots), beat `beat` (from 0) of
 * the bar. `compound` beats are dotted quarters. Slots with nothing to say
 * (too many to speak, as 32nds) are null.
 */
export function countWords(system: VoiceSystem, grid: number, beat: number, compound: boolean): (string | null)[] {
  const n = String(beat + 1);
  const k = system === "kodaly";
  if (grid <= 1) return [k ? "ta" : n];
  if (compound && grid === 3) return k ? ["ti", "ti", "ti"] : [n, "la", "li"];
  if (compound && grid === 6) return k ? ["ti", "ri", "ti", "ri", "ti", "ri"] : [n, "ta", "la", "ta", "li", "ta"];
  if (grid === 2) return k ? ["ti", "ti"] : [n, "and"];
  if (grid === 3) return k ? ["tri", "o", "la"] : [n, "trip", "let"];
  if (grid === 4) return k ? ["ti", "ki", "ti", "ki"] : [n, "e", "and", "a"];
  // 32nds and the like: the beat only.
  return [k ? "ta" : n, ...Array.from({ length: grid - 1 }, () => null)];
}

/**
 * The word to say at `slot` of a beat: its word, or (a subdivision too short
 * to say) none - but the beat's own word is always said, as Kodály's "ta" when
 * only the beats are counted.
 */
export function wordAt(system: VoiceSystem, grid: number, slot: number, beat: number, compound: boolean, slotSeconds: number): string | null {
  if (slot > 0 && slotSeconds < MIN_SPOKEN_SLOT_S) return null;
  if (slot === 0 && slotSeconds < MIN_SPOKEN_SLOT_S) return countWords(system, 1, beat, compound)[0];
  return countWords(system, grid, beat, compound)[slot] ?? null;
}

interface Word {
  buffer: AudioBuffer;
  leadIn: number;
}

/** The voice's words, loaded once per audio context. */
export class VoiceBank {
  private words = new Map<string, Word>();
  private loading: Promise<void> | null = null;
  private ctx: BaseAudioContext | null = null;
  /** The word sounding, cut when the next one comes in: a word runs half a second, longer than a fast eighth. */
  private last: { src: AudioBufferSourceNode; gain: GainNode; start: number } | null = null;

  load(ctx: BaseAudioContext, base = "/voice/robot/"): Promise<void> {
    if (this.ctx === ctx && this.loading) return this.loading;
    this.ctx = ctx;
    this.words.clear();
    this.loading = (async () => {
      const res = await fetch(`${base}manifest.json`);
      const manifest = (await res.json()) as Record<string, { file: string; leadIn: number }>;
      await Promise.all(
        Object.entries(manifest).map(async ([key, w]) => {
          const data = await (await fetch(base + w.file)).arrayBuffer();
          this.words.set(key, { buffer: await ctx.decodeAudioData(data), leadIn: w.leadIn });
        })
      );
    })().catch((e) => {
      this.loading = null;
      throw e;
    });
    return this.loading;
  }

  /** Say `word` so its vowel lands at `time`; silently skipped until the words have loaded. */
  say(ctx: BaseAudioContext, destination: AudioNode, word: string, time: number, gain: number) {
    const w = this.words.get(word);
    if (!w || gain <= 0) return;
    const start = Math.max(ctx.currentTime, time - w.leadIn);
    // The word before fades out 15 ms as this one comes in, so the count never talks over itself.
    if (this.last && this.last.start < start) {
      const { src: prev, gain: prevGain } = this.last;
      try {
        prevGain.gain.setValueAtTime(prevGain.gain.value, start);
        prevGain.gain.linearRampToValueAtTime(0, start + 0.015);
        prev.stop(start + 0.02);
      } catch {}
    }
    const src = ctx.createBufferSource();
    src.buffer = w.buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(destination);
    src.start(start);
    this.last = { src, gain: g, start };
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }
}
