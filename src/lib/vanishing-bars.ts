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
 * Smaller pieces (Blaine, same day): chunks of 1 to 4 beats instead of the
 * whole bar, each going as the music reaches it, `makeChunkVanisher`.
 */

/** How much goes at a time: the whole bar, or a chunk of 1 to 4 beats. */
export type VanishAhead = "bar" | 1 | 2 | 3 | 4;
export const AHEAD_CHOICES: VanishAhead[] = ["bar", 1, 2, 3, 4];
export const aheadLabel = (a: VanishAhead) => (a === "bar" ? "a bar" : `${a} beat${a === 1 ? "" : "s"}`);
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
 * The chunks of a tune: each bar cut into `chunkMs` pieces from its first
 * note, every note keyed `bar:chunk`. Exported for the tests.
 */
export function chunksOf(timings: Timing[], chunkMs: number) {
  const events = timings.filter((t) => t.type === "event" && t.elements);
  const barOf = new Map<Timing, number>();
  const barStart = new Map<number, number>();
  for (const t of events) {
    const bar = barOfElements(t.elements!.flat());
    if (bar === null) continue;
    barOf.set(t, bar);
    barStart.set(bar, Math.min(barStart.get(bar) ?? Infinity, t.milliseconds));
  }
  const keyOf = new Map<Timing, string>();
  const members = new Map<string, Timing[]>();
  for (const [t, bar] of barOf) {
    const key = `${bar}:${Math.floor((t.milliseconds - barStart.get(bar)!) / chunkMs + 1e-6)}`;
    keyOf.set(t, key);
    members.set(key, [...(members.get(key) ?? []), t]);
  }
  return { keyOf, members, barOf };
}

/**
 * Chunks of 1 to 4 beats (Blaine: "like 2 beat chunks that will disappear
 * when the cursor gets there, forcing them to read ahead"): each note as it
 * sounds; when it starts a new chunk, the whole chunk goes, with everything
 * drawn in its bar up to the chunk's last note (its lyrics, its beams). A
 * note earlier than the last (a loop going round, a jump back) brings
 * everything back first.
 */
export function makeChunkVanisher(root: () => ParentNode | null | undefined) {
  let cache: { timings: Timing[]; chunkMs: number; chunks: ReturnType<typeof chunksOf> } | null = null;
  let last: string | null = null;
  let lastMs = -1;
  const reset = () => {
    last = null;
    lastMs = -1;
    showAllBars(root());
  };
  return {
    reach(timings: Timing[] | null | undefined, event: Timing | null | undefined, chunkMs: number) {
      const r = root();
      if (!r || !timings || !event || !(chunkMs > 0)) return;
      if (event.milliseconds < lastMs - 50) reset();
      lastMs = event.milliseconds;
      if (!cache || cache.timings !== timings || cache.chunkMs !== chunkMs) cache = { timings, chunkMs, chunks: chunksOf(timings, chunkMs) };
      // The event abcjs hands over is its own timing object; matched by time and elements if it is a copy.
      const same = cache.chunks.keyOf.has(event) ? event : timings.find((t) => t.milliseconds === event.milliseconds && t.elements?.[0]?.[0] === event.elements?.[0]?.[0]);
      const key = same ? cache.chunks.keyOf.get(same) : undefined;
      if (!key || key === last) return;
      last = key;
      const chunk = cache.chunks.members.get(key) ?? [];
      const bar = cache.chunks.barOf.get(chunk[0]);
      if (bar === undefined) return;
      const right = Math.max(...chunk.flatMap((t) => t.elements!.flat()).map((e) => e.getBoundingClientRect?.().right ?? -Infinity));
      if (Number.isFinite(right)) hideThrough(r, bar, right);
    },
    reset,
  };
}
