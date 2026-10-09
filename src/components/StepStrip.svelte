<script lang="ts">
  /**
   * Where a class is in abcStepByStep, above the settings while a step is
   * open (src/lib/ladder.ts): the step, what it adds, the whole list and the
   * next step. A step is otherwise only a name in the preset button, and
   * nobody could see there was a next one.
   */
  import ArrowRight from "lucide-svelte/icons/arrow-right";
  import ListOrdered from "lucide-svelte/icons/list-ordered";
  import { STEP_COUNT, ladderById, nextStepAfter, stepTitle, type LadderStep } from "../lib/ladder";

  export let stepId: string;
  /** Opens a step: the page's own applyLadderStep, which sends a step for the other page there. */
  export let onSelect: (step: LadderStep) => void;

  $: step = Object.hasOwn(ladderById, stepId) ? ladderById[stepId] : null;
  $: next = step ? nextStepAfter(step.id) : null;

  const openList = () => window.dispatchEvent(new CustomEvent("sr-open-presets", { detail: { section: "steps" } }));
</script>

{#if step}
  <section class="step-strip no-print" aria-label="abcStepByStep">
    <div class="min-w-0">
      <p class="step-kicker">abcStepByStep · Step {step.number} of {STEP_COUNT}</p>
      <p class="step-title">{stepTitle(step)}</p>
      <p class="step-new">{step.newThing}</p>
    </div>
    <div class="step-actions">
      <button type="button" class="sr-tok inline-flex items-center gap-1.5 min-h-10" on:click={openList}>
        <ListOrdered size={16} aria-hidden="true" />All steps
      </button>
      {#if next}
        <button
          type="button"
          class="sr-btn inline-flex items-center gap-1.5"
          on:click={() => next && onSelect(next)}
          title="Step {next.number}: {stepTitle(next)}{next.page !== step.page ? ` (on the ${next.page === 'choral' ? 'Choral' : 'Unison'} page)` : ''}"
        >Next step<ArrowRight size={16} aria-hidden="true" /></button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .step-strip {
    width: 100%;
    margin-top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1rem;
    padding: 0.85rem 1.1rem;
    border-radius: var(--sr-r-lg);
    background: var(--sr-mint);
    color: var(--sr-mint-ink);
  }
  .step-kicker {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    opacity: 0.8;
  }
  .step-title {
    font-family: var(--sr-font-display);
    font-weight: 600;
    font-size: 1.1rem;
    line-height: 1.3;
  }
  .step-new {
    font-size: 0.875rem;
    opacity: 0.85;
  }
  .step-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
