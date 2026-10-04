/**
 * The play-along video's sound: the backing loop, the rhythm as a guide (off
 * by default, so the class performs it), and an optional click, all scheduled
 * on one AudioContext clock against the count-in's first downbeat. Everything
 * goes through one master gain to the speakers and to `stream`, which the
 * recorder takes, so the exported video sounds exactly like the live one.
 */
import abcjs from "abcjs";
import type { BackingTrack } from "./backing-tracks";
import { scheduleClick } from "../playback-click";
import { SampleBank, type ClickSound } from "../tuner/click-sounds";
import { beatsOf } from "../meter";
import { stretchBuffer } from "./stretch";
import { loopOffset } from "./timeline";

/** How long the loop takes to fade once the last bar has been played. */
export const FADE_SECONDS = 1.5;

export class PlayAlongAudio {
  readonly ctx: AudioContext;
  readonly stream: MediaStream;
  private master: GainNode;
  /** The loop's own fade at the end; `loopLevel` after it is the slider. */
  private backingGain: GainNode;
  private loopLevel: GainNode;
  private guideGain: GainNode;
  /** The pitched video's bass line (bass.ts), its own level. */
  private bassGain: GainNode;
  private bassBuffer: AudioBuffer | null = null;
  private clickGain: GainNode;
  private backingBuffers = new Map<string, AudioBuffer>();
  /** Backing tracks warped to another tempo, by "id@bpm". */
  private stretched = new Map<string, AudioBuffer>();
  private guideBuffer: AudioBuffer | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  /**
   * This run's clicks. They are all scheduled when it starts, each its own
   * short-lived node, so stopping cuts this one connection: otherwise they
   * kept clicking to the end after the video was stopped.
   */
  private clickBus: GainNode | null = null;
  private bank = new SampleBank();

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    const recording = this.ctx.createMediaStreamDestination();
    this.master.connect(this.ctx.destination);
    this.master.connect(recording);
    this.stream = recording.stream;
    this.loopLevel = this.gainInto(this.master, 1);
    this.backingGain = this.gainInto(this.loopLevel, 1);
    this.guideGain = this.gainInto(this.master, 0);
    this.bassGain = this.gainInto(this.master, 0);
    this.clickGain = this.gainInto(this.master, 0);
    void this.bank.load(this.ctx);
  }

  /** Resolves once the click samples are in, so the first clicks are not the fallback tick. */
  ready(): Promise<void> {
    return this.bank.load(this.ctx);
  }

  private gainInto(dest: AudioNode, value: number) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  async loadBacking(track: BackingTrack): Promise<AudioBuffer> {
    const have = this.backingBuffers.get(track.id);
    if (have) return have;
    const res = await fetch(track.file);
    if (!res.ok) throw new Error(`The backing track "${track.name}" could not be loaded.`);
    const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    this.backingBuffers.set(track.id, buffer);
    return buffer;
  }

  /**
   * The backing track at `bpm`, warped from its own tempo with the pitch kept
   * (stretch.ts), made once per tempo and kept. Its own tempo is the file as
   * it is. Blocks for about a second the first time at a new tempo.
   */
  backingAt(track: BackingTrack, bpm: number): AudioBuffer | undefined {
    const original = this.backingBuffers.get(track.id);
    if (!original || bpm === track.bpm) return original;
    const key = `${track.id}@${bpm}`;
    let buffer = this.stretched.get(key);
    if (!buffer) {
      buffer = stretchBuffer(this.ctx, original, bpm / track.bpm);
      this.stretched.set(key, buffer);
    }
    return buffer;
  }

  /**
   * Renders the rhythm itself, as the Unison page does (AbcjsSingle initAudio),
   * for the guide track: `abc` already names the instrument (withRhythmSound).
   * Drawn off screen because abcjs's synth reads a drawn tune. Returns the
   * buffer rather than keeping it: renders can overlap (a new track while the
   * last one's guide is still rendering), and only the caller knows which is
   * current - keeping whichever finished last once left a guide at the old
   * track's tempo, falling further behind every bar. `setGuide` keeps it.
   */
  async renderGuide(abc: string, bpm: number, volumeMultiplier: number): Promise<AudioBuffer | null> {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-20000px;top:0;width:800px;visibility:hidden";
    document.body.appendChild(host);
    try {
      const tune = abcjs.renderAbc(host, abc)[0];
      const synth = new abcjs.synth.CreateSynth();
      await synth.init({
        audioContext: this.ctx,
        visualObj: tune,
        options: { qpm: bpm, soundFontUrl: "/api/soundfont/", soundFontVolumeMultiplier: volumeMultiplier },
      } as any);
      await synth.prime();
      return synth.getAudioBuffer() ?? null;
    } finally {
      host.remove();
    }
  }

  /** The guide to play with the next run (renderGuide's result, for the current track and tempo). */
  setGuide(buffer: AudioBuffer | null) {
    this.guideBuffer = buffer;
  }

  /** The bass line to play with the next run (rendered as renderGuide renders, from bass.ts's ABC). */
  setBass(buffer: AudioBuffer | null) {
    this.bassBuffer = buffer;
  }

  /**
   * The mix, each 0 to 1: the loop, the guide and the click. 0 is off; the
   * guide and click start off, so the class performs the rhythm itself.
   * Applies at once, mid-play too, and reaches the recording.
   */
  setMix(m: { loop: number; guide: number; click: number; bass?: number }) {
    const at = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    at(this.loopLevel, m.loop);
    at(this.guideGain, m.guide * 0.9);
    at(this.clickGain, m.click);
    at(this.bassGain, m.bass ?? 0);
  }

  /**
   * Schedules the whole video from `t0`, the count-in's first downbeat in
   * context time, at `bpm` (the track's own, or one the tempo control chose:
   * the backing is warped to it, and every time in the track's description
   * scales with it). Returns when the sound ends (fade included), in context
   * time.
   */
  start(
    t0: number,
    o: { track: BackingTrack; bpm: number; bars: number; countInBars: number; meter: string; clickSound: ClickSound },
  ): number {
    this.stop();
    const clicks = this.gainInto(this.clickGain, 1);
    this.clickBus = clicks;
    const { track, bars, countInBars, meter } = o;
    const rate = o.bpm / track.bpm;
    const beats = beatsOf(meter);
    const beat = 60 / o.bpm;
    const bar = beat * beats;
    const musicStart = t0 + countInBars * bar;
    const musicEnd = musicStart + bars * bar;
    const downbeat = track.downbeatSec / rate;

    const backing = this.backingAt(track, o.bpm);
    if (backing) {
      const src = this.ctx.createBufferSource();
      src.buffer = backing;
      if (track.fullLength) {
        // A whole arrangement, count-in to final hit: played once as written,
        // its own ending ringing on after the last bar.
        src.connect(this.backingGain);
        src.start(t0, downbeat);
      } else {
        src.loop = true;
        // The intro, if the loop has one, plays once as the count-in; then the
        // repeating part loops for as long as the music lasts.
        src.loopStart = downbeat + (track.introBars ?? 0) * bar;
        src.loopEnd = src.loopStart + track.bars * bar;
        const offset = track.introBars ? downbeat : downbeat + loopOffset(countInBars, track.bars) * bar;
        src.connect(this.backingGain);
        src.start(t0, offset);
        src.stop(musicEnd + FADE_SECONDS);
      }
      this.sources.push(src);
    }
    this.backingGain.gain.cancelScheduledValues(0);
    this.backingGain.gain.setValueAtTime(1, t0);
    if (!track.fullLength) {
      this.backingGain.gain.setValueAtTime(1, musicEnd);
      this.backingGain.gain.linearRampToValueAtTime(0, musicEnd + FADE_SECONDS);
    }

    if (this.guideBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.guideBuffer;
      src.connect(this.guideGain);
      src.start(musicStart);
      // The exercise can be longer than this track (one exercise serves every
      // track in a meter), so the guide stops where the music does.
      src.stop(musicEnd + 0.05);
      this.sources.push(src);
    }

    if (this.bassBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.bassBuffer;
      src.connect(this.bassGain);
      src.start(musicStart);
      // The last root rings into the finish, then fades with the loop.
      src.stop(musicEnd + FADE_SECONDS);
      this.sources.push(src);
    }

    // Every beat from the count-in to the last bar: about 150 nodes in 90 s,
    // made up front so they sit on the same clock as the loop.
    const totalBeats = (countInBars + bars) * beats;
    for (let b = 0; b < totalBeats; b++) {
      scheduleClick(this.ctx, this.bank, clicks, t0 + b * beat, o.clickSound, b % beats === 0 ? "downbeat" : "beat");
    }

    return musicEnd + FADE_SECONDS;
  }

  stop() {
    this.clickBus?.disconnect();
    this.clickBus = null;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // Already stopped.
      }
      s.disconnect();
    }
    this.sources = [];
  }

  async close() {
    this.stop();
    await this.ctx.close();
  }
}

