/**
 * How a play-along video looks: the site's "Recess" style at 1920x1080. A soft
 * pastel ground with floating circles that pulse on the downbeat, the two bars
 * on white cards (score paper stays white), each bar with its own pastel, a
 * ball that bounces from note to note, beat dots, a count-in that pops, a
 * progress bar, and a finish with confetti.
 *
 * Pure drawing: everything comes in through `SceneState`, worked out from the
 * audio clock (timeline.ts), so the live view and the exported file match.
 * Colours are the light Recess tokens (globals.css), in both themes, because
 * the video is a picture on paper, not part of the page.
 */
import type { BarImage } from "./bar-images";
import { ballAt, type Frame } from "./timeline";

export const W = 1920;
export const H = 1080;

const INK = "#15213a";
const MUTED = "#56637f";
const ACTION = "#2f6fe0";
const HAIRLINE = "#d8e2f1";
const PAPER = "#ffffff";

/** The four pastels and the ink that reads on each, in turn per bar. */
const PASTELS = [
  { bg: "#c9e4ff", ink: "#0e3563" }, // sky
  { bg: "#bdebd9", ink: "#0f3b2c" }, // mint
  { bg: "#ffd3bf", ink: "#5a2310" }, // peach
  { bg: "#ffefa8", ink: "#5c4a00" }, // butter
];
const pastel = (n: number) => PASTELS[((n % 4) + 4) % 4];

const FONT = "Fredoka, Nunito, sans-serif";

const CARDS = {
  top: { x: 90, y: 150, w: 1740, h: 400 },
  bottom: { x: 90, y: 590, w: 1740, h: 400 },
};

export interface SceneState {
  frame: Frame;
  bars: BarImage[];
  total: number;
  meter: string;
  bpm: number;
  beats: number;
  /** Seconds since the count-in's first downbeat; negative before it. */
  t: number;
  /** Seconds a beat lasts. */
  beatSec: number;
  countInBars: number;
  /** Wall-clock seconds, for drifting the decoration while nothing plays. */
  clock: number;
  /** Seconds since the music ended, while the finish shows. */
  sinceEnd: number;
  playing: boolean;
  /** The bouncing ball and the glow under its note. On unless false. */
  showBall?: boolean;
}

/** Fixed decoration: where each circle floats, its pastel and size. */
const BUBBLES = Array.from({ length: 11 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1) * W, y: r(2) * H, size: 50 + r(3) * 120, color: PASTELS[i % 4].bg, speed: 0.15 + r(4) * 0.25, phase: r(5) * 6.28 };
});

export function drawScene(g: CanvasRenderingContext2D, s: SceneState) {
  const { frame } = s;
  // Where in the beat we are, during the count-in and the music alike.
  const beatPos = s.t >= 0 ? s.t / s.beatSec : -1;
  const beatIndex = beatPos >= 0 ? Math.floor(beatPos) % s.beats : -1;
  const beatFrac = beatPos >= 0 ? beatPos - Math.floor(beatPos) : 1;
  const pop = s.playing && frame.phase !== "done" ? (1 - beatFrac) ** 3 : 0;

  ground(g, s, beatIndex === 0 ? pop : 0);
  header(g, s, beatIndex, pop);
  card(g, "top", frame.top, s);
  card(g, "bottom", frame.bottom, s);
  progressBar(g, s);

  if (frame.phase === "countIn" && s.playing && frame.word) countIn(g, frame.word, beatPos, pop);
  if (frame.phase === "done" && s.playing) finish(g, s);
}

function ground(g: CanvasRenderingContext2D, s: SceneState, pulse: number) {
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#dceaff");
  grad.addColorStop(0.55, "#eef4ff");
  grad.addColorStop(1, "#fff6d6");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  for (const b of BUBBLES) {
    const x = b.x + Math.sin(s.clock * b.speed + b.phase) * 40;
    const y = b.y + Math.cos(s.clock * b.speed * 0.8 + b.phase) * 30;
    g.globalAlpha = 0.55;
    g.fillStyle = b.color;
    g.beginPath();
    g.arc(x, y, b.size * (1 + 0.08 * pulse), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
}

function header(g: CanvasRenderingContext2D, s: SceneState, beatIndex: number, pop: number) {
  const y = 44;
  const h = 72;
  g.textBaseline = "middle";

  // The site's address, styled like the navbar's wordmark (an italic "abc"),
  // so a shared video says where it came from.
  const REST = "sightreading.com";
  g.font = `italic 600 40px Georgia, serif`;
  const abcW = g.measureText("abc").width;
  g.font = `700 40px ${FONT}`;
  const restW = g.measureText(REST).width;
  pill(g, 90, y, abcW + restW + 56, h, PAPER);
  g.textAlign = "left";
  g.fillStyle = ACTION;
  g.font = `italic 600 40px Georgia, serif`;
  g.fillText("abc", 118, y + h / 2 + 2);
  g.fillStyle = INK;
  g.font = `700 40px ${FONT}`;
  g.fillText(REST, 118 + abcW + 2, y + h / 2 + 2);

  // One dot a beat; the beat sounding fills with this bar's colour and pops.
  const gap = 56;
  const left = W / 2 - ((s.beats - 1) * gap) / 2;
  const bar = s.frame.bar ?? -1;
  for (let b = 0; b < s.beats; b++) {
    const on = s.playing && b === beatIndex && s.frame.phase !== "done";
    const r = on ? 18 + 8 * pop : 14;
    g.beginPath();
    g.arc(left + b * gap, y + h / 2, r, 0, Math.PI * 2);
    g.fillStyle = on ? (bar >= 0 ? pastel(bar).ink : ACTION) : PAPER;
    g.fill();
    if (!on) {
      g.lineWidth = 4;
      g.strokeStyle = HAIRLINE;
      g.stroke();
    }
  }

  // Tempo and meter, then which bar of how many.
  const right = 90 + 1740;
  g.font = `700 36px ${FONT}`;
  const counter = s.frame.bar != null ? `${s.frame.bar + 1} / ${s.total}` : `${s.total} bars`;
  const counterW = g.measureText(counter).width + 56;
  pill(g, right - counterW, y, counterW, h, PAPER);
  g.fillStyle = INK;
  g.textAlign = "center";
  g.fillText(counter, right - counterW / 2, y + h / 2 + 2);

  const tempo = `${s.meter}  ·  ♩ = ${s.bpm}`;
  const tempoW = g.measureText(tempo).width + 56;
  pill(g, right - counterW - 16 - tempoW, y, tempoW, h, PAPER);
  g.fillStyle = MUTED;
  g.fillText(tempo, right - counterW - 16 - tempoW / 2, y + h / 2 + 2);
}

function card(g: CanvasRenderingContext2D, which: "top" | "bottom", barIndex: number | null, s: SceneState) {
  const c = CARDS[which];
  const active = s.frame.active === which;
  const color = barIndex != null ? pastel(barIndex) : null;

  g.save();
  if (active && color) {
    g.shadowColor = color.ink + "55";
    g.shadowBlur = 48;
    g.shadowOffsetY = 12;
  } else {
    g.shadowColor = "#15213a22";
    g.shadowBlur = 20;
    g.shadowOffsetY = 6;
  }
  g.fillStyle = PAPER;
  g.beginPath();
  g.roundRect(c.x, c.y, c.w, c.h, 40);
  g.fill();
  g.restore();

  g.lineWidth = active ? 10 : 5;
  g.strokeStyle = active && color ? color.bg : HAIRLINE;
  g.beginPath();
  g.roundRect(c.x, c.y, c.w, c.h, 40);
  g.stroke();

  if (barIndex == null || !color) return;
  const bar = s.bars[barIndex];
  if (!bar) return;

  // The bar number in a coloured badge; the bar waiting says "next".
  g.fillStyle = color.bg;
  g.beginPath();
  g.arc(c.x + 64, c.y + 64, 36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color.ink;
  g.font = `700 36px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(barIndex + 1), c.x + 64, c.y + 66);
  if (!active && s.playing && s.frame.phase === "playing") {
    g.fillStyle = MUTED;
    g.font = `600 28px ${FONT}`;
    g.textAlign = "left";
    g.fillText("next", c.x + 112, c.y + 66);
  }

  // The picture keeps room for a row of words above and below (bar-images.ts),
  // blank when there are none, so it may reach nearer the card's edges.
  let dw = c.w - 200;
  let dh = dw / bar.aspect;
  if (dh > c.h - 40) {
    dh = c.h - 40;
    dw = dh * bar.aspect;
  }
  const dx = c.x + (c.w - dw) / 2 + 30;
  // Nudged down past the bar badge, never past the card's foot.
  const dy = c.y + Math.min((c.h - dh) / 2 + 20, c.h - dh - 12);
  const staffY = dy + bar.staffAt * dh;

  const ball = active && s.showBall !== false ? ballAt(bar.notes, s.frame.progress, bar.musicEnd) : null;

  // A glow behind the note just landed on, fading through its length.
  if (ball && ball.note >= 0) {
    const n = bar.notes[ball.note];
    g.globalAlpha = 0.9 * (1 - ball.hop);
    g.fillStyle = color.bg;
    g.beginPath();
    g.arc(dx + n.x * dw, staffY, 52, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  g.globalAlpha = active || !s.playing ? 1 : 0.8;
  g.drawImage(bar.img, dx, dy, dw, dh);
  g.globalAlpha = 1;

  if (ball) {
    const x = dx + ball.x * dw;
    // On top of the notes: the stems point up, so it lands on their tips.
    const ground = dy + bar.notesTopAt * dh - 26;
    // Higher for a longer note, but never out of the card.
    const arc = Math.min(70 + 150 * Math.min(1, ball.span * 2), ground - (c.y + 40));
    const y = ground - ball.lift * arc;
    // Its shadow on the staff, smaller the higher it flies.
    g.fillStyle = "#15213a";
    g.globalAlpha = 0.12 * (1 - ball.lift * 0.6);
    g.beginPath();
    g.ellipse(x, staffY - 6, 26 * (1 - ball.lift * 0.4), 7, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    // Squashed for a moment as it lands.
    const squash = ball.hop < 0.12 || ball.hop > 0.94 ? 1 : 0;
    const rx = 24 * (squash ? 1.22 : 1);
    const ry = 24 * (squash ? 0.8 : 1);
    g.fillStyle = ACTION;
    g.beginPath();
    g.ellipse(x, y + (squash ? 5 : 0), rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffffcc";
    g.beginPath();
    g.ellipse(x - 8, y - 8 + (squash ? 4 : 0), 7, 5, -0.6, 0, Math.PI * 2);
    g.fill();
  }
}

function progressBar(g: CanvasRenderingContext2D, s: SceneState) {
  const x = 90;
  const w = 1740;
  const y = 1022;
  const h = 16;
  const totalSec = (s.countInBars + s.total) * s.beats * s.beatSec;
  const p = s.playing ? Math.min(1, Math.max(0, s.t / totalSec)) : 0;
  pill(g, x, y, w, h, "#ffffffb0");
  if (p > 0) pill(g, x, y, Math.max(h, w * p), h, ACTION);
}

function countIn(g: CanvasRenderingContext2D, word: string, beatPos: number, pop: number) {
  g.fillStyle = "#ffffff99";
  g.fillRect(0, 140, W, 860);
  const color = pastel(Math.max(0, Math.floor(beatPos)));
  const r = 190 * (1 + 0.18 * pop);
  g.save();
  g.shadowColor = color.ink + "44";
  g.shadowBlur = 50;
  g.fillStyle = color.bg;
  g.beginPath();
  g.arc(W / 2, 570, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = color.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = word.length > 2 ? 104 : 170;
  g.font = `700 ${Math.round(size * (1 + 0.15 * pop))}px ${FONT}`;
  g.fillText(word, W / 2, 580);
}

function finish(g: CanvasRenderingContext2D, s: SceneState) {
  const t = s.sinceEnd;
  const fade = Math.min(1, t / 0.4);
  g.fillStyle = `rgba(255,255,255,${0.7 * fade})`;
  g.fillRect(0, 0, W, H);

  // Confetti in the four pastels and the action blue, falling from the top.
  const colors = [...PASTELS.map((p) => p.ink), ACTION, ...PASTELS.map((p) => p.bg)];
  for (let i = 0; i < 90; i++) {
    const r = (n: number) => {
      const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const x = r(1) * W + Math.sin(t * 3 + i) * 30;
    const y = -40 + (r(2) * 300 + t * (380 + r(3) * 420)) % (H + 80);
    g.save();
    g.translate(x, y);
    g.rotate(t * (2 + r(4) * 4) + i);
    g.fillStyle = colors[i % colors.length];
    g.globalAlpha = fade;
    g.fillRect(-9, -5, 18, 10);
    g.restore();
  }
  g.globalAlpha = 1;

  const scale = 0.85 + 0.15 * Math.min(1, t / 0.35);
  g.save();
  g.translate(W / 2, H / 2);
  g.scale(scale, scale);
  g.globalAlpha = fade;
  g.fillStyle = PAPER;
  g.shadowColor = "#15213a33";
  g.shadowBlur = 60;
  g.beginPath();
  g.roundRect(-460, -170, 920, 340, 48);
  g.fill();
  g.shadowBlur = 0;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = INK;
  g.font = `700 120px ${FONT}`;
  g.fillText("Nice work!", 0, -56);
  g.fillStyle = MUTED;
  g.font = `600 40px ${FONT}`;
  g.fillText(`${s.total} bars at ♩ = ${s.bpm}`, 0, 46);
  // Where it came from, on the frame a shared video ends on.
  g.fillStyle = ACTION;
  g.font = `700 38px ${FONT}`;
  g.fillText("abcsightreading.com", 0, 116);
  g.restore();
  g.globalAlpha = 1;
}
