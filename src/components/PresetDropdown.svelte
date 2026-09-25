<!-- src/components/PresetDropdown.svelte -->
<script lang="ts">
  import { ChevronDown, X, Plus, Pencil } from "lucide-svelte";
  import { getPresets } from '../lib/preset-storage';
  import { listPresets, addPreset, removePreset, updateSavedPreset } from '../lib/preset-sync';
  import type { PresetParams, SavedPreset } from '../lib/preset-storage';
  import { onMount } from 'svelte';

  /** The name of the preset the settings came from, or '' for none. */
  export let activeLabel: string = '';
  /** The saved preset the settings came from, when it was one of these. */
  export let activeSavedId: string | null = null;
  /** Whether the settings have been changed since that preset was loaded. */
  export let edited: boolean = false;
  /** Puts the active preset's settings back as they were loaded. */
  export let onRevert: (() => void) | undefined = undefined;
  /** A saved preset was renamed, so the page can keep its label in step. */
  export let onRenamed: ((preset: SavedPreset<any>) => void) | undefined = undefined;
  // `any` because the settings are the caller's: choral saves PresetParams,
  // unison its own options object. The dropdown only stores and hands back.
  export let currentParams: () => PresetParams | any;
  export let onSelectBuiltin: (type: 'uil' | 'difficulty', key: string) => void = () => {};
  export let onSelectSaved: (preset: SavedPreset<any>) => void;
  export let onDelete: ((id: string, name: string) => void) | undefined = undefined;
  export let hideUILLevels: boolean = false;
  /**
   * Whether to offer the built-in UIL and difficulty presets. They are choral
   * settings, so unison turns them off and shows only what was saved there.
   */
  export let showBuiltins: boolean = true;
  /** Which list of saved presets this page reads and writes. Choral's by default. */
  export let store: string | undefined = undefined;

  let savedPresets: SavedPreset<any>[] = [];
  let showSaveInput = false;
  let newPresetName = '';
  /** Whether the list is the account's rather than this browser's. */
  let synced = false;
  /** The last thing that went wrong, shown in the bar rather than an alert. */
  let problem = '';
  let busy = false;
  /** The saved preset whose name is being edited in its chip, if any. */
  let renamingId: string | null = null;
  let renameValue = '';

  $: activeIsSaved = !!activeSavedId && savedPresets.some(p => p.id === activeSavedId);

  async function refresh() {
    try {
      ({ presets: savedPresets, synced } = await listPresets(store));
      problem = '';
    } catch (e) {
      // The account could not be reached: show this browser's presets so the
      // page still works, and say why the account's are missing.
      savedPresets = getPresets(store);
      synced = false;
      problem = 'Could not load your saved presets: ' + message(e);
    }
  }

  const message = (e: unknown) => (e instanceof Error ? e.message : 'unknown error');

  onMount(() => {
    // This browser's list at once, then the account's when it arrives.
    savedPresets = getPresets(store);
    refresh();
  });

  /**
   * Opens the name box. Saving an edited preset as a new one starts from its
   * name, since the new one is usually a variation on it.
   */
  function openSaveAs() {
    newPresetName = activeLabel ? (activeIsSaved ? `${activeLabel} (copy)` : activeLabel) : '';
    showSaveInput = true;
  }

  /** Saves the current settings over the active saved preset. */
  async function handleOverwrite() {
    if (!activeSavedId || busy) return;
    busy = true;
    try {
      const updated = await updateSavedPreset(activeSavedId, { params: currentParams() }, store);
      savedPresets = savedPresets.map(p => (p.id === updated.id ? updated : p));
      problem = '';
      // Re-apply it, so the page takes these settings as the preset's own and
      // the "edited" mark clears.
      onSelectSaved(updated);
    } catch (e) {
      problem = 'Could not save preset: ' + message(e);
    } finally {
      busy = false;
    }
  }

  function startRename(preset: SavedPreset<any>) {
    renamingId = preset.id;
    renameValue = preset.name;
  }

  async function handleRename() {
    const id = renamingId;
    const name = renameValue.trim();
    renamingId = null;
    if (!id || !name || savedPresets.find(p => p.id === id)?.name === name) return;
    try {
      const updated = await updateSavedPreset(id, { name }, store);
      savedPresets = savedPresets.map(p => (p.id === updated.id ? updated : p));
      problem = '';
      onRenamed?.(updated);
    } catch (e) {
      problem = 'Could not rename preset: ' + message(e);
    }
  }

  async function handleSave() {
    if (!newPresetName.trim() || busy) return;
    busy = true;
    try {
      const preset = await addPreset(newPresetName.trim(), currentParams(), store);
      savedPresets = [...savedPresets, preset];
      newPresetName = '';
      showSaveInput = false;
      problem = '';
      onSelectSaved(preset);
    } catch (e) {
      problem = 'Could not save preset: ' + message(e);
    } finally {
      busy = false;
    }
  }

  async function handleDelete(id: string) {
    const preset = savedPresets.find(p => p.id === id);
    if (preset && !confirm(`Delete the preset "${preset.name}"?`)) return;
    try {
      await removePreset(id, store);
      savedPresets = savedPresets.filter(p => p.id !== id);
      problem = '';
      if (preset) onDelete?.(id, preset.name);
    } catch (e) {
      problem = 'Could not delete preset: ' + message(e);
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

<div class="preset-bar bg-sr-panel border-b border-sr-hairline px-4 py-2 flex items-center gap-3 flex-wrap no-print">
  <span class="text-xs text-sr-muted whitespace-nowrap">Quick Start:</span>

  <!-- Dropdown -->
  <div class="relative">
    <select
      class="appearance-none bg-sr-raise border border-sr-hairline rounded-md px-3 py-1.5 pr-8 text-sm font-medium text-sr-ink-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sr-action"
      on:change={handleSelectChange}
    >
      <option value="" disabled selected hidden>
        {showBuiltins || savedPresets.length > 0 ? 'Choose a preset…' : 'No saved presets yet'}
      </option>
      {#if showBuiltins && !hideUILLevels}
        <option value="" disabled>── UIL Levels ──</option>
        <option value="uil:UIL 1">UIL 1 - Beginner choir</option>
        <option value="uil:UIL 2">UIL 2 - Easy</option>
        <option value="uil:UIL 3">UIL 3 - Medium</option>
        <option value="uil:UIL 4">UIL 4 - Hard</option>
        <option value="uil:UIL 5">UIL 5 - Advanced</option>
      {/if}
      {#if showBuiltins}
        <option value="" disabled>── Difficulty ──</option>
        <option value="diff:Beginner">Beginner</option>
        <option value="diff:Intermediate">Intermediate</option>
        <option value="diff:Advanced">Advanced</option>
      {/if}
      {#if savedPresets.length > 0}
        <option value="" disabled>── My Presets ──</option>
        {#each savedPresets as preset}
          <option value="saved:{preset.id}">{preset.name}</option>
        {/each}
      {/if}
    </select>
    <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sr-faint text-xs"><ChevronDown size={14} /></span>
  </div>

  {#if activeLabel}
    <span class="text-xs text-sr-faint ">Active: <strong class="text-sr-ink-2">{activeLabel}</strong>{edited ? " — edited" : ""}</span>
  {/if}

  <!-- Save input -->
  {#if showSaveInput}
    <input
      type="text"
      bind:value={newPresetName}
      placeholder="Preset name"
      class="border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-1 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-sr-action"
      on:keydown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') showSaveInput = false; }}
      autofocus
    />
    <button class="sr-btn text-sm px-2 py-1" on:click={handleSave} disabled={busy}>Save</button>
    <button class="text-sm text-sr-muted underline" on:click={() => showSaveInput = false}>Cancel</button>
  {:else if activeLabel && edited}
    <!-- The loaded preset has been changed. A saved one can take the changes;
         a built-in one cannot, so it offers only a copy. -->
    {#if activeIsSaved}
      <button
        class="sr-btn text-xs px-2 py-1"
        on:click={handleOverwrite}
        disabled={busy}
        title="Save these settings over “{activeLabel}”"
      >Save</button>
    {/if}
    <button
      class="flex items-center gap-1 border border-dashed border-sr-faint text-sr-muted rounded px-2 py-1 text-xs hover:border-sr-muted"
      on:click={openSaveAs}
    ><Plus size={14} /> Save as new…</button>
    {#if onRevert}
      <button class="text-xs text-sr-muted underline" on:click={onRevert} title="Put back the settings “{activeLabel}” was loaded with">Revert</button>
    {/if}
  {:else}
    <button
      class="flex items-center gap-1 border border-dashed border-sr-faint text-sr-muted rounded px-2 py-1 text-xs hover:border-sr-muted"
      on:click={openSaveAs}
    ><Plus size={14} /> Save Current</button>
  {/if}

  {#if savedPresets.length > 0}
    <div class="flex flex-wrap gap-1 w-full mt-1">
      {#each savedPresets as preset}
        {#if renamingId === preset.id}
          <input
            type="text"
            bind:value={renameValue}
            aria-label="New name for {preset.name}"
            class="border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-0.5 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-sr-action"
            on:keydown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') renamingId = null; }}
            on:blur={handleRename}
            autofocus
          />
        {:else}
          <span class="sr-chipline inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs {preset.id === activeSavedId ? 'ring-1 ring-sr-action' : ''}">
            <button
              type="button"
              class="text-sr-ink-2 hover:text-sr-action-fg"
              on:click={() => onSelectSaved(preset)}
            >{preset.name}</button>
            <button
              type="button"
              class="text-sr-faint hover:text-sr-ink-2 leading-none"
              on:click={() => startRename(preset)}
              title="Rename preset"
              aria-label="Rename {preset.name}"
            ><Pencil size={11} /></button>
            <button
              type="button"
              class="text-sr-faint hover:text-sr-danger leading-none"
              on:click={() => handleDelete(preset.id)}
              title="Delete preset"
              aria-label="Delete {preset.name}"
            ><X size={12} /></button>
          </span>
        {/if}
      {/each}
    </div>
  {/if}

  {#if synced}
    <span class="text-xs text-sr-faint" title="Saved to your account, so they follow you to any device">Saved to your account</span>
  {/if}

  {#if problem}
    <span class="text-xs text-sr-danger" role="alert">{problem}</span>
  {/if}

</div>
