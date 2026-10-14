import { degreeMidi, type Challenge } from "./exercise";
import type { ChallengeView } from "./run";
import { ABC_PATH, ABC_BOX } from "../brand-mark";

/**
 * The challenge's picture (/challenge): one 720 x 1280 canvas, the shape of
 * a Story or Reel, so what is on screen is what is recorded. The singer's
 * camera fills the top; under it the score on white paper (eight notes, two
 * bars), Pip riding at the pitch being sung on the note being waited on (as
 * pitch-guide.ts does on the practice page), the points, and the site's
 * address at the foot, so every shared video says where it came from.
 *
 * The music is drawn here, not by abcjs: eight quarter notes in C need only
 * a staff, and the canvas can then be recorded as it is.
 */

export const W = 720;
export const H = 1280;
const CAM_H = 640;
const PAPER_TOP = CAM_H - 44;
const SP = 22;
const MID = 840;
const X0 = 156;
const STEP_X = 66;

const C = {
  ink: "#15213a", muted: "#56637f", line: "#c9d3e6", action: "#2f6fe0",
  mint: "#bdebd9", mintDeep: "#2fb383", mintText: "#1d7a56", mintInk: "#0f3b2c",
  butter: "#ffefa8", butterDeep: "#ffcf33", butterInk: "#5c4a00",
  peach: "#ffd3bf", peachDeep: "#ff8a66", peachInk: "#5a2310", red: "#e2553a",
  sky: "#c9e4ff", skyDeep: "#6aa8f2", skyInk: "#0e3563",
};
type Zone = "in" | "near" | "far";
const FILL: Record<Zone, string> = { in: C.mintDeep, near: C.butterDeep, far: C.peachDeep };
const TAG: Record<Zone, [string, string]> = { in: [C.mint, C.mintInk], near: [C.butter, C.butterInk], far: [C.peach, C.peachInk] };
const CONFETTI = [C.mintDeep, C.butterDeep, C.peachDeep, C.skyDeep, C.action];
const LEVEL_TAG: Record<Challenge["level"], string> = { warmup: "WARM-UP", skips: "SKIPS", wild: "WILD" };

/** The shuffle: notes fly about the frame, flicking through pitches, and land one by one, the first at LAND_FIRST. */
const LAND_FIRST = 900;
const LAND_GAP = 120;
/** From the start of a shuffle until the last note has landed and settled. */
export const SHUFFLE_MS = LAND_FIRST + 7 * LAND_GAP + 350;

export type SceneState = {
  challenge: Challenge;
  phase: "ready" | "reference" | "singing" | "done";
  view: ChallengeView | null;
  video: HTMLVideoElement | null;
  /** A line under the music before the run: what to do now. */
  message: string | null;
  tolerance: number;
  /** False before Go: the notes are hidden ("?"), so nobody can rehearse them. */
  reveal: boolean;
};

// Diatonic staff position: chromatic pitches sit halfway between neighbours.
const DIA = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7];
function dn(m: number) {
  const f = Math.floor(m), fr = m - f, pc = ((f % 12) + 12) % 12, oct = Math.floor(f / 12);
  return oct * 7 + DIA[pc] + (DIA[pc + 1] - DIA[pc]) * fr;
}

type Bit = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; r: number; rot: number; rect: boolean };

export class ChallengeScene {
  private ctx: CanvasRenderingContext2D;
  private ballY: number | null = null;
  private vy = 0;
  private alpha = 0;
  private cursorX = X0;
  private trail: { t: number; y: number | null; z: Zone }[] = [];
  private bits: Bit[] = [];
  private pops = new Map<number, number>();
  private shuffleAt = 0;
  private scatter: { x: number; y: number; rot: number; spin: number }[] = [];
  private landed = new Set<number>();
  private cheer: { text: string; at: number; x: number } | null = null;
  private celebrated = -1;
  private cand: { semi: number; since: number } | null = null;
  private wrong: number | null = null;
  private doneAt = 0;
  private last = 0;
  private reduce: boolean;
  private abc: Path2D | null = null;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d")!;
    this.reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** A new go: forget the last one's marks. */
  reset() {
    this.ballY = null;
    this.alpha = 0;
    this.trail = [];
    this.bits = [];
    this.pops.clear();
    this.shuffleAt = 0;
    this.landed.clear();
    this.cheer = null;
    this.celebrated = -1;
    this.cand = null;
    this.wrong = null;
    this.doneAt = 0;
    this.cursorX = X0;
  }

  /** Throw the notes in the air: they land in their places over SHUFFLE_MS. */
  shuffle(now: number) {
    this.shuffleAt = now;
    this.landed.clear();
    this.scatter = Array.from({ length: 8 }, () => ({
      x: 70 + Math.random() * (W - 140),
      y: 170 + Math.random() * (H - 380),
      rot: (Math.random() - 0.5) * 5,
      spin: (Math.random() - 0.5) * 12,
    }));
  }

  private bottomY(_c?: Challenge) {
    return MID + 2 * SP;
  }
  private yOf(c: Challenge, midi: number) {
    // The bottom line: E4 in treble, G2 in bass.
    const ref = c.clef === "treble" ? 64 : 43;
    return this.bottomY(c) - (dn(midi) - dn(ref)) * (SP / 2);
  }

  draw(now: number, s: SceneState) {
    const dt = Math.min(50, now - (this.last || now));
    this.last = now;
    const ctx = this.ctx;
    const c = s.challenge;
    const v = s.view;
    const idx = Math.min(v?.index ?? 0, c.notes.length - 1);
    const target = c.notes[idx].midi;
    const singing = s.phase === "singing" && !!v && !v.done;

    // Celebrations follow the run.
    if (v && v.credited && this.celebrated !== v.index) {
      this.celebrated = v.index;
      this.pops.set(v.index, now);
      this.burst(X0 + v.index * STEP_X, this.yOf(c, target), 22);
      this.cheer = { text: v.outcome === "first" ? "First try!" : v.outcome === "corrected" ? "Fixed it!" : "Got it!", at: now, x: X0 + v.index * STEP_X };
    }
    if (s.phase === "done" && !this.doneAt) {
      this.doneAt = now;
      // Party poppers from the camera's bottom corners, up the sides: the face stays clear.
      this.burst(30, PAPER_TOP, 34, -Math.PI * 0.42, 0.35);
      this.burst(W - 30, PAPER_TOP, 34, -Math.PI * 0.58, 0.35);
    }

    ctx.clearRect(0, 0, W, H);
    this.drawCamera(s);
    // The paper.
    ctx.fillStyle = "#ffffff";
    this.rr(0, PAPER_TOP, W, H - PAPER_TOP + 40, 44);
    ctx.fill();

    this.drawDots(c, v);
    this.cursorX += (X0 + idx * STEP_X - this.cursorX) * (1 - Math.exp(-dt / 110));
    this.drawStaff(c, v, now, s.phase, s.reveal);

    // The sung pitch.
    const cents = singing && v ? v.cents : null;
    const voiced = cents !== null;
    const z: Zone = cents === null ? "far" : Math.abs(cents) <= s.tolerance ? "in" : Math.abs(cents) < 100 ? "near" : "far";
    const ty = this.yOf(c, target);
    if (voiced) {
      const goal = this.yOf(c, target + cents! / 100);
      if (this.ballY === null || this.alpha < 0.05) { this.ballY = goal; this.vy = 0; }
      const k = dt / 1000;
      this.vy += ((goal - this.ballY) * 420 - this.vy * 30) * k;
      this.ballY += this.vy * k;
    }
    this.alpha += ((voiced || (v?.credited && s.phase === "singing") ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt / 70));

    // A different note held: name it.
    if (voiced && !v!.credited && Math.abs(cents!) >= 70) {
      const semi = Math.round(cents! / 100);
      if (this.cand?.semi === semi) { if (now - this.cand.since >= 250) this.wrong = semi; }
      else this.cand = { semi, since: now };
    } else { this.cand = null; this.wrong = null; }

    if (voiced) this.trail.push({ t: now, y: this.ballY!, z });
    else if (this.trail.length && this.trail[this.trail.length - 1].y !== null) this.trail.push({ t: now, y: null, z });
    while (this.trail.length && now - this.trail[0].t > 1200) this.trail.shift();

    if (singing) {
      // The ring round the note, filling with the hold.
      const R = SP * 1.8;
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.skyDeep;
      ctx.globalAlpha = v!.credited ? 0 : 0.5 + 0.25 * Math.sin(now / 200);
      ctx.beginPath(); ctx.arc(this.cursorX, ty, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      if (v!.hold > 0 && !v!.credited) {
        ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.strokeStyle = C.mintDeep;
        ctx.beginPath(); ctx.arc(this.cursorX, ty, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v!.hold); ctx.stroke();
        ctx.lineCap = "butt";
      }
      if (this.wrong !== null && this.wrong !== 0) {
        const m = target + this.wrong;
        const gx = this.cursorX + SP * 2.9, gy = this.yOf(c, m);
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(-0.35);
        ctx.beginPath(); ctx.ellipse(0, 0, SP * 0.66, SP * 0.47, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(226,85,58,.18)"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.red; ctx.stroke();
        ctx.restore();
        this.pill(`that's ${syl(m)}`, gx + SP * 0.9, gy - SP * 1.9, TAG.far, 22, "left");
      }
      if (!voiced && !v!.credited && this.alpha < 0.3) {
        this.pill(`sing ${c.notes[idx].syl}`, this.cursorX, ty - SP * 3.1, [C.sky, C.skyInk], 24, "center");
      }
    }

    // The trail.
    const perMs = (SP * 3) / 500;
    ctx.lineCap = "round";
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      if (a.y === null || b.y === null) continue;
      const age = (now - b.t) / 1200;
      ctx.globalAlpha = Math.max(0, 1 - age) * 0.85;
      ctx.lineWidth = SP * (0.8 - 0.6 * age);
      ctx.strokeStyle = FILL[b.z];
      ctx.beginPath();
      ctx.moveTo(this.cursorX - (now - a.t) * perMs, a.y);
      ctx.lineTo(this.cursorX - (now - b.t) * perMs, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineCap = "butt";

    // Pip.
    if (this.alpha > 0.02 && this.ballY !== null && s.phase === "singing") {
      const zz: Zone = v!.credited ? "in" : z;
      const y = this.ballY;
      if (!v!.credited && zz !== "in" && Math.abs(ty - y) > SP * 3.1) {
        const dir = Math.sign(ty - y);
        ctx.globalAlpha = 0.6 * this.alpha; ctx.setLineDash([8, 9]); ctx.strokeStyle = C.muted; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(this.cursorX, y + dir * SP * 1.3); ctx.lineTo(this.cursorX, ty - dir * SP * 1.8); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      const stretch = this.reduce ? 0 : Math.min(0.28, Math.abs(this.vy) / (SP * 110));
      drawPip(ctx, this.cursorX, y, SP * 1.3, zz, Math.sign(ty - y), this.alpha, stretch);
      if (!v!.credited && this.wrong === null) {
        const way = cents! < 0 ? "higher ↑" : "lower ↓";
        const label = zz === "in" ? "on it" : zz === "near" ? `${way} ${Math.round(Math.abs(cents!) / 5) * 5}¢` : way;
        ctx.globalAlpha = this.alpha;
        this.pill(label, this.cursorX, y - SP * 2.6, TAG[zz], 22, "center");
        ctx.globalAlpha = 1;
      }
    }

    // Confetti and the cheer.
    const k = dt / 1000;
    for (const b of this.bits) {
      b.life += dt; b.vy += 900 * k; b.x += b.vx * k; b.y += b.vy * k; b.vx *= 0.985; b.rot += 6 * k;
      ctx.globalAlpha = Math.max(0, 1 - b.life / b.max);
      ctx.fillStyle = b.col;
      if (b.rect) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, Math.PI * 2); ctx.fill(); }
    }
    this.bits = this.bits.filter((b) => b.life < b.max);
    ctx.globalAlpha = 1;
    if (this.cheer) {
      const t = (now - this.cheer.at) / 1000;
      if (t < 1) {
        ctx.globalAlpha = 1 - t * t;
        ctx.font = "600 34px Fredoka, Nunito, system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 6; ctx.strokeStyle = "#ffffff"; ctx.lineJoin = "round";
        const cy = this.yOf(c, c.notes[this.celebrated]?.midi ?? target) - SP * 3.6 - t * SP * 2;
        ctx.strokeText(this.cheer.text, this.cheer.x, cy);
        ctx.fillStyle = C.mintText;
        ctx.fillText(this.cheer.text, this.cheer.x, cy);
        ctx.globalAlpha = 1;
      } else this.cheer = null;
    }

    this.drawFoot(s, v, now);
  }

  private drawCamera(s: SceneState) {
    const ctx = this.ctx;
    const vid = s.video;
    if (vid && vid.readyState >= 2 && vid.videoWidth) {
      // Cover the top, mirrored like a selfie camera.
      const vw = vid.videoWidth, vh = vid.videoHeight;
      const scale = Math.max(W / vw, CAM_H / vh);
      const sw = W / scale, sh = CAM_H / scale;
      ctx.save();
      ctx.translate(W, 0); ctx.scale(-1, 1);
      ctx.drawImage(vid, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, CAM_H);
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0, 0, W, CAM_H);
      g.addColorStop(0, C.sky); g.addColorStop(1, C.mint);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, CAM_H);
      drawPip(ctx, W / 2, CAM_H * 0.55, 110, "in", 0, 1, 0);
    }
    // Before Go only: from then on the camera is the singer's alone.
    if (s.phase !== "ready") return;
    const top = ctx.createLinearGradient(0, 0, 0, 220);
    top.addColorStop(0, "rgba(10,16,32,.55)"); top.addColorStop(1, "rgba(10,16,32,0)");
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, 220);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "600 60px Fredoka, Nunito, system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 12;
    ctx.fillText("Can you sing it?", W / 2, 96);
    ctx.shadowBlur = 0;
  }

  private drawDots(c: Challenge, v: ChallengeView | null) {
    const ctx = this.ctx;
    const n = c.notes.length, gap = 30, x0 = W / 2 + 40 - ((n - 1) * gap) / 2, y = PAPER_TOP + 52;
    this.pill(LEVEL_TAG[c.level], 36, y, [C.butter, C.butterInk], 18, "left");
    for (let i = 0; i < n; i++) {
      const r = v?.results[i];
      const cur = !!v && !v.done && i === v.index;
      ctx.beginPath(); ctx.arc(x0 + i * gap, y, cur ? 11 : 8, 0, Math.PI * 2);
      ctx.fillStyle = r ? (r.outcome === "first" ? C.mintDeep : r.outcome === "skipped" ? C.peachDeep : C.butterDeep) : cur ? C.action : C.line;
      ctx.fill();
    }
  }

  private drawStaff(c: Challenge, v: ChallengeView | null, now: number, phase: SceneState["phase"], reveal: boolean) {
    const ctx = this.ctx;
    const by = this.bottomY(c), topY = by - 4 * SP;
    const st = this.shuffleAt ? now - this.shuffleAt : Infinity;
    const shuffling = st < SHUFFLE_MS;
    // The cursor band.
    if (phase !== "done" && reveal && !shuffling) {
      ctx.fillStyle = `rgba(201,228,255,${0.5 + 0.12 * Math.sin(now / 260)})`;
      this.rr(this.cursorX - SP * 1.6, topY - SP * 3, SP * 3.2, SP * 11, SP);
      ctx.fill();
    }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) { const y = topY + i * SP; ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Barlines: between the bars, and the final double bar.
    const mid = X0 + 3.5 * STEP_X, end = X0 + 7 * STEP_X + 44;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mid, topY); ctx.lineTo(mid, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(end, topY); ctx.lineTo(end, by); ctx.stroke();
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(end + 9, topY); ctx.lineTo(end + 9, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, topY); ctx.lineTo(24, by); ctx.lineWidth = 2; ctx.stroke();
    // Clef and time.
    ctx.fillStyle = C.ink; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `${SP * 4}px "Noto Music", serif`;
    // Noto Music sets both clefs on the same baseline, the second line up
    // (measured from screenshots: an F clef on its own line drew 2 spaces high).
    if (c.clef === "treble") ctx.fillText("\u{1D11E}", 32, topY + 3 * SP);
    else ctx.fillText("\u{1D122}", 34, topY + 3 * SP);
    ctx.font = `700 ${SP * 2.1}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.fillText("4", 118, topY + 2 * SP - 2);
    ctx.fillText("4", 118, topY + 4 * SP - 2);

    if (!reveal) {
      // Before Go: eight question marks, bobbing.
      c.notes.forEach((_, i) => {
        const x = X0 + i * STEP_X, y = topY + 2 * SP + Math.sin(now / 380 + i * 0.9) * SP * 0.6;
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35);
        ctx.beginPath(); ctx.ellipse(0, 0, SP * 0.66, SP * 0.47, 0, 0, Math.PI * 2);
        ctx.fillStyle = C.line; ctx.fill(); ctx.restore();
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.font = "800 25px Nunito, system-ui, sans-serif";
        ctx.fillStyle = C.muted;
        ctx.fillText("?", x, by + SP * 3.7);
      });
      return;
    }

    c.notes.forEach((n, i) => {
      const land = LAND_FIRST + i * LAND_GAP;
      if (st < land) {
        this.drawFlying(c, i, st / land, st);
        return;
      }
      if (shuffling && !this.landed.has(i)) {
        this.landed.add(i);
        this.pops.set(i, now);
      }
      const x = X0 + i * STEP_X, y = this.yOf(c, n.midi);
      const r = v?.results[i];
      const cur = phase !== "done" && (v ? i === v.index && !v.done : i === 0);
      const col = r ? (r.outcome === "skipped" ? C.peachDeep : C.mintDeep) : C.ink;
      // Ledger lines above and below.
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      for (let ly = by + SP; ly <= y + 0.1; ly += SP) { ctx.beginPath(); ctx.moveTo(x - SP * 1.05, ly); ctx.lineTo(x + SP * 1.05, ly); ctx.stroke(); }
      for (let ly = topY - SP; ly >= y - 0.1; ly -= SP) { ctx.beginPath(); ctx.moveTo(x - SP * 1.05, ly); ctx.lineTo(x + SP * 1.05, ly); ctx.stroke(); }
      const pop = this.pops.get(i);
      const age = pop !== undefined ? now - pop : 1e9;
      const sc = age < 500 && !this.reduce ? 1 + 0.45 * Math.sin((Math.PI * age) / 500) : 1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35); ctx.scale(sc, sc);
      ctx.beginPath(); ctx.ellipse(0, 0, SP * 0.66, SP * 0.47, 0, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill(); ctx.restore();
      // Stems: up below the middle line, down from it.
      const up = y > topY + 2 * SP;
      ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.beginPath();
      if (up) { ctx.moveTo(x + SP * 0.6, y - 2); ctx.lineTo(x + SP * 0.6, y - SP * 3.4); }
      else { ctx.moveTo(x - SP * 0.6, y + 2); ctx.lineTo(x - SP * 0.6, y + SP * 3.4); }
      ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = `800 ${cur ? 30 : 25}px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = cur ? C.action : r ? C.mintText : C.muted;
      ctx.fillText(n.syl, x, Math.max(by + SP * 3.7, y + SP * 2.2));
    });
  }

  /** A note in the air: wandering, flicking through pitches, then rushing to its place. */
  private drawFlying(c: Challenge, i: number, p: number, t: number) {
    const ctx = this.ctx;
    const sc = this.scatter[i] ?? { x: W / 2, y: H / 2, rot: 0, spin: 0 };
    const wx = sc.x + Math.sin(t / 170 + i * 1.3) * 70;
    const wy = sc.y + Math.cos(t / 210 + i * 2.1) * 70;
    // A new pitch every 80 ms: it could be any of them.
    const k = Math.floor(t / 80);
    const r = Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
    const flick = degreeMidi(Math.floor(r * 11), c.voice === "high" ? 60 : 48);
    const e = p * p * p;
    const x = wx + (X0 + i * STEP_X - wx) * e;
    const y = wy + (this.yOf(c, flick) - wy) * e;
    const rot = (sc.rot + (sc.spin * t) / 1000) * (1 - e) - 0.35 * e;
    const col = CONFETTI[i % CONFETTI.length];
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1.4 - 0.4 * e, 1.4 - 0.4 * e);
    ctx.beginPath(); ctx.ellipse(0, 0, SP * 0.66, SP * 0.47, 0, 0, Math.PI * 2);
    ctx.fillStyle = e > 0.6 ? C.ink : col; ctx.fill();
    ctx.strokeStyle = e > 0.6 ? C.ink : col; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(SP * 0.6, -2); ctx.lineTo(SP * 0.6, -SP * 3.4); ctx.stroke();
    ctx.restore();
  }

  private drawFoot(s: SceneState, v: ChallengeView | null, now: number) {
    const ctx = this.ctx;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    if (s.phase === "done" && v) {
      // The verdict goes on the paper, under the notes: the camera stays
      // clear, so the video ends on the singer's face.
      const t = Math.min(1, (now - this.doneAt) / 350);
      const rise = 16 * (1 - t);
      const n = s.challenge.notes.length;
      const heading = v.firsts === n ? "Perfect!" : v.total >= n * 75 ? "Nailed it!" : v.total >= n * 45 ? "Not bad!" : "Brave attempt!";
      ctx.globalAlpha = t;
      ctx.fillStyle = C.ink;
      ctx.font = "600 68px Fredoka, Nunito, system-ui, sans-serif";
      ctx.fillText(heading, W / 2, 1066 + rise);
      ctx.font = "800 28px Nunito, system-ui, sans-serif";
      ctx.fillStyle = C.mintText;
      ctx.fillText(`${v.total} points · ${v.firsts} of ${n} right first time`, W / 2, 1114 + rise);
      ctx.globalAlpha = 1;
    } else if (s.message && s.phase !== "singing") {
      this.pill(s.message, W / 2, 1060, [C.sky, C.skyInk], 26, "center");
    } else if (v) {
      ctx.fillStyle = C.ink;
      ctx.font = "600 76px Fredoka, Nunito, system-ui, sans-serif";
      ctx.fillText(String(v.total), W / 2, 1100);
      ctx.fillStyle = C.muted;
      ctx.font = "800 20px Nunito, system-ui, sans-serif";
      ctx.fillText("POINTS", W / 2, 1132);
    }
    this.drawLogo(W / 2, H - 44, 40);
  }

  /** The abcSightReading logo, centred on `cx` with its baseline at `y`; `size` is the name's. */
  private drawLogo(cx: number, y: number, size: number) {
    const ctx = this.ctx;
    ctx.font = `600 ${size}px Fredoka, Nunito, system-ui, sans-serif`;
    const name = "SightReading";
    const nameW = ctx.measureText(name).width;
    // "abc" is 0.7 of the name, as in the navbar.
    const scale = (size * 0.7) / 1000;
    const abcW = ABC_BOX.width * scale, gap = size * 0.06;
    const left = cx - (abcW + gap + nameW) / 2;
    this.abc ??= new Path2D(ABC_PATH);
    ctx.save();
    ctx.translate(left, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = C.action;
    ctx.fill(this.abc);
    ctx.restore();
    ctx.fillStyle = C.ink;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(name, left + abcW + gap, y);
    ctx.textAlign = "center";
  }

  /** Confetti from (x, y): all round, or within `spread` radians either side of `aim`. */
  private burst(x: number, y: number, n: number, aim?: number, spread = Math.PI) {
    if (this.reduce) return;
    for (let i = 0; i < n; i++) {
      const a = aim === undefined ? Math.random() * Math.PI * 2 : aim + (Math.random() * 2 - 1) * spread;
      const sp = aim === undefined ? 220 + Math.random() * 380 : 650 + Math.random() * 450;
      this.bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (aim === undefined ? 220 : 0), life: 0, max: 900 + Math.random() * 700,
        col: CONFETTI[i % CONFETTI.length], r: 5 + Math.random() * 6, rot: Math.random() * 6, rect: i % 3 === 0 });
    }
  }

  private rr(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  private pill(text: string, x: number, y: number, colors: [string, string], size: number, align: "left" | "center") {
    const ctx = this.ctx;
    ctx.font = `800 ${size}px Nunito, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + size * 1.2, h = size * 1.8;
    const left = align === "center" ? x - w / 2 : x;
    ctx.fillStyle = colors[0];
    this.rr(left, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = colors[1]; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, left + w / 2, y + 1);
    ctx.textBaseline = "alphabetic";
  }
}

const SYL = ["do", "di", "re", "ri", "mi", "fa", "fi", "so", "si", "la", "li", "ti"];
const syl = (m: number) => SYL[((Math.round(m) % 12) + 12) % 12];

/** Pip: a ball with a face, coloured by how close; it looks toward the note (`look` -1 up, 1 down). */
export function drawPip(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, zone: Zone, look: number, alpha: number, stretch: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(1 - stretch * 0.5, 1 + stretch);
  if (zone === "in") { ctx.shadowColor = "rgba(47,179,131,.55)"; ctx.shadowBlur = R * 0.9; }
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = FILL[zone]; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(2, R * 0.12); ctx.strokeStyle = C.ink; ctx.stroke();
  ctx.lineCap = "round";
  if (zone === "in") {
    ctx.lineWidth = Math.max(2, R * 0.12);
    for (const ex of [-0.34, 0.34]) {
      ctx.beginPath(); ctx.moveTo((ex - 0.17) * R, -0.06 * R); ctx.quadraticCurveTo(ex * R, -0.4 * R, (ex + 0.17) * R, -0.06 * R); ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,138,102,.6)";
    for (const ex of [-0.6, 0.6]) { ctx.beginPath(); ctx.arc(ex * R, 0.22 * R, 0.15 * R, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-0.3 * R, 0.22 * R); ctx.quadraticCurveTo(0, 0.55 * R, 0.3 * R, 0.22 * R); ctx.stroke();
  } else {
    for (const ex of [-0.34, 0.34]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex * R, -0.14 * R, 0.25 * R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(ex * R, -0.14 * R + look * R * 0.12, 0.12 * R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineWidth = Math.max(2, R * 0.1);
    ctx.beginPath();
    if (zone === "near") ctx.arc(0, 0.38 * R, 0.1 * R, 0, Math.PI * 2);
    else { ctx.moveTo(-0.25 * R, 0.42 * R); ctx.quadraticCurveTo(0, 0.3 * R, 0.25 * R, 0.42 * R); }
    ctx.stroke();
  }
  ctx.restore();
}
