<script lang="ts">
  import { onDestroy } from "svelte";
  import { tuner } from "../../lib/tuner/store";

  /**
   * When the mic is on but the dial shows nothing, say which gate is rejecting
   * the sound - or, if no frames are arriving at all, that the audio graph
   * never started. Otherwise "it just doesn't detect anything" is
   * undiagnosable from the outside, especially on a phone.
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
  {:else}
    <div class="text-xs text-sr-muted bg-sr-panel border border-sr-hairline rounded-lg p-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {#if reason === "self-playing"}
        <span>Paused while the app is sounding a note - tap the lit wedge again to stop it, then sing.</span>
      {:else if reason === "quiet"}
        <span>
          Sound is too close to the room noise
          {#if $tuner.sensitivity !== "high"}
            - try <button class="underline underline-offset-2 hover:text-sr-ink" on:click={() => tuner.setSensitivity("high")}>High sensitivity</button>
          {/if}
        </span>
      {:else if reason === "silent"}
        <span>Listening - no sound yet</span>
      {:else}
        <span>Hearing sound, but no steady pitch yet</span>
      {/if}
      <span class="font-mono text-sr-faint">
        level {level} · floor {floor} · clarity {$tuner.detection.clarity.toFixed(2)} · {$tuner.framesReceived} frames
      </span>
    </div>
  {/if}
{/if}
