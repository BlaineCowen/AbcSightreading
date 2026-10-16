/**
 * The playing cursor, the same on every score page (Blaine, 16 October 2026:
 * My music's cursor is the better one, match the others to it): a soft blue
 * bar the height of the whole system, just left of the notes, behind the
 * music, and the notes being played turned blue. My music draws it from its
 * own model (pieces/score-dom.ts `cursorLine`, `.piece-now`); the practice
 * pages place it from abcjs's callbacks with these. The bar's look is
 * `.abcjs-cursor` in globals.css, the notes' `.sr-now`.
 */

type Span = { top: number; bottom: number };

/** Each system's staves, top to bottom, per drawn SVG (a new render is a new SVG). */
const extents = new WeakMap<Element, Span[]>();

function systemsOf(svg: Element): Span[] {
  const known = extents.get(svg);
  if (known?.length) return known;
  const byLine = new Map<string, Span>();
  svg.querySelectorAll(".abcjs-staff").forEach((staff) => {
    const line = (staff.getAttribute("class") || "").match(/abcjs-l(\d+)/)?.[1];
    if (line === undefined) return;
    const box = (staff as SVGGraphicsElement).getBBox();
    const seen = byLine.get(line);
    byLine.set(line, {
      top: seen ? Math.min(seen.top, box.y) : box.y,
      bottom: seen ? Math.max(seen.bottom, box.y + box.height) : box.y + box.height,
    });
  });
  const out = [...byLine.values()].sort((a, b) => a.top - b.top);
  extents.set(svg, out);
  return out;
}

/**
 * The system a position abcjs reports falls in, top of its first staff to
 * the bottom of its last. abcjs's top and height describe one voice's band
 * (with room for stems above), so it is matched by overlap.
 */
export function systemSpan(svg: Element, top: number, height: number): Span {
  const bottom = top + height;
  let best: Span | null = null;
  let most = 0;
  for (const s of systemsOf(svg)) {
    const overlap = Math.min(bottom, s.bottom) - Math.max(top, s.top);
    if (overlap > most) {
      most = overlap;
      best = s;
    }
  }
  return best ?? { top, bottom };
}

/** Makes the cursor bar, behind the music (the notes draw over it). */
export function makeCursor(svg: Element): SVGLineElement {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", "abcjs-cursor");
  for (const a of ["x1", "y1", "x2", "y2"]) line.setAttribute(a, "0");
  svg.insertBefore(line, svg.firstChild);
  return line;
}

/** Puts the bar at `left` (a note's left edge), spanning its system, 8 units over and under, as My music's. */
export function placeCursor(line: SVGLineElement, svg: Element, left: number, top: number, height: number) {
  const span = systemSpan(svg, top, height);
  const x = String(Math.max(0, left - 5));
  line.setAttribute("x1", x);
  line.setAttribute("x2", x);
  line.setAttribute("y1", String(span.top - 8));
  line.setAttribute("y2", String(span.bottom + 8));
}

export function hideCursor(line: SVGLineElement | null) {
  if (line) for (const a of ["x1", "y1", "x2", "y2"]) line.setAttribute(a, "0");
}

/**
 * The notes being played, blue. abcjs reports only the notes starting at each
 * moment, so a voice's note stays lit until that voice moves on: a held bass
 * under a moving tune stays blue, as it does in My music.
 */
export class NoteLight {
  private byVoice = new Map<string, Element[]>();

  light(els: Element[]) {
    const fresh = new Map<string, Element[]>();
    for (const e of els) {
      const v = (e.getAttribute("class") || "").match(/abcjs-v(\d+)/)?.[1] ?? "?";
      fresh.set(v, [...(fresh.get(v) ?? []), e]);
    }
    for (const [v, list] of fresh) {
      for (const e of this.byVoice.get(v) ?? []) e.classList.remove("sr-now");
      for (const e of list) e.classList.add("sr-now");
      this.byVoice.set(v, list);
    }
  }

  clear() {
    for (const list of this.byVoice.values()) for (const e of list) e.classList.remove("sr-now");
    this.byVoice.clear();
  }
}
