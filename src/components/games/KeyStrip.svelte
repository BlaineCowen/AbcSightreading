<script lang="ts">
  /**
   * The key, on screen while it plays (Blaine, 4 November 2026: it was not
   * clear the tonic triad came first). "First the key" with do mi so held
   * together, then each syllable of do mi so mi do so do lit as it sounds,
   * then "Now the tune" on the first note. A card floating over the board.
   */
  import { KEY_SYLLABLES } from "../../lib/games/game-audio";

  /** -1 while the chord sounds, the note of the key sounding, or null when the key is over. */
  export let at: number | null = null;
  /** True while the tune's first note sounds: the card reads "Now the tune", then goes. */
  export let tune = false;
</script>

<!-- Floats over the board (Blaine, 4 November 2026: as a card, not a strip in the page); taps go through it. -->
{#if at !== null || tune}
  <div class="float" role="status" aria-live="polite" data-key-strip={at !== null ? "key" : "tune"}>
    <div class="card" class:tune={at === null}>
      <span class="label">{at === null ? "Now the tune" : "First the key"}</span>
      {#if at !== null}
        <span class="chord" class:lit={at === -1}>do mi so</span>
        <span class="notes" aria-hidden="true">
          {#each KEY_SYLLABLES as s, i}<span class="n" class:lit={at === i} class:past={at > i}>{s}</span>{/each}
        </span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .float { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0.75rem; pointer-events: none; z-index: 5; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; max-width: 100%; padding: 1rem 1.4rem; border-radius: 24px; background: var(--sr-butter); color: var(--sr-butter-ink); font-weight: 800; box-shadow: 0 14px 40px color-mix(in srgb, var(--sr-ink) 28%, transparent); animation: pop 220ms cubic-bezier(.2, 1.4, .4, 1); }
  .card.tune { background: var(--sr-action); color: var(--sr-action-ink); }
  .label { font-family: var(--font-display, inherit); font-size: 1.5rem; line-height: 1.1; }
  .chord, .n { border-radius: 999px; padding: 0.25rem 0.7rem; background: var(--sr-raise); color: var(--sr-ink-2); transition: transform 90ms ease, background 90ms ease; }
  .chord { font-size: 1.05rem; }
  .notes { display: flex; gap: 0.3rem; flex-wrap: wrap; justify-content: center; }
  .past { opacity: 0.55; }
  .lit { background: var(--sr-action); color: var(--sr-action-ink); transform: scale(1.12); opacity: 1; }
  @keyframes pop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .lit { transform: none; } .card { animation: none; } }
</style>
