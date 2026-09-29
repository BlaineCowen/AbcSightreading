<script lang="ts">
  import { countInOnScore, countInWordNow } from "../lib/count-in";

  /**
   * The count-in's fallback: over the right end of the playback bar - the
   * tempo controls, which nobody touches in the count - for when the score
   * has no room above its first staff for CountInBadge. Never covers the
   * music, and Pause stays within reach. Lives inside PlaybackBar, whose fixed
   * box it is positioned against. Never takes a click.
   */
</script>

{#if $countInWordNow && !$countInOnScore}
  {#key $countInWordNow.beat}
    <div class="count-in no-print" aria-live="assertive" aria-atomic="true">
      <span class:go={$countInWordNow.word === "Go"}>{$countInWordNow.word}</span>
    </div>
  {/key}
{/if}

<style>
  .count-in {
    position: absolute;
    right: 0;
    bottom: env(safe-area-inset-bottom, 0px);
    /* The transport row: h-11 + py-2 on a phone, h-8 + py-2 from sm up. */
    height: 3.75rem;
    min-width: 9.5rem;
    padding: 0 1.25rem 0 2.5rem;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    pointer-events: none;
    /* The bar's own slate-800, fading in from the left over the controls. */
    background: linear-gradient(to right, rgb(var(--sr-bar-rgb, 30 41 59) / 0), rgb(var(--sr-bar-rgb, 30 41 59)) 2rem);
  }
  @media (min-width: 640px) {
    .count-in { height: 3rem; min-width: 12rem; }
  }
  span {
    font-size: 1.9rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.01em;
    color: var(--sr-bar-ink, #f1f5f9);
    font-family: var(--sr-font-display, inherit);
    animation: pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  .go {
    color: var(--sr-bar-accent, #93c5fd);
  }
  @keyframes pop {
    from { transform: scale(1.4); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    span { animation: none; }
  }
</style>
