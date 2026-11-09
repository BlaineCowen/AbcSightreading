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
 *
 * Gentler (Blaine, same day: "only erase 1-4 beats ahead"): instead of the
 * rest of the bar the moment the music reaches it, each note goes a set
 * number of beats (1 to 4) before it is sung, with whatever is drawn in its
 * bar up to it (its lyric, the beam it starts), `makeAheadVanisher`.
 */

/** How far ahead the music goes: the rest of the bar as it is reached, or 1 to 4 beats. */
export type VanishAhead = "bar" | 1 | 2 | 3 | 4;
export const AHEAD_CHOICES: VanishAhead[] = ["bar", 1, 2, 3, 4];
export const aheadLabel = (a: VanishAhead) => (a === "bar" ? "Whole bar" : `${a} beat${a === 1 ? "" : "s"}`);
export function parseAhead(v: string | null | undefined): VanishAhead {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : "bar";
}

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

/**
 * Hides a bar's music drawn at or left of `right` (screen x): a note, and
 * with it its lyric and a beam starting at it. Notes go left to right, so
 * this wipes the bar up to the note.
 */
export function hideThrough(root: ParentNode, bar: number, right: number) {
  for (const el of Array.from(root.querySelectorAll(`.abcjs-mm${bar}`))) {
    if (keep(el.getAttribute("class") ?? "") || el.classList.contains(GONE)) continue;
    const box = (el as Element).getBoundingClientRect?.();
    if (box && box.left <= right + 0.5) el.classList.add(GONE);
  }
}

type Timing = { milliseconds: number; type?: string; elements?: Element[][] | null };

/**
 * Each note `aheadMs` before it sounds: called often while playing (a beat
 * callback) with abcjs's note timings and the time now. Time going back (a
 * loop's next pass, a jump) brings everything back first.
 */
export function makeAheadVanisher(root: () => ParentNode | null | undefined) {
  let next = 0;
  let lastNow = -1;
  const reset = () => {
    next = 0;
    lastNow = -1;
    showAllBars(root());
  };
  return {
    tick(timings: Timing[] | null | undefined, nowMs: number, aheadMs: number) {
      const r = root();
      if (!r || !timings || !Number.isFinite(nowMs)) return;
      if (nowMs < lastNow - 50) reset();
      lastNow = nowMs;
      while (next < timings.length && timings[next].milliseconds <= nowMs + aheadMs) {
        const t = timings[next++];
        if (t.type !== "event" || !t.elements) continue;
        const els = t.elements.flat();
        const bar = barOfElements(els);
        if (bar === null) continue;
        const right = Math.max(...els.map((e) => e.getBoundingClientRect?.().right ?? -Infinity));
        if (Number.isFinite(right)) hideThrough(r, bar, right);
      }
    },
    reset,
  };
}
