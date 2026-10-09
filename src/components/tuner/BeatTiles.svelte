<!-- One tile per beat, spaced into the meter's groups (5/8 as 2+3). Tap a
     tile to cycle its level: accent, normal, soft, silent (click-pattern.ts).
     Its height shows the level, and the beat sounding lights. Replaces the
     beat dots. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { groupLevels, meterById } from "../../lib/tuner/meters";
  import { beatLevelsFor, type BeatLevel } from "../../lib/tuner/click-pattern";

  export let size: "sm" | "md" = "md";

  $: meter = meterById($tuner.meter);
  $: levels = beatLevelsFor({ beats: meter.beats, accent: $tuner.accent, beatLevels: $tuner.beatLevels });
  // Reset shows only once the levels are not the meter's own.
  $: own = JSON.stringify($tuner.beatLevels) === JSON.stringify(groupLevels(meter));
  $: lit = $tuner.metronomeRunning ? $tuner.metronomeBeat : -1;
  $: box = size === "md" ? "h-24" : "h-14";

  const HEIGHT: Record<BeatLevel, string> = { accent: "h-full", normal: "h-[72%]", soft: "h-[44%]", off: "h-[44%]" };
  const LOOK: Record<BeatLevel, string> = {
    accent: "bg-sr-action text-sr-action-ink",
    normal: "bg-sr-sky text-sr-sky-ink",
    soft: "bg-sr-sky text-sr-sky-ink opacity-55",
    off: "border-2 border-dashed border-sr-hairline text-sr-faint bg-transparent",
  };
  const SAY: Record<BeatLevel, string> = { accent: "accented", normal: "normal", soft: "soft", off: "silent" };
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-end justify-center {box} {size === 'md' ? 'gap-2' : 'gap-1.5'}">
    {#each levels as level, i}
      {#if meter.groupStarts.includes(i)}<span class={size === "md" ? "w-2" : "w-1"} aria-hidden="true"></span>{/if}
      <button
        type="button"
        class="flex-1 max-w-20 rounded-2xl flex items-end justify-center pb-1.5 font-display font-bold transition-all duration-75
          {size === 'md' ? 'text-2xl' : 'text-base'} {HEIGHT[level]} {LOOK[level]}
          {lit === i ? 'ring-4 ring-sr-butter scale-[1.04]' : ''}"
        aria-label="Beat {i + 1}, {SAY[level]}. Tap to change."
        title="Tap: accent, normal, soft, silent"
        on:click={() => tuner.cycleBeatLevel(i)}
      >{i + 1}</button>
    {/each}
  </div>
  <p class="text-[11px] text-sr-faint text-center">
    Tap a beat to accent it, soften it or silence it.
    {#if !own}
      <button type="button" class="underline" on:click={() => tuner.resetBeatLevels()}>Reset</button>
    {/if}
  </p>
</div>
