# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `AbcjsChoral.svelte` into a tabbed layout with a preset dropdown, a sticky playback bar with live BPM and voice mutes, and print/PDF export — making the app competitive with SightReadingFactory.com while preserving all generation depth.

**Architecture:** Extract three new components (`PlaybackBar.svelte`, `PresetDropdown.svelte`) and one new module (`preset-storage.ts`), then restructure `AbcjsChoral.svelte` to use them. State that was local to `handleClick` (synthControl, renderedTune) is hoisted to component scope so the playback bar can control playback independently.

**Tech Stack:** Svelte 5, abcjs (synth + render), Tone.js (accessed via `Tone.Transport` for live BPM), TailwindCSS, localStorage for preset persistence.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/preset-storage.ts` | Create | localStorage CRUD for user-saved presets |
| `src/components/PlaybackBar.svelte` | Create | Sticky playback controls: transport, BPM, voice mutes, share, print |
| `src/components/PresetDropdown.svelte` | Create | Preset selector dropdown grouping UIL, difficulty, and saved presets |
| `src/components/AbcjsChoral.svelte` | Modify | Restructure into tab layout; integrate all new components |
| `src/styles/globals.css` | Modify | Add `@media print` rules |

---

## Task 1: Preset Storage Module

**Files:**
- Create: `src/lib/preset-storage.ts`

- [ ] **Step 1: Create the module**

```typescript
// src/lib/preset-storage.ts
const STORAGE_KEY = 'abcsr_presets';

export interface PresetParams {
  key: string;
  timeSig: string;
  voicing: string;
  measures: number;
  maxSkip: number;
  bpm: number;
  selectedRhythmNames: string[];
  allowedChordNames: string[] | undefined;
  nctProbability: number;
  voiceRanges: Record<string, [number, number]>;
}

export interface SavedPreset {
  id: string;
  name: string;
  createdAt: number;
  params: PresetParams;
}

export function getPresets(): SavedPreset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function savePreset(name: string, params: PresetParams): SavedPreset {
  const presets = getPresets();
  const preset: SavedPreset = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    createdAt: Date.now(),
    params,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...presets, preset]));
  return preset;
}

export function deletePreset(id: string): void {
  const presets = getPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function renamePreset(id: string, name: string): void {
  const presets = getPresets().map((p) => (p.id === id ? { ...p, name } : p));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
```

- [ ] **Step 2: Verify types pass**

```bash
npx astro check
```

Expected: no errors in `preset-storage.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/preset-storage.ts
git commit -m "feat: add preset-storage module for localStorage preset CRUD"
```

---

## Task 2: Print Styles

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Read current globals.css to find the end of the file**

Check `src/styles/globals.css` for existing content, then append at the bottom.

- [ ] **Step 2: Add print media query**

Append to the bottom of `src/styles/globals.css`:

```css
@media print {
  /* Hide all UI chrome */
  header,
  nav,
  .preset-bar,
  .tab-panel,
  .playback-bar,
  #audio,
  .no-print {
    display: none !important;
  }

  /* Sheet music fills the page */
  #paper {
    box-shadow: none !important;
    margin: 0 !important;
    width: 100% !important;
  }

  .print-title {
    display: block !important;
  }

  body {
    background: white !important;
  }
}

/* Hidden by default, shown only on print */
.print-title {
  display: none;
  font-size: 14px;
  color: #334155;
  margin-bottom: 8px;
  text-align: center;
}
```

- [ ] **Step 3: Verify**

```bash
npx astro check
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add print media query for PDF export"
```

---

## Task 3: PlaybackBar Component

**Files:**
- Create: `src/components/PlaybackBar.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/components/PlaybackBar.svelte -->
<script lang="ts">
  export let isPlaying: boolean = false;
  export let bpm: number = 80;
  export let looping: boolean = false;
  export let voiceNames: string[] = [];
  export let mutedVoices: Set<string> = new Set();
  export let hasExercise: boolean = false;

  export let onPlay: () => void;
  export let onPause: () => void;
  export let onStop: () => void;
  export let onRestart: () => void;
  export let onBpmChange: (bpm: number) => void;
  export let onToggleLoop: () => void;
  export let onToggleMute: (voiceName: string) => void;
  export let onShare: () => void;
  export let onPrint: () => void;
</script>

<div class="playback-bar fixed bottom-0 left-0 right-0 bg-slate-800 text-slate-100 px-4 py-2 flex items-center gap-4 flex-wrap z-50 shadow-lg">
  <!-- Transport -->
  <div class="flex gap-2 items-center">
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-sm disabled:opacity-40"
      disabled={!hasExercise}
      on:click={onRestart}
      title="Restart"
    >⏮</button>

    {#if isPlaying}
      <button
        class="bg-blue-500 hover:bg-blue-400 rounded px-3 py-1 text-sm font-bold"
        on:click={onPause}
      >⏸ Pause</button>
    {:else}
      <button
        class="bg-blue-500 hover:bg-blue-400 rounded px-3 py-1 text-sm font-bold disabled:opacity-40"
        disabled={!hasExercise}
        on:click={onPlay}
      >▶ Play</button>
    {/if}

    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-sm disabled:opacity-40"
      disabled={!hasExercise}
      on:click={onStop}
      title="Stop"
    >⏹</button>

    <button
      class="rounded px-2 py-1 text-sm {looping ? 'bg-amber-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}"
      on:click={onToggleLoop}
      title="Loop"
    >🔁</button>
  </div>

  <!-- Divider -->
  <div class="w-px h-6 bg-slate-600 hidden sm:block"></div>

  <!-- BPM -->
  <div class="flex items-center gap-2">
    <span class="text-xs text-slate-400 uppercase tracking-wide">BPM</span>
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-0.5 text-sm"
      on:click={() => onBpmChange(Math.max(40, bpm - 5))}
    >−</button>
    <input
      type="range"
      min="40"
      max="200"
      value={bpm}
      on:input={(e) => onBpmChange(+(e.currentTarget as HTMLInputElement).value)}
      class="w-20 accent-blue-500"
    />
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-0.5 text-sm"
      on:click={() => onBpmChange(Math.min(200, bpm + 5))}
    >+</button>
    <span class="font-bold text-sm w-8">{bpm}</span>
  </div>

  <!-- Voice Mutes -->
  {#if voiceNames.length > 1}
    <div class="w-px h-6 bg-slate-600 hidden sm:block"></div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-slate-400 uppercase tracking-wide">Voices</span>
      {#each voiceNames as name}
        <button
          class="rounded px-2 py-1 text-xs font-bold {mutedVoices.has(name) ? 'bg-slate-600 text-slate-500 line-through' : 'bg-blue-500 text-white'}"
          on:click={() => onToggleMute(name)}
          title="{mutedVoices.has(name) ? 'Unmute' : 'Mute'} {name}"
        >{name}</button>
      {/each}
    </div>
  {/if}

  <!-- Right side -->
  <div class="flex gap-2 ml-auto">
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-xs"
      on:click={onShare}
      title="Copy share link"
    >🔗 Share</button>
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-xs"
      on:click={onPrint}
      title="Print / Save as PDF"
    >🖨 Print</button>
  </div>
</div>
```

- [ ] **Step 2: Verify**

```bash
npx astro check
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PlaybackBar.svelte
git commit -m "feat: add PlaybackBar component with transport, BPM slider, voice mutes, and print"
```

---

## Task 4: PresetDropdown Component

**Files:**
- Create: `src/components/PresetDropdown.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/components/PresetDropdown.svelte -->
<script lang="ts">
  import { getPresets, savePreset, deletePreset, renamePreset, type PresetParams, type SavedPreset } from '../lib/preset-storage';
  import { onMount } from 'svelte';

  export let activeLabel: string = '';
  export let currentParams: () => PresetParams;
  export let onSelectBuiltin: (type: 'uil' | 'difficulty', key: string) => void;
  export let onSelectSaved: (preset: SavedPreset) => void;

  let savedPresets: SavedPreset[] = [];
  let showSaveInput = false;
  let newPresetName = '';
  let renamingId: string | null = null;
  let renameValue = '';

  onMount(() => {
    savedPresets = getPresets();
  });

  function handleSave() {
    if (!newPresetName.trim()) return;
    const preset = savePreset(newPresetName.trim(), currentParams());
    savedPresets = getPresets();
    newPresetName = '';
    showSaveInput = false;
    onSelectSaved(preset);
  }

  function handleDelete(id: string) {
    deletePreset(id);
    savedPresets = getPresets();
  }

  function handleRename(id: string) {
    if (!renameValue.trim()) return;
    renamePreset(id, renameValue.trim());
    savedPresets = getPresets();
    renamingId = null;
  }
</script>

<div class="preset-bar bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-wrap no-print">
  <span class="text-xs text-slate-500 whitespace-nowrap">Quick Start:</span>

  <!-- Dropdown -->
  <div class="relative">
    <select
      class="appearance-none bg-white border border-slate-300 rounded-md px-3 py-1.5 pr-8 text-sm font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      on:change={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (!val) return;
        if (val.startsWith('uil:')) onSelectBuiltin('uil', val.slice(4));
        else if (val.startsWith('diff:')) onSelectBuiltin('difficulty', val.slice(5));
        else if (val.startsWith('saved:')) {
          const found = savedPresets.find(p => p.id === val.slice(6));
          if (found) onSelectSaved(found);
        }
        (e.target as HTMLSelectElement).value = '';
      }}
    >
      <option value="">── UIL Levels ──</option>
      <option value="uil:UIL 1">UIL 1 — Beginner choir</option>
      <option value="uil:UIL 2">UIL 2 — Easy</option>
      <option value="uil:UIL 3">UIL 3 — Medium</option>
      <option value="uil:UIL 4">UIL 4 — Hard</option>
      <option value="uil:UIL 5">UIL 5 — Advanced</option>
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
    <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▼</span>
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
      class="border border-dashed border-slate-400 text-slate-500 rounded px-2 py-1 text-xs hover:border-slate-600"
      on:click={() => showSaveInput = true}
    >+ Save Current</button>
  {/if}

  {#if activeLabel}
    <span class="text-xs text-slate-400 ml-1">Active: <strong class="text-slate-600">{activeLabel}</strong></span>
  {/if}
</div>
```

- [ ] **Step 2: Verify**

```bash
npx astro check
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PresetDropdown.svelte
git commit -m "feat: add PresetDropdown component with UIL, difficulty, and saved preset groups"
```

---

## Task 5: Restructure AbcjsChoral — Script Section

**Files:**
- Modify: `src/components/AbcjsChoral.svelte`

This task updates the `<script>` block only. The template is replaced in Task 6.

- [ ] **Step 1: Replace the entire `<script>` block with the updated version**

Replace everything between `<script lang="ts">` and the closing `</script>` (lines 1–487) with:

```typescript
import { onMount } from "svelte";
import abcjs from "abcjs";
import { chords as fullChordSet } from "../resources/chords";
import { rhythms as allRhythms } from "../resources/rhythms";
import {
  generateChoralExercise,
  type GenerateChoralParams,
} from "../lib/generateChoral";
import type { TimeSignature, PartsObject } from "../lib/types";
import { ClefType } from "../lib/types";
import type { Chord } from "../lib/types";
import type { Rhythm } from "../resources/rhythms";
import RangeSelector from "./ui/rangeSelector.svelte";
import { uilPresets } from "../lib/uil-presets";
import PlaybackBar from "./PlaybackBar.svelte";
import PresetDropdown from "./PresetDropdown.svelte";
import type { SavedPreset, PresetParams } from "../lib/preset-storage";
import { savePreset as storageSavePreset } from "../lib/preset-storage";

// ── Playback state ─────────────────────────────────────────────────────────
let synthControl: any = null;
let renderedTune: any = null;
let isPlaying = false;
let looping = false;
let mutedVoices: Set<string> = new Set();
let bpm = 60;

// ── Tab state ──────────────────────────────────────────────────────────────
type Tab = 'setup' | 'rhythm' | 'harmony' | 'ranges';
let selectedTab: Tab = 'setup';

// ── Preset state ───────────────────────────────────────────────────────────
let activePresetLabel = '';

interface Preset {
  maxSkip: number;
  rhythms: string[];
  bpm: number;
}

const builtinPresets: Record<string, Preset> = {
  Beginner: { maxSkip: 2, rhythms: ["quarter", "half", "dotHalf"], bpm: 60 },
  Intermediate: { maxSkip: 4, rhythms: ["quarter", "half", "dotHalf", "eighth", "dotQuarterEighth"], bpm: 80 },
  Advanced: { maxSkip: 6, rhythms: ["quarter", "half", "dotHalf", "eighth", "dotQuarterEighth", "eighthEighth", "dotHalfQuarter"], bpm: 100 },
};

let activeUILLevel: string | null = null;

// ── Generation parameters ──────────────────────────────────────────────────
const measureOptions = [2, 4, 8, 16];

let possibleVoicing: Record<string, PartsObject> = {
  "4 Part Mixed": {
    numofParts: 4,
    parts: {
      Soprano: { order: 3, smallName: "S", clef: ClefType.Treble, range: [14, 21], currentRange: [14, 21] },
      Alto:    { order: 2, smallName: "A", clef: ClefType.Treble, range: [12, 16], currentRange: [12, 16] },
      Tenor:   { order: 1, smallName: "T", clef: ClefType.TrebleOctaveDown, range: [7, 14], currentRange: [7, 14] },
      Bass:    { order: 0, smallName: "B", clef: ClefType.Bass, range: [2, 9], currentRange: [2, 9] },
    },
  },
  "3 Part Mixed": {
    numofParts: 3,
    parts: {
      Soprano:  { order: 2, smallName: "S", clef: ClefType.Treble, range: [15, 23], currentRange: [15, 23] },
      Alto:     { order: 1, smallName: "A", clef: ClefType.Treble, range: [14, 21], currentRange: [14, 21] },
      Baritone: { order: 0, smallName: "B", clef: ClefType.Bass, range: [6, 14], currentRange: [6, 14] },
    },
  },
  "3 Part Treble": {
    numofParts: 3,
    parts: {
      Soprano1: { order: 2, smallName: "S1", clef: ClefType.Treble, range: [15, 23], currentRange: [15, 23] },
      Soprano2: { order: 1, smallName: "S2", clef: ClefType.Treble, range: [15, 22], currentRange: [15, 22] },
      Alto:     { order: 0, smallName: "A",  clef: ClefType.Treble, range: [14, 21], currentRange: [14, 21] },
    },
  },
  "3 Part Tenor/Bass": {
    numofParts: 3,
    parts: {
      Tenor:    { order: 2, smallName: "T",  clef: ClefType.TrebleOctaveDown, range: [10, 32], currentRange: [8, 17] },
      Baritone: { order: 1, smallName: "B1", clef: ClefType.Bass, range: [0, 18], currentRange: [6, 17] },
      Bass:     { order: 0, smallName: "B2", clef: ClefType.Bass, range: [0, 15], currentRange: [4, 15] },
    },
  },
  "2 Part Treble": {
    numofParts: 2,
    parts: {
      Soprano: { order: 1, smallName: "S", clef: ClefType.Treble, range: [20, 32], currentRange: [16, 25] },
      Alto:    { order: 0, smallName: "A", clef: ClefType.Treble, range: [15, 25], currentRange: [15, 23] },
    },
  },
  Unison: {
    numofParts: 1,
    parts: {
      Unison: { order: 0, smallName: "V", clef: ClefType.Treble, range: [20, 32], currentRange: [16, 25] },
    },
  },
};

let timeSignatures: Record<string, TimeSignature> = {
  "4/4": { name: "4/4", tsPerMeasure: 32 },
  "3/4": { name: "3/4", tsPerMeasure: 24 },
  "2/4": { name: "2/4", tsPerMeasure: 16 },
};

let selectedTimeSignature = "4/4";
let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
let selectedKey = "C";
let measures = 8;
let maxSkip = 4;
const maxSkipRange = [2, 8];
let nctProbability = 0.1;
let chordProgression: Chord[] = [];
let renderedString = "";
let selectedVoicing = "4 Part Mixed";

// ── Chord state ────────────────────────────────────────────────────────────
// All chord names available; user can toggle each on/off in Harmony tab.
// UIL presets override this list when active.
const allChordNames = fullChordSet.map((c) => c.name);
let userAllowedChords: Set<string> = new Set(allChordNames);

// Grouped for Harmony tab display
const chordGroups = {
  Diatonic: ['1','2','3','4','5','5-7','6','7'],
  Inversions: ['1-6','1-64','1-7','2-6','4-6','4-64','5-6','5-64','6-6','m4'],
  'Secondary Dominants': ['5/5','5/6','5/2'],
};

// ── Rhythm state ───────────────────────────────────────────────────────────
let filterRhythms: Record<string, Rhythm> = Object.fromEntries(
  allRhythms
    .filter((r) => !r.name.includes("thirtySecond") && !r.name.toLowerCase().includes("rest"))
    .map((r) => [r.name, r])
);

let selectedRhythms: Rhythm[] = allRhythms.filter(
  (r) => ["quarter", "half", "dotHalf"].includes(r.name)
);

const rhythmSvgs = Object.fromEntries(
  allRhythms
    .filter((r) => !r.name.includes("thirtySecond") && !r.name.toLowerCase().includes("rest"))
    .map((r) => [r.name, import(`../assets/svgs/${r.name}.svg?raw`)])
);

// ── Non-default badge logic ────────────────────────────────────────────────
const DEFAULTS = {
  voicing: '4 Part Mixed', key: 'C', timeSig: '4/4', measures: 8,
  maxSkip: 4, nctProbability: 0.1,
  rhythmNames: ['quarter', 'half', 'dotHalf'],
};

$: setupDirty = selectedVoicing !== DEFAULTS.voicing || selectedKey !== DEFAULTS.key ||
  selectedTimeSignature !== DEFAULTS.timeSig || measures !== DEFAULTS.measures;
$: rhythmDirty = JSON.stringify(selectedRhythms.map(r => r.name).sort()) !==
  JSON.stringify([...DEFAULTS.rhythmNames].sort());
$: harmonyDirty = maxSkip !== DEFAULTS.maxSkip || nctProbability !== DEFAULTS.nctProbability ||
  userAllowedChords.size !== allChordNames.length;

// ── Voice names for playback bar ───────────────────────────────────────────
$: voiceNames = Object.keys(possibleVoicing[selectedVoicing]?.parts ?? {});

// ── Synth helpers ──────────────────────────────────────────────────────────
const drumBeats: Record<string, string> = {
  "4/4": "dddd 76 77 77 77 60 30 30 30",
  "3/4": "ddd 76 77 77 60 30 30",
};

async function renderTune() {
  const mod = await import("abcjs");
  const result = mod.renderAbc("paper", renderedString, { responsive: "resize", scale: 1.5 });
  return result;
}

function buildAudioParams() {
  return {
    drum: drumBeats[selectedTimeSignature] ?? '',
    drumBars: 1,
    drumIntro: 1,
  };
}

// ── URL persistence ────────────────────────────────────────────────────────
function loadParams() {
  const p = new URLSearchParams(window.location.search);
  selectedVoicing = p.get("voices") || "4 Part Mixed";
  selectedKey = p.get("key") || "C";
  measures = parseInt(p.get("measures") || "8");
  bpm = parseInt(p.get("bpm") || "60");
  const preset = p.get("preset");
  if (preset && builtinPresets[preset]) applyDifficultyPreset(preset);
}

function updateURLParams() {
  const p = new URLSearchParams();
  p.set("key", selectedKey);
  p.set("timeSig", selectedTimeSignature);
  p.set("voicing", selectedVoicing);
  p.set("measures", measures.toString());
  p.set("bpm", bpm.toString());
  window.history.replaceState({}, "", `?${p.toString()}`);
}

onMount(() => {
  selectedVoicing = "4 Part Mixed";
  loadParams();
});

// ── Preset application ─────────────────────────────────────────────────────
function applyDifficultyPreset(name: string) {
  const p = builtinPresets[name];
  if (!p) return;
  maxSkip = p.maxSkip;
  bpm = p.bpm;
  selectedRhythms = allRhythms.filter((r) => p.rhythms.includes(r.name));
  activePresetLabel = name;
  activeUILLevel = null;
}

function applyUILPreset(levelKey: string) {
  const p = uilPresets[levelKey];
  if (!p) return;
  activeUILLevel = levelKey;
  possibleKeys = p.allowedKeys;
  if (!p.allowedKeys.includes(selectedKey)) selectedKey = p.allowedKeys[0];
  selectedRhythms = allRhythms.filter(
    (r) => p.allowedRhythmNames.includes(r.name) && !r.name.toLowerCase().includes("rest")
  );
  maxSkip = p.maxSkip;
  userAllowedChords = new Set(p.allowedChordNames ?? allChordNames);
  activePresetLabel = p.label;
}

function applyBuiltinPreset(type: 'uil' | 'difficulty', key: string) {
  if (type === 'uil') applyUILPreset(key);
  else applyDifficultyPreset(key);
}

function applySavedPreset(preset: SavedPreset) {
  const { params: p } = preset;
  selectedKey = p.key;
  selectedTimeSignature = p.timeSig;
  selectedVoicing = p.voicing;
  measures = p.measures;
  maxSkip = p.maxSkip;
  bpm = p.bpm;
  selectedRhythms = allRhythms.filter((r) => p.selectedRhythmNames.includes(r.name));
  userAllowedChords = p.allowedChordNames ? new Set(p.allowedChordNames) : new Set(allChordNames);
  nctProbability = p.nctProbability;
  const ranges = p.voiceRanges;
  if (ranges && possibleVoicing[p.voicing]) {
    for (const [partName, range] of Object.entries(ranges)) {
      const part = possibleVoicing[p.voicing].parts[partName];
      if (part) part.currentRange = range;
    }
    possibleVoicing = { ...possibleVoicing };
  }
  activePresetLabel = preset.name;
  activeUILLevel = null;
}

function getCurrentParams(): PresetParams {
  return {
    key: selectedKey,
    timeSig: selectedTimeSignature,
    voicing: selectedVoicing,
    measures,
    maxSkip,
    bpm,
    selectedRhythmNames: selectedRhythms.map((r) => r.name),
    allowedChordNames: activeUILLevel ? Array.from(userAllowedChords) : undefined,
    nctProbability,
    voiceRanges: Object.fromEntries(
      Object.entries(possibleVoicing[selectedVoicing]?.parts ?? {}).map(
        ([name, part]) => [name, part.currentRange as [number, number]]
      )
    ),
  };
}

// ── Range change ───────────────────────────────────────────────────────────
function handleRangeChange(partName: string, newRange: { min: number; max: number }) {
  const part = possibleVoicing[selectedVoicing]?.parts[partName];
  if (part) {
    part.currentRange = [newRange.min, newRange.max];
    possibleVoicing = { ...possibleVoicing };
    activePresetLabel = activePresetLabel ? `${activePresetLabel} (modified)` : '';
  }
}

// ── Playback controls ──────────────────────────────────────────────────────
async function handlePlay() {
  if (!synthControl) return;
  await synthControl.play();
  isPlaying = true;
}

async function handlePause() {
  if (!synthControl) return;
  synthControl.pause();
  isPlaying = false;
}

async function handleStop() {
  if (!synthControl) return;
  synthControl.stop();
  isPlaying = false;
}

async function handleRestart() {
  if (!synthControl) return;
  synthControl.stop();
  await synthControl.play();
  isPlaying = true;
}

function handleToggleLoop() {
  looping = !looping;
}

function handleBpmChange(newBpm: number) {
  bpm = newBpm;
  // Update Tone.js transport BPM directly for live change without regenerating.
  // abcjs/synth uses Tone.Transport internally.
  try {
    // @ts-ignore — access Tone Transport via window if bundled globally
    const Tone = (window as any).Tone;
    if (Tone?.Transport) Tone.Transport.bpm.value = newBpm;
  } catch {
    // Fallback: BPM applies on next Generate
  }
}

function handleToggleMute(voiceName: string) {
  const next = new Set(mutedVoices);
  if (next.has(voiceName)) next.delete(voiceName);
  else next.add(voiceName);
  mutedVoices = next;
  // Re-init synth with updated muted voices if already playing
  if (renderedTune) initSynth(renderedTune);
}

function handleShare() {
  updateURLParams();
  navigator.clipboard.writeText(window.location.href).then(() => {
    alert('Link copied to clipboard!');
  });
}

function handlePrint() {
  window.print();
}

// ── Synth init (separated from generate so mute changes can re-use it) ─────
async function initSynth(tune: any) {
  const voicesOff = voiceNames
    .map((name, i) => (mutedVoices.has(name) ? i : -1))
    .filter((i) => i >= 0);

  const createSynth = new abcjs.synth.CreateSynth();
  synthControl = new abcjs.synth.SynthController();

  const cursorControl = {
    extraMeasuresAtBeginning: 1,
    beatSubdivisions: 2,
    onFinished: () => {
      isPlaying = false;
      if (looping && synthControl) {
        synthControl.play();
        isPlaying = true;
      }
    },
    onEvent: (event: any) => {
      if (event?.elements?.[0]?.[0]) {
        const el = event.elements[0][0] as HTMLElement;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
  };

  await createSynth.init({
    visualObj: tune,
    options: voicesOff.length ? { voicesOff } : {},
  });
  await synthControl.setTune(tune, false, buildAudioParams());
  await synthControl.load("#audio", cursorControl);
}

// ── Main generate handler ─────────────────────────────────────────────────
async function handleClick() {
  updateURLParams();

  const validRhythms = selectedRhythms.filter((r): r is Rhythm => r !== undefined);
  if (validRhythms.length === 0) {
    alert("Please select at least one rhythm.");
    return;
  }

  const params: GenerateChoralParams = {
    key: selectedKey,
    timeSig: timeSignatures[selectedTimeSignature],
    partsObject: possibleVoicing[selectedVoicing],
    measures,
    maxSkip,
    bpm,
    selectedRhythms: validRhythms,
    chords: fullChordSet,
    accidentalsByStep: true,
    nctProbability,
    allowedChordNames: userAllowedChords.size < allChordNames.length
      ? Array.from(userAllowedChords)
      : undefined,
  };

  try {
    const { abcString, chordProgression: generatedProgression } = generateChoralExercise(params);
    renderedString = abcString;
    chordProgression = generatedProgression as Chord[];

    const tune = await renderTune();
    if (!tune || tune.length === 0) throw new Error("Failed to render ABC notation.");
    tune[0].setTiming();
    renderedTune = tune[0];

    await initSynth(renderedTune);
    await synthControl.play();
    isPlaying = true;
  } catch (error: unknown) {
    console.error("Error generating exercise:", error);
    alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

- [ ] **Step 2: Verify**

```bash
npx astro check
```

Expected: no type errors. (Some `any` types are expected for abcjs internals.)

- [ ] **Step 3: Commit**

```bash
git add src/components/AbcjsChoral.svelte
git commit -m "refactor: hoist synth state to component scope and restructure generation logic"
```

---

## Task 6: Restructure AbcjsChoral — Template

**Files:**
- Modify: `src/components/AbcjsChoral.svelte`

Replace the entire template (everything after `</script>` down to the `<style>` block) with the tabbed layout. The `<style>` block at the bottom is preserved unchanged.

- [ ] **Step 1: Replace the template**

Replace the template section (starting at `<div class="w-full">` through to `</div>` before `<style>`) with:

```svelte
<div class="w-full pb-20">
  <!-- Print title (hidden on screen, shown on print) -->
  <p class="print-title">{selectedKey} major · {selectedTimeSignature} · {selectedVoicing}</p>

  <!-- Preset bar -->
  <PresetDropdown
    activeLabel={activePresetLabel}
    currentParams={getCurrentParams}
    onSelectBuiltin={applyBuiltinPreset}
    onSelectSaved={applySavedPreset}
  />

  <main class="flex flex-col items-center w-full max-w-4xl mx-auto">

    <!-- Tab panel -->
    <div class="tab-panel w-full bg-white shadow-md rounded-lg my-4 no-print">

      <!-- Tab bar -->
      <div class="flex items-center border-b border-slate-200">
        {#each (['setup', 'rhythm', 'harmony', 'ranges'] as Tab[]) as tab}
          <button
            class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              {selectedTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'}"
            on:click={() => (selectedTab = tab)}
          >
            {tab === 'setup' ? 'Setup' : tab === 'rhythm' ? 'Rhythm' : tab === 'harmony' ? 'Harmony' : 'Voice Ranges'}
            {#if tab === 'setup' && setupDirty}
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 mb-0.5 align-middle"></span>
            {:else if tab === 'rhythm' && rhythmDirty}
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 mb-0.5 align-middle"></span>
            {:else if tab === 'harmony' && harmonyDirty}
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 mb-0.5 align-middle"></span>
            {/if}
          </button>
        {/each}

        <!-- Generate button always visible in tab bar -->
        <button
          class="ml-auto mr-3 my-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg px-5 py-1.5 text-sm"
          on:click={handleClick}
        >
          ▶ Generate
        </button>
      </div>

      <!-- Tab content -->
      <div class="p-4">

        <!-- Setup Tab -->
        {#if selectedTab === 'setup'}
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Voicing</p>
              <div class="flex flex-wrap gap-2">
                {#each Object.keys(possibleVoicing) as voicing}
                  <button
                    class="px-3 py-1 rounded text-sm {selectedVoicing === voicing ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (selectedVoicing = voicing)}
                  >{voicing}</button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Key</p>
              <div class="flex flex-wrap gap-2">
                {#each possibleKeys as key}
                  <button
                    class="px-3 py-1 rounded text-sm {selectedKey === key ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (selectedKey = key)}
                  >{key}</button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Time Signature</p>
              <div class="flex gap-2">
                {#each Object.keys(timeSignatures) as ts}
                  <button
                    class="px-3 py-1 rounded text-sm {selectedTimeSignature === ts ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (selectedTimeSignature = ts)}
                  >{ts}</button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Measures</p>
              <div class="flex gap-2">
                {#each measureOptions as opt}
                  <button
                    class="px-3 py-1 rounded text-sm {measures === opt ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (measures = opt)}
                  >{opt}</button>
                {/each}
              </div>
            </div>
          </div>

        <!-- Rhythm Tab -->
        {:else if selectedTab === 'rhythm'}
          <div class="space-y-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Select Allowed Rhythms</p>
            <div class="flex flex-wrap gap-2">
              {#each Object.values(filterRhythms) as rhythm}
                <button
                  class="px-1 py-1 w-12 h-12 flex items-center justify-center rounded
                    {selectedRhythms.some((r) => r?.name === rhythm.name)
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 hover:bg-slate-200'}"
                  on:click={() => {
                    if (selectedRhythms.some((r) => r?.name === rhythm.name)) {
                      selectedRhythms = selectedRhythms.filter((r) => r?.name !== rhythm.name);
                    } else {
                      selectedRhythms = [...selectedRhythms, rhythm];
                    }
                  }}
                >
                  {#await rhythmSvgs[rhythm.name]}
                    <span class="text-xs">…</span>
                  {:then svg}
                    <span class="rhythm-icon w-full h-full flex items-center justify-center">
                      {@html svg.default}
                    </span>
                  {:catch}
                    <span class="text-xs">{rhythm.name}</span>
                  {/await}
                </button>
              {/each}
            </div>
          </div>

        <!-- Harmony Tab -->
        {:else if selectedTab === 'harmony'}
          <div class="space-y-5">
            <!-- Chord toggles -->
            {#each Object.entries(chordGroups) as [groupName, chordNames]}
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">{groupName}</p>
                <div class="flex flex-wrap gap-2">
                  {#each chordNames as chordName}
                    {@const chord = fullChordSet.find(c => c.name === chordName)}
                    {#if chord}
                      <button
                        class="px-3 py-1 rounded text-sm font-medium
                          {userAllowedChords.has(chordName)
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
                        on:click={() => {
                          const next = new Set(userAllowedChords);
                          if (next.has(chordName)) next.delete(chordName);
                          else next.add(chordName);
                          userAllowedChords = next;
                        }}
                      >{chord.symbol}</button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}

            <!-- NCT Probability -->
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Non-Chord Tone Amount</p>
              <div class="flex items-center gap-3">
                <span class="text-xs text-slate-500">None</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={nctProbability} class="w-40 accent-blue-500" />
                <span class="text-xs text-slate-500">Heavy</span>
                <span class="text-sm font-semibold">{Math.round(nctProbability * 100)}%</span>
              </div>
              <p class="text-xs text-slate-400">Passing · Neighbor · Anticipation · Appoggiatura</p>
            </div>

            <!-- Max Skip -->
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Max Melodic Skip</p>
              <div class="flex items-center gap-3">
                <button class="px-3 py-1 bg-slate-100 rounded hover:bg-slate-200"
                  on:click={() => { if (maxSkip > maxSkipRange[0]) maxSkip -= 1; }}>−</button>
                <span class="text-sm font-bold w-6 text-center">{maxSkip}</span>
                <button class="px-3 py-1 bg-slate-100 rounded hover:bg-slate-200"
                  on:click={() => { if (maxSkip < maxSkipRange[1]) maxSkip += 1; }}>+</button>
                <span class="text-xs text-slate-400">diatonic steps</span>
              </div>
            </div>
          </div>

        <!-- Voice Ranges Tab -->
        {:else if selectedTab === 'ranges'}
          {#if selectedVoicing && possibleVoicing[selectedVoicing]}
            <div class="space-y-6">
              {#each Object.entries(possibleVoicing[selectedVoicing].parts) as [partName, part]}
                <div class="space-y-1">
                  <p class="text-sm font-medium">{partName}</p>
                  <RangeSelector
                    range={{ min: part.currentRange[0], max: part.currentRange[1] }}
                    clef={part.clef}
                    onRangeChange={(newRange) => handleRangeChange(partName, newRange)}
                  />
                </div>
              {/each}
            </div>
          {/if}
        {/if}

      </div>
    </div>

    <!-- Hidden abcjs audio element -->
    <div id="audio" class="hidden"></div>

    <!-- Sheet music -->
    <div id="paper" class="bg-white rounded-lg shadow-md w-full my-2"></div>

    <!-- Chord progression display -->
    {#if chordProgression.length > 0}
      <div class="text-center mt-2 mb-4 no-print">
        <p class="text-slate-500 text-sm">{chordProgression.map((c) => c.symbol).join('  ')}</p>
      </div>
    {/if}

    <div class="h-4"></div>

  </main>

  <!-- Sticky playback bar -->
  <PlaybackBar
    {isPlaying}
    {bpm}
    {looping}
    {voiceNames}
    {mutedVoices}
    hasExercise={renderedTune !== null}
    onPlay={handlePlay}
    onPause={handlePause}
    onStop={handleStop}
    onRestart={handleRestart}
    onBpmChange={handleBpmChange}
    onToggleLoop={handleToggleLoop}
    onToggleMute={handleToggleMute}
    onShare={handleShare}
    onPrint={handlePrint}
  />
</div>
```

- [ ] **Step 2: Verify**

```bash
npx astro check
```

- [ ] **Step 3: Start dev server and smoke test**

```bash
npm run dev
```

Open `http://localhost:4321/choral-sightreading`. Verify:
- Page loads without console errors
- Preset dropdown appears with UIL and difficulty groups
- Four tabs visible (Setup / Rhythm / Harmony / Voice Ranges)
- Generate button always visible in tab bar
- Playback bar visible at bottom

- [ ] **Step 4: Commit**

```bash
git add src/components/AbcjsChoral.svelte
git commit -m "feat: restructure AbcjsChoral into tabbed layout with preset dropdown and playback bar"
```

---

## Task 7: End-to-End Verification

- [ ] **Step 1: Generate and play an exercise**

With `npm run dev` running:
1. Open `http://localhost:4321/choral-sightreading`
2. Select UIL 2 from dropdown → confirm Harmony tab chord set updates, amber dot appears if non-default
3. Click Generate → sheet music renders, playback starts automatically
4. Adjust BPM slider → tempo changes (or changes on next playback if Tone.Transport not accessible)
5. Click ⏹ Stop → click ▶ Play → plays from beginning
6. Toggle 🔁 Loop → let exercise finish → confirm it restarts
7. Click S/A/T/B mute button → confirm voice is silent
8. Save a custom preset → reload page → confirm preset appears in dropdown
9. Click 🖨 Print → confirm sheet music fills page, controls hidden

- [ ] **Step 2: Type check**

```bash
npx astro check
```

Expected: no errors.

- [ ] **Step 3: Auto-scroll check**

Generate a 16-measure exercise at 120 BPM. Confirm the score scrolls to keep the active measure cursor in view throughout playback.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete UI redesign — tabs, preset dropdown, sticky playback bar, print support"
```

---

## Known Implementation Notes

1. **Live BPM:** The `handleBpmChange` function attempts `Tone.Transport.bpm.value = newBpm` via `window.Tone`. If abcjs bundles Tone.js without exposing it globally, this will silently fall back (BPM applies on next Generate). An alternative is to call `synthControl.stop()` then re-init and `play()` on BPM change — acceptable UX for a slider.

2. **Voice mutes via `voicesOff`:** abcjs `CreateSynth.init` accepts `options: { voicesOff: number[] }` where indices match voice order. The `initSynth` function rebuilds the synth on each mute change, which causes a ~0.5s pause. This is acceptable behavior.

3. **abcjs cursor `onEvent`:** The abcjs cursor control `onEvent` callback fires per beat subdivision. Calling `scrollIntoView` per event may be frequent — the smooth behavior option limits jank. If scroll is too aggressive, debounce using a 100ms `setTimeout` guard.

4. **Chord symbol display:** The Harmony tab uses `chord.symbol` (Roman numeral string from `chords.ts`) for button labels. Verify all 21 chord objects in `src/resources/chords.ts` have non-empty `symbol` fields before assuming this works.
