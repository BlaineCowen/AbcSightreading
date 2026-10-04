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
 * rate). Over 90 s there is no drift; what is left is WSOLA's own few ms of
 * jitter. Tests: tests/unit/play-along-stretch.test.ts.
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
export function stretchChannels(ch: Channels, rate: number, sampleRate = SAMPLE_RATE_FOR_ALIGNMENT): Channels {
  if (Math.abs(rate - 1) < 1e-6) return [ch[0].slice(), ch[1].slice()];
  const st = new SoundTouch();
  st.tempo = rate;
  const filter = new SimpleFilter(new ArraySource(ch), st);
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
  return [outL, outR];
}

/** The same on an AudioBuffer, for the player. */
export function stretchBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, rate: number): AudioBuffer {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const [l, r] = stretchChannels([left, right], rate, buffer.sampleRate);
  const out = ctx.createBuffer(2, l.length, buffer.sampleRate);
  out.copyToChannel(l, 0);
  out.copyToChannel(r, 1);
  return out;
}
