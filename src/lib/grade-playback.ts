import { renderAbcBuffer } from "./render-abc";
import { scheduleClick } from "./playback-click";
import { SampleBank, type ClickSound } from "./tuner/click-sounds";

/**
 * Hear your take: a graded run's recording played back (grade-recording.ts
 * records it, stamped on the page's clock), with the written music quietly
 * under it when asked, and the score following along (the page drives the
 * cursor, the note's feedback and grade-feedback's reveal from `onFrame`).
 *
 * Everything plays on one AudioContext, the take and the music as buffers
 * started together, so they cannot drift apart the way an <audio> element
 * and a synth would; the page time shown is the audio clock's, less the
 * output's own delay, so the cursor moves with what is heard.
 */

/**
 * How much earlier than its first sound the recording's start is stamped
 * (MediaRecorder's onstart runs late): a note sung at page time t is
 * (t - startedAt + TAKE_ALIGN_MS) ms into the take. Measured end to end with
 * the fake microphone (scripts/check-grade.ts PLAYBACK=1): every sung note
 * landed 71-78 ms later in the take, 74 the median.
 */
export const TAKE_ALIGN_MS = 74;

/** Seconds into the take for page time `t` (performance.now ms). */
export function takeOffset(t: number, startedAt: number): number {
  return (t - startedAt + TAKE_ALIGN_MS) / 1000;
}

/** The note sounding at page time `t`: the last whose span has begun (-1 before the first). */
export function noteAt(spans: { from: number; to: number }[], t: number): number {
  let i = -1;
  for (let k = 0; k < spans.length; k++) if (spans[k].from <= t) i = k;
  return i;
}

/** The music under the take: the exercise as written, and the click, its first downbeat at `t0`. */
export type TakeMusic = {
  abc: string;
  bpm: number;
  transpose: number;
  volumeMultiplier: number;
  /** The first downbeat, on the page's clock. */
  t0: number;
  beatMs: number;
  beatsPerBar: number;
  /** Beats of the count-in before t0, and of the music after it. */
  countInBeats: number;
  beats: number;
  clickSound: ClickSound;
};

export class TakePlayer {
  readonly ctx: AudioContext;
  private take: AudioBuffer | null = null;
  private music: AudioBuffer | null = null;
  private bank = new SampleBank();
  private musicGain: GainNode;
  private takeGain: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private anchor = { ctx: 0, page: 0 };
  private raf = 0;
  private frameCb: ((t: number) => void) | null = null;
  private endCb: (() => void) | null = null;
  playing = false;
  /** Where the take begins and ends, on the page's clock. */
  start = 0;
  end = 0;
  /** Where it is (page time) while paused. */
  position = 0;

  constructor(
    private recording: { blob: Blob; startedAt: number },
    private musicSpec: TakeMusic | null,
  ) {
    this.ctx = new AudioContext();
    this.takeGain = this.ctx.createGain();
    this.takeGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.ctx.destination);
  }

  /** Decode the take and render the music; resolves when it can play. */
  async load() {
    this.take = await this.ctx.decodeAudioData(await this.recording.blob.arrayBuffer());
    this.start = this.recording.startedAt - TAKE_ALIGN_MS;
    this.end = this.start + this.take.duration * 1000;
    this.position = this.start;
    if (this.musicSpec) {
      const m = this.musicSpec;
      [this.music] = await Promise.all([
        renderAbcBuffer(this.ctx, m.abc, { bpm: m.bpm, volumeMultiplier: m.volumeMultiplier, transpose: m.transpose }).catch(() => null),
        this.bank.load(this.ctx),
      ]);
    }
  }

  get hasMusic() {
    return !!this.musicSpec;
  }

  onFrame(cb: (t: number) => void) {
    this.frameCb = cb;
  }
  onEnd(cb: () => void) {
    this.endCb = cb;
  }

  /** The music (and click) on or off, at once: it is always playing, at no level. */
  setMusic(on: boolean) {
    this.musicGain.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.03);
  }

  /** The page time being heard now. */
  now(): number {
    if (!this.playing) return this.position;
    const heard = this.ctx.currentTime - (this.ctx.outputLatency || 0) - (this.ctx.baseLatency || 0);
    return this.anchor.page + (heard - this.anchor.ctx) * 1000;
  }

  async play(from = this.position) {
    if (!this.take) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.stopSources();
    const at = Math.min(Math.max(from, this.start), this.end - 50);
    const when = this.ctx.currentTime + 0.06;
    const take = this.ctx.createBufferSource();
    take.buffer = this.take;
    take.connect(this.takeGain);
    take.start(when, Math.max(0, takeOffset(at, this.recording.startedAt)));
    take.onended = () => {
      if (this.sources.includes(take)) this.finish();
    };
    this.sources.push(take);
    const m = this.musicSpec;
    if (m) {
      // The music from where its first downbeat falls relative to `at`.
      if (this.music) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.music;
        src.connect(this.musicGain);
        const into = (at - m.t0) / 1000;
        if (into >= 0) src.start(when, into);
        else src.start(when - into, 0);
        this.sources.push(src);
      }
      // The click: the count-in's beats, then every beat of the music.
      for (let k = -m.countInBeats; k < m.beats; k++) {
        const t = m.t0 + k * m.beatMs;
        if (t < at - 5) continue;
        const beatInBar = ((k % m.beatsPerBar) + m.beatsPerBar) % m.beatsPerBar;
        scheduleClick(this.ctx, this.bank, this.musicGain, when + (t - at) / 1000, m.clickSound, beatInBar === 0 ? "downbeat" : "beat");
      }
    }
    this.anchor = { ctx: when, page: at };
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      this.frameCb?.(this.now());
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    if (!this.playing) return;
    this.position = this.now();
    this.playing = false;
    this.stopSources();
    cancelAnimationFrame(this.raf);
  }

  /** Jump to page time `t`, playing on if it was playing. */
  seek(t: number) {
    const was = this.playing;
    this.pause();
    this.position = Math.min(Math.max(t, this.start), this.end);
    this.frameCb?.(this.position);
    if (was) void this.play(this.position);
  }

  private finish() {
    this.playing = false;
    this.stopSources();
    cancelAnimationFrame(this.raf);
    this.position = this.start;
    this.endCb?.();
  }

  private stopSources() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {}
    }
    this.sources = [];
  }

  dispose() {
    this.pause();
    this.frameCb = null;
    this.endCb = null;
    void this.ctx.close().catch(() => {});
  }
}
