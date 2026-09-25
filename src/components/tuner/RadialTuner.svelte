<script lang="ts">
  import { onMount } from "svelte";
  import { tuner, PLAY_OCTAVE_MAX, PLAY_OCTAVE_MIN } from "../../lib/tuner/store";
  import { NOTES, solfegeFor, wedgeLabels } from "../../lib/tuner/pitch";
  import type { NoteName } from "../../lib/tuner/types";
  import { canvasColors, centsColor, IN_TUNE } from "../../lib/tuner/canvas-colors";
  import { startTuner } from "../../lib/tuner/controller";

  /**
   * The radial tuner: twelve wedges with the key at the top, a pointer that
   * travels round to the note being sung, the cents off, and a green glow once
   * it has held in tune. Tapping a wedge sounds that note. Ported from the
   * tuner project's RadialTuner, drawn in the site's theme colours.
   */

  /** Wedges play notes on tap (off during the scale challenge). */
  export let interactive = true;
  /** Show the mic status bar and the Sustain/Octave row. */
  export let showControls = true;
  /** Smaller type and no hint, for the practice pages' floating widget. */
  export let compact = false;

  const IN_TUNE_CENTS = 5;
  const IN_TUNE_HOLD_MS = 300;
  const SEMITONE = (Math.PI * 2) / 12;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  function shortestArc(from: number, to: number) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /** Geometry shared by drawing and hit-testing. */
  function geometry(size: number, key: NoteName) {
    const outerR = size / 2 - 3;
    const innerR = outerR * 0.66;
    // Rotate so the key sits at 12 o'clock.
    const baseRotation = -Math.PI / 2 - NOTES.indexOf(key) * SEMITONE;
    return { cx: size / 2, cy: size / 2, outerR, innerR, baseRotation };
  }

  function noteAt(x: number, y: number, size: number, key: NoteName): NoteName | null {
    const { cx, cy, outerR, innerR, baseRotation } = geometry(size, key);
    const r = Math.hypot(x - cx, y - cy);
    if (r < innerR || r > outerR + 6) return null;
    const a = Math.atan2(y - cy, x - cx);
    const idx = Math.round((a - baseRotation) / SEMITONE);
    return NOTES[((idx % 12) + 12) % 12];
  }

  onMount(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let size = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = container.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const draw = { angle: -Math.PI / 2, cents: 0, inTuneSince: null as number | null };
    let raf = 0;

    const render = () => {
      raf = requestAnimationFrame(render);
      if (size === 0) return;
      const s = tuner.get();
      const col = canvasColors();
      const { note, cents, octave, pitch, key, displayMode } = s;
      const now = performance.now();
      const { cx, cy, outerR, innerR, baseRotation } = geometry(size, key);
      const solfege = displayMode === "solfege";

      // Smooth pointer + readout.
      if (note) {
        const target = baseRotation + NOTES.indexOf(note) * SEMITONE + (cents / 100) * SEMITONE;
        draw.angle += shortestArc(draw.angle, target) * 0.18;
        draw.cents += (cents - draw.cents) * 0.18;
        if (Math.abs(cents) < IN_TUNE_CENTS) draw.inTuneSince ??= now;
        else draw.inTuneSince = null;
      } else {
        draw.inTuneSince = null;
      }
      const inTune = !!note && draw.inTuneSince !== null && now - draw.inTuneSince > IN_TUNE_HOLD_MS;

      ctx.clearRect(0, 0, size, size);

      // Wedges
      const labelR = (outerR + innerR) / 2;
      NOTES.forEach((n, i) => {
        const a = baseRotation + i * SEMITONE;
        const isPlaying = s.playing?.name === n;
        const isDetected = note === n;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, a - SEMITONE / 2, a + SEMITONE / 2);
        ctx.arc(cx, cy, innerR, a + SEMITONE / 2, a - SEMITONE / 2, true);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? col.panel : col.raise;
        ctx.fill();
        // Translucent overlays read on either ground.
        if (isPlaying || isDetected) {
          ctx.fillStyle = isPlaying
            ? "rgba(37, 99, 235, 0.85)"
            : inTune
              ? "rgba(34, 197, 94, 0.55)"
              : "rgba(34, 197, 94, 0.2)";
          ctx.fill();
        }
        ctx.strokeStyle = col.hairline;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const [primary, alt] = wedgeLabels(n, key, solfege);
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isPlaying ? "#fff" : isDetected ? col.ink : alt ? col.faint : col.ink2;
        if (alt) {
          ctx.font = `${Math.round(size * 0.04)}px system-ui, sans-serif`;
          ctx.fillText(primary, lx, ly - size * 0.022);
          ctx.fillText(alt, lx, ly + size * 0.022);
        } else {
          ctx.font = `bold ${Math.round(size * 0.06)}px system-ui, sans-serif`;
          ctx.fillText(primary, lx, ly);
        }
      });

      // Outer ring glow when in tune
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.strokeStyle = inTune ? IN_TUNE : col.hairline;
      ctx.lineWidth = 2;
      if (inTune) {
        ctx.shadowColor = IN_TUNE;
        ctx.shadowBlur = 16;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Pointer arc just inside the ring
      if (note) {
        const r = innerR - size * 0.02;
        ctx.beginPath();
        ctx.arc(cx, cy, r, draw.angle - Math.PI / 30, draw.angle + Math.PI / 30);
        ctx.strokeStyle = centsColor(draw.cents);
        ctx.lineWidth = size * 0.018;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Center readout
      ctx.textAlign = "center";
      if (note && pitch) {
        const name = solfege ? solfegeFor(note, key) : note;
        ctx.fillStyle = col.ink;
        ctx.font = `bold ${Math.round(size * 0.15)}px system-ui, sans-serif`;
        ctx.fillText(name, cx, cy - size * 0.05);
        const nameWidth = ctx.measureText(name).width;
        ctx.font = `${Math.round(size * 0.045)}px system-ui, sans-serif`;
        ctx.fillStyle = col.muted;
        ctx.textAlign = "left";
        ctx.fillText(String(octave), cx + nameWidth / 2 + size * 0.01, cy - size * 0.005);
        ctx.textAlign = "center";

        const c = Math.round(draw.cents);
        ctx.fillStyle = inTune ? IN_TUNE : col.ink2;
        ctx.font = `${Math.round(size * 0.055)}px system-ui, sans-serif`;
        ctx.fillText(`${c > 0 ? "+" : ""}${c}¢`, cx, cy + size * 0.06);

        if (!compact) {
          ctx.fillStyle = col.faint;
          ctx.font = `${Math.round(size * 0.032)}px ui-monospace, monospace`;
          ctx.fillText(`${pitch.toFixed(1)} Hz`, cx, cy + size * 0.12);
        }
        if (inTune) {
          ctx.font = `${Math.round(size * 0.06)}px system-ui, sans-serif`;
          ctx.fillText("🙂", cx, cy - size * 0.17);
        }
      } else if (s.playing) {
        const name = solfege ? solfegeFor(s.playing.name, key) : s.playing.name;
        ctx.fillStyle = "#2563eb";
        ctx.font = `bold ${Math.round(size * 0.13)}px system-ui, sans-serif`;
        ctx.fillText(`${name}${s.playing.octave}`, cx, cy - size * 0.02);
        ctx.fillStyle = col.faint;
        ctx.font = `${Math.round(size * 0.035)}px system-ui, sans-serif`;
        ctx.fillText("playing", cx, cy + size * 0.08);
      } else {
        ctx.fillStyle = col.faint;
        ctx.font = `${Math.round(size * 0.1)}px system-ui, sans-serif`;
        ctx.fillText("—", cx, cy - size * 0.01);
        if (interactive && !compact) {
          ctx.font = `${Math.round(size * 0.03)}px system-ui, sans-serif`;
          ctx.fillText("tap a note to hear it", cx, cy + size * 0.08);
        }
      }
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  });

  // ---- touch / pointer playback ----
  const hit = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return noteAt(e.clientX - rect.left, e.clientY - rect.top, rect.width, tuner.get().key);
  };
  function onPointerDown(e: PointerEvent) {
    if (!interactive) return;
    const n = hit(e);
    if (!n) return;
    canvas.setPointerCapture(e.pointerId);
    const s = tuner.get();
    if (s.sustain && s.playing?.name === n && s.playing.octave === s.playOctave) tuner.setPlaying(null);
    else tuner.setPlaying({ name: n, octave: s.playOctave });
  }
  function onPointerMove(e: PointerEvent) {
    if (!interactive || !canvas.hasPointerCapture(e.pointerId)) return;
    const s = tuner.get();
    if (s.sustain) return;
    const n = hit(e);
    if (n && n !== s.playing?.name) tuner.setPlaying({ name: n, octave: s.playOctave });
  }
  function onPointerUp(e: PointerEvent) {
    if (!interactive) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!tuner.get().sustain) tuner.setPlaying(null);
  }

  // An octave change retunes a sustained note.
  $: {
    const s = tuner.get();
    if (s.playing && s.playing.octave !== $tuner.playOctave) {
      tuner.setPlaying({ name: s.playing.name, octave: $tuner.playOctave });
    }
  }

  const octaveButton = "w-8 h-8 rounded border border-sr-hairline bg-sr-raise hover:border-sr-faint disabled:opacity-40";
</script>

<div class="flex flex-col gap-3">
  {#if showControls}
    {#if $tuner.engineStatus === "idle"}
      <button class="sr-btn w-full py-2.5 text-base" on:click={startTuner}>Start microphone</button>
    {:else if $tuner.engineStatus === "starting"}
      <p class="text-center text-sm text-sr-brass py-2">Starting microphone…</p>
    {:else if $tuner.engineStatus === "running"}
      <p class="text-center text-xs text-sr-muted">
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 align-middle"></span>
        Listening
      </p>
    {:else if $tuner.engineStatus === "error"}
      <div class="rounded-lg bg-sr-danger-bg border border-sr-danger p-3 text-sm">
        <p class="text-sr-danger mb-1">Microphone access error</p>
        <p class="text-xs text-sr-ink-2 mb-1">
          Allow microphone access in the browser. If it says “denied by system”,
          also enable the browser under your computer's microphone privacy settings.
        </p>
        {#if $tuner.engineError}
          <p class="text-[10px] font-mono text-sr-danger mb-2 break-words">{$tuner.engineError}</p>
        {/if}
        <button class="sr-btn text-sm" on:click={startTuner}>Retry</button>
      </div>
    {/if}
  {/if}

  <div bind:this={container} class="relative w-full {compact ? '' : 'max-w-[560px]'} mx-auto aspect-square">
    <canvas
      bind:this={canvas}
      class="w-full h-full touch-none select-none"
      on:pointerdown={onPointerDown}
      on:pointermove={onPointerMove}
      on:pointerup={onPointerUp}
      on:pointercancel={onPointerUp}
    ></canvas>
  </div>

  {#if showControls}
    <div class="flex flex-wrap items-center justify-center gap-6 text-sm">
      <button
        class="sr-tok {$tuner.sustain ? 'sr-on' : ''}"
        on:click={tuner.toggleSustain}
        title="Latch a tapped note until tapped again"
      >Sustain {$tuner.sustain ? "on" : "off"}</button>
      <div class="flex items-center gap-2">
        <span class="text-sr-muted">Octave</span>
        <button class={octaveButton} on:click={() => tuner.setPlayOctave($tuner.playOctave - 1)} disabled={$tuner.playOctave <= PLAY_OCTAVE_MIN} aria-label="Lower octave">−</button>
        <span class="w-5 text-center font-mono text-base text-sr-ink">{$tuner.playOctave}</span>
        <button class={octaveButton} on:click={() => tuner.setPlayOctave($tuner.playOctave + 1)} disabled={$tuner.playOctave >= PLAY_OCTAVE_MAX} aria-label="Raise octave">+</button>
      </div>
      {#if $tuner.playing && !$tuner.sustain}
        <span class="text-sr-action-fg font-mono">{$tuner.playing.name}{$tuner.playing.octave}</span>
      {/if}
    </div>
  {/if}
</div>
