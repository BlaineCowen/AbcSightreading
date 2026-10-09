<!-- The rhythm each beat clicks (click-pattern.ts): the even subdivisions and
     the patterns with rests, each drawn as notation. Meters whose beat is a
     half or an eighth (2/2, 5/8, 7/8) keep plain named choices. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { meterById, subdivisionLabel } from "../../lib/tuner/meters";
  import { SUB_PATTERNS, patternOf, type SubPattern } from "../../lib/tuner/click-pattern";
  import RhythmGlyph from "./RhythmGlyph.svelte";

  export let compact = false;
  /** Called when the singer picks one themselves. */
  export let onManual: () => void = () => {};

  $: meter = meterById($tuner.meter);
  $: kind = meter.beatNote === "quarter" ? "simple" : meter.beatNote === "dottedQuarter" ? "compound" : null;
  $: offered = kind ? SUB_PATTERNS.filter((p) => p.meter === kind && meter.subdivisions.includes(p.grid)) : [];
  $: even = offered.filter((p) => !p.mask.includes("0"));
  $: rhythms = offered.filter((p) => p.mask.includes("0"));
  $: current = kind ? patternOf($tuner.subdivision, $tuner.subMask, kind)?.id : undefined;

  function pick(p: SubPattern) {
    onManual();
    tuner.setSubPattern(p.grid, p.mask.includes("0") ? p.mask : null);
  }
  function pickPlain(n: number) {
    onManual();
    tuner.setSubdivision(n);
  }
  const tile = (on: boolean) =>
    `flex items-center justify-center rounded-2xl ${compact ? "w-14 h-12 p-1.5" : "w-[4.5rem] h-16 p-2"} ` +
    (on ? "bg-sr-action text-sr-action-ink" : "sr-tile-off bg-sr-track text-sr-ink hover:bg-sr-tint");
</script>

{#if kind}
  {#each [["Even", even], ["Rhythms", rhythms]] as [label, list]}
    {#if list.length}
      <div class="flex flex-col gap-1">
        <span class="text-[11px] text-sr-faint">{label}</span>
        <div class="flex flex-wrap gap-1.5">
          {#each list as p (p.id)}
            <button
              type="button"
              class={tile(current === p.id)}
              aria-pressed={current === p.id}
              aria-label={p.label}
              title={p.label}
              on:click={() => pick(p)}
            ><RhythmGlyph abc={p.abc} scale={compact ? 0.8 : 1} /></button>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
{:else}
  <div class="flex flex-wrap items-center gap-1">
    {#each meter.subdivisions as n}
      <button
        type="button"
        class="sr-tok {compact ? 'px-2 text-xs' : ''} {$tuner.subdivision === n ? 'sr-on' : ''}"
        on:click={() => pickPlain(n)}
        aria-pressed={$tuner.subdivision === n}
      >{subdivisionLabel(meter, n)}</button>
    {/each}
  </div>
{/if}
