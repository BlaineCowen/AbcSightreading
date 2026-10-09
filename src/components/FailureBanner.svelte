<script lang="ts">
  /**
   * An exercise that could not be written (src/lib/failure-fix.ts): what is in
   * the way, Show me (rings the setting's pill and opens it), and the one
   * change most likely to clear it, made for the reader and tried again.
   */
  import Wand from "lucide-svelte/icons/wand-sparkles";
  import type { FailureAdvice, FixAction } from "../lib/failure-fix";

  export let advice: FailureAdvice;
  export let onShow: (pill: string) => void;
  export let onFix: (action: FixAction) => void;
  export let onDismiss: () => void;
  export let busy = false;
</script>

<div class="w-full mt-4 rounded-2xl border border-sr-brass bg-sr-brass-bg p-4 no-print" role="alert">
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <p class="text-sm font-bold text-sr-brass">Could not write an exercise with these settings</p>
      <p class="mt-1 text-sm text-sr-brass">{advice.message}</p>
      {#if advice.fix || advice.pill}
        <div class="mt-3 flex flex-wrap gap-2">
          {#if advice.fix}
            <button type="button" class="sr-btn inline-flex items-center gap-1.5" disabled={busy} on:click={() => advice.fix && onFix(advice.fix.action)}>
              <Wand size={16} aria-hidden="true" />{advice.fix.label}
            </button>
          {/if}
          {#if advice.pill}
            <button type="button" class="sr-tok min-h-10" on:click={() => advice.pill && onShow(advice.pill)}>Show me the setting</button>
          {/if}
        </div>
      {/if}
    </div>
    <button class="text-sr-brass hover:text-sr-ink text-xl leading-none" on:click={onDismiss} aria-label="Dismiss">&times;</button>
  </div>
</div>
