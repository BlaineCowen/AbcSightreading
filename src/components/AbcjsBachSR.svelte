<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import abcjs from "abcjs";
  import { RefreshCw, Minus, Plus, TriangleAlert } from "lucide-svelte";
  import { chords as fullChordSet } from "../resources/chords";
  import { rhythms as allRhythms } from "../resources/rhythms";
  import {
    generateBachSR,
    type GenerateBachSRParams,
  } from "../lib/bach-sr/generate";
  import { BachSRGenerationError, type Violation } from "../lib/bach-sr/validate";
  import type { TimeSignature, PartsObject } from "../lib/types";
  import { ClefType } from "../lib/types";
  import type { Chord } from "../lib/types";
  import type { Rhythm } from "../resources/rhythms";
  import RangeSelector from "./ui/rangeSelector.svelte";
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

  // ── Generation parameters ──────────────────────────────────────────────────
  const measureOptions = [4, 8, 12, 16];

  let possibleVoicing: Record<string, PartsObject> = {
    "4 Part Mixed": {
      numofParts: 4,
      parts: {
        // Bach chorale norms in SOUNDED pitch. The pitch values below are
        // noteArray indices (pitch 14 = "C" written, sounds C4 in treble).
        // Each clef applies its own shift to playback, so the pitch values
        // chosen here account for that:
        //   • Treble + octave=-1 (S, A): sounded = written - 1 octave
        //     → pitch 21 = "c" sounds C4; pitch 33 = "a'" sounds A5
        //   • Treble + transpose=-12 (T): sounded = written - 1 octave
        //     → pitch 14 = "C" sounds C3; pitch 25 = "g" sounds G4
        //   • Bass + octave=-1 (B): sounded = written - 1 octave
        //     → pitch 9 = "E," sounds E2; pitch 22 = "d" sounds D4
        // Bach norms: S=C4–A5 / D4–E5, A=G3–D5 / B3–A4,
        //             T=C3–G4 / D3–D4, B=E2–D4 / G2–C4
        // Pitch values are noteArray indices. Each clef applies its own
        // playback shift on top of the abc letter:
        //   • Treble + octave=-1 (S, A): sounded = written - 1 octave
        //   • Treble + transpose=-12 (T): sounded = written - 1 octave
        //   • Bass   + octave=-1 (B):   sounded = written - 1 octave
        // The chord-tone search uses `range` as its working zone (so it
        // already corresponds to a Bach-typical sounded band), and the
        // bass-octave picker additionally prefers `currentRange` as a
        // tiebreaker among equidistant candidates.
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
  let nctProbability = 0.15;
  let accidentalsByStep = true;
  let chordProgression: Chord[] = [];
  let renderedString = "";
  let selectedVoicing = "4 Part Mixed";

  // Condensed view: 2 staves (S+A treble, T+B bass) for easier visual analysis.
  let condensedView = true;

  // Validation state. Set when the validator surfaces a hard-violation error
  // (after the reroll budget is exhausted) or soft warnings on a successful
  // generation.
  let generationError: BachSRGenerationError | null = null;
  let softWarnings: Violation[] = [];
  let attempts = 0;

  function isMinorKey(k: string): boolean { return k.endsWith('m'); }

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
    maxSkip: 4, nctProbability: 0.15,
    rhythmNames: ['quarter', 'half', 'dotHalf'],
  };

  $: setupDirty = selectedVoicing !== DEFAULTS.voicing || selectedKey !== DEFAULTS.key ||
    selectedTimeSignature !== DEFAULTS.timeSig || measures !== DEFAULTS.measures;
  $: rhythmDirty = JSON.stringify(selectedRhythms.map(r => r.name).sort()) !==
    JSON.stringify([...DEFAULTS.rhythmNames].sort());
  $: harmonyDirty = maxSkip !== DEFAULTS.maxSkip || nctProbability !== DEFAULTS.nctProbability;
  $: rangesDirty = Object.values(possibleVoicing[selectedVoicing]?.parts ?? {})
    .some(p => p.currentRange[0] !== p.range[0] || p.currentRange[1] !== p.range[1]);

  $: _currentParamSig = [
    selectedKey, selectedTimeSignature, selectedVoicing, measures, maxSkip,
    Math.round(nctProbability * 100),
    selectedRhythms.map(r => r.name).sort().join(','),
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

  /**
   * Post-process the assembled ABC for the condensed (2-staff piano-score) view.
   *  - %%score [S A] [T B]   — group voices onto two staves
   *  - V:T uses bass clef (with octave + transpose adjustments) so it appears
   *    on the SAME staff as the bass voice
   *  - V:A and V:B get stems-down so the upper voice on each staff stems up
   *    and the lower voice stems down (standard piano-score convention)
   */
  function condenseAbc(abc: string): string {
    let s = abc;
    // abcjs %%score syntax: PARENTHESES group voices onto a single staff.
    // Brackets/braces are just visual decoration and DON'T merge staves.
    s = s.replace(/^%%score\s+S\s+A\s+T\s+B/m, "%%score (S A) (T B)");
    // Stems: top voice on each staff up, bottom voice down (piano-score
    // convention). Soprano + Tenor get stems up; Alto + Bass get stems down.
    s = s.replace(/^V:S\s+clef=treble octave=-1.*$/m,
      'V:S clef=treble octave=-1 name="Soprano" snm="S" stem=up');
    s = s.replace(/^V:A\s+clef=treble octave=-1.*$/m,
      'V:A clef=treble octave=-1 name="Alto" snm="A" stem=down');
    // Tenor on bass staff: use `bass octave=-1` only — DO NOT add transpose=-12.
    // abcjs's `octave=-1` already shifts BOTH display and playback down by an
    // octave (see abc_parse_music.js:1111: el.pitch += 7 * octave). Adding
    // transpose=-12 on top double-shifts playback to one octave below the
    // intended sounding pitch.
    s = s.replace(/^V:T\s+clef=treble transpose=-12.*$/m,
      'V:T clef=bass octave=-1 name="Tenor" snm="T" stem=up');
    s = s.replace(/^V:B\s+clef=bass octave=-1.*$/m,
      'V:B clef=bass octave=-1 name="Bass" snm="B" stem=down');
    return s;
  }

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
    const abcToRender = condensedView ? condenseAbc(renderedString) : renderedString;
    const { staffwidth, measuresPerLine } = scoreLayout();
    // No `scale`: abcjs discards it when responsive:"resize" is set.
    const result = mod.renderAbc("paper", abcToRender, {
      responsive: "resize",
      staffwidth,
      wrap: { minSpacing: 1.2, maxSpacing: 2.7, preferredMeasuresPerLine: measuresPerLine },
      clickListener: handleNoteClick,
    });
    return result;
  }

  // Plays the clicked note(s) as a brief audio event. Lazy-init a small
  // synth on first click so we don't spin up audio context until needed.
  let clickSynth: any = null;
  let clickAudioContext: AudioContext | null = null;
  async function handleNoteClick(
    abcElem: any,
    _tuneNumber: any,
    _classes: any,
    _analysis: any,
    _drag: any,
    _mouseEvent: any
  ) {
    if (!abcElem || !abcElem.midiPitches || abcElem.midiPitches.length === 0) return;
    try {
      const mod = await import("abcjs");
      if (!clickAudioContext) {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        clickAudioContext = new Ctor();
      }
      if (clickAudioContext.state === "suspended") {
        await clickAudioContext.resume();
      }
      if (!clickSynth) {
        clickSynth = new mod.synth.CreateSynth();
        await clickSynth.init({
          audioContext: clickAudioContext,
          visualObj: renderedTune,
          millisecondsPerMeasure: 1000,
        });
      }
      // Play just this beat's pitches at a short duration.
      mod.synth.playEvent(
        abcElem.midiPitches,
        abcElem.midiGraceNotePitches ?? [],
        1000 // measure-ms reference; the pitches carry their own duration
      );
    } catch (err) {
      console.warn("note click playback failed:", err);
    }
  }

  function buildAudioParams() {
    return {
      drum: drumBeats[selectedTimeSignature] ?? '',
      drumBars: 1,
      drumIntro: 1,
      // Bach SR adds chord-symbol annotations above the soprano staff for
      // analysis. abcjs's synth would otherwise play these as a chordal
      // accompaniment on top of the voices — disable so playback is
      // VOICES ONLY (what the singers actually sing).
      chordsOff: true,
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
    setTimeout(() => { _presetParamSig = _currentParamSig; }, 0);
  }

  function applyBuiltinPreset(type: 'uil' | 'difficulty', key: string) {
    // UIL is hidden on Bach SR, but defensively ignore it if it ever fires.
    if (type === 'difficulty') applyDifficultyPreset(key);
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

  /** Back-to-start cues the top and leaves it there; Play starts playback. */
  function handleRestart() {
    if (!synthControl) return;
    synthControl.pause();
    synthControl.seek(0);
    isPlaying = false;
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

    const params: GenerateBachSRParams = {
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
    };

    // Reset validation state for this generation.
    generationError = null;
    softWarnings = [];

    try {
      const result = generateBachSR(params);
      renderedString = result.abcString;
      chordProgression = result.chordProgression as Chord[];
      softWarnings = result.softWarnings ?? [];
      attempts = result.attempts ?? 1;

      const tune = await renderTune();
      if (!tune || tune.length === 0) throw new Error("Failed to render ABC notation.");
      tune[0].setTiming();
      renderedTune = tune[0];

      await initSynth(renderedTune);
      generatedBpm = bpm;
    } catch (error: unknown) {
      if (error instanceof BachSRGenerationError) {
        // Validator-budget exhaustion — show structured error rather than
        // emit invalid counterpoint.
        generationError = error;
      } else {
        console.error("Error generating exercise:", error);
        alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
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
    hideUILLevels={true}
  />

  <main class="flex flex-col items-center w-full max-w-4xl mx-auto px-2 md:px-4">

    <!-- Preview banner -->
    <div class="w-full bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md px-3 py-2 mt-3 mb-2 no-print">
      <strong>Bach SR — Preview.</strong> Phase 1 currently delegates to the existing choral generator.
      Soprano-first chorale algorithm lands in Phase 2.
    </div>

    <!-- Tab panel -->
    <div class="tab-panel w-full bg-white shadow-md rounded-lg my-2 no-print">

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
                    on:click={() => (selectedKey = key)}
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

            <div class="space-y-1 col-span-1 sm:col-span-2">
              <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  bind:checked={condensedView}
                  class="accent-blue-500"
                  on:change={() => { if (renderedString) renderTune(); }}
                />
                Condensed view (2 staves: S+A treble, T+B bass) with chord symbols
              </label>
              <p class="text-xs text-slate-400">Easier for harmonic + voice-leading analysis</p>
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

        <!-- Harmony Tab — simplified (no chord-pool toggles or chromatic-frequency slider) -->
        {:else if selectedTab === 'harmony'}
          <div class="space-y-5">
            <!-- NCT Density -->
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Non-Chord Tone Density</p>
              <div class="flex flex-wrap items-center gap-3">
                <span class="text-xs text-slate-500">None</span>
                <input type="range" min="0" max="0.5" step="0.05" bind:value={nctProbability} class="w-40 accent-blue-500" />
                <span class="text-xs text-slate-500">Heavy</span>
                <span class="text-sm font-semibold">{Math.round(nctProbability * 100)}%</span>
              </div>
              <p class="text-xs text-slate-400">Suspensions · Coordinated passing · Anticipations · Neighbors</p>
            </div>

            <!-- Accidentals by Step -->
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" bind:checked={accidentalsByStep} class="accent-blue-500" />
                Chromatic tones approached &amp; resolved by step
              </label>
              <p class="text-xs text-slate-400">Sharps resolve up · Flats resolve down</p>
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
    {#if generationError}
      <div class="w-full bg-rose-50 border border-rose-300 text-rose-900 rounded-md px-4 py-3 mt-2 mb-2 no-print">
        <div class="flex items-start gap-3">
          <TriangleAlert size={20} class="shrink-0" />
          <div class="flex-1">
            <p class="font-semibold text-sm">Couldn't generate a clean exercise after {generationError.attempts} attempts.</p>
            <p class="text-xs text-rose-800 mt-1">
              The counterpoint validator rejected every candidate. Click <strong>Generate</strong> again — different
              random seeds usually succeed. Persistent failure may indicate the chord pool / voicing is too tight.
            </p>
            <details class="mt-2">
              <summary class="cursor-pointer text-xs font-medium hover:underline">Show what failed</summary>
              <div class="mt-2 max-h-40 overflow-y-auto bg-white rounded border border-rose-200 px-2 py-1 text-xs font-mono space-y-1">
                {#each generationError.violations.filter((v) => v.severity === 'hard').slice(0, 12) as v}
                  <div>
                    <span class="text-rose-600 font-semibold">{v.type}</span>
                    <span class="text-slate-500"> @ t={v.time}</span>
                    {#if v.voicePair}<span class="text-slate-700"> [voices {v.voicePair.join('+')}]</span>{/if}
                    <div class="text-slate-600 pl-3">{v.description}</div>
                  </div>
                {/each}
                {#if generationError.violations.filter((v) => v.severity === 'hard').length > 12}
                  <div class="text-slate-400">…and {generationError.violations.filter((v) => v.severity === 'hard').length - 12} more</div>
                {/if}
              </div>
            </details>
          </div>
        </div>
      </div>
    {/if}

    {#if softWarnings.length > 0 && !generationError}
      <div class="w-full bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-3 py-2 mt-2 mb-1 no-print text-xs">
        <details>
          <summary class="cursor-pointer">
            ⓘ {softWarnings.length} informational counterpoint warning{softWarnings.length === 1 ? '' : 's'}
            {#if attempts > 1} · generated on attempt #{attempts}{/if}
          </summary>
          <div class="mt-2 space-y-1 font-mono">
            {#each softWarnings.slice(0, 8) as v}
              <div>
                <span class="font-semibold">{v.type}</span> @ t={v.time}
                <div class="text-slate-600 pl-3">{v.description}</div>
              </div>
            {/each}
          </div>
        </details>
      </div>
    {/if}

    <div id="paper" class="bg-white rounded-lg shadow-md w-full my-2"></div>

    <!-- Chord progression display -->
    {#if chordProgression.length > 0}
      <div class="text-center mt-2 mb-4 no-print">
        <p class="text-slate-500 text-sm">{chordProgression.map((c) => c.symbol).join('  ')}</p>
      </div>
    {/if}

    <!-- ABC source (for copy-paste / debugging) -->
    {#if renderedString}
      <details class="w-full max-w-3xl bg-slate-50 border border-slate-200 rounded-md mt-2 mb-4 no-print">
        <summary class="px-3 py-2 text-xs font-semibold text-slate-500 cursor-pointer hover:bg-slate-100">
          ABC source (click to expand · use the Copy button to paste back here)
        </summary>
        <div class="px-3 pb-3 space-y-2">
          <textarea
            class="w-full h-48 text-xs font-mono bg-white border border-slate-300 rounded p-2"
            readonly
            on:focus={(e) => e.currentTarget.select()}
          >{renderedString}</textarea>
          <button
            class="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            on:click={() => {
              navigator.clipboard.writeText(renderedString);
            }}
          >Copy ABC</button>
        </div>
      </details>
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
