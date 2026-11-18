<script lang="ts">
  /**
   * Notes laid out as a piano keyboard (Blaine, 18 November 2026: "lay out the
   * notes like a piano keyboard, the way we do in LearnMusic.fun", its
   * SyllablePoolPianoSelector): the scale's notes are the white keys in a row,
   * the others (di, me, fi...) black keys sitting between them, each labelled
   * with its name. Used to choose notes (pressed keys are on) and, with
   * `answer`, as the answer tiles themselves.
   *
   * A note is "black" when it is not in the scale; it sits on the line
   * between the white key below it and the one above.
   */
  import { createEventDispatcher } from "svelte";

  type Key = { value: number; label: string; black: boolean };
  /** Low to high. */
  export let keys: Key[];
  /** Chooser: the notes chosen. */
  export let chosen: number[] = [];
  /** Answer tiles: big keys, numbers shown, no pressed state. */
  export let answer = false;
  export let disabled = false;
  /** Answer tiles: the right one and the wrong pick, after an answer. */
  export let right: number | null = null;
  export let wrong: number | null = null;
  /** A label for the group. */
  export let label = "Notes";

  const dispatch = createEventDispatcher<{ press: number }>();
  $: whites = keys.filter((k) => !k.black);
  /** Each black key's place: the line after the white key below it (0 = the left edge). */
  $: blacks = keys
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => k.black)
    .map(({ k, i }) => ({ k, at: keys.slice(0, i).filter((x) => !x.black).length }));
  /** Number keys answer: in the order the keys run, low to high. */
  const numberOf = (v: number) => keys.findIndex((k) => k.value === v) + 1;
</script>

<div class="kb" class:answer role="group" aria-label={label} style="--whites: {Math.max(1, whites.length)}" data-note-keyboard>
  {#if blacks.length}
    <div class="blackrow">
      {#each blacks as { k, at } (k.value)}
        <button
          type="button"
          class="key black"
          class:on={!answer && chosen.includes(k.value)}
          class:right={right === k.value}
          class:wrong={wrong === k.value}
          style="left: calc({at} / var(--whites) * 100%)"
          aria-pressed={answer ? undefined : chosen.includes(k.value)}
          {disabled}
          on:click={() => dispatch("press", k.value)}
          data-answer={answer ? k.value : undefined}
          data-note={k.value}
        >
          {#if answer}<span class="num" aria-hidden="true">{numberOf(k.value)}</span>{/if}{k.label}
        </button>
      {/each}
    </div>
  {/if}
  <div class="whiterow">
    {#each whites as k (k.value)}
      <button
        type="button"
        class="key white"
        class:on={!answer && chosen.includes(k.value)}
        class:right={right === k.value}
        class:wrong={wrong === k.value}
        aria-pressed={answer ? undefined : chosen.includes(k.value)}
        {disabled}
        on:click={() => dispatch("press", k.value)}
        data-answer={answer ? k.value : undefined}
        data-note={k.value}
      >
        {#if answer}<span class="num" aria-hidden="true">{numberOf(k.value)}</span>{/if}{k.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .kb { position: relative; width: 100%; max-width: 40rem; margin: 0 auto; }
  .whiterow { display: grid; grid-template-columns: repeat(var(--whites), minmax(0, 1fr)); gap: 3px; }
  .blackrow { position: relative; height: 3rem; margin-bottom: -1.7rem; z-index: 2; pointer-events: none; }
  .blackrow .key { pointer-events: auto; }
  .key { position: relative; display: flex; align-items: flex-end; justify-content: center; font-weight: 800; line-height: 1.1; border: 2px solid var(--sr-ink-2); transition: transform 80ms ease; }
  .key:disabled { cursor: default; }
  .white { min-height: 5.4rem; padding: 0 2px 0.5rem; border-radius: 0 0 14px 14px; background: var(--sr-paper); color: var(--sr-ink); font-size: 0.85rem; }
  .black { position: absolute; top: 0; width: min(13%, 3.4rem); min-width: 2.2rem; height: 100%; transform: translateX(-50%); padding: 0 2px 0.3rem; border-radius: 0 0 10px 10px; background: var(--sr-ink); color: var(--sr-paper); border-color: var(--sr-ink); font-size: 0.75rem; }
  .white.on { background: var(--sr-sky); color: var(--sr-sky-ink); border-color: var(--sr-action); box-shadow: inset 0 -5px 0 var(--sr-action); }
  .black.on { background: var(--sr-action); color: var(--sr-action-ink); border-color: var(--sr-action-fg); }
  .white:not(.on):not(:disabled):hover { background: var(--sr-tint); }
  /* Answer tiles: tall keys, big names. */
  .answer .white { min-height: 8.6rem; font-size: 1.5rem; font-family: var(--sr-font-display); border-radius: 0 0 20px 20px; }
  .answer .blackrow { height: 4.6rem; margin-bottom: -2.6rem; }
  .answer .black { font-size: 1.1rem; font-family: var(--sr-font-display); width: min(14%, 4.6rem); min-width: 2.8rem; }
  .answer .key:not(:disabled):active { transform: translateY(2px); }
  .answer .black:not(:disabled):active { transform: translate(-50%, 2px); }
  .key.right { background: var(--sr-mint); color: var(--sr-mint-ink); border-color: var(--sr-mint-ink); }
  .key.wrong { background: var(--sr-peach); color: var(--sr-peach-ink); border-color: var(--sr-danger); }
  .num { position: absolute; top: 5px; left: 0; right: 0; text-align: center; font-size: 0.7rem; opacity: 0.6; font-family: var(--sr-font-body); }
  /* A white key's number below the black keys, where it can be seen. */
  .white .num { top: auto; bottom: 2.7rem; }
  @media (max-width: 30rem) {
    .white { font-size: 0.72rem; }
    .answer .white { font-size: 1.05rem; min-height: 7.2rem; }
    .answer .black { font-size: 0.8rem; }
  }
</style>
