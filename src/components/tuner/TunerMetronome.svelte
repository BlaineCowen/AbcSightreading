<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { BPM_MAX, BPM_MIN } from "../../lib/tuner/metronome";
  import { initTuner } from "../../lib/tuner/controller";
  import { meterById, meterName, BEAT_SYMBOL } from "../../lib/tuner/meters";
  import MeterControls from "./MeterControls.svelte";
  import MetronomePresets from "./MetronomePresets.svelte";
  import BeatTiles from "./BeatTiles.svelte";
  import AssistantPanel from "./AssistantPanel.svelte";
  import SettingRow from "./SettingRow.svelte";

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

  <div class="h-px bg-sr-hairline" aria-hidden="true"></div>

  <div class="flex flex-col gap-5">
    <MetronomePresets />
    <MeterControls />
    <SettingRow label="Volume">
      <input type="range" min="0" max="1" step="0.05" class="w-full max-w-sm sr-range mt-2" aria-label="Metronome volume"
        value={$tuner.metronomeVolume} on:input={(e) => tuner.setMetronomeVolume(Number(e.currentTarget.value))} />
    </SettingRow>
  </div>

  <AssistantPanel />
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
