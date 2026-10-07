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
  import { ladder, ladderStages, stepTitle, type LadderStep, type LadderPage } from '../lib/ladder';
  import { presetHref, storeFor } from '../lib/preset-link';
  import { levelSections, sectionToOpen, type LevelSectionId } from '../lib/preset-sections';
  import { TRACK_DOT_CLASS, trackById, trackHref, trackPresetKey } from '../lib/curriculum/tracks';
  import { loadTrackPrefs, trackPrefs } from '../lib/track-prefs';

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
  /**
   * Built-in levels for this page beside the ladder - the Unison page's NYSSMA
   * Voice levels. Empty, the tab is not shown.
   */
  export let nyssmaLevels: { id: string; label: string; short: string; summary: string }[] = [];
  /** The NYSSMA level the settings came from, if any. */
  export let activeNyssmaId: string | null = null;
  export let onSelectNyssma: (id: string) => void = () => {};
  /**
   * What the Levels tab lists is what the teacher subscribes to
   * (src/lib/curriculum/catalogue.ts, chosen on /curriculum): the built-in
   * sets, abcStepByStep by default, and the instrument tracks.
   */
  $: tracks = $trackPrefs.tracks.map((id) => trackById[id]).filter(Boolean);
  /** The track step half loaded: "track:band-trumpet-03:notes". */
  export let activeTrackKey: string | null = null;
  /** A track step; a page that cannot apply one (Choral) sends it to the Unison page. */
  export let onSelectTrack: (key: string) => void = (key) => {
    const m = /^track:(.+):(rhythm|notes)$/.exec(key);
    if (m) window.location.href = trackHref(m[1], m[2] as 'rhythm' | 'notes');
  };
  /** Whether the teacher keeps their own version of the loaded step. */
  export let ownVersion = false;
  /** Keep the settings as the teacher's own version of the step (true), or go back to the track's (false). Pro. */
  export let onKeepVersion: ((keep: boolean) => void) | undefined = undefined;

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

  /**
   * The other practice page's saved presets, listed after this page's.
   * Choosing one goes to that page, which applies it (preset-link.ts).
   */
  $: otherPage = (page === 'choral' ? 'unison' : 'choral') as 'choral' | 'unison';
  let otherPresets: SavedPreset<any>[] = [];
  const PAGE_NAME = { choral: 'Choral', unison: 'Unison' } as const;
  async function refreshOther() {
    try {
      ({ presets: otherPresets } = await listPresets(storeFor(otherPage)));
    } catch {
      otherPresets = getPresets(storeFor(otherPage));
    }
  }

  async function refresh() {
    refreshOther();
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
    otherPresets = getPresets(storeFor(otherPage));
    refresh();
    loadClasses().catch((e) => (problem = 'Could not load your classes: ' + message(e)));
    loadTrackPrefs().catch(() => {});
  });

  // ── Classes: who is being taught, and what they have passed ─────────────
  $: selectedClass = $classes.find(c => c.id === $selectedClassId) ?? null;
  $: activeUILKey = Object.entries(uilPresets).find(([, p]) => p.label === activeLabel)?.[0];
  /** What the loaded settings would be marked passed as, if anything. */
  $: activeKey = activeTrackKey ? activeTrackKey
    : activeStepId ? presetKeyOf.step(activeStepId)
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
  // Two tabs: the built-in presets (Levels), in collapsible sections, and the
  // teacher's own (My presets).
  type Tab = 'levels' | 'mine';
  let open = false;
  let tab: Tab = 'levels';
  let root: HTMLElement;
  let panel: HTMLElement;

  $: uilOffered = showBuiltins && !hideUILLevels;
  $: sections = levelSections({ uil: uilOffered, nyssma: nyssmaLevels.length > 0, tracks: tracks.length, subscribed: $trackPrefs.tracks });
  /** Where each subscribed track's class goes next: the half after the furthest one passed. */
  $: trackNext = Object.fromEntries((tracks ?? []).map((t) => {
    const halves = t.steps.flatMap((s) => [trackPresetKey(s.id, 'rhythm'), ...(s.notes ? [trackPresetKey(s.id, 'notes')] : [])]);
    let furthest = -1;
    if (selectedClass) halves.forEach((k, i) => { if (selectedClass!.passed[k]) furthest = i; });
    return [t.id, selectedClass ? halves[furthest + 1] ?? null : null];
  }));
  /** Which subscribed tracks are open in the list; the active one opens itself. */
  let openTracks: Set<string> = new Set();
  /** The Levels sections showing their presets; the rest show only a header. */
  let expanded: Set<LevelSectionId> = new Set();
  function toggleSection(id: LevelSectionId) {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    expanded = next;
  }
  $: tabs = [
    { id: 'levels', label: 'Levels' },
    { id: 'mine', label: `My presets${savedPresets.length + otherPresets.length ? ` (${savedPresets.length + otherPresets.length})` : ''}` },
  ] as { id: Tab; label: string }[];
  $: activeUILLevel = uilOffered && !activeStepId && !activeIsSaved && Object.values(uilPresets).some(p => p.label === activeLabel);

  const UIL_NOTES: Record<string, string> = {
    'UIL 1': 'I, IV, V · C, F and G major · whole, half and quarter notes',
    'UIL 2': '+ V7, D major, dotted quarter-eighth',
    'UIL 3': '+ ii, vi, Bb major, eighth pairs, dotted halves',
    'UIL 4': '+ secondary dominants, up to 3 sharps or flats',
    'UIL 5': '+ minor keys, sixteenths, up to 4 sharps or flats',
  };

  /**
   * Opens on the tab the active preset is in, with its Levels section open
   * and the others shut (all shut when no built-in preset is active), and
   * scrolls it into view.
   */
  async function openPanel() {
    const active = { step: !!activeStepId, nyssma: !!activeNyssmaId, uil: activeUILLevel, track: !!activeTrackKey };
    tab = activeStepId || activeTrackKey ? 'levels' : activeIsSaved ? 'mine'
      : activeNyssmaId || activeUILLevel ? 'levels'
      : tab;
    const activeTrack = activeTrackKey ? tracks?.find((t) => activeTrackKey!.startsWith(`track:${t.id}-`)) : undefined;
    if (activeTrack) openTracks = new Set([...openTracks, activeTrack.id]);
    const toOpen = sectionToOpen(sections, active);
    expanded = new Set(toOpen ? [toOpen] : []);
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

<div bind:this={root} class="preset-bar relative w-full flex items-center gap-3 flex-wrap no-print">
  <!-- The trigger names what is loaded; the panel below is where to choose. -->
  <button
    type="button"
    class="preset-trigger inline-flex items-center gap-2 bg-sr-mint text-sr-mint-ink rounded-full px-4 py-2 text-sm font-extrabold hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-sr-action max-w-full"
    aria-haspopup="dialog"
    aria-expanded={open}
    on:click={() => (open ? close() : openPanel())}
  >
    <span class="text-xs font-bold opacity-75">Preset</span>
    <span class="truncate">{activeLabel || 'Choose…'}</span>
    {#if edited}<span class="text-xs font-bold rounded-full bg-sr-butter text-sr-butter-ink px-2 py-0.5">edited</span>{/if}
    <ChevronDown size={14} class="shrink-0" />
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
          class="bg-sr-track border-0 rounded-full pl-3 pr-8 py-1.5 text-sm font-bold text-sr-ink-2 focus:outline-none focus:ring-2 focus:ring-sr-action"
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
        class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold {passed(activeKey) ? 'bg-sr-mint text-sr-mint-ink' : 'bg-sr-track text-sr-action-fg hover:bg-sr-tint'}"
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
    {#if activeTrackKey && onKeepVersion}
      <button
        class="sr-btn text-xs px-2 py-1"
        on:click={() => onKeepVersion?.(true)}
        title="Use these settings for this step from now on, here and in what you assign"
      >Keep as my version</button>
    {/if}
    {#if activeIsSaved}
      <button
        class="sr-btn text-xs px-2 py-1"
        on:click={handleOverwrite}
        disabled={busy}
        title="Save these settings over “{activeLabel}”"
      >Save</button>
    {/if}
    <button
      class="flex items-center gap-1 border-2 border-dashed border-sr-hairline text-sr-action-fg font-bold rounded-full px-3 py-1.5 text-xs hover:bg-sr-track"
      on:click={openSaveAs}
    ><Plus size={14} /> Save as new…</button>
    {#if onRevert}
      <button class="text-xs text-sr-muted underline" on:click={onRevert} title="Put back the settings “{activeLabel}” was loaded with">Revert</button>
    {/if}
  {:else}
    <button
      class="flex items-center gap-1 border-2 border-dashed border-sr-hairline text-sr-action-fg font-bold rounded-full px-3 py-1.5 text-xs hover:bg-sr-track"
      on:click={openSaveAs}
    ><Plus size={14} /> Save current</button>
  {/if}

  {#if activeTrackKey && ownVersion && !edited && onKeepVersion}
    <span class="text-xs text-sr-muted">Your version of this step ·
      <button class="underline" on:click={() => onKeepVersion?.(false)} title="Go back to the step as the track writes it">use the track's</button>
    </span>
  {/if}

  {#if synced}
    <span class="text-xs text-sr-faint" title="Saved to your account, so they follow you to any device">Saved to your account</span>
  {:else if savedLocally}
    <SignupHint id="save-preset">Saved in this browser only.</SignupHint>
  {/if}

  {#if problem}
    <span class="text-xs text-sr-danger" role="alert">{problem}</span>
  {/if}

  <!-- The right end of the row: the page puts the exercise counter here. -->
  <div class="ml-auto"><slot name="end" /></div>

  {#if open}
    <div
      bind:this={panel}
      class="preset-panel absolute left-0 right-0 sm:right-auto top-full mt-2 z-40 sm:w-[30rem] bg-sr-raise rounded-[24px] shadow-[0_24px_60px_-20px_rgba(30,27,58,0.45)] flex flex-col max-h-[70vh] overflow-hidden"
      role="dialog"
      aria-label="Choose a preset"
    >
      <div class="flex border-b border-sr-hairline-2 px-3 pt-3 pb-2 gap-1" role="tablist" aria-label="Preset lists">
        {#each tabs as t}
          <button
            id="preset-tab-{t.id}"
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="preset-list-{t.id}"
            tabindex={tab === t.id ? 0 : -1}
            class="px-3.5 py-1.5 text-sm rounded-full font-bold {tab === t.id ? 'bg-sr-action text-sr-action-ink' : 'text-sr-muted hover:text-sr-ink'}"
            on:click={() => (tab = t.id)}
            on:keydown={onTabKey}
          >{t.label}</button>
        {/each}
      </div>

      <div class="overflow-y-auto p-2" id="preset-list-{tab}" role="tabpanel" aria-labelledby="preset-tab-{tab}">
        {#if tab === 'levels'}
          <!-- What is listed here is what the teacher subscribes to (/curriculum). -->
          <a href="/curriculum" class="flex items-center gap-2 rounded-2xl bg-sr-tint text-sr-action-fg px-3 py-2 mb-2 text-sm font-extrabold hover:brightness-95">
            <Plus size={15} /> Choose tracks
            <span class="font-semibold text-xs text-sr-muted truncate">UIL, NYSSMA, band instruments and more</span>
          </a>
          {#if $trackPrefs.ready && sections.length === 0}
            <p class="text-sm text-sr-muted px-2 py-3">Nothing subscribed yet. Choose the tracks you teach from and they will be listed here.</p>
          {/if}
          {#each sections as section, i (section.id)}
            <!-- The whole header row opens and shuts its section. It sticks to
                 the top while its section scrolls, so it can be shut from
                 anywhere in a long list. -->
            <h3 class="sticky -top-2 z-10 bg-sr-raise {i > 0 ? 'mt-1 pt-1 border-t border-sr-hairline-2' : ''}">
              <button
                type="button"
                id="preset-section-head-{section.id}"
                class="w-full flex items-baseline gap-2 rounded-md px-2 py-2 text-left hover:bg-sr-track focus:outline-none focus-visible:ring-2 focus-visible:ring-sr-action"
                aria-expanded={expanded.has(section.id)}
                aria-controls="preset-section-{section.id}"
                on:click={() => toggleSection(section.id)}
              >
                <span class="text-sm font-extrabold text-sr-ink">{section.label}</span>
                <span class="text-xs text-sr-muted truncate">{section.note}</span>
                <ChevronDown size={16} class="ml-auto shrink-0 self-center text-sr-muted transition-transform {expanded.has(section.id) ? 'rotate-180' : ''}" />
              </button>
            </h3>
            {#if expanded.has(section.id)}
              <div id="preset-section-{section.id}" role="region" aria-labelledby="preset-section-head-{section.id}" class="pb-2">
                {#if section.id === 'steps'}
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
                    <h4 class="text-[11px] uppercase tracking-wide text-sr-faint px-2 pt-3 pb-1">{stage}</h4>
                    <ul>
                      {#each steps as step}
                        <li>
                          <button
                            type="button"
                            class="w-full text-left flex gap-3 items-start rounded-md px-2 py-1.5 hover:bg-sr-track {step.id === activeStepId ? 'bg-sr-tint' : ''}"
                            aria-current={step.id === activeStepId ? 'true' : undefined}
                            on:click={() => choose(() => onSelectStep(step))}
                          >
                            {#if selectedClass && passed(presetKeyOf.step(step.id))}
                              <span class="shrink-0 w-6 h-6 rounded-full bg-sr-action text-sr-action-ink flex items-center justify-center" title="Passed by {selectedClass.name}"><Check size={14} /><span class="sr-only">Passed, step {step.number}</span></span>
                            {:else}
                              <span class="shrink-0 w-6 h-6 rounded-full border border-sr-hairline text-xs flex items-center justify-center text-sr-muted tabular-nums">{step.number}</span>
                            {/if}
                            <span class="flex-1 min-w-0">
                              <span class="block text-sm text-sr-ink font-medium">
                                {stepTitle(step)}
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
                {:else if section.id === 'tracks'}
                  {#if tracks.length}
                    {#each tracks as track (track.id)}
                      <button
                        type="button"
                        class="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sr-track"
                        aria-expanded={openTracks.has(track.id)}
                        on:click={() => { const n = new Set(openTracks); if (!n.delete(track.id)) n.add(track.id); openTracks = n; }}
                      >
                        <span class="w-2.5 h-2.5 rounded-full {TRACK_DOT_CLASS[track.color]}"></span>
                        <span class="text-sm font-bold text-sr-ink">{track.name}</span>
                        <span class="text-xs text-sr-muted">{track.level} · {track.steps.length} steps</span>
                        <ChevronDown size={14} class="ml-auto text-sr-muted transition-transform {openTracks.has(track.id) ? 'rotate-180' : ''}" />
                      </button>
                      {#if openTracks.has(track.id)}
                        <ul class="pl-2">
                          {#each track.steps as step (step.id)}
                            {#each [['rhythm', step.newRhythm], ...(step.notes ? [['notes', step.newNotes ?? '']] : [])] as [part, what]}
                              {@const key = trackPresetKey(step.id, part === 'notes' ? 'notes' : 'rhythm')}
                              <li>
                                <button
                                  type="button"
                                  class="w-full text-left flex gap-3 items-start rounded-md px-2 py-1.5 hover:bg-sr-track {key === activeTrackKey ? 'bg-sr-tint' : ''}"
                                  aria-current={key === activeTrackKey ? 'true' : undefined}
                                  on:click={() => choose(() => onSelectTrack(key))}
                                >
                                  {#if selectedClass && passed(key)}
                                    <span class="shrink-0 w-6 h-6 rounded-full bg-sr-action text-sr-action-ink flex items-center justify-center" title="Passed by {selectedClass.name}"><Check size={14} /><span class="sr-only">Passed</span></span>
                                  {:else}
                                    <span class="shrink-0 w-6 h-6 rounded-full border border-sr-hairline text-xs flex items-center justify-center text-sr-muted tabular-nums">{step.number}</span>
                                  {/if}
                                  <span class="flex-1 min-w-0">
                                    <span class="block text-sm text-sr-ink font-medium">
                                      {part === 'notes' ? 'Notes' : 'Rhythm'}{part === 'rhythm' ? `: ${step.title}` : ''}
                                      {#if key === trackNext[track.id]}
                                        <span class="ml-1 text-[11px] font-medium text-sr-action-fg border border-sr-action rounded px-1">Next up</span>
                                      {/if}
                                    </span>
                                    <span class="block text-xs text-sr-muted">{what}</span>
                                  </span>
                                </button>
                              </li>
                            {/each}
                          {/each}
                        </ul>
                      {/if}
                    {/each}
                    <p class="text-xs text-sr-muted px-2 pt-2">
                      Each step sets the instrument, its transposition and clef. Change anything and keep it as your version.
                    </p>
                  {/if}
                {:else if section.id === 'uil'}
                  <ul>
                    {#each Object.entries(uilPresets) as [key, level]}
                      <li>
                        <button
                          type="button"
                          class="w-full text-left rounded-md px-2 py-1.5 hover:bg-sr-track {activeLabel === level.label && !activeStepId && !activeIsSaved ? 'bg-sr-tint' : ''}"
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
                    What each Texas UIL level asks for. For building up to one, use abcStepByStep.
                  </p>
                {:else}
                  <ul>
                    {#each nyssmaLevels as level}
                      <li>
                        <button
                          type="button"
                          class="w-full text-left rounded-md px-2 py-1.5 hover:bg-sr-track {level.id === activeNyssmaId ? 'bg-sr-tint' : ''}"
                          aria-current={level.id === activeNyssmaId ? 'true' : undefined}
                          on:click={() => choose(() => onSelectNyssma(level.id))}
                        >
                          <span class="block text-sm text-sr-ink font-medium">{level.short}</span>
                          <span class="block text-xs text-sr-muted">{level.summary}</span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                  <p class="text-xs text-sr-muted px-2 pt-2">
                    NYSSMA solo voice sight-reading criteria (Manual, Edition 33). Each level sets keys,
                    meters, skips, rhythms, tempo and dynamics. Your clef stays, and the level's range
                    is placed from your low note. Level VI comes later.
                  </p>
                {/if}
              </div>
            {/if}
          {/each}
        {:else}
          {#if savedPresets.length === 0 && otherPresets.length === 0}
            <p class="text-sm text-sr-muted px-2 py-4">
              Nothing saved yet. Set things up the way you like, then choose
              <strong>Save current</strong>.
            </p>
            <p class="px-2 pb-2">
              <SignupHint id="presets-tab" dismissible={false}>With an account, your presets follow you to every device.</SignupHint>
            </p>
          {:else}
            {#if otherPresets.length}
              <p class="px-2 pt-1 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-sr-muted">{PAGE_NAME[page]}</p>
              {#if savedPresets.length === 0}<p class="px-2 pb-2 text-xs text-sr-muted">None saved on this page yet.</p>{/if}
            {/if}
            <ul>
              {#each savedPresets as preset (preset.id)}
                <li class="flex items-center gap-1 rounded-md hover:bg-sr-track {preset.id === activeSavedId ? 'bg-sr-tint' : ''}">
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
            {#if otherPresets.length}
              <p class="px-2 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-sr-muted">{PAGE_NAME[otherPage]}</p>
              <ul>
                {#each otherPresets as preset (preset.id)}
                  <li class="rounded-md hover:bg-sr-track">
                    <!-- A link, not a load: it opens the other page with this preset. -->
                    <a
                      class="flex items-center gap-2 text-sm text-sr-ink px-2 py-1.5"
                      href={presetHref(otherPage, preset.id)}
                      title="Opens on the {PAGE_NAME[otherPage]} page"
                    >
                      <span class="flex-1 truncate">{preset.name}{#if selectedClass && passed(presetKeyOf.saved(preset.id))}<Check size={13} class="inline text-sr-action-fg ml-1" /><span class="sr-only"> passed</span>{/if}</span>
                      <span class="shrink-0 text-[11px] font-bold text-sr-action-fg">{PAGE_NAME[otherPage]} ›</span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
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
