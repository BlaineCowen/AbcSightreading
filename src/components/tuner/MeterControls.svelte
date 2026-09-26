<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { METERS, meterById, subdivisionLabel } from "../../lib/tuner/meters";
  import { CLICK_SOUNDS, type ClickSound } from "../../lib/tuner/click-sounds";
  import { metronome } from "../../lib/tuner/metronome";

  /**
   * Time signature and subdivision, shared by the metronome on /tuner and the
   * practice pages' metronome card. The subdivisions offered follow the meter:
   * 6/8 divides its dotted-quarter beat in three, so it offers eighths and
   * sixteenths, not triplets.
   */

  /** Called when the singer picks a meter or subdivision themselves. */
  export let onManual: () => void = () => {};
  export let compact = false;

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
  /** Choosing a sound plays a bar of it, so the choice is by ear. */
  function pickSound(id: ClickSound) {
    tuner.setClickSound(id);
    void metronome.preview(id);
  }
  function pickSubdivision(n: number) {
    onManual();
    tuner.setSubdivision(n);
  }
</script>

<div class="flex flex-col gap-2 text-sm">
  <div class="flex flex-col gap-1.5" role="group" aria-label="Time signature">
    <span class="text-xs text-sr-muted">Time signature</span>
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
  </div>

  <div class="flex flex-col gap-1.5" role="group" aria-label="Subdivision">
    <span class="text-xs text-sr-muted">
      {meter.grouping ? `Subdivide · felt ${meter.grouping}` : "Subdivide"}
    </span>
    <div class="flex flex-wrap items-center gap-1">
      {#each meter.subdivisions as n}
        <button
          type="button"
          class="sr-tok {compact ? 'px-2 text-xs' : ''} {$tuner.subdivision === n ? 'sr-on' : ''}"
          on:click={() => pickSubdivision(n)}
          aria-pressed={$tuner.subdivision === n}
        >{subdivisionLabel(meter, n)}</button>
      {/each}
      <button
        type="button"
        class="sr-tok {compact ? 'px-2 text-xs' : ''} {$tuner.accent ? 'sr-on' : ''}"
        on:click={tuner.toggleAccent}
        aria-pressed={$tuner.accent}
        title="Louder click on beat 1{meter.groupStarts.length ? ', lighter on each group' : ''}"
      >Accent</button>
    </div>
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
