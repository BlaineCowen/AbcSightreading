import { MAX_SECONDS, type Take } from "./analyse";

/**
 * Records a group from the microphone for the Ensemble tab: every sample, at
 * the device's own rate, through public/pcm-recorder.js. Its own stream with
 * echo cancellation, noise suppression and automatic gain all off (as
 * ClapListener and grade-recording): each would change the sound being
 * measured, the canceller most of all, turning the microphone down whenever
 * the speakers sound. Its own context too, so the tuner's microphone, on or
 * off, is left alone.
 */
export class TakeRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private length = 0;
  private flushed: (() => void) | null = null;
  /** The loudest sample of the last batch, 0..1, for a meter. */
  level = 0;

  /** Called when the take reaches MAX_SECONDS: the page stops it. */
  onFull: (() => void) | null = null;

  /** Must follow a tap (the browser's rule for sound). Throws if the microphone is refused. */
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const ctx = new AudioContext();
    this.ctx = ctx;
    await ctx.audioWorklet.addModule("/pcm-recorder.js");
    const source = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, "pcm-recorder");
    node.port.onmessage = (e) => {
      const { samples, peak, last } = e.data as { samples: Float32Array; peak: number; last?: boolean };
      if (samples.length) {
        this.chunks.push(samples);
        this.length += samples.length;
      }
      this.level = peak;
      if (last) this.flushed?.();
      else if (this.length >= MAX_SECONDS * ctx.sampleRate) this.onFull?.();
    };
    source.connect(node);
    // Safari runs a worklet only when its graph reaches the speakers: through a silent gain.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    this.node = node;
    if (ctx.state === "suspended") await ctx.resume();
  }

  /** Seconds recorded so far. */
  get seconds() {
    return this.ctx ? this.length / this.ctx.sampleRate : 0;
  }

  /** Ends the take and closes the microphone. */
  async stop(): Promise<Take | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.node) {
      await Promise.race([
        new Promise<void>((ok) => {
          this.flushed = ok;
          this.node!.port.postMessage("flush");
        }),
        new Promise<void>((ok) => setTimeout(ok, 300)),
      ]);
    }
    this.release();
    const samples = new Float32Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      samples.set(c, at);
      at += c.length;
    }
    this.chunks = [];
    this.length = 0;
    return { samples, sampleRate: ctx.sampleRate };
  }

  /** Drops everything (a take abandoned, the tab left). */
  release() {
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** A take as a 16-bit mono WAV file, for Save. */
export function wavBlob({ samples, sampleRate }: Take): Blob {
  const n = samples.length;
  const b = new DataView(new ArrayBuffer(44 + 2 * n));
  const s = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF");
  b.setUint32(4, 36 + 2 * n, true);
  s(8, "WAVEfmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, sampleRate, true);
  b.setUint32(28, 2 * sampleRate, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  s(36, "data");
  b.setUint32(40, 2 * n, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + 2 * i, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([b.buffer], { type: "audio/wav" });
}
