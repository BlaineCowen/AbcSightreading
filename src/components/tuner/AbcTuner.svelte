<script lang="ts">
  import { onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { initTuner, startTuner } from "../../lib/tuner/controller";
  import { droneOn } from "../../lib/tools/state";
  import { timer } from "../../lib/tools/timer";
  import RadialTuner from "./RadialTuner.svelte";
  import TunerSettings from "./TunerSettings.svelte";
  import VolumeMeter from "./VolumeMeter.svelte";
  import DetectionHint from "./DetectionHint.svelte";
  import TunerMetronome from "./TunerMetronome.svelte";
  import ScaleChallenge from "./ScaleChallenge.svelte";
  import ToolAnalysis from "../tools/ToolAnalysis.svelte";
  import ToolDrone from "../tools/ToolDrone.svelte";
  import ToolTimer from "../tools/ToolTimer.svelte";

  /**
   * abcTuner: every practice tool, one tab each, at full size. The same tools
   * the practice pages open from their Tools button, plus the scale
   * challenge. The microphone is shared and stays on across tabs, so the pitch
   * trace keeps recording while the metronome is showing; the drone, the
   * metronome and the timer keep going on any tab, and their tabs say so.
   */
  // No Pitches tab: it gives each part its first note from an exercise, and
  // there is no exercise here. It stays in the practice pages' Tools wheel.
  type Tab = "tuner" | "analysis" | "metro" | "drone" | "timer" | "challenge";
  const TABS: [Tab, string][] = [
    ["tuner", "Tuner"],
    ["analysis", "Analysis"],
    ["metro", "Metronome"],
    ["drone", "Drone"],
    ["timer", "Timer"],
    ["challenge", "Scale challenge"],
  ];
  let tab: Tab = "tuner";
  try {
    const saved = sessionStorage.getItem("abc-tuner-tab");
    if (TABS.some(([id]) => id === saved)) tab = saved as Tab;
  } catch {}
  $: try { sessionStorage.setItem("abc-tuner-tab", tab); } catch {}

  $: running = {
    tuner: $tuner.engineStatus === "running",
    analysis: false,
    metro: $tuner.metronomeRunning,
    drone: $droneOn,
    timer: $timer.running,
    challenge: false,
  } as Record<Tab, boolean>;

  onMount(initTuner);
</script>

<div class="w-full max-w-4xl mx-auto px-4 flex flex-col gap-4 pb-10">
  <div class="flex gap-1 p-1.5 rounded-[22px] bg-sr-raise shadow-[0_12px_34px_-26px_rgba(30,70,160,0.4)] overflow-x-auto" role="tablist" aria-label="abcTuner">
    {#each TABS as [id, label]}
      <button
        role="tab"
        aria-selected={tab === id}
        class="shrink-0 flex-1 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-bold transition-colors {tab === id ? 'bg-sr-action text-sr-action-ink' : 'text-sr-muted hover:text-sr-ink hover:bg-sr-track'}"
        on:click={() => (tab = id)}
      >
        {label}
        {#if running[id]}
          <span class="ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle {tab === id ? 'bg-sr-action-ink' : 'bg-green-500'}" title="On"></span>
        {/if}
      </button>
    {/each}
  </div>

  <section class="sr-panel p-5 sm:p-7 flex flex-col gap-4" role="tabpanel">
    {#if tab === "tuner"}
      <TunerSettings />
      <RadialTuner />
      <VolumeMeter />
      <DetectionHint />
    {:else if tab === "analysis"}
      <ToolAnalysis large />
    {:else if tab === "metro"}
      <TunerMetronome />
    {:else if tab === "drone"}
      <ToolDrone />
    {:else if tab === "timer"}
      <ToolTimer />
    {:else}
      <ScaleChallenge onStartMic={startTuner} />
    {/if}
  </section>
</div>
