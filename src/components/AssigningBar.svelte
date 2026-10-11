<script lang="ts">
  import { onMount } from "svelte";
  import Send from "lucide-svelte/icons/send";
  import { RESUME_HREF, clearDraft, finishOnPage, readDraft, saveDraft, type AssignDraft } from "../lib/assignment-draft";
  import { isCustomKey } from "../lib/practice";

  /**
   * On a practice page opened from Create assignment (`?assigning=1`): what
   * the teacher is doing here, and the button that takes the settings, or
   * the exercise on screen, back to the wizard (assignment-draft.ts).
   */

  /** The page's settings, as a saved preset holds them. */
  export let getParams: () => Record<string, unknown>;
  /** The exercise on screen, packed, or null before one is written. */
  export let exercise: string | null;

  let draft: AssignDraft | null = null;
  let problem = "";
  onMount(() => (draft = readDraft()));

  $: fixed = !!draft?.fixed;
  $: custom = !!draft && isCustomKey(draft.presetKey);

  function use() {
    if (!draft) return;
    const done = finishOnPage(draft, { params: getParams(), exercise });
    if (!done) {
      problem = "Write an exercise first: press New exercise.";
      return;
    }
    saveDraft(done);
    location.href = RESUME_HREF;
  }

  function cancel() {
    clearDraft();
    location.href = "/account#students";
  }
</script>

{#if draft}
  <div class="bar" role="region" aria-label="Creating an assignment">
    <div class="min-w-0">
      <p class="font-bold">Creating an assignment</p>
      <p class="text-sm">
        {#if fixed}
          Press New exercise until you have one you like. Every student will sing that one.
        {:else if custom}
          Set it up with the settings above. Students get new exercises at these settings each time.
        {/if}
      </p>
      {#if problem}<p class="text-sm font-bold" role="alert">{problem}</p>{/if}
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="sr-btn text-sm inline-flex items-center gap-1.5" disabled={fixed && !exercise} on:click={use}>
        <Send size={14} aria-hidden="true" />
        {fixed ? "Use this exercise" : "Use these settings"}
      </button>
      <button type="button" class="sr-btn-quiet text-sm" on:click={cancel}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1.1rem;
    border-radius: 20px;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
  }
</style>
