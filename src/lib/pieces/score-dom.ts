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

/** Where a bar sits on one system: barline to barline, the system's full height. */
export type BarBox = { bar: number; line: number; x1: number; x2: number; y1: number; y2: number };

/**
 * Every drawn bar's box, from the barlines abcjs drew: a click anywhere in a
 * bar (between its notes, on an empty staff) finds it, not only a notehead.
 * Which model bar a box is comes from the notes inside it.
 */
export function barBoxes(svgRoot: SVGSVGElement | null, items: NoteEl[]): BarBox[] {
  if (!svgRoot) return [];
  const lines = new Map<number, { y1: number; y2: number; x1: number; x2: number; bars: number[] }>();
  const lineAt = (l: number) => {
    let v = lines.get(l);
    if (!v) lines.set(l, (v = { y1: Infinity, y2: -Infinity, x1: Infinity, x2: -Infinity, bars: [] }));
    return v;
  };
  svgRoot.querySelectorAll("[class*='abcjs-l']").forEach((e) => {
    const l = lineOf(e);
    const b = boxOf(e);
    if (l < 0 || !b || !b.height) return;
    const v = lineAt(l);
    v.y1 = Math.min(v.y1, b.y);
    v.y2 = Math.max(v.y2, b.y + b.height);
  });
  svgRoot.querySelectorAll(".abcjs-staff").forEach((e) => {
    const l = lineOf(e);
    const b = boxOf(e);
    if (l < 0 || !b) return;
    const v = lineAt(l);
    v.x1 = Math.min(v.x1, b.x);
    v.x2 = Math.max(v.x2, b.x + b.width);
  });
  svgRoot.querySelectorAll(".abcjs-bar").forEach((e) => {
    const l = lineOf(e);
    const b = boxOf(e);
    if (l < 0 || !b) return;
    lineAt(l).bars.push(b.x + b.width / 2);
  });
  // Each note's centre, by line, says which model bar each gap between barlines is.
  const notesBy = new Map<number, { x: number; bar: number }[]>();
  for (const it of items) {
    for (const e of it.svg) {
      const l = lineOf(e);
      const b = boxOf(e);
      if (l < 0 || !b || !b.width) continue;
      const list = notesBy.get(l) ?? [];
      list.push({ x: b.x + b.width / 2, bar: it.note.measure });
      notesBy.set(l, list);
      break;
    }
  }
  const out: BarBox[] = [];
  for (const [l, v] of lines) {
    const notes = notesBy.get(l);
    if (!notes?.length || !Number.isFinite(v.x1)) continue;
    // Barlines from every staff of the system at one x are one barline.
    const edges = [v.x1, ...v.bars.sort((a, b) => a - b)].filter((x, k, xs) => k === 0 || x - xs[k - 1] > 4);
    if (v.x2 - edges[edges.length - 1] > 8) edges.push(v.x2);
    for (let k = 0; k + 1 < edges.length; k++) {
      const inside = notes.filter((n) => n.x > edges[k] && n.x < edges[k + 1]);
      if (!inside.length) continue;
      out.push({ bar: Math.min(...inside.map((n) => n.bar)), line: l, x1: edges[k], x2: edges[k + 1], y1: v.y1 - 6, y2: v.y2 + 6 });
    }
  }
  return out;
}

/**
 * Shades runs of bars, behind the music: per system, from the run's first
 * bar to its last, with a label on the first.
 */
export function shadeBars(svgRoot: SVGSVGElement | null, boxes: BarBox[], runs: { from: number; to: number; cls: string; label: string }[]) {
  if (!svgRoot) return;
  svgRoot.querySelectorAll(`.${SHADE}`).forEach((g) => g.remove());
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", SHADE);
  g.setAttribute("pointer-events", "none");
  svgRoot.insertBefore(g, svgRoot.firstChild);
  for (const run of runs) {
    const byLine = new Map<number, BarBox>();
    for (const b of boxes) {
      if (b.bar < run.from || b.bar > run.to) continue;
      const r = byLine.get(b.line);
      byLine.set(b.line, r ? { ...r, x1: Math.min(r.x1, b.x1), x2: Math.max(r.x2, b.x2) } : b);
    }
    [...byLine.values()]
      .sort((a, b) => a.line - b.line)
      .forEach((r, k) => {
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("class", run.cls);
        rect.setAttribute("x", String(r.x1 + 1));
        rect.setAttribute("y", String(r.y1));
        rect.setAttribute("width", String(Math.max(0, r.x2 - r.x1 - 2)));
        rect.setAttribute("height", String(r.y2 - r.y1));
        rect.setAttribute("rx", "10");
        g.appendChild(rect);
        if (k === 0 && run.label) {
          const t = document.createElementNS(NS, "text");
          t.setAttribute("class", `${run.cls}-label`);
          t.setAttribute("x", String(r.x1 + 4));
          t.setAttribute("y", String(r.y1 - 4));
          t.textContent = run.label;
          g.appendChild(t);
        }
      });
  }
}

const HITS = "piece-hits";

/**
 * A clickable box over every bar, on top of the music (the assign form's
 * picker): each carries `data-bar`, so the page reads clicks and hovers by
 * delegation.
 */
export function barHits(svgRoot: SVGSVGElement | null, boxes: BarBox[]) {
  if (!svgRoot) return;
  svgRoot.querySelectorAll(`.${HITS}`).forEach((g) => g.remove());
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", HITS);
  for (const b of boxes) {
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("class", "bar-hit");
    rect.setAttribute("data-bar", String(b.bar));
    rect.setAttribute("x", String(b.x1 + 1));
    rect.setAttribute("y", String(b.y1));
    rect.setAttribute("width", String(Math.max(0, b.x2 - b.x1 - 2)));
    rect.setAttribute("height", String(b.y2 - b.y1));
    rect.setAttribute("rx", "8");
    g.appendChild(rect);
  }
  svgRoot.appendChild(g);
}

/** The bar under a pointer event on a `barHits` box, or null. */
export function barFromEvent(e: Event): number | null {
  const el = (e.target as Element | null)?.closest?.("[data-bar]");
  return el ? Number(el.getAttribute("data-bar")) : null;
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
