<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import abcjs from "abcjs";
  import { RefreshCw, Minus, Plus } from "lucide-svelte";
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

  // ── Playback state ─────────────────────────────────────────────────────────
  let synthControl: any = null;
  let renderedTune: any = null;
  let isPlaying = false;
  let looping = false;
  let mutedVoices: Set<string> = new Set();
  let bpm = 60;
  let generatedBpm = 60;

  // ── Tab state ──────────────────────────────────────────────────────────────
  type Tab = 'setup' | 'rhythm' | 'harmony' | 'ranges';
  let selectedTab: Tab = 'setup';

  // ── Preset state ───────────────────────────────────────────────────────────
  let activePresetLabel = '';
  let _presetParamSig = '';

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
        Soprano: { order: 3, smallName: "S",  clef: ClefType.Treble,        range: [21, 35], currentRange: [25, 32] },
        Alto:    { order: 2, smallName: "A",  clef: ClefType.Treble,        range: [14, 32], currentRange: [21, 28] },
        Tenor:   { order: 1, smallName: "T",  clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [14, 23] },
        Bass:    { order: 0, smallName: "B",  clef: ClefType.Bass,          range: [2,  21], currentRange: [9,  18] },
      },
    },
    "3 Part Mixed": {
      numofParts: 3,
      parts: {
        Soprano:  { order: 2, smallName: "S",  clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
        Alto:     { order: 1, smallName: "A",  clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
        Baritone: { order: 0, smallName: "B",  clef: ClefType.Bass,   range: [2,  21], currentRange: [9,  18] },
      },
    },
    "3 Part Treble": {
      numofParts: 3,
      parts: {
        Soprano1: { order: 2, smallName: "S1", clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
        Soprano2: { order: 1, smallName: "S2", clef: ClefType.Treble, range: [18, 32], currentRange: [22, 29] },
        Alto:     { order: 0, smallName: "A",  clef: ClefType.Treble, range: [14, 30], currentRange: [21, 27] },
      },
    },
    "3 Part Tenor/Bass": {
      numofParts: 3,
      parts: {
        Tenor:    { order: 2, smallName: "T",  clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [14, 23] },
        Baritone: { order: 1, smallName: "B1", clef: ClefType.Bass,          range: [2,  18], currentRange: [6,  16] },
        Bass:     { order: 0, smallName: "B2", clef: ClefType.Bass,          range: [2,  13], currentRange: [2,  11] },
      },
    },
    "2 Part Treble": {
      numofParts: 2,
      parts: {
        Soprano: { order: 1, smallName: "S", clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
        Alto:    { order: 0, smallName: "A", clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
      },
    },
    Unison: {
      numofParts: 1,
      parts: {
        Unison: { order: 0, smallName: "V", clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
      },
    },
  };

  let timeSignatures: Record<string, TimeSignature> = {
    "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
    "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
    "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
  };

  let selectedTimeSignature = "4/4";
  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m"];
  let selectedKey = "C";
  let measures = 8;
  let maxSkip = 4;
  const maxSkipRange = [2, 8];
  const skipIntervalNames: Record<number, string> = {
    1: 'a 2nd', 2: 'a 3rd', 3: 'a 4th', 4: 'a 5th',
    5: 'a 6th', 6: 'a 7th', 7: 'an octave', 8: 'a 9th',
  };
  let nctProbability = 0.1;
  let accidentalsByStep = true;
  let chromaticFrequency = 1;
  let chordProgression: Chord[] = [];
  let renderedString = "";
  let selectedVoicing = "4 Part Mixed";

  // ── Chord state ────────────────────────────────────────────────────────────
  function isMinorKey(k: string): boolean { return k.endsWith('m'); }

  const majorChordNames = fullChordSet.filter((c) => c.mode !== 'minor').map((c) => c.name);
  const minorChordNames = fullChordSet.filter((c) => c.mode === 'minor').map((c) => c.name);
  const allChordNames = fullChordSet.map((c) => c.name); // for UIL preset compatibility

  let userAllowedChords: Set<string> = new Set(majorChordNames);

  const majorChordGroups: Record<string, string[]> = {
    Diatonic: ['1','2','3','4','5','5-7','6','7'],
    Inversions: ['1-6','1-64','2-6','4-6','4-64','5-6','5-64','6-6'],
    'Chromatic Chords': ['5/5','5/6','5/2','m4','1-7'],
  };
  const minorChordGroups: Record<string, string[]> = {
    Diatonic: ['m_i','m_iv','m_V','m_V7','m_VI','m_VII'],
    'Predominant': ['m_iid'],
    'Other': ['m_i6','m_III','m_viid'],
  };

  $: chordGroups = isMinorKey(selectedKey) ? minorChordGroups : majorChordGroups;
  $: currentModeChordNames = isMinorKey(selectedKey) ? minorChordNames : majorChordNames;

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
    userAllowedChords.size !== currentModeChordNames.length;
  $: rangesDirty = Object.values(possibleVoicing[selectedVoicing]?.parts ?? {})
    .some(p => p.currentRange[0] !== p.range[0] || p.currentRange[1] !== p.range[1]);

  $: _currentParamSig = [
    selectedKey, selectedTimeSignature, selectedVoicing, measures, maxSkip,
    Math.round(nctProbability * 100),
    selectedRhythms.map(r => r.name).sort().join(','),
    [...userAllowedChords].sort().join(','),
  ].join('|');

  $: if (_presetParamSig && _currentParamSig !== _presetParamSig && activePresetLabel) {
    activePresetLabel = '';
    _presetParamSig = '';
  }

  // ── Voice names for playback bar ───────────────────────────────────────────
  $: voiceNames = Object.keys(possibleVoicing[selectedVoicing]?.parts ?? {});

  // ── Synth helpers ──────────────────────────────────────────────────────────
  const drumBeats: Record<string, string> = {
    "4/4": "dddd 76 77 77 77 60 30 30 30",
    "3/4": "ddd 76 77 77 60 30 30",
  };

  /** Magnification is container / (staffwidth + 30), so a fixed staffwidth of
   *  ~740 renders at under half size on a phone. Measure the container instead. */
  function scoreLayout() {
    const cw = document.getElementById("paper")?.clientWidth ?? 900;
    return {
      staffwidth: Math.max(160, Math.min(740, cw - 30)),
      measuresPerLine: cw < 480 ? 2 : 4,
    };
  }

  async function renderTune() {
    const mod = await import("abcjs");
    const { staffwidth, measuresPerLine } = scoreLayout();
    // No `scale`: abcjs discards it when responsive:"resize" is set.
    const result = mod.renderAbc("paper", renderedString, {
      responsive: "resize",
      staffwidth,
      wrap: { minSpacing: 1.2, maxSpacing: 2.7, preferredMeasuresPerLine: measuresPerLine },
    });
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
    loadParams();
  });

  onDestroy(() => {
    try { synthControl?.destroy?.(); } catch {}
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
    // Use setTimeout so the signature captures post-update values
    setTimeout(() => { _presetParamSig = _currentParamSig; }, 0);
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
    if (p.voiceRanges) {
      for (const voicingDef of Object.values(possibleVoicing)) {
        for (const [partName, partDef] of Object.entries(voicingDef.parts)) {
          if (p.voiceRanges[partName]) {
            partDef.currentRange = [...p.voiceRanges[partName]];
          }
        }
      }
    }
    activePresetLabel = p.label;
    // Use setTimeout so the signature captures post-update values
    setTimeout(() => { _presetParamSig = _currentParamSig; }, 0);
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
    // Use setTimeout so the signature captures post-update values
    setTimeout(() => { _presetParamSig = _currentParamSig; }, 0);
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
      allowedChordNames: userAllowedChords.size < allChordNames.length ? Array.from(userAllowedChords) : undefined,
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
    synthControl.pause();
    synthControl.seek(0);
    isPlaying = false;
  }

  async function handleRestart() {
    if (!synthControl) return;
    synthControl.pause();
    synthControl.seek(0);
    await synthControl.play();
    isPlaying = true;
  }

  function handleToggleLoop() {
    looping = !looping;
  }

  function handleBpmChange(newBpm: number) {
    bpm = newBpm;
    if (synthControl && generatedBpm > 0) {
      try { synthControl.setWarp(Math.round((newBpm / generatedBpm) * 100)); } catch {}
    }
  }

  function handleToggleMute(voiceName: string) {
    const next = new Set(mutedVoices);
    if (next.has(voiceName)) next.delete(voiceName);
    else next.add(voiceName);
    mutedVoices = next;
    if (renderedTune) {
      if (isPlaying) { synthControl?.pause(); isPlaying = false; }
      initSynth(renderedTune);
    }
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

  // ── Synth init ─────────────────────────────────────────────────────────────
  async function initSynth(tune: any) {
    const voicesOff = voiceNames
      .map((name, i) => (mutedVoices.has(name) ? i : -1))
      .filter((i) => i >= 0);

    if (synthControl) {
      try { synthControl.destroy(); } catch {}
      synthControl = null;
    }

    synthControl = new abcjs.synth.SynthController();

    const cursorControl = {
      extraMeasuresAtBeginning: 1,
      beatSubdivisions: 2,
      onFinished: () => {
        isPlaying = false;
        if (looping && synthControl) {
          synthControl.play().then(() => { isPlaying = true; });
        }
      },
      onEvent: (event: any) => {
        if (event?.elements?.[0]?.[0]) {
          const el = event.elements[0][0] as HTMLElement;
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      },
    };

    const audioParams = { ...buildAudioParams(), ...(voicesOff.length ? { voicesOff } : {}) };
    await synthControl.setTune(tune, false, audioParams);
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
      accidentalsByStep,
      nctProbability,
      chromaticFrequency,
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
      generatedBpm = bpm;
    } catch (error: unknown) {
      console.error("Error generating exercise:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
</script>

<div class="w-full" style="padding-bottom: calc(var(--bottom-bar-h, 96px) + env(safe-area-inset-bottom, 0px) + 1rem)">
  <!-- Print title (hidden on screen, shown on print) -->
  <p class="print-title">{selectedKey} {isMinorKey(selectedKey) ? 'minor' : 'major'} · {selectedTimeSignature} · {selectedVoicing}</p>

  <!-- Preset bar -->
  <PresetDropdown
    activeLabel={activePresetLabel}
    currentParams={getCurrentParams}
    onSelectBuiltin={applyBuiltinPreset}
    onSelectSaved={applySavedPreset}
    onDelete={(id, name) => { if (name === activePresetLabel) activePresetLabel = ''; }}
  />

  <main class="flex flex-col items-center w-full max-w-4xl mx-auto px-2 md:px-4">

    <!-- Tab panel -->
    <div class="tab-panel w-full bg-white shadow-md rounded-lg my-4 no-print">

      <!-- Tab bar -->
      <div class="flex items-stretch border-b border-slate-200">
          <div class="flex items-center overflow-x-auto tab-scroll">
        {#each ['setup', 'rhythm', 'harmony', 'ranges'] as tab}
          <button
            type="button"
            class="px-4 py-3 sm:py-2 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap
              {selectedTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'}"
            on:click={() => (selectedTab = tab)}
          >
            {({'setup':'Setup','rhythm':'Rhythm','harmony':'Harmony','ranges':'Voice Ranges'})[tab] ?? tab}
            {#if (tab === 'setup' && setupDirty) || (tab === 'rhythm' && rhythmDirty) || (tab === 'harmony' && harmonyDirty) || (tab === 'ranges' && rangesDirty)}
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 mb-0.5 align-middle"></span>
            {/if}
          </button>
        {/each}
        </div>

        <!-- Generate button always visible in tab bar -->
        <button
          class="ml-auto mr-2 my-1.5 shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg px-4 py-2 text-sm"
          on:click={handleClick}
        >
          <RefreshCw size={16} /><span>Generate</span>
        </button>
      </div>

      <!-- Tab content -->
      <div class="p-4">

        <!-- Setup Tab -->
        {#if selectedTab === 'setup'}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Voicing</p>
              <div class="flex flex-wrap gap-2">
                {#each Object.keys(possibleVoicing) as voicing}
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {selectedVoicing === voicing ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
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
                    class="px-3 py-2 sm:py-1 rounded text-sm {selectedKey === key ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => {
                      const wasMinor = isMinorKey(selectedKey);
                      const nowMinor = isMinorKey(key);
                      selectedKey = key;
                      if (wasMinor !== nowMinor) {
                        userAllowedChords = new Set(nowMinor ? minorChordNames : majorChordNames);
                      }
                    }}
                  >{key}</button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Time Signature</p>
              <div class="flex flex-wrap gap-2">
                {#each Object.keys(timeSignatures) as ts}
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {selectedTimeSignature === ts ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (selectedTimeSignature = ts)}
                  >{ts}</button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Measures</p>
              <div class="flex flex-wrap gap-2">
                {#each measureOptions as opt}
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {measures === opt ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
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
                        type="button"
                        class="px-3 py-2 sm:py-1 rounded text-sm font-medium
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
              <div class="flex flex-wrap items-center gap-3">
                <span class="text-xs text-slate-500">None</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={nctProbability} class="w-40 accent-blue-500" />
                <span class="text-xs text-slate-500">Heavy</span>
                <span class="text-sm font-semibold">{Math.round(nctProbability * 100)}%</span>
              </div>
              <p class="text-xs text-slate-400">Passing · Neighbor · Anticipation · Appoggiatura</p>
            </div>

            <!-- Accidentals by Step -->
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" bind:checked={accidentalsByStep} class="accent-blue-500" />
                Chromatic tones approached &amp; resolved by step
              </label>
              <p class="text-xs text-slate-400">Sharps resolve up · Flats resolve down</p>
            </div>

            <!-- Chromatic Frequency -->
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Chromatic Chord Frequency</p>
              <div class="flex flex-wrap items-center gap-3">
                <span class="text-xs text-slate-500">Less</span>
                <input type="range" min="0" max="5" step="0.5" bind:value={chromaticFrequency} class="w-40 accent-blue-500" />
                <span class="text-xs text-slate-500">More</span>
                <span class="text-sm font-semibold">{chromaticFrequency}×</span>
              </div>
              <p class="text-xs text-slate-400">Multiplies the weight of secondary dominants &amp; other chromatic chords</p>
            </div>

            <!-- Max Skip -->
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Max Melodic Skip</p>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="px-3 py-1 bg-slate-100 rounded hover:bg-slate-200"
                  on:click={() => { if (maxSkip > maxSkipRange[0]) maxSkip -= 1; }}><Minus size={16} /></button>
                <span class="text-sm font-bold w-6 text-center">{maxSkip}</span>
                <button type="button" class="px-3 py-1 bg-slate-100 rounded hover:bg-slate-200"
                  on:click={() => { if (maxSkip < maxSkipRange[1]) maxSkip += 1; }}><Plus size={16} /></button>
                <span class="text-xs text-slate-400">{skipIntervalNames[maxSkip] ?? `${maxSkip} steps`}</span>
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

<style>
  .tab-scroll {
    scrollbar-width: none;
  }
  .tab-scroll::-webkit-scrollbar {
    display: none;
  }

  :global(.rhythm-icon svg) {
    width: 100%;
    height: 100%;
  }
</style>
