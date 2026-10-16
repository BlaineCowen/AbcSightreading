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
  /** Clicks a beat through the music: 1 the beat alone, 2 or 3 subdivided. */
  sub?: number;
};

export class SectionPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private key = "";
  /**
   * The audio clock when the buffer's `offsetMs` was played, performance.now()
   * then, and that offset (a start from the middle of the music).
   */
  startedAt: { audio: number; perf: number; offsetMs: number } | null = null;

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

  /** The sound last rendered (Hear your take plays it again under the take). */
  get audio(): AudioBuffer | null {
    return this.buffer;
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
  /** Passes left to ring out under a loop's next pass (stopped by stop()). */
  private ringing: AudioBufferSourceNode[] = [];

  /** A short tick: higher on a downbeat, softer between beats. */
  private tick(ctx: AudioContext, at: number, kind: "down" | "beat" | "sub") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = kind === "down" ? 1760 : kind === "beat" ? 1320 : 990;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(kind === "down" ? 0.5 : kind === "beat" ? 0.32 : 0.16, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.08);
    this.clicks.push(osc);
  }

  /**
   * Starts it a moment from now, after the count-in, `offsetMs` into the
   * music (0 from the top); returns when (performance.now() ms) the music's
   * first sample is heard. From the middle, the count-in and the click keep
   * the music's own beat: the count-in is the beats before the first beat at
   * or after the start.
   *
   * `at`: the audio-clock moment to begin (the count-in, or the music without
   * one), for a loop's next pass booked on the beat after the last bar ends;
   * the pass before is left to ring out under it (its last notes' release).
   * It used to wait for the buffer to end, release and all, and then start
   * "a moment from now": every repeat came in late and off the beat.
   */
  play(onEnded: () => void, clicks: Clicks, offsetMs = 0, at?: number): number {
    const ctx = this.context();
    if (!this.buffer) throw new Error("Not prepared.");
    if (ctx.state !== "running") void ctx.resume();
    const handover = at !== undefined && at > ctx.currentTime + 0.02;
    if (handover && this.source) {
      // Let the last pass ring; its clicks are all behind us.
      this.ringing.push(this.source);
      this.source = null;
      this.clicks = [];
    } else this.stop();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(ctx.destination);
    const begin = handover ? at! : ctx.currentTime + 0.12;
    const beat = clicks.beatMs / 1000;
    const kStart = Math.ceil((offsetMs - 1) / clicks.beatMs);
    // The music's time t (ms from its top) sounds at at + (t - offsetMs) / 1000.
    const start = clicks.countIn ? begin + (offsetMs - (kStart - clicks.countIn) * clicks.beatMs) / 1000 : begin;
    for (let k = 0; k < clicks.countIn; k++) this.tick(ctx, start + ((kStart - clicks.countIn + k) * clicks.beatMs - offsetMs) / 1000, k % clicks.beatsPerBar === 0 ? "down" : "beat");
    const first = clicks.firstBeat ?? 0;
    const sub = Math.max(1, clicks.sub ?? 1);
    for (let k = Math.max(0, kStart); k * clicks.beatMs < clicks.throughMs; k++) {
      const t = start + (k * clicks.beatMs - offsetMs) / 1000;
      this.tick(ctx, t, (k + first) % clicks.beatsPerBar === 0 ? "down" : "beat");
      for (let j = 1; j < sub; j++) this.tick(ctx, t + (j * beat) / sub, "sub");
    }
    src.start(start, offsetMs / 1000);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.startedAt = null;
        onEnded();
      }
    };
    this.source = src;
    const perf = performance.now() + (start - ctx.currentTime) * 1000;
    this.startedAt = { audio: start, perf, offsetMs };
    return perf + this.latencyMs();
  }

  /** Milliseconds into the music as heard now, or null when not playing (negative during the count-in). */
  elapsedMs(): number | null {
    if (!this.startedAt || !this.ctx) return null;
    return (this.ctx.currentTime - this.startedAt.audio) * 1000 - this.latencyMs() + this.startedAt.offsetMs;
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
    for (const r of this.ringing) {
      try {
        r.stop();
      } catch {
        // already done
      }
    }
    this.ringing = [];
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
