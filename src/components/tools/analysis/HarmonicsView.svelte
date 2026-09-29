<script lang="ts">
  import { voiceReading } from "../../../lib/tools/voice-analysis";

  /**
   * The note's harmonics as bars, each in dB against the strongest, and what
   * they say about the tone: H1 against H2 (flow or press), ring (the singer's
   * formant, around 3 kHz), and brightness.
   */
  /** Taller bars on the abcTuner page. */
  export let large = false;
  const SHOW = 16;
  const FLOOR = 60;
  $: r = $voiceReading;
  $: bars = r.harmonics.slice(0, SHOW);

  $: h1h2 = r.tone?.h1h2 ?? null;
  $: flow = h1h2 === null ? "" : h1h2 > 6 ? "Flowing, maybe breathy" : h1h2 >= -3 ? "Balanced" : "Pressed";
  $: ring = r.tone?.ringDb ?? null;
  $: ringWord = ring === null ? "" : ring > -12 ? "Rings" : ring > -22 ? "Some ring" : "Little ring";
  $: bright = r.tone?.centroidHz ?? null;
</script>

<div class="flex items-end gap-[3px] {large ? 'h-56' : 'h-32'} px-1 rounded-[14px] bg-sr-track pt-3" role="img" aria-label="Harmonic levels">
  {#if bars.length}
    {#each bars as h (h.k)}
      <div class="flex-1 flex flex-col items-center justify-end h-full gap-1 min-w-0">
        <div
          class="w-full rounded-t-md bg-sr-action transition-[height] duration-150"
          style="height: {Math.max(2, ((FLOOR + Math.max(-FLOOR, h.db)) / FLOOR) * 100)}%"
          title="H{h.k}, {Math.round(h.hz)} Hz: {Math.round(h.db)} dB"
        ></div>
        <span class="text-[10px] font-bold text-sr-muted leading-none pb-1">{h.k}</span>
      </div>
    {/each}
  {:else}
    <p class="m-auto text-sm text-sr-muted pb-3">Sing a note to see its harmonics.</p>
  {/if}
</div>

<div class="grid grid-cols-3 gap-2 text-center">
  <div class="rounded-[14px] bg-sr-mint text-sr-mint-ink px-2 py-2">
    <div class="text-lg font-extrabold tabular-nums">{h1h2 === null ? "·" : `${h1h2 > 0 ? "+" : ""}${Math.round(h1h2)} dB`}</div>
    <div class="text-[11px] font-bold leading-tight">H1 vs H2{flow ? `: ${flow}` : ""}</div>
  </div>
  <div class="rounded-[14px] bg-sr-sky text-sr-sky-ink px-2 py-2">
    <div class="text-lg font-extrabold tabular-nums">{ring === null ? "·" : `${Math.round(ring)} dB`}</div>
    <div class="text-[11px] font-bold leading-tight">Ring, 2 to 4 kHz{ringWord ? `: ${ringWord}` : ""}</div>
  </div>
  <div class="rounded-[14px] bg-sr-butter text-sr-butter-ink px-2 py-2">
    <div class="text-lg font-extrabold tabular-nums">{bright === null ? "·" : `${Math.round(bright / 10) * 10} Hz`}</div>
    <div class="text-[11px] font-bold leading-tight">Brightness: the sound's centre</div>
  </div>
</div>
<p class="text-xs text-sr-muted">
  A strong first harmonic against the second is a flowing tone, and a weak one a pressed tone. Ring is the energy near
  3 kHz that lets a voice carry. These are guides for the ear, not grades.
</p>
