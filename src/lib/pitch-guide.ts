import { stepsBetween, type Outcome } from "./grade";
import type { Head } from "./grade-feedback";

/**
 * Pip, the pitch guide (Grade's Note by note): while a note is waited on, a
 * ball with a face rides up and down the staff at the pitch being sung, at
 * the note on the cursor, so the singer sees where they are against where the
 * note is. Its colour is how close (peach far off, butter within a semitone,
 * mint in tune), a tag above it says which way and how many cents, a dashed
 * line points to the note, and the last second of singing streams out behind
 * it. The ring round the note fills as the note is held; when the runner
 * credits it, confetti and "First try!" or "Fixed it!". A different note held
 * for a moment shows as a ghost notehead beside the written one, named.
 *
 * Drawn into the abcjs SVG in its own units, like grade-feedback.ts, so it
 * scales and scrolls with the score; placed by staff steps from the note's
 * own notehead in the key, so nothing needs the clef. The sung pitch is the
 * runner's (every 50 ms), folded into the written note's octave; the ball
 * follows it on a spring each frame so it moves smoothly.
 */

const NS = "http://www.w3.org/2000/svg";
const CLASS = "pitch-guide";
const INK = "#15213a";
const FILL = { in: "#2fb383", near: "#ffcf33", far: "#ff8a66" } as const;
const TAG = { in: ["#bdebd9", "#0f3b2c"], near: ["#ffefa8", "#5c4a00"], far: ["#ffd3bf", "#5a2310"] } as const;
const CONFETTI_COLORS = ["#2fb383", "#ffcf33", "#ff8a66", "#6aa8f2", "#2f6fe0"];
type Zone = keyof typeof FILL;

/** How long the trail behind the ball lasts, and how many segments it may draw. */
const TRAIL_MS = 1200;
const TRAIL_POOL = 48;
/** A pitch this far off, held this long on one semitone, is a different note. */
const WRONG_CENTS = 70;
const WRONG_HOLD_MS = 250;
/** Sizes in staff spaces: the ball's radius, the ring's, a tag's lettering. */
const PIP_R = 1.3;
const RING_R = 1.8;
const TAG_SIZE = 1.2;

export type GuideFeed = {
  sung: number | null;
  cents: number | null;
  hold: number;
  credited: boolean;
  outcome?: Outcome | null;
  helping: boolean;
};

type Spot = { svg: SVGSVGElement; head: Head };

type Bit = { el: SVGElement; x: number; y: number; vx: number; vy: number; rot: number; life: number; max: number };

const make = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

export class PitchGuide {
  private g = make("g", { class: CLASS, "pointer-events": "none" });
  private trailG = make("g", {}, this.g);
  private trail: SVGLineElement[] = [];
  private ring = make("circle", { fill: "none", stroke: "#6aa8f2", "stroke-width": 1.6 }, this.g);
  private arc = make("circle", { fill: "none", stroke: FILL.in, "stroke-width": 2.6, "stroke-linecap": "round" }, this.g);
  private ghost = make("g", { display: "none" }, this.g);
  private ghostHead = make("ellipse", { fill: "rgba(226,85,58,.18)", stroke: "#e2553a", "stroke-width": 1.2 }, this.ghost);
  private ghostTag = this.tag(this.ghost);
  private elastic = make("line", { stroke: "#56637f", "stroke-width": 1.1, "stroke-dasharray": "3 3.5", "stroke-linecap": "round" }, this.g);
  private pip = make("g", {}, this.g);
  private body = make("circle", { stroke: INK, "stroke-width": 1.3 }, this.pip);
  private open = make("g", {}, this.pip);
  private happy = make("g", {}, this.pip);
  private mouth = make("path", { fill: "none", stroke: INK, "stroke-width": 1.2, "stroke-linecap": "round" }, this.pip);
  private pupils: SVGCircleElement[] = [];
  private hint = this.tag(this.g);
  private bits = make("g", {}, this.g);
  private cheer = make("text", { "text-anchor": "middle", "font-family": "Fredoka, Nunito, system-ui, sans-serif", "font-weight": 600, fill: "#1d7a56", display: "none" }, this.g);

  private spot: Spot | null = null;
  private locate: (() => Spot | null) | null = null;
  private target: number | null = null;
  private feedV: GuideFeed = { sung: null, cents: null, hold: 0, credited: false, helping: false };
  private credited = false;
  private x = 0;
  private y: number | null = null;
  private vy = 0;
  private alpha = 0;
  private points: { t: number; y: number | null; z: Zone }[] = [];
  private cand: { semi: number; since: number } | null = null;
  private wrongSemi: number | null = null;
  private confetti: Bit[] = [];
  private cheerAt = 0;
  private raf = 0;
  private last = 0;
  private dead = false;

  constructor(
    private o: {
      doPc: number;
      /** How a note is named in the ghost's tag (solfège, or letters for an instrument). */
      nameOf: (midi: number) => string;
      /** In tune within this many cents (the strictness). */
      tolerance: number;
      reduceMotion: boolean;
    },
  ) {
    for (let i = 0; i < TRAIL_POOL; i++) this.trail.push(make("line", { "stroke-linecap": "round", display: "none" }, this.trailG));
    this.raf = requestAnimationFrame(this.frame);
  }

  /** The note now waited on: where it is drawn (looked up again if the score is redrawn) and its pitch. */
  setNote(locate: () => Spot | null, midi: number) {
    this.locate = locate;
    this.target = midi;
    this.spot = locate();
    if (this.spot) this.attach(this.spot);
    if (this.spot && (this.y === null || this.alpha < 0.05)) this.x = this.cx();
    this.credited = false;
    this.cand = null;
    this.wrongSemi = null;
    this.feedV = { sung: null, cents: null, hold: 0, credited: false, helping: false };
  }

  feed(v: GuideFeed) {
    if (v.credited && !this.credited && this.spot) this.celebrate(v.outcome ?? "first");
    this.credited = v.credited;
    this.feedV = v;
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.g.remove();
  }

  private tag(parent: Element) {
    const g = make("g", { display: "none" }, parent);
    const rect = make("rect", {}, g);
    const text = make("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-family": "Nunito, system-ui, sans-serif", "font-weight": 800 }, g);
    return { g, rect, text };
  }

  private setTag(t: { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }, label: string, x: number, y: number, colors: readonly [string, string], size: number, anchor: "middle" | "start") {
    t.g.setAttribute("display", "inline");
    if (t.text.textContent !== label) t.text.textContent = label;
    t.text.setAttribute("font-size", size.toFixed(2));
    t.text.setAttribute("fill", colors[1]);
    const w = (t.text.getComputedTextLength?.() || label.length * size * 0.55) + size * 1.1;
    const h = size * 1.75;
    const left = anchor === "middle" ? x - w / 2 : x;
    t.rect.setAttribute("x", left.toFixed(2));
    t.rect.setAttribute("y", (y - h / 2).toFixed(2));
    t.rect.setAttribute("width", w.toFixed(2));
    t.rect.setAttribute("height", h.toFixed(2));
    t.rect.setAttribute("rx", (h / 2).toFixed(2));
    t.rect.setAttribute("fill", colors[0]);
    t.text.setAttribute("x", (left + w / 2).toFixed(2));
    t.text.setAttribute("y", y.toFixed(2));
  }

  private attach(s: Spot) {
    if (this.g.parentNode !== s.svg) s.svg.appendChild(this.g);
    const sp = this.space();
    // The face, sized to the staff.
    this.open.replaceChildren();
    this.happy.replaceChildren();
    this.pupils = [];
    const R = sp * PIP_R, line = sp * 0.16;
    for (const ex of [-0.34, 0.34]) {
      make("circle", { cx: ex * R, cy: -0.14 * R, r: 0.25 * R, fill: "#fff" }, this.open);
      this.pupils.push(make("circle", { cx: ex * R, cy: -0.14 * R, r: 0.12 * R, fill: INK }, this.open));
      // Happy: eyes shut in an arch, and rosy cheeks.
      make("path", { d: `M ${(ex - 0.17) * R} ${-0.06 * R} Q ${ex * R} ${-0.4 * R} ${(ex + 0.17) * R} ${-0.06 * R}`, fill: "none", stroke: INK, "stroke-width": line, "stroke-linecap": "round" }, this.happy);
      make("circle", { cx: ex * 1.75 * R, cy: 0.22 * R, r: 0.15 * R, fill: "rgba(255,138,102,.6)" }, this.happy);
    }
    this.body.setAttribute("r", String(R));
    this.body.setAttribute("stroke-width", String(line));
    this.mouth.setAttribute("stroke-width", String(line));
    this.ring.setAttribute("r", String(sp * RING_R));
    this.ring.setAttribute("stroke-width", String(sp * 0.18));
    this.arc.setAttribute("r", String(sp * RING_R));
    this.arc.setAttribute("stroke-width", String(sp * 0.34));
    this.elastic.setAttribute("stroke-width", String(sp * 0.14));
    this.elastic.setAttribute("stroke-dasharray", `${sp * 0.4} ${sp * 0.45}`);
    this.ghostHead.setAttribute("rx", String(sp * 0.66));
    this.ghostHead.setAttribute("ry", String(sp * 0.47));
    this.cheer.setAttribute("font-size", String(sp * 1.5));
  }

  /** A staff space: a notehead is about one tall. */
  private space() {
    return Math.max(4, this.spot?.head.h ?? 8);
  }
  private cx() {
    const h = this.spot!.head;
    return (h.x + h.right) / 2;
  }
  private yOf(midi: number) {
    return this.spot!.head.y - stepsBetween(midi, this.target!, this.o.doPc) * (this.space() / 2);
  }
  private zone(cents: number): Zone {
    const a = Math.abs(cents);
    return a <= this.o.tolerance ? "in" : a < 100 ? "near" : "far";
  }

  private celebrate(outcome: Outcome) {
    const sp = this.space();
    const x = this.cx(), y = this.spot!.head.y;
    this.cheer.textContent = outcome === "first" ? "First try!" : outcome === "corrected" ? "Fixed it!" : "Got it!";
    this.cheer.setAttribute("x", String(x));
    this.cheerAt = performance.now();
    if (this.o.reduceMotion) return;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * (10 + Math.random() * 16);
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const el = i % 3 === 0
        ? make("rect", { width: sp * 0.5, height: sp * 0.25, x: -sp * 0.25, y: -sp * 0.125, fill: color }, this.bits)
        : make("circle", { r: sp * (0.15 + Math.random() * 0.15), fill: color }, this.bits);
      this.confetti.push({ el, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 8, rot: Math.random() * 360, life: 0, max: 600 + Math.random() * 450 });
    }
  }

  private frame = (now: number) => {
    if (this.dead) return;
    const dt = Math.min(50, now - (this.last || now));
    this.last = now;
    this.raf = requestAnimationFrame(this.frame);
    // A redrawn score drops the group: find the note again.
    if (this.spot && !this.g.isConnected && this.locate) {
      this.spot = this.locate();
      if (this.spot) this.attach(this.spot);
    }
    if (!this.spot || this.target === null) return;
    this.draw(now, dt);
  };

  private draw(now: number, dt: number) {
    const s = dt / 1000;
    const sp = this.space();
    const v = this.feedV;
    const head = this.spot!.head;
    const tx = this.cx();
    this.x += (tx - this.x) * (1 - Math.exp(-dt / 110));
    const voiced = v.cents !== null && !v.helping;
    const cents = v.cents ?? 0;
    const z = this.zone(cents);

    if (voiced) {
      const goal = this.yOf(this.target! + cents / 100);
      if (this.y === null || this.alpha < 0.05) { this.y = goal; this.vy = 0; }
      this.vy += ((goal - this.y) * 420 - this.vy * 30) * s;
      this.y += this.vy * s;
    }
    this.alpha += ((voiced ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt / 70));

    // A different note, held: the ghost.
    if (voiced && !this.credited && Math.abs(cents) >= WRONG_CENTS) {
      const semi = Math.round(cents / 100);
      if (this.cand?.semi === semi) { if (now - this.cand.since >= WRONG_HOLD_MS) this.wrongSemi = semi; }
      else this.cand = { semi, since: now };
    } else { this.cand = null; this.wrongSemi = null; }
    if (this.wrongSemi !== null && this.wrongSemi !== 0) {
      const m = this.target! + this.wrongSemi;
      const gx = tx + sp * 2.9, gy = this.yOf(m);
      this.ghost.setAttribute("display", "inline");
      this.ghostHead.setAttribute("transform", `translate(${gx.toFixed(2)} ${gy.toFixed(2)}) rotate(-20)`);
      this.setTag(this.ghostTag, `that's ${this.o.nameOf(m)}`, gx + sp * 1.1, gy - sp * 1.8, TAG.far, sp * TAG_SIZE, "start");
    } else this.ghost.setAttribute("display", "none");

    // The ring round the note, and how much of the hold is done.
    const R = sp * RING_R, circ = 2 * Math.PI * R;
    this.ring.setAttribute("cx", tx.toFixed(2));
    this.ring.setAttribute("cy", head.y.toFixed(2));
    this.ring.setAttribute("opacity", this.credited ? "0" : (0.45 + 0.25 * Math.sin(now / 200)).toFixed(2));
    this.arc.setAttribute("cx", tx.toFixed(2));
    this.arc.setAttribute("cy", head.y.toFixed(2));
    this.arc.setAttribute("stroke-dasharray", `${circ.toFixed(2)} ${circ.toFixed(2)}`);
    this.arc.setAttribute("stroke-dashoffset", (circ * (1 - Math.min(1, v.hold))).toFixed(2));
    this.arc.setAttribute("transform", `rotate(-90 ${tx.toFixed(2)} ${head.y.toFixed(2)})`);
    this.arc.setAttribute("opacity", v.hold > 0 && !this.credited ? "1" : this.credited ? String(Math.max(0, 1 - (now - this.cheerAt) / 400)) : "0");

    // The trail: the last moments of singing, streaming left from the ball.
    if (voiced && this.y !== null) {
      const lastPt = this.points[this.points.length - 1];
      if (!lastPt || now - lastPt.t >= 20) this.points.push({ t: now, y: this.y, z });
    } else if (this.points.length && this.points[this.points.length - 1].y !== null) this.points.push({ t: now, y: null, z: "far" });
    while (this.points.length && now - this.points[0].t > TRAIL_MS) this.points.shift();
    const perMs = (sp * 3) / 500;
    let used = 0;
    for (let i = this.points.length - 1; i > 0 && used < TRAIL_POOL; i--) {
      const a = this.points[i - 1], b = this.points[i];
      if (a.y === null || b.y === null) continue;
      const age = (now - b.t) / TRAIL_MS;
      const line = this.trail[used++];
      line.setAttribute("x1", (this.x - (now - a.t) * perMs).toFixed(2));
      line.setAttribute("y1", a.y.toFixed(2));
      line.setAttribute("x2", (this.x - (now - b.t) * perMs).toFixed(2));
      line.setAttribute("y2", b.y.toFixed(2));
      line.setAttribute("stroke", FILL[b.z]);
      line.setAttribute("stroke-width", (sp * (0.8 - 0.6 * age)).toFixed(2));
      line.setAttribute("opacity", (Math.max(0, 1 - age) * 0.85).toFixed(2));
      line.setAttribute("display", "inline");
    }
    for (let i = used; i < TRAIL_POOL; i++) this.trail[i].setAttribute("display", "none");

    // The ball.
    const show = this.alpha > 0.02 && this.y !== null;
    this.pip.setAttribute("display", show ? "inline" : "none");
    this.elastic.setAttribute("display", "none");
    this.hint.g.setAttribute("display", "none");
    if (show) {
      const y = this.y!;
      const zz: Zone = this.credited ? "in" : z;
      const stretch = this.o.reduceMotion ? 0 : Math.min(0.28, Math.abs(this.vy) / (sp * 110));
      this.pip.setAttribute("transform", `translate(${this.x.toFixed(2)} ${y.toFixed(2)}) scale(${(1 - stretch * 0.5).toFixed(3)} ${(1 + stretch).toFixed(3)})`);
      this.pip.setAttribute("opacity", this.alpha.toFixed(2));
      this.body.setAttribute("fill", FILL[zz]);
      const inTune = zz === "in";
      this.open.setAttribute("display", inTune ? "none" : "inline");
      this.happy.setAttribute("display", inTune ? "inline" : "none");
      const r = sp * PIP_R;
      const look = Math.sign(head.y - y) * sp * PIP_R * 0.12;
      for (const p of this.pupils) p.setAttribute("transform", `translate(0 ${look.toFixed(2)})`);
      this.mouth.setAttribute("d", inTune
        ? `M ${-0.3 * r} ${0.22 * r} Q 0 ${0.55 * r} ${0.3 * r} ${0.22 * r}`
        : zz === "near"
          ? `M ${-0.1 * r} ${0.38 * r} a ${0.1 * r} ${0.1 * r} 0 1 0 ${0.2 * r} 0 a ${0.1 * r} ${0.1 * r} 0 1 0 ${-0.2 * r} 0`
          : `M ${-0.25 * r} ${0.42 * r} Q 0 ${0.3 * r} ${0.25 * r} ${0.42 * r}`);

      if (!this.credited) {
        // Which way, and how far: cents within a semitone; past that only the
        // way, and once a note is held the ghost names it instead.
        const way = cents < 0 ? "higher ↑" : "lower ↓";
        const label = zz === "in" ? "on it" : zz === "near" ? `${way} ${Math.round(Math.abs(cents) / 5) * 5}¢` : way;
        if (this.wrongSemi === null) {
          this.setTag(this.hint, label, this.x, y - sp * (PIP_R + 1.3), TAG[zz], sp * TAG_SIZE, "middle");
          this.hint.g.setAttribute("opacity", this.alpha.toFixed(2));
        }
        // Pointing to the note when the ball is away from it.
        const dy = head.y - y;
        if (zz !== "in" && Math.abs(dy) > sp * (PIP_R + RING_R)) {
          const dir = Math.sign(dy);
          this.elastic.setAttribute("x1", this.x.toFixed(2));
          this.elastic.setAttribute("y1", (y + dir * sp * PIP_R).toFixed(2));
          this.elastic.setAttribute("x2", tx.toFixed(2));
          this.elastic.setAttribute("y2", (head.y - dir * R).toFixed(2));
          this.elastic.setAttribute("opacity", (0.6 * this.alpha).toFixed(2));
          this.elastic.setAttribute("display", "inline");
        }
      }
    }

    // Confetti and the cheer.
    for (const b of this.confetti) {
      b.life += dt;
      b.vy += sp * 45 * s;
      b.x += b.vx * s; b.y += b.vy * s; b.vx *= 0.985; b.rot += 360 * s;
      b.el.setAttribute("transform", `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)}) rotate(${b.rot.toFixed(0)})`);
      b.el.setAttribute("opacity", Math.max(0, 1 - b.life / b.max).toFixed(2));
    }
    this.confetti = this.confetti.filter((b) => (b.life < b.max ? true : (b.el.remove(), false)));
    const ct = (now - this.cheerAt) / 1000;
    if (this.cheerAt && ct < 1) {
      this.cheer.setAttribute("y", (head.y - sp * 3.4 - ct * sp * 2).toFixed(2));
      this.cheer.setAttribute("opacity", (1 - ct * ct).toFixed(2));
      this.cheer.setAttribute("display", "inline");
    } else this.cheer.setAttribute("display", "none");
  }
}
