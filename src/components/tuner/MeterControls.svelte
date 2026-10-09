<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { METERS, isTableMeter, meterById, meterName } from "../../lib/tuner/meters";
  import SubdivisionPicker from "./SubdivisionPicker.svelte";
  import CustomMeter from "./CustomMeter.svelte";
  import SettingRow from "./SettingRow.svelte";
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


  $: meter = meterById($tuner.meter);
  $: tok = `sr-tok ${compact ? "px-3 text-[13px]" : ""}`;
  const gap = "gap-2";
  $: custom = !isTableMeter(meter.id);
  /** The custom editor: open by itself while a custom meter is on. */
  let customOpen = false;
  $: showCustom = customOpen || custom;
  $: meterLabel = meter.kind === "uneven" && meter.grouping ? `${meterName(meter)} (${meter.grouping})` : meterName(meter);

  function pickMeter(id: string) {
    onManual();
    customOpen = false;
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

<div class="flex flex-col {compact ? 'gap-4' : 'gap-5'} text-sm">
  <SettingRow label="Time signature" note={meter.kind === "uneven" && meter.grouping ? `felt ${meter.grouping}` : meter.kind === "compound" ? `${meter.beats} dotted beats` : ""} {compact}>
    {#if lockedMeter}
      <div class="flex items-center gap-2">
        <span class="{tok} sr-on tabular-nums">{meterLabel}</span>
        <span class="text-xs text-sr-muted">the exercise's</span>
      </div>
    {:else}
      <div class="flex flex-wrap items-center {gap}">
        {#each METERS as m}
          <button
            type="button"
            class="{tok} tabular-nums {$tuner.meter === m.id ? 'sr-on' : ''}"
            on:click={() => pickMeter(m.id)}
            aria-pressed={$tuner.meter === m.id}
            title="{m.kind === 'simple' ? 'Simple' : m.kind === 'compound' ? 'Compound' : 'Uneven'}{m.grouping ? `, felt ${m.grouping}` : ''}"
          >{m.id}</button>
        {/each}
        <!-- Custom is a different kind of button: it opens an editor. -->
        <button
          type="button"
          class="{tok} tabular-nums {custom ? 'sr-on' : 'custom-off'}"
          aria-expanded={showCustom}
          on:click={() => (customOpen = custom ? true : !customOpen)}
        >{custom ? meterLabel : "Custom…"}</button>
      </div>
      {#if showCustom}<CustomMeter {compact} {onManual} />{/if}
    {/if}
  </SettingRow>

  <SettingRow label="Subdivide" {compact}>
    <!-- Each beat's accent is set on its tile now (BeatTiles). -->
    <SubdivisionPicker {compact} {onManual} />
  </SettingRow>

  <SettingRow label="Click sound" {compact}>
    <div class="flex flex-wrap items-center {gap}">
      {#each CLICK_SOUNDS as snd}
        <button
          type="button"
          class="{tok} {$tuner.clickSound === snd.id ? 'sr-on' : ''}"
          on:click={() => pickSound(snd.id)}
          aria-pressed={$tuner.clickSound === snd.id}
        >{snd.label}</button>
      {/each}
    </div>
  </SettingRow>

  <!-- The counting voice (voice-count.ts): a robot saying the count with the
       click or instead of it, in Counting or Kodály. -->
  <SettingRow label="Counting voice" {compact}>
    <div class="flex flex-wrap items-center {gap}">
      {#each [["off", "Off"], ["both", "Voice + click"], ["voice", "Voice only"]] as [mode, label]}
        <button
          type="button"
          class="{tok} {$tuner.voice.mode === mode ? 'sr-on' : ''}"
          aria-pressed={$tuner.voice.mode === mode}
          on:click={() => pickVoiceMode(mode)}
        >{label}</button>
      {/each}
    </div>
    {#if $tuner.voice.mode !== "off"}
      <div class="flex flex-wrap items-center {gap}" role="group" aria-label="Counting in">
        {#each [["counting", "1 e & a"], ["kodaly", "Kodály"]] as [system, label]}
          <button
            type="button"
            class="{tok} {$tuner.voice.system === system ? 'sr-on' : ''}"
            aria-pressed={$tuner.voice.system === system}
            on:click={() => pickVoiceSystem(system)}
          >{label}</button>
        {/each}
      </div>
    {/if}
    {#if $tuner.voice.mode !== "off"}
      <label class="flex items-center gap-3 text-[13px] text-sr-ink-2 max-w-sm">
        <span class="shrink-0">Voice level</span>
        <input type="range" min="0" max="1" step="0.05" class="flex-1 sr-range" aria-label="Counting voice level"
          value={$tuner.voice.volume} on:input={(e) => tuner.setVoice({ volume: Number(e.currentTarget.value) })} />
      </label>
      <p class="text-xs text-sr-muted">Subdivisions are counted when there is time to say them; faster, only the beats.</p>
    {/if}
  </SettingRow>
</div>

<style>
  /* Custom… opens an editor, so it reads as an action, not one more meter. */
  .custom-off {
    background: transparent;
    border: 2px dashed var(--sr-hairline);
  }
</style>
