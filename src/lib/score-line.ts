/**
 * Lines drawn on an abcjs score by its systems (the `abcjs-lN` classes):
 * My music's start and playing lines, and the practice pages' start line
 * (start-point.ts). Kept apart from pieces/score-dom.ts so a practice page
 * does not load My music's ABC writer with it.
 */
const NS = "http://www.w3.org/2000/svg";

/** The system (line of music) an abcjs element is drawn on, or -1. */
export const lineOf = (e: Element) => Number(/abcjs-l(\d+)/.exec(e.getAttribute("class") ?? "")?.[1] ?? -1);
export const boxOf = (e: Element) => {
  try {
    return (e as SVGGraphicsElement).getBBox();
  } catch {
    return null;
  }
};

/**
 * A cursor line: a bar the full height of the system, just left of `els`
 * (the notes at one moment), behind the music. `cls` names it, so a start
 * marker and the playing cursor can both stand; `label` writes under it.
 * Empty `els` takes the line away.
 */
export function cursorLine(svgRoot: SVGSVGElement | null, els: Element[], cls: string, label = "") {
  if (!svgRoot) return;
  svgRoot.querySelectorAll(`g.${cls}`).forEach((g) => g.remove());
  let line = -1;
  let x = Infinity;
  for (const e of els) {
    const l = lineOf(e);
    const b = boxOf(e);
    if (l < 0 || !b || !b.width) continue;
    if (line < 0) line = l;
    if (l === line) x = Math.min(x, b.x);
  }
  if (line < 0 || !Number.isFinite(x)) return;
  let y1 = Infinity;
  let y2 = -Infinity;
  svgRoot.querySelectorAll(".abcjs-staff").forEach((e) => {
    if (lineOf(e) !== line) return;
    const b = boxOf(e);
    if (!b) return;
    y1 = Math.min(y1, b.y);
    y2 = Math.max(y2, b.y + b.height);
  });
  if (!Number.isFinite(y1)) return;
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", cls);
  g.setAttribute("pointer-events", "none");
  const rect = document.createElementNS(NS, "rect");
  rect.setAttribute("x", String(x - 7));
  rect.setAttribute("y", String(y1 - 8));
  rect.setAttribute("width", "4");
  rect.setAttribute("height", String(y2 - y1 + 16));
  rect.setAttribute("rx", "2");
  g.appendChild(rect);
  if (label) {
    const t = document.createElementNS(NS, "text");
    // Under the system: over it, a bar number sits where a bar starts.
    t.setAttribute("x", String(x - 5));
    t.setAttribute("y", String(y2 + 22));
    t.setAttribute("text-anchor", "middle");
    t.textContent = label;
    g.appendChild(t);
  }
  svgRoot.insertBefore(g, svgRoot.firstChild);
}
