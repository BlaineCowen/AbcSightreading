<!-- The metronome's presets (metronome-presets.ts): the built-in feels, which
     keep the tempo, and the singer's own, which keep everything. A preset
     that matches what the metronome is doing now is shown as chosen. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { QUICK_PRESETS, presetSummary, type MetronomePreset } from "../../lib/tuner/metronome-presets";
  import { groupLevels, meterById } from "../../lib/tuner/meters";

  export let compact = false;
  export let onManual: () => void = () => {};

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
  }

  $: tok = `sr-tok ${compact ? "px-3 text-[13px]" : ""}`;
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Presets">
    {#each QUICK_PRESETS as p}
      <button type="button" class="{tok} {matches(p, $tuner) ? 'sr-on' : ''}" aria-pressed={matches(p, $tuner)}
        title="{p.name}, at the tempo you have" on:click={() => apply(p)}>{p.name}</button>
    {/each}
    {#each $tuner.metronomePresets as p (p.id)}
      <span class="inline-flex items-center">
        <button type="button" class="{tok} rounded-r-none !pr-1.5 {matches(p, $tuner) ? 'sr-on' : ''}" aria-pressed={matches(p, $tuner)}
          title={presetSummary(p)} on:click={() => apply(p)}>{p.name}</button>
        <button type="button" class="{tok} rounded-l-none !pl-2 !pr-3 {matches(p, $tuner) ? 'sr-on' : ''}" aria-label="Delete the preset {p.name}"
          title="Delete" on:click={() => tuner.deleteMetronomePreset(p.id)}>×</button>
      </span>
    {/each}
  </div>
  <form class="flex flex-wrap items-center gap-2" on:submit|preventDefault={save}>
    <label for="metro-preset-name" class="text-[13px] font-semibold text-sr-ink-2">Save this setup as</label>
    <input
      id="metro-preset-name"
      class="min-w-0 flex-1 basis-40 max-w-64 rounded-full border-2 border-sr-hairline bg-sr-panel px-3.5 py-1.5 text-base text-sr-ink focus:border-sr-action focus:outline-none"
      placeholder="Band warm-up"
      maxlength="40"
      bind:value={name}
    />
    <button type="submit" class="sr-btn" disabled={!name.trim()}>Save</button>
  </form>
  <p class="text-xs text-sr-muted">A saved preset keeps everything here, tempo included, in this browser. The built-in ones keep your tempo.</p>
</div>
