/**
 * Where the page should sit so the first system is readable.
 *
 * Split out from the component because the arithmetic is the part that can be
 * wrong in a way nobody notices: it is a scroll position, so a bad answer looks
 * like the page merely being somewhere unhelpful.
 */

/** The fixed navbar is 4rem and slides back into view on any upward scroll. */
export const NAVBAR_CLEARANCE = 80;

/**
 * @param systemTop - the first staff's top, in document coordinates.
 * @param viewportHeight - so the margin can scale with the screen.
 */
export function firstSystemScrollTarget(
  systemTop: number,
  viewportHeight: number
): number {
  // A tenth of the viewport, but never less than the navbar needs. That bar
  // reveals itself on any upward scroll - which this is - so on a short
  // viewport a 10% margin lands it on top of the first system.
  const margin = Math.max(NAVBAR_CLEARANCE, viewportHeight * 0.1);
  return Math.max(0, systemTop - margin);
}

/**
 * Is it worth moving the page at all?
 *
 * A few pixels of correction reads as a glitch rather than as a scroll.
 */
export function worthScrolling(target: number, currentScroll: number): boolean {
  return Math.abs(target - currentScroll) >= 24;
}

/**
 * Did the score move under a scroll that was already aimed?
 *
 * This is the one that matters on a repeat. Changing the annotations redraws
 * the score, every system changes height, and the page can be left short of
 * where it was sent - the scroll was aimed at a layout that no longer exists.
 * Re-aiming has to key off the TARGET moving, never off the distance still to
 * travel, or a smooth scroll would restart itself on every check and never
 * arrive.
 */
export function targetMoved(aimedAt: number, nowAt: number): boolean {
  return Math.abs(nowAt - aimedAt) >= 8;
}

/**
 * Brings a line of music to the reading position, just under the navbar.
 *
 * `el` is the whole system (abcjs's `.abcjs-staff-wrapper`, which holds every
 * staff of the line and whatever reaches above them, like high notes and chord
 * symbols), or the score itself for the first line, so its title and the
 * count-in badge above the first staff stay in view too. Aiming at the top
 * staff line instead leaves all of that under the navbar.
 */
export function scrollToReadingPosition(el: Element | null | undefined) {
  if (!el || typeof window === "undefined") return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  const target = firstSystemScrollTarget(top, window.innerHeight);
  if (worthScrolling(target, window.scrollY)) window.scrollTo({ top: target, behavior: "smooth" });
}

/**
 * Left above a line being played when room is short: the navbar hides on a
 * scroll down, which is the way playback goes.
 */
export const PLAYING_CLEARANCE = 12;

/**
 * Where the page should sit for a line that has just started playing, so the
 * line after it is in view too (Blaine, 1 November 2026: the next system
 * should always be visible). The usual margin above the line shrinks, down to
 * PLAYING_CLEARANCE, until the next line's bottom clears the playback bar;
 * where even that is not enough the line being played stays whole and the
 * next shows as far as it can (it is brought fully on screen before the line
 * ends, revealNextLine). All in document coordinates except `barTop`, which
 * is in the viewport's.
 */
export function playingLineScrollTarget(
  top: number,
  nextBottom: number | null,
  barTop: number,
  viewportHeight: number
): number {
  const roomy = Math.max(NAVBAR_CLEARANCE, viewportHeight * 0.1);
  if (nextBottom === null) return Math.max(0, top - roomy);
  const fits = barTop - 8 - (nextBottom - top);
  const margin = Math.min(roomy, Math.max(PLAYING_CLEARANCE, fits));
  return Math.max(0, top - margin);
}

/**
 * Brings a line that has just started playing to where it and the line after
 * it can both be read (playingLineScrollTarget). `from` is what to keep in
 * view at the top: the line itself, or the whole score for the first line
 * (its title and the count-in badge), which gives way to the line when the
 * two lines would not fit under it.
 */
export function scrollToPlayingLine(line: Element, from: Element = line) {
  if (typeof window === "undefined") return;
  const lines = [...document.querySelectorAll("#paper .abcjs-staff-wrapper")];
  const next = lines[lines.indexOf(line) + 1] ?? null;
  const barTop = document.querySelector(".playback-bar")?.getBoundingClientRect().top ?? window.innerHeight;
  const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
  const nextBottom = next ? next.getBoundingClientRect().bottom + window.scrollY : null;
  // The score's top, unless keeping it in view would leave the next line under the bar.
  const room = nextBottom === null ? Infinity : barTop - 8 - (nextBottom - docTop(from));
  const keep = from !== line && room < PLAYING_CLEARANCE ? line : from;
  const target = playingLineScrollTarget(docTop(keep), nextBottom, barTop, window.innerHeight);
  if (worthScrolling(target, window.scrollY)) window.scrollTo({ top: target, behavior: "smooth" });
}

/** The line of music an element of the score belongs to. */
export const systemOf = (el: Element | null | undefined) => el?.closest(".abcjs-staff-wrapper") ?? null;

/**
 * The line of music at a height given in abcjs's drawing units (a timing
 * event's `top`), which are the SVG's own user units, so getBBox compares
 * directly.
 */
export function systemAt(top: number | undefined): Element | null {
  if (typeof top !== "number") return null;
  const lines = document.querySelectorAll<SVGGraphicsElement>("#paper .abcjs-staff-wrapper");
  for (const line of lines) {
    const b = line.getBBox();
    if (top >= b.y - 2 && top <= b.y + b.height + 2) return line;
  }
  return null;
}

/**
 * Just before a line ends: scroll only as far as it takes for the next line
 * to be fully on screen above the playback bar, so the line still being sung
 * stays in view for its last notes. When the next line starts, it is brought
 * to the reading position (scrollToReadingPosition). Turning the whole way at
 * once pushed the line being sung off the top for its last half second.
 */
export function revealNextLine(next: Element | null | undefined) {
  if (!next || typeof window === "undefined") return;
  const barTop = document.querySelector(".playback-bar")?.getBoundingClientRect().top ?? window.innerHeight;
  const needed = next.getBoundingClientRect().bottom + 8 - barTop;
  if (needed > 0) window.scrollTo({ top: window.scrollY + needed, behavior: "smooth" });
}
