/**
 * Keeping the line being played on screen, for playback and for a graded
 * run: when the notes move to a new line of the score, the page scrolls so
 * that line sits a third of the way down the window, with the line after it
 * in view below. abcjs marks each drawn note with its line (`abcjs-l<n>`,
 * from `add_classes`), so a line is only scrolled to once, as it starts.
 */
export function createFollower() {
  let line = -1;
  return {
    /** Elements of the notes sounding now (any of them; the first decides the line). */
    follow(elements: Element[]) {
      const el = elements[0];
      if (!el) return;
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
