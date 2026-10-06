import { DETECT_LATENCY_MS, centsOffAnyOctave, solfegeOf, stepsBetween, type GradeNote, type PerfResult } from "./grade";
import type { GradeTrace } from "./grade-runner";
import type { ClapResult } from "./grade-rhythm";

/**
 * What Grade draws on the score after a run, so the singer sees what they sang
 * against what is written: a trace of the pitch they sang, drawn through the
 * notes in time (blue where it was the note, red where it was not, a gap where
 * nothing was sung); and in Pitch & rhythm, a tick where they came in when it
 * was early or late, a line under a note let go early, and a cross over a rest
 * sung through. The notes themselves are coloured by the page (grade-good and
 * so on).
 *
 * Everything goes into one group in the abcjs SVG, in the SVG's own units,
 * and `clearGradeFeedback` takes it out; a redraw of the score removes it too.
 *
 * Where the trace sits: each frame belongs to a note (by time in Pitch &
 * rhythm, by the note being waited on in Pitch only); its x is how far through
 * that note's time it is, between that note and the next on its line; its y is
 * that note's own notehead, moved by the staff steps from the written pitch to
 * the sung one (in the key, in the nearest octave). Measured from each
 * notehead, nothing needs to know the clef.
 */

const NS = "http://www.w3.org/2000/svg";
const GROUP_CLASS = "grade-overlay";

/** A note as drawn: abcjs's selectable for it (what `drawnNotes()` returns). */
type Drawn = { absEl?: { elemset?: Element[] } } | undefined;

type Head = { x: number; right: number; y: number; h: number; line: Element | null };

function headOf(d: Drawn): Head | null {
  const els = (d?.absEl?.elemset ?? []) as Element[];
  const head = els.map((e) => (e.matches?.(".abcjs-notehead") ? e : e.querySelector?.(".abcjs-notehead"))).find(Boolean) as SVGGraphicsElement | undefined;
  const el = (head ?? els[0]) as SVGGraphicsElement | undefined;
  if (!el?.getBBox) return null;
  const b = el.getBBox();
  return { x: b.x, right: b.x + b.width, y: b.y + b.height / 2, h: b.height, line: el.closest?.(".abcjs-staff-wrapper") ?? null };
}

export function clearGradeFeedback(svg: Element | null) {
  svg?.querySelectorAll(`.${GROUP_CLASS}`).forEach((g) => g.remove());
}

export function drawGradeFeedback(o: {
  svg: SVGSVGElement;
  notes: GradeNote[];
  /** The drawn note for each graded note, in order. */
  drawn: Drawn[];
  /** The drawn rests, matched to perf.rests by their place among the notes and rests. */
  drawnAt: (cursor: number) => Drawn;
  trace: GradeTrace;
  perf: PerfResult | null;
  /** A rhythm clapped: each note's clap and the stray claps (no pitch trace). */
  claps?: ClapResult | null;
  doPc: number;
  /** Beats a note may be early or late with full credit (the strictness). */
  onsetBeats: number;
  bpm: number;
}) {
  clearGradeFeedback(o.svg);
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", GROUP_CLASS);
  g.setAttribute("pointer-events", "none");
  o.svg.appendChild(g);

  const heads = o.drawn.map(headOf);
  // A staff step is half a space; a notehead is about a space tall.
  const sizes = heads.filter(Boolean).map((h) => h!.h).sort((a, b) => a - b);
  const space = sizes[sizes.length >> 1] ?? 8;
  const step = space / 2;
  const stroke = Math.max(1.4, space * 0.28);

  // Where each note's time runs, across the page: from its notehead to the
  // next note's on the same line (or a little past its own at a line's end).
  const lanes = heads.map((h, i) => {
    if (!h) return null;
    const next = heads[i + 1];
    const end = next && next.line === h.line && next.x > h.x ? next.x : h.right + 3 * space;
    return { from: h.x + space * 0.2, to: end - space * 0.3, y: h.y };
  });

  const path = (pts: [number, number][], color: string) => {
    if (pts.length < 2) return;
    const p = document.createElementNS(NS, "polyline");
    p.setAttribute("points", pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", color);
    p.setAttribute("stroke-width", String(stroke));
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("opacity", "0.85");
    g.appendChild(p);
  };

  // The trace, note by note. In time, each frame is moved back by the
  // detector's delay, as the grading does; otherwise every note's line began
  // with a blip of the note before. Pitch only's spans are the detector's own.
  const lag = o.trace.mode === "performance" ? DETECT_LATENCY_MS : 0;
  const GOOD = "#2f6fe0";
  const BAD = "#d13f2f";
  o.notes.forEach((n, i) => {
    const lane = lanes[i];
    const span = o.trace.spans[i];
    if (!lane || !span || span.to <= span.from) return;
    let run: [number, number][] = [];
    let color = GOOD;
    const flush = () => {
      path(run, color);
      run = [];
    };
    for (const raw of o.trace.frames) {
      const f = { ...raw, t: raw.t - lag };
      if (f.t < span.from || f.t >= span.to) continue;
      if (f.midi === null) {
        flush();
        continue;
      }
      const sung = f.midi + f.cents / 100;
      const off = centsOffAnyOctave(sung, n.midi);
      // Out of range of the staff (a wild octave jump): leave a gap.
      if (Math.abs(off) > 450) {
        flush();
        continue;
      }
      const c = Math.abs(off) <= o.trace.tolerance ? GOOD : BAD;
      if (c !== color && run.length) {
        const last = run[run.length - 1];
        flush();
        run.push(last);
      }
      color = c;
      const x = lane.from + ((f.t - span.from) / (span.to - span.from)) * (lane.to - lane.from);
      const y = lane.y - stepsBetween(n.midi + off / 100, n.midi, o.doPc) * step;
      run.push([x, y]);
    }
    flush();
  });

  const LATE = "#c26a00";
  const beatMs = 60_000 / Math.max(1, o.bpm);
  const cross = (x: number, y: number, color: string) => {
    const s = space * 0.6;
    const c = document.createElementNS(NS, "path");
    c.setAttribute("d", `M${x - s},${y - s} L${x + s},${y + s} M${x + s},${y - s} L${x - s},${y + s}`);
    c.setAttribute("stroke", color);
    c.setAttribute("stroke-width", String(stroke));
    c.setAttribute("stroke-linecap", "round");
    g.appendChild(c);
  };
  const label = (x: number, y: number, text: string, color: string) => {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("fill", color);
    t.setAttribute("font-size", String(space * 1.25));
    t.setAttribute("font-weight", "700");
    t.setAttribute("font-family", "Nunito, system-ui, sans-serif");
    t.setAttribute("text-anchor", "middle");
    // abcjs's styles outline SVG text; a label is plain.
    t.setAttribute("stroke", "none");
    t.style.stroke = "none";
    t.textContent = text;
    g.appendChild(t);
  };
  /**
   * Came in early or late: an arrow above the staff from the note to where
   * the sound came in - pointing right for late, left for early - labelled,
   * orange where the note still had some credit and red where it had none.
   */
  const arrow = (i: number, onsetBeats: number | null, credit: number) => {
    const h = heads[i];
    const lane = lanes[i];
    const span = o.trace.spans[i];
    if (!h || !lane || !span || onsetBeats === null || Math.abs(onsetBeats) <= o.onsetBeats) return;
    const late = onsetBeats > 0;
    const color = credit > 0 ? LATE : BAD;
    // Where it came in: its time on this note's lane (early runs back toward the note before).
    const perMs = (lane.to - lane.from) / Math.max(1, span.to - span.from);
    const at = h.x + onsetBeats * beatMs * perMs;
    const reach = Math.max(1.6 * space, Math.abs(at - h.x));
    const x0 = h.x + space * 0.5;
    const x1 = x0 + (late ? reach : -reach);
    const y = h.y - 4.2 * space;
    const head = space * 0.55;
    const p = document.createElementNS(NS, "path");
    p.setAttribute(
      "d",
      `M${x0},${y - space * 0.6} V${y + space * 0.6} M${x0},${y} H${x1} M${x1},${y} l${late ? -head : head},${-head} M${x1},${y} l${late ? -head : head},${head}`,
    );
    p.setAttribute("stroke", color);
    p.setAttribute("stroke-width", String(stroke * 0.85));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    g.appendChild(p);
    label((x0 + x1) / 2, y - space * 0.9, late ? "late" : "early", color);
  };

  if (o.claps) {
    o.claps.notes.forEach((r, i) => {
      arrow(i, r.onsetBeats, r.rhythm);
      const h = heads[i];
      if (r.missed && h) label(h.x + space * 0.5, h.y - 3.8 * space, "missed", BAD);
    });
    // A stray clap: a cross above the staff, where it fell in time - between
    // the notes either side of it, at its share of the way from one to the next.
    for (const stray of o.claps.strays) {
      let i = -1;
      while (i + 1 < o.notes.length && o.notes[i + 1].startUnits <= stray.units) i++;
      const k = Math.max(0, i);
      const h = heads[k];
      const lane = lanes[k];
      if (!h || !lane) continue;
      const from = o.notes[k].startUnits;
      const to = o.notes[k + 1]?.startUnits ?? from + o.notes[k].lengthUnits;
      const share = i < 0 ? -0.5 : Math.min(1, (stray.units - from) / Math.max(1, to - from));
      const x = i < 0 ? h.x - 2 * space : lane.from + share * (lane.to - lane.from);
      cross(x, h.y - 4 * space, BAD);
      label(x, h.y - 5.4 * space, "extra", BAD);
    }
    return;
  }

  if (!o.perf) return;
  o.perf.notes.forEach((r, i) => {
    const h = heads[i];
    const lane = lanes[i];
    if (!h || !lane) return;
    arrow(i, r.onsetBeats, r.rhythm);
    // A wrong note: the note that was sung, beside the written one - a red
    // notehead where it sits on the staff (in the octave nearest the written
    // note), a sharp or flat if it is outside the key, and its name.
    if (!r.missed && !r.pitchOk && r.sung !== null && r.sung !== undefined) {
      const n = o.notes[i];
      const sung = Math.round(n.midi + centsOffAnyOctave(r.sung, n.midi) / 100);
      if (sung !== n.midi) {
        const x = h.right + space * 0.9;
        const y = h.y - stepsBetween(sung, n.midi, o.doPc) * step;
        const head = document.createElementNS(NS, "ellipse");
        head.setAttribute("cx", String(x));
        head.setAttribute("cy", String(y));
        head.setAttribute("rx", String(space * 0.62));
        head.setAttribute("ry", String(space * 0.44));
        head.setAttribute("transform", `rotate(-20 ${x} ${y})`);
        head.setAttribute("fill", BAD);
        head.setAttribute("opacity", "0.9");
        g.appendChild(head);
        const degree = ((sung - o.doPc) % 12 + 12) % 12;
        if (![0, 2, 4, 5, 7, 9, 11].includes(degree)) label(x - space * 1.15, y + space * 0.45, sung > n.midi ? "♯" : "♭", BAD);
        label(x + space * 1.9, y + space * 0.45, solfegeOf(sung, o.doPc), BAD);
      }
    }
    // Let go early: a line under the note, as long as it was meant to last.
    if (r.cutShort) {
      const line = document.createElementNS(NS, "line");
      const y = h.y + 4.2 * space;
      line.setAttribute("x1", String(lane.from));
      line.setAttribute("x2", String(lane.to));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", LATE);
      line.setAttribute("stroke-width", String(stroke * 0.8));
      line.setAttribute("stroke-dasharray", `${space * 0.6} ${space * 0.4}`);
      g.appendChild(line);
    }
  });
  // A rest sung through: a cross over it.
  for (const rest of o.perf.rests) {
    if (!rest.sung) continue;
    const h = headOf(o.drawnAt(rest.cursor));
    if (!h) continue;
    cross((h.x + h.right) / 2, h.y - 3 * space, BAD);
  }
}
