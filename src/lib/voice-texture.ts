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
 * "staggered" is deliberately absent: it named the opening entrance and
 * nothing else, so with that held back it would be a setting that does
 * nothing. A saved preset or a shared link still carrying it falls back to
 * "full" through `isVoiceTexture`, which is the honest result - the exercise
 * it describes cannot be made at the moment.
 */
export type VoiceTexture = "full" | "independent";

export const VOICE_TEXTURES: readonly VoiceTexture[] = ["full", "independent"];

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

/**
 * A part dropping out mid-piece only reads as scoring on a long enough
 * exercise. On a short one it reads as a mistake, so both the tacet spans and
 * the single-note drop-outs are gated on this - a short exercise gets the
 * entrance and nothing else.
 */
const MIN_MEASURES_FOR_TACET = 12;
const MAX_TACET_MEASURES = 4;
const CHANCE_OF_SECOND_TACET = 0.35;
const CHANCE_OF_SHORT_DROPOUT = 0.15;

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
 * `allowSolo` let the opening entrance thin below a duet, since a staggered
 * entrance begins with a single voice by definition. Nothing passes it now that
 * the entrance is held back, but it stays for when that work is done properly.
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

  // The staggered entrance is gone for now, and with it the "staggered"
  // texture it was the whole of.
  //
  // Parts joining one at a time means the exercise does not begin with the
  // tonic chord - it begins with one voice, and a singer looking at a page
  // where their part rests through the first bars reads that as a pickup and
  // waits for a beat that never comes. On a sight-reading exercise the opening
  // sonority is the one thing that should not be ambiguous: it is what tells
  // the choir where home is. Held out until the texture work is done properly,
  // which needs per-voice rhythms rather than notes silenced after the fact.
  //
  // Everything else here stands: tacet spans and drop-outs happen inside the
  // exercise, after the opening has done its job.

  if (texture !== "independent") return out;

  // --- Tacet spans: a part sits out for one to four measures. ---
  if (measures >= MIN_MEASURES_FOR_TACET) {
    const maxSpan = Math.max(1, Math.min(MAX_TACET_MEASURES, Math.floor(measures / 4)));
    const spans = Math.random() < CHANCE_OF_SECOND_TACET ? 2 : 1;
    for (let n = 0; n < spans; n++) {
      const span = 1 + Math.floor(Math.random() * maxSpan);
      // Not the opening and not the last measure, so entrances and the ending
      // both stay intact.
      const latestStart = measures - 1 - span;
      if (latestStart < 1) continue;
      const from = 1 + Math.floor(Math.random() * latestStart);
      const voice = order[Math.floor(Math.random() * order.length)];
      trySilence(
        out,
        voice,
        positionsInMeasures(starts, tsPerMeasure, from, from + span),
        lastMeasureFrom,
        starts,
        minSounding,
        false
      );
    }
  }

  // --- Short drop-outs: a single note, kept rare. ---
  if (measures >= MIN_MEASURES_FOR_TACET && Math.random() < CHANCE_OF_SHORT_DROPOUT) {
    const voice = order[Math.floor(Math.random() * order.length)];
    // Never the first measure. Picking freely could land on position 0, which
    // silences a voice on the downbeat - the same opening rest the staggered
    // entrance was held back for, arriving by another route. The tacet spans
    // above already start at measure 1; this had no such guard, so it happened
    // rarely enough to look like a flaky test rather than a bug.
    const eligible: number[] = [];
    for (let i = 0; i < out[voice].length; i++) {
      if (starts[i] >= tsPerMeasure) eligible.push(i);
    }
    if (eligible.length > 0) {
      const position = eligible[Math.floor(Math.random() * eligible.length)];
      trySilence(out, voice, [position], lastMeasureFrom, starts, minSounding, false);
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
