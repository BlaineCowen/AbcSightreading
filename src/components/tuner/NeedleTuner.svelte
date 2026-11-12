<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { solfegeFor } from "../../lib/tuner/pitch";
  import { canvasColors, centsColor, IN_TUNE, CLOSE, OFF } from "../../lib/tuner/canvas-colors";
  import MicStatus from "./MicStatus.svelte";

  /**
   * The needle tuner (12 November 2026, Blaine: "different tuner variants"):
   * a classic meter, 50 cents flat to 50 sharp across an arc, the needle
   * easing to where the voice is, the note name large beneath, and the in-tune
   * window turning green once it has held there.
   */
  const RANGE = 50;
  const IN_TUNE_CENTS = 5;
  const IN_TUNE_HOLD_MS = 300;
  /** The arc spans this much either side of straight up. */
  const SWEEP = (Math.PI * 5) / 12;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = container.clientWidth;
      h = Math.round(w * 0.8);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const draw = { cents: 0, shown: false, inTuneSince: null as number | null };
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      if (!w) return;
      const s = tuner.get();
      const col = canvasColors();
      const now = performance.now();
      const { note, cents, octave, pitch } = s;
      const target = note ? Math.max(-RANGE, Math.min(RANGE, cents)) : 0;
      draw.cents += (target - draw.cents) * (note ? 0.16 : 0.06);
      if (note && Math.abs(cents) < IN_TUNE_CENTS) draw.inTuneSince ??= now;
      else draw.inTuneSince = null;
      const inTune = !!note && draw.inTuneSince !== null && now - draw.inTuneSince > IN_TUNE_HOLD_MS;

      ctx.clearRect(0, 0, w, h);
      // The arc above, the note beneath its pivot, where the needle never goes.
      const r = Math.min(w * 0.44, h * 0.62);
      const cx = w / 2;
      const cy = r * 1.06;
      const angleOf = (c: number) => -Math.PI / 2 + (c / RANGE) * SWEEP;

      // The scale: red ends, amber, green middle.
      const band = (from: number, to: number, color: string) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, angleOf(from), angleOf(to));
        ctx.strokeStyle = color;
        ctx.lineWidth = r * 0.06;
        ctx.globalAlpha = 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      band(-RANGE, -25, OFF);
      band(-25, -10, CLOSE);
      band(-10, 10, IN_TUNE);
      band(10, 25, CLOSE);
      band(25, RANGE, OFF);
      if (inTune) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, angleOf(-IN_TUNE_CENTS), angleOf(IN_TUNE_CENTS));
        ctx.strokeStyle = IN_TUNE;
        ctx.lineWidth = r * 0.09;
        ctx.stroke();
      }

      // Ticks every 5 cents, longer and labelled every 10.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let c = -RANGE; c <= RANGE; c += 5) {
        const a = angleOf(c);
        const major = c % 10 === 0;
        const r1 = r * 0.9;
        const r2 = r * (major ? 0.8 : 0.85);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.strokeStyle = c === 0 ? col.ink : col.faint;
        ctx.lineWidth = c === 0 ? 3 : major ? 2 : 1;
        ctx.stroke();
        if (major) {
          ctx.fillStyle = col.muted;
          ctx.font = `${Math.round(r * 0.06)}px system-ui, sans-serif`;
          ctx.fillText(c === 0 ? "0" : `${c > 0 ? "+" : ""}${c}`, cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
        }
      }
      ctx.fillStyle = col.faint;
      ctx.font = `${Math.round(r * 0.06)}px system-ui, sans-serif`;
      ctx.fillText("flat", cx + Math.cos(angleOf(-RANGE)) * r * 1.0 - r * 0.02, cy + Math.sin(angleOf(-RANGE)) * r * 1.0 + r * 0.1);
      ctx.fillText("sharp", cx + Math.cos(angleOf(RANGE)) * r * 1.0 + r * 0.02, cy + Math.sin(angleOf(RANGE)) * r * 1.0 + r * 0.1);

      // The note.
      if (note) {
        const name = s.displayMode === "solfege" ? solfegeFor(note, s.key) : note;
        ctx.fillStyle = inTune ? IN_TUNE : col.ink;
        ctx.font = `bold ${Math.round(r * 0.3)}px system-ui, sans-serif`;
        ctx.fillText(name, cx, cy + r * 0.3);
        const nameWidth = ctx.measureText(name).width;
        ctx.fillStyle = col.muted;
        ctx.font = `${Math.round(r * 0.1)}px system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText(String(octave), cx + nameWidth / 2 + r * 0.02, cy + r * 0.36);
        ctx.textAlign = "center";
        const c = Math.round(cents);
        ctx.fillStyle = inTune ? IN_TUNE : centsColor(c);
        ctx.font = `${Math.round(r * 0.09)}px system-ui, sans-serif`;
        ctx.fillText(`${c > 0 ? "+" : ""}${c}¢`, cx, cy + r * 0.52);
        ctx.fillStyle = col.faint;
        ctx.font = `${Math.round(r * 0.055)}px ui-monospace, monospace`;
        ctx.fillText(`${pitch.toFixed(1)} Hz`, cx, cy + r * 0.64);
      } else {
        ctx.fillStyle = col.faint;
        ctx.font = `${Math.round(r * 0.07)}px system-ui, sans-serif`;
        ctx.fillText("Sing or play a note", cx, cy + r * 0.3);
      }

      // The needle, over everything.
      const a = angleOf(draw.cents);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
      ctx.strokeStyle = note ? (inTune ? IN_TUNE : col.ink) : col.faint;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.045, 0, Math.PI * 2);
      ctx.fillStyle = note ? col.ink : col.faint;
      ctx.fill();
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  });
</script>

<div class="flex flex-col gap-3">
  <MicStatus />
  <div bind:this={container} class="w-full max-w-[560px] mx-auto">
    <canvas bind:this={canvas} class="w-full block select-none" aria-label="Needle tuner"></canvas>
  </div>
</div>
