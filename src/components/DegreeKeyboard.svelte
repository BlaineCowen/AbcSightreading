<script lang="ts">
  /**
   * Scale degrees laid out as a piano keyboard: the scale's own notes are the
   * white keys (a major key from C, a minor key from A), the chromatic notes
   * the black keys between them, where they sit on a real keyboard. A black
   * key carrying two spellings (♯1 and ♭2, say: di and ra) is split, the
   * sharp on its top half and the flat below; one spelling fills the key.
   * `tail` adds a faded white key past the last, the octave's first note, so
   * a black key after the seventh degree (minor's ♯7, G♯ from A) has a place.
   */
  export interface Key {
    label: string;
    sub?: string;
    on: boolean;
    /** Set apart with a ring (minor's raised 6 and 7: melodic and harmonic minor). */
    ring?: boolean;
    toggle: () => void;
  }
  export let whites: Key[];
  /** Each black key after white key `after` (0-based): its spellings, sharp first. */
  export let blacks: { after: number; keys: Key[] }[];
  export let tail: { label: string; sub?: string } | null = null;
  export let ariaLabel: string;

  $: n = whites.length + (tail ? 1 : 0);
</script>

<div class="kb" style="--n: {n}" role="group" aria-label={ariaLabel}>
  {#each whites as k}
    <button type="button" class="white" class:on={k.on} aria-pressed={k.on} on:click={k.toggle}>
      <span class="num">{k.label}</span>{#if k.sub}<span class="sub">{k.sub}</span>{/if}
    </button>
  {/each}
  {#if tail}
    <span class="white tail" aria-hidden="true"><span class="num">{tail.label}</span>{#if tail.sub}<span class="sub">{tail.sub}</span>{/if}</span>
  {/if}
  {#each blacks as b}
    <div class="black" style="--at: {b.after + 1}">
      {#each b.keys as k}
        <button type="button" class:on={k.on} class:ring={k.ring} aria-pressed={k.on} on:click={k.toggle}>
          <span class="num">{k.label}</span>{#if k.sub}<span class="sub">{k.sub}</span>{/if}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .kb {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    width: calc(var(--n) * 3.25rem);
    max-width: 100%;
    height: 8.5rem;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-hairline);
    gap: 1px;
  }
  /* White keys: white in both themes, as the score paper is. */
  .white {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding-bottom: 0.45rem;
    background: var(--sr-paper);
    color: var(--sr-bar);
    line-height: 1.1;
    transition: background 120ms ease;
  }
  .white:hover { background: var(--sr-track); }
  .white.on { background: var(--sr-action); color: var(--sr-action-ink); }
  .white.tail { opacity: 0.4; }
  .num { font-size: 14px; font-weight: 800; }
  .sub { font-size: 10px; font-weight: 700; opacity: 0.75; }
  /* Black keys: navy in both themes, centred on the line between two white keys. */
  .black {
    position: absolute;
    top: 0;
    left: calc(100% * var(--at) / var(--n));
    transform: translateX(-50%);
    width: calc(100% / var(--n) * 0.66);
    height: 62%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--sr-bar-line);
    border-radius: 0 0 7px 7px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(21, 33, 58, 0.3);
  }
  .black button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 0;
    background: var(--sr-bar);
    color: var(--sr-bar-ink);
    line-height: 1.05;
    transition: background 120ms ease;
  }
  .black .num { font-size: 12px; }
  .black .sub { font-size: 9px; }
  .black button:hover { background: var(--sr-bar-btn-hi); }
  .black button.on { background: var(--sr-action); color: var(--sr-action-ink); }
  .black button.ring { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--sr-action) 70%, white); }
  .black button.ring.on { box-shadow: inset 0 0 0 2px var(--sr-action-ink); }
  button:focus-visible { outline: 2px solid var(--sr-action); outline-offset: -3px; position: relative; z-index: 1; }
  .black button:focus-visible { outline-color: var(--sr-butter); }
  @media (prefers-reduced-motion: reduce) {
    .white, .black button { transition: none; }
  }
</style>
