<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { startTuner } from "../../lib/tuner/controller";

  /** The microphone's state and its Start / Retry button, for the tuner styles that draw no wheel. */
</script>

{#if $tuner.engineStatus === "idle"}
  <button class="sr-btn w-full py-2.5 text-base" on:click={startTuner}>Start microphone</button>
{:else if $tuner.engineStatus === "starting"}
  <p class="text-center text-sm text-sr-brass py-2">Starting microphone…</p>
{:else if $tuner.engineStatus === "error"}
  <div class="rounded-lg bg-sr-danger-bg border border-sr-danger p-3 text-sm">
    <p class="text-sr-danger mb-1">Microphone access error</p>
    <p class="text-xs text-sr-ink-2 mb-1">
      Allow microphone access in the browser. If it says “denied by system”,
      also enable the browser under your computer's microphone privacy settings.
    </p>
    {#if $tuner.engineError}
      <p class="text-[10px] font-mono text-sr-danger mb-2 break-words">{$tuner.engineError}</p>
    {/if}
    <button class="sr-btn text-sm" on:click={startTuner}>Retry</button>
  </div>
{/if}
