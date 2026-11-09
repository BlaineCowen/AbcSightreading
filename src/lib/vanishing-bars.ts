/**
 * Disappearing bars (9 November 2026, Blaine: "an option to the display for
 * disappearing measures. This will erase the measure we get to so you are
 * forced to read it faster"). While the music plays, each bar's notes vanish
 * as the music reaches it, so the reader has to be a bar ahead. The staff,
 * clef, key, bar lines and bar numbers stay, so the page keeps its shape;
 * everything comes back when playing stops or goes round again.
 *
 * abcjs marks everything it draws in a bar with `abcjs-mm<n>` (the bar's
 * number in the whole tune): notes (head, stem, ledger lines inside), rests,
 * beams, lyrics (solfège, syllables), chord symbols. Tests vanishing-bars.test.ts.
 */

export const GONE = "sr-gone";

/** Drawn in a bar but kept: what holds the page's shape. */
const KEEP = ["abcjs-staff-extra", "abcjs-bar", "abcjs-bar-number"];

/** The bar an abcjs element is in, from its classes, or null. */
export function barOfClass(cls: string | null | undefined): number | null {
  const m = cls ? /(?:^|\s)abcjs-mm(\d+)(?:\s|$)/.exec(cls) : null;
  return m ? Number(m[1]) : null;
}

/** The bar a playing event is in: its first element's. */
export function barOfElements(els: ArrayLike<Element> | null | undefined): number | null {
  if (!els) return null;
  for (const e of Array.from(els)) {
    const n = barOfClass(e.getAttribute?.("class"));
    if (n !== null) return n;
  }
  return null;
}

const keep = (cls: string) => KEEP.some((k) => new RegExp(`(?:^|\\s)${k}(?:\\s|$)`).test(cls));

/** Hides one bar's music. */
export function hideBar(root: ParentNode, bar: number) {
  for (const el of Array.from(root.querySelectorAll(`.abcjs-mm${bar}`))) {
    if (!keep(el.getAttribute("class") ?? "")) el.classList.add(GONE);
  }
}

/** Every bar back. */
export function showAllBars(root: ParentNode | null | undefined) {
  if (!root) return;
  for (const el of Array.from(root.querySelectorAll(`.${GONE}`))) el.classList.remove(GONE);
}

/**
 * Follows the playing bar: each bar reached is hidden, and a bar earlier than
 * the last one (a loop or repeat going round, a jump back) brings them all
 * back first, so every pass starts with the whole exercise to read.
 */
export function makeVanisher(root: () => ParentNode | null | undefined) {
  let last: number | null = null;
  return {
    reach(bar: number | null) {
      const r = root();
      if (bar === null || !r) return;
      if (last !== null && bar < last) showAllBars(r);
      if (bar !== last) hideBar(r, bar);
      last = bar;
    },
    reset() {
      last = null;
      showAllBars(root());
    },
  };
}
