/**
 * The beat bar under a rhythm (Blaine, 18 November 2026: "a beat bar moving
 * across the bottom alongside the notation, like in Rhythm Hero, so kids can
 * see how the beat lines up with the music"; Rhythm Hero's on learnmusic.fun
 * is "way too big and messes up the notation", so this one is a thin strip).
 *
 * Drawn inside abcjs's own SVG, under each line of music, so it scales with
 * the music and never moves it: a hairline with a tick on every beat, placed
 * where that beat falls among the notes drawn (a beat in the middle of a
 * half note sits partway along it), the bar's first beat taller and
 * numbered, and a dot that travels along it as the music plays.
 *
 * Times are in the ABC's units (L:1/32, a quarter is 8), counted from the
 * first note.
 */
import { scoreFromAbc } from "../musicxml";

/** A place in the music: a time and where it is drawn on its line. */
export type Point = { units: number; x: number };

/**
 * Where a time falls on a line, from the points drawn on it (in time order):
 * on a point, its x; between two, partway in proportion to the time; past the
 * last, the last. Pure, for the tests.
 */
export function xAt(points: Point[], units: number): number {
  if (!points.length) return 0;
  if (units <= points[0]!.units) return points[0]!.x;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (units <= b.units) return b.units === a.units ? b.x : a.x + ((units - a.units) / (b.units - a.units)) * (b.x - a.x);
  }
  return points[points.length - 1]!.x;
}

/** Each drawn note's or rest's start time, in the order abcjs draws them (the games' `cursor`). */
export function startsOf(abc: string): { starts: number[]; total: number } {
  const part = scoreFromAbc(abc).parts[0];
  const starts: number[] = [];
  let at = 0;
  for (const m of part?.measures ?? []) for (const n of m.notes) {
    starts.push(at);
    at += n.length;
  }
  return { starts, total: at };
}

const NS = "http://www.w3.org/2000/svg";
const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const lineOf = (e: Element) => Number(/abcjs-l(\d+)/.exec(e.getAttribute("class") ?? "")?.[1] ?? 0);

export type BeatBar = {
  /** Moves the dot to a time (units from the first note); null hides it. */
  set(units: number | null): void;
  remove(): void;
};

/**
 * Draws the bar into the music in `paper` (rendered with add_classes).
 * `beatUnits` is a beat's length in units (8 a quarter, 12 a dotted quarter),
 * `beatsPerBar` the beats a bar. Returns null when nothing is drawn.
 */
export function drawBeatBar(paper: HTMLElement, abc: string, beatUnits: number, beatsPerBar: number): BeatBar | null {
  const svg = paper.querySelector("svg");
  if (!svg) return null;
  svg.querySelector("g.beatbar")?.remove();
  const { starts, total } = startsOf(abc);
  const drawn = [...paper.querySelectorAll(".abcjs-note, .abcjs-rest")];
  if (!drawn.length || !total) return null;

  type Line = { points: Point[]; y: number; from: number; to: number };
  const lines = new Map<number, Line>();
  drawn.forEach((d, i) => {
    const units = starts[i];
    if (units === undefined) return;
    const head = d.querySelector(".abcjs-notehead") ?? d;
    const box = (head as SVGGraphicsElement).getBBox();
    const l = lineOf(d);
    const line = lines.get(l) ?? { points: [], y: 0, from: units, to: units, };
    line.points.push({ units, x: box.x + box.width / 2 });
    lines.set(l, line);
  });
  // Each line ends at its last bar line, at the time the next line starts (or the end).
  const order = [...lines.keys()].sort((a, b) => a - b);
  order.forEach((l, k) => {
    const line = lines.get(l)!;
    line.points.sort((a, b) => a.units - b.units);
    line.from = line.points[0]!.units;
    line.to = k + 1 < order.length ? lines.get(order[k + 1]!)!.points[0]!.units : total;
    const bars = [...svg.querySelectorAll(`.abcjs-bar.abcjs-l${l}`)].map((b) => (b as SVGGraphicsElement).getBBox());
    const endX = bars.length ? Math.max(...bars.map((b) => b.x + b.width / 2)) : line.points[line.points.length - 1]!.x + 20;
    line.points.push({ units: line.to, x: endX });
    // Under the lowest thing drawn on this line (stems, syllables), a little apart.
    const bottoms = [...svg.querySelectorAll(`.abcjs-l${l}`)].map((e) => { const b = (e as SVGGraphicsElement).getBBox(); return b.y + b.height; });
    line.y = Math.max(...bottoms) + 14;
  });

  const g = el("g", { class: "beatbar", "aria-hidden": "true" });
  const beats = Math.round(total / beatUnits);
  for (const l of order) {
    const line = lines.get(l)!;
    const x0 = line.points[0]!.x - 10, x1 = line.points[line.points.length - 1]!.x;
    g.append(el("line", { x1: x0, x2: x1, y1: line.y, y2: line.y, class: "bb-track" }));
    for (let k = 0; k < beats; k++) {
      const t = k * beatUnits;
      if (t < line.from || t >= line.to) continue;
      const x = xAt(line.points, t);
      const down = k % beatsPerBar === 0;
      g.append(el("line", { x1: x, x2: x, y1: line.y - (down ? 7 : 4), y2: line.y + (down ? 7 : 4), class: down ? "bb-tick bb-down" : "bb-tick" }));
      const label = el("text", { x, y: line.y + 19, class: "bb-num", "text-anchor": "middle" });
      label.textContent = String((k % beatsPerBar) + 1);
      g.append(label);
    }
  }
  const dot = el("circle", { r: 6, cx: 0, cy: 0, class: "bb-dot", visibility: "hidden" });
  g.append(dot);
  svg.append(g);
  // Room under the last line comes from the caller's paddingbottom (RhythmGame: 40 with the bar on).

  return {
    set(units) {
      if (units === null || units < 0 || units >= total) return void dot.setAttribute("visibility", "hidden");
      const line = order.map((l) => lines.get(l)!).find((ln) => units >= ln.from && units < ln.to) ?? lines.get(order[0]!)!;
      dot.setAttribute("cx", String(xAt(line.points, units)));
      dot.setAttribute("cy", String(line.y));
      dot.setAttribute("visibility", "visible");
    },
    remove() {
      g.remove();
    },
  };
}
