import type { ClapAudio, ClapBlock } from "./clap-detect";

/**
 * Listens for claps on the microphone: the clap worklet's blocks, each moved from the audio clock onto the page's
 * (performance.now), the clock the exercise's timeline runs on. The mapping
 * comes from the context's output timestamp, read as each batch arrives, so
 * when a batch reaches the main thread does not matter; only the clock does.
 *
 * It opens a stream of its own with no echo cancellation (as grade-recording
 * does), on the tuner's context, and falls back to the tuner's stream only if
 * that is refused. The canceller turns the microphone down while the speakers
 * sound, and a clap on the beat lands on the click: on a Windows laptop
 * (12 October 2026) it swallowed 6 of the 16 claps on the beat, every
 * off-beat clap heard, and a clean run graded 71. The same run's recording,
 * without the canceller, has all 23 and grades 96. The click heard back is
 * left to withoutClickEcho, which learns its level from the count-in.
 */
export class ClapListener {
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private blocks: ClapBlock[] = [];
  /** The sound at about 16 kHz, in pieces, each with its first sample's page time. */
  private pcm: { t: number; samples: Float32Array }[] = [];
  private pcmRate = 16000;
  private stopped = false;
  private raw: MediaStream | null = null;
  private input: AudioNode | null = null;

  constructor(private ctx: AudioContext, private source: AudioNode) {}

  /** Not awaited by the page: the count-in is long enough for the module to load. */
  async start() {
    await this.ctx.audioWorklet.addModule("/clap-detector.js");
    let input = this.source;
    try {
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (this.stopped) return raw.getTracks().forEach((t) => t.stop());
      this.raw = raw;
      input = this.ctx.createMediaStreamSource(raw);
    } catch {}
    // Stopped while the module loaded (a run cancelled at once).
    if (this.stopped) return;
    const node = new AudioWorkletNode(this.ctx, "clap-detector");
    node.port.onmessage = (e) => {
      const { frames, hi, full, sampleRate, pcm, pcmFrame0, pcmRate } = e.data as {
        frames: Float64Array; hi: Float32Array; full: Float32Array; sampleRate: number; pcm?: Float32Array; pcmFrame0?: number; pcmRate?: number;
      };
      const toPage = this.clock();
      for (let i = 0; i < frames.length; i++) this.blocks.push({ t: toPage(frames[i] / sampleRate), hi: hi[i], full: full[i] });
      if (pcm && pcm.length && pcmFrame0 !== undefined && pcmFrame0 >= 0) {
        this.pcm.push({ t: toPage(pcmFrame0 / sampleRate), samples: pcm });
        this.pcmRate = pcmRate ?? this.pcmRate;
      }
    };
    input.connect(node);
    this.input = input;
    // Safari only runs a worklet whose graph reaches the destination (as the tuner's).
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
    this.node = node;
  }

  /** Audio-clock seconds to performance.now ms. */
  private clock(): (sec: number) => number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts?.contextTime !== undefined && ts.performanceTime) {
      const { contextTime, performanceTime } = ts;
      return (sec) => performanceTime + (sec - contextTime) * 1000;
    }
    const now = performance.now();
    const at = this.ctx.currentTime;
    return (sec) => now + (sec - at) * 1000;
  }

  /** The sound heard, as one run of samples from its first one's page time (for telling chant from claps). */
  audio(): ClapAudio | null {
    if (!this.pcm.length) return null;
    const n = this.pcm.reduce((a, p) => a + p.samples.length, 0);
    const samples = new Float32Array(n);
    let at = 0;
    for (const p of this.pcm) {
      samples.set(p.samples, at);
      at += p.samples.length;
    }
    return { t0: this.pcm[0].t, rate: this.pcmRate, samples };
  }

  /** Stop listening; the blocks heard (the sound stays for audio()). */
  stop(): ClapBlock[] {
    this.stopped = true;
    // Only this listener's own connection: a bare disconnect() would cut the tuner off too.
    if (this.node) {
      try {
        this.input?.disconnect(this.node);
      } catch {}
      this.node.disconnect();
    }
    this.sink?.disconnect();
    this.raw?.getTracks().forEach((t) => t.stop());
    this.raw = null;
    this.node = null;
    this.sink = null;
    const out = this.blocks;
    this.blocks = [];
    return out;
  }
}
