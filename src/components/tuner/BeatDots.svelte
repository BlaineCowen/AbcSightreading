<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { meterById } from "../../lib/tuner/meters";

  /**
   * One dot per beat, spaced into the meter's groups (5/8 as 2+3), lit as each
   * beat sounds: green for the downbeat, a lighter green where a group starts.
   */
  export let size: "sm" | "md" = "md";

  $: meter = meterById($tuner.meter);
  $: big = size === "md" ? "w-7 h-7" : "w-6 h-6";
  $: mid = size === "md" ? "w-6 h-6" : "w-5 h-5";
  $: idle = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
</script>

<div class="flex justify-center items-center {size === 'md' ? 'h-8 gap-3' : 'h-7 gap-2'}" aria-hidden="true">
  {#each Array(meter.beats) as _, i}
    {#if meter.groupStarts.includes(i)}<span class="w-2"></span>{/if}
    <span
      class="rounded-full transition-all duration-75 {$tuner.metronomeRunning && $tuner.metronomeBeat === i
        ? i === 0 && $tuner.accent
          ? `${big} bg-green-500`
          : meter.groupStarts.includes(i) && $tuner.accent
            ? `${mid} bg-green-400`
            : `${mid} bg-sky-500`
        : `${idle} bg-sr-track`}"
    ></span>
  {/each}
</div>
