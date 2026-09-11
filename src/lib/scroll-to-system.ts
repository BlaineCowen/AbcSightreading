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
