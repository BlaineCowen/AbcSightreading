<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { initTuner, startTuner } from "../../lib/tuner/controller";
  import RadialTuner from "./RadialTuner.svelte";
  import TunerSettings from "./TunerSettings.svelte";
  import VolumeMeter from "./VolumeMeter.svelte";
  import DetectionHint from "./DetectionHint.svelte";
  import PitchHistory from "./PitchHistory.svelte";
  import TunerMetronome from "./TunerMetronome.svelte";
  import ScaleChallenge from "./ScaleChallenge.svelte";

  /**
   * abcTuner: the tuner project's app as a page of this site - the dial, a
   * trace of pitch over time, a metronome, and the scale challenge. The
   * microphone stays on across tabs, so the pitch trace keeps recording while
   * the metronome is showing.
   */

  type Tab = "tuner" | "pitch" | "metro" | "challenge";
  const TABS: [Tab, string][] = [
    ["tuner", "Tuner"],
    ["pitch", "Pitch"],
    ["metro", "Metronome"],
    ["challenge", "Scale challenge"],
  ];
  let tab: Tab = "tuner";
  try {
    const saved = sessionStorage.getItem("abc-tuner-tab");
    if (TABS.some(([id]) => id === saved)) tab = saved as Tab;
  } catch {}
  $: try { sessionStorage.setItem("abc-tuner-tab", tab); } catch {}

  onMount(initTuner);
</script>

<div class="w-full max-w-[760px] mx-auto px-4 flex flex-col gap-4 pb-8">
  <div class="flex gap-1 border-b border-sr-hairline" role="tablist" aria-label="abcTuner">
    {#each TABS as [id, label]}
      <button
        role="tab"
        aria-selected={tab === id}
        class="px-3 py-2 text-sm -mb-px border-b-2 {tab === id ? 'border-sr-action text-sr-action-fg font-medium' : 'border-transparent text-sr-muted hover:text-sr-ink-2'}"
        on:click={() => (tab = id)}
      >
        {label}
        {#if id === "tuner" && $tuner.engineStatus === "running"}
          <span class="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" title="Microphone on"></span>
        {/if}
        {#if id === "metro" && $tuner.metronomeRunning}
          <span class="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" title="Metronome running"></span>
        {/if}
      </button>
    {/each}
  </div>

  {#if tab === "tuner"}
    <TunerSettings />
    <RadialTuner />
    <VolumeMeter />
    <DetectionHint />
  {:else if tab === "pitch"}
    {#if $tuner.engineStatus !== "running"}
      <button class="text-xs text-sr-muted underline underline-offset-2 self-center" on:click={startTuner}>
        The microphone is off - start it
      </button>
    {/if}
    <PitchHistory />
    <VolumeMeter />
  {:else if tab === "metro"}
    <TunerMetronome />
  {:else}
    <ScaleChallenge onStartMic={startTuner} />
  {/if}
</div>
