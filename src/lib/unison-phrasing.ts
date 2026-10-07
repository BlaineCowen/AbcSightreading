/**
 * How a unison line in exact-skips mode (the NYSSMA Voice levels, the Custom
 * skips panel) is shaped: where it rests, how hard it reaches for the skips
 * it lists, and how it avoids see-sawing between two neighbours.
 *
 * Max skip mode never calls any of this - its output is pinned byte for byte
 * (unison-skip-regression.test.ts, meter-regression.test.ts).
 *
 * Measured with scripts/measure-nyssma-music.ts (treble, every key x meter of
 * each level). Before, at Level IV: a listed skip in 35% of exercises, 41% of
 * moves going back to the note two before (A-B-A), and 83% of rests in the
 * middle of a phrase - "do ti do ti do ti do z ti- do ti z do".
 */
import type { Rhythm } from "../resources/rhythms";
import type { RhythmWithPattern } from "./types";
import { isAllowedMove, type SkipNote, type SkipPolicy } from "./skip-policy";

// ---------------------------------------------------------------------------
// Rests only at breaths
// ---------------------------------------------------------------------------

/**
 * How often a line whose rhythms allow a rest, and that drew none at a
 * breath, gets one placed there. Not always, so the exercises do not all
 * pause in the same place.
 */
export const BREATH_REST_CHANCE = 0.7;

/**
 * Where a rest may end, in 32nds from the start: the end of every even bar
 * but the last - bars 2, 4 and 6 of 8, the ends of the phrases and
 * half-phrases. A breath is taken there, not in the middle of a thought.
 */
export function breathEnds(tsPerMeasure: number, measures: number): number[] {
  const out: number[] = [];
  for (let bar = 2; bar < measures; bar += 2) out.push(bar * tsPerMeasure);
  return out;
}

const plain = (r: RhythmWithPattern) => ({
  ...r,
  isPatternNote: false,
  isPatternStart: false,
  isPatternEnd: false,
  patternIndex: null,
});

/** A selected figure, as the rhythm generator lays it out: one entry per note. */
function laidOut(figure: Rhythm): RhythmWithPattern[] {
  if (!figure.pattern) return [plain(figure as RhythmWithPattern)];
  const firstSung = Math.max(0, figure.abcValue.findIndex((v) => !String(v).startsWith("z")));
  return figure.abcValue.map((abc, i) => {
    const value = parseInt(String(abc).replace(/^z/, ""), 10);
    return {
      ...figure,
      abcValue: [abc],
      totalValue: value,
      singleNoteValue: value,
      meterValue: [figure.meterValue[i]],
      isPatternNote: true,
      isPatternStart: i === firstSung,
      isPatternEnd: i === figure.abcValue.length - 1,
      patternIndex: i,
      pattern: true,
      rest: String(abc).startsWith("z"),
    } as RhythmWithPattern;
  });
}

/**
 * The sung figure that takes a rest's place: the note of the same name
 * (quarterRest -> quarter) when it is selected, otherwise any selected
 * figure of the same length that sings every note. Null when there is none,
 * and the rest stays.
 */
export function sungFigureFor(rest: Rhythm, selected: readonly Rhythm[]): Rhythm | null {
  const sungThrough = (r: Rhythm) => !r.rest && r.abcValue.every((v) => !String(v).startsWith("z"));
  const same = selected.filter((r) => sungThrough(r) && r.totalValue === rest.totalValue && (r.meterKind ?? "simple") === (rest.meterKind ?? "simple"));
  const named = same.find((r) => r.name === rest.name.replace(/Rest$/, ""));
  return named ?? same.find((r) => !r.pattern) ?? same[0] ?? null;
}

/**
 * A rest that stands as a figure of its own (not one inside a figure like
 * eighth rest + eighth, which is the teacher's chosen figure and stays).
 */
const isFigureRest = (r: RhythmWithPattern) => r.rest === true && !r.isPatternNote;

/**
 * Rests only at breaths. A rest figure that does not end at a breath
 * becomes the sung figure of its length; and when the selection has a rest
 * and none ended at a breath, one goes in at the middle of the exercise (the
 * end of bar 4 of 8), in place of the plain note that ends that bar, with
 * BREATH_REST_CHANCE. Never touches the cadence note or the final note, and
 * never moves a note off the beat: every replacement is the same length in
 * the same place. Returns a new array.
 */
export function restsToBreaths(
  rhythms: readonly RhythmWithPattern[],
  opts: { tsPerMeasure: number; measures: number; selected: readonly Rhythm[]; random?: () => number }
): RhythmWithPattern[] {
  const random = opts.random ?? Math.random;
  const ends = new Set(breathEnds(opts.tsPerMeasure, opts.measures));
  const out: RhythmWithPattern[] = [];
  let at = 0;
  let restAtBreath = false;
  for (const r of rhythms) {
    const end = at + r.totalValue;
    if (isFigureRest(r)) {
      if (ends.has(end)) restAtBreath = true;
      else {
        const sung = sungFigureFor(r, opts.selected);
        if (sung) {
          out.push(...laidOut(sung).map((n) => ({ ...n, isPhraseBreath: false })));
          at = end;
          continue;
        }
      }
    }
    out.push(r);
    at = end;
  }

  const restFigures = opts.selected.filter((r) => r.rest && !r.pattern);
  if (restAtBreath || restFigures.length === 0 || ends.size === 0) return out;
  if (random() >= BREATH_REST_CHANCE) return out;

  // The breath nearest the middle first (bar 4 of 8), then the others.
  const middle = (opts.measures / 2) * opts.tsPerMeasure;
  const order = [...ends].sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
  const starts: number[] = [];
  at = 0;
  for (const r of out) {
    starts.push(at);
    at += r.totalValue;
  }
  for (const end of order) {
    const k = out.findIndex((r, j) => starts[j] + r.totalValue === end);
    if (k <= 0 || k >= out.length - 1) continue;
    const r = out[k];
    const barStart = end - opts.tsPerMeasure;
    if (r.rest || r.isPatternNote || r.isCadenceEnd || starts[k] < barStart) continue;
    const rest = restFigures.find((f) => f.totalValue === r.totalValue);
    if (!rest) continue;
    out[k] = { ...plain(rest as RhythmWithPattern), isPhraseBreath: true };
    return out;
  }
  return out;
}

// ---------------------------------------------------------------------------
// No long runs of eighths
// ---------------------------------------------------------------------------

/**
 * The most eighth notes sung in a row: two ti-tis. Measured before (every key
 * x meter, 40 runs each), more than four came in 36% of Level III exercises,
 * 38% of IV and 48% of V, up to fourteen in a row - a bar and a half of
 * eighths, which a sight-reading line does not do.
 */
export const MAX_EIGHTH_RUN = 4;

/** Is this entry a sung eighth (or anything shorter)? */
const sungShort = (r: RhythmWithPattern) => r.rest !== true && r.totalValue <= 4;

/** The rhythm as figures: a pattern's notes together, anything else alone. */
function figuresOf(rhythms: readonly RhythmWithPattern[]): RhythmWithPattern[][] {
  const out: RhythmWithPattern[][] = [];
  for (const r of rhythms) {
    const last = out[out.length - 1];
    const continues =
      r.isPatternNote && (r.patternIndex ?? 0) > 0 && last && last[0].isPatternNote && last[0].name === r.name;
    if (continues) last.push(r);
    else out.push([r]);
  }
  return out;
}

/**
 * A figure that ends a run of eighths: a selected figure of the same length
 * and meter with no eighth in it and no rest (ti-ti -> ta, ta-(i) ti -> a
 * half), preferring a single note. Null when the selection has none.
 */
function figureWithoutEighths(length: number, meterKind: string, selected: readonly Rhythm[]): Rhythm | null {
  const fits = selected.filter(
    (r) =>
      !r.rest &&
      r.totalValue === length &&
      (r.meterKind ?? "simple") === meterKind &&
      r.abcValue.every((v) => !String(v).startsWith("z") && parseInt(String(v), 10) > 4)
  );
  return fits.find((r) => !r.pattern) ?? fits[0] ?? null;
}

/**
 * At most MAX_EIGHTH_RUN eighths sung in a row. Walking the figures, one that
 * would carry a run past the limit becomes a figure of the same length with
 * no eighths, so every later note keeps its place on the beat. A figure is
 * left alone when the selection offers nothing to put there, or when it
 * closes a cadence. Returns a new array.
 */
export function capEighthRuns(
  rhythms: readonly RhythmWithPattern[],
  opts: { selected: readonly Rhythm[]; maxRun?: number }
): RhythmWithPattern[] {
  const maxRun = opts.maxRun ?? MAX_EIGHTH_RUN;
  const out: RhythmWithPattern[] = [];
  let run = 0;
  for (const figure of figuresOf(rhythms)) {
    let after = run;
    let tooLong = false;
    for (const n of figure) {
      after = sungShort(n) ? after + 1 : 0;
      if (after > maxRun) tooLong = true;
    }
    const length = figure.reduce((a, n) => a + n.totalValue, 0);
    const swap =
      tooLong && !figure.some((n) => n.isCadenceEnd)
        ? figureWithoutEighths(length, figure[0].meterKind ?? "simple", opts.selected)
        : null;
    if (swap) {
      const notes = laidOut(swap);
      const last = figure[figure.length - 1];
      notes[notes.length - 1] = { ...notes[notes.length - 1], isPhraseBreath: last.isPhraseBreath };
      out.push(...notes);
      run = 0;
    } else {
      out.push(...figure);
      run = after;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Skips and line shape
// ---------------------------------------------------------------------------

/**
 * How much more a note reached by a listed skip is wanted than one reached
 * by step: FIRST_SKIP_PREFERENCE until the line has sung one, so every
 * exercise does, then SKIP_PREFERENCE until it has sung SKIPS_PER_8_BARS
 * (scaled to its length), then SKIP_SATED - so a level with many skips
 * listed (V) is not all skips, and the line stays mostly stepwise.
 */
export const FIRST_SKIP_PREFERENCE = 12;
export const SKIP_PREFERENCE = 20;
export const SKIPS_PER_8_BARS = 3;
/** ...and past that, a skip is a little less wanted than a step: Level V lists six skips. */
export const SKIP_SATED = 0.5;
/**
 * A note a listed skip can start from onto the next note's length - do or
 * mi for Do-Mi-Sol ↑ - before the first skip and until the line has its
 * skips. Skips are only as frequent as the notes they start from.
 */
export const STARTER_PREFERENCE = 8;
/**
 * A step toward the nearest note a skip can start from, while the line
 * still wants skips: in Do-Mi-Sol ↑ the skips all go up, so after one the
 * line has to come back down to do or mi before it can sing another.
 */
export const TOWARD_START = 8;
/** Going back to the note two before (A-B-A)... */
export const SEESAW_PENALTY = 0.1;
/**
 * ...and again straight after one (A-B-A-B). Strong, because the chord graph
 * can favour the see-saw twelve to one (V7 goes to I): do ti do ti.
 */
export const SEESAW_REPEAT_PENALTY = 0.003;
/** Carrying on a step in the direction the last step went. */
export const MOMENTUM = 2;
/**
 * How many times a line in exact-skips mode is drawn again when it sang
 * none of the listed skips though the range and rhythm allow one. The best
 * draw is kept if none does: never fails an exercise for this.
 */
// 8 left about one exercise in 1,200 without a skip (the phrasing test failed
// about one run in ten); each draw is a few milliseconds, so 16 (7 Oct 2026).
export const SKIP_DRAWS = 16;

/** Sung moves wider than a step: with exact skips every one is a listed skip. */
export function skipCount(sungPitches: readonly number[]): number {
  let n = 0;
  for (let k = 1; k < sungPitches.length; k++) if (Math.abs(sungPitches[k] - sungPitches[k - 1]) > 1) n++;
  return n;
}

/**
 * How much a line wants `next` after the pitches it has sung (rests left
 * out), as a multiplier on the weight it would otherwise have:
 *  - a skip: FIRST_SKIP_PREFERENCE while none has been sung, then
 *    SKIP_PREFERENCE until `skipsWanted` have been, SKIP_SATED after;
 *  - a note that can start a skip (`canStartSkip`), until then: STARTER_PREFERENCE;
 *    after the first skip, a note nearer one (`towardStart`): TOWARD_START;
 *  - back to the note two before (A-B-A): SEESAW_PENALTY, and
 *    SEESAW_REPEAT_PENALTY when the two before were already A-B-A;
 *  - a step on in the direction of the last step: MOMENTUM.
 * A repeat is left at 1: the generator has its own rule for those.
 */
export function shapeFactor(
  sung: readonly number[],
  next: number,
  canStartSkip = false,
  skipsWanted = SKIPS_PER_8_BARS,
  towardStart = false
): number {
  const n = sung.length;
  if (n === 0) return 1;
  const last = sung[n - 1];
  const move = next - last;
  const skips = skipCount(sung);
  const wanting = skips < skipsWanted;
  let f = 1;
  if (Math.abs(move) > 1) f *= !wanting ? SKIP_SATED : skips === 0 ? FIRST_SKIP_PREFERENCE : SKIP_PREFERENCE;
  if (canStartSkip && wanting) f *= STARTER_PREFERENCE;
  else if (towardStart && wanting && skips > 0) f *= TOWARD_START;
  if (move !== 0 && n >= 2 && next === sung[n - 2]) {
    f *= n >= 3 && sung[n - 3] === last ? SEESAW_REPEAT_PENALTY : SEESAW_PENALTY;
  }
  if (n >= 2 && Math.abs(move) === 1 && move === last - sung[n - 2]) f *= MOMENTUM;
  return f;
}

/** The skips a line of this many bars is steered toward: SKIPS_PER_8_BARS, scaled, at least one. */
export const skipsWantedFor = (measures: number) => Math.max(1, Math.round((SKIPS_PER_8_BARS * measures) / 8));

/**
 * Could the line sing a listed skip from `from` onto a note of `length`
 * 32nds, moving no further than `cap` (a figure's Max 8th/16th skip)? Onto
 * any of `notes` (the pitches the line may sing).
 */
export function canSkipFrom(
  from: SkipNote,
  notes: readonly SkipNote[],
  length: number,
  cap: number,
  policy: SkipPolicy
): boolean {
  return notes.some((to) => {
    const d = Math.abs(to.pitchValue - from.pitchValue);
    return d > 1 && d <= cap && isAllowedMove(from, to, length, policy);
  });
}

/**
 * Could a line on these notes sing a listed skip anywhere in this rhythm?
 * Some sung note after the first with an allowed landing length and room in
 * its figure's cap, and some pair of notes a listed skip joins onto it.
 */
export function skipReachable(
  notes: readonly SkipNote[],
  rhythm: readonly { totalValue: number; rest?: boolean }[],
  capAt: (i: number) => number,
  policy: SkipPolicy
): boolean {
  if (policy.kind !== "custom" || policy.moves.length === 0) return false;
  const lengths = new Set<number>();
  for (let i = 1; i < rhythm.length; i++) {
    if (rhythm[i].rest || capAt(i) < 2) continue;
    lengths.add(rhythm[i].totalValue);
  }
  return [...lengths].some((len) => notes.some((a) => canSkipFrom(a, notes, len, Infinity, policy)));
}
