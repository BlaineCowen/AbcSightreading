<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { METERS, meterById } from "../../lib/tuner/meters";
  import SubdivisionPicker from "./SubdivisionPicker.svelte";
  import type { VoiceMode, VoiceSystem } from "../../lib/tuner/voice-count";
  import { CLICK_SOUNDS, type ClickSound } from "../../lib/tuner/click-sounds";
  import { metronome } from "../../lib/tuner/metronome";
  import { metronomeSounding } from "../../lib/tools/metronome-link";

  /**
   * Time signature and subdivision, shared by the metronome on /tuner and the
   * practice pages' metronome card. The subdivisions offered follow the meter:
   * 6/8 divides its dotted-quarter beat in three, so it offers eighths and
   * sixteenths, not triplets.
   */

  /** Called when the singer picks a meter or subdivision themselves. */
  export let onManual: () => void = () => {};
  export let compact = false;
  /** On a practice page the meter is the exercise's: shown, not chosen. */
  export let lockedMeter = false;

  const GROUPS: [string, typeof METERS][] = [
    ["Simple", METERS.filter((m) => m.kind === "simple")],
    ["Compound", METERS.filter((m) => m.kind === "compound")],
    ["Uneven", METERS.filter((m) => m.kind === "uneven")],
  ];

  $: meter = meterById($tuner.meter);

  function pickMeter(id: string) {
    onManual();
    tuner.setMeter(id);
  }
  /**
   * Choosing a sound plays a bar of it, so the choice is by ear - unless the
   * metronome is already sounding, where the new sound is heard on the next
   * beat and a preview on top of it was a burst of extra clicks.
   */
  // The counting voice's choices (voice-count.ts).
  const pickVoiceMode = (mode: string) => tuner.setVoice({ mode: mode as VoiceMode });
  const pickVoiceSystem = (system: string) => tuner.setVoice({ system: system as VoiceSystem });

  function pickSound(id: ClickSound) {
    tuner.setClickSound(id);
    if (!metronomeSounding($tuner)) void metronome.preview(id);
  }
</script>

<div class="flex flex-col gap-2 text-sm">
  <div class="flex flex-col gap-1.5" role="group" aria-label="Time signature">
    <span class="text-xs text-sr-muted">Time signature</span>
    {#if lockedMeter}
      <div class="flex items-center gap-2">
        <span class="sr-tok sr-on tabular-nums {compact ? 'px-2 text-xs' : ''}">{meter.id}</span>
        <span class="text-xs text-sr-muted">the exercise's</span>
      </div>
    {:else}
    <div class="flex flex-wrap items-center gap-1">
      {#each GROUPS as [label, meters], g}
        {#if g > 0}<span class="w-px h-6 bg-sr-hairline mx-1" aria-hidden="true"></span>{/if}
        {#each meters as m}
          <button
            type="button"
            class="sr-tok tabular-nums {compact ? 'px-2 text-xs' : ''} {$tuner.meter === m.id ? 'sr-on' : ''}"
            on:click={() => pickMeter(m.id)}
            aria-pressed={$tuner.meter === m.id}
            title="{label}{m.grouping ? `, felt ${m.grouping}` : ''}"
          >{m.id}</button>
        {/each}
      {/each}
    </div>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5" role="group" aria-label="Subdivision">
    <span class="text-xs text-sr-muted">
      {meter.grouping ? `Subdivide · felt ${meter.grouping}` : "Subdivide"}
    </span>
    <!-- Each beat's accent is set on its tile now (BeatTiles). -->
    <SubdivisionPicker {compact} {onManual} />
  </div>

  <div class="flex flex-col gap-1.5" role="group" aria-label="Sound">
    <span class="text-xs text-sr-muted">Sound</span>
    <div class="flex flex-wrap items-center gap-1">
      {#each CLICK_SOUNDS as snd}
        <button
          type="button"
          class="sr-tok {compact ? 'px-2 text-xs' : ''} {$tuner.clickSound === snd.id ? 'sr-on' : ''}"
          on:click={() => pickSound(snd.id)}
          aria-pressed={$tuner.clickSound === snd.id}
        >{snd.label}</button>
      {/each}
    </div>
  </div>

  <!-- The counting voice (voice-count.ts): a robot saying the count with the
       click or instead of it, in Counting or Kodály. -->
  <div class="flex flex-col gap-1.5" role="group" aria-label="Counting voice">
    <span class="text-xs text-sr-muted">Counting voice</span>
    <div class="flex flex-wrap items-center gap-1">
      {#each [["off", "Off"], ["both", "Voice + click"], ["voice", "Voice only"]] as [mode, label]}
        <button
          type="button"
          class="sr-tok {compact ? 'px-2 text-xs' : ''} {$tuner.voice.mode === mode ? 'sr-on' : ''}"
          aria-pressed={$tuner.voice.mode === mode}
          on:click={() => pickVoiceMode(mode)}
        >{label}</button>
      {/each}
      {#if $tuner.voice.mode !== "off"}
        <span class="w-px h-6 bg-sr-hairline mx-1" aria-hidden="true"></span>
        {#each [["counting", "1 e & a"], ["kodaly", "Kodály"]] as [system, label]}
          <button
            type="button"
            class="sr-tok {compact ? 'px-2 text-xs' : ''} {$tuner.voice.system === system ? 'sr-on' : ''}"
            aria-pressed={$tuner.voice.system === system}
            on:click={() => pickVoiceSystem(system)}
          >{label}</button>
        {/each}
      {/if}
    </div>
    {#if $tuner.voice.mode !== "off"}
      <label class="flex items-center gap-2 text-xs text-sr-muted">
        <span class="shrink-0">Voice level</span>
        <input type="range" min="0" max="1" step="0.05" class="flex-1 sr-range" aria-label="Counting voice level"
          value={$tuner.voice.volume} on:input={(e) => tuner.setVoice({ volume: Number(e.currentTarget.value) })} />
      </label>
      <p class="text-[11px] text-sr-faint">Subdivisions are counted when there is time to say them; faster, only the beats.</p>
    {/if}
  </div>
</div>
