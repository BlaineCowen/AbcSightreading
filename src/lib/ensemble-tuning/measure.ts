import type { NoteSpan, PolyPitch } from "./polypitch";
import { harmonicPitch } from "./harmonic-pitch";
import { curveTracks, heldPitch, type NoteCurve } from "./tuning";

/**
 * One separation window measured: every member note pulled out of the mix
 * (OmniPitch's score-informed separation, which models every note in the
 * crop), its pitch curve split into centre, drift and modulation, and the
 * pitch it holds. Runs in a worker (separate.worker.ts) or, without one, on
 * the page.
 */

export interface WindowJob {
  /** The crop: the take's samples from `a` to `b` seconds. */
  segment: Float32Array;
  sampleRate: number;
  /** Seconds of the crop's first sample in the take. */
  a: number;
  /** Every note in the crop, times from the crop's start. */
  local: NoteSpan[];
  /** For each note to measure: its index in `local` and in the take's list. */
  members: [number, number][];
}

export interface MeasuredWindowNote {
  /** Index in the take's note list. */
  j: number;
  /** The held pitch, in cents from the written note at A440; null if the curve was empty. */
  held: number | null;
  /** The same from the mix's own harmonics, where the note has some no other note covers; else null. */
  harmonic: number | null;
  curve: NoteCurve | null;
  /** The note alone, from `from` seconds in the take: its own span, a little before and its ring after. */
  from: number;
  signal: Float32Array;
}

/** Kept of a note's separated sound before its start and after its end, in seconds. */
const LEAD = 0.05, RING = 0.3;

/** A separation window's job from the take: its crop and every note sounding in it. */
export function windowJob(
  samples: Float32Array,
  sampleRate: number,
  notes: NoteSpan[],
  w: { a: number; b: number; members: number[] }
): WindowJob {
  const ia = Math.floor(w.a * sampleRate);
  const ib = Math.min(samples.length, Math.floor(w.b * sampleRate));
  const inside = notes.map((_, i) => i).filter((i) => notes[i].start < w.b && notes[i].end > w.a);
  return {
    segment: samples.slice(ia, ib),
    sampleRate,
    a: ia / sampleRate,
    local: inside.map((i) => ({ start: notes[i].start - w.a, end: notes[i].end - w.a, midi: notes[i].midi })),
    members: w.members.map((j) => [inside.indexOf(j), j] as [number, number]),
  };
}

export function measureWindow(pp: PolyPitch, job: WindowJob): MeasuredWindowNote[] {
  const { segment, sampleRate: sr, a, local, members } = job;
  const parts = pp.separateWindow(segment, sr, local, members.map(([k]) => k));
  return parts.map(({ signal, curve }, i) => {
    const [k, j] = members[i];
    const n = local[k];
    const s0 = Math.max(0, Math.floor((n.start - LEAD) * sr));
    const s1 = Math.min(signal.length, Math.ceil((n.end + RING) * sr));
    const own = signal.slice(s0, Math.max(s0, s1));
    let measured: NoteCurve | null = null;
    let held: number | null = null;
    if (curve.times.length >= 3) {
      const { center, drift, mod } = pp.splitPitch(curve);
      // Cut to where the note is audible, as OmniPitch's /api/curve.
      let top = 0;
      for (const v of curve.weight) top = Math.max(top, v);
      let lo = 0, hi = 0;
      for (let q = 0; q < curve.times.length; q++) if (curve.weight[q] > top * 0.03) { if (hi === 0) lo = q; hi = q + 1; }
      if (hi - lo >= 3 && Number.isFinite(center)) {
        const d = drift.slice(lo, hi), m = mod.slice(lo, hi);
        measured = {
          t0: a + curve.times[lo],
          dt: curve.times[1] - curve.times[0],
          center,
          drift: d,
          mod: m,
          // Drawn as its slow course, so only a slip in that hides it.
          drawn: curveTracks(d, new Float32Array(d.length)),
        };
        held = heldPitch(measured);
      }
    }
    const hz = 440 * 2 ** ((n.midi - 69) / 12);
    const sounding = local.map((o, q) => ({
      start: o.start,
      end: o.end,
      // Its own: near the written note (a separation that slipped to a neighbour must not move the search).
      freq: q === k ? hz * 2 ** (Math.max(-45, Math.min(45, held ?? 0)) / 1200) : 440 * 2 ** ((o.midi - 69) / 12),
    }));
    const harmonic = harmonicPitch(segment, sr, sounding, k, hz)?.cents ?? null;
    return { j, held, harmonic, curve: measured, from: a + s0 / sr, signal: own };
  });
}
