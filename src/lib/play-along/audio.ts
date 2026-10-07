/**
 * The play-along video's sound: the backing loop, the rhythm as a guide (off
 * by default, so the class performs it), and an optional click, all scheduled
 * on one AudioContext clock against the count-in's first downbeat. Everything
 * goes through one master gain to the speakers and to `stream`, which the
 * recorder takes, so the exported video sounds exactly like the live one.
 */
import { ENDING_TAIL, type BackingTrack } from "./backing-tracks";
import { scheduleClick } from "../playback-click";
import { SampleBank, type ClickSound } from "../tuner/click-sounds";
import { beatsOf } from "../meter";
import { stretchBuffer } from "./stretch";
import { guitarFeel, nearestGuitarTempo, type GuitarPiece } from "./guitar";
import GUITAR from "./guitar-manifest.json";

type GuitarFile = { file: string; clipSec: number; barSec: number; chords: string[] };
/** A piece of the guitar part ready to play: a warped chord clip, where to start it (bars from the music's start), what part. */
export interface PreparedGuitarPiece {
  at: number;
  buffer: AudioBuffer;
  offset: number;
  /** Seconds to play; null plays the clip out (the ending's ring). */
  dur: number | null;
}
/**
 * How one guitar piece hands over to the next at a barline. The rendered
 * strum lands 10-25 ms after the beat (the strum's spread), so a piece cut
 * at the barline left a gap: the old chord gone, the new one's quiet ring,
 * then its strum. Now the old chord rings on a little and fades under the
 * new strum, and the new piece fades in over the strum's first moments.
 */
const GUITAR_RING_ON = 0.03;
const GUITAR_FADE_OUT = 0.07;
const GUITAR_FADE_IN = 0.02;
import { loopOffset } from "./timeline";
import { renderAbcBuffer } from "../render-abc";

/** How long the loop takes to fade once the last bar has been played. */
export const FADE_SECONDS = 1.5;
/** How quickly the loop gives way to its ending: short enough not to hear, long enough not to click. */
const HANDOVER_SECONDS = 0.03;

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
  /** The strummed guitar (guitar.ts), its own level, and the part for the next run. */
  private guitarGain: GainNode;
  private guitarPart: PreparedGuitarPiece[] | null = null;
  /** Decoded guitar files by path, and warped chord clips by file|chord|rate. */
  private guitarFiles = new Map<string, Promise<AudioBuffer>>();
  private guitarClips = new Map<string, AudioBuffer>();
  private clickGain: GainNode;
  private backingBuffers = new Map<string, AudioBuffer>();
  /** Loops' endings (BackingTrack `ending`), by track id. */
  private endingBuffers = new Map<string, AudioBuffer>();
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
  /** This run's own gains (the ending's, the bass fade), let go on stop. */
  private endings: GainNode[] = [];

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
    this.guitarGain = this.gainInto(this.master, 0);
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
    const [buffer] = await Promise.all([this.load(track.file, track.id, this.backingBuffers, track.name), this.loadEnding(track)]);
    return buffer;
  }

  /** The loop's ending, when it has one. A missing ending is not an error: the loop fades instead. */
  private async loadEnding(track: BackingTrack) {
    if (!track.ending) return;
    try {
      await this.load(track.ending, track.id, this.endingBuffers, track.name);
    } catch {}
  }

  private async load(file: string, id: string, into: Map<string, AudioBuffer>, name: string): Promise<AudioBuffer> {
    const have = into.get(id);
    if (have) return have;
    const res = await fetch(file);
    if (!res.ok) throw new Error(`The backing track "${name}" could not be loaded.`);
    const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    into.set(id, buffer);
    return buffer;
  }

  /**
   * The backing track at `bpm`, warped from its own tempo with the pitch kept
   * (stretch.ts), made once per tempo and kept. Its own tempo is the file as
   * it is. Blocks for about a second the first time at a new tempo.
   */
  backingAt(track: BackingTrack, bpm: number): AudioBuffer | undefined {
    // The ending is warped with it, so Play does not stall on it later.
    this.endingAt(track, bpm);
    return this.warped(this.backingBuffers.get(track.id), `${track.id}@${bpm}`, bpm / track.bpm);
  }

  /** The loop's ending at `bpm`, warped like the loop (none when the track has no ending). */
  endingAt(track: BackingTrack, bpm: number): AudioBuffer | undefined {
    return this.warped(this.endingBuffers.get(track.id), `${track.id}:end@${bpm}`, bpm / track.bpm);
  }

  private warped(original: AudioBuffer | undefined, key: string, rate: number): AudioBuffer | undefined {
    if (!original || rate === 1) return original;
    let buffer = this.stretched.get(key);
    if (!buffer) {
      buffer = stretchBuffer(this.ctx, original, rate);
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
  renderGuide(abc: string, bpm: number, volumeMultiplier: number, transpose = 0): Promise<AudioBuffer | null> {
    // transpose: the page's playback transpose, as its own playback applies it.
    return renderAbcBuffer(this.ctx, abc, { bpm, volumeMultiplier, transpose });
  }

  /** The guide to play with the next run (renderGuide's result, for the current track and tempo). */
  setGuide(buffer: AudioBuffer | null) {
    this.guideBuffer = buffer;
  }

  /**
   * The guitar part for `pieces` (guitar.ts guitarPart) at `bpm` in `meter`:
   * each chord's clip cut from the file rendered nearest that tempo and
   * warped to it, pitch kept (stretch.ts), each made once and kept. Null
   * when a file is missing a chord (nothing half-strummed plays).
   */
  async prepareGuitar(pieces: GuitarPiece[], o: { meter: string; bpm: number }): Promise<PreparedGuitarPiece[] | null> {
    const { feel } = guitarFeel(o.meter);
    const rendered = nearestGuitarTempo(feel, o.bpm);
    const rate = o.bpm / rendered;
    const out: PreparedGuitarPiece[] = [];
    for (let p of pieces) {
      // Endings are rendered on the major tonics only: a minor key's last bar
      // strums its pattern instead of falling silent with the whole part.
      if (p.ending && !(GUITAR.endings as Record<string, GuitarFile>)[`${p.slot}@${rendered}`]?.chords.includes(p.chord)) {
        p = { ...p, ending: false };
      }
      const set = (p.ending ? GUITAR.endings : GUITAR.patterns) as Record<string, GuitarFile>;
      const f = set[`${p.slot}@${rendered}`];
      const index = f?.chords.indexOf(p.chord) ?? -1;
      if (!f || index < 0) return null;
      const key = `${f.file}|${p.chord}|${rate}`;
      let clip = this.guitarClips.get(key);
      if (!clip) {
        const whole = await this.guitarFile(f.file);
        const n = Math.round(f.clipSec * whole.sampleRate);
        const raw = this.ctx.createBuffer(whole.numberOfChannels, n, whole.sampleRate);
        const from = Math.round(index * f.clipSec * whole.sampleRate);
        for (let ch = 0; ch < whole.numberOfChannels; ch++) raw.copyToChannel(whole.getChannelData(ch).subarray(from, from + n), ch);
        clip = rate === 1 ? raw : stretchBuffer(this.ctx, raw, rate, true);
        this.guitarClips.set(key, clip);
      }
      out.push({
        at: p.at,
        buffer: clip,
        offset: (p.from * f.barSec) / rate,
        dur: p.ending ? null : ((p.to - p.from) * f.barSec) / rate,
      });
    }
    return out;
  }

  private guitarFile(path: string): Promise<AudioBuffer> {
    let job = this.guitarFiles.get(path);
    if (!job) {
      job = fetch(path).then(async (res) => {
        if (!res.ok) throw new Error("The guitar could not be loaded.");
        return this.ctx.decodeAudioData(await res.arrayBuffer());
      });
      job.catch(() => this.guitarFiles.delete(path));
      this.guitarFiles.set(path, job);
    }
    return job;
  }

  /** The guitar part to play with the next run (prepareGuitar's result), or none. */
  setGuitar(part: PreparedGuitarPiece[] | null) {
    this.guitarPart = part;
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
  setMix(m: { loop: number; guide: number; click: number; bass?: number; guitar?: number }) {
    const at = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    at(this.loopLevel, m.loop);
    at(this.guideGain, m.guide * 0.9);
    at(this.clickGain, m.click);
    at(this.bassGain, m.bass ?? 0);
    at(this.guitarGain, m.guitar ?? 0);
  }

  /**
   * Schedules the whole video from `t0`, the count-in's first downbeat in
   * context time, at `bpm` (the track's own, or one the tempo control chose:
   * the backing is warped to it, and every time in the track's description
   * scales with it). Returns when the music ends (the end of the last bar)
   * and when the sound does (an ending's ring or the fade), in context time.
   */
  start(
    t0: number,
    o: { track: BackingTrack; bpm: number; bars: number; countInBars: number; meter: string; clickSound: ClickSound },
  ): { musicEnd: number; soundEnd: number } {
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
    // A loop with an ending hands over to it two bars from the end: the
    // groove into its fill, and the final hit where the last note lands.
    const ending = !track.fullLength && bars >= 2 ? this.endingAt(track, o.bpm) : undefined;
    const handover = musicEnd - 2 * bar;
    const tail = ending ? ENDING_TAIL / rate : FADE_SECONDS;
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
        src.stop(ending ? handover + HANDOVER_SECONDS : musicEnd + FADE_SECONDS);
      }
      this.sources.push(src);
    }
    this.backingGain.gain.cancelScheduledValues(0);
    this.backingGain.gain.setValueAtTime(1, t0);
    if (ending) {
      this.backingGain.gain.setValueAtTime(1, handover);
      this.backingGain.gain.linearRampToValueAtTime(0, handover + HANDOVER_SECONDS);
      // Its first bar is empty (the engine's count-in slot): start one bar in.
      const src = this.ctx.createBufferSource();
      src.buffer = ending;
      const level = this.gainInto(this.loopLevel, 1);
      src.connect(level);
      src.start(handover, bar);
      this.sources.push(src);
      this.endings.push(level);
    } else if (!track.fullLength) {
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
      // The last root rings into the finish, fading with the drums.
      const fade = this.gainInto(this.bassGain, 1);
      fade.gain.setValueAtTime(1, musicEnd);
      fade.gain.linearRampToValueAtTime(0, musicEnd + tail);
      src.connect(fade);
      src.start(musicStart);
      src.stop(musicEnd + tail);
      this.sources.push(src);
      this.endings.push(fade);
    }

    // The guitar: each piece its chord's clip from its place in the bar,
    // faded in over a few ms and crossfaded into the next; the ending rings out.
    let guitarEnd = 0;
    for (const p of this.guitarPart ?? []) {
      const when = musicStart + p.at * bar;
      const src = this.ctx.createBufferSource();
      src.buffer = p.buffer;
      const g = this.gainInto(this.guitarGain, 0);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(1, when + GUITAR_FADE_IN);
      if (p.dur !== null) {
        const out = when + p.dur + GUITAR_RING_ON;
        g.gain.setValueAtTime(1, out);
        g.gain.linearRampToValueAtTime(0, out + GUITAR_FADE_OUT);
        src.start(when, p.offset, p.dur + GUITAR_RING_ON + GUITAR_FADE_OUT);
      } else {
        src.start(when, p.offset);
        guitarEnd = Math.max(guitarEnd, when + p.buffer.duration - p.offset);
      }
      src.connect(g);
      this.sources.push(src);
      this.endings.push(g);
    }

    // Every beat from the count-in to the last bar: about 150 nodes in 90 s,
    // made up front so they sit on the same clock as the loop.
    const totalBeats = (countInBars + bars) * beats;
    for (let b = 0; b < totalBeats; b++) {
      scheduleClick(this.ctx, this.bank, clicks, t0 + b * beat, o.clickSound, b % beats === 0 ? "downbeat" : "beat");
    }

    return { musicEnd, soundEnd: Math.max(musicEnd + tail, guitarEnd) };
  }

  stop() {
    this.clickBus?.disconnect();
    this.clickBus = null;
    for (const g of this.endings) g.disconnect();
    this.endings = [];
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

