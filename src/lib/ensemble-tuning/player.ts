import type { Take } from "./analyse";

/**
 * Plays a take back for the Ensemble tab: the whole group, or one part alone
 * (every note of it, pulled out of the mix by the separation, laid back in
 * place), or one note. Its own context; `time()` is where the playhead is.
 */
export class TakePlayback {
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private startedAt = 0;
  private offset = 0;
  private current = "all";
  playing = false;
  onEnd: (() => void) | null = null;

  constructor(private take: Take) {}

  private context() {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private bufferOf(key: string, samples: Float32Array) {
    let b = this.buffers.get(key);
    if (!b) {
      const ctx = this.context();
      b = ctx.createBuffer(1, Math.max(1, samples.length), this.take.sampleRate);
      b.copyToChannel(samples, 0);
      this.buffers.set(key, b);
    }
    return b;
  }

  /** Seconds into the take now. */
  time(): number {
    if (!this.playing || !this.ctx) return this.offset;
    return Math.min(this.duration, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  get duration() {
    return this.take.samples.length / this.take.sampleRate;
  }

  /**
   * Plays from `from` seconds: `key` "all" for the take, otherwise what
   * `mix()` makes (one part, built once and kept).
   */
  play(from = this.offset, key = this.current, mix?: () => Float32Array) {
    this.stopSource();
    const ctx = this.context();
    const samples = key === "all" ? this.take.samples : mix ? mix() : this.take.samples;
    const buffer = this.bufferOf(key, samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    this.offset = Math.max(0, Math.min(from, this.duration));
    this.current = key;
    this.startedAt = ctx.currentTime + 0.02;
    src.start(this.startedAt, this.offset);
    src.onended = () => {
      if (this.src !== src) return;
      this.playing = false;
      this.offset = 0;
      this.src = null;
      this.onEnd?.();
    };
    this.src = src;
    this.playing = true;
  }

  pause() {
    this.offset = this.time();
    this.stopSource();
    this.playing = false;
  }

  seek(t: number, mix?: () => Float32Array) {
    if (this.playing) this.play(t, this.current, mix);
    else this.offset = Math.max(0, Math.min(t, this.duration));
  }

  /** One sound on its own (a note alone), over whatever is playing. */
  playClip(signal: Float32Array) {
    const ctx = this.context();
    const b = ctx.createBuffer(1, Math.max(1, signal.length), this.take.sampleRate);
    b.copyToChannel(signal, 0);
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start();
  }

  private stopSource() {
    const s = this.src;
    this.src = null;
    try {
      s?.stop();
    } catch {}
    s?.disconnect();
  }

  dispose() {
    this.stopSource();
    this.playing = false;
    this.buffers.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** Notes alone, laid back in place over a take's length: one part's sound. */
export function mixNotes(length: number, sampleRate: number, solos: { from: number; signal: Float32Array }[]): Float32Array {
  const out = new Float32Array(length);
  for (const { from, signal } of solos) {
    const at = Math.round(from * sampleRate);
    for (let i = 0; i < signal.length && at + i < length; i++) if (at + i >= 0) out[at + i] += signal[i];
  }
  return out;
}
