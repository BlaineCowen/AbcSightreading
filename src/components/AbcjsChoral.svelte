<script lang="ts">
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
  const allChordNames = fullChordSet.map((c) => c.name);
  let userAllowedChords: Set<string> = new Set(allChordNames);

  const chordGroups: Record<string, string[]> = {
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
</script>

<div class="w-full">
  <main class="flex flex-col items-center w-full max-w-4xl mx-auto pb-20">
    <div class="flex flex-col items-center w-full">
      <div id="audio" class="w-full flex justify-center"></div>

      <div
        class="w-full bg-white shadow-md rounded-lg p-4 my-4 transition-all duration-300"
      >
        <div class="flex justify-between items-center mb-2">
          <h2 class="text-lg font-semibold">Options</h2>
          <button
            class="p-1 hover:bg-gray-100 rounded"
            on:click={() => (showDropdown = !showDropdown)}
          >
            {#if showDropdown}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                  clip-rule="evenodd"
                />
              </svg>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
            {/if}
          </button>
        </div>

        {#if showDropdown}
          <div class="space-y-4 overflow-hidden transition-all duration-300">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Voicing</h2>
                <div class="flex flex-wrap gap-2">
                  {#each Object.keys(possibleVoicing) as voicing}
                    <button
                      class="px-3 py-1 rounded {selectedVoicing === voicing
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (selectedVoicing = voicing)}
                    >
                      {voicing}
                    </button>
                  {/each}
                </div>

                {#if selectedVoicing && possibleVoicing[selectedVoicing]}
                  <div
                    class="mt-4 space-y-4 w-full bg-gray-50 p-4 rounded-lg debug-ranges"
                  >
                    <h3 class="text-md font-semibold">Voice Ranges</h3>
                    <div class="grid gap-6">
                      {#each Object.entries(possibleVoicing[selectedVoicing].parts) as [partName, part]}
                        <div class="space-y-2 debug-range-item">
                          <h4 class="text-sm font-medium">{partName}</h4>
                          <RangeSelector
                            range={{
                              min: part.currentRange[0],
                              max: part.currentRange[1],
                            }}
                            clef={part.clef}
                            onRangeChange={(newRange) =>
                              handleRangeChange(partName, newRange)}
                          />
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Preset</h2>
                <div class="flex flex-wrap gap-2">
                  {#each Object.keys(presets) as preset}
                    <button
                      class="px-3 py-1 rounded {selectedPreset === preset
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => {
                        selectedPreset = preset;
                        applyPreset(preset);
                      }}
                    >
                      {preset}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">UIL Level</h2>
                <div class="flex flex-wrap gap-2">
                  {#each Object.keys(uilPresets) as levelKey}
                    <button
                      class="px-3 py-1 rounded {activeUILLevel === levelKey
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => {
                        if (activeUILLevel === levelKey) {
                          clearUILPreset();
                        } else {
                          applyUILPreset(levelKey);
                        }
                      }}
                    >
                      {uilPresets[levelKey].label}
                    </button>
                  {/each}
                </div>
                {#if activeUILLevel}
                  <p class="text-xs text-green-700">
                    {uilPresets[activeUILLevel].label} active — keys, chords, and rhythms restricted.
                    Target: {uilPresets[activeUILLevel].measureRange[0]}–{uilPresets[activeUILLevel].measureRange[1]} measures.
                    <button class="underline ml-1" on:click={clearUILPreset}>Clear</button>
                  </p>
                {/if}
              </div>

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Non-Chord Tone Amount</h2>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    bind:value={nctProbability}
                    class="w-40"
                  />
                  <span class="text-sm text-gray-700">{Math.round(nctProbability * 100)}%</span>
                </div>
                <p class="text-xs text-gray-500">How often chord tones are decorated with passing tones, neighbor tones, etc.</p>
              </div>

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Time Signature</h2>
                <div class="flex flex-wrap gap-2">
                  {#each Object.keys(timeSignatures) as timeSig}
                    <button
                      class="px-3 py-1 rounded {selectedTimeSignature ===
                      timeSig
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (selectedTimeSignature = timeSig)}
                    >
                      {timeSig}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Key</h2>
                <div class="flex flex-wrap gap-2">
                  {#each possibleKeys as key}
                    <button
                      class="px-3 py-1 rounded {selectedKey === key
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (selectedKey = key)}
                    >
                      {key}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Max Skip</h2>
                <div class="flex items-center gap-4">
                  <button
                    class="px-3 py-1 rounded bg-gray-100"
                    on:click={() => {
                      if (maxSkip > maxSkipRange[0]) maxSkip -= 1;
                    }}
                  >
                    -
                  </button>
                  <span>{maxSkip}</span>
                  <button
                    class="px-3 py-1 rounded bg-gray-100"
                    on:click={() => {
                      if (maxSkip < maxSkipRange[1]) maxSkip += 1;
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Measures</h2>
                <div class="flex flex-wrap gap-2">
                  {#each measureOptions as measureOpt (measureOpt)}
                    <button
                      class="px-3 py-1 rounded {measures === measureOpt
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (measures = measureOpt)}
                    >
                      {measureOpt}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-2 col-span-2">
                <h2 class="text-lg font-semibold">Rhythms</h2>
                <div class="flex flex-wrap gap-2">
                  {#each Object.values(filterRhythms) as rhythm}
                    <button
                      class="px-1 py-1 w-12 h-12 flex items-center justify-center rounded {selectedRhythms.some(
                        (r) => r?.name === rhythm.name
                      )
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => {
                        if (
                          selectedRhythms.some((r) => r?.name === rhythm.name)
                        ) {
                          selectedRhythms = selectedRhythms.filter(
                            (r) => r?.name !== rhythm.name
                          );
                        } else {
                          selectedRhythms = [...selectedRhythms, rhythm];
                        }
                      }}
                    >
                      {#await rhythmSvgs[rhythm.name]}
                        <span>...</span>
                      {:then svg}
                        <span
                          class="rhythm-icon w-full h-full flex items-center justify-center"
                        >
                          {@html svg.default}
                        </span>
                      {:catch}
                        <span>{rhythm.name}</span>
                      {/await}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/if}

        <button
          class="w-full mt-4 bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600"
          on:click={handleClick}
        >
          Generate Exercise
        </button>
      </div>

      <div id="paper" class="bg-white rounded-lg shadow-md my-4"></div>

      <div class="h-96"></div>

      {#if songPlaying}
        <div class="w-full bg-gray-200 rounded-full h-2.5 my-4">
          <div
            class="bg-blue-500 h-2.5 rounded-full"
            style="width: {progress}%"
          ></div>
        </div>
      {/if}

      {#if chordProgression.length > 0}
        <div class="text-center mt-4">
          <p class="text-gray-600">
            {chordProgression.map((chord) => chord.name).join(" ")}
          </p>
        </div>
      {/if}
    </div>
  </main>
</div>

<style>
  :global(.rhythm-icon svg) {
    width: 100%;
    height: 100%;
  }
</style>
