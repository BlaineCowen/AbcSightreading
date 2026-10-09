<!-- The metronome's presets (metronome-presets.ts): the built-in feels, which
     keep the tempo, and the singer's own, which keep everything. A preset
     that matches what the metronome is doing now is shown as chosen. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { QUICK_PRESETS, presetSummary, type MetronomePreset } from "../../lib/tuner/metronome-presets";
  import { groupLevels, meterById } from "../../lib/tuner/meters";

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

  $: tok = `sr-tok ${compact ? "px-2 text-xs" : ""}`;
</script>

<div class="flex flex-col gap-1.5" role="group" aria-label="Metronome presets">
  <span class="text-xs text-sr-muted">Presets</span>
  <div class="flex flex-wrap items-center gap-1">
    {#each QUICK_PRESETS as p}
      <button type="button" class="{tok} {matches(p, $tuner) ? 'sr-on' : ''}" aria-pressed={matches(p, $tuner)}
        title="{p.name}, at the tempo you have" on:click={() => apply(p)}>{p.name}</button>
    {/each}
    {#if $tuner.metronomePresets.length}
      <span class="w-px h-6 bg-sr-hairline mx-1" aria-hidden="true"></span>
    {/if}
    {#each $tuner.metronomePresets as p (p.id)}
      <span class="inline-flex items-center">
        <button type="button" class="{tok} rounded-r-none {matches(p, $tuner) ? 'sr-on' : ''}" aria-pressed={matches(p, $tuner)}
          title={presetSummary(p)} on:click={() => apply(p)}>{p.name}</button>
        <button type="button" class="{tok} rounded-l-none border-l-0 px-2 text-sr-faint" aria-label="Delete the preset {p.name}"
          title="Delete" on:click={() => tuner.deleteMetronomePreset(p.id)}>×</button>
      </span>
    {/each}
    {#if !naming}
      <button type="button" class="{tok}" on:click={() => (naming = true)}>+ Save this</button>
    {/if}
  </div>
  {#if naming}
    <form class="flex items-center gap-1.5" on:submit|preventDefault={save}>
      <!-- svelte-ignore a11y-autofocus -->
      <input
        class="flex-1 min-w-0 max-w-56 rounded-full border border-sr-hairline bg-sr-panel px-3 py-1 text-sm"
        placeholder="Name it: Band warm-up"
        aria-label="Preset name"
        maxlength="40"
        autofocus
        bind:value={name}
        on:keydown={(e) => e.key === "Escape" && (naming = false)}
      />
      <button type="submit" class="{tok} sr-on" disabled={!name.trim()}>Save</button>
      <button type="button" class={tok} on:click={() => (naming = false)}>Cancel</button>
    </form>
    <p class="text-[11px] text-sr-faint">Keeps the time signature, tempo, beats, subdivision, sound, counting voice and practice settings, in this browser.</p>
  {/if}
</div>
