<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { voiceReading } from "../../../lib/tools/voice-analysis";
  import { canvasColors, onThemeChange } from "../../../lib/tuner/canvas-colors";

  /**
   * The live spectrum on a log frequency axis, 80 Hz to 5 kHz. Overlays, each
   * switchable: the outline (the spectrum's shape through its harmonics, where
   * the vowel's resonances are the humps), the harmonics marked and numbered,
   * and F1 and F2.
   */
  export let outline = true;
  export let marks = true;
  export let formantLines = true;
  /** Height in px: taller on the abcTuner page. */
  export let height = 180;

  const LO = 80, HI = 5000, RANGE_DB = 70;
  $: H = height;
  let canvas: HTMLCanvasElement;
  let c = canvasColors();
  const offTheme = onThemeChange(() => { c = canvasColors(); draw(); });

  const xOf = (hz: number, w: number) => (Math.log(hz / LO) / Math.log(HI / LO)) * w;

  function draw() {
    if (!canvas) return;
    const r = $voiceReading;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const plotH = H - 18;

    // The top of the scale follows the loudest bin, so a quiet singer still fills it.
    let top = -30;
    if (r.spectrum) for (const v of r.spectrum) if (v > top) top = v;
    top = Math.ceil(top / 10) * 10;
    const yOf = (db: number) => Math.min(plotH, Math.max(0, ((top - db) / RANGE_DB) * plotH));

    // Grid.
    g.font = "600 10px Nunito, system-ui, sans-serif";
    g.textAlign = "center";
    g.fillStyle = c.muted;
    g.strokeStyle = c.hairline;
    g.lineWidth = 1;
    for (const [hz, label] of [[100, "100"], [200, "200"], [500, "500"], [1000, "1k"], [2000, "2k"], [5000, "5k"]] as const) {
      const x = Math.round(xOf(hz, w)) + 0.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, plotH); g.stroke();
      g.fillText(label, Math.min(w - 10, Math.max(10, x)), H - 4);
    }
    for (let db = top - 10; db > top - RANGE_DB; db -= 10) {
      const y = Math.round(yOf(db)) + 0.5;
      g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      g.globalAlpha = 1;
    }
    if (!r.spectrum) return;

    // The spectrum: the loudest bin under each pixel, so narrow peaks survive.
    g.strokeStyle = c.ink2;
    g.lineWidth = 1.25;
    g.beginPath();
    // Low down, where a bin spans several pixels, interpolate between bins so a
    // peak comes to a point instead of a flat top.
    for (let px = 0; px <= w; px++) {
      const fLo = (LO * Math.pow(HI / LO, px / w)) / r.binHz;
      const fHi = (LO * Math.pow(HI / LO, (px + 1) / w)) / r.binHz;
      let m = -Infinity;
      if (fHi - fLo < 1) {
        const b = Math.max(1, Math.min(r.spectrum.length - 2, Math.floor(fLo)));
        const t = fLo - b;
        m = r.spectrum[b] * (1 - t) + r.spectrum[b + 1] * t;
      } else {
        const lo = Math.max(1, Math.floor(fLo));
        const hi = Math.min(r.spectrum.length - 1, Math.floor(fHi));
        for (let b = lo; b <= hi; b++) if (r.spectrum[b] > m) m = r.spectrum[b];
      }
      const y = yOf(m);
      if (px === 0) g.moveTo(px, y); else g.lineTo(px, y);
    }
    g.stroke();

    if (outline && r.envelope && r.f0) {
      g.strokeStyle = c.action;
      g.lineWidth = 3;
      g.lineJoin = "round";
      g.beginPath();
      let started = false;
      for (let px = 0; px <= w; px++) {
        const hz = LO * Math.pow(HI / LO, px / w);
        if (hz < r.f0 * 0.9) continue;
        const b = Math.min(r.envelope.length - 1, Math.round(hz / r.binHz));
        const y = yOf(r.envelope[b]);
        if (!started) { g.moveTo(px, y); started = true; } else g.lineTo(px, y);
      }
      g.stroke();
    }

    if (marks && r.f0) {
      const loud = r.spectrum;
      for (const h of r.harmonics) {
        if (h.hz < LO || h.hz > HI) continue;
        const x = xOf(h.hz, w);
        const b = Math.round(h.hz / r.binHz);
        const y = yOf(loud[b] ?? -200);
        g.fillStyle = c.action;
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
        if (h.k <= 10 && (h.k === 1 || xOf(h.hz, w) - xOf(h.hz - r.f0, w) > 14)) {
          g.fillStyle = c.actionFg;
          g.fillText(String(h.k), x, Math.max(10, y - 7));
        }
      }
    }

    if (formantLines && r.formants && r.f0) {
      const lines: [string, number | null][] = [["F1", r.formants.f1], ["F2", r.formants.f2]];
      g.setLineDash([4, 4]);
      g.lineWidth = 1.5;
      for (const [name, hz] of lines) {
        if (!hz) continue;
        const x = Math.round(xOf(hz, w)) + 0.5;
        g.strokeStyle = c.ink;
        g.beginPath(); g.moveTo(x, 12); g.lineTo(x, plotH); g.stroke();
        g.fillStyle = c.ink;
        g.textAlign = x > w - 40 ? "right" : "left";
        g.fillText(`${name} ${Math.round(hz)}`, x + (x > w - 40 ? -4 : 4), 10);
      }
      g.setLineDash([]);
      g.textAlign = "center";
    }
  }

  const unsub = voiceReading.subscribe(() => requestAnimationFrame(draw));
  onMount(draw);
  onDestroy(() => { unsub(); offTheme(); });
  $: outline, marks, formantLines, canvas && draw();
</script>

<canvas bind:this={canvas} class="w-full block rounded-[14px] bg-sr-track" style="height: {H}px" aria-label="The live spectrum of your voice"></canvas>
