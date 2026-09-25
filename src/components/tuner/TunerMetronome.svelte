<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { BPM_MAX, BPM_MIN } from "../../lib/tuner/metronome";
  import { initTuner } from "../../lib/tuner/controller";

  const METERS = [2, 3, 4, 5, 6, 7];
  const SUBDIVISIONS: [number, string][] = [
    [1, "♩"],
    [2, "♫"],
    [3, "3"],
    [4, "♬"],
  ];

  onMount(() => {
    initTuner();
  });

  $: bpm = $tuner.bpm;
  $: beatsPerBar = $tuner.beatsPerBar;
  $: subdivision = $tuner.subdivision;
  $: accent = $tuner.accent;
  $: running = $tuner.metronomeRunning;
  $: beat = $tuner.metronomeBeat;

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

  function dotClass(i: number, running: boolean, beat: number, accent: boolean): string {
    if (running && beat === i) {
      return i === 0 && accent ? "w-7 h-7 bg-green-500" : "w-6 h-6 bg-sky-500";
    }
    return "w-4 h-4 bg-sr-track";
  }

  const stepBtn =
    "w-10 h-10 rounded bg-sr-raise border border-sr-hairline text-sr-ink hover:border-sr-faint text-xl disabled:opacity-40";
</script>

<div class="flex flex-col gap-4 bg-sr-panel border border-sr-hairline rounded-lg p-4">
  <!-- Beat dots -->
  <div class="flex justify-center gap-3 h-8 items-center">
    {#each Array.from({ length: beatsPerBar }, (_, i) => i) as i (i)}
      <div class="rounded-full transition-all duration-75 {dotClass(i, running, beat, accent)}" />
    {/each}
  </div>

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
    <div class="text-center w-24">
      <div class="text-5xl font-semibold tabular-nums leading-none text-sr-ink">{bpm}</div>
      <div class="text-xs text-sr-muted mt-1">bpm</div>
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

  <div class="flex flex-wrap items-center gap-x-5 gap-y-3 justify-center text-sm">
    <div class="flex items-center gap-2" role="group" aria-label="Beats per bar">
      <span class="text-sr-muted">Beats</span>
      <div class="flex gap-1">
        {#each METERS as n (n)}
          <button
            type="button"
            on:click={() => tuner.setBeatsPerBar(n)}
            class="sr-tok"
            class:sr-on={beatsPerBar === n}
          >
            {n}
          </button>
        {/each}
      </div>
    </div>
    <div class="flex items-center gap-2" role="group" aria-label="Subdivision">
      <span class="text-sr-muted">Subdivide</span>
      <div class="flex gap-1">
        {#each SUBDIVISIONS as [n, label] (n)}
          <button
            type="button"
            on:click={() => tuner.setSubdivision(n)}
            class="sr-tok"
            class:sr-on={subdivision === n}
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
    <button type="button" on:click={tuner.toggleAccent} class="sr-tok" class:sr-on={accent}>
      Accent 1
    </button>
  </div>
</div>
