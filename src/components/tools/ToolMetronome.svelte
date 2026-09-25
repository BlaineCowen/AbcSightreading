<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { initTuner } from "../../lib/tuner/controller";
  import { BPM_MAX, BPM_MIN } from "../../lib/tuner/metronome";
  import { practice, exercise } from "../../lib/tools/context";
  import { toolSettings, setTool } from "../../lib/tools/settings";

  /**
   * The metronome card. Following the exercise keeps its tempo and meter on
   * the page's - practising a line at the tempo it will be played back at.
   */

  onMount(initTuner);

  $: if ($toolSettings.followExercise) {
    if ($tuner.bpm !== $practice.bpm) tuner.setBpm($practice.bpm);
    const beats = $exercise?.beatsPerBar;
    if (beats && $tuner.beatsPerBar !== beats) tuner.setBeatsPerBar(beats);
  }

  let taps: number[] = [];
  function tapTempo() {
    setTool({ followExercise: false });
    const now = performance.now();
    taps = [...taps.filter((t) => now - t < 2500), now];
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      tuner.setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  }
  const nudge = (by: number) => {
    setTool({ followExercise: false });
    tuner.setBpm($tuner.bpm + by);
  };
  const step = "w-10 h-10 rounded-lg border border-sr-hairline bg-sr-raise text-xl text-sr-ink hover:border-sr-faint disabled:opacity-40";
</script>

<h3 class="text-[15px] font-semibold text-sr-ink">Metronome</h3>

<div class="flex justify-center items-center gap-2.5 h-7">
  {#each Array($tuner.beatsPerBar) as _, i}
    <span
      class="rounded-full transition-all duration-75 {$tuner.metronomeRunning && $tuner.metronomeBeat === i
        ? i === 0 && $tuner.accent ? 'w-6 h-6 bg-green-500' : 'w-5 h-5 bg-sky-500'
        : 'w-3.5 h-3.5 bg-sr-track'}"
    ></span>
  {/each}
</div>

<div class="flex items-center justify-center gap-4">
  <button class={step} on:click={() => nudge(-1)} disabled={$tuner.bpm <= BPM_MIN} aria-label="Slower">−</button>
  <div class="text-center w-20">
    <div class="text-4xl font-semibold leading-none tabular-nums text-sr-ink">{$tuner.bpm}</div>
    <div class="text-xs text-sr-muted mt-1">bpm · {$tuner.beatsPerBar} beats</div>
  </div>
  <button class={step} on:click={() => nudge(1)} disabled={$tuner.bpm >= BPM_MAX} aria-label="Faster">+</button>
</div>

<label class="flex items-center gap-2 text-sm text-sr-ink-2">
  <input type="checkbox" class="sr-check" checked={$toolSettings.followExercise} on:change={(e) => setTool({ followExercise: e.currentTarget.checked })} />
  Follow the exercise's tempo and meter
</label>

<div class="flex gap-2">
  <button class="flex-1 h-11 rounded-lg border border-sr-hairline bg-sr-raise text-sr-ink-2 hover:border-sr-faint" on:click={tapTempo}>Tap tempo</button>
  <button
    class="flex-1 h-11 rounded-lg font-semibold {$tuner.metronomeRunning ? 'bg-sr-danger text-white' : 'sr-btn'}"
    on:click={() => tuner.setMetronomeRunning(!$tuner.metronomeRunning)}
  >{$tuner.metronomeRunning ? "Stop" : "Start"}</button>
</div>
