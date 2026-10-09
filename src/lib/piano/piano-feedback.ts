/**
 * What Play and grade draws on the score after a run, so the player sees
 * what they played against what is written (as grade-feedback.ts does for a
 * sung line). The notes themselves are coloured by PianoGrade (green, orange,
 * red); this adds, in one group in the abcjs SVG:
 *
 * - a wrong key: a red notehead where the key played sits on the staff, with
 *   its sharp, flat or natural, and its name;
 * - early or late: an arrow from the note to where the key went down, sized
 *   by the time between the notes, labelled in beats ("¼ beat late"), over
 *   the right hand's staff and under the left's;
 * - a note missed: a red ring round that notehead (a chord's other notes may
 *   have been right);
 * - a key that answers no note: a red notehead at its time, labelled "extra".
 *
 * Everything is placed from the drawn noteheads in the SVG's own units: a
 * staff step is half a notehead's height, so nothing needs to know the clef.
 * `clearPianoFeedback` takes it out; a redraw of the score removes it too.
 */
import { keySignatures } from "../../resources/key-signatures";
import { beatsWords, midiName, midiOf, PIANO_STRICTNESS, type Hand, type NoteResult, type PianoResult, type PianoStrictness, type PlayedNote } from "./grade-piano";

const NS = "http://www.w3.org/2000/svg";
const GROUP_CLASS = "piano-feedback";
const BAD = "#d13f2f";
const LATE = "#c26a00";

type Box = { x: number; right: number; y: number; top: number; bottom: number; h: number };

export function clearPianoFeedback(svg: Element | null) {
  svg?.querySelectorAll(`.${GROUP_CLASS}`).forEach((g) => g.remove());
}

/** A played key spelled in the key: the written pitch it sits on (noteArray index) and the accidental it needs, if any. */
export function spell(key: string, midi: number): { pitch: number; accidental: "♯" | "♭" | "♮" | null } {
  const around = Math.floor((midi - 36) / 12) * 7;
  const sharpKey = (keySignatures[key]?.flats.length ?? 0) === 0;
  const range = Array.from({ length: 22 }, (_, i) => around - 7 + i);
  // In the key: written plain.
  for (const p of range) if (midiOf(key, p) === midi) return { pitch: p, accidental: null };
  // A white key the key alters (F natural in G): its own letter, with a natural.
  for (const p of range) if (midiOf("C", p) === midi) return { pitch: p, accidental: "♮" };
  // Otherwise a sharp key raises the letter below, a flat key lowers the letter above.
  for (const p of range) {
    const natural = midiOf("C", p);
    if (natural === midi + (sharpKey ? -1 : 1)) return { pitch: p, accidental: sharpKey ? "♯" : "♭" };
  }
  return { pitch: around, accidental: null };
}

export function drawPianoFeedback(o: {
  svg: SVGSVGElement;
  key: string;
  result: PianoResult;
  /** Each hand's drawn notes (score-elements.ts). */
  els: Record<Hand, Element[][]>;
  /** Each hand's note lengths, in time units, in order. */
  lengths: Record<Hand, number[]>;
  t0: number;
  bpm: number;
  beatUnits: number;
  strictness: PianoStrictness;
}) {
  clearPianoFeedback(o.svg);
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", GROUP_CLASS);
  g.setAttribute("pointer-events", "none");
  o.svg.appendChild(g);

  const box = (el: Element): Box | null => {
    const b = (el as SVGGraphicsElement).getBBox?.();
    return b ? { x: b.x, right: b.x + b.width, y: b.y + b.height / 2, top: b.y, bottom: b.y + b.height, h: b.height } : null;
  };
  /** The noteheads of one drawn note, lowest pitch first. */
  const headsOf = (hand: Hand, index: number): Box[] =>
    (o.els[hand][index] ?? [])
      .flatMap((e) => (e.matches?.(".abcjs-notehead") ? [e] : [...(e.querySelectorAll?.(".abcjs-notehead") ?? [])]))
      .map(box)
      .filter((b): b is Box => !!b)
      .sort((a, b) => b.y - a.y);
  /** A drawn note's whole extent (its noteheads), for placing arrows clear of it. */
  const extentOf = (hand: Hand, index: number): Box | null => {
    const heads = headsOf(hand, index);
    if (heads.length) {
      return {
        x: Math.min(...heads.map((h) => h.x)),
        right: Math.max(...heads.map((h) => h.right)),
        y: heads[0].y,
        top: Math.min(...heads.map((h) => h.top)),
        bottom: Math.max(...heads.map((h) => h.bottom)),
        h: heads[0].h,
      };
    }
    // A rest: its own box.
    const el = o.els[hand][index]?.[0];
    return el ? box(el) : null;
  };

  const sizes = (["rh", "lh"] as Hand[]).flatMap((h) => o.els[h].map((_, i) => headsOf(h, i)[0]?.h ?? 0)).filter((h) => h > 0).sort((a, b) => a - b);
  const space = sizes[sizes.length >> 1] ?? 8;
  const step = space / 2;
  const stroke = Math.max(1.2, space * 0.22);

  const staves = [...o.svg.querySelectorAll(".abcjs-staff")].map(box).filter((b): b is Box => !!b);
  /** The staff a point is on: the one whose lines it is nearest, among those across it. */
  const staffAt = (x: number, y: number): Box | null => {
    const across = staves.filter((s) => x >= s.x - space && x <= s.right + space);
    const dist = (s: Box) => (y < s.top ? s.top - y : y > s.bottom ? y - s.bottom : 0);
    return across.sort((a, b) => dist(a) - dist(b))[0] ?? null;
  };

  const el = (name: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    g.appendChild(e);
    return e;
  };
  const label = (x: number, y: number, text: string, color: string, anchor: "middle" | "start" | "end" = "middle", size = 1.15) => {
    const t = el("text", { x, y, fill: color, "font-size": space * size, "font-weight": 800, "font-family": "Nunito, system-ui, sans-serif", "text-anchor": anchor, stroke: "none" }) as SVGTextElement;
    t.style.stroke = "none";
    t.textContent = text;
  };
  /** A notehead of the key played, at its place on the staff, with its accidental and name. */
  const ghost = (x: number, y: number, midi: number, name: string) => {
    el("ellipse", { cx: x, cy: y, rx: space * 0.62, ry: space * 0.44, transform: `rotate(-20 ${x} ${y})`, fill: BAD, opacity: 0.9 });
    const { accidental } = spell(o.key, midi);
    if (accidental) label(x - space * 1.2, y + space * 0.5, accidental, BAD, "middle", 1.4);
    label(x + space * 1, y + space * 0.5, name, BAD, "start", 1.5);
  };
  /** Where time `u` (units) falls along a hand's line, from its noteheads; and that note. */
  const starts: Record<Hand, number[]> = { rh: [], lh: [] };
  for (const hand of ["rh", "lh"] as Hand[]) {
    let t = 0;
    starts[hand] = o.lengths[hand].map((len) => ((t += len), t - len));
  }
  /** Pixels per time unit at a note: to the next note on its line, else from the one before. */
  const perUnit = (hand: Hand, i: number): number => {
    const a = extentOf(hand, i);
    const b = extentOf(hand, i + 1);
    if (a && b && b.x > a.x && Math.abs(b.y - a.y) < 12 * space) return (b.x - a.x) / Math.max(1, o.lengths[hand][i]);
    const p = extentOf(hand, i - 1);
    if (a && p && a.x > p.x) return (a.x - p.x) / Math.max(1, o.lengths[hand][i - 1]);
    return space / 2;
  };

  const win = PIANO_STRICTNESS[o.strictness].onsetBeats;
  /** A chord gets one arrow, the largest miss; notes are grouped by hand and place. */
  const groups = new Map<string, NoteResult[]>();
  for (const n of o.result.notes) {
    const k = `${n.hand}:${n.index}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }

  for (const notes of groups.values()) {
    const { hand, index } = notes[0];
    const heads = headsOf(hand, index);
    const ext = extentOf(hand, index);
    if (!ext) continue;
    const staff = staffAt(ext.x, ext.y);
    // Each note of the chord, lowest first, against its own notehead.
    notes
      .slice()
      .sort((a, b) => a.midi - b.midi)
      .forEach((n, k) => {
        const head = heads[k] ?? heads[0];
        if (!head || n.verdict !== "missed") return;
        // Missed: a ring round its notehead.
        el("ellipse", { cx: (head.x + head.right) / 2, cy: head.y, rx: space * 0.95, ry: space * 0.75, fill: "none", stroke: BAD, "stroke-width": stroke });
        if (n.playedInstead === undefined) {
          // Nothing played for it: said in words, over the right hand's staff and under the left's.
          const missedAbove = hand === "rh";
          const my = missedAbove ? Math.min(ext.top, staff?.top ?? ext.top) - 1.2 * space : Math.max(ext.bottom, staff?.bottom ?? ext.bottom) + 2.4 * space;
          label((head.x + head.right) / 2, my, "missed", BAD, "middle", 1.4);
          return;
        }
        // What was played instead, beside it.
        const { pitch } = spell(o.key, n.playedInstead);
        const name = midiName(n.playedInstead).replace(/-?\d+$/, "") + (Math.abs(n.playedInstead - n.midi) >= 12 ? midiName(n.playedInstead).match(/-?\d+$/)?.[0] ?? "" : "");
        ghost(head.right + space * 1.8, head.y - (pitch - n.pitch) * step, n.playedInstead, name);
      });

    // Early or late: the chord's largest miss, as an arrow to where the key went down.
    const timed = notes.filter((n) => n.offBeats !== undefined && Math.abs(n.offBeats) > win);
    if (!timed.length) continue;
    const worst = timed.reduce((w, n) => (Math.abs(n.offBeats!) > Math.abs(w.offBeats!) ? n : w));
    const off = worst.offBeats!;
    const late = off > 0;
    const color = worst.credit > 0 ? LATE : BAD;
    const x0 = (ext.x + ext.right) / 2;
    const reach = Math.max(2.4 * space, Math.abs(off * o.beatUnits * perUnit(hand, index)));
    const x1 = x0 + (late ? reach : -reach);
    // Over the right hand's staff, under the left's, clear of the note.
    const above = hand === "rh";
    const y = above ? Math.min(ext.top, staff?.top ?? ext.top) - 1.6 * space : Math.max(ext.bottom, staff?.bottom ?? ext.bottom) + 1.8 * space;
    const tip = space * 0.5;
    el("path", {
      d: `M${x0},${y - space * 0.55} V${y + space * 0.55} M${x0},${y} H${x1} M${x1},${y} l${late ? -tip : tip},${-tip} M${x1},${y} l${late ? -tip : tip},${tip}`,
      stroke: color,
      "stroke-width": stroke,
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    label((x0 + x1) / 2, above ? y - space * 0.9 : y + space * 2, beatsWords(off), color, "middle", 1.45);
  }

  // A key that answers no written note: a red notehead where it fell in time,
  // on the hand whose notes it is nearer in pitch.
  const unitMs = 60_000 / Math.max(1, o.bpm) / o.beatUnits;
  for (const k of o.result.strays) {
    const u = (k.t - o.t0) / unitMs;
    const hand: Hand = nearerHand(o.result, k, u);
    let i = 0;
    while (i + 1 < starts[hand].length && starts[hand][i + 1] <= u) i++;
    const ext = extentOf(hand, i);
    const written = o.result.notes.filter((n) => n.hand === hand && n.index === i).sort((a, b) => a.midi - b.midi)[0];
    if (!ext) continue;
    const x = ext.x + (u - starts[hand][i]) * perUnit(hand, i) + space * 0.5;
    // Placed by staff steps from the note sounding then (or from the staff's middle line, over a rest).
    const ref = written ?? null;
    const y = ref ? ext.y - (spell(o.key, k.midi).pitch - ref.pitch) * step : staffAt(ext.x, ext.y)?.y ?? ext.y;
    el("ellipse", { cx: x, cy: y, rx: space * 0.62, ry: space * 0.44, transform: `rotate(-20 ${x} ${y})`, fill: "none", stroke: BAD, "stroke-width": stroke });
    label(x, y - space * 1.3, `extra ${midiName(k.midi).replace(/-?\d+$/, "")}`, BAD, "middle", 1.4);
  }
}

/** Which hand a stray key belongs to: the one whose note sounding then is nearer in pitch (the right hand from middle C up otherwise). */
function nearerHand(result: PianoResult, k: PlayedNote, u: number): Hand {
  const sounding = (hand: Hand) => result.notes.filter((n) => n.hand === hand && n.start <= u && u < n.start + n.length).map((n) => n.midi);
  const dist = (hand: Hand) => Math.min(Infinity, ...sounding(hand).map((m) => Math.abs(m - k.midi)));
  const r = dist("rh");
  const l = dist("lh");
  if (r === Infinity && l === Infinity) return k.midi >= 60 ? "rh" : "lh";
  return r <= l ? "rh" : "lh";
}
