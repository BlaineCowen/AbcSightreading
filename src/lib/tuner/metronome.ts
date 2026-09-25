export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: number;
  subdivision: number; // clicks per beat, 1 = none
  accent: boolean;
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
    this.click(ctx.currentTime + 0.001, accent ? 1600 : 1000, accent ? 1 : 0.7);
  }

  private schedule() {
    const ctx = this.ctx!;
    const { bpm, beatsPerBar, subdivision, accent } = this.settings;
    const beatDur = 60 / bpm;
    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const beatInBar = this.beat % beatsPerBar;
      const isAccent = accent && beatInBar === 0;
      this.click(this.nextBeatTime, isAccent ? 1600 : 1000, isAccent ? 1 : 0.7);
      for (let s = 1; s < subdivision; s++) {
        this.click(this.nextBeatTime + (s * beatDur) / subdivision, 700, 0.35);
      }
      const delay = Math.max(0, (this.nextBeatTime - ctx.currentTime) * 1000);
      setTimeout(() => this.onBeat?.(beatInBar), delay);
      this.nextBeatTime += beatDur;
      this.beat++;
    }
  }

  private click(time: number, freq: number, volume: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume * 0.5, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const metronome = new Metronome();
