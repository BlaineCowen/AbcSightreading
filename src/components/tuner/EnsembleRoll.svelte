<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import { canvasColors, centsColor, onThemeChange } from "../../lib/tuner/canvas-colors";
  import { a4Offset, tuningOf, type MeasuredNote } from "../../lib/ensemble-tuning/tuning";

  /**
   * The take as a piano roll, as OmniPitch draws it: each note a bar at the
   * pitch it was heard at (not snapped to the line), its colour how far it is
   * from equal temperament at the tuner's A (the tuner's green, amber, red),
   * its height its loudness, and its pitch's slow course traced through it. Unsure
   * notes (the two readings disagree) are outlined, dashed, not filled. A
   * waveform lane runs along the top. Scroll or drag to move along, Ctrl or
   * Cmd and scroll (or pinch) to zoom; tap a note to choose it, tap anywhere
   * else to move the playhead there.
   */
  export let notes: MeasuredNote[] = [];
  export let parts: number[] = [];
  export let a4 = 440;
  /** Loudness per block, 0..1, and blocks a second. */
  export let peaks: Float32Array = new Float32Array(0);
  export let peakRate = 1;
  export let duration = 1;
  export let time = 0;
  export let playing = false;
  /** A part to bring forward (-1: all). */
  export let focus = -1;
  export let selected = -1;
  export let height = 380;

  const dispatch = createEventDispatcher<{ seek: number; select: number }>();

  const KEYS_W = 40, WAVE_H = 34, AXIS_H = 16;
  const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const BLACK = new Set([1, 3, 6, 8, 10]);

  let canvas: HTMLCanvasElement;
  let width = 600;
  let c = canvasColors();
  const offTheme = onThemeChange(() => {
    c = canvasColors();
    draw();
  });

  // The view: seconds from viewStart, viewSecs wide.
  let viewStart = 0;
  let viewSecs = 10;
  let fitted = false;
  $: if (!fitted && duration > 0) {
    viewSecs = Math.min(duration, 12);
    viewStart = 0;
    fitted = true;
  }
  export function fitAll() {
    viewStart = 0;
    viewSecs = Math.max(1, duration);
  }
  export function zoom(factor: number, at = viewStart + viewSecs / 2) {
    const next = Math.min(Math.max(1.5, viewSecs * factor), Math.max(2, duration));
    viewStart = clampStart(at - ((at - viewStart) * next) / viewSecs);
    viewSecs = next;
  }
  const clampStart = (s: number) => Math.max(0, Math.min(s, Math.max(0, duration - viewSecs)));

  // Pitch range: every note with a semitone and a half spare.
  $: lo = notes.length ? Math.min(...notes.map((n) => n.midi)) - 2 : 48;
  $: hi = notes.length ? Math.max(...notes.map((n) => n.midi)) + 2 : 72;

  $: rollTop = WAVE_H;
  $: rollH = height - WAVE_H - AXIS_H;
  $: rowH = rollH / Math.max(1, hi - lo + 1);
  $: xOf = (t: number) => KEYS_W + ((t - viewStart) / viewSecs) * (width - KEYS_W);
  $: tOf = (x: number) => viewStart + ((x - KEYS_W) / (width - KEYS_W)) * viewSecs;
  /** y of a pitch (fractional MIDI), the row's centre. */
  $: yOf = (p: number) => rollTop + (hi - p + 0.5) * rowH;

  // Keep the playhead in view while playing, a page at a time.
  $: if (playing && (time < viewStart || time > viewStart + viewSecs * 0.92)) viewStart = clampStart(time - viewSecs * 0.08);

  $: (notes, parts, a4, peaks, time, focus, selected, viewStart, viewSecs, width, height, c), draw();

  /** Where a note sits on the roll: at its pitch against the tuner's A. */
  const pitchOf = (n: MeasuredNote) => {
    const t = tuningOf(n, a4);
    return t.midi + t.cents / 100;
  };

  function draw() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    g.font = "600 10px Nunito, system-ui, sans-serif";

    // Rows: the black keys' rows shaded, a line under every C.
    for (let m = lo; m <= hi; m++) {
      const y = yOf(m) - rowH / 2;
      if (BLACK.has(((m % 12) + 12) % 12)) {
        g.fillStyle = c.track;
        g.globalAlpha = 0.55;
        g.fillRect(KEYS_W, y, width - KEYS_W, rowH);
        g.globalAlpha = 1;
      }
      if (m % 12 === 0) {
        g.strokeStyle = c.hairline;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(KEYS_W, Math.round(y + rowH) + 0.5);
        g.lineTo(width, Math.round(y + rowH) + 0.5);
        g.stroke();
      }
    }
    // The key names, every C and, with room, every white key.
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (let m = lo; m <= hi; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (pc !== 0 && (rowH < 9 || BLACK.has(pc))) continue;
      g.fillStyle = pc === 0 ? c.ink2 : c.faint;
      g.fillText(`${NAMES[pc]}${Math.floor(m / 12) - 1}`, KEYS_W - 6, yOf(m));
    }

    // Seconds along the bottom.
    const step = [1, 2, 5, 10, 15, 30, 60].find((s) => (s / viewSecs) * (width - KEYS_W) >= 60) ?? 60;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    for (let t = Math.ceil(viewStart / step) * step; t <= viewStart + viewSecs; t += step) {
      const x = Math.round(xOf(t)) + 0.5;
      g.strokeStyle = c.hairline;
      g.globalAlpha = 0.6;
      g.beginPath();
      g.moveTo(x, rollTop);
      g.lineTo(x, rollTop + rollH);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = c.muted;
      g.fillText(clock(t), x, height - 4);
    }

    // The waveform lane.
    g.fillStyle = c.faint;
    const mid = WAVE_H / 2;
    for (let x = KEYS_W; x < width; x++) {
      const a = Math.floor(tOf(x) * peakRate), b = Math.max(a + 1, Math.floor(tOf(x + 1) * peakRate));
      let v = 0;
      for (let i = Math.max(0, a); i < Math.min(peaks.length, b); i++) v = Math.max(v, peaks[i]);
      const h = v * (WAVE_H - 8);
      if (h > 0.5) g.fillRect(x, mid - h / 2, 1, h);
    }

    // Notes: the chosen part's last, so they sit on top.
    g.save();
    g.beginPath();
    g.rect(KEYS_W, rollTop, width - KEYS_W, rollH);
    g.clip();
    const order = notes.map((_, j) => j).sort((p, q) => Number(parts[p] === focus) - Number(parts[q] === focus));
    for (const j of order) {
      const n = notes[j];
      if (n.end < viewStart || n.start > viewStart + viewSecs) continue;
      const x0 = xOf(n.start), x1 = Math.max(x0 + 2, xOf(n.end));
      const y = yOf(pitchOf(n));
      const h = Math.max(4, rowH * (0.45 + 0.4 * Math.min(1, n.velocity)));
      const faded = focus >= 0 && parts[j] !== focus;
      const colour = centsColor(tuningOf(n, a4).cents);
      g.globalAlpha = faded ? 0.18 : 1;
      roundRect(g, x0, y - h / 2, x1 - x0, h, Math.min(h / 2, 5));
      if (n.sure) {
        g.fillStyle = colour;
        g.globalAlpha = faded ? 0.18 : 0.85;
        g.fill();
      } else {
        g.setLineDash([3, 3]);
        g.strokeStyle = c.muted;
        g.lineWidth = 1.5;
        g.stroke();
        g.setLineDash([]);
      }
      // The pitch as it moved through the note: its slow course (centre and drift), without the vibrato,
      // which at this size only draws as a scribble.
      const cv = n.curve;
      if (cv && cv.drawn && x1 - x0 > 12 && !faded) {
        g.strokeStyle = c.dark ? "rgba(255,255,255,0.75)" : "rgba(20,30,45,0.6)";
        g.lineWidth = 1.25;
        g.beginPath();
        const off = a4Offset(a4);
        for (let i = 0; i < cv.drift.length; i++) {
          const t = cv.t0 + i * cv.dt;
          const p = n.midi + (cv.center + cv.drift[i] - off) / 100;
          const px = xOf(t), py = Math.max(y - h, Math.min(y + h, yOf(p)));
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }
      if (j === selected) {
        g.globalAlpha = 1;
        g.strokeStyle = c.ink;
        g.lineWidth = 2;
        roundRect(g, x0 - 2, y - h / 2 - 2, x1 - x0 + 4, h + 4, Math.min(h / 2 + 2, 7));
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.restore();

    // The playhead.
    if (time >= viewStart && time <= viewStart + viewSecs) {
      const x = Math.round(xOf(time)) + 0.5;
      g.strokeStyle = c.action;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, 2);
      g.lineTo(x, rollTop + rollH);
      g.stroke();
    }
    // The keys' edge.
    g.strokeStyle = c.hairline;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(KEYS_W + 0.5, 0);
    g.lineTo(KEYS_W + 0.5, rollTop + rollH);
    g.stroke();
  }

  function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  /** The note nearest a point, within a finger's reach (12 px), the chosen part's first. */
  function noteAt(x: number, y: number): number {
    let found = -1, best = Infinity;
    notes.forEach((n, j) => {
      const x0 = xOf(n.start), x1 = Math.max(x0 + 2, xOf(n.end));
      if (x < x0 - 6 || x > x1 + 6) return;
      const d = Math.abs(y - yOf(pitchOf(n))) - (focus >= 0 && parts[j] === focus ? 4 : 0);
      if (d <= Math.max(12, rowH / 2) && d < best) {
        best = d;
        found = j;
      }
    });
    return found;
  }

  // Pointer: drag to move along, a tap to choose a note or move the playhead. Two fingers pinch to zoom.
  const pointers = new Map<number, number>();
  let drag: { x: number; start: number; moved: boolean } | null = null;
  let pinch: { d: number; secs: number } | null = null;
  function down(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e.offsetX);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.abs(a - b), secs: viewSecs };
      drag = null;
    } else drag = { x: e.offsetX, start: viewStart, moved: false };
  }
  function move(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e.offsetX);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.max(10, Math.abs(a - b));
      const next = Math.min(Math.max(1.5, (pinch.secs * pinch.d) / d), Math.max(2, duration));
      const at = tOf((a + b) / 2);
      viewStart = clampStart(at - ((at - viewStart) * next) / viewSecs);
      viewSecs = next;
      return;
    }
    if (!drag) return;
    const dx = e.offsetX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) viewStart = clampStart(drag.start - (dx / (width - KEYS_W)) * viewSecs);
  }
  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && e.offsetX > KEYS_W) {
      const j = e.offsetY > rollTop ? noteAt(e.offsetX, e.offsetY) : -1;
      if (j >= 0) dispatch("select", j);
      else {
        dispatch("select", -1);
        dispatch("seek", Math.max(0, Math.min(duration, tOf(e.offsetX))));
      }
    }
    drag = null;
  }
  function wheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.01), tOf(e.offsetX));
      return;
    }
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx) return; // vertical scrolling scrolls the page
    e.preventDefault();
    viewStart = clampStart(viewStart + (dx / (width - KEYS_W)) * viewSecs);
  }

  let ro: ResizeObserver;
  onMount(() => {
    ro = new ResizeObserver(() => (width = canvas.clientWidth || 600));
    ro.observe(canvas);
    width = canvas.clientWidth || 600;
  });
  onDestroy(() => {
    ro?.disconnect();
    offTheme();
  });
</script>

<canvas
  bind:this={canvas}
  class="w-full block rounded-2xl bg-sr-raise touch-pan-y select-none cursor-pointer"
  style="height:{height}px"
  aria-label="The take as a piano roll: each note at the pitch it was heard, coloured by how in tune it is"
  on:pointerdown={down}
  on:pointermove={move}
  on:pointerup={up}
  on:pointercancel={up}
  on:wheel={wheel}
></canvas>
