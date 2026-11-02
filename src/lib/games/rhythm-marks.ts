import type { ClapNote } from "../grade-rhythm";

/**
 * Marks on a drawn rhythm (the games): each graded note by its `cursor`, the
 * place among the notes and rests abcjs drew (a tie's second note is part of
 * the first, so counting noteheads would slip after one). A student's own
 * marks (green right, butter close, red missed), or the class's share right
 * on the big screen (the same three colours by share).
 */

const CLASSES = ["g-right", "g-close", "g-miss"];

function drawn(paper: Element | null | undefined): Element[] {
  return [...(paper?.querySelectorAll(".abcjs-note, .abcjs-rest") ?? [])];
}

/** One player's result on the music; null clears it. */
export function markNotes(paper: Element | null | undefined, notes: ClapNote[] | null) {
  const els = drawn(paper);
  els.forEach((el) => el.classList.remove(...CLASSES));
  for (const n of notes ?? []) {
    els[n.cursor]?.classList.add(n.missed ? "g-miss" : n.rhythm >= 90 ? "g-right" : "g-close");
  }
}

/** The class's share right on each note (0-1, by the notes' cursors). */
export function markShares(paper: Element | null | undefined, shares: { cursor: number; share: number }[]) {
  const els = drawn(paper);
  els.forEach((el) => el.classList.remove(...CLASSES));
  for (const s of shares) els[s.cursor]?.classList.add(s.share >= 0.8 ? "g-right" : s.share >= 0.5 ? "g-close" : "g-miss");
}

/** Each note's share of the class right (clapped, and on time), from everyone's results. */
export function noteShares(results: ClapNote[][]): { cursor: number; share: number }[] {
  if (!results.length) return [];
  return results[0].map((n, i) => ({
    cursor: n.cursor,
    share: results.filter((r) => r[i] && !r[i].missed && r[i].rhythm >= 90).length / results.length,
  }));
}
