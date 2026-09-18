/**
 * Should the hide-on-scroll header be showing?
 *
 * Written against iPad Safari rather than a mouse wheel, which is where the
 * naive "hide when scrollY grows" rule goes wrong:
 *
 * - Rubber-banding. Pulling past the top takes scrollY negative, and the spring
 *   back to 0 is an *increase* - so the header hid at the very top of the page.
 *   The bottom bounce does the reverse. Positions are clamped to the real
 *   scroll range before comparing, which makes both bounces a no-op.
 * - Jitter. Momentum scrolling and the collapsing toolbar report small
 *   back-and-forth moves; below `threshold` the header keeps its state.
 * - Near the top it always shows, however it got there.
 */
export interface NavScroll {
  /** Last position the decision was made at (already clamped). */
  anchorY: number;
  visible: boolean;
}

export const NAV_REVEAL_THRESHOLD = 12;

export function nextNavState(
  prev: NavScroll,
  rawY: number,
  maxY: number,
  topZone: number,
  threshold = NAV_REVEAL_THRESHOLD
): NavScroll {
  const y = Math.min(Math.max(rawY, 0), Math.max(maxY, 0));
  if (y <= topZone) return { anchorY: y, visible: true };
  const delta = y - prev.anchorY;
  if (Math.abs(delta) < threshold) return prev;
  return { anchorY: y, visible: delta < 0 };
}
