<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { BPM_MAX, BPM_MIN } from "../../lib/tuner/metronome";
  import { initTuner } from "../../lib/tuner/controller";
  import { meterById, meterName, BEAT_SYMBOL } from "../../lib/tuner/meters";
  import TimeSignature from "./TimeSignature.svelte";
  import SubdivisionPicker from "./SubdivisionPicker.svelte";
  import SoundPanel from "./SoundPanel.svelte";
  import MetronomePresets from "./MetronomePresets.svelte";
  import BeatTiles from "./BeatTiles.svelte";
  import AssistantPanel from "./AssistantPanel.svelte";

  onMount(() => {
    initTuner();
  });

  $: bpm = $tuner.bpm;
  $: running = $tuner.metronomeRunning;
  $: meter = meterById($tuner.meter);

  let taps: number[] = [];
  function tapTempo() {
    const now = performance.now();
    const t = taps.filter((x) => now - x < 2500);
    t.push(now);
    taps = t;
    if (t.length >= 2) {
      const intervals = t.slice(1).map((x, i) => x - t[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      tuner.setBpm(60000 / avg);
    }
  }

  // Common tempo names, so the number says something to a student.
  const MARKS: [number, string][] = [[40, "Grave"], [60, "Largo"], [66, "Adagio"], [76, "Andante"], [108, "Moderato"], [120, "Allegro"], [168, "Presto"]];
  $: mark = [...MARKS].reverse().find(([at]) => bpm >= at)?.[1] ?? "Grave";
  $: meterLabel = meter.kind === "uneven" && meter.grouping ? `${meterName(meter)} (${meter.grouping})` : meterName(meter);
</script>

<!-- The page's card is the frame: no second box inside it. The tiles, tempo
     and Start are the stage; the settings follow as labelled rows. -->
<div class="flex flex-col gap-7">
  <section class="flex flex-col items-center gap-5" aria-label="Tempo">
    <div class="w-full"><BeatTiles /></div>

    <div class="flex items-center justify-center gap-3 sm:gap-8">
      <button type="button" class="tempo-step" on:click={() => tuner.setBpm(bpm - 1)} disabled={bpm <= BPM_MIN} aria-label="Slower">−</button>
      <div class="text-center min-w-[7.5rem] sm:min-w-[9rem]">
        <div class="font-display font-bold text-6xl sm:text-7xl leading-none tabular-nums text-sr-ink">{bpm}</div>
        <div class="mt-2 text-[13px] sm:text-sm font-semibold text-sr-muted">
          <span class="text-sr-ink-2">{BEAT_SYMBOL[meter.beatNote]} = {bpm}</span> · {mark} · {meterLabel}
        </div>
      </div>
      <button type="button" class="tempo-step" on:click={() => tuner.setBpm(bpm + 1)} disabled={bpm >= BPM_MAX} aria-label="Faster">+</button>
    </div>

    <input
      type="range"
      min={BPM_MIN}
      max={BPM_MAX}
      value={bpm}
      on:input={(e) => tuner.setBpm(Number(e.currentTarget.value))}
      class="w-full max-w-xl sr-range"
      aria-label="Tempo"
    />

    <div class="flex w-full max-w-xl gap-3">
      <button type="button" on:click={tapTempo} class="sr-btn-quiet flex-1 whitespace-nowrap !py-3.5 !text-base">Tap tempo</button>
      <button
        type="button"
        on:click={() => tuner.setMetronomeRunning(!running)}
        class="sr-btn flex-[2] !py-3.5 !text-lg {running ? 'stop' : ''}"
        aria-pressed={running}
      >{running ? "Stop" : "Start"}</button>
    </div>
  </section>

  <!-- Everything is in view: no setting waits behind another button. -->
  <div class="grid gap-4 lg:grid-cols-2">
    <section class="sr-subcard lg:col-span-2" aria-labelledby="mc-time">
      <h3 id="mc-time" class="mb-3 font-display text-lg font-bold text-sr-ink">Time signature</h3>
      <TimeSignature />
      <div class="mt-5 flex flex-col gap-1.5">
        <span class="text-xs font-bold text-sr-ink-2">Subdivide</span>
        <SubdivisionPicker />
      </div>
    </section>

    <section class="sr-subcard" aria-labelledby="mc-sound">
      <h3 id="mc-sound" class="mb-3 font-display text-lg font-bold text-sr-ink">Sound</h3>
      <SoundPanel />
    </section>

    <section class="sr-subcard" aria-labelledby="mc-practice">
      <h3 id="mc-practice" class="mb-3 font-display text-lg font-bold text-sr-ink">Practice</h3>
      <AssistantPanel />
    </section>

    <section class="sr-subcard lg:col-span-2" aria-labelledby="mc-presets">
      <h3 id="mc-presets" class="mb-3 font-display text-lg font-bold text-sr-ink">Presets</h3>
      <MetronomePresets />
    </section>
  </div>
</div>

<style>
  .tempo-step {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 999px;
    background: var(--sr-track);
    color: var(--sr-ink);
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    transition: background 120ms ease;
  }
  @media (min-width: 640px) { .tempo-step { width: 56px; height: 56px; } }
  .tempo-step:hover:not(:disabled) { background: var(--sr-tint); }
  .tempo-step:disabled { opacity: 0.38; cursor: default; }
  .stop { background: var(--sr-danger); color: var(--sr-danger-bg); }
  .stop:hover:not(:disabled) { background: var(--sr-danger); filter: brightness(1.08); }
</style>
