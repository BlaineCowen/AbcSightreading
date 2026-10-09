/**
 * When an exercise cannot be written: which setting is in the way, so the
 * page can ring its pill and open it (Show me), and the one change most
 * likely to clear it, offered as a button that makes the change and tries
 * again. The words for Choral come from failure-hint.ts, unchanged in
 * substance; this adds where the setting lives and what the button does.
 *
 * A wrong pointer is worse than none (it sends someone to a setting that was
 * never the problem), so a failure this cannot place gets no pill.
 */

import { failureHint, span, tightestPart, type FailureContext } from "./failure-hint";

/** A change the page can make for the reader. */
export type FixAction =
  /** Choral: room at the top of one part, in scale steps. */
  | { kind: "widenPart"; part: string; steps: number }
  /** Unison: the range, grown to hold a starting note and a step either side. */
  | { kind: "widenRange" }
  | { kind: "measures"; to: number }
  | { kind: "stepwiseEighthsOff" }
  | { kind: "maxSkip"; to: number }
  | { kind: "tiesOn" }
  | { kind: "retry" };

export interface FailureAdvice {
  message: string;
  /** The settings pill to ring and open, by its popover id. */
  pill: string | null;
  /** The control inside its popover to bring into view (`data-fix` on the page). */
  target?: string;
  fix: { label: string; action: FixAction } | null;
}

// ── Choral ───────────────────────────────────────────────────────────────────

/**
 * The same branches as failureHint, in the same order, each with the pill it
 * names. `maxSkip` is the largest leap a Choral exercise allows.
 */
export function choralAdvice(ctx: FailureContext): FailureAdvice {
  const message = failureHint(ctx);
  const { parts, measures, chordCount, maxSkip, stepwiseEighths } = ctx;
  const tightest = tightestPart(parts);
  const widen = tightest
    ? { label: `Give the ${tightest.name} more room`, action: { kind: "widenPart", part: tightest.name, steps: 2 } as FixAction }
    : null;
  if (stepwiseEighths && parts.length >= 3 && measures >= 16) {
    return { message, pill: "harmony", target: "stepwise", fix: { label: "Let eighths leap and try again", action: { kind: "stepwiseEighthsOff" } } };
  }
  if (parts.length >= 3 && measures >= 16) {
    return { message, pill: "length", fix: { label: "Try 8 bars", action: { kind: "measures", to: 8 } } };
  }
  if (parts.length >= 3 && tightest !== null && span(tightest) <= 10) {
    return { message, pill: "ranges", target: `part:${tightest.name}`, fix: widen };
  }
  if (chordCount <= 4) return { message, pill: "harmony", fix: null };
  if (maxSkip <= 2) {
    return { message, pill: "harmony", target: "maxskip", fix: { label: "Allow a larger leap", action: { kind: "maxSkip", to: maxSkip + 1 } } };
  }
  return { message, pill: "ranges", target: tightest ? `part:${tightest.name}` : undefined, fix: { label: "Try again", action: { kind: "retry" } } };
}

// ── Unison ───────────────────────────────────────────────────────────────────

/**
 * Where a Unison failure's message points. The generator's messages already
 * say what to change; this finds the pill that holds it: the range, the notes
 * and the skips are all under the notes pill, the rhythms and ties under the
 * rhythm pill.
 */
export function unisonAdvice(message: string, ctx: { maxSkip: number; exactSkips: boolean; tiesOn: boolean }): FailureAdvice {
  const m = message.toLowerCase();
  if (/in (the selected )?range|tonic notes|widen the range/.test(m)) {
    // The generator's own words for the first two said what failed, not why.
    const said = /^no valid notes found in range/.test(m)
      ? "None of the selected notes fits inside the range. Widen the range, or choose notes that sit inside it."
      : /^no tonic notes found/.test(m)
        ? "A line starts on do, mi or so, and none of those selected fits inside the range. Widen the range, or select do, mi or so."
        : message;
    return { message: said, pill: "notes", target: "range", fix: { label: "Widen the range and try again", action: { kind: "widenRange" } } };
  }
  if (/max skip/.test(m) || (/could not generate a melody/.test(m) && !ctx.exactSkips)) {
    return {
      message,
      pill: "notes",
      target: "skips",
      fix: ctx.maxSkip < 8 ? { label: "Allow a larger skip and try again", action: { kind: "maxSkip", to: ctx.maxSkip + 1 } } : null,
    };
  }
  if (/skip|scale degrees/.test(m)) return { message, pill: "notes", target: "skips", fix: null };
  if (/ties across barline/.test(m) && !ctx.tiesOn) {
    return { message, pill: "rhythm", target: "ties", fix: { label: "Allow ties across the barline", action: { kind: "tiesOn" } } };
  }
  if (/rhythm|measure|bar\b/.test(m)) return { message, pill: "rhythm", fix: null };
  return { message, pill: null, fix: null };
}

/**
 * A Unison range grown so the line has somewhere to start and move: a step
 * more at each end, then upward (and downward once the top is reached) until
 * it holds a starting note - do, mi or so, whichever are selected - with a
 * note either side. Ranges are noteArray indices, seven to the octave, C = 0;
 * `tonicLetter` is the key's do as a letter (0 C ... 6 B).
 */
export function widenedRange(
  range: { min: number; max: number },
  tonicLetter: number,
  degrees: number[],
  limits: { min: number; max: number },
): { min: number; max: number } {
  const starts = [0, 2, 4].filter((d) => degrees.includes(d));
  const degreeAt = (i: number) => (((i - tonicLetter) % 7) + 7) % 7;
  const holdsStart = (r: { min: number; max: number }) => {
    for (let i = r.min + 1; i <= r.max - 1; i++) if (starts.includes(degreeAt(i))) return true;
    return starts.length === 0;
  };
  let r = { min: Math.max(limits.min, range.min - 1), max: Math.min(limits.max, range.max + 1) };
  for (let guard = 0; guard < 14 && !holdsStart(r); guard++) {
    if (r.max < limits.max) r = { ...r, max: r.max + 1 };
    else if (r.min > limits.min) r = { ...r, min: r.min - 1 };
    else break;
  }
  return r;
}
