/**
 * The engine the play-along backing tracks are arranged with: each track is a
 * short file beside this one (soul-4-4-80.ts, reggaeton-4-4-108.ts) that
 * places one Splice pack's loops and hits on a bar grid, and this does the
 * rest - decoding, levels, click-free cuts, filters, the master and the MP3.
 *
 * A track is a full-length arrangement, not a loop (backing-tracks.ts
 * `fullLength`): a count-in (bar -1), `bars` bars of music, then an ending
 * that rings on. Its timing is exact; this is what students read against.
 *
 * The samples stay in ~/Splice and never enter the repo; only the finished
 * mix does, which is the use Splice's licence allows (a new composition).
 * KEEP_WAV=1 keeps a .wav beside the .mp3 for listening closely.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const RATE = 44100;
export type Stereo = [Float32Array, Float32Array];

export function song(o: { pack: string; bpm: number; beats: number; bars: number; tailSec: number; out: string }) {
  const PACK = join(homedir(), "Splice/sounds/packs", o.pack);
  const beatSec = 60 / o.bpm;
  const barSec = beatSec * o.beats;
  /** Seconds from the start of the file: bar -1 is the count-in, bar 0 the first bar of music. */
  const at = (bar: number, beat = 0) => (bar + 1) * barSec + beat * beatSec;

  function file(name: string): string {
    const out = execFileSync("find", [PACK, "-name", name]).toString().trim().split("\n")[0];
    if (!out) throw new Error(`Missing ${name} in "${o.pack}" - is it downloaded in Splice?`);
    return out;
  }

  /** Decodes to stereo 44.1k, optionally time-stretched (pitch kept) from `fromBpm` to the song's tempo. */
  function load(name: string, opts: { fromBpm?: number; trim?: boolean } = {}): Stereo {
    const filters = opts.fromBpm && opts.fromBpm !== o.bpm ? ["-af", `atempo=${o.bpm / opts.fromBpm}`] : [];
    const raw = execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", file(name), ...filters, "-f", "f32le", "-ac", "2", "-ar", String(RATE), "-"],
      { maxBuffer: 1 << 29 },
    );
    const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let start = 0;
    if (opts.trim) {
      // A one-shot's hit lands on time only without the silence before it.
      let peak = 0;
      for (const x of all) peak = Math.max(peak, Math.abs(x));
      while (start < all.length && Math.abs(all[start]) < peak * 0.02) start++;
      start -= start % 2;
    }
    const n = (all.length - start) / 2;
    const l = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      l[i] = all[start + 2 * i];
      r[i] = all[start + 2 * i + 1];
    }
    return [l, r];
  }

  /** A stretch of a loaded sound: a single hit cut out of a loop, say. */
  const slice = (s: Stereo, fromSec: number, lenSec: number): Stereo => {
    const a = Math.round(fromSec * RATE), z = Math.round((fromSec + lenSec) * RATE);
    return [s[0].slice(a, z), s[1].slice(a, z)];
  };

  const reversed = (s: Stereo): Stereo => [s[0].slice().reverse(), s[1].slice().reverse()];

  /** Gain that brings a part to `targetDb` RMS (over its sounding samples), so levels are set by numbers, not by how hot each file was printed. */
  function toLevel(s: Stereo, targetDb: number): number {
    let sum = 0, n = 0;
    for (const ch of s) for (const x of ch) if (Math.abs(x) > 0.001) { sum += x * x; n++; }
    const rmsDb = 10 * Math.log10(sum / Math.max(1, n));
    return Math.pow(10, (targetDb - rmsDb) / 20);
  }

  const total = Math.ceil((at(o.bars) + o.tailSec) * RATE);
  const L = new Float32Array(total), R = new Float32Array(total);
  const FADE = Math.round(0.006 * RATE); // a click-free edge on every cut

  /**
   * Lays `src` from `fromSec` for `lenSec` at `atSec`, with short fades at the
   * cuts. `fadeOut` makes the tail die away; `fadeIn` brings it up. `lowpass`
   * sweeps a one-pole low-pass from one cutoff to another across it - in one
   * call, so the filter never restarts mid-phrase.
   */
  function lay(
    src: Stereo,
    p: { atSec: number; fromSec?: number; lenSec?: number; gain: number; fadeIn?: number; fadeOut?: number; lowpass?: [number, number] },
  ) {
    const from = Math.round((p.fromSec ?? 0) * RATE);
    const len = Math.min(src[0].length - from, Math.round((p.lenSec ?? src[0].length / RATE) * RATE));
    const start = Math.round(p.atSec * RATE);
    const head = p.fadeIn ? Math.round(p.fadeIn * RATE) : from > 0 ? FADE : 0;
    const tail = p.fadeOut ? Math.round(p.fadeOut * RATE) : FADE;
    const lp = [0, 0];
    if (from < 0 || len <= 0) throw new Error(`lay: nothing to play (from ${from}, length ${len})`);
    for (let i = 0; i < len && start + i < total; i++) {
      if (start + i < 0) continue;
      let g = p.gain;
      if (i < head) g *= i / head;
      if (i > len - tail) g *= (len - i) / tail;
      for (let c = 0; c < 2; c++) {
        let x = src[c][from + i];
        if (p.lowpass) {
          const hz = p.lowpass[0] * Math.pow(p.lowpass[1] / p.lowpass[0], i / len);
          const a = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
          lp[c] += a * (x - lp[c]);
          x = lp[c];
        }
        (c === 0 ? L : R)[start + i] += x * g;
      }
    }
  }

  const loopBarsOf = (s: Stereo) => Math.max(1, Math.round(s[0].length / RATE / barSec));

  /**
   * Bars `from`..`to` (exclusive) of a loop, each read at its own place in
   * the loop (bar n plays the loop's bar n mod its length), so a progression
   * runs straight through section changes. `cut` stops a bar early, at that
   * beat, to leave room for a fill or a stop.
   */
  function loop(src: Stereo, from: number, to: number, gain: number, cut: Record<number, number> = {}) {
    const loopBars = loopBarsOf(src);
    for (let b = from; b < to; b++) {
      const beats = cut[b] ?? o.beats;
      // Wrapped so the count-in (bar -1) reads the loop's last bar, not before its start.
      const inLoop = ((b % loopBars) + loopBars) % loopBars;
      lay(src, { atSec: at(b), fromSec: inLoop * barSec, lenSec: beats * beatSec, gain });
    }
  }

  /** One sound starting at a bar and beat. */
  const hit = (src: Stereo, bar: number, beat: number, gain: number) => lay(src, { atSec: at(bar, beat), gain });

  /** A sound whose end lands on the downbeat of `bar`: a reversed cymbal, a riser. */
  const into = (src: Stereo, bar: number, gain: number) => lay(src, { atSec: at(bar) - src[0].length / RATE, gain });

  /** Masters and writes the track: level from the music's loud body (99.9th percentile to about -2 dB), a soft limiter for the few peaks above, then -1 dBFS. */
  function write() {
    const sample: number[] = [];
    for (let i = 0; i < total; i += 7) sample.push(Math.max(Math.abs(L[i]), Math.abs(R[i])));
    sample.sort((a, b) => a - b);
    const pre = 0.8 / sample[Math.floor(sample.length * 0.999)];
    const soft = (x: number) => {
      const k = 0.7;
      const a = Math.abs(x);
      return a <= k ? x : Math.sign(x) * (k + (1 - k) * Math.tanh((a - k) / (1 - k)));
    };
    let after = 0;
    for (let i = 0; i < total; i++) {
      L[i] = soft(L[i] * pre);
      R[i] = soft(R[i] * pre);
      after = Math.max(after, Math.abs(L[i]), Math.abs(R[i]));
    }
    const post = 0.89 / after;
    const data = Buffer.alloc(total * 4);
    for (let i = 0; i < total; i++) {
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * post)) * 32767), i * 4);
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * post)) * 32767), i * 4 + 2);
    }
    const h = Buffer.alloc(44);
    h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
    h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
    h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
    h.write("data", 36); h.writeUInt32LE(data.length, 40);
    mkdirSync("public/backing", { recursive: true });
    writeFileSync(`${o.out}.wav`, Buffer.concat([h, data]));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${o.out}.wav`, "-codec:a", "libmp3lame", "-b:a", "192k", `${o.out}.mp3`]);
    if (!process.env.KEEP_WAV) rmSync(`${o.out}.wav`);
    console.log(`${o.out}.mp3: ${o.beats} beats at ${o.bpm}, count-in + ${o.bars} bars + ending, ${(total / RATE).toFixed(1)} s`);
  }

  return { at, beatSec, barSec, load, slice, reversed, toLevel, lay, loop, hit, into, write };
}
