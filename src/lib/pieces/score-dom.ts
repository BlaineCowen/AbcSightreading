import type { PieceScore, PieceNote } from "./model";
import { drawnElements, type PieceAbc } from "./write-abc";

/**
 * The drawn score and the model, side by side: which drawn element is which
 * note (and so which bar), shading a run of bars, and a cursor driven by the
 * audio clock rather than abcjs's timer (the piece's assignment view draws
 * the whole piece and plays only the assigned bars).
 */

export type NoteEl = {
  part: number;
  index: number;
  note: PieceNote;
  /** abcjs's parsed element (what its clickListener hands back). */
  el: unknown;
  /** Its SVG. */
  svg: Element[];
};

export function noteElements(tune: unknown, drawn: PieceAbc, score: PieceScore): NoteEl[] {
  const out: NoteEl[] = [];
  const els = drawnElements(tune as Parameters<typeof drawnElements>[0], drawn.staves);
  for (const v of drawn.voices) {
    const notes = score.parts[v.part].notes;
    (els.get(v.id) ?? []).forEach((el, k) => {
      const i = v.elements[k];
      if (i === undefined || i < 0) return;
      const svg = ((el as { abselem?: { elemset?: Element[] } }).abselem?.elemset ?? []) as Element[];
      out.push({ part: v.part, index: i, note: notes[i], el, svg });
    });
  }
  return out;
}

const NS = "http://www.w3.org/2000/svg";
const SHADE = "piece-shade";

const lineOf = (e: Element) => Number(/abcjs-l(\d+)/.exec(e.getAttribute("class") ?? "")?.[1] ?? -1);
const boxOf = (e: Element) => {
  try {
    return (e as SVGGraphicsElement).getBBox();
  } catch {
    return null;
  }
};

/**
 * Shades runs of bars, behind the music: per system, from the run's first
 * note to its last, the system's full height, with a label on the first.
 */
export function shadeBars(svgRoot: SVGSVGElement | null, items: NoteEl[], runs: { from: number; to: number; cls: string; label: string }[]) {
  if (!svgRoot) return;
  svgRoot.querySelectorAll(`.${SHADE}`).forEach((g) => g.remove());
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", SHADE);
  g.setAttribute("pointer-events", "none");
  svgRoot.insertBefore(g, svgRoot.firstChild);
  // A system's height: everything abcjs drew on that line.
  const height = new Map<number, { y1: number; y2: number }>();
  svgRoot.querySelectorAll("[class*='abcjs-l']").forEach((e) => {
    const l = lineOf(e);
    const b = boxOf(e);
    if (l < 0 || !b || !b.height) return;
    const h = height.get(l) ?? { y1: Infinity, y2: -Infinity };
    height.set(l, { y1: Math.min(h.y1, b.y), y2: Math.max(h.y2, b.y + b.height) });
  });
  for (const run of runs) {
    const byLine = new Map<number, { x1: number; x2: number }>();
    for (const it of items) {
      if (it.note.measure < run.from || it.note.measure > run.to) continue;
      for (const e of it.svg) {
        const l = lineOf(e);
        const b = boxOf(e);
        if (l < 0 || !b) continue;
        const r = byLine.get(l) ?? { x1: Infinity, x2: -Infinity };
        byLine.set(l, { x1: Math.min(r.x1, b.x), x2: Math.max(r.x2, b.x + b.width) });
      }
    }
    [...byLine.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([l, r], k) => {
        const h = height.get(l);
        if (!h) return;
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("class", run.cls);
        rect.setAttribute("x", String(r.x1 - 10));
        rect.setAttribute("y", String(h.y1 - 6));
        rect.setAttribute("width", String(r.x2 - r.x1 + 20));
        rect.setAttribute("height", String(h.y2 - h.y1 + 12));
        rect.setAttribute("rx", "10");
        g.appendChild(rect);
        if (k === 0 && run.label) {
          const t = document.createElementNS(NS, "text");
          t.setAttribute("class", `${run.cls}-label`);
          t.setAttribute("x", String(r.x1 - 6));
          t.setAttribute("y", String(h.y1 - 10));
          t.textContent = run.label;
          g.appendChild(t);
        }
      });
  }
}

/** The bar a tapped element belongs to, or null. */
export function barOfElement(items: NoteEl[], el: unknown): number | null {
  return items.find((it) => it.el === el)?.note.measure ?? null;
}

/** The cursor: which drawn notes sound at a tick (rests too, so it moves through them). */
export function soundingAt(items: NoteEl[], tick: number): Element[] {
  const out: Element[] = [];
  for (const it of items) if (it.note.start <= tick && tick < it.note.start + it.note.length) out.push(...it.svg);
  return out;
}
