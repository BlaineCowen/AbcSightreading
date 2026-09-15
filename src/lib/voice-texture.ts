import type { VoiceNote } from "./types";

/**
 * Silencing individual voices, so parts can enter one at a time or drop out
 * while the others carry on.
 *
 * The choral generator is homorhythmic: `generateRandomRhythm` returns ONE
 * rhythm and every voice sings it, so a rest in that rhythm is a rest for the
 * whole choir. Real staggered entrances would need per-voice rhythms, which
 * means rewriting `processRhythms` in build-chord-notes.ts - a single loop that
 * solves all four voices jointly at every shared step, anchored on a bass that
 * has to be sounding. That is a large change for an effect we can get here.
 *
 * Instead: keep the shared rhythm, and turn selected notes in individual voices
 * into rests. On the page the result is the same, and it is safe because
 * everything downstream already copes with voices that differ - `abc-assembly`
 * walks each voice independently and only needs the total duration to match,
 * and the non-chord-tone pass is time-based and skips rests.
 *
 * Runs on the output of `buildChordNotes`, where all four voice arrays are
 * still index-aligned, so silencing a note is just setting `rest` and leaving
 * `length` alone.
 */

/**
 * "independent" is gone - the tacet spans and mid-piece drop-outs it named are
 * not wanted. A saved preset or a shared link still carrying it falls back to
 * "full" through `isVoiceTexture`, which is the honest result.
 */
export type VoiceTexture = "full" | "staggered";

export const VOICE_TEXTURES: readonly VoiceTexture[] = ["full", "staggered"];

export function isVoiceTexture(value: unknown): value is VoiceTexture {
  return (
    typeof value === "string" &&
    (VOICE_TEXTURES as readonly string[]).includes(value)
  );
}

export type VoiceTextureOptions = {
  texture: VoiceTexture;
  measures: number;
  tsPerMeasure: number;
  /** Fewest voices that may be sounding at once. Two is a duet. */
  minSounding?: number;
};

/** A staggered entrance needs room to be heard as one. */
const MIN_MEASURES_FOR_ENTRANCES = 8;

/** Absolute start time of every position, taken from any voice (all aligned). */
function startTimes(voice: VoiceNote[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const note of voice) {
    starts.push(t);
    t += note.length;
  }
  return starts;
}

/**
 * Voice indices lowest first. `order` comes from the part definition (bass is
 * 0); mean pitch is the fallback if a caller ever omits it.
 */
function lowestFirst(voiceNotes: VoiceNote[][]): number[] {
  const indices = voiceNotes.map((_, i) => i);
  const hasOrder = voiceNotes.every((v) => typeof v[0]?.order === "number");
  if (hasOrder) {
    return indices.sort((a, b) => voiceNotes[a][0].order! - voiceNotes[b][0].order!);
  }
  const meanPitch = (v: VoiceNote[]) => {
    const pitched = v.filter((n) => !n.rest);
    if (pitched.length === 0) return 0;
    return pitched.reduce((sum, n) => sum + n.pitchValue, 0) / pitched.length;
  };
  return indices.sort((a, b) => meanPitch(voiceNotes[a]) - meanPitch(voiceNotes[b]));
}

/** How many voices are sounding at a position, optionally ignoring one. */
function soundingAt(
  voiceNotes: VoiceNote[][],
  position: number,
  ignore = -1
): number {
  let count = 0;
  for (let v = 0; v < voiceNotes.length; v++) {
    if (v === ignore) continue;
    if (!voiceNotes[v][position]?.rest) count++;
  }
  return count;
}

/**
 * Silence a voice across the given positions, if doing so breaks no rule.
 * Returns whether it happened, so a bad roll costs nothing.
 *
 * `allowSolo` exists for the opening entrance, which is the one place the
 * texture is *meant* to thin below a duet - a staggered entrance begins with a
 * single voice, by definition.
 *
 * Two of the guards below are unreachable from the only caller there is now,
 * and are kept deliberately rather than left looking tested. The entrance never
 * spans more than a quarter of the exercise, so it cannot touch the last
 * measure and cannot silence a voice for the whole of it; mutate either and no
 * test fails. They are here because this is a general helper and the tacet
 * spans that used to need them may come back. The cadence guard IS reachable -
 * a cadence can fall inside the entrance window - and is tested.
 */
function trySilence(
  voiceNotes: VoiceNote[][],
  voice: number,
  positions: number[],
  lastMeasureFrom: number,
  starts: number[],
  minSounding: number,
  allowSolo: boolean
): boolean {
  if (positions.length === 0) return false;

  for (const p of positions) {
    const note = voiceNotes[voice][p];
    if (!note) return false;
    // A cadence is an arrival - every part has to be there for it.
    if (note.isCadenceEnd) return false;
    // Always finish in full texture.
    if (starts[p] >= lastMeasureFrom) return false;
    if (!allowSolo && soundingAt(voiceNotes, p, voice) < minSounding) return false;
  }

  // Never silence a voice for the whole exercise.
  const wouldStillSing = voiceNotes[voice].some(
    (note, i) => !note.rest && !positions.includes(i)
  );
  if (!wouldStillSing) return false;

  for (const p of positions) {
    voiceNotes[voice][p] = { ...voiceNotes[voice][p], rest: true };
  }
  return true;
}

/** Positions whose start time falls in [fromMeasure, toMeasure). */
function positionsInMeasures(
  starts: number[],
  tsPerMeasure: number,
  fromMeasure: number,
  toMeasure: number
): number[] {
  const from = fromMeasure * tsPerMeasure;
  const to = toMeasure * tsPerMeasure;
  const out: number[] = [];
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] >= from && starts[i] < to) out.push(i);
  }
  return out;
}

export function applyVoiceTexture(
  voiceNotes: VoiceNote[][],
  opts: VoiceTextureOptions
): VoiceNote[][] {
  const { texture, measures, tsPerMeasure } = opts;
  const minSounding = opts.minSounding ?? 2;

  // Nothing to thin: with only minSounding voices, silencing any of them would
  // breach the floor immediately.
  if (texture === "full" || voiceNotes.length <= minSounding) return voiceNotes;
  if (voiceNotes.some((v) => v.length === 0)) return voiceNotes;

  const out = voiceNotes.map((v) => v.map((n) => ({ ...n })));
  const starts = startTimes(out[0]);
  const lastMeasureFrom = (measures - 1) * tsPerMeasure;
  const order = lowestFirst(out);

  // --- Staggered entrance: parts join one at a time, lowest first. ---
  //
  // This is the whole of the "staggered" texture, and it comes with a cost that
  // is the point of the setting rather than a defect in it: the exercise does
  // not begin with the full tonic chord, because the parts are not all there
  // yet. That is why it was pulled out of the old "independent" texture, where
  // it applied whether or not anyone had asked for it - a singer whose part
  // rests through the opening reads it as a pickup and waits for a beat that
  // never comes, and nobody had chosen that.
  //
  // Chosen deliberately and named for what it does, it is a legitimate texture.
  // Anyone who wants every part on the downbeat has "full", which is the
  // default.
  if (measures >= MIN_MEASURES_FOR_ENTRANCES) {
    const latest = Math.min(out.length - 1, Math.floor(measures / 4));
    for (let rank = 1; rank < order.length; rank++) {
      const entersAt = Math.min(rank, latest);
      if (entersAt <= 0) continue;
      trySilence(
        out,
        order[rank],
        positionsInMeasures(starts, tsPerMeasure, 0, entersAt),
        lastMeasureFrom,
        starts,
        minSounding,
        true // the opening is allowed to be a solo
      );
    }
  }

  return out;
}

/**
 * Re-notates a run of rest lasting `total`, starting `offset` into its measure.
 *
 * Adding the lengths up is not enough: a rest covering beats 1-3 of 4/4 would
 * come out as a single dotted-half rest, where the convention is a half rest
 * then a quarter. Each piece is instead the longest value that both fits and
 * starts on a boundary it is allowed to start on, which is what makes a rest
 * legible at a glance.
 *
 * A rest filling the whole measure stays whole, in any meter.
 */
function splitRestRun(
  offset: number,
  total: number,
  tsPerMeasure: number
): number[] {
  const pieces: number[] = [];
  let at = offset;
  let remaining = total;

  if (at === 0 && remaining >= tsPerMeasure) {
    pieces.push(tsPerMeasure);
    at += tsPerMeasure;
    remaining -= tsPerMeasure;
  }

  // half, quarter, eighth, sixteenth, thirty-second - in 32nd-note units
  const values = [16, 8, 4, 2, 1];
  while (remaining > 0) {
    const fits = values.find((v) => v <= remaining && at % v === 0);
    const use = fits ?? remaining;
    pieces.push(use);
    at += use;
    remaining -= use;
  }
  return pieces;
}

/**
 * Adjacent rests inside one measure are re-notated as the fewest, most legible
 * rests that cover the same span.
 *
 * A silenced measure otherwise comes out as `z8 z8 z8 z8` where a whole-measure
 * rest belongs. Merging stops at the barline because `assembleAbcString` places
 * barlines by accumulating note lengths - a rest spanning one would put every
 * later barline in the wrong place.
 *
 * Also tidies the block rests that come from the shared rhythm, which today
 * emit two quarter rests rather than one half rest.
 */
export function mergeRestsWithinMeasures(
  voice: VoiceNote[],
  tsPerMeasure: number
): VoiceNote[] {
  const merged: VoiceNote[] = [];
  let t = 0;
  let i = 0;

  while (i < voice.length) {
    const note = voice[i];
    // A rest carrying a chord symbol is left alone, exactly as a cadence note
    // is. Merging spreads only the *first* rest of a run, so a top voice resting
    // through a bar would collapse four symbols into one and the row would thin
    // out wherever the texture did.
    if (!note.rest || note.isCadenceEnd || note.chordSymbol) {
      merged.push({ ...note });
      t += note.length;
      i++;
      continue;
    }

    // Gather the run of rests that stays inside this measure.
    const measureEnd = (Math.floor(t / tsPerMeasure) + 1) * tsPerMeasure;
    let total = 0;
    let j = i;
    while (
      j < voice.length &&
      voice[j].rest &&
      !voice[j].isCadenceEnd &&
      !voice[j].chordSymbol &&
      t + total + voice[j].length <= measureEnd
    ) {
      total += voice[j].length;
      j++;
    }

    // A single rest longer than the measure it starts in cannot be regrouped.
    // Emitting it verbatim also guarantees the loop always advances.
    if (total === 0) {
      merged.push({ ...note });
      t += note.length;
      i++;
      continue;
    }

    for (const length of splitRestRun(t % tsPerMeasure, total, tsPerMeasure)) {
      merged.push({ ...note, length, rest: true });
    }
    t += total;
    i = j;
  }

  return merged;
}
