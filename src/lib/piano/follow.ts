/**
 * Keeping the line being played on screen, for playback and for a graded
 * run: when the notes move to a new line of the score, the page scrolls so
 * that line sits a third of the way down the window, with the line after it
 * in view below. abcjs marks each drawn note with its line (`abcjs-l<n>`,
 * from `add_classes`), so a line is only scrolled to once, as it starts.
 *
 * With the score as one scrolling line (`#paper-box.scroll-line`) it follows
 * across instead: the notes being played are kept about a third of the way
 * in from the left, the box scrolled whenever they pass the middle, so the
 * bars coming up are always in view.
 */
export function createFollower() {
  let line = -1;
  return {
    /** Elements of the notes sounding now (any of them; the first decides the line). */
    follow(elements: Element[]) {
      const el = elements[0];
      if (!el) return;
      const paper = document.getElementById("paper-box");
      if (paper?.classList.contains("scroll-line")) {
        const c = paper.getBoundingClientRect();
        const x = el.getBoundingClientRect().left - c.left;
        if (x >= c.width * 0.15 && x <= c.width * 0.55) return;
        // Clamped to the line, and only when it moves: at the start and the end there is nowhere to go.
        const left = Math.max(0, Math.min(paper.scrollWidth - paper.clientWidth, paper.scrollLeft + x - c.width * 0.33));
        if (Math.abs(left - paper.scrollLeft) > 2) paper.scrollTo({ left, behavior: "smooth" });
        return;
      }
      const m = /abcjs-l(\d+)/.exec(el.getAttribute("class") ?? "");
      const n = m ? Number(m[1]) : -1;
      if (n === line) return;
      line = n;
      // The whole system: the line's first staff, and its last (the left hand).
      const staves = [...document.querySelectorAll(`#paper .abcjs-l${n}.abcjs-staff`)];
      const box = (staves.length ? staves : [el]).map((s) => s.getBoundingClientRect());
      const top = Math.min(...box.map((b) => b.top));
      const bottom = Math.max(...box.map((b) => b.bottom));
      const want = window.innerHeight * 0.3;
      // Already where it reads well: leave the page alone.
      if (top >= 70 && bottom <= window.innerHeight - 170) return;
      window.scrollBy({ top: top - want, behavior: "smooth" });
    },
    reset() {
      line = -1;
    },
  };
}
