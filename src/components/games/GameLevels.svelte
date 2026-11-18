<script lang="ts">
  /**
   * The games' setup: two tabs, Levels and Customize (Blaine, 18 November
   * 2026: "the custom option is hidden at the bottom and really hard to
   * find"). Levels are big buttons, one a level, never a menu; Customize
   * holds the game's own choices (the `custom` slot). Choosing Customize
   * plays the custom setup; choosing a level plays that level. What is shared
   * by both (names, tempo...) goes in the default slot, under the panel.
   *
   * `selected` is the level's index, or -1 for Customize. Tabs per the web
   * guidance: buttons in a labelled tablist, aria-selected, arrows move
   * between the two, a tabpanel each; the selected tab has an underline, not
   * colour alone.
   */
  import { createEventDispatcher } from "svelte";
  import { SlidersHorizontal, ListOrdered } from "lucide-svelte";

  /** The levels: a name, and a few words of what is in it. */
  export let levels: { name: string; detail?: string }[];
  /** The level chosen (0-based), or -1 for Customize. */
  export let selected: number;
  /** A name for the tabs and the data attribute the checks find it by. */
  export let game: string;
  /** Nothing can be changed (a round is playing). */
  export let disabled = false;

  const dispatch = createEventDispatcher<{ select: number }>();
  /** The level to go back to from Customize. */
  let lastLevel = Math.max(0, selected);
  $: if (selected >= 0) lastLevel = selected;
  $: custom = selected < 0;

  const id = `gl-${game}`;
  let tabs: HTMLButtonElement[] = [];
  function pick(toCustom: boolean) {
    if (disabled || toCustom === custom) return;
    dispatch("select", toCustom ? -1 : lastLevel);
  }
  function arrows(e: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const toCustom = e.key === "End" || (e.key !== "Home" && !custom);
    pick(toCustom);
    tabs[toCustom ? 1 : 0]?.focus();
  }
</script>

<div class="gl" data-game-levels={game}>
  <div class="switch" role="tablist" aria-label="Levels or your own setup" tabindex="-1" on:keydown={arrows}>
    <button bind:this={tabs[0]} type="button" role="tab" id="{id}-levels" aria-selected={!custom} tabindex={custom ? -1 : 0} {disabled} on:click={() => pick(false)} data-tab="levels">
      <ListOrdered size={18} aria-hidden="true" /> Levels
    </button>
    <button bind:this={tabs[1]} type="button" role="tab" id="{id}-custom" aria-selected={custom} tabindex={custom ? 0 : -1} {disabled} on:click={() => pick(true)} data-tab="customize">
      <SlidersHorizontal size={18} aria-hidden="true" /> Customize
    </button>
  </div>

  <div class="panel-wrap">
    <div role="tabpanel" aria-labelledby="{id}-levels" hidden={custom}>
      <div class="levels">
        {#each levels as l, i}
          <button type="button" class="lvl" class:on={selected === i} aria-pressed={selected === i} {disabled} on:click={() => dispatch("select", i)} data-level={i}>
            <span class="n">{i + 1}</span>
            <span class="txt"><b>{l.name}</b>{#if l.detail}<small>{l.detail}</small>{/if}</span>
          </button>
        {/each}
      </div>
    </div>
    <div role="tabpanel" aria-labelledby="{id}-custom" hidden={!custom}>
      {#if custom}<div class="custom"><slot name="custom" /></div>{/if}
    </div>
  </div>
  <slot />
</div>

<style>
  .gl { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; padding: 0.9rem 1.1rem 1rem; border-radius: 22px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); }
  .switch { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; padding: 0.3rem; border-radius: 999px; background: var(--sr-track); }
  .switch button { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; min-height: 2.75rem; border-radius: 999px; font-family: var(--sr-font-display); font-size: 1.05rem; font-weight: 800; color: var(--sr-ink-2); }
  .switch button:hover:not(:disabled) { color: var(--sr-ink); }
  .switch button[aria-selected="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  /* A shape as well as colour (and it survives forced colours): an underline under the label. */
  .switch button[aria-selected="true"]::after { content: ""; position: absolute; left: 30%; right: 30%; bottom: 6px; border-bottom: 3px solid currentColor; border-radius: 3px; }
  .switch button:disabled { opacity: 0.55; }
  .levels { display: grid; grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr)); gap: 0.5rem; }
  .lvl { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.75rem; border-radius: 18px; background: var(--sr-paper, var(--sr-bg)); border: 2px solid var(--sr-hairline); text-align: left; color: var(--sr-ink); }
  .lvl:hover:not(:disabled) { border-color: var(--sr-action); }
  .lvl.on { border-color: var(--sr-action); background: var(--sr-sky); color: var(--sr-sky-ink); }
  .lvl:disabled { opacity: 0.6; }
  .n { flex: none; display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 999px; background: var(--sr-track); font-weight: 800; font-size: 0.9rem; }
  .lvl.on .n { background: var(--sr-action); color: var(--sr-action-ink); }
  .txt { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
  .txt b { font-size: 0.92rem; }
  .txt small { font-size: 0.75rem; color: var(--sr-ink-2); }
  .lvl.on .txt small { color: inherit; opacity: 0.8; }
  .custom { display: flex; flex-direction: column; gap: 0.55rem; }
</style>
