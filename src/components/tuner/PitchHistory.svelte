<script lang="ts">
  /** A short trace, for the practice pages' Analysis card. */
  export let compact = false;
  /**
   * Last-10-seconds pitch view: piano roll (absolute pitch) or cents deviation.
   * Ported from the tuner project's PitchHistory.tsx; the drawing is the same,
   * with the neutral colours taken from the site theme so it reads in light
   * and dark alike. Pitch colours (green / amber / red) stay fixed.
   */
  import { pitchHistory, type HistoryPoint } from "../../lib/tuner/pitch-history";
  import { tuner } from "../../lib/tuner/store";
  import { NOTES, solfegeFor } from "../../lib/tuner/pitch";
  import type { NoteName } from "../../lib/tuner/types";
  import { canvasColors, centsColor, IN_TUNE } from "../../lib/tuner/canvas-colors";

  const WINDOW_MS = 10_000;
  const GAP_MS = 120; // break the line across gaps longer than this
  const MIN_RUN_MS = 150; // label runs of the same note at least this long

  type Snapshot = { points: HistoryPoint[]; now: number } | null;
  type Mode = "roll" | "cents";
  type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

  const nameOf = (midi: number) => NOTES[((midi % 12) + 12) % 12];
  const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;

  function noteLabel(midi: number, solfege: boolean, key: NoteName) {
    const name = nameOf(midi);
    return solfege ? solfegeFor(name, key) : `${name}${octaveOf(midi)}`;
  }

  /** A theme colour at partial opacity. The tokens are hex; anything else is returned as is. */
  function alpha(color: string, a: number): string {
    let hex = color.trim();
    if (!hex.startsWith("#")) return color;
    hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
    if (hex.length !== 6) return color;
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  let mode: Mode = "roll";
  let frozen = false;
  let snap: Snapshot = null;

  function toggleFreeze() {
    frozen = !frozen;
    snap = frozen ? { points: pitchHistory.recent(WINDOW_MS), now: performance.now() } : null;
  }

  /**
   * Svelte action: a DPR-scaled canvas that fills its container (the node) and
   * runs `draw` every frame. The draw function is fixed for the life of the
   * element, so per-canvas state made alongside it lasts exactly as long as the
   * canvas is shown.
   */
  function canvasLoop(container: HTMLDivElement, draw: Draw) {
    const canvas = container.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return {};
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = container.clientWidth;
      h = container.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (w && h) draw(ctx, w, h);
    };
    raf = requestAnimationFrame(loop);
    return {
      destroy() {
        cancelAnimationFrame(raf);
        observer.disconnect();
      },
    };
  }

  /** Scrolling cents-vs-time trace with note labels. */
  function makeCentsDraw(): Draw {
    return (ctx, w, h) => {
      const now = snap?.now ?? performance.now();
      const points = snap?.points ?? pitchHistory.recent(WINDOW_MS);
      const { displayMode, key } = tuner.get();
      const solfege = displayMode === "solfege";
      const c = canvasColors();

      const padL = 34;
      const padB = 26;
      const padT = 8;
      const plotW = w - padL - 6;
      const plotH = h - padT - padB;
      const xOf = (t: number) => padL + ((t - (now - WINDOW_MS)) / WINDOW_MS) * plotW;
      const yOf = (cents: number) => padT + plotH / 2 - (cents / 50) * (plotH / 2);

      ctx.clearRect(0, 0, w, h);

      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const cents of [-50, -25, -10, 0, 10, 25, 50]) {
        const y = yOf(cents);
        ctx.strokeStyle = cents === 0 ? c.faint : c.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.fillStyle = c.muted;
        ctx.fillText(cents > 0 ? `+${cents}` : String(cents), padL - 4, y);
      }
      ctx.fillStyle = alpha(IN_TUNE, c.dark ? 0.07 : 0.1);
      ctx.fillRect(padL, yOf(10), plotW, yOf(-10) - yOf(10));

      // Level trace along the bottom
      ctx.beginPath();
      ctx.moveTo(padL, padT + plotH);
      for (const p of points) {
        const lvl = Number.isFinite(p.dbfs) ? Math.max(0, (p.dbfs + 60) / 60) : 0;
        ctx.lineTo(xOf(p.t), padT + plotH - lvl * plotH * 0.25);
      }
      ctx.lineTo(xOf(points.at(-1)?.t ?? now), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = "rgba(96,165,250,0.18)";
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      let prev: HistoryPoint | null = null;
      for (const p of points) {
        if (p.midi === null) {
          prev = null;
          continue;
        }
        if (prev && prev.midi === p.midi && p.t - prev.t < GAP_MS) {
          ctx.strokeStyle = centsColor(p.cents);
          ctx.beginPath();
          ctx.moveTo(xOf(prev.t), yOf(prev.cents));
          ctx.lineTo(xOf(p.t), yOf(p.cents));
          ctx.stroke();
        } else {
          ctx.fillStyle = centsColor(p.cents);
          ctx.beginPath();
          ctx.arc(xOf(p.t), yOf(p.cents), 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        prev = p;
      }

      // Note labels for runs of the same note
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      let runStart: HistoryPoint | null = null;
      let runLast: HistoryPoint | null = null;
      let runCents = 0;
      let runN = 0;
      const flush = () => {
        const start = runStart as HistoryPoint | null;
        const last = runLast as HistoryPoint | null;
        if (start && last && last.t - start.t >= MIN_RUN_MS && start.midi !== null) {
          const x = xOf(start.t);
          const mean = Math.round(runCents / runN);
          ctx.fillStyle = c.ink2;
          ctx.fillText(noteLabel(start.midi, solfege, key), x, padT + plotH + 3);
          ctx.fillStyle = centsColor(mean);
          ctx.fillText(`${mean > 0 ? "+" : ""}${mean}`, x, padT + plotH + 14);
        }
        runStart = runLast = null;
        runCents = runN = 0;
      };
      for (const p of points) {
        const last = runLast as HistoryPoint | null;
        if (p.midi === null || (last && (p.midi !== last.midi || p.t - last.t > GAP_MS * 3))) {
          flush();
        }
        if (p.midi !== null) {
          runStart ??= p;
          runLast = p;
          runCents += p.cents;
          runN++;
        }
      }
      flush();
    };
  }

  const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  const MIN_SPAN = 14; // semitones visible at minimum
  const RANGE_PAD = 2; // semitones kept clear above/below the trace
  const SHRINK_SLACK = 6; // unused semitones tolerated before zooming back in
  const EXPAND_EASE = 0.15;
  const SHRINK_EASE = 0.03;

  /** Median of a point's pitch with its neighbours in the same continuous run. */
  function smoothedPitch(points: HistoryPoint[], i: number): number {
    const p = points[i];
    const cur = (p.midi ?? 0) + p.cents / 100;
    const a = points[i - 1];
    const b = points[i + 1];
    if (!a || !b || a.midi === null || b.midi === null) return cur;
    if (p.t - a.t > GAP_MS || b.t - p.t > GAP_MS) return cur;
    const x = (a.midi ?? 0) + a.cents / 100;
    const y = (b.midi ?? 0) + b.cents / 100;
    return Math.max(Math.min(x, cur), Math.min(Math.max(x, cur), y));
  }

  /** Piano-roll: absolute pitch over time, one lane per semitone, auto-ranging. */
  function makeRollDraw(): Draw {
    // Visible midi range: `target` snaps to whole semitones and only moves when
    // the trace would leave the view (or leaves lots of space unused); the
    // drawn range eases toward it. Made fresh each time the roll is shown.
    const range = { lo: 52, hi: 76, targetLo: 52, targetHi: 76 };

    return (ctx, w, h) => {
      const now = snap?.now ?? performance.now();
      const points = snap?.points ?? pitchHistory.recent(WINDOW_MS);
      const { displayMode, key } = tuner.get();
      const solfege = displayMode === "solfege";
      const keyIndex = NOTES.indexOf(key);
      const pitches = points.map((p, i) => (p.midi === null ? null : smoothedPitch(points, i)));
      const c = canvasColors();

      // Auto-range with hysteresis
      let minM = Infinity;
      let maxM = -Infinity;
      for (const m of pitches) {
        if (m === null) continue;
        if (m < minM) minM = m;
        if (m > maxM) maxM = m;
      }
      if (minM !== Infinity) {
        let needLo = Math.floor(minM - RANGE_PAD);
        let needHi = Math.ceil(maxM + RANGE_PAD);
        if (needHi - needLo < MIN_SPAN) {
          const extra = MIN_SPAN - (needHi - needLo);
          needLo -= Math.floor(extra / 2);
          needHi += Math.ceil(extra / 2);
        }
        const fits = range.targetLo <= needLo && range.targetHi >= needHi;
        const wasted = range.targetHi - range.targetLo - (needHi - needLo);
        if (!fits) {
          // Expand just enough, keeping the side that still fits where it is.
          range.targetLo = Math.min(range.targetLo, needLo);
          range.targetHi = Math.max(range.targetHi, needHi);
          if (range.targetHi - range.targetLo > MIN_SPAN * 2.5) {
            range.targetLo = needLo;
            range.targetHi = needHi;
          }
        } else if (wasted > SHRINK_SLACK) {
          range.targetLo = needLo;
          range.targetHi = needHi;
        }
      }
      const shrinking = range.targetHi - range.targetLo < range.hi - range.lo - 0.01;
      const ease = snap ? 1 : shrinking ? SHRINK_EASE : EXPAND_EASE;
      range.lo += (range.targetLo - range.lo) * ease;
      range.hi += (range.targetHi - range.hi) * ease;
      const { lo, hi } = range;

      const kbW = 38;
      const padT = 6;
      const padB = 16;
      const plotX = kbW + 2;
      const plotW = w - plotX - 4;
      const plotH = h - padT - padB;
      const laneH = plotH / (hi - lo);
      const yOf = (m: number) => padT + plotH - (m - lo) * laneH;
      const xOf = (t: number) => plotX + ((t - (now - WINDOW_MS)) / WINDOW_MS) * plotW;

      // Theme-derived lane and key colours. Diatonic lanes sit raised, the
      // chromatic ones recessed, the tonic tinted green. The keyboard keeps a
      // piano's contrast: in light, white keys are the raised surface and
      // black keys the ink; in dark, the reverse.
      const laneRoot = alpha(IN_TUNE, c.dark ? 0.1 : 0.14);
      const laneDiatonic = c.raise;
      const laneChromatic = c.dark ? c.ground : c.track;
      const whiteKey = c.dark ? c.ink2 : c.raise;
      const blackKey = c.dark ? c.raise : c.ink2;
      const whiteLabel = c.dark ? c.ground : c.ink2;
      const blackLabel = c.dark ? c.muted : c.tint;

      ctx.clearRect(0, 0, w, h);

      // Lanes + keyboard
      const current = points.at(-1);
      const currentMidi =
        current && current.midi !== null && now - current.t < 300 ? current.midi : null;
      const labelEvery = laneH >= 11;
      ctx.font = `${Math.min(11, Math.max(8, laneH - 3))}px system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      for (let n = Math.floor(lo); n <= Math.ceil(hi); n++) {
        const y0 = Math.max(padT, yOf(n + 0.5));
        const y1 = Math.min(padT + plotH, yOf(n - 0.5));
        if (y1 <= y0) continue;
        const step = ((((n % 12) - keyIndex) % 12) + 12) % 12;
        const diatonic = MAJOR_STEPS.includes(step);
        const isRoot = step === 0;
        if (isRoot) {
          // The green tint over a raised lane, so it reads as a lane first.
          ctx.fillStyle = laneDiatonic;
          ctx.fillRect(plotX, y0, plotW, y1 - y0);
          ctx.fillStyle = laneRoot;
        } else {
          ctx.fillStyle = diatonic ? laneDiatonic : laneChromatic;
        }
        ctx.fillRect(plotX, y0, plotW, y1 - y0);
        ctx.strokeStyle = c.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plotX, y1 + 0.5);
        ctx.lineTo(plotX + plotW, y1 + 0.5);
        ctx.stroke();

        const black = BLACK_KEYS.has(((n % 12) + 12) % 12);
        const isCurrent = currentMidi === n;
        // The 1px gap between keys shows the hairline behind them.
        ctx.fillStyle = c.hairline;
        ctx.fillRect(0, y0, kbW, y1 - y0);
        ctx.fillStyle = isCurrent ? IN_TUNE : black ? blackKey : whiteKey;
        ctx.fillRect(0, y0, kbW, y1 - y0 - 1);
        const label = solfege
          ? isRoot
            ? `${solfegeFor(nameOf(n), key)}${octaveOf(n)}`
            : solfegeFor(nameOf(n), key)
          : nameOf(n) === "C"
            ? `C${octaveOf(n)}`
            : nameOf(n).replace("#", "♯");
        if (labelEvery || isRoot || (!solfege && nameOf(n) === "C")) {
          ctx.fillStyle = isCurrent ? "#03301a" : black ? blackLabel : whiteLabel;
          ctx.textAlign = "left";
          ctx.fillText(label, 4, (y0 + y1) / 2);
        }
      }

      // Time ticks every 2 s
      ctx.strokeStyle = c.hairline;
      ctx.fillStyle = c.faint;
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let s = 0; s <= WINDOW_MS / 1000; s += 2) {
        const x = xOf(now - WINDOW_MS + s * 1000);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        if (s > 0 && s < 10) ctx.fillText(`-${10 - s}s`, x, padT + plotH + 3);
      }

      // Pitch trace
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      let prev: HistoryPoint | null = null;
      let prevY = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const m = pitches[i];
        if (m === null) {
          prev = null;
          continue;
        }
        const x = xOf(p.t);
        const y = yOf(m);
        if (prev && p.t - prev.t < GAP_MS) {
          ctx.strokeStyle = centsColor(p.cents);
          ctx.beginPath();
          ctx.moveTo(xOf(prev.t), prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.fillStyle = centsColor(p.cents);
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        prev = p;
        prevY = y;
      }

      // Live dot
      const lastPitch = pitches.at(-1) ?? null;
      if (current && lastPitch !== null && now - current.t < 300) {
        const x = xOf(current.t);
        const y = yOf(lastPitch);
        ctx.fillStyle = centsColor(current.cents);
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };
  }
</script>

<div class="flex flex-col gap-2 p-3 bg-sr-panel border border-sr-hairline rounded-lg">
  <div class="flex items-center justify-between gap-2 text-xs text-sr-muted">
    <span>Pitch · last 10 s</span>
    <div class="flex gap-1">
      <button type="button" class="sr-tok" class:sr-on={mode === "roll"} on:click={() => (mode = "roll")}>
        Roll
      </button>
      <button type="button" class="sr-tok" class:sr-on={mode === "cents"} on:click={() => (mode = "cents")}>
        Cents
      </button>
      <button
        type="button"
        class="sr-tok ml-2"
        class:freeze-on={frozen}
        aria-pressed={frozen}
        on:click={toggleFreeze}
      >
        {frozen ? "Frozen" : "Freeze"}
      </button>
    </div>
  </div>
  {#if mode === "roll"}
    <div class="w-full {compact ? 'h-44' : 'h-72 md:h-96 lg:h-[28rem]'}" use:canvasLoop={makeRollDraw()}>
      <canvas class="w-full h-full block"></canvas>
    </div>
  {:else}
    <div class="w-full {compact ? 'h-40' : 'h-64 md:h-80 lg:h-96'}" use:canvasLoop={makeCentsDraw()}>
      <canvas class="w-full h-full block"></canvas>
    </div>
  {/if}
</div>

<style>
  .freeze-on,
  .freeze-on:hover {
    background: var(--sr-brass-bg);
    color: var(--sr-brass);
    border-color: var(--sr-brass);
    font-weight: 600;
  }
</style>
