/**
 * The play-along video's clock: how many bars fill about a minute and a half,
 * and what is on screen at any moment. Pure, so the video and its export draw
 * the same thing from the same audio time (tests/unit/play-along-timeline.test.ts).
 *
 * Two panes, top and bottom, leapfrog: bar n plays in pane n % 2 while the
 * other pane already shows bar n + 1, so the reader can always look a bar ahead.
 * The top bar turns over the instant the cursor drops to the bottom one.
 */
import { beatsOf } from "../meter";
import { countInBeats, countInWord } from "../count-in";

export const VIDEO_SECONDS = 90;

export const secondsPerBar = (bpm: number, meter: string) => (beatsOf(meter) * 60) / bpm;

/**
 * Bars of music (count-in not included) so that count-in + music comes as
 * close to `seconds` as it can, in whole repeats of the loop and an even
 * number of bars, so the last pair fills both panes.
 */
export function barsForLength(opts: {
  bpm: number;
  meter: string;
  loopBars: number;
  countInBars: number;
  seconds?: number;
}): number {
  const { bpm, meter, loopBars, countInBars, seconds = VIDEO_SECONDS } = opts;
  const step = loopBars % 2 === 0 ? loopBars : loopBars * 2;
  const wanted = seconds / secondsPerBar(bpm, meter) - countInBars;
  return Math.max(step, Math.round(wanted / step) * step);
}

export interface Frame {
  phase: "countIn" | "playing" | "done";
  /** Bar index shown in each pane, or null for an empty pane. */
  top: number | null;
  bottom: number | null;
  /** The pane the cursor is in; null outside the music. */
  active: "top" | "bottom" | null;
  /** Bar being played, from 0; null outside the music. */
  bar: number | null;
  /** How far through the active bar, 0 to 1. */
  progress: number;
  /** The count-in word to show, or null. */
  word: string | null;
}

/**
 * What is on screen `t` seconds after the count-in's first downbeat. Before
 * that (t < 0) it is the start of the count-in.
 */
export function frameAt(
  t: number,
  opts: { bars: number; bpm: number; meter: string; countInBars: number },
): Frame {
  const { bars, bpm, meter, countInBars } = opts;
  const bar = secondsPerBar(bpm, meter);
  const countInEnd = countInBars * bar;
  const shown = (i: number) => (i < bars ? i : null);

  if (t < countInEnd) {
    const beat = Math.max(0, t) / (bar / beatsOf(meter));
    return {
      phase: "countIn",
      top: shown(0),
      bottom: shown(1),
      active: null,
      bar: null,
      progress: 0,
      word: countInWordFor(meter, beat, countInBars),
    };
  }

  const into = (t - countInEnd) / bar;
  const n = Math.floor(into);
  if (n >= bars) {
    const last = bars - 1;
    return {
      phase: "done",
      top: last % 2 === 0 ? last : last - 1,
      bottom: last % 2 === 1 ? last : null,
      active: null,
      bar: null,
      progress: 0,
      word: null,
    };
  }

  const inTop = n % 2 === 0;
  return {
    phase: "playing",
    top: inTop ? n : shown(n + 1),
    bottom: inTop ? shown(n + 1) : n,
    active: inTop ? "top" : "bottom",
    bar: n,
    progress: into - n,
    word: null,
  };
}

/**
 * Bars into the loop to start so that its own bar 1 lands on the music's bar
 * 1: a one-bar count-in over a four-bar loop starts on the loop's bar 4.
 */
export function loopOffset(countInBars: number, loopBars: number): number {
  return (((loopBars - countInBars) % loopBars) + loopBars) % loopBars;
}

/**
 * The bouncing ball: it lands on each note as the note sounds and arcs to the
 * next one in that note's time, the last note's arc ending at the barline.
 * `hop` is how far through the current arc (0 just landed, 1 landing next),
 * `lift` its height (0 on a note, 1 at the top), `span` the arc's share of
 * the bar, so a long note can arc higher than a short one, and `note` the
 * index of the note it last landed on (-1 before the first).
 */
export function ballAt(
  notes: { at: number; x: number }[],
  progress: number,
  endX: number,
): { x: number; lift: number; hop: number; span: number; note: number } {
  const p = Math.min(1, Math.max(0, progress));
  if (notes.length === 0) return { x: endX * p, lift: 0, hop: p, span: 1, note: -1 };
  if (p < notes[0].at) return { x: notes[0].x, lift: 0, hop: 0, span: notes[0].at, note: -1 };
  let i = notes.length - 1;
  while (i > 0 && notes[i].at > p) i--;
  const here = notes[i];
  const next = notes[i + 1] ?? { at: 1, x: endX };
  const span = Math.max(1e-6, next.at - here.at);
  const hop = Math.min(1, (p - here.at) / span);
  return { x: here.x + hop * (next.x - here.x), lift: 4 * hop * (1 - hop), hop, span, note: i };
}

/**
 * The spoken count-in over however many bars the loop gives it: "Ready, Go"
 * always lands on the last bar's last two beats, the numbers before that.
 */
function countInWordFor(meter: string, beat: number, countInBars: number): string | null {
  const beats = beatsOf(meter);
  const total = countInBars * beats;
  const whole = Math.floor(beat);
  if (whole < 0 || whole >= total) return null;
  // The meter's own count-in ("1, 2, Ready, Go") fills the end; a longer
  // intro counts its earlier beats plainly, 1 2 3 4.
  const spoken = countInBeats(meter);
  const tail = whole - (total - spoken);
  if (tail >= 0) return countInWord(meter, tail);
  return String((whole % beats) + 1);
}
