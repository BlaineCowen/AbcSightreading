/**
 * The scrolling line, scrolled continuously: the music moves past at the
 * pace it is played, the moment being played held a third of the way in,
 * rather than the line jumping along a bar at a time (Blaine, 9 October
 * 2026).
 *
 * Where each moment of the music sits on the line comes from the drawn notes
 * (`anchors`: each onset's leftmost notehead, by its time in 32nds), and a
 * clock says where in the music we are (a graded run's or a take's own
 * clock, or playback's, resynced at every note abcjs reports). Every frame
 * the line's position is read off between the two anchors either side of
 * now, so it glides at the speed the notes are spaced: through a run of
 * sixteenths and across a whole note alike.
 */
import type { PianoNote } from "./left-hand";

export type Hand = "rh" | "lh";

export interface Anchor {
  /** Time from the start of the exercise, in 32nds. */
  u: number;
  /** Distance from the left of the drawn line, in px. */
  x: number;
}

/** Each hand's notes with their start times, in 32nds. */
export function noteStarts(hands: Record<Hand, PianoNote[]>): Record<Hand, number[]> {
  const out = { rh: [] as number[], lh: [] as number[] };
  for (const hand of ["rh", "lh"] as Hand[]) {
    let t = 0;
    for (const n of hands[hand]) {
      out[hand].push(t);
      t += n.length;
    }
  }
  return out;
}

/**
 * Anchors from the drawn notes: at each onset, the leftmost notehead of
 * anything starting then (a rest counts: the music moves on through it),
 * measured against the score's own left edge so scrolling does not move them.
 */
export function anchorsFrom(
  starts: Record<Hand, number[]>,
  els: Record<Hand, Element[][]>,
  svg: Element,
  total: number,
): Anchor[] {
  const left = svg.getBoundingClientRect().left;
  const at = new Map<number, number>();
  for (const hand of ["rh", "lh"] as Hand[]) {
    starts[hand].forEach((u, i) => {
      const el = els[hand][i]?.[0];
      if (!el) return;
      const x = el.getBoundingClientRect().left - left;
      at.set(u, Math.min(at.get(u) ?? Infinity, x));
    });
  }
  const anchors = [...at].map(([u, x]) => ({ u, x })).sort((a, b) => a.u - b.u);
  // The end of the line: past the last note, to its final barline.
  if (anchors.length) anchors.push({ u: total, x: svg.getBoundingClientRect().width - 30 });
  return anchors;
}

/** Where on the line time `u` is: between the anchors either side, in proportion. */
export function xAt(anchors: Anchor[], u: number): number {
  if (!anchors.length) return 0;
  if (u <= anchors[0].u) return anchors[0].x;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (u <= b.u) return a.x + ((b.x - a.x) * (u - a.u)) / (b.u - a.u || 1);
  }
  return anchors[anchors.length - 1].x;
}

/**
 * Scroll `box` every frame to keep the moment `clock()` gives (in 32nds, or
 * null for "not started") a third of the way in. Stop it when the music stops.
 */
export function createScroller(box: HTMLElement) {
  let frame = 0;
  return {
    start(anchors: Anchor[], clock: () => number | null) {
      cancelAnimationFrame(frame);
      const step = () => {
        const u = clock();
        if (u !== null) {
          const max = box.scrollWidth - box.clientWidth;
          box.scrollLeft = Math.max(0, Math.min(max, xAt(anchors, u) - box.clientWidth / 3));
        }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
    stop() {
      cancelAnimationFrame(frame);
    },
  };
}
