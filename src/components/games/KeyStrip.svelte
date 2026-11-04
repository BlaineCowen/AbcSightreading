<script lang="ts">
  /**
   * The key, on screen while it plays (Blaine, 4 November 2026: it was not
   * clear the tonic triad came first). "First the key" with do mi so held
   * together, then each syllable of do mi so mi do so do lit as it sounds,
   * then "Now the tune". Shown all the time, quiet before the key plays.
   */
  import { KEY_SYLLABLES } from "../../lib/games/game-audio";

  /** -1 while the chord sounds, the note of the key sounding, or null when the key is over. */
  export let at: number | null = null;
  /** True once the tune has started (the strip then reads "Now the tune"). */
  export let tune = false;
</script>

<!-- Always there, so the board never jumps when it plays: quiet until the key sounds, then lit, then "Now the tune". -->
<div class="strip" class:key={at !== null} class:tune={at === null && tune} role="status" aria-live="polite" data-key-strip={at !== null ? "key" : tune ? "tune" : "idle"}>
  <span class="label">{at === null && tune ? "Now the tune" : "First the key"}</span>
  <span class="chord" class:lit={at === -1}>do mi so</span>
  <span class="notes">
    {#each KEY_SYLLABLES as s, i}<span class="n" class:lit={at === i} class:past={(at ?? -1) > i || (at === null && tune)}>{s}</span>{/each}
  </span>
</div>

<style>
  .strip { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem 0.75rem; padding: 0.6rem 1rem; border-radius: 20px; background: var(--sr-track); color: var(--sr-ink-2); font-weight: 800; transition: background 150ms ease; }
  .strip.key { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .strip.tune { background: var(--sr-tint); color: var(--sr-action-fg); }
  .label { font-family: var(--font-display, inherit); font-size: 1.15rem; }
  .chord, .n { border-radius: 999px; padding: 0.2rem 0.65rem; background: var(--sr-raise); color: var(--sr-ink-2); transition: transform 90ms ease, background 90ms ease; }
  .notes { display: flex; gap: 0.3rem; flex-wrap: wrap; justify-content: center; }
  .past { opacity: 0.55; }
  .lit { background: var(--sr-action); color: var(--sr-action-ink); transform: scale(1.12); opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .lit { transform: none; } }
</style>
