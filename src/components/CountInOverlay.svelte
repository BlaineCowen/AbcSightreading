<script lang="ts">
  import { countInWordNow } from "../lib/count-in";

  /**
   * The count-in, beat by beat: "1", "2", "Ready", "Go". At the top of the
   * screen, under the menu, rather than over the music - singers are finding
   * their first note while it counts. Big enough to read from the back of a
   * room with the page projected, and it never takes a click.
   */
</script>

{#if $countInWordNow}
  {#key $countInWordNow.beat}
    <div class="count-in no-print" aria-live="assertive" aria-atomic="true">
      <span class:go={$countInWordNow.word === "Go"}>{$countInWordNow.word}</span>
    </div>
  {/key}
{/if}

<style>
  .count-in {
    position: fixed;
    top: 5rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 40;
  }
  span {
    font-size: clamp(2.5rem, 9vw, 4.5rem);
    font-weight: 800;
    line-height: 1;
    padding: 0.15em 0.45em;
    border-radius: 0.3em;
    color: var(--sr-ink);
    background: color-mix(in srgb, var(--sr-panel) 82%, transparent);
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.15);
    animation: pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  .go {
    color: var(--sr-action-fg);
  }
  @keyframes pop {
    from { transform: scale(1.35); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    span { animation: none; }
  }
</style>
