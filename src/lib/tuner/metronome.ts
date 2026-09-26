import {
  SAMPLE_BOOST,
  SampleBank,
  TICK_GAIN,
  TICK_HZ,
  voiceFor,
  type ClickLevel,
  type ClickSound,
} from "./click-sounds";

export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: number;
  subdivision: number; // clicks per beat, 1 = none
  accent: boolean;
  /**
   * Beats that start a group after the first - the 4 of 12/8's second half,
   * 5/8's 3. They get a lighter accent than the downbeat. Optional, so a
   * plain beat count still works.
   */
  groupStarts?: number[];
  /** What it sounds like - see click-sounds.ts. Woodblock when unset. */
  sound?: ClickSound;
}

export const BPM_MIN = 30;
export const BPM_MAX = 300;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;

/**
 * Web Audio metronome using the standard lookahead scheduler: a coarse
 * setInterval queues precisely-timed clicks slightly ahead of time.
 */
export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeatTime = 0;
  private beat = 0;
  private settings: MetronomeSettings = { bpm: 90, beatsPerBar: 4, subdivision: 1, accent: true };
  private bank = new SampleBank();
  onBeat: ((beatInBar: number) => void) | null = null;

  get running() {
    return this.timer !== null;
  }

  configure(settings: MetronomeSettings) {
    this.settings = settings;
  }

  start() {
    if (this.timer) return;
    const ctx = (this.ctx ??= new AudioContext());
    void ctx.resume();
    void this.bank.load(ctx);
    this.beat = 0;
    this.nextBeatTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), LOOKAHEAD_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  dispose() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  /** One click right now, for callers driving their own timeline. */
  clickNow(accent = false) {
    const ctx = (this.ctx ??= new AudioContext());
    if (ctx.state !== "running") void ctx.resume();
    void this.bank.load(ctx);
    this.click(ctx.currentTime + 0.001, accent ? "downbeat" : "beat");
  }

  /** Let a singer hear a sound before choosing it: waits for its sample. */
  async preview(sound: ClickSound) {
    const ctx = (this.ctx ??= new AudioContext());
    if (ctx.state !== "running") await ctx.resume();
    await this.bank.load(ctx);
    const t = ctx.currentTime + 0.02;
    const beat = 0.32;
    this.click(t, "downbeat", sound);
    this.click(t + beat, "beat", sound);
    this.click(t + beat * 1.5, "sub", sound);
    this.click(t + beat * 2, "beat", sound);
  }

  private schedule() {
    const ctx = this.ctx!;
    const { bpm, beatsPerBar, subdivision, accent } = this.settings;
    const beatDur = 60 / bpm;
    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const beatInBar = this.beat % beatsPerBar;
      const isAccent = accent && beatInBar === 0;
      const isGroup = accent && !isAccent && (this.settings.groupStarts ?? []).includes(beatInBar);
      this.click(this.nextBeatTime, isAccent ? "downbeat" : isGroup ? "group" : "beat");
      for (let s = 1; s < subdivision; s++) {
        this.click(this.nextBeatTime + (s * beatDur) / subdivision, "sub");
      }
      const delay = Math.max(0, (this.nextBeatTime - ctx.currentTime) * 1000);
      setTimeout(() => this.onBeat?.(beatInBar), delay);
      this.nextBeatTime += beatDur;
      this.beat++;
    }
  }

  /** One click: its sample if loaded, else the synthesized tick. */
  private click(time: number, level: ClickLevel, sound = this.settings.sound ?? "woodblock") {
    const ctx = this.ctx!;
    const voice = voiceFor(sound, level);
    const buffer = voice ? this.bank.get(voice.sample) : undefined;
    if (voice && buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = voice.rate;
      const gain = ctx.createGain();
      gain.gain.value = voice.gain * SAMPLE_BOOST;
      src.connect(gain).connect(ctx.destination);
      src.start(time);
      // The files run 2.4 s; nothing here needs more than the bell's ring.
      src.stop(time + 0.6);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
      return;
    }
    this.tick(time, level);
  }

  /**
   * The synthesized click: a sine, 1 ms up and gone in 30, pitched by level.
   * The old one was a square held for 40 ms - its odd harmonics are what made
   * it buzz.
   */
  private tick(time: number, level: ClickLevel) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(TICK_HZ[level], time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(TICK_GAIN[level] * 0.6, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.04);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const metronome = new Metronome();
