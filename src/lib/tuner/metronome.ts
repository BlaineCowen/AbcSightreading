import {
  SAMPLE_BOOST,
  SampleBank,
  TICK_GAIN,
  TICK_HZ,
  voiceFor,
  DEFAULT_CLICK_SOUND,
  type ClickLevel,
  type ClickSound,
} from "./click-sounds";
import { beatEvents, beatLevelsFor, gridOf, type BeatLevel } from "./click-pattern";
import { VoiceBank, wordAt, type VoiceSettings } from "./voice-count";
import { assistedLevels, barIsSilent, rampBpm, timeIsUp, type AssistantSettings } from "./practice-assistant";

export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: number;
  subdivision: number; // clicks per beat, 1 = none
  accent: boolean;
  /** Each beat's level, and which slots of a beat sound (click-pattern.ts). */
  beatLevels?: BeatLevel[] | null;
  subMask?: string | null;
  /** Ramp, silent bars, dropped beats, time limit, count-in (practice-assistant.ts). */
  assistant?: AssistantSettings;
  /** The counting voice (voice-count.ts), and whether the beat is a dotted quarter. */
  voice?: VoiceSettings;
  compound?: boolean;
  /**
   * Beats that start a group after the first - the 4 of 12/8's second half,
   * 5/8's 3. They get a lighter accent than the downbeat. Optional, so a
   * plain beat count still works.
   */
  groupStarts?: number[];
  /** What it sounds like - see click-sounds.ts. Woodblock when unset. */
  sound?: ClickSound;
  /** Level; 1 is the level it always had. Full when unset. */
  volume?: number;
}

export const BPM_MIN = 30;
/** The voice's level against the click's, at the voice slider's top. */
export const VOICE_GAIN = 1.6;
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
  private voices = new VoiceBank();
  /** Every click goes through this, so the level can change while it ticks. */
  private out: GainNode | null = null;
  onBeat: ((beatInBar: number) => void) | null = null;
  /** Each bar as it starts: its number (negative in the count-in), the tempo, whether it is silent, seconds since Start. */
  onBar: ((live: { bar: number; bpm: number; silent: boolean; seconds: number }) => void) | null = null;
  /** The time limit ran out; the metronome has stopped. */
  onTimeUp: (() => void) | null = null;
  private startedAt = 0;
  /** Started, with the first beat not yet timed. */
  private fresh = false;
  /** Which beats drop, for this run. */
  private seed = 0;

  get running() {
    return this.timer !== null;
  }

  configure(settings: MetronomeSettings) {
    this.settings = settings;
    if (this.ctx && settings.voice && settings.voice.mode !== "off") void this.voices.load(this.ctx).catch(() => {});
    if (this.out) this.out.gain.value = settings.volume ?? 1;
  }

  /** The context, made on first use, with the level node on it. */
  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.settings.volume ?? 1;
      this.out.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  start() {
    if (this.timer) return;
    const ctx = this.context();
    void ctx.resume();
    void this.bank.load(ctx);
    if (this.settings.voice && this.settings.voice.mode !== "off") void this.voices.load(ctx).catch(() => {});
    this.beat = 0;
    this.seed = Math.floor(Math.random() * 2 ** 31);
    // Timed from the first schedule, not now: a context that was asleep takes
    // most of a second to resume, and a first beat timed before that played
    // late, squashed against the second.
    this.fresh = true;
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
    this.out = null;
  }

  /** One click right now, for callers driving their own timeline. */
  clickNow(accent = false) {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume();
    void this.bank.load(ctx);
    this.click(ctx.currentTime + 0.001, accent ? "downbeat" : "beat");
  }

  /** Let a singer hear a sound before choosing it: waits for its sample. */
  async preview(sound: ClickSound) {
    const ctx = this.context();
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
    if (ctx.state !== "running") return;
    // How far ahead this tick schedules: further on the first, so beat 1 is
    // handed to the audio clock now. Starting, the page is busy for most of a
    // second loading the samples, and the next tick came that much later.
    let ahead = SCHEDULE_AHEAD_S;
    if (this.fresh) {
      this.fresh = false;
      // Room for the counting voice's longest lead-in (about 0.15 s) before beat 1.
      this.nextBeatTime = ctx.currentTime + 0.2;
      this.startedAt = this.nextBeatTime;
      ahead = 0.25;
    }
    const { bpm, beatsPerBar, subdivision, accent, beatLevels, subMask, assistant } = this.settings;
    // Beat 1 accented unless the levels say otherwise. Accenting each group's
    // first beat too (4/4's 3, 12/8's 4) put a third pitch in the bar - A F E
    // F - which drew the ear more than it helped; a teacher can now set it.
    const base = beatLevelsFor({ beats: beatsPerBar, accent, beatLevels });
    const countIn = assistant?.countIn.on ? assistant.countIn.bars : 0;
    while (this.nextBeatTime < ctx.currentTime + ahead) {
      const beatInBar = this.beat % beatsPerBar;
      // Bars count from the first after the count-in, which clicks plainly at the set tempo.
      const bar = Math.floor(this.beat / beatsPerBar) - countIn;
      if (beatInBar === 0 && assistant && timeIsUp(this.nextBeatTime - this.startedAt, assistant.limit)) {
        const at = Math.max(0, (this.nextBeatTime - ctx.currentTime) * 1000);
        this.stop();
        setTimeout(() => this.onTimeUp?.(), at);
        return;
      }
      const bpmNow = assistant ? rampBpm(bpm, bar, assistant.ramp) : bpm;
      const beatDur = 60 / bpmNow;
      const levels = assistant && bar >= 0 ? assistedLevels(base, bar, assistant, this.seed) : base;
      if (beatInBar === 0) {
        const live = { bar, bpm: bpmNow, silent: !!assistant && barIsSilent(bar, assistant.silent), seconds: this.nextBeatTime - this.startedAt };
        setTimeout(() => this.onBar?.(live), Math.max(0, (this.nextBeatTime - ctx.currentTime) * 1000));
      }
      const voice = this.settings.voice;
      const slotSeconds = beatDur / gridOf(subdivision);
      for (const e of beatEvents(levels[beatInBar], subdivision, subMask)) {
        const at = this.nextBeatTime + e.at * beatDur;
        if (voice?.mode !== "voice") this.click(at, e.level, undefined, e.gain);
        if (voice && voice.mode !== "off") {
          const word = wordAt(voice.system, gridOf(subdivision), e.slot, beatInBar, !!this.settings.compound, slotSeconds);
          if (word) this.voices.say(ctx, this.out!, word, at, e.gain * voice.volume * VOICE_GAIN);
        }
      }
      const delay = Math.max(0, (this.nextBeatTime - ctx.currentTime) * 1000);
      setTimeout(() => this.onBeat?.(beatInBar), delay);
      this.nextBeatTime += beatDur;
      this.beat++;
    }
  }

  /** One click: its sample if loaded, else the synthesized tick. */
  private click(time: number, level: ClickLevel, sound = this.settings.sound ?? DEFAULT_CLICK_SOUND, scale = 1) {
    const ctx = this.ctx!;
    const voice = voiceFor(sound, level);
    const buffer = voice ? this.bank.get(voice.sample) : undefined;
    if (voice && buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = voice.rate;
      const gain = ctx.createGain();
      gain.gain.value = voice.gain * SAMPLE_BOOST * scale;
      src.connect(gain).connect(this.out!);
      src.start(time);
      // The files run 2.4 s; nothing here needs more than the bell's ring.
      src.stop(time + 0.6);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
      return;
    }
    this.tick(time, level, scale);
  }

  /**
   * The synthesized click: a sine, 1 ms up and gone in 30, pitched by level.
   * The old one was a square held for 40 ms - its odd harmonics are what made
   * it buzz.
   */
  private tick(time: number, level: ClickLevel, scale = 1) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(TICK_HZ[level], time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(TICK_GAIN[level] * 0.6 * scale, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(gain).connect(this.out!);
    osc.start(time);
    osc.stop(time + 0.04);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const metronome = new Metronome();
