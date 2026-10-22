// Minimal loader for polypitch.wasm (no wasm-bindgen needed).
export async function loadPolyPitch(url = "polypitch.wasm") {
  const { instance } = await WebAssembly.instantiateStreaming(fetch(url), {});
  const w = instance.exports;

  const write = (samples) => {
    const ptr = w.pp_input(samples.length);
    new Float32Array(w.memory.buffer, ptr, samples.length).set(samples);
  };
  const read = (count, stride) => new Float32Array(w.memory.buffer, w.pp_output(), count * stride).slice();

  // Separation input: the segment into the f32 buffer, notes then wanted indices into the f64 one (times keep
  // their precision). Each pointer is taken just before its write: an allocation can grow memory.
  const writeNotes = (segment, notes, wanted) => {
    write(segment);
    return writeNoteList(notes, wanted);
  };
  const writeNoteList = (notes, wanted) => {
    const ptr = w.pp_notes(3 * notes.length + wanted.length);
    const buf = new Float64Array(w.memory.buffer, ptr, 3 * notes.length + wanted.length);
    notes.forEach((n, i) => buf.set(Array.isArray(n) ? n.slice(0, 3) : [n.start, n.end, n.midi], 3 * i));
    buf.set(wanted, 3 * notes.length);
    return [notes.length, wanted.length];
  };
  const readSignals = (count, len) => {
    const out = read(count, len);
    return Array.from({ length: count }, (_, i) => out.subarray(i * len, (i + 1) * len));
  };

  // Notes, each with its shape: per-frame times (s), cents off `midi`, and loudness (0..1).
  const toNotes = (out) => {
    const notes = [];
    const shapes = new Float32Array(w.memory.buffer, w.pp_shapes(), w.pp_shapes_len()).slice();
    let j = 0;
    for (let i = 0; i < out.length; i += 5) {
      const n = shapes[j++];
      const times = shapes.subarray(j, j + n), cents = shapes.subarray(j + n, j + 2 * n), amp = shapes.subarray(j + 2 * n, j + 3 * n);
      j += 3 * n;
      notes.push({ start: out[i], end: out[i + 1], midi: out[i + 2], freq: out[i + 3], velocity: out[i + 4], times, cents, amp });
    }
    return notes;
  };

  return {
    frameSize: (sampleRate) => w.pp_frame_size(sampleRate),
    hopSize: (sampleRate) => w.pp_hop_size(sampleRate),

    /** Whole-signal transcription with the DSP detector. samples: mono Float32Array. */
    detectNotes(samples, sampleRate) {
      write(samples);
      return toNotes(read(w.pp_detect_notes(sampleRate), 5));
    },

    /** Whole-signal transcription with the Basic Pitch neural model (any sample rate); voices: settings for singing. */
    basicPitchNotes(samples, sampleRate, voices = false) {
      write(samples);
      const count = w.pp_basic_pitch_notes(sampleRate, voices ? 1 : 0);
      if (count < 0) throw new Error("Basic Pitch inference failed");
      return toNotes(read(count, 5));
    },

    /**
     * Score-informed separation (tools/note_edit.py `separate`). segment: mono Float32Array (a mix, or a crop of
     * one); notes: [{start, end, midi}] or [start, end, midi], times in s from the segment's start, every note in
     * it; wanted: indices into notes. Returns one Float32Array per wanted note, the segment's length.
     */
    separate(segment, sampleRate, notes, wanted, profile = false) {
      const count = w.pp_separate(sampleRate, ...writeNotes(segment, notes, wanted), profile ? 1 : 0);
      if (count < 0) throw new Error("separate: bad note index");
      return readSignals(count, segment.length);
    },

    /**
     * One fit separating the notes `wanted` from a window (note_edit.py `separate_window`), as `separate`
     * without profiles, each with its pitch curve: [{signal, curve: {times, cents, weight}}].
     */
    separateWindow(segment, sampleRate, notes, wanted) {
      const count = w.pp_separate_window(sampleRate, ...writeNotes(segment, notes, wanted));
      if (count < 0) throw new Error("separateWindow: bad note index");
      const signals = readSignals(count, segment.length);
      const shapes = new Float32Array(w.memory.buffer, w.pp_shapes(), w.pp_shapes_len()).slice();
      let j = 0;
      return signals.map((signal) => {
        const n = shapes[j++];
        const curve = { times: shapes.subarray(j, j + n), cents: shapes.subarray(j + n, j + 2 * n), weight: shapes.subarray(j + 2 * n, j + 3 * n) };
        j += 3 * n;
        return { signal, curve };
      });
    },

    /** Pitch curve of a separated note written at f0 Hz: {times (s), cents from f0, weight (loudness)}. */
    pitchCurve(signal, sampleRate, f0) {
      write(signal);
      const n = w.pp_pitch_curve(sampleRate, f0);
      const out = read(n, 3);
      return { times: out.subarray(0, n), cents: out.subarray(n, 2 * n), weight: out.subarray(2 * n) };
    },

    /** A pitch curve split into center (cents), drift (slow) and mod (vibrato, wobble), per frame. */
    splitPitch({ times, cents, weight }) {
      const n = times.length, buf = new Float32Array(3 * n);
      buf.set(times); buf.set(cents, n); buf.set(weight, 2 * n);
      write(buf);
      w.pp_split_pitch(n);
      const out = read(2 * n + 1, 1);
      return { center: out[0], drift: out.subarray(1, n + 1), mod: out.subarray(n + 1) };
    },

    /**
     * Note editing in the browser (the wasm built with the `vocoder` feature; null otherwise): the recording stays
     * in wasm, with every note's separation cached by its crop, as tools/edit_server.py does. notes: the whole
     * note list ({start, end, midi} or [start, end, midi], s from the recording's start), passed on every call.
     *   prepare(notes, js)   separate notes js (shared ~6 s windows) ahead of editing
     *   solo(notes, j)       {start (sample), signal, curve: {times (s), cents, weight}}: note j alone
     *   delta(notes, j, {semis, mod, drift, dt, gain})   {start, signal}: the change to the recording for that edit
     * Only one session at a time: starting one drops the last.
     */
    session(samples, sampleRate) {
      if (!w.pp_session_load) return null;
      write(samples);
      w.pp_session_load(sampleRate);
      const out = (start, what) => {
        if (start < 0) throw new Error(`${what}: no session or bad note index`);
        return { start, signal: read(w.pp_output_len(), 1) };
      };
      return {
        prepare(notes, js) {
          if (w.pp_session_prepare(...writeNoteList(notes, js)) < 0) throw new Error("prepare: bad note index");
        },
        solo(notes, j) {
          const r = out(w.pp_session_solo(writeNoteList(notes, [j])[0]), "solo");
          const sh = new Float32Array(w.memory.buffer, w.pp_shapes(), w.pp_shapes_len()).slice(), n = sh[0];
          r.curve = { times: sh.subarray(1, n + 1), cents: sh.subarray(n + 1, 2 * n + 1), weight: sh.subarray(2 * n + 1) };
          return r;
        },
        delta(notes, j, { semis = 0, mod = 1, drift = 1, dt = 0, gain = 1 } = {}) {
          return out(w.pp_session_delta(writeNoteList(notes, [j])[0], semis, mod, drift, dt, gain), "delta");
        },
      };
    },

    /** Real-time: one frame of frameSize(sampleRate) samples -> pitches sounding now. */
    detectFrame(frame, sampleRate) {
      write(frame);
      const out = read(w.pp_detect_frame(sampleRate), 4);
      const pitches = [];
      for (let i = 0; i < out.length; i += 4) {
        pitches.push({ freq: out[i], midi: out[i + 1], salience: out[i + 2], confident: out[i + 3] > 0 });
      }
      return pitches;
    },
  };
}
