<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { NOTES, spellKey } from "../../lib/tuner/pitch";

  /**
   * The tuner's key, one tap away: the Drone and Scale challenge tabs set it
   * here rather than from the Tuner tab's settings. It is the same key the
   * Tuner tab shows (tuner store `key`); keys are spelled as a choir reads
   * them (Eb, not D#), the store's names underneath.
   */
</script>

<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Key">
  <span class="text-sm text-sr-muted mr-1">Key</span>
  {#each NOTES as note}
    <button
      class="sr-tok text-sm min-w-[2.4rem] {$tuner.key === note ? 'sr-on' : ''}"
      aria-pressed={$tuner.key === note}
      on:click={() => tuner.setKey(note)}
    >{spellKey(note)}</button>
  {/each}
</div>
