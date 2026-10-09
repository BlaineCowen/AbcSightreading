<!-- What the metronome sounds like, all in view: the click's sound and level,
     and the counting voice (voice-count.ts) - off, counting or Kodály, with
     the click or instead of it, and its level. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { CLICK_SOUNDS, type ClickSound } from "../../lib/tuner/click-sounds";
  import { metronome } from "../../lib/tuner/metronome";
  import { metronomeSounding } from "../../lib/tools/metronome-link";

  export let compact = false;
  /** The Tools card has its own volume row. */
  export let showVolume = true;

  /**
   * Choosing a sound plays a bar of it, so the choice is by ear - unless the
   * metronome is already sounding, where the new sound is heard on the next
   * beat and a preview on top of it was a burst of extra clicks.
   */
  function pickSound(id: ClickSound) {
    tuner.setClickSound(id);
    if (!metronomeSounding($tuner)) void metronome.preview(id);
  }

  $: voice = $tuner.voice;
  $: voiceChoice = voice.mode === "off" ? "off" : voice.system;
  function pickVoice(choice: string) {
    if (choice === "off") tuner.setVoice({ mode: "off" });
    else tuner.setVoice({ system: choice as "counting" | "kodaly", mode: voice.mode === "off" ? "both" : voice.mode });
  }

  $: tok = `sr-tok ${compact ? "px-3 text-[13px]" : ""}`;
  const label = "text-xs font-bold text-sr-ink-2";
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-1.5">
    <span class={label}>Click</span>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Click sound">
      {#each CLICK_SOUNDS as snd}
        <button type="button" class="{tok} {$tuner.clickSound === snd.id ? 'sr-on' : ''}" aria-pressed={$tuner.clickSound === snd.id}
          on:click={() => pickSound(snd.id)}>{snd.label}</button>
      {/each}
    </div>
    {#if showVolume}
      <label class="mt-1 flex items-center gap-3 text-[13px] text-sr-ink-2">
        <span class="w-20 shrink-0">Volume</span>
        <input type="range" min="0" max="1" step="0.05" class="sr-range flex-1" aria-label="Metronome volume"
          value={$tuner.metronomeVolume} on:input={(e) => tuner.setMetronomeVolume(Number(e.currentTarget.value))} />
      </label>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <span class={label}>Counting voice</span>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Counting voice">
      {#each [["off", "Off"], ["counting", "1 e & a"], ["kodaly", "Kodály"]] as [id, text]}
        <button type="button" class="{tok} {voiceChoice === id ? 'sr-on' : ''}" aria-pressed={voiceChoice === id}
          on:click={() => pickVoice(id)}>{text}</button>
      {/each}
    </div>
    <div class="mt-1 flex flex-col gap-2 {voice.mode === 'off' ? 'opacity-45' : ''}">
      <label class="flex items-center gap-2 text-[13px] text-sr-ink-2">
        <input type="checkbox" class="sr-check h-4 w-4" disabled={voice.mode === "off"} checked={voice.mode !== "voice"}
          on:change={(e) => tuner.setVoice({ mode: e.currentTarget.checked ? "both" : "voice" })} />
        Click along with the voice
      </label>
      <label class="flex items-center gap-3 text-[13px] text-sr-ink-2">
        <span class="w-20 shrink-0">Voice level</span>
        <input type="range" min="0" max="1" step="0.05" class="sr-range flex-1" aria-label="Counting voice level"
          disabled={voice.mode === "off"} value={voice.volume}
          on:input={(e) => tuner.setVoice({ volume: Number(e.currentTarget.value) })} />
      </label>
    </div>
  </div>
</div>
