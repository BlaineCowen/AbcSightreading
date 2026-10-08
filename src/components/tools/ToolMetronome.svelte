<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { initTuner } from "../../lib/tuner/controller";
  import { BPM_MAX, BPM_MIN } from "../../lib/tuner/metronome";
  import { practice, exercise } from "../../lib/tools/context";
  import { toolSettings, setTool } from "../../lib/tools/settings";
  import { METERS, meterById, BEAT_SYMBOL } from "../../lib/tuner/meters";
  import MeterControls from "../tuner/MeterControls.svelte";
  import BeatTiles from "../tuner/BeatTiles.svelte";
  import AssistantPanel from "../tuner/AssistantPanel.svelte";
  import { linkedToPage, metronomeSounding, toggleMetronome } from "../../lib/tools/metronome-link";

  /**
   * The metronome card. On a practice page it is the page's one metronome
   * (metronome-link.ts): its tempo is the exercise's tempo, set from either
   * side, its meter the exercise's, and it clicks under the exercise when that
   * plays. Anywhere else it follows the exercise until told otherwise.
   */

  onMount(initTuner);
  const linked = linkedToPage();

  // Off a practice page: following the exercise's tempo and time signature.
  $: if (!linked && $toolSettings.followExercise) {
    if ($tuner.bpm !== $practice.bpm) tuner.setBpm($practice.bpm);
    const m = $exercise?.meter;
    if (m && m !== $tuner.meter && METERS.some((x) => x.id === m)) tuner.setMeter(m);
  }
  $: meter = meterById($tuner.meter);
  $: sounding = metronomeSounding($tuner);

  let taps: number[] = [];
  function tapTempo() {
    if (!linked) setTool({ followExercise: false });
    const now = performance.now();
    taps = [...taps.filter((t) => now - t < 2500), now];
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      tuner.setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  }
  const nudge = (by: number) => {
    if (!linked) setTool({ followExercise: false });
    tuner.setBpm($tuner.bpm + by);
  };
  const step = "w-10 h-10 rounded-lg border border-sr-hairline bg-sr-raise text-xl text-sr-ink hover:border-sr-faint disabled:opacity-40";
</script>

<h3 class="text-[15px] font-semibold text-sr-ink">Metronome</h3>

<BeatTiles size="sm" />

<div class="flex items-center justify-center gap-4">
  <button class={step} on:click={() => nudge(-1)} disabled={$tuner.bpm <= BPM_MIN} aria-label="Slower">−</button>
  <div class="text-center w-32">
    <div class="text-4xl font-semibold leading-none tabular-nums text-sr-ink">{$tuner.bpm}</div>
    <div class="text-xs text-sr-muted mt-1 whitespace-nowrap">bpm ({BEAT_SYMBOL[meter.beatNote]}) · {meter.id}</div>
  </div>
  <button class={step} on:click={() => nudge(1)} disabled={$tuner.bpm >= BPM_MAX} aria-label="Faster">+</button>
</div>

<MeterControls compact lockedMeter={linked} onManual={() => { if (!linked) setTool({ followExercise: false }); }} />

<AssistantPanel compact />

{#if linked}
  <label class="flex items-center gap-2 text-sm text-sr-ink-2">
    <input type="checkbox" class="sr-check" checked={$tuner.clickWithMusic} on:change={(e) => tuner.setClickWithMusic(e.currentTarget.checked)} />
    Click with the music
  </label>
{:else}
  <label class="flex items-center gap-2 text-sm text-sr-ink-2">
    <input type="checkbox" class="sr-check" checked={$toolSettings.followExercise} on:change={(e) => setTool({ followExercise: e.currentTarget.checked })} />
    Follow the exercise's tempo and meter
  </label>
{/if}

<label class="flex items-center gap-2 text-sm text-sr-ink-2">
  <span class="shrink-0">Volume</span>
  <input type="range" min="0" max="1" step="0.05" class="flex-1 sr-range" aria-label="Metronome volume"
    value={$tuner.metronomeVolume} on:input={(e) => tuner.setMetronomeVolume(Number(e.currentTarget.value))} />
</label>

<div class="flex gap-2">
  <button class="flex-1 h-11 rounded-lg border border-sr-hairline bg-sr-raise text-sr-ink-2 hover:border-sr-faint" on:click={tapTempo}>Tap tempo</button>
  <button
    class="flex-1 h-11 rounded-lg font-semibold {sounding ? 'bg-sr-danger text-white' : 'sr-btn'}"
    on:click={toggleMetronome}
  >{sounding ? "Stop" : "Start"}</button>
</div>
