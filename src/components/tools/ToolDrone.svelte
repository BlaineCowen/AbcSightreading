<script lang="ts">
  import { onMount } from "svelte";
  import { exercise } from "../../lib/tools/context";
  import { toolSettings, setTool, type DroneMode } from "../../lib/tools/settings";
  import { tuner } from "../../lib/tuner/store";
  import { droneOn, initDrone } from "../../lib/tools/state";

  /**
   * The drone card: do held under the singing, so every note is heard against
   * the tonic - the quickest way to hear a mi that is flat or a ti that has not
   * gone up. It follows the exercise's key and keeps sounding when the card is
   * closed (see lib/tools/state.ts); the Tools button shows it is on.
   */

  const MODES: [DroneMode, string][] = [
    ["do", "Do"],
    ["doso", "Do + So"],
    ["chord", "Tonic chord"],
  ];
  $: label = $exercise?.doLabel ?? $tuner.key;
  onMount(initDrone);
  const toggle = () => droneOn.update((on) => !on);
</script>

<h3 class="text-[15px] font-semibold text-sr-ink">Drone</h3>
<p class="text-sm text-sr-muted">Hold the tonic under the singing, so every note is heard against do.</p>

<button
  class="h-12 rounded-lg font-semibold {$droneOn ? 'border border-sr-action text-sr-action-fg bg-sr-tint' : 'sr-btn'}"
  on:click={toggle}
  aria-pressed={$droneOn}
>{$droneOn ? `Drone on ${label} (do) · stop` : `Start a drone on ${label} (do)`}</button>

<div class="flex flex-wrap gap-1.5">
  {#each MODES as [id, text]}
    <button class="sr-tok text-sm {$toolSettings.droneMode === id ? 'sr-on' : ''}" on:click={() => setTool({ droneMode: id })}>{text}</button>
  {/each}
</div>
<div class="flex items-center gap-3 text-sm text-sr-muted">
  <span>Octave</span>
  <button class="sr-tok text-sm {$toolSettings.droneOctave === 3 ? 'sr-on' : ''}" on:click={() => setTool({ droneOctave: 3 })}>Low</button>
  <button class="sr-tok text-sm {$toolSettings.droneOctave === 4 ? 'sr-on' : ''}" on:click={() => setTool({ droneOctave: 4 })}>High</button>
</div>
<label class="flex items-center gap-3 text-sm text-sr-muted">
  Volume
  <input
    type="range" min="0.05" max="1" step="0.05"
    class="flex-1 accent-[var(--sr-action)]"
    value={$toolSettings.droneVolume}
    on:input={(e) => setTool({ droneVolume: Number(e.currentTarget.value) })}
  />
</label>
