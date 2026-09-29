/**
 * One voice's rhythm, adjusted after the parts are written. Tested in
 * tests/unit/voice-rhythm.test.ts.
 *
 * Every part is written to one shared rhythm, so until now a dotted quarter
 * and eighth was sung by all four parts at once or by none. A dotted quarter
 * and an eighth take exactly the time of two quarters, so one voice can trade
 * one figure for the other without changing a pitch or touching another part:
 *
 * - Repair: where a voice's dotted quarter and eighth breaks "eighths move by
 *   step" (the bass leaping off its eighth, which the builder allows as a last
 *   resort), that voice sings two quarters instead. The leap then comes off a
 *   quarter.
 * - Variety: where the level allows the dotted figure, one voice now and then
 *   sings it against quarters in the others, the way choral music usually
 *   does. Only where its eighth moves by step, so it never breaks the rule.
 *
 * Both only happen inside one chord: moving a note's start across a chord
 * change would sound it against the wrong harmony.
 */
import type { Rhythm, VoiceNote } from "./types";

const QUARTER = 8;
const EIGHTH = 4;
const DOTTED_QUARTER = 12;

/** The times (in 32nds from the start) at which a new chord begins. */
export function chordOnsets(
  rhythms: Pick<Rhythm, "totalValue" | "rest"> & { isPatternNote?: boolean; isPatternStart?: boolean }[] | any[]
): Set<number> {
  const onsets = new Set<number>();
  let t = 0;
  for (const r of rhythms as { totalValue: number; rest?: boolean; isPatternNote?: boolean; isPatternStart?: boolean }[]) {
    if (!r.rest && (!r.isPatternNote || r.isPatternStart)) onsets.add(t);
    t += r.totalValue;
  }
  return onsets;
}

export type VoiceRhythmOptions = {
  onsets: Set<number>;
  tsPerMeasure: number;
  /** Repair dotted figures whose eighth leaps. */
  stepwiseEighths: boolean;
  /** The level allows a dotted quarter and eighth, so one part may take it. */
  dottedAllowed: boolean;
  /** Chance that a place one part could take the dotted figure gets it. */
  probability?: number;
  random?: () => number;
};

const byStep = (a: VoiceNote, b: VoiceNote) => Math.abs(a.pitchValue - b.pitchValue) <= 1;

/** The note after index i that is sung, or null if a rest (or nothing) comes first. */
const nextSung = (v: VoiceNote[], i: number) => {
  const c = v[i + 1];
  return c && !c.rest ? c : null;
};

/** No chord begins strictly inside (t, t + span). */
const oneChord = (onsets: Set<number>, t: number, span: number) => {
  for (const o of onsets) if (o > t && o < t + span) return false;
  return true;
};

export function varyVoiceRhythms(voices: VoiceNote[][], opts: VoiceRhythmOptions): VoiceNote[][] {
  const random = opts.random ?? Math.random;
  const probability = opts.probability ?? 0;
  const out = voices.map((v) => v.map((note) => ({ ...note })));

  // Where each note starts.
  const starts = out.map((v) => {
    let t = 0;
    return v.map((note) => {
      const at = t;
      t += note.length;
      return at;
    });
  });

  // Repair: a dotted quarter and eighth whose eighth leaps becomes two quarters.
  if (opts.stepwiseEighths) {
    out.forEach((v, vi) => {
      for (let i = 0; i + 1 < v.length; i++) {
        const a = v[i];
        const b = v[i + 1];
        const t = starts[vi][i];
        if (a.rest || b.rest || a.length !== DOTTED_QUARTER || b.length !== EIGHTH) continue;
        if (t % QUARTER !== 0 || !oneChord(opts.onsets, t, DOTTED_QUARTER + EIGHTH)) continue;
        // A decoration stays where it is: brought onto the beat, a passing
        // tone would become an accented dissonance.
        if (b.ornament && b.pitchValue !== a.pitchValue) continue;
        const c = nextSung(v, i + 1);
        const leaps = !byStep(a, b) || (c !== null && !byStep(b, c));
        if (!leaps) continue;
        a.length = QUARTER;
        b.length = QUARTER;
        starts[vi][i + 1] = t + QUARTER;
      }
    });
  }

  // Variety: one voice at a time takes the dotted figure against quarters.
  if (opts.dottedAllowed && probability > 0) {
    const places = new Map<number, { vi: number; i: number }[]>();
    out.forEach((v, vi) => {
      for (let i = 0; i + 1 < v.length; i++) {
        const a = v[i];
        const b = v[i + 1];
        const t = starts[vi][i];
        if (a.rest || b.rest || a.length !== QUARTER || b.length !== QUARTER) continue;
        if (a.isCadenceEnd || b.isCadenceEnd) continue;
        if (t % QUARTER !== 0 || (t % opts.tsPerMeasure) + 2 * QUARTER > opts.tsPerMeasure) continue;
        if (!oneChord(opts.onsets, t, 2 * QUARTER)) continue;
        const c = nextSung(v, i + 1);
        if (!byStep(a, b) || (c !== null && !byStep(b, c))) continue;
        if (!places.has(t)) places.set(t, []);
        places.get(t)!.push({ vi, i });
      }
    });
    // A note already given the figure cannot open or close another one.
    const taken = out.map(() => new Set<number>());
    for (const [, all] of [...places].sort((x, y) => x[0] - y[0])) {
      const candidates = all.filter(({ vi, i }) => !taken[vi].has(i) && !taken[vi].has(i + 1));
      if (!candidates.length || random() >= probability) continue;
      const { vi, i } = candidates[Math.floor(random() * candidates.length) % candidates.length];
      out[vi][i].length = DOTTED_QUARTER;
      out[vi][i + 1].length = EIGHTH;
      taken[vi].add(i).add(i + 1);
    }
  }

  return out;
}
