<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { METERS, meterById } from "../../lib/tuner/meters";
  import SubdivisionPicker from "./SubdivisionPicker.svelte";
  import { CLICK_SOUNDS, type ClickSound } from "../../lib/tuner/click-sounds";
  import { metronome } from "../../lib/tuner/metronome";
  import { metronomeSounding } from "../../lib/tools/metronome-link";

  /**
   * Time signature and subdivision, shared by the metronome on /tuner and the
   * practice pages' metronome card. The subdivisions offered follow the meter:
   * 6/8 divides its dotted-quarter beat in three, so it offers eighths and
   * sixteenths, not triplets.
   */

  /** Called when the singer picks a meter or subdivision themselves. */
  export let onManual: () => void = () => {};
  export let compact = false;
  /** On a practice page the meter is the exercise's: shown, not chosen. */
  export let lockedMeter = false;

  const GROUPS: [string, typeof METERS][] = [
    ["Simple", METERS.filter((m) => m.kind === "simple")],
    ["Compound", METERS.filter((m) => m.kind === "compound")],
    ["Uneven", METERS.filter((m) => m.kind === "uneven")],
  ];

  $: meter = meterById($tuner.meter);

  function pickMeter(id: string) {
    onManual();
    tuner.setMeter(id);
  }
  /**
   * Choosing a sound plays a bar of it, so the choice is by ear - unless the
   * metronome is already sounding, where the new sound is heard on the next
   * beat and a preview on top of it was a burst of extra clicks.
   */
  function pickSound(id: ClickSound) {
    tuner.setClickSound(id);
    if (!metronomeSounding($tuner)) void metronome.preview(id);
  }
</script>

<div class="flex flex-col gap-2 text-sm">
  <div class="flex flex-col gap-1.5" role="group" aria-label="Time signature">
    <span class="text-xs text-sr-muted">Time signature</span>
    {#if lockedMeter}
      <div class="flex items-center gap-2">
        <span class="sr-tok sr-on tabular-nums {compact ? 'px-2 text-xs' : ''}">{meter.id}</span>
        <span class="text-xs text-sr-muted">the exercise's</span>
      </div>
    {:else}
    <div class="flex flex-wrap items-center gap-1">
      {#each GROUPS as [label, meters], g}
        {#if g > 0}<span class="w-px h-6 bg-sr-hairline mx-1" aria-hidden="true"></span>{/if}
        {#each meters as m}
          <button
            type="button"
            class="sr-tok tabular-nums {compact ? 'px-2 text-xs' : ''} {$tuner.meter === m.id ? 'sr-on' : ''}"
            on:click={() => pickMeter(m.id)}
            aria-pressed={$tuner.meter === m.id}
            title="{label}{m.grouping ? `, felt ${m.grouping}` : ''}"
          >{m.id}</button>
        {/each}
      {/each}
    </div>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5" role="group" aria-label="Subdivision">
    <span class="text-xs text-sr-muted">
      {meter.grouping ? `Subdivide · felt ${meter.grouping}` : "Subdivide"}
    </span>
    <!-- Each beat's accent is set on its tile now (BeatTiles). -->
    <SubdivisionPicker {compact} {onManual} />
  </div>

  <div class="flex flex-col gap-1.5" role="group" aria-label="Sound">
    <span class="text-xs text-sr-muted">Sound</span>
    <div class="flex flex-wrap items-center gap-1">
      {#each CLICK_SOUNDS as snd}
        <button
          type="button"
          class="sr-tok {compact ? 'px-2 text-xs' : ''} {$tuner.clickSound === snd.id ? 'sr-on' : ''}"
          on:click={() => pickSound(snd.id)}
          aria-pressed={$tuner.clickSound === snd.id}
        >{snd.label}</button>
      {/each}
    </div>
  </div>
</div>
