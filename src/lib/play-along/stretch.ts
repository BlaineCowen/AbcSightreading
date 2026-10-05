/**
 * Changes a backing track's tempo with its pitch kept, for the play-along
 * video's tempo control: the whole track at once, offline, so the result is
 * an ordinary buffer on the same audio clock as everything else (a live
 * stretch would drift from the bar grid). soundtouchjs (LGPL-2.1) does the
 * stretching - WSOLA, which is clean on drums within the ±15% the video
 * offers (tempoChoices in timeline.ts).
 *
 * SoundTouch's output starts a little late (its processing latency), which
 * would put every hit behind the grid. The output is lined up with where it
 * should be by cross-correlating the loudness envelopes of the first ten
 * seconds - the input's, time-scaled, against the output's - which is steady
 * where lining up one hit was not (that left -12 to +6 ms depending on the
 * rate). Over 90 s there is no drift.
 *
 * Slowing down far (the video goes to half speed) needs two more things.
 * SoundTouch's automatic slices grow to about 120 ms at slow tempos, and at
 * half speed each is played twice, so every drum hit came out doubled 120 ms
 * later; slower than 1x the slices are fixed at 25 ms. That still leaves a
 * faint echo 25 ms after each hit, so the transients are restored: each
 * attack in the original (onsets()) is pasted back at exactly its new time,
 * its first 45 ms straight from the original, crossfaded into the stretched
 * sound after. The hits are then sample-exact and the echo, inside that
 * window, is gone.
 */
import { SimpleFilter, SoundTouch } from "soundtouchjs";

/** Stereo samples, as two channels. */
export type Channels = [Float32Array, Float32Array];

/** Reads frames from plain arrays the way soundtouchjs's buffer source does. */
class ArraySource {
  constructor(private ch: Channels) {}
  extract(target: Float32Array, numFrames = 0, position = 0): number {
    const [l, r] = this.ch;
    const n = Math.max(0, Math.min(numFrames, l.length - position));
    for (let i = 0; i < n; i++) {
      target[i * 2] = l[position + i];
      target[i * 2 + 1] = r[position + i];
    }
    return n;
  }
}

/**
 * Where the hits are: the times (in samples) where the high end of the sound
 * jumps - a drum hit, a plucked or struck note - at least 60 ms apart.
 */
export function onsets(x: Float32Array, sampleRate: number): number[] {
  const hop = Math.round(sampleRate * 0.0025);
  const env: number[] = [];
  let prev = 0;
  for (let i = 0; i + hop <= x.length; i += hop) {
    // The first difference favours the attack's high frequencies over a held note.
    let e = 0;
    for (let j = i; j < i + hop; j++) {
      const d = x[j] - (j ? x[j - 1] : 0);
      e += d * d;
    }
    env.push(Math.sqrt(e / hop));
    prev = e;
  }
  void prev;
  const peak = Math.max(...env, 1e-9);
  const out: number[] = [];
  let avg = 0;
  let last = -Infinity;
  const gap = Math.round(0.06 * sampleRate);
  for (let k = 0; k < env.length; k++) {
    const e = env[k];
    if (e > peak * 0.08 && e > avg * 2.5 && k * hop - last >= gap) {
      out.push(k * hop);
      last = k * hop;
    }
    avg = avg * 0.9 + e * 0.1;
  }
  return out;
}

/** Loudness per millisecond (the peak in each), the shape the alignment compares. */
function envelope(x: Float32Array, sampleRate: number, seconds: number): Float32Array {
  const step = Math.round(sampleRate / 1000);
  const n = Math.min(Math.floor(x.length / step), Math.round(seconds * 1000));
  const e = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let m = 0;
    for (let i = k * step; i < (k + 1) * step; i++) m = Math.max(m, Math.abs(x[i]));
    e[k] = m;
  }
  return e;
}

/**
 * How many milliseconds `out` runs behind where it should (`ideal`), within
 * ±`maxMs`: the lag that best lines the two envelopes up.
 */
function lagMs(ideal: Float32Array, out: Float32Array, maxMs: number): number {
  let best = -Infinity, bestLag = 0;
  for (let lag = -maxMs; lag <= maxMs; lag++) {
    let sum = 0;
    for (let k = 0; k < ideal.length; k++) {
      const j = k + lag;
      if (j >= 0 && j < out.length) sum += ideal[k] * out[j];
    }
    if (sum > best) { best = sum; bestLag = lag; }
  }
  return bestLag;
}

const SAMPLE_RATE_FOR_ALIGNMENT = 44100;

/**
 * `rate` above 1 is faster (shorter), below 1 slower; pitch is unchanged.
 * The result is the input's length divided by `rate`.
 */
export function stretchChannels(ch: Channels, rate: number, sampleRate = SAMPLE_RATE_FOR_ALIGNMENT, tonal = false): Channels {
  if (Math.abs(rate - 1) < 1e-6) return [ch[0].slice(), ch[1].slice()];
  const st = new SoundTouch();
  st.tempo = rate;
  // Slower than 1x, fixed short slices: the automatic ones (about 120 ms) are
  // played twice at half speed and doubled every hit.
  if (rate < 1) st.stretch.setParameters(sampleRate, 25, 10, 6);
  // Held, pitched sound (the guitar): slices that long cut a chord into a
  // buzz. Longer ones keep it whole; the strums' attacks are restored below,
  // and a guitar clip is never stretched far (it is rendered near the tempo).
  if (tonal) st.stretch.setParameters(sampleRate, 82, 28, 12);
  // Silence after the input, so SoundTouch lets go of its last few hundred
  // milliseconds: without it a short clip (a guitar bar) came out with its
  // end missing, a gap just before the next barline.
  const padded = ch.map((c) => {
    const p = new Float32Array(c.length + Math.round(0.5 * sampleRate));
    p.set(c);
    return p;
  }) as Channels;
  const filter = new SimpleFilter(new ArraySource(padded), st);
  const want = Math.round(ch[0].length / rate);
  // Read past the end a little: the latency means the tail arrives late.
  const l = new Float32Array(want + 8192), r = new Float32Array(want + 8192);
  const chunk = 4096;
  const buf = new Float32Array(chunk * 2);
  let got = 0;
  while (got < l.length) {
    const n = filter.extract(buf, Math.min(chunk, l.length - got));
    if (n === 0) break;
    for (let i = 0; i < n; i++) {
      l[got + i] = buf[i * 2];
      r[got + i] = buf[i * 2 + 1];
    }
    got += n;
  }
  // Undo the processing latency: compare the first ten seconds with the
  // input's envelope squeezed or stretched to the new tempo.
  const inEnv = envelope(ch[0], sampleRate, 10 * rate);
  const ideal = new Float32Array(Math.floor(inEnv.length / rate));
  for (let k = 0; k < ideal.length; k++) ideal[k] = inEnv[Math.min(inEnv.length - 1, Math.round(k * rate))];
  const lag = lagMs(ideal, envelope(l, sampleRate, 10), 150);
  const shift = Math.round((lag * sampleRate) / 1000);
  const outL = new Float32Array(want), outR = new Float32Array(want);
  for (let i = 0; i < want; i++) {
    const j = i + shift;
    if (j >= 0 && j < got) { outL[i] = l[j]; outR[i] = r[j]; }
  }
  restoreTransients(ch, [outL, outR], rate, sampleRate);
  return [outL, outR];
}

/**
 * Pastes each attack of the original back into the stretched sound at exactly
 * its new time: 25 ms of the original's lead-in before the hit (faded in over
 * its first 3 ms - speeding up, the stretched sound can carry a copy of the
 * hit slightly early, and this replaces it), then up to 45 ms of the attack
 * (never into the next hit), crossfaded back to the stretched sound over 6 ms.
 */
function restoreTransients(src: Channels, out: Channels, rate: number, sampleRate: number) {
  const mono = new Float32Array(src[0].length);
  for (let i = 0; i < mono.length; i++) mono[i] = (src[0][i] + src[1][i]) / 2;
  const hits = onsets(mono, sampleRate);
  const lead = Math.round(0.025 * sampleRate);
  const fadeIn = Math.round(0.003 * sampleRate);
  const fadeOut = Math.round(0.006 * sampleRate);
  const maxLen = Math.round(0.045 * sampleRate);
  /** Where the last pasted window ended, in the stretched sound: a lead-in never reaches back past it. */
  let pastedTo = 0;
  hits.forEach((at, k) => {
    const next = hits[k + 1] ?? src[0].length;
    const to = Math.round(at / rate);
    // Never past the next hit, in the original or in the stretched time.
    const len = Math.min(maxLen, next - at, Math.floor((next - at) / rate)) - fadeOut;
    if (len <= fadeOut) return;
    const pre = Math.max(0, Math.min(lead, to - pastedTo, at));
    const fin = Math.min(fadeIn, pre);
    for (let i = -pre; i < len; i++) {
      const sIdx = at + i, d = to + i;
      if (sIdx >= src[0].length || d >= out[0].length) break;
      // How much of the original: rising over the first ms of the lead-in, falling over the last 6 ms.
      const w = fin > 0 && i < -pre + fin ? (i + pre) / fin : i >= len - fadeOut ? (len - i) / fadeOut : 1;
      for (let c = 0; c < 2; c++) out[c][d] = out[c][d] * (1 - w) + src[c][sIdx] * w;
    }
    pastedTo = to + len;
  });
}

/** The same on an AudioBuffer, for the player. */
export function stretchBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, rate: number, tonal = false): AudioBuffer {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const [l, r] = stretchChannels([left, right], rate, buffer.sampleRate, tonal);
  const out = ctx.createBuffer(2, l.length, buffer.sampleRate);
  out.copyToChannel(l, 0);
  out.copyToChannel(r, 1);
  return out;
}
