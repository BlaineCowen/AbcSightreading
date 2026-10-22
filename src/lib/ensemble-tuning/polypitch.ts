/**
 * OmniPitch's polyphonic pitch detector (polyphonic-pitch-detector, Rust compiled
 * to wasm; notes/omnipitch.md), ported from its loader `polypitch/web/polypitch.js`.
 * Only what the Ensemble tab uses: Basic Pitch transcription, score-informed
 * separation with each note's pitch curve, and the curve's split into centre,
 * drift and modulation. The wasm is built without the vocoder (note editing),
 * which is proprietary and not needed to hear tuning.
 *
 * No wasm-bindgen: the module has no imports, and data goes through buffers it
 * hands out (pp_input, pp_notes) and comes back through pp_output / pp_shapes.
 */

/** The wasm's address; a new build gets a new name, since /omnipitch/ is cached a year. */
export const POLYPITCH_URL = "/omnipitch/polypitch-1.wasm";

/** A note Basic Pitch found: seconds, the written MIDI note, its frequency and loudness, and its rough shape. */
export interface PolyNote {
  start: number;
  end: number;
  midi: number;
  freq: number;
  velocity: number;
  /** Per frame: seconds, cents off `midi` (only to about 33 cents: Basic Pitch's bins), loudness 0..1. */
  times: Float32Array;
  cents: Float32Array;
  amp: Float32Array;
}

/** A separated note's pitch: seconds from the segment's start, cents from `midi` at A440, loudness. */
export interface PitchCurve {
  times: Float32Array;
  cents: Float32Array;
  weight: Float32Array;
}

export type NoteSpan = { start: number; end: number; midi: number };

export interface PolyPitch {
  basicPitchNotes(samples: Float32Array, sampleRate: number, voices?: boolean): PolyNote[];
  separateWindow(
    segment: Float32Array,
    sampleRate: number,
    notes: NoteSpan[],
    wanted: number[]
  ): { signal: Float32Array; curve: PitchCurve }[];
  splitPitch(curve: PitchCurve): { center: number; drift: Float32Array; mod: Float32Array };
}

type Exports = {
  memory: WebAssembly.Memory;
  pp_input(len: number): number;
  pp_output(): number;
  pp_shapes(): number;
  pp_shapes_len(): number;
  pp_notes(len: number): number;
  pp_basic_pitch_notes(sr: number, voices: number): number;
  pp_separate_window(sr: number, nNotes: number, nWanted: number): number;
  pp_split_pitch(count: number): void;
};

let compiled: Promise<WebAssembly.Module> | null = null;

/** The compiled module, fetched once a page. It can be posted to workers, which then skip the download. */
export function compilePolyPitch(url = POLYPITCH_URL): Promise<WebAssembly.Module> {
  compiled ??= (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load the listener (${res.status})`);
    return WebAssembly.compileStreaming
      ? WebAssembly.compileStreaming(res).catch(async () => WebAssembly.compile(await (await fetch(url)).arrayBuffer()))
      : WebAssembly.compile(await res.arrayBuffer());
  })();
  compiled.catch(() => (compiled = null));
  return compiled;
}

/** An instance of the module: each has its own memory, so a worker needs its own. */
export async function instantiatePolyPitch(module: WebAssembly.Module): Promise<PolyPitch> {
  const instance = await WebAssembly.instantiate(module, {});
  const w = instance.exports as unknown as Exports;

  const write = (samples: Float32Array) => {
    const ptr = w.pp_input(samples.length);
    new Float32Array(w.memory.buffer, ptr, samples.length).set(samples);
  };
  const read = (count: number, stride: number) =>
    new Float32Array(w.memory.buffer, w.pp_output(), count * stride).slice();
  const shapes = () => new Float32Array(w.memory.buffer, w.pp_shapes(), w.pp_shapes_len()).slice();
  // Each pointer is taken just before its write: an allocation can grow (and so move) memory.
  const writeNotes = (notes: NoteSpan[], wanted: number[]): [number, number] => {
    const len = 3 * notes.length + wanted.length;
    const buf = new Float64Array(w.memory.buffer, w.pp_notes(len), len);
    notes.forEach((n, i) => buf.set([n.start, n.end, n.midi], 3 * i));
    buf.set(wanted, 3 * notes.length);
    return [notes.length, wanted.length];
  };

  return {
    basicPitchNotes(samples, sampleRate, voices = false) {
      write(samples);
      const count = w.pp_basic_pitch_notes(sampleRate, voices ? 1 : 0);
      if (count < 0) throw new Error("Basic Pitch inference failed");
      const out = read(count, 5);
      const sh = shapes();
      const notes: PolyNote[] = [];
      let j = 0;
      for (let i = 0; i < out.length; i += 5) {
        const n = sh[j++];
        notes.push({
          start: out[i], end: out[i + 1], midi: out[i + 2], freq: out[i + 3], velocity: out[i + 4],
          times: sh.subarray(j, j + n), cents: sh.subarray(j + n, j + 2 * n), amp: sh.subarray(j + 2 * n, j + 3 * n),
        });
        j += 3 * n;
      }
      return notes;
    },

    separateWindow(segment, sampleRate, notes, wanted) {
      write(segment);
      const count = w.pp_separate_window(sampleRate, ...writeNotes(notes, wanted));
      if (count < 0) throw new Error("separateWindow: bad note index");
      const all = read(count, segment.length);
      const sh = shapes();
      let j = 0;
      return Array.from({ length: count }, (_, i) => {
        const n = sh[j++];
        const curve = { times: sh.subarray(j, j + n), cents: sh.subarray(j + n, j + 2 * n), weight: sh.subarray(j + 2 * n, j + 3 * n) };
        j += 3 * n;
        return { signal: all.subarray(i * segment.length, (i + 1) * segment.length), curve };
      });
    },

    splitPitch({ times, cents, weight }) {
      const n = times.length;
      const buf = new Float32Array(3 * n);
      buf.set(times);
      buf.set(cents, n);
      buf.set(weight, 2 * n);
      write(buf);
      w.pp_split_pitch(n);
      const out = read(2 * n + 1, 1);
      return { center: out[0], drift: out.subarray(1, n + 1), mod: out.subarray(n + 1) };
    },
  };
}
