<!-- The rhythm each beat clicks (click-pattern.ts): the even subdivisions and
     the patterns with rests, each drawn as notation. Meters whose beat is a
     half or an eighth (2/2, 5/8, 7/8) keep plain named choices. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { meterById, subdivisionLabel } from "../../lib/tuner/meters";
  import { SUB_PATTERNS, patternOf, type SubPattern } from "../../lib/tuner/click-pattern";
  // Engraved by LilyPond at the rhythm picker's scale (bun run icons:rhythm),
  // so noteheads match across the set and a run of sixteenths is wider than a quarter.
  const ICONS = import.meta.glob("../../assets/svgs/metronome/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const iconFor = (id: string) => ICONS[`../../assets/svgs/metronome/${id.replace(/&/g, "and")}.svg`] ?? "";

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
    `inline-flex items-center justify-center rounded-2xl transition-colors ${compact ? "h-12 min-w-12 px-2.5" : "h-16 min-w-16 px-3.5"} ` +
    (on ? "bg-sr-action text-sr-action-ink" : "sr-tile-off bg-sr-track text-sr-ink hover:bg-sr-tint");
</script>

{#if kind}
  {#each [["Even", even], ["Rhythms", rhythms]] as [label, list]}
    {#if list.length}
      <div class="flex flex-col gap-1">
        <span class="text-[11px] text-sr-faint">{label}</span>
        <div class="flex flex-wrap gap-2">
          {#each list as p (p.id)}
            <button
              type="button"
              class={tile(current === p.id)}
              aria-pressed={current === p.id}
              aria-label={p.label}
              title={p.label}
              on:click={() => pick(p)}
            ><span class="glyph {compact ? 'small' : ''}" aria-hidden="true">{@html iconFor(p.id)}</span></button>
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

<style>
  /* The icons carry the rhythm picker's size; a beat's figure reads at a little under it. */
  .glyph { display: flex; align-items: center; pointer-events: none; zoom: 0.82; }
  .glyph.small { zoom: 0.68; }
  .glyph :global(svg) { display: block; max-height: 100%; }
</style>
