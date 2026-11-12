<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { NOTES, noteToFreq, solfegeFor } from "../../lib/tuner/pitch";
  import type { NoteName } from "../../lib/tuner/types";
  import { canvasColors, centsColor, IN_TUNE } from "../../lib/tuner/canvas-colors";
  import MicStatus from "./MicStatus.svelte";

  /**
   * The strobe tuner (12 November 2026, Blaine: "the strobe style tuner"): as
   * on a mechanical strobe, bands of stripes drift right when the voice is
   * sharp and left when it is flat, faster the further off, and stand still
   * when it is in tune. The lower bands are finer and move two and four times
   * as fast, as a strobe's octave rings do, so a cent or two still shows.
   * They turn green once the voice has held in tune.
   */
  const IN_TUNE_CENTS = 3;
  const IN_TUNE_HOLD_MS = 300;
  /** Pixels a second the top band moves per cent off, as a share of the width. */
  const SPEED = 0.012;
  const BANDS = [1, 2, 4];
  /** Past this many cents the stripes run no faster: a blur tells nothing. */
  const MOTION_CAP = 50;

  /**
   * Auto or a chosen note (12 November 2026, Blaine: "select the note to tune
   * to instead of just moving around whenever a note changes"), as Peterson's
   * strobes have Auto and Manual. With a note picked, the strobe measures
   * against that note in whatever octave is nearest, so a singer or any
   * instrument can use it, and a voice that drifts a half step away is shown
   * as a half step off rather than as a new note. Kept per browser.
   */
  let target: NoteName | null = null;
  try {
    const saved = localStorage.getItem("abc-strobe-target");
    if (saved && (NOTES as string[]).includes(saved)) target = saved as NoteName;
  } catch {}
  $: try {
    if (target) localStorage.setItem("abc-strobe-target", target);
    else localStorage.removeItem("abc-strobe-target");
  } catch {}
  /** Band spelling: sharps for C# and F#, flats for the rest. */
  const SPELL: Partial<Record<NoteName, string>> = { "D#": "Eb", "G#": "Ab", "A#": "Bb" };
  const label = (n: NoteName, solfege: boolean, key: NoteName) => (solfege ? solfegeFor(n, key) : SPELL[n] ?? n);
  let lastPicked: NoteName = "A";
  $: if (target) lastPicked = target;
  $: hearing = !!target && $tuner.playing?.name === target;
  function hear() {
    if (!target) return;
    if (hearing) tuner.setPlaying(null);
    else tuner.setPlaying({ name: target, octave: tuner.get().playOctave });
  }
  function pick(n: NoteName | null) {
    if (tuner.get().playing) tuner.setPlaying(null);
    target = n;
  }

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = container.clientWidth;
      h = Math.round(Math.min(w * 0.62, 380));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const state = { phase: 0, cents: 0, last: performance.now(), inTuneSince: null as number | null };
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      if (!w) return;
      const s = tuner.get();
      const col = canvasColors();
      const now = performance.now();
      const dt = Math.min(0.1, (now - state.last) / 1000);
      state.last = now;
      const { note, octave, pitch } = s;
      // Against the picked note in the nearest octave, or the nearest note.
      let cents = s.cents;
      if (target && note && pitch) {
        const raw = 1200 * Math.log2(pitch / noteToFreq(target, 4, s.a4));
        cents = ((((raw + 600) % 1200) + 1200) % 1200) - 600;
      }
      const moving = Math.max(-MOTION_CAP, Math.min(MOTION_CAP, cents));
      state.cents += ((note ? moving : 0) - state.cents) * 0.2;
      if (note) state.phase += state.cents * SPEED * w * dt;
      if (note && Math.abs(cents) < IN_TUNE_CENTS) state.inTuneSince ??= now;
      else state.inTuneSince = null;
      const inTune = !!note && state.inTuneSince !== null && now - state.inTuneSince > IN_TUNE_HOLD_MS;

      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // The note and how far off, above the window.
      const top = h * 0.3;
      const solfege = s.displayMode === "solfege";
      if (target) {
        // The target stays put; what is heard is the small line under it.
        ctx.fillStyle = inTune ? IN_TUNE : col.ink;
        ctx.font = `bold ${Math.round(h * 0.2)}px system-ui, sans-serif`;
        ctx.fillText(label(target, solfege, s.key), w / 2, top * 0.42);
        ctx.fillStyle = col.muted;
        ctx.font = `${Math.round(h * 0.05)}px system-ui, sans-serif`;
        ctx.fillText(note ? `hearing ${label(note, solfege, s.key)}${octave ?? ""}` : "target", w / 2, top * 0.88);
      } else if (note) {
        const name = solfege ? solfegeFor(note, s.key) : note;
        ctx.fillStyle = inTune ? IN_TUNE : col.ink;
        ctx.font = `bold ${Math.round(h * 0.2)}px system-ui, sans-serif`;
        ctx.fillText(name, w / 2, top * 0.48);
        const nameWidth = ctx.measureText(name).width;
        ctx.fillStyle = col.muted;
        ctx.font = `${Math.round(h * 0.07)}px system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText(String(octave), w / 2 + nameWidth / 2 + 4, top * 0.55);
        ctx.textAlign = "center";
      } else {
        ctx.fillStyle = col.faint;
        ctx.font = `${Math.round(h * 0.16)}px system-ui, sans-serif`;
        ctx.fillText("—", w / 2, top * 0.48);
      }

      // The window: three bands of stripes.
      const x0 = w * 0.04;
      const ww = w * 0.92;
      const y0 = top;
      const wh = h * 0.5;
      const radius = Math.min(22, wh * 0.18);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x0, y0, ww, wh, radius);
      ctx.fillStyle = col.raise;
      ctx.fill();
      ctx.clip();
      const stripe = inTune ? IN_TUNE : note ? col.ink : col.tint;
      const bandH = wh / BANDS.length;
      BANDS.forEach((mult, i) => {
        const period = ww / (6 * mult);
        const shift = (((state.phase * mult) % period) + period) % period;
        ctx.fillStyle = stripe;
        ctx.globalAlpha = note ? 0.85 - i * 0.12 : 0.5;
        for (let x = x0 - period + shift; x < x0 + ww; x += period) {
          ctx.fillRect(x, y0 + i * bandH + 3, period / 2, bandH - 6);
        }
      });
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(x0, y0, ww, wh, radius);
      ctx.strokeStyle = col.hairline;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Beneath: cents, and which way to go.
      const below = y0 + wh + (h - y0 - wh) / 2;
      if (note) {
        const c = Math.round(cents);
        ctx.fillStyle = inTune ? IN_TUNE : centsColor(c);
        ctx.font = `${Math.round(h * 0.075)}px system-ui, sans-serif`;
        const steps = Math.round(Math.abs(c) / 100);
        const word = inTune ? "in tune" : c > 0 ? "sharp: go lower" : c < 0 ? "flat: go higher" : "";
        const text =
          steps >= 1
            ? `${steps} half step${steps > 1 ? "s" : ""} ${c > 0 ? "high: go lower" : "low: go higher"}`
            : `${c > 0 ? "+" : ""}${c}¢  ${word}`;
        ctx.fillText(text, w / 2, below);
      } else {
        ctx.fillStyle = col.faint;
        ctx.font = `${Math.round(h * 0.055)}px system-ui, sans-serif`;
        ctx.fillText("Sing or play a note: the stripes stand still when it is in tune", w / 2, below);
      }
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  });
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-col items-center gap-2">
    <div class="flex flex-wrap justify-center gap-1.5">
      <div class="flex gap-1.5" role="radiogroup" aria-label="Strobe target">
        <button role="radio" aria-checked={!target} class="sr-tok {!target ? 'sr-on' : ''}" on:click={() => pick(null)}>Auto</button>
        <button role="radio" aria-checked={!!target} class="sr-tok {target ? 'sr-on' : ''}" on:click={() => pick(target ?? lastPicked)}>Pick a note</button>
      </div>
      {#if target}
        <button class="sr-tok {hearing ? 'sr-on' : ''}" on:click={hear} aria-pressed={hearing}>
          {hearing ? "Stop" : "Hear it"}
        </button>
      {/if}
    </div>
    {#if target}
      <!-- Six a row on a phone, all twelve in one row wider. -->
      <div class="grid grid-cols-6 sm:grid-cols-12 gap-1 w-full max-w-[560px]" role="radiogroup" aria-label="Note to tune to">
        {#each NOTES as n}
          <button
            role="radio"
            aria-checked={target === n}
            class="rounded-full py-1.5 text-sm font-bold transition-colors {target === n ? 'bg-sr-action text-sr-action-ink' : 'bg-sr-track text-sr-ink hover:bg-sr-raise'}"
            on:click={() => pick(n)}
          >{label(n, $tuner.displayMode === "solfege", $tuner.key)}</button>
        {/each}
      </div>
    {/if}
  </div>
  <MicStatus />
  <div bind:this={container} class="w-full max-w-[640px] mx-auto">
    <canvas bind:this={canvas} class="w-full block select-none" aria-label="Strobe tuner"></canvas>
  </div>
</div>
