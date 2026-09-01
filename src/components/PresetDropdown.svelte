<!-- src/components/PresetDropdown.svelte -->
<script lang="ts">
  import { ChevronDown, X, Plus } from "lucide-svelte";
  import { getPresets, savePreset, deletePreset } from '../lib/preset-storage';
  import type { PresetParams, SavedPreset } from '../lib/preset-storage';
  import { onMount } from 'svelte';

  export let activeLabel: string = '';
  export let currentParams: () => PresetParams;
  export let onSelectBuiltin: (type: 'uil' | 'difficulty', key: string) => void;
  export let onSelectSaved: (preset: SavedPreset) => void;
  export let onDelete: ((id: string, name: string) => void) | undefined = undefined;
  export let hideUILLevels: boolean = false;

  let savedPresets: SavedPreset[] = [];
  let showSaveInput = false;
  let newPresetName = '';

  onMount(() => {
    savedPresets = getPresets();
  });

  function handleSave() {
    if (!newPresetName.trim()) return;
    try {
      const preset = savePreset(newPresetName.trim(), currentParams());
      savedPresets = getPresets();
      newPresetName = '';
      showSaveInput = false;
      onSelectSaved(preset);
    } catch (e) {
      alert('Could not save preset: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  }

  function handleDelete(id: string) {
    const preset = savedPresets.find(p => p.id === id);
    try {
      deletePreset(id);
      savedPresets = getPresets();
      if (preset) onDelete?.(id, preset.name);
    } catch (e) {
      alert('Could not delete preset: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  }

  function handleSelectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const val = select.value;
    if (!val) return;
    if (val.startsWith('uil:')) onSelectBuiltin('uil', val.slice(4));
    else if (val.startsWith('diff:')) onSelectBuiltin('difficulty', val.slice(5));
    else if (val.startsWith('saved:')) {
      const found = savedPresets.find(p => p.id === val.slice(6));
      if (found) onSelectSaved(found);
    }
    select.value = '';
  }
</script>

<div class="preset-bar bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-wrap no-print">
  <span class="text-xs text-slate-500 whitespace-nowrap">Quick Start:</span>

  <!-- Dropdown -->
  <div class="relative">
    <select
      class="appearance-none bg-white border border-slate-300 rounded-md px-3 py-1.5 pr-8 text-sm font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      on:change={handleSelectChange}
    >
      <option value="" disabled selected hidden>Choose a preset…</option>
      {#if !hideUILLevels}
        <option value="" disabled>── UIL Levels ──</option>
        <option value="uil:UIL 1">UIL 1 — Beginner choir</option>
        <option value="uil:UIL 2">UIL 2 — Easy</option>
        <option value="uil:UIL 3">UIL 3 — Medium</option>
        <option value="uil:UIL 4">UIL 4 — Hard</option>
        <option value="uil:UIL 5">UIL 5 — Advanced</option>
      {/if}
      <option value="" disabled>── Difficulty ──</option>
      <option value="diff:Beginner">Beginner</option>
      <option value="diff:Intermediate">Intermediate</option>
      <option value="diff:Advanced">Advanced</option>
      {#if savedPresets.length > 0}
        <option value="" disabled>── My Presets ──</option>
        {#each savedPresets as preset}
          <option value="saved:{preset.id}">{preset.name}</option>
        {/each}
      {/if}
    </select>
    <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs"><ChevronDown size={14} /></span>
  </div>

  <!-- Save input -->
  {#if showSaveInput}
    <input
      type="text"
      bind:value={newPresetName}
      placeholder="Preset name"
      class="border border-slate-300 rounded px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
      on:keydown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') showSaveInput = false; }}
      autofocus
    />
    <button class="text-sm bg-green-600 text-white rounded px-2 py-1" on:click={handleSave}>Save</button>
    <button class="text-sm text-slate-500 underline" on:click={() => showSaveInput = false}>Cancel</button>
  {:else}
    <button
      class="flex items-center gap-1 border border-dashed border-slate-400 text-slate-500 rounded px-2 py-1 text-xs hover:border-slate-600"
      on:click={() => showSaveInput = true}
    ><Plus size={14} /> Save Current</button>
  {/if}

  {#if savedPresets.length > 0}
    <div class="flex flex-wrap gap-1 w-full mt-1">
      {#each savedPresets as preset}
        <span class="inline-flex items-center gap-1 bg-slate-100 rounded px-2 py-0.5 text-xs">
          <button
            type="button"
            class="text-slate-600 hover:text-blue-600"
            on:click={() => onSelectSaved(preset)}
          >{preset.name}</button>
          <button
            type="button"
            class="text-slate-400 hover:text-red-500 leading-none"
            on:click={() => handleDelete(preset.id)}
            title="Delete preset"
          ><X size={12} /></button>
        </span>
      {/each}
    </div>
  {/if}

  {#if activeLabel}
    <span class="text-xs text-slate-400 ml-1">Active: <strong class="text-slate-600">{activeLabel}</strong></span>
  {/if}
</div>
