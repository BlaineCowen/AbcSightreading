<script lang="ts">
  /**
   * The rhythm game set up by hand (Blaine, 2 November 2026: ta and ti-ti is
   * too limiting; the same rhythm-only choices as the practice page): the
   * meters, the figures (the Unison page's own picker groups and note
   * pictures, selectable-rhythms.ts), ties across the barline, and rhythm
   * syllables printed under the notes. One kind of meter at a time, as on
   * the Unison page, so the figures chosen always fit the bar.
   */
  import { rhythmPickerGroups, selectableRhythms, selectableCompoundRhythms, DEFAULT_RHYTHM_NAMES } from "../../lib/selectable-rhythms";
  import { rhythmLabel } from "../../lib/rhythm-labels";
  import { meterKindOf } from "../../lib/meter";
  import { syllableSystems } from "../../resources/rhythm-syllables";

  export let meters: string[];
  export let rhythms: string[];
  export let ties = false;
  /** "off", or a rhythm syllable system's id. */
  export let syllables = "off";

  const SIMPLE = ["2/4", "3/4", "4/4"];
  const COMPOUND = ["6/8", "9/8", "12/8"];
  const icons = Object.fromEntries(
    [...selectableRhythms, ...selectableCompoundRhythms].map((r) => [r.name, import(`../../assets/svgs/${r.name}.svg?raw`)])
  );

  $: kind = meterKindOf(meters[0] ?? "4/4");
  $: groups = rhythmPickerGroups(kind === "compound" ? selectableCompoundRhythms : selectableRhythms);

  function toggleMeter(m: string) {
    const other = meterKindOf(m) !== kind;
    // Another kind of meter starts its own selection (its figures are different).
    if (other) {
      meters = [m];
      rhythms = [...DEFAULT_RHYTHM_NAMES[meterKindOf(m)]];
      return;
    }
    meters = meters.includes(m) ? (meters.length > 1 ? meters.filter((x) => x !== m) : meters) : [...meters, m];
  }
  const toggleRhythm = (name: string) => (rhythms = rhythms.includes(name) ? rhythms.filter((r) => r !== name) : [...rhythms, name]);
</script>

<div class="setup" data-rhythm-setup>
  <div class="row" role="group" aria-label="Meters">
    <span>Meters</span>
    {#each [...SIMPLE, ...COMPOUND] as m}
      <button type="button" class="sr-tok chip" class:sr-on={meters.includes(m)} aria-pressed={meters.includes(m)} on:click={() => toggleMeter(m)}>{m}</button>
    {/each}
  </div>
  {#each groups as group}
    <div class="row" role="group" aria-label="Rhythms: {group.label}">
      <span>{group.label}</span>
      {#each group.rhythms as r}
        <button type="button" class="sr-tok-sq fig" class:sr-on={rhythms.includes(r.name)} aria-pressed={rhythms.includes(r.name)} aria-label={rhythmLabel(r.name)} title={rhythmLabel(r.name)} on:click={() => toggleRhythm(r.name)} data-rhythm={r.name}>
          {#await icons[r.name]}<span class="text-xs">…</span>{:then svg}<span class="icon">{@html svg.default}</span>{:catch}<span class="text-xs">{r.name}</span>{/await}
        </button>
      {/each}
    </div>
  {/each}
  <div class="row" role="group" aria-label="Ties across the barline">
    <span>Ties</span>
    <button type="button" class="sr-tok chip" class:sr-on={!ties} aria-pressed={!ties} on:click={() => (ties = false)}>Inside the bar</button>
    <button type="button" class="sr-tok chip" class:sr-on={ties} aria-pressed={ties} on:click={() => (ties = true)}>Across the barline</button>
  </div>
  <div class="row" role="group" aria-label="Syllables under the notes">
    <span>Syllables</span>
    <button type="button" class="sr-tok chip" class:sr-on={syllables === "off"} aria-pressed={syllables === "off"} on:click={() => (syllables = "off")}>Off</button>
    {#each Object.values(syllableSystems) as sys}
      <button type="button" class="sr-tok chip" class:sr-on={syllables === sys.id} aria-pressed={syllables === sys.id} on:click={() => (syllables = sys.id)}>{sys.label}</button>
    {/each}
  </div>
  {#if !rhythms.length}<p class="text-sm text-sr-danger" role="alert">Choose at least one rhythm.</p>{/if}
</div>

<style>
  .setup { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1.1rem; border-radius: 22px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); width: 100%; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
  .row > span { font-weight: 800; font-size: 0.85rem; color: var(--sr-ink-2); min-width: 5rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
  .fig { height: 3rem; min-width: 3rem; padding: 0.25rem 0.5rem; display: flex; align-items: center; justify-content: center; }
  .icon { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .icon :global(svg) { max-height: 2.4rem; width: auto; }
</style>
