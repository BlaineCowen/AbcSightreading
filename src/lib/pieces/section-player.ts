import abcjs from "abcjs";

/**
 * Plays a run of bars of a piece while the page shows the whole piece: the
 * bars' ABC rendered to sound once (render-abc.ts's way: abcjs's synth reads
 * a drawn tune, so it is drawn off screen), then started at a known moment on
 * the audio clock. Knowing that moment exactly is what lets the page move its
 * own cursor, and Grade place the first downbeat, without abcjs's timer.
 *
 * The count-in and the click are scheduled here, on the same clock, not as
 * abcjs's drum track: its `%%MIDI drumoff` silences the count-in too, so a
 * count-in without a click through the music was not possible there.
 */
export type SectionSound = {
  abc: string;
  /** One level per ABC voice, in order (0 silent, 1 as written). */
  levels: number[];
};

export type Clicks = {
  beatMs: number;
  beatsPerBar: number;
  /** Beats of count-in before the music. */
  countIn: number;
  /** Click on through the music too, for this long (ms); 0 for the count-in alone. */
  throughMs: number;
  /** The beat of its bar the music starts on (a pickup starts late in its bar). */
  firstBeat?: number;
};

export class SectionPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private key = "";
  /** The audio clock when the buffer started, and performance.now() then. */
  startedAt: { audio: number; perf: number } | null = null;

  context(): AudioContext {
    this.ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return this.ctx;
  }

  /** The output's own delay (ms): a singer sings with what they hear. */
  latencyMs(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return Math.round(((c?.baseLatency ?? 0) + (c?.outputLatency ?? 0)) * 1000);
  }

  get ready() {
    return !!this.buffer;
  }

  /** Renders the sound, unless it is the one already rendered. */
  async prepare(sound: SectionSound): Promise<void> {
    const key = JSON.stringify(sound);
    if (key === this.key && this.buffer) return;
    const ctx = this.context();
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-20000px;top:0;width:800px;visibility:hidden";
    document.body.appendChild(host);
    try {
      const tune = abcjs.renderAbc(host, sound.abc)[0];
      const synth = new abcjs.synth.CreateSynth();
      await synth.init({
        audioContext: ctx,
        visualObj: tune,
        options: {
          soundFontUrl: "/api/soundfont/",
          soundFontVolumeMultiplier: 3,
          // One track a voice, in order.
          sequenceCallback: (tracks: { volume: number }[][]) => {
            tracks.forEach((track, t) => {
              if (t >= sound.levels.length) return;
              for (const n of track) n.volume = Math.max(0, Math.min(127, Math.round(n.volume * sound.levels[t])));
            });
            return tracks;
          },
        },
      } as never);
      await synth.prime();
      this.buffer = synth.getAudioBuffer() ?? null;
      this.key = key;
    } finally {
      host.remove();
    }
  }

  private clicks: OscillatorNode[] = [];

  /** A short tick: higher on a downbeat. */
  private tick(ctx: AudioContext, at: number, down: boolean) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = down ? 1760 : 1320;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(down ? 0.5 : 0.32, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.08);
    this.clicks.push(osc);
  }

  /**
   * Starts it a moment from now, after the count-in; returns when
   * (performance.now() ms) the music's first sample is heard.
   */
  play(onEnded: () => void, clicks: Clicks): number {
    const ctx = this.context();
    if (!this.buffer) throw new Error("Not prepared.");
    if (ctx.state !== "running") void ctx.resume();
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(ctx.destination);
    const begin = ctx.currentTime + 0.12;
    const beat = clicks.beatMs / 1000;
    const at = begin + clicks.countIn * beat;
    for (let k = 0; k < clicks.countIn; k++) this.tick(ctx, begin + k * beat, k % clicks.beatsPerBar === 0);
    const first = clicks.firstBeat ?? 0;
    for (let k = 0; k * clicks.beatMs < clicks.throughMs; k++) this.tick(ctx, at + k * beat, (k + first) % clicks.beatsPerBar === 0);
    src.start(at);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.startedAt = null;
        onEnded();
      }
    };
    this.source = src;
    const perf = performance.now() + (at - ctx.currentTime) * 1000;
    this.startedAt = { audio: at, perf };
    return perf + this.latencyMs();
  }

  /** Milliseconds since the first sample was heard, or null when not playing. */
  elapsedMs(): number | null {
    if (!this.startedAt || !this.ctx) return null;
    return (this.ctx.currentTime - this.startedAt.audio) * 1000 - this.latencyMs();
  }

  stop() {
    for (const c of this.clicks) {
      try {
        c.stop();
      } catch {
        // already done
      }
    }
    this.clicks = [];
    const src = this.source;
    this.source = null;
    this.startedAt = null;
    try {
      src?.stop();
    } catch {
      // never started
    }
  }

  destroy() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
