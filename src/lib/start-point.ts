import { cursorLine } from "./score-line";

/**
 * Where Play starts on the practice pages (Unison, Choral): a tapped note, or
 * the place playback was paused, marked on the music by an orange line the
 * height of the system (My music's, pieces/score-dom `cursorLine`), so the
 * reader sees it even with the cursor off. Blaine (item 9, "Cursor on
 * note"): pausing or clicking a note should start there, not at the top.
 *
 * A note is kept by its `startChar` in the ABC, which survives a redraw (a new
 * layout, a new tempo); its time and its drawn elements are looked up again
 * from abcjs's note timings each time they are needed.
 */

/** abcjs's note timing event, the parts used here. */
export type TimingEvent = {
  type?: string;
  milliseconds: number;
  startCharArray?: number[];
  /** abcjs marks the first event after each barline. */
  measureStart?: boolean;
  elements?: Element[][];
  left?: number | null;
  top?: number;
  height?: number;
};

/** The timing event a note starts (the first, if the music repeats), or null. */
export function eventForChar(timings: TimingEvent[] | null | undefined, startChar: number | null): TimingEvent | null {
  if (!timings || startChar === null) return null;
  return timings.find((e) => e.type === "event" && e.startCharArray?.includes(startChar)) ?? null;
}

/**
 * When the bar a note falls in starts, in ms: the last event abcjs marks as a
 * bar's first at or before it (a rest or a tied-over note is an event too).
 * Play from a tapped note counts in to this downbeat, the notes before the
 * tapped one in its bar kept silent, so the note comes in on its own beat
 * (Blaine, 27 October 2026). The note's own time where nothing is marked.
 */
export function barStartOf(timings: TimingEvent[] | null | undefined, e: TimingEvent): number {
  let at = -1;
  for (const x of timings ?? []) {
    if (x.type === "event" && x.measureStart && x.milliseconds <= e.milliseconds + 1) at = Math.max(at, x.milliseconds);
  }
  return at >= 0 ? at : e.milliseconds;
}

/** The drawn elements of a timing event, flattened. */
export const eventElements = (e: TimingEvent | null): Element[] => (e?.elements ?? []).flat().filter(Boolean);

/** Draws the start line before `els` with its label, or takes it away when `els` is empty. */
export function startLine(svg: Element | null, els: Element[], label: string) {
  cursorLine(svg as SVGSVGElement | null, els, "sr-start-line", label);
}
