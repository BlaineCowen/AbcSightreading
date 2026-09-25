<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { BPM_MAX, BPM_MIN } from "../../lib/tuner/metronome";
  import { initTuner } from "../../lib/tuner/controller";
  import { meterById, BEAT_SYMBOL } from "../../lib/tuner/meters";
  import MeterControls from "./MeterControls.svelte";
  import BeatDots from "./BeatDots.svelte";

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

  const stepBtn =
    "w-10 h-10 rounded bg-sr-raise border border-sr-hairline text-sr-ink hover:border-sr-faint text-xl disabled:opacity-40";
</script>

<div class="flex flex-col gap-4 bg-sr-panel border border-sr-hairline rounded-lg p-4">
  <BeatDots />

  <!-- BPM -->
  <div class="flex items-center justify-center gap-3">
    <button
      type="button"
      on:click={() => tuner.setBpm(bpm - 1)}
      disabled={bpm <= BPM_MIN}
      class={stepBtn}
      aria-label="Slower"
    >
      −
    </button>
    <div class="text-center w-32">
      <div class="text-5xl font-semibold tabular-nums leading-none text-sr-ink">{bpm}</div>
      <div class="text-xs text-sr-muted mt-1 whitespace-nowrap">bpm ({BEAT_SYMBOL[meter.beatNote]}) · {meter.id}</div>
    </div>
    <button
      type="button"
      on:click={() => tuner.setBpm(bpm + 1)}
      disabled={bpm >= BPM_MAX}
      class={stepBtn}
      aria-label="Faster"
    >
      +
    </button>
  </div>
  <input
    type="range"
    min={BPM_MIN}
    max={BPM_MAX}
    value={bpm}
    on:input={(e) => tuner.setBpm(Number(e.currentTarget.value))}
    class="w-full accent-[var(--sr-action)]"
    aria-label="Tempo"
  />

  <div class="flex gap-2">
    <button
      type="button"
      on:click={tapTempo}
      class="flex-1 py-3 rounded-lg bg-sr-raise border border-sr-hairline text-sr-ink hover:border-sr-faint"
    >
      Tap tempo
    </button>
    <button
      type="button"
      on:click={() => tuner.setMetronomeRunning(!running)}
      class="flex-1 py-3 text-lg font-medium {running
        ? 'bg-sr-danger text-white rounded-lg hover:opacity-90'
        : 'sr-btn rounded-lg'}"
    >
      {running ? "Stop" : "Start"}
    </button>
  </div>

  <MeterControls />
</div>
