<script lang="ts">
  import { onDestroy } from "svelte";
  import { Gauge, X } from "lucide-svelte";
  import { signedInUser } from "../../lib/auth-client";
  import { tuner } from "../../lib/tuner/store";
  import { initTuner, startTuner, stopTuner } from "../../lib/tuner/controller";
  import RadialTuner from "./RadialTuner.svelte";

  /**
   * The practice pages' tuner: a button in the playback bar that opens a small
   * floating dial, so a singer can check a note without leaving the exercise.
   * Part of Pro, like abcTuner itself - signed out, it says so instead.
   * Closing it closes the microphone.
   */

  /** The playback bar's own button style, passed in so it matches. */
  export let buttonClass = "";

  let open = false;
  let allowed: boolean | null = null;

  async function toggle() {
    open = !open;
    if (!open) {
      stopTuner();
      return;
    }
    allowed ??= !!(await signedInUser());
    if (allowed) {
      initTuner();
      // Opening is the user gesture the microphone needs.
      if (tuner.get().engineStatus !== "running") startTuner();
    }
  }

  function close() {
    open = false;
    stopTuner();
  }

  onDestroy(() => {
    if (open) stopTuner();
  });

  $: next = typeof location !== "undefined" ? encodeURIComponent(location.pathname + location.search) : "%2F";
</script>

<button
  type="button"
  class="{buttonClass} {open ? 'ring-2 ring-teal-300' : ''}"
  on:click={toggle}
  aria-pressed={open}
  title="Tuner - check the note you are singing"
><Gauge size={14} /> Tuner</button>

{#if open}
  <div
    class="fixed right-3 z-50 w-64 bg-sr-raise border border-sr-hairline rounded-xl shadow-xl p-3 flex flex-col gap-2 text-sr-ink"
    style="bottom: calc(var(--bottom-bar-h, 96px) + 0.75rem)"
    role="dialog"
    aria-label="Tuner"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold">Tuner</span>
      <div class="flex items-center gap-2">
        {#if allowed}
          <button
            class="text-xs text-sr-muted underline"
            on:click={() => tuner.setDisplayMode($tuner.displayMode === "solfege" ? "notes" : "solfege")}
          >{$tuner.displayMode === "solfege" ? "Note names" : "Solfège"}</button>
          <a class="text-xs text-sr-muted underline" href="/tuner">Open abcTuner</a>
        {/if}
        <button class="p-1 text-sr-faint hover:text-sr-ink" on:click={close} aria-label="Close the tuner"><X size={14} /></button>
      </div>
    </div>

    {#if allowed === null}
      <p class="text-xs text-sr-muted">…</p>
    {:else if !allowed}
      <p class="text-sm text-sr-ink-2">The tuner is part of Pro. For now, Pro comes with every account.</p>
      <a class="sr-btn text-sm text-center" href="/login?mode=signup&next={next}">Create a free account</a>
    {:else}
      {#if $tuner.engineStatus === "error"}
        <p class="text-xs text-sr-danger">Microphone blocked. Allow it in the browser, then
          <button class="underline" on:click={startTuner}>try again</button>.</p>
      {:else if $tuner.engineStatus === "starting"}
        <p class="text-xs text-sr-muted">Starting the microphone…</p>
      {:else if $tuner.engineStatus === "idle"}
        <button class="sr-btn text-sm" on:click={startTuner}>Start microphone</button>
      {/if}
      <RadialTuner compact interactive={false} showControls={false} />
      <p class="text-[11px] text-sr-faint text-center">
        Key of {$tuner.key} · A = {$tuner.a4} Hz · change them in abcTuner
      </p>
    {/if}
  </div>
{/if}
