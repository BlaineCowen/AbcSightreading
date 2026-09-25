<script lang="ts">
  import RadialTuner from "../tuner/RadialTuner.svelte";
  import { tuner } from "../../lib/tuner/store";
  import { startTuner } from "../../lib/tuner/controller";
  import { exercise } from "../../lib/tools/context";

  /** The tuner card: the dial, reading solfège against the exercise's do. */
</script>

<div class="flex items-baseline justify-between">
  <h3 class="text-[15px] font-semibold text-sr-ink">Tuner</h3>
  <a class="text-xs text-sr-action-fg underline" href="/tuner">Open abcTuner</a>
</div>

{#if $tuner.engineStatus === "error"}
  <p class="text-xs text-sr-danger">
    The microphone is blocked. Allow it in the browser, then
    <button class="underline" on:click={startTuner}>try again</button>.
  </p>
{:else if $tuner.engineStatus === "idle"}
  <button class="sr-btn text-sm" on:click={startTuner}>Start microphone</button>
{/if}

<div class="mx-auto w-52">
  <RadialTuner compact interactive={false} showControls={false} keyOverride={$exercise?.doNote ?? null} />
</div>

<div class="flex flex-wrap justify-center gap-1.5">
  <button class="sr-tok text-xs {$tuner.displayMode === 'notes' ? 'sr-on' : ''}" on:click={() => tuner.setDisplayMode("notes")}>Note names</button>
  <button class="sr-tok text-xs {$tuner.displayMode === 'solfege' ? 'sr-on' : ''}" on:click={() => tuner.setDisplayMode("solfege")}>Solfège</button>
</div>
<p class="text-xs text-sr-muted text-center">
  {#if $tuner.engineStatus === "running"}
    <span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 align-middle"></span>Listening ·
  {/if}
  {#if $exercise}do is {$exercise.doLabel}{:else}key of {$tuner.key}{/if} · A = {$tuner.a4} Hz
</p>
