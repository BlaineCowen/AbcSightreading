import type { ClapBlock } from "./clap-detect";

/**
 * Listens for claps on the tuner's own microphone (no second stream): the
 * clap worklet's blocks, each moved from the audio clock onto the page's
 * (performance.now), the clock the exercise's timeline runs on. The mapping
 * comes from the context's output timestamp, read as each batch arrives, so
 * when a batch reaches the main thread does not matter; only the clock does.
 */
export class ClapListener {
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private blocks: ClapBlock[] = [];
  private stopped = false;

  constructor(private ctx: AudioContext, private source: AudioNode) {}

  /** Not awaited by the page: the count-in is long enough for the module to load. */
  async start() {
    await this.ctx.audioWorklet.addModule("/clap-detector.js");
    // Stopped while the module loaded (a run cancelled at once).
    if (this.stopped) return;
    const node = new AudioWorkletNode(this.ctx, "clap-detector");
    node.port.onmessage = (e) => {
      const { frames, hi, full, sampleRate } = e.data as { frames: Float64Array; hi: Float32Array; full: Float32Array; sampleRate: number };
      const toPage = this.clock();
      for (let i = 0; i < frames.length; i++) this.blocks.push({ t: toPage(frames[i] / sampleRate), hi: hi[i], full: full[i] });
    };
    this.source.connect(node);
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

  /** Stop listening; the blocks heard. */
  stop(): ClapBlock[] {
    this.stopped = true;
    // Only this listener's own connection: a bare disconnect() would cut the tuner off too.
    if (this.node) {
      try {
        this.source.disconnect(this.node);
      } catch {}
      this.node.disconnect();
    }
    this.sink?.disconnect();
    this.node = null;
    this.sink = null;
    const out = this.blocks;
    this.blocks = [];
    return out;
  }
}
