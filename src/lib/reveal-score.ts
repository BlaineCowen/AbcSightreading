/**
 * Bring a freshly drawn score into view, if it is not already.
 *
 * The practice pages draw the score below their settings, so on a phone (and
 * often on a laptop) pressing Generate changed nothing on screen but the
 * exercise counter: a first-time visitor thought nothing had happened, and it
 * had cost them one of their free exercises. Now the page scrolls to the
 * score. When most of it is already visible nothing moves, so repeated
 * Generates and practice runs do not jump the page about.
 */
export function revealScore(el: Element | null, opts: { topOffset?: number } = {}) {
  if (!el || typeof window === "undefined") return;
  const box = el.getBoundingClientRect();
  const top = opts.topOffset ?? navbarBottom();
  const visible = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, top);
  const needed = Math.min(box.height, window.innerHeight - top) * 0.5;
  if (visible >= needed) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: window.scrollY + box.top - top - 12, behavior: reduce ? "auto" : "smooth" });
}

/** Where the fixed navbar ends, so the score is not tucked under it. */
function navbarBottom(): number {
  const nav = document.querySelector(".sr-navbar");
  const b = nav?.getBoundingClientRect().bottom ?? 0;
  return b > 0 ? b : 0;
}
