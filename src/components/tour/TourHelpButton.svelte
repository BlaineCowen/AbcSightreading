<script lang="ts">
  /** The "?" at the end of a practice page's settings row: the walkthrough again (src/lib/tour.ts). */
  import CircleHelp from "lucide-svelte/icons/circle-question-mark";
  import { startTour } from "../../lib/tour";
</script>

<button type="button" class="tour-help no-print" on:click={startTour} aria-label="Show me around: a short tour of this page" title="Show me around">
  <CircleHelp size={20} aria-hidden="true" />
</button>

<style>
  .tour-help {
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--sr-muted);
    border: 1.5px solid var(--sr-hairline);
    background: var(--sr-panel);
  }
  .tour-help:hover { color: var(--sr-action-fg); border-color: var(--sr-tint); }
  .tour-help:focus-visible { outline: 2px solid var(--sr-action); outline-offset: 2px; }
</style>
