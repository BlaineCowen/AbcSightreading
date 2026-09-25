<!-- src/components/PresetDropdown.svelte -->
<script lang="ts">
  import { ChevronDown, X, Plus, Pencil, Check } from "lucide-svelte";
  import {
    classes, classesAvailable, selectedClassId, loadClasses, selectClass, createClass, setPassed,
  } from '../lib/classes';
  import { presetKeyOf } from '../lib/class-validate';
  import SignupHint from './SignupHint.svelte';
  import { uilPresets } from '../lib/uil-presets';
  import { getPresets } from '../lib/preset-storage';
  import { listPresets, addPreset, removePreset, updateSavedPreset } from '../lib/preset-sync';
  import type { PresetParams, SavedPreset } from '../lib/preset-storage';
  import { onMount, onDestroy, tick } from 'svelte';
  import { ladder, ladderStages, type LadderStep, type LadderPage } from '../lib/ladder';

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
  export let onSelectBuiltin: (levelKey: string) => void = () => {};
  /** Which page this is: a ladder step for the other page is marked as such. */
  export let page: LadderPage = 'choral';
  export let onSelectStep: (step: LadderStep) => void = () => {};
  /** The ladder step the settings came from, when they came from one. */
  export let activeStepId: string | null = null;
  export let onSelectSaved: (preset: SavedPreset<any>) => void;
  export let onDelete: ((id: string, name: string) => void) | undefined = undefined;
  export let hideUILLevels: boolean = false;
  /**
   * Whether to offer the UIL levels. They are choral settings, so unison turns
   * them off. The ladder is offered on both pages; it spans both.
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
  /** Just saved a preset to this browser only - the moment an account helps. */
  let savedLocally = false;
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
    loadClasses().catch((e) => (problem = 'Could not load your classes: ' + message(e)));
  });

  // ── Classes: who is being taught, and what they have passed ─────────────
  $: selectedClass = $classes.find(c => c.id === $selectedClassId) ?? null;
  $: activeUILKey = Object.entries(uilPresets).find(([, p]) => p.label === activeLabel)?.[0];
  /** What the loaded settings would be marked passed as, if anything. */
  $: activeKey = activeStepId ? presetKeyOf.step(activeStepId)
    : activeIsSaved && activeSavedId ? presetKeyOf.saved(activeSavedId)
    : activeUILKey ? presetKeyOf.uil(activeUILKey)
    : null;
  $: passed = (key: string) => !!selectedClass?.passed[key];
  /**
   * Where the class goes next: the step after the furthest one it has passed.
   * Not the first one unpassed - a class that came in at three parts has not
   * failed rhythm alone, it skipped it.
   */
  $: nextStepId = selectedClass
    ? (() => {
        let furthest = -1;
        ladder.forEach((s, i) => { if (selectedClass!.passed[presetKeyOf.step(s.id)]) furthest = i; });
        return ladder[furthest + 1]?.id ?? null;
      })()
    : null;

  let addingClass = false;
  let newClassName = '';

  async function onClassChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    if (value === '__new') {
      addingClass = true;
      newClassName = '';
      return;
    }
    selectClass(value || null);
  }

  async function handleAddClass() {
    const name = newClassName.trim();
    if (!name) { addingClass = false; return; }
    try {
      const created = await createClass(name);
      selectClass(created.id);
      addingClass = false;
      problem = '';
    } catch (e) {
      problem = 'Could not add the class: ' + message(e);
    }
  }

  async function togglePassed() {
    if (!selectedClass || !activeKey) return;
    try {
      await setPassed(selectedClass.id, activeKey, !passed(activeKey));
      problem = '';
    } catch (e) {
      problem = 'Could not save that: ' + message(e);
    }
  }

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
      savedLocally = !synced;
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

  // ── The picker panel ─────────────────────────────────────────────────────
  type Tab = 'steps' | 'uil' | 'mine';
  let open = false;
  let tab: Tab = 'steps';
  let root: HTMLElement;
  let panel: HTMLElement;

  $: uilOffered = showBuiltins && !hideUILLevels;
  $: tabs = [
    { id: 'steps', label: 'Step by step' },
    ...(uilOffered ? [{ id: 'uil', label: 'UIL levels' }] : []),
    { id: 'mine', label: `My presets${savedPresets.length ? ` (${savedPresets.length})` : ''}` },
  ] as { id: Tab; label: string }[];

  const UIL_NOTES: Record<string, string> = {
    'UIL 1': 'I, IV, V · C, F and G major · whole, half and quarter notes',
    'UIL 2': '+ V7, D major, dotted quarter-eighth',
    'UIL 3': '+ ii, vi, Bb major, eighth pairs, dotted halves',
    'UIL 4': '+ secondary dominants, up to 3 sharps or flats',
    'UIL 5': '+ minor keys, sixteenths, up to 4 sharps or flats',
  };

  /** Opens on the tab the active preset is in, and scrolls it into view. */
  async function openPanel() {
    tab = activeStepId ? 'steps' : activeIsSaved ? 'mine'
      : uilOffered && Object.values(uilPresets).some(p => p.label === activeLabel) ? 'uil'
      : tab;
    open = true;
    await tick();
    // Scroll the list, not the page: scrollIntoView moves every scrolling
    // ancestor, and took the page's heading off the top of the screen.
    const list = panel?.querySelector<HTMLElement>('[role="tabpanel"]');
    const current = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (list && current) {
      list.scrollTop = current.offsetTop - list.offsetTop - list.clientHeight / 2 + current.clientHeight / 2;
    }
    panel?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }

  function close() {
    open = false;
    renamingId = null;
  }

  function choose(fn: () => void) {
    fn();
    close();
  }

  function onDocPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      close();
      root?.querySelector<HTMLElement>('.preset-trigger')?.focus();
    }
  }
  onMount(() => {
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
  });
  onDestroy(() => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', onDocPointer);
    document.removeEventListener('keydown', onKey);
  });

  /** Arrow keys move between the tabs, as a tab list should. */
  function onTabKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex(t => t.id === tab);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    tab = next.id;
    tick().then(() => panel?.querySelector<HTMLElement>(`#preset-tab-${next.id}`)?.focus());
  }
</script>

<div bind:this={root} class="preset-bar relative bg-sr-panel border-b border-sr-hairline px-4 py-2 flex items-center gap-3 flex-wrap no-print">
  <!-- The trigger names what is loaded; the panel below is where to choose. -->
  <button
    type="button"
    class="preset-trigger inline-flex items-center gap-2 bg-sr-raise border border-sr-hairline rounded-md px-3 py-1.5 text-sm text-sr-ink-2 hover:border-sr-faint focus:outline-none focus:ring-2 focus:ring-sr-action max-w-full"
    aria-haspopup="dialog"
    aria-expanded={open}
    on:click={() => (open ? close() : openPanel())}
  >
    <span class="text-xs text-sr-muted">Preset</span>
    <span class="font-medium truncate">{activeLabel || 'Choose…'}</span>
    {#if edited}<span class="text-xs text-sr-brass">edited</span>{/if}
    <ChevronDown size={14} class="text-sr-faint shrink-0" />
  </button>

  {#if $classesAvailable}
    <!-- The class being taught. Its passes show in the picker, and the loaded
         preset can be marked passed for it. -->
    {#if addingClass}
      <input
        type="text"
        bind:value={newClassName}
        placeholder="Class name, e.g. Varsity Treble"
        aria-label="Name for the new class"
        class="border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-1 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-sr-action"
        on:keydown={(e) => { if (e.key === 'Enter') handleAddClass(); if (e.key === 'Escape') { e.stopPropagation(); addingClass = false; } }}
        autofocus
      />
      <button class="sr-btn text-sm px-2 py-1" on:click={handleAddClass}>Add</button>
      <button class="text-sm text-sr-muted underline" on:click={() => (addingClass = false)}>Cancel</button>
    {:else}
      <label class="inline-flex items-center gap-1 text-xs text-sr-muted">
        Class
        <select
          class="bg-sr-raise border border-sr-hairline rounded-md px-2 py-1 text-sm text-sr-ink-2 focus:outline-none focus:ring-2 focus:ring-sr-action"
          value={$selectedClassId ?? ''}
          on:change={onClassChange}
        >
          <option value="">None</option>
          {#each $classes as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
          <option value="__new">+ New class…</option>
        </select>
      </label>
    {/if}
    {#if selectedClass && activeKey && !addingClass}
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs border {passed(activeKey) ? 'border-sr-action text-sr-action-fg bg-sr-tint' : 'border-sr-hairline text-sr-ink-2 hover:border-sr-faint'}"
        aria-pressed={passed(activeKey)}
        on:click={togglePassed}
        title={passed(activeKey) ? `Passed by ${selectedClass.name} - click to unmark` : `Mark “${activeLabel}” passed by ${selectedClass.name}`}
      >
        {#if passed(activeKey)}<Check size={13} /> Passed{:else}Mark passed{/if}
      </button>
    {/if}
  {/if}

  <!-- Save input -->
  {#if showSaveInput}
    <input
      type="text"
      bind:value={newPresetName}
      placeholder="Preset name"
      aria-label="Name for the new preset"
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
    ><Plus size={14} /> Save current</button>
  {/if}

  {#if synced}
    <span class="text-xs text-sr-faint" title="Saved to your account, so they follow you to any device">Saved to your account</span>
  {:else if savedLocally}
    <SignupHint id="save-preset">Saved in this browser only.</SignupHint>
  {/if}

  {#if problem}
    <span class="text-xs text-sr-danger" role="alert">{problem}</span>
  {/if}

  {#if open}
    <div
      bind:this={panel}
      class="preset-panel absolute left-4 right-4 sm:right-auto top-full mt-1 z-40 sm:w-[30rem] bg-sr-raise border border-sr-hairline rounded-lg shadow-lg flex flex-col max-h-[70vh]"
      role="dialog"
      aria-label="Choose a preset"
    >
      <div class="flex border-b border-sr-hairline px-2 pt-2 gap-1" role="tablist" aria-label="Preset lists">
        {#each tabs as t}
          <button
            id="preset-tab-{t.id}"
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="preset-list-{t.id}"
            tabindex={tab === t.id ? 0 : -1}
            class="px-3 py-1.5 text-sm rounded-t-md -mb-px border-b-2 {tab === t.id ? 'border-sr-action text-sr-action-fg font-medium' : 'border-transparent text-sr-muted hover:text-sr-ink-2'}"
            on:click={() => (tab = t.id)}
            on:keydown={onTabKey}
          >{t.label}</button>
        {/each}
      </div>

      <div class="overflow-y-auto p-2" id="preset-list-{tab}" role="tabpanel" aria-labelledby="preset-tab-{tab}">
        {#if tab === 'steps'}
          <p class="text-xs text-sr-muted px-2 pb-2">
            One new thing at a time, from a first rhythm to four parts and past UIL 5.
            {#if selectedClass}
              Showing what <strong>{selectedClass.name}</strong> has passed.
            {/if}
          </p>
          <p class="px-2 pb-1">
            <SignupHint id="ladder-classes" dismissible={false}>Track which of your classes have passed each step.</SignupHint>
          </p>
          {#each ladderStages() as { stage, steps }}
            <h3 class="text-[11px] uppercase tracking-wide text-sr-faint px-2 pt-3 pb-1">{stage}</h3>
            <ul>
              {#each steps as step}
                <li>
                  <button
                    type="button"
                    class="w-full text-left flex gap-3 items-start rounded-md px-2 py-1.5 hover:bg-sr-panel {step.id === activeStepId ? 'bg-sr-tint' : ''}"
                    aria-current={step.id === activeStepId ? 'true' : undefined}
                    on:click={() => choose(() => onSelectStep(step))}
                  >
                    {#if selectedClass && passed(presetKeyOf.step(step.id))}
                      <span class="shrink-0 w-6 h-6 rounded-full bg-sr-action text-white flex items-center justify-center" title="Passed by {selectedClass.name}"><Check size={14} /><span class="sr-only">Passed, step {step.number}</span></span>
                    {:else}
                      <span class="shrink-0 w-6 h-6 rounded-full border border-sr-hairline text-xs flex items-center justify-center text-sr-muted tabular-nums">{step.number}</span>
                    {/if}
                    <span class="flex-1 min-w-0">
                      <span class="block text-sm text-sr-ink font-medium">
                        {step.title}
                        {#if step.page !== page}
                          <span class="ml-1 text-[11px] font-normal text-sr-muted border border-sr-hairline rounded px-1">{step.page === 'unison' ? 'Unison page' : 'Choral page'}</span>
                        {/if}
                        {#if step.uil}
                          <span class="ml-1 text-[11px] font-normal text-sr-brass">≈ UIL {step.uil}</span>
                        {/if}
                        {#if step.id === nextStepId}
                          <span class="ml-1 text-[11px] font-medium text-sr-action-fg border border-sr-action rounded px-1">Next up</span>
                        {/if}
                      </span>
                      <span class="block text-xs text-sr-muted">{step.newThing}</span>
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {/each}
        {:else if tab === 'uil'}
          <ul>
            {#each Object.entries(uilPresets) as [key, level]}
              <li>
                <button
                  type="button"
                  class="w-full text-left rounded-md px-2 py-1.5 hover:bg-sr-panel {activeLabel === level.label && !activeStepId && !activeIsSaved ? 'bg-sr-tint' : ''}"
                  aria-current={activeLabel === level.label && !activeStepId && !activeIsSaved ? 'true' : undefined}
                  on:click={() => choose(() => onSelectBuiltin(key))}
                >
                  <span class="block text-sm text-sr-ink font-medium">
                    {level.label}
                    {#if selectedClass && passed(presetKeyOf.uil(key))}<Check size={13} class="inline text-sr-action-fg ml-1" /><span class="sr-only">passed</span>{/if}
                  </span>
                  <span class="block text-xs text-sr-muted">{UIL_NOTES[key] ?? ''}</span>
                </button>
              </li>
            {/each}
          </ul>
          <p class="text-xs text-sr-muted px-2 pt-2">
            What each Texas UIL level asks for. For building up to one, use Step by step.
          </p>
        {:else}
          {#if savedPresets.length === 0}
            <p class="text-sm text-sr-muted px-2 py-4">
              Nothing saved yet. Set things up the way you like, then choose
              <strong>Save current</strong>.
            </p>
            <p class="px-2 pb-2">
              <SignupHint id="presets-tab" dismissible={false}>With an account, your presets follow you to every device.</SignupHint>
            </p>
          {:else}
            <ul>
              {#each savedPresets as preset (preset.id)}
                <li class="flex items-center gap-1 rounded-md hover:bg-sr-panel {preset.id === activeSavedId ? 'bg-sr-tint' : ''}">
                  {#if renamingId === preset.id}
                    <input
                      type="text"
                      bind:value={renameValue}
                      aria-label="New name for {preset.name}"
                      class="flex-1 border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-1 text-sm m-1 focus:outline-none focus:ring-2 focus:ring-sr-action"
                      on:keydown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { e.stopPropagation(); renamingId = null; } }}
                      on:blur={handleRename}
                      autofocus
                    />
                  {:else}
                    <button
                      type="button"
                      class="flex-1 text-left text-sm text-sr-ink px-2 py-1.5 truncate"
                      aria-current={preset.id === activeSavedId ? 'true' : undefined}
                      on:click={() => choose(() => onSelectSaved(preset))}
                    >{preset.name}{#if selectedClass && passed(presetKeyOf.saved(preset.id))}<Check size={13} class="inline text-sr-action-fg ml-1" /><span class="sr-only"> passed</span>{/if}</button>
                    <button
                      type="button"
                      class="p-1.5 text-sr-faint hover:text-sr-ink-2"
                      on:click={() => startRename(preset)}
                      title="Rename"
                      aria-label="Rename {preset.name}"
                    ><Pencil size={13} /></button>
                    <button
                      type="button"
                      class="p-1.5 text-sr-faint hover:text-sr-danger"
                      on:click={() => handleDelete(preset.id)}
                      title="Delete"
                      aria-label="Delete {preset.name}"
                    ><X size={14} /></button>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if !synced}
              <p class="px-2 pt-2">
                <SignupHint id="presets-tab" dismissible={false}>These are saved in this browser only.</SignupHint>
              </p>
            {/if}
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
