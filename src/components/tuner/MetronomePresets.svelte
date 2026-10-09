<!-- The metronome's presets (metronome-presets.ts): the built-in feels, which
     keep the tempo, and the singer's own, which keep everything. A preset
     that matches what the metronome is doing now is shown as chosen. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { QUICK_PRESETS, presetSummary, type MetronomePreset } from "../../lib/tuner/metronome-presets";
  import { groupLevels, meterById } from "../../lib/tuner/meters";
  import SettingRow from "./SettingRow.svelte";

  export let compact = false;
  export let onManual: () => void = () => {};

  let naming = false;
  let name = "";

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  function matches(p: MetronomePreset, s: typeof $tuner): boolean {
    if (p.meter !== s.meter || p.subdivision !== s.subdivision || (p.subMask ?? null) !== s.subMask) return false;
    if (p.bpm !== undefined && p.bpm !== s.bpm) return false;
    return same(p.beatLevels ?? groupLevels(meterById(p.meter)), s.beatLevels);
  }

  function apply(p: MetronomePreset) {
    onManual();
    tuner.applyMetronomePreset(p);
  }
  function save() {
    if (!name.trim()) return;
    tuner.saveMetronomePreset(name);
    name = "";
    naming = false;
  }

  $: tok = `sr-tok ${compact ? "px-3 text-[13px]" : ""}`;
</script>

<SettingRow label="Presets" {compact}>
  <div class="flex flex-wrap items-center gap-2">
    {#each QUICK_PRESETS as p}
      <button type="button" class="{tok} {matches(p, $tuner) ? 'sr-on' : ''}" aria-pressed={matches(p, $tuner)}
        title="{p.name}, at the tempo you have" on:click={() => apply(p)}>{p.name}</button>
    {/each}
    {#each $tuner.metronomePresets as p (p.id)}
      <span class="inline-flex items-center">
        <button type="button" class="{tok} rounded-r-none !pr-1.5 {matches(p, $tuner) ? 'sr-on' : ''}" aria-pressed={matches(p, $tuner)}
          title={presetSummary(p)} on:click={() => apply(p)}>{p.name}</button>
        <button type="button" class="{tok} rounded-l-none !pl-2 !pr-3 text-sr-muted {matches(p, $tuner) ? 'sr-on' : ''}" aria-label="Delete the preset {p.name}"
          title="Delete" on:click={() => tuner.deleteMetronomePreset(p.id)}>×</button>
      </span>
    {/each}
    {#if !naming}
      <button type="button" class="{tok} save-new" on:click={() => (naming = true)}>+ Save this</button>
    {/if}
  </div>
  {#if naming}
    <form class="flex items-center gap-1.5" on:submit|preventDefault={save}>
      <!-- svelte-ignore a11y-autofocus -->
      <input
        class="flex-1 min-w-0 max-w-64 rounded-full border-2 border-sr-hairline bg-sr-panel px-3.5 py-1.5 text-base text-sr-ink focus:outline-none focus:border-sr-action"
        placeholder="Name it: Band warm-up"
        aria-label="Preset name"
        maxlength="40"
        autofocus
        bind:value={name}
        on:keydown={(e) => e.key === "Escape" && (naming = false)}
      />
      <button type="submit" class="sr-btn" disabled={!name.trim()}>Save</button>
      <button type="button" class="sr-btn-quiet" on:click={() => (naming = false)}>Cancel</button>
    </form>
    <p class="text-xs text-sr-muted">Keeps the time signature, tempo, beats, subdivision, sound, counting voice and practice settings, in this browser.</p>
  {/if}
</SettingRow>

<style>
  .save-new {
    background: transparent;
    border: 2px dashed var(--sr-hairline);
  }
</style>
