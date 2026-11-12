<script lang="ts">
  import { onDestroy } from "svelte";
  import { tuner } from "../../lib/tuner/store";

  /**
   * When the mic is on but the dial shows nothing, say which gate is rejecting
   * the sound - or, if no frames are arriving at all, that the audio graph
   * never started. Otherwise "it just doesn't detect anything" is
   * undiagnosable from the outside, especially on a phone.
   *
   * Only the real problem now (12 November 2026, Blaine: "get rid of the
   * helper text"): the grey line saying why nothing showed (quiet, no steady
   * pitch, with level, floor and clarity) is gone.
   */

  const NO_AUDIO_AFTER_MS = 1500;

  // With zero frames nothing re-renders this, so tick ourselves.
  let now = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  $: waiting = $tuner.engineStatus === "running" && $tuner.framesReceived === 0;
  $: if (waiting && !timer) timer = setInterval(() => (now = Date.now()), 500);
  $: if (!waiting && timer) { clearInterval(timer); timer = null; }
  onDestroy(() => timer && clearInterval(timer));

  $: silentGraph =
    waiting && $tuner.engineRunningSince !== null && now - $tuner.engineRunningSince > NO_AUDIO_AFTER_MS;
  $: reason = $tuner.detection.reason;
  $: level = Number.isFinite($tuner.dbfs) ? `${$tuner.dbfs.toFixed(0)} dB` : "—";
  $: floor = Number.isFinite($tuner.detection.noiseFloorDb) ? `${$tuner.detection.noiseFloorDb.toFixed(0)} dB` : "—";
</script>

{#if $tuner.engineStatus === "running" && !$tuner.note}
  {#if silentGraph}
    <div class="text-xs bg-sr-brass-bg border border-sr-brass rounded-lg p-3 flex flex-col gap-1">
      <p class="text-sr-brass">No audio is reaching the app.</p>
      <p class="text-sr-ink-2">
        The microphone is allowed, but no sound is arriving. Try reloading the
        page; on an iPhone or iPad, also check that no other app or tab is using
        the microphone, and that the browser has microphone access in Settings.
      </p>
    </div>
  {/if}
{/if}
