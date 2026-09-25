<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import abcjs from "abcjs";
  import type { TimingCallbacks } from "abcjs";
  import RangeSelector from "./ui/rangeSelector.svelte";
  import { rhythms, type Rhythm } from "../resources/rhythms";
  import { PracticeRunner, rampEndBpm, passOverride, type PassSwitch } from "../lib/practice-run";
  import { rhythmLabel } from "../lib/rhythm-labels";
  import {
    firstSystemScrollTarget,
    worthScrolling,
    targetMoved,
  } from "../lib/scroll-to-system";
  import { assembleUnisonAbc, type UnisonScore } from "../lib/generateUnison";
  import { mySyllables, syllablesAvailable, loadMySyllables } from "../lib/syllable-prefs";
  import {
    packExercise,
    unpackExercise,
    exerciseParam,
    exerciseFragment,
    linkProblemMessage,
    PAGE_FOR,
  } from "../lib/exercise-link";
  import { abcToMusicXml } from "../lib/musicxml";
  import {
    EXPORT_TYPES,
    exportFileName,
    keyAndMeterOf,
    midiFileFor,
    withTempo,
    type ExportType,
  } from "../lib/exports";
  import { downloadFile } from "../lib/download";
  import type { LyricSystem } from "../resources/solfege";
  import PresetDropdown from "./PresetDropdown.svelte";
  import TunerWidget from "./tuner/TunerWidget.svelte";
  import SignupHint from "./SignupHint.svelte";
  import { UNISON_PRESET_STORE, type SavedPreset } from "../lib/preset-storage";
  import { ladderById, rangeForStep, stepHref, stepLabel, STEP_PARAM, type LadderStep } from "../lib/ladder";
  import { selectableRhythms, rhythmPickerGroups } from "../lib/selectable-rhythms";
  import {
    crossedWholeBeat,
    metronomeClickFor,
    newMetronomeBeatState,
  } from "../lib/metronome-beats";
  import * as Tone from "tone";
  import MetronomeIcon from "./ui/metronomeIcon.svelte";
  import { Piano, Minus, Plus, RefreshCw, ChevronDown, ChevronRight } from "lucide-svelte";
  import PlaybackBar from "./PlaybackBar.svelte";
  import {
    defaultSyllableSystem,
    isSyllableSystemId,
    syllableSystems,
    CUSTOM_SYLLABLE_ID,
    customSyllableSystem,
  } from "../resources/rhythm-syllables";
  import "abcjs/abcjs-audio.css";
  import { withoutLyrics, withoutQuotedText } from "../lib/annotations";
  import {
    clampTranspose,
    transposeLabel,
    MIN_TRANSPOSE,
    MAX_TRANSPOSE,
  } from "../lib/transpose";
  import {
    RHYTHM_SOUNDS,
    DEFAULT_RHYTHM_SOUND,
    isRhythmSoundId,
    rhythmSoundFor,
    withRhythmSound,
    volumeMultiplierFor,
  } from "../lib/rhythm-sounds";
  import {
    INSTRUMENTS,
    DEFAULT_INSTRUMENT,
    isInstrumentProgram,
    withInstrument,
  } from "../lib/instruments";
  // import PitchVisualizer from "./PitchVisualizer.svelte";

  // --- Static Options ---
  const possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
  const timeSignatures = {
    "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
    "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
    "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
  };
  const clefOptions = ["treble", "bass", "alto", "tenor"];
  /** Off draws nothing; smooth glides with the music; note lands on each note. */
  const cursorModes = ["off", "smooth", "beat", "note"] as const;
  type CursorMode = (typeof cursorModes)[number];
  const cursorModeLabels: Record<CursorMode, string> = {
    off: "Off",
    smooth: "Smooth",
    beat: "Beat by beat",
    note: "Note by note",
  };
  const isCursorMode = (v: unknown): v is CursorMode =>
    typeof v === "string" && (cursorModes as readonly string[]).includes(v);
  /** Whole beat the metronome last sounded; see src/lib/metronome-beats.ts. */
  let metronomeBeats = newMetronomeBeatState();
  /** Tracked separately, since the metronome can be off while the cursor steps. */
  let cursorBeats = newMetronomeBeatState();
  const scaleDegrees = [1, 2, 3, 4, 5, 6, 7];
  const sharpScaleDegrees = [
    { display: "♯1", value: 1 },
    { display: "♯2", value: 2 },
    { display: "♯4", value: 4 },
    { display: "♯5", value: 5 },
    { display: "♯6", value: 6 },
  ];
  const flatScaleDegrees = [
    { display: "♭2", value: 2 },
    { display: "♭3", value: 3 },
    { display: "♭5", value: 5 },
    { display: "♭6", value: 6 },
    { display: "♭7", value: 7 },
  ];
  const measureOptions = [1, 2, 4, 8, 12, 16];
  /**
   * The treble range a first visit starts with: middle C up an octave, C to c
   * (noteArray 14 to 21). It was F to c, five notes - too few for a chromatic
   * note to resolve in, so sharp 4 in G could never be written at all.
   */
  const DEFAULT_TREBLE_RANGE = { min: 14, max: 21 };
  const maxSkipOptions = [1, 2, 3, 4, 5, 6, 7, 8];

  // ── Tab state ─────────────────────────────────────────────────────────────
  type Tab = 'setup' | 'rhythm' | 'notes' | 'range';
  let selectedTab: Tab = 'setup';

  // ── Skip interval names (matches choral) ──────────────────────────────────
  const skipIntervalNames: Record<number, string> = {
    1: 'a 2nd', 2: 'a 3rd', 3: 'a 4th', 4: 'a 5th',
    5: 'a 6th', 6: 'a 7th', 7: 'an octave', 8: 'a 9th',
  };

  // Audio and playback state
  let currentTune: any = null;
  let timingCallbacks: TimingCallbacks | null = null;
  let isPlaying = false;
  let looping = false;
  let createSynth: any = null;

  // Add loading state
  let isLoading = false;
  let error: string | null = null;

  // --- NEW WEB AUDIO API STATE ---
  let audioContext: AudioContext;
  let gainNode: GainNode; // For the main instrument
  let metronomeGainNode: GainNode; // For the metronome
  let sourceNode: AudioBufferSourceNode | null = null;
  let audioBuffer: AudioBuffer | null = null; // We will store the generated audio here
  let startTime = 0;
  let pausedAt = 0;
  let masterVolume = 0.5; // Master volume, 0-1
  let isMuted = false;
  let previousVolume = masterVolume; // To restore volume after unmuting
  let isMetronomeOn = true;
  let metronomeVolume = 0.5;

  // Standalone metronome: clicks on its own, with no playback and no cursor.
  let metronomeRunning = false;
  let metronomeTimer: ReturnType<typeof setInterval> | null = null;
  let nextClickTime = 0;
  let metronomeBeat = 0;

  // Initialize Web Audio API components
  onMount(() => {
    // Astro 4 leaves a `client:only` fallback in the DOM after the island
    // hydrates - it is not swapped out - so the skeleton would sit on top of the
    // real UI forever. Take it down as soon as there is something to replace it.
    document.querySelectorAll("[data-skeleton]").forEach((el) => el.remove());
    if (typeof window !== "undefined") {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      gainNode = audioContext.createGain();
      applyInstrumentGain();
      gainNode.connect(audioContext.destination);

      metronomeGainNode = audioContext.createGain();
      metronomeGainNode.gain.value = metronomeVolume * 2;
      metronomeGainNode.connect(audioContext.destination);

      // To Tone's own output, not gainNode: toneSynth lives in Tone's
      // AudioContext and gainNode in this one, and connecting across contexts
      // throws. It threw on every load - leaving the note you click on the
      // score silent, and stopping this component's later onMount callbacks
      // (the reflow on resize, opening a linked exercise) from ever running.
      toneSynth.toDestination();
    }
  });

  function loadStateFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.toString() === "") return null; // No params, do nothing.

    const getParam = (name: string) => urlParams.get(name);
    const options: any = {};

    const clef = getParam("clef");
    if (clef && clefOptions.includes(clef)) {
      options.selectedClef = clef;
    }

    const rangeParts = getParam("range")?.split("-");
    if (rangeParts?.length === 2) {
      const min = parseInt(rangeParts[0], 10);
      const max = parseInt(rangeParts[1], 10);
      if (!isNaN(min) && !isNaN(max)) {
        options.selectedRange = { min, max };
      }
    }

    const degreesStr = getParam("scaleDegrees");
    if (degreesStr) {
      const degrees = degreesStr
        .split(",")
        .map((d) => parseInt(d, 10))
        .filter((d) => !isNaN(d) && d >= 1 && d <= 7);
      if (degrees.length > 0) {
        options.selectedScaleDegrees = degrees;
      }
    }

    const sharpDegreesStr = getParam("selectedSharpDegrees");
    if (sharpDegreesStr) {
      const degrees = sharpDegreesStr
        .split(",")
        .map((d) => parseInt(d, 10))
        .filter((d) => !isNaN(d));
      if (degrees.length > 0) {
        options.selectedSharpDegrees = degrees;
      }
    }

    const flatDegreesStr = getParam("selectedFlatDegrees");
    if (flatDegreesStr) {
      const degrees = flatDegreesStr
        .split(",")
        .map((d) => parseInt(d, 10))
        .filter((d) => !isNaN(d));
      if (degrees.length > 0) {
        options.selectedFlatDegrees = degrees;
      }
    }

    const key = getParam("key");
    if (key && possibleKeys.includes(key)) {
      options.selectedKey = key;
    }

    const rhythmNames = getParam("rhythms")?.split(",");
    if (rhythmNames) {
      const newRhythms = rhythmNames
        .map((name) => rhythms.find((r) => r.name === name))
        .map((r) => r?.name);
      if (newRhythms.length > 0) {
        options.selectedRhythms = newRhythms;
      }
    }

    const ts = getParam("timeSignature");
    if (ts && Object.keys(timeSignatures).includes(ts)) {
      options.selectedTimeSignature = ts;
    }

    const m = parseInt(getParam("measures") || "", 10);
    if (!isNaN(m) && measureOptions.includes(m)) {
      options.measures = m;
    }

    const s = parseInt(getParam("maxSkip") || "", 10);
    if (!isNaN(s) && maxSkipOptions.includes(s)) {
      options.maxSkip = s;
    }

    // The tempo slider's range. 30-120 turned a link made at 132 into one at 60.
    const b = parseInt(getParam("bpm") || "", 10);
    if (!isNaN(b) && b >= 40 && b <= 200) {
      options.bpm = b;
      options.tempo = b;
    }

    if (urlParams.has("accidentals"))
      options.accidentals = getParam("accidentals") === "true";
    if (urlParams.has("moveEighthNotes"))
      options.moveEighthNotes = getParam("moveEighthNotes") === "true";
    if (urlParams.has("accidentalsFollowStep"))
      options.accidentalsFollowStep =
        getParam("accidentalsFollowStep") === "true";
    if (urlParams.has("showSolfege"))
      options.showSolfege = getParam("showSolfege") === "true";
    const lyrics = getParam("lyrics");
    if (lyrics === "movable" || lyrics === "fixed" || lyrics === "names") {
      options.lyricSystem = lyrics;
    }
    if (urlParams.has("rhythmOnly"))
      options.rhythmOnly = getParam("rhythmOnly") === "true";
    if (urlParams.has("transpose"))
      options.transposeSemitones = clampTranspose(Number(getParam("transpose")));
    if (urlParams.has("showRhythmSyllables"))
      options.showRhythmSyllables = getParam("showRhythmSyllables") === "true";
    // A shared link carries the clean copy - that is the point of it.
    const rs = getParam("rhythmSound");
    if (isRhythmSoundId(rs)) options.rhythmSoundId = rs;
    const inst = getParam("sound");
    if (isInstrumentProgram(inst)) options.instrumentProgram = Number(inst);

    if (urlParams.has("allowTiesAcrossBarline"))
      options.allowTiesAcrossBarline =
        getParam("allowTiesAcrossBarline") === "true";

    const cursor = getParam("cursor");
    if (isCursorMode(cursor)) {
      options.cursorMode = cursor;
    }

    const syllableSystem = getParam("syllableSystem");
    if (isChosenSyllableSystem(syllableSystem)) {
      options.syllableSystemId = syllableSystem;
    }

    return Object.keys(options).length > 0 ? options : null;
  }

  const toneSynth = new Tone.Synth();

  // let audioContext: AudioContext | null = null;
  // let analyser: AnalyserNode | null = null;
  // let stream: MediaStream | null = null;
  // let detector: any = null;
  // let rafId: number | null = null;

  // Key to frequency mapping (middle C = C4 = 261.63Hz)
  // const keyToRootFreq: Record<string, number> = {
  //   C: 261.63,
  //   G: 392.0,
  //   D: 293.66,
  //   A: 440.0,
  //   E: 329.63,
  //   B: 493.88,
  //   F: 349.23,
  //   Bb: 466.16,
  //   Eb: 311.13,
  //   Ab: 415.3,
  //   Db: 277.18,
  // };

  // Solfege scale degrees (relative to root)
  // const solfegeMap = [
  //   { degree: 0, name: "do" },
  //   { degree: 2, name: "re" },
  //   { degree: 4, name: "mi" },
  //   { degree: 5, name: "fa" },
  //   { degree: 7, name: "sol" },
  //   { degree: 9, name: "la" },
  //   { degree: 11, name: "ti" },
  // ];

  /**
   * Plays a clicked note as it sounds in playback.
   *
   * The pitch comes from abcjs's own MIDI pass rather than the written letter:
   * reading the letter ignored the key signature (an F in G major played F
   * natural), an accidental earlier in the bar, and the playback transpose.
   * abcjs writes `midiPitches` onto each note when it sets up audio, which a
   * freshly drawn score has not done yet - so do it here, with the transpose
   * playback uses. A transpose change redraws the score, so pitches set up
   * under the old transpose never outlive it.
   */
  const playNote = async (abcElem: any) => {
    if (!abcElem.midiPitches && currentTune) {
      currentTune.setUpAudio({ midiTranspose: transposeSemitones });
    }
    const midi = abcElem.midiPitches?.[0]?.pitch;
    if (typeof midi !== "number") return;
    await Tone.start();
    toneSynth.triggerAttackRelease(Tone.Frequency(midi, "midi").toFrequency(), "8n");
  };

  // The selectable set is shared with scripts/check-rhythm.ts, so the checks
  // there exercise exactly what the UI offers.
  let filterRhythms = selectableRhythms;

  const DEFAULT_RHYTHM_NAMES = ["eighthEighth", "quarter"];

  /**
   * Resolve saved rhythm names against the *selectable* set, not the full list.
   * A stale link or an old save can name something the UI never offers - a
   * sixteenth rest, whose 2-unit length is shorter than a beat - and letting one
   * through puts notes off the beat grid that the barlines, the rhythm syllables
   * and the fill's measure arithmetic all assume.
   *
   * Falls back to the defaults when nothing resolves: the previous `|| [...]`
   * could never fire, because .filter() always returns an array, so a bad
   * ?rhythms= left the selection empty and generation refused outright.
   */
  function resolveSelectedRhythms(names: unknown): Rhythm[] {
    const wanted = Array.isArray(names) ? names : [];
    const resolved = wanted
      .map((name) => filterRhythms.find((r) => r.name === name))
      .filter(Boolean) as Rhythm[];
    if (resolved.length > 0) return resolved;
    return DEFAULT_RHYTHM_NAMES.map((name) =>
      filterRhythms.find((r) => r.name === name)
    ).filter(Boolean) as Rhythm[];
  }

  const rhythmSvgs = Object.fromEntries(
    selectableRhythms
      .map((rhythm) => [
        rhythm.name,
        import(`../assets/svgs/${rhythm.name}.svg?raw`),
      ])
  );

  /**
   * Returns the initial state for the sight reading options, either from localStorage or defaults
   * @returns {Object} The initial state configuration
   */
  /**
   * Turn a saved options object - what this page writes to localStorage, and
   * what a preset holds - into the page's state. One mapping for both, so a
   * preset cannot restore something differently from a reload.
   *
   * Two things it now gets right that the old inline version did not: the
   * lyric system is restored (it was saved and then dropped), and
   * "accidentals follow step" can come back off (`|| true` made it always on).
   */
  function stateFromOptions(options: any) {
    // Options saved before the time signature was a plain name.
    let ts = "4/4";
    if (options.selectedTimeSignature) {
      ts =
        typeof options.selectedTimeSignature === "object"
          ? options.selectedTimeSignature.name || "4/4"
          : options.selectedTimeSignature;
    }
    return {
      selectedClef: options.selectedClef || "treble",
      selectedRange: options.selectedRange || { ...DEFAULT_TREBLE_RANGE },
      selectedScaleDegrees: new Set<number>(options.selectedScaleDegrees || [1, 3, 5]),
      selectedSharpDegrees: new Set<number>(options.selectedSharpDegrees || []),
      selectedFlatDegrees: new Set<number>(options.selectedFlatDegrees || []),
      selectedKey: options.selectedKey || "F",
      selectedRhythms: resolveSelectedRhythms(options.selectedRhythms),
      selectedTimeSignature: ts,
      measures: options.measures || 8,
      maxSkip: options.maxSkip || 4,
      bpm: options.bpm || 60,
      moveEighthNotes: options.moveEighthNotes || false,
      accidentalsFollowStep:
        typeof options.accidentalsFollowStep === "boolean" ? options.accidentalsFollowStep : true,
      showSolfege: options.showSolfege || false,
      lyricSystem: isLyricSystem(options.lyricSystem) ? options.lyricSystem : "movable",
      rhythmOnly: options.rhythmOnly || false,
      showRhythmSyllables: options.showRhythmSyllables || false,
      // Options saved before counting existed have no id at all.
      syllableSystemId: isChosenSyllableSystem(options.syllableSystemId)
        ? options.syllableSystemId
        : defaultSyllableSystem.id,
      allowTiesAcrossBarline: options.allowTiesAcrossBarline || false,
      cursorMode: isCursorMode(options.cursorMode) ? options.cursorMode : "smooth",
    };
  }

  /** A built-in syllable system, or the teacher's own ("custom"). */
  const isChosenSyllableSystem = (v: unknown): v is string =>
    isSyllableSystemId(v) || v === CUSTOM_SYLLABLE_ID;

  const isLyricSystem = (v: unknown): v is LyricSystem =>
    v === "movable" || v === "fixed" || v === "names";

  // ── Presets ───────────────────────────────────────────────────────────────
  /** The preset the settings came from, and what it held, for "edited". */
  let activePresetLabel = "";
  let activePresetSignature = "";
  /** The saved preset the settings came from, so it can be saved over. */
  let activeSavedId: string | null = null;
  /** The ladder step the settings came from, when they came from one. */
  let activeStepId: string | null = null;
  /** Loads the active preset or step again, for Revert. */
  let revertPreset: (() => void) | undefined = undefined;
  $: presetEdited =
    activePresetLabel !== "" && JSON.stringify(currentOptions) !== activePresetSignature;

  /**
   * Put a saved preset's settings on the page. Like choral, it sets the
   * controls and leaves the exercise alone - Generate is what uses them.
   */
  function applySavedPreset(preset: SavedPreset<any>) {
    const next = stateFromOptions(preset.params ?? {});
    selectedClef = next.selectedClef;
    selectedRange = next.selectedRange;
    selectedScaleDegrees = next.selectedScaleDegrees;
    selectedSharpDegrees = next.selectedSharpDegrees;
    selectedFlatDegrees = next.selectedFlatDegrees;
    selectedKey = next.selectedKey;
    selectedRhythms = next.selectedRhythms;
    selectedTimeSignature = next.selectedTimeSignature;
    measures = next.measures;
    maxSkip = next.maxSkip;
    bpm = next.bpm;
    moveEighthNotes = next.moveEighthNotes;
    accidentalsFollowStep = next.accidentalsFollowStep;
    showSolfege = next.showSolfege;
    lyricSystem = next.lyricSystem;
    rhythmOnly = next.rhythmOnly;
    showRhythmSyllables = next.showRhythmSyllables;
    syllableSystemId = next.syllableSystemId;
    allowTiesAcrossBarline = next.allowTiesAcrossBarline;
    cursorMode = next.cursorMode;
    activePresetLabel = preset.name;
    activeSavedId = preset.id;
    activeStepId = null;
    revertPreset = () => applySavedPreset(preset);
    // After the reactive snapshot has caught up with the values just set.
    setTimeout(() => (activePresetSignature = JSON.stringify(currentOptions)), 0);
  }

  /**
   * A ladder step: what to read - rhythms, meter, length, and for a pitched
   * step the key, scale degrees, skip size and range around do. The clef stays,
   * and the range is placed on the do inside the current one, so a class reads
   * at its own pitch. Chromatic notes go off: no step on this page teaches them. A step for the Choral page is opened there.
   */
  /**
   * Read now, while the component starts: the reactive URL sync rewrites the
   * address from the page's state before onMount runs, and the step is gone
   * by then.
   */
  const linkedStepId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get(STEP_PARAM)
      : null;

  function applyLadderStep(step: LadderStep) {
    const u = step.unison;
    if (!u) {
      window.location.href = stepHref(step);
      return;
    }
    rhythmOnly = u.rhythmOnly;
    selectedRhythms = resolveSelectedRhythms(u.selectedRhythms);
    selectedTimeSignature = u.selectedTimeSignature;
    measures = u.measures;
    moveEighthNotes = u.moveEighthNotes;
    if (u.selectedKey) selectedKey = u.selectedKey;
    if (u.selectedScaleDegrees) selectedScaleDegrees = new Set(u.selectedScaleDegrees);
    if (u.maxSkip) maxSkip = u.maxSkip;
    const range = rangeForStep(u, selectedRange);
    if (range) selectedRange = range;
    selectedSharpDegrees = new Set();
    selectedFlatDegrees = new Set();
    activePresetLabel = stepLabel(step);
    activeSavedId = null;
    activeStepId = step.id;
    revertPreset = () => applyLadderStep(step);
    setTimeout(() => (activePresetSignature = JSON.stringify(currentOptions)), 0);
  }

  function getInitialState() {
    if (typeof window !== "undefined") {
      const urlOptions = loadStateFromUrl();
      if (urlOptions) {
        // The same mapping as a reload or a preset. The link's own copy of it
        // dropped the lyric system, the sound and the transposition - all parsed
        // above, none of them reaching the page - and its `|| true` meant
        // "accidentals follow step" could never arrive off.
        return {
          ...stateFromOptions(urlOptions),
          rhythmSoundId: urlOptions.rhythmSoundId,
          instrumentProgram: urlOptions.instrumentProgram,
          transposeSemitones: urlOptions.transposeSemitones,
        };
      }
    }
    // Try to load from localStorage first
    const saved = localStorage.getItem("sightReadingOptions");
    if (saved) {
      try {
        return stateFromOptions(JSON.parse(saved));
      } catch (e) {
        console.error("Error loading saved options:", e);
      }
    }
    // Return defaults if no saved state or error
    return {
      selectedClef: "treble",
      selectedRange: { ...DEFAULT_TREBLE_RANGE },
      selectedScaleDegrees: new Set<number>([1, 3, 5]),
      selectedSharpDegrees: new Set(),
      selectedFlatDegrees: new Set(),
      selectedKey: "F",
      selectedRhythms: resolveSelectedRhythms([]),
      selectedTimeSignature: "4/4",
      measures: 8,
      maxSkip: 4,
      bpm: 60,
      moveEighthNotes: false,
      accidentalsFollowStep: false,
      showSolfege: false,
      rhythmOnly: false,
      showRhythmSyllables: false,
      syllableSystemId: defaultSyllableSystem.id,
      allowTiesAcrossBarline: false,
      cursorMode: "smooth",
    };
  }

  const initialState = getInitialState();
  let selectedClef = initialState.selectedClef;
  let selectedRange = initialState.selectedRange;
  let selectedScaleDegrees: Set<number> = initialState.selectedScaleDegrees;
  let selectedSharpDegrees = initialState.selectedSharpDegrees;
  let selectedFlatDegrees = initialState.selectedFlatDegrees;
  let selectedKey = initialState.selectedKey;
  let selectedRhythms = initialState.selectedRhythms;
  let selectedTimeSignature = initialState.selectedTimeSignature;
  let measures = initialState.measures;
  let maxSkip = initialState.maxSkip;
  let bpm = initialState.bpm;
  let moveEighthNotes = initialState.moveEighthNotes;
  let accidentalsFollowStep = initialState.accidentalsFollowStep;
  let tempo = initialState.bpm;
  let rhythmOnly = initialState.rhythmOnly || false;
  /**
   * Whether the rhythm syllables are printed over a rhythm-only exercise.
   *
   * A display setting too, and independent of the solfège below - see there.
   */
  let showRhythmSyllables = initialState.showRhythmSyllables || false;
  /**
   * Whether the solfège under the staff is printed.
   *
   * A display setting, not a generation one. The lyrics are now always written
   * into the exercise and stripped at render time, so this re-writes what is
   * already on screen instead of costing a regenerate - and it is independent of
   * the rhythm syllables, which used to share a master switch with it. The two
   * things a singer wants apart could only be had together.
   */
  /**
   * What goes under the notes, or null for nothing: movable-do solfège (do is
   * the tonic), fixed do (C is always do), or the note names.
   *
   * Like the rhythm syllables, the lyric is written INTO the exercise and
   * stripped at render, so changing system is a re-label - see relabelScore.
   */
  let lyricSystem: LyricSystem = initialState.lyricSystem || "movable";
  let showSolfege = initialState.showSolfege || false;
  /** Which lyric `originalTuneString` is currently written with. */
  let writtenLyricSystem = lyricSystem;

  /**
   * The rhythm staff's sound. Claves is a click with no duration, so a half note
   * sounds like an eighth; the sustained options let a held note be heard held.
   */
  let rhythmSoundId: string = initialState.rhythmSoundId ?? DEFAULT_RHYTHM_SOUND;
  /** The instrument for pitched exercises, shared with the choral page. */
  let instrumentProgram: number = initialState.instrumentProgram ?? DEFAULT_INSTRUMENT;

  /**
   * Semitones to shift PLAYBACK by, leaving the notation exactly as written -
   * read it in the key on the page, hear it wherever it needs to sound.
   */
  let transposeSemitones = clampTranspose(
    Number((initialState as any).transposeSemitones ?? 0)
  );

  /** Apply the chosen sound to an assembled exercise. */
  function withChosenSound(abc: string): string {
    return rhythmOnly
      ? withRhythmSound(abc, rhythmSoundFor(rhythmSoundId))
      : withInstrument(abc, instrumentProgram);
  }

  async function handleSoundChange(next: string | number) {
    if (typeof next === "number") instrumentProgram = next;
    else rhythmSoundId = next;
    updateUrlFromState();
    // The audio buffer is built from the old sound, so it has to go.
    audioBuffer = null;
    createSynth = null;
    if (currentTune && originalTuneString) await rerenderTune();
  }

  /**
   * Shift playback without touching the score.
   *
   * The rendered audio buffer was built from the old pitches, so it has to go -
   * the same reason changing the instrument throws it away.
   */
  async function handleTransposeChange(next: number) {
    const clamped = clampTranspose(next);
    if (clamped === transposeSemitones) return;
    transposeSemitones = clamped;
    updateUrlFromState();
    audioBuffer = null;
    createSynth = null;
    if (currentTune && originalTuneString) await rerenderTune();
  }

  /**
   * Pick what goes under the notes, or switch it off by pressing the one that
   * is already on.
   *
   * Hiding is a render-time strip. Changing SYSTEM re-labels the exercise from
   * the notes it was made of, so the exercise on screen stays.
   */
  async function handleLyricSystem(system: LyricSystem) {
    if (showSolfege && lyricSystem === system) {
      showSolfege = false;
    } else {
      showSolfege = true;
      lyricSystem = system;
      relabelScore(writtenSyllableSystem, system);
    }
    updateUrlFromState();
    if (currentTune && originalTuneString) await rerenderTune();
  }

  /**
   * The rhythm syllables: off, or one of the systems.
   *
   * One control where there used to be three - an on/off in the Rhythm tab, a
   * system picker beneath it, and a second on/off under Annotations that did
   * the same job by a different route. Which one you reached for changed what
   * happened, and two of them disagreed about whether the exercise had to be
   * made again.
   *
   * Off is a render-time strip, so it costs nothing and comes straight back.
   * Changing SYSTEM is a re-label: the syllables are written into the exercise
   * as it is assembled, so the exercise is written out again from the notes it
   * was made of - see `relabelScore`. It used to generate a whole new exercise,
   * which took the one on screen away for a change of wording.
   */
  async function setRhythmSyllables(mode: "off" | string) {
    const wasOff = !showRhythmSyllables;
    if (mode === "off") {
      showRhythmSyllables = false;
      updateUrlFromState();
      if (currentTune && originalTuneString) await rerenderTune();
      return;
    }
    const systemChanged = mode !== syllableSystemId;
    syllableSystemId = mode;
    showRhythmSyllables = true;
    updateUrlFromState();
    const relabelled = systemChanged && relabelScore(mode);
    if ((relabelled || wasOff) && currentTune && originalTuneString) {
      await rerenderTune();
    } else if (systemChanged && currentTune && !currentScore) {
      // Nothing to re-label from - an exercise from before this existed.
      await handleClick();
    }
  }

  /**
   * Strip whatever is currently switched off.
   *
   * Both are written into every exercise and taken out here, so either can be
   * turned back on without regenerating.
   */
  function withChosenAnnotations(abc: string): string {
    let out = abc;
    if (!showSolfege) out = withoutLyrics(out);
    // Rhythm syllables belong to the one-line rhythm staff, where the control
    // for them lives. A pitched exercise carries them too - that is what lets a
    // practice run's repeats show Kodaly or counting - but prints them only
    // when a repeat has asked (passSyllables). Reading the rhythm-staff setting
    // here instead, even just during a run, put counting under every pass of a
    // pitched run whenever that setting had been left on - from rhythm mode,
    // localStorage or a link - with no control on the pitched page to take it
    // away, and it stayed after the run.
    const syllablesWanted = rhythmOnly ? showRhythmSyllables : passSyllables;
    if (!syllablesWanted) out = withoutQuotedText(out);
    return out;
  }
  /** The lyric options, in the order the buttons show them. */
  const lyricSystems: [LyricSystem, string][] = [
    ["movable", "Movable do"],
    ["fixed", "Fixed do"],
    ["names", "Note names"],
  ];

  let syllableSystemId: string =
    initialState.syllableSystemId || defaultSyllableSystem.id;
  let allowTiesAcrossBarline = initialState.allowTiesAcrossBarline || false;
  let cursorMode: CursorMode = initialState.cursorMode || "smooth";
  // Turning the cursor off should clear it at once, not leave the last
  // position frozen on the staff until playback next moves it.
  $: if ((passCursorOverride ?? cursorMode) === "off" && playbackCursor) hidePlaybackCursor();

  let renderedString: any;
  let originalTuneString: string | null = null; // Store the original tune string for rerendering
  /**
   * The exercise as data, so it can be written out again in a different
   * syllable system without generating a new one. See `UnisonScore`.
   */
  let currentScore: UnisonScore | null = null;

  // ── Links to the exercise itself ───────────────────────────────────────────
  /**
   * The exercise packed for a link, or null while packing (or with nothing to
   * pack). Packed as soon as an exercise is on screen, not on the click:
   * packing awaits the compressor, and Safari refuses a clipboard write that
   * comes after an await.
   */
  let exercisePacked: string | null = null;
  let packing = 0;
  function useExerciseScore(score: UnisonScore | null) {
    exercisePacked = null;
    const mine = ++packing;
    if (!score) return;
    packExercise({ kind: "unison", score })
      .then((value) => { if (mine === packing) exercisePacked = value; })
      .catch((err) => console.error("Could not pack the exercise for a link:", err));
  }
  /**
   * `#ex=…` while the page shows the exercise a link opened, kept through every
   * settings write to the URL. Read here, at the top, because the reactive
   * block that writes the URL runs before onMount - it would drop the hash
   * before anything could open it.
   */
  let exerciseHash = (() => {
    const value = typeof window === "undefined" ? null : exerciseParam(window.location.hash);
    return value ? exerciseFragment(value) : "";
  })();
  /** A link to the exercise on screen, with the settings it is shown in. */
  const exerciseLinkFor = (packed: string) => () => settingsLink() + exerciseFragment(packed);
  $: exerciseLink = exercisePacked === null ? null : exerciseLinkFor(exercisePacked);
  /** Which syllable system `originalTuneString` is currently written with. */
  let writtenSyllableSystem = syllableSystemId;

  /**
   * Write the exercise on screen out again with a different set of rhythm
   * syllables, keeping every note where it is.
   *
   * Both annotations always go in and are stripped at render, so this writes
   * them both and lets `withChosenAnnotations` decide what shows. Returns
   * whether anything changed, so a caller can skip a redraw it does not need.
   */
  /** The hint under the picker; "Mine" falls back to Kodály until it loads. */
  $: syllableHint =
    syllableSystemId === CUSTOM_SYLLABLE_ID
      ? $mySyllables
        ? customSyllableSystem($mySyllables).hint
        : `${syllableSystems.kodaly.hint} (your own set is not loaded)`
      : (syllableSystems as Record<string, { hint: string }>)[syllableSystemId]?.hint ?? "";

  /**
   * The teacher's set arrives after the page does. An exercise already written
   * in "Mine" was written in Kodály meanwhile, so write it again in theirs.
   */
  let customLoaded = false;
  $: if ($mySyllables && !customLoaded) {
    customLoaded = true;
    if (syllableSystemId === CUSTOM_SYLLABLE_ID && currentScore) {
      writtenSyllableSystem = "";
      if (relabelScore(CUSTOM_SYLLABLE_ID) && currentTune && originalTuneString) rerenderTune();
    }
  }

  function relabelScore(systemId: string, lyric: LyricSystem = lyricSystem): boolean {
    if (!currentScore) return false;
    if (systemId === writtenSyllableSystem && lyric === writtenLyricSystem) return false;
    originalTuneString = assembleUnisonAbc(currentScore, {
      showSolfege: !rhythmOnly,
      lyricSystem: lyric,
      showRhythmSyllables: true,
      syllableSystemId: systemId,
      customSyllables: $mySyllables,
    });
    writtenSyllableSystem = systemId;
    writtenLyricSystem = lyric;
    return true;
  }
  let selectableArray: any[] = [];
  let pitchCursor: SVGLineElement | null = null;
  let playbackCursor: SVGLineElement | null = null; // Follows playback
  /** Phones get one measure-line of music at 1x; desktop keeps the 2x default. */
  const NARROW = 640; // Tailwind's `sm`
  const isNarrow = () =>
    typeof window !== "undefined" && window.innerWidth < NARROW;
  let displayScale = isNarrow() ? 1 : 2; // Scale for visual display

  function getStaffWidth(): number {
    const paper = document.getElementById("paper");
    const containerWidth = paper?.clientWidth ?? (isNarrow() ? 340 : 900);
    // staffwidth controls how many measures fit per line; responsive: "resize"
    // handles the visual zoom. The floor has to stay below a phone's container
    // width or it discards the measurement and the score renders too wide.
    // 140 is about the narrowest that still engraves a clef + key + one measure.
    return Math.max(140, Math.floor(containerWidth / displayScale) - 30);
  }

  // Define possible keys
  // let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

  // Define time signatures
  // const timeSignatures = {
  //   "4/4": { name: "4/4", tsPerMeasure: 32 },
  //   "3/4": { name: "3/4", tsPerMeasure: 24 },
  //   "2/4": { name: "2/4", tsPerMeasure: 16 },
  // };

  // Simplified options
  // const clefOptions = ["treble", "bass", "alto", "tenor"];

  // const scaleDegrees = [1, 2, 3, 4, 5, 6, 7];
  // const sharpScaleDegrees = [
  //   { display: "♯1", value: 1 },
  //   { display: "♯2", value: 2 },
  //   { display: "♯4", value: 4 },
  //   { display: "♯5", value: 5 },
  //   { display: "♯6", value: 6 },
  // ];
  // const flatScaleDegrees = [
  //   { display: "♭2", value: 2 },
  //   { display: "♭4", value: 4 },
  //   { display: "♭5", value: 5 },
  //   { display: "♭6", value: 6 },
  //   { display: "♭7", value: 7 },
  // ];

  // Update range based on clef selection
  $: {
    if (!selectedRange) {
      // Only set initial values
      switch (selectedClef) {
        case "treble":
          selectedRange = { ...DEFAULT_TREBLE_RANGE };
          break;
        case "bass":
          selectedRange = { min: 7, max: 14 }; // C2 to C3
          break;
        case "alto":
          selectedRange = { min: 12, max: 19 }; // C3 to C4
          break;
        case "tenor":
          selectedRange = { min: 10, max: 17 }; // A2 to A3
          break;
      }
    }
  }

  // ── Dirty indicators ──────────────────────────────────────────────────────
  const DEFAULTS = {
    key: 'F', clef: 'treble', timeSig: '4/4', measures: 8,
    maxSkip: 4, scaleDegrees: [1, 3, 5], range: DEFAULT_TREBLE_RANGE,
    rhythmNames: ['eighthEighth', 'quarter'],
  };
  $: setupDirty = selectedKey !== DEFAULTS.key || selectedClef !== DEFAULTS.clef ||
    selectedTimeSignature !== DEFAULTS.timeSig || measures !== DEFAULTS.measures;
  $: rhythmDirty = JSON.stringify(selectedRhythms.map((r: Rhythm) => r.name).sort()) !==
    JSON.stringify([...DEFAULTS.rhythmNames].sort());
  $: notesDirty = maxSkip !== DEFAULTS.maxSkip ||
    JSON.stringify(Array.from(selectedScaleDegrees).sort()) !== JSON.stringify([...DEFAULTS.scaleDegrees].sort()) ||
    selectedSharpDegrees.size > 0 || selectedFlatDegrees.size > 0 ||
    accidentalsFollowStep !== false || moveEighthNotes !== false;
  $: rangeDirty = selectedRange.min !== DEFAULTS.range.min || selectedRange.max !== DEFAULTS.range.max;

  // Notes and Range only mean something when there are pitches to control.
  $: visibleTabs = (rhythmOnly ? ['setup', 'rhythm'] : ['setup', 'rhythm', 'notes', 'range']) as Tab[];
  $: if (!visibleTabs.includes(selectedTab)) selectedTab = 'setup';

  const STORAGE_KEY = "sightReadingOptions";

  // Save options whenever they change. The snapshot is also what a preset
  // stores, and what "edited" is measured against.
  $: currentOptions = {
      selectedClef,
      selectedRange: { ...selectedRange },
      selectedScaleDegrees: Array.from(selectedScaleDegrees),
      selectedSharpDegrees: Array.from(selectedSharpDegrees),
      selectedFlatDegrees: Array.from(selectedFlatDegrees),
      selectedKey,
      selectedRhythms: selectedRhythms.map((r: Rhythm) => r.name),
      selectedTimeSignature,
      measures,
      maxSkip,
      bpm,
      moveEighthNotes,
      accidentalsFollowStep,
      showSolfege,
      lyricSystem,
      rhythmOnly,
      showRhythmSyllables,
      syllableSystemId,
      allowTiesAcrossBarline,
      cursorMode,
    };
  $: {
    const options = currentOptions;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch (e) {
      console.error("Error saving options:", e);
    }
    if (typeof window !== "undefined") {
      updateUrlFromState();
    }
  }

  function updateUrlFromState() {
    const params = new URLSearchParams();
    params.set("clef", selectedClef);
    params.set("range", `${selectedRange.min}-${selectedRange.max}`);
    params.set("scaleDegrees", Array.from(selectedScaleDegrees).join(","));
    params.set(
      "selectedSharpDegrees",
      Array.from(selectedSharpDegrees).join(",")
    );
    params.set(
      "selectedFlatDegrees",
      Array.from(selectedFlatDegrees).join(",")
    );
    params.set("key", selectedKey);
    params.set("rhythmSound", rhythmSoundId);
    params.set("sound", String(instrumentProgram));
    params.set("rhythms", selectedRhythms.map((r: Rhythm) => r.name).join(","));
    params.set("timeSignature", selectedTimeSignature);
    params.set("measures", measures.toString());
    params.set("maxSkip", maxSkip.toString());
    params.set("bpm", bpm.toString());
    params.set("moveEighthNotes", moveEighthNotes.toString());
    params.set("accidentalsFollowStep", accidentalsFollowStep.toString());
    params.set("showSolfege", showSolfege.toString());
    params.set("lyrics", lyricSystem);
    params.set("rhythmOnly", rhythmOnly.toString());
    params.set("showRhythmSyllables", showRhythmSyllables.toString());
    params.set("transpose", String(transposeSemitones));
    params.set("syllableSystem", syllableSystemId);
    params.set("allowTiesAcrossBarline", allowTiesAcrossBarline.toString());
    params.set("cursor", cursorMode);

    // The exercise hash rides along, or the next settings change would lose it.
    const newUrl = `${window.location.pathname}?${params.toString()}${exerciseHash}`;
    history.replaceState({}, "", newUrl);
  }

  /**
   * Initializes the audio synthesis engine and buffer
   * @returns {Promise<boolean>} Success status of initialization
   */
  /** Loudest sample in the buffer, sampled with a stride so it stays cheap.
   *  abcjs silently omits any note whose sample did not load (place-note.js),
   *  so a fully-skipped tune yields a correctly-sized buffer full of zeroes -
   *  present, schedulable and completely silent. */
  function peakAmplitude(buffer: AudioBuffer): number {
    let peak = 0;
    const stride = 64;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += stride) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    return peak;
  }

  async function initAudio() {
    if (!currentTune) {
      console.warn("No tune available - generate one first");
      return false;
    }
    // Ensure AudioContext is running. resume() never settles while the browser
    // is still withholding autoplay permission, so awaiting it bare hangs
    // playMusic forever and Play just appears dead. Time it out and say so.
    if (audioContext.state === "suspended") {
      await Promise.race([
        audioContext.resume(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (audioContext.state === "suspended") {
        error =
          "Your browser is blocking audio until you interact with the page. Click anywhere on the page, then press Play again.";
        return false;
      }
    }
    if (!createSynth) {
      createSynth = new abcjs.synth.CreateSynth();
    }

    // The init call loads the required instrument sounds over the network.
    const initResult = await createSynth.init({
      audioContext: audioContext, // Pass our context to abcjs
      visualObj: currentTune,
      options: {
        qpm: tempo,
        // Serve the samples from our own origin. abcjs defaults to
        // paulrosen.github.io, which locked-down networks block - and a blocked
        // sample is skipped silently, leaving only the metronome audible.
        soundFontUrl: "/api/soundfont/",
        // abcjs only applies its 3x boost when it recognises its own default
        // URL (create-synth.js:50-57); a custom URL silently drops to 1.0. We
        // proxy the identical FluidR3_GM files, so restore it or everything
        // plays a third as loud.
        // Rhythm-only plays one intrinsically quiet sample (claves peaks at
        // 0.16 of full scale), so give it extra gain. 4.0 x velocity 127 lands
        // the rendered buffer near 0.84 peak - loud, still short of clipping.
        soundFontVolumeMultiplier: rhythmOnly
          ? volumeMultiplierFor(rhythmSoundFor(rhythmSoundId))
          : 3.0,
        // Read in abc_midi_sequencer, downstream of the visual object, so the
        // score on the page is untouched and only the sound moves.
        midiTranspose: transposeSemitones,
        // No drum parameters - we'll use our synthetic metronome
      },
    });

    // init() resolves { status, duration } (create-synth.js resolveData). A zero
    // duration means nothing was primed - abcjs skips notes whose samples are
    // missing without raising, which sounds exactly like "only the click plays".
    // prime() gets it ready to create the buffer
    await createSynth.prime();
    // This gets the entire playable audio file.
    audioBuffer = await createSynth.getAudioBuffer();

    const bufferSeconds = audioBuffer?.duration ?? 0;
    const peak = audioBuffer ? peakAmplitude(audioBuffer) : 0;
    console.info(
      `[audio] ctx=${audioContext.state} initDuration=${initResult?.duration ?? "?"} buffer=${bufferSeconds.toFixed(2)}s peak=${peak.toFixed(4)} gain=${gainNode?.gain.value.toFixed(2)}`
    );

    // A silent buffer is the failure being chased: it passes every other check,
    // so the cursor runs and the metronome clicks with no instrument at all.
    if (!audioBuffer || bufferSeconds === 0 || peak < 0.0001) {
      error =
        "The instrument sounds did not load, so only the metronome would play. Press Play again to retry.";
      audioBuffer = null;
      createSynth = null; // drop the synth so the next attempt refetches cleanly
      return false;
    }
    return true;
  }

  /**
   * Updates the tempo in an ABC string
   * @param {string} abcString - The original ABC string
   * @param {number} newTempo - The new tempo value
   * @returns {string} The ABC string with updated tempo
   */
  function updateTempoInAbcString(abcString: string, newTempo: number): string {
    // Replace the Q: (tempo) line in the ABC string
    return abcString.replace(/Q:1\/4=\d+/g, `Q:1/4=${newTempo}`);
  }

  /**
   * Shared abcjs render options.
   * Both the first render and any rerender must use these so the display size
   * (displayScale) survives generating a new exercise -- `responsive: "resize"`
   * is what actually turns the narrowed staffwidth into visual zoom.
   */
  function getAbcOptions() {
    return {
      add_classes: true,
      generateDownload: true,
      generateInline: true,
      generateTiming: true,
      // No `scale` and no padding* here on purpose: with responsive:"resize"
      // abcjs discards `scale` outright, and it only reads lowercase
      // padding* keys, so the camelCase ones never did anything. staffwidth is
      // the only real zoom lever.
      responsive: "resize",
      staffwidth: getStaffWidth(),
      wrap: {
        // Syllables sit under every note, so a measure needs more width or
        // abcjs pushes colliding annotations onto a second row - "(sh)" and the
        // eighth after it are the tight pair. Fewer measures per line is a more
        // predictable lever than shrinking the text further.
        preferredMeasuresPerLine: isNarrow()
          ? 2
          : rhythmOnly && showRhythmSyllables
            ? 3
            : 4,
        minSpacing: 1.5,
        maxSpacing: 5,
      },
      clickListener: async (event: any) => {
        // Every note on the rhythm staff is the same placeholder pitch, so
        // playing it back would be meaningless.
        if (rhythmOnly) return;
        if (event.pitches && event.pitches.length > 0) await playNote(event);
      },
    };
  }

  /**
   * Creates an SVG line inside the rendered staff, used for the cursors.
   * @param {string} className - The class to put on the line
   * @returns {SVGLineElement|null} The created cursor element
   */
  function createSvgCursor(className: string): SVGLineElement | null {
    const svg = document.querySelector("#paper svg");
    if (!svg) return null;

    const cursor = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    cursor.setAttribute("class", className);
    cursor.setAttributeNS(null, "x1", "0");
    cursor.setAttributeNS(null, "y1", "0");
    cursor.setAttributeNS(null, "x2", "0");
    cursor.setAttributeNS(null, "y2", "0");
    svg.appendChild(cursor);
    return cursor as SVGLineElement;
  }

  /** Parks the playback cursor off-screen (used at stop and at the end). */
  function hidePlaybackCursor() {
    if (!playbackCursor) return;
    playbackCursor.setAttribute("x1", "0");
    playbackCursor.setAttribute("x2", "0");
    playbackCursor.setAttribute("y1", "0");
    playbackCursor.setAttribute("y2", "0");
  }

  /**
   * (Re)builds the cursors and the TimingCallbacks for the current tune.
   * Every render path goes through this so the cursor always moves the same
   * element and the timing state is never left over from a previous tune.
   */
  /** Marks the decorations this adds, so a redraw can clear its own work. */
  const HELD_COUNT_CLASS = "held-count-mark";

  /**
   * Spreads a held count across the beats it actually occupies.
   *
   * The counting system emits a held note as one annotation - "1_(2)_(3)" - and
   * abcjs centres that whole string under the notehead. It reads badly and, worse,
   * it is untruthful: the (2) and (3) sit next to the 1 rather than above beats 2
   * and 3, so the counting does not line up with the notes it is meant to teach.
   *
   * So the annotation is taken apart here: the attack keeps its place, each held
   * beat is redrawn where that beat actually falls, and a rule joins them, which
   * is how the marking is written by hand.
   *
   * Only counting produces "_" - Kodaly's sustains use hyphens ("tu-u-u") - so
   * nothing else is touched, and an untouched annotation still reads correctly
   * on its own if this never runs.
   */
  function decorateHeldCounts() {
    const svg = document.querySelector("#paper svg");
    if (!svg) return;

    svg.querySelectorAll("." + HELD_COUNT_CLASS).forEach((el) => el.remove());

    const annotations = Array.from(
      svg.querySelectorAll("text.abcjs-annotation")
    ) as SVGTextElement[];
    if (annotations.length === 0) return;

    const xOf = (t: SVGTextElement) => parseFloat(t.getAttribute("x") || "0");
    const yOf = (t: SVGTextElement) => parseFloat(t.getAttribute("y") || "0");
    const lineOf = (el: Element) =>
      (el.getAttribute("class") || "").match(/abcjs-l(\d+)/)?.[1] ?? null;

    // Where each system's staff ends. A held note that is the last one on its
    // line has no following annotation to measure against, and guessing a width
    // ran the last beat past the staff and off the edge of the drawing.
    const staffEnd = new Map<string, number>();
    svg.querySelectorAll(".abcjs-staff").forEach((staff) => {
      const line = lineOf(staff);
      if (line === null) return;
      const box = (staff as SVGGraphicsElement).getBBox();
      staffEnd.set(line, box.x + box.width);
    });

    // Notes and counts per system, in reading order. A note tied across a line
    // break is split by the writer, and the continuation carries no count of
    // its own - so a system that opens with a tie has a note sitting to the
    // left of its first count, which is how that case is recognised below.
    const notesByLine = new Map<string, number[]>();
    svg.querySelectorAll(".abcjs-note").forEach((note) => {
      const line = lineOf(note);
      if (line === null) return;
      const list = notesByLine.get(line) ?? [];
      list.push((note as SVGGraphicsElement).getBBox().x);
      notesByLine.set(line, list);
    });
    notesByLine.forEach((xs) => xs.sort((a, b) => a - b));

    const annsByLine = new Map<string, SVGTextElement[]>();
    annotations.forEach((t) => {
      const line = lineOf(t);
      if (line === null) return;
      const list = annsByLine.get(line) ?? [];
      list.push(t);
      annsByLine.set(line, list);
    });
    annsByLine.forEach((list) => list.sort((a, b) => xOf(a) - xOf(b)));

    annotations.forEach((text, index) => {
      // A redraw re-renders from the ABC, so the full string is back; but keep
      // the original around in case this is ever called twice on one render.
      const full = text.dataset.heldCount ?? text.textContent ?? "";
      if (!full.includes("_")) return;

      const parts = full.split("_");
      const attack = parts[0];
      const held = parts.slice(1);
      if (held.length === 0) return;

      // The span from this annotation to the next one is the note's width, and
      // the note's beats divide it evenly. That is exact for every whole-beat
      // note - a half, a dotted half, a whole - and off by a fraction of one
      // note's width for a dotted value, which is not worth more machinery.
      //
      // The last note on a line has no next annotation to measure against, so
      // the span runs to the end of that line's staff. Clamped either way: a
      // note held to the end of a system must not push its counts past the
      // barline and out of the drawing.
      const line = lineOf(text) ?? "";
      const start = xOf(text);
      const rowEnd = staffEnd.get(line) ?? start + 40 * (held.length + 1);

      // Does this note tie over the end of the system? A note split at a
      // barline ends the first segment exactly on that barline, so every beat
      // it crosses happens in the continuation - and if the barline is also a
      // line break, those beats belong to the NEXT system. Drawn here they end
      // up crammed against the final barline, marking beats that visibly
      // happen a line later.
      const rowAnns = annsByLine.get(line) ?? [];
      const nextLine = String(Number(line) + 1);
      const nextNotes = notesByLine.get(nextLine) ?? [];
      const nextAnns = annsByLine.get(nextLine) ?? [];
      const tiesOverLineBreak =
        rowAnns[rowAnns.length - 1] === text &&
        nextNotes.length > 0 &&
        nextAnns.length > 0 &&
        nextNotes[0] < xOf(nextAnns[0]) - 2;

      // Where each held beat is drawn, and the y it sits on.
      let markXs: number[] = [];
      let markY = yOf(text);
      if (tiesOverLineBreak) {
        const contStart = nextNotes[0];
        const contEnd =
          nextNotes[1] ?? staffEnd.get(nextLine) ?? contStart + 40;
        markY = yOf(nextAnns[0]);
        markXs = held.map(
          (_, i) => contStart + ((contEnd - contStart) * i) / held.length
        );
      } else {
        const next = annotations[index + 1];
        const sameRow = next && Math.abs(yOf(next) - yOf(text)) < 1;
        const end = Math.min(sameRow ? xOf(next) : rowEnd, rowEnd);
        if (end <= start) return;
        const step = (end - start) / (held.length + 1);
        markXs = held.map((_, i) => start + step * (i + 1));
      }

      text.dataset.heldCount = full;
      text.textContent = attack;

      // Clone the annotation rather than building a text node: abcjs sets the
      // font through several attributes, and a hand-made copy came out heavier
      // than the count it belongs with.
      const marks: SVGTextElement[] = [];
      held.forEach((label, i) => {
        const mark = text.cloneNode(false) as SVGTextElement;
        delete mark.dataset.heldCount;
        // A mark that moved to the next system must not keep the class of the
        // one it came from, or anything grouping by line later reads it as
        // belonging to the wrong staff.
        const cls = (text.getAttribute("class") || "").replace(
          /abcjs-l\d+/,
          tiesOverLineBreak ? `abcjs-l${nextLine}` : `abcjs-l${line}`
        );
        mark.setAttribute("class", cls + " " + HELD_COUNT_CLASS);
        mark.setAttribute("x", String(markXs[i]));
        mark.setAttribute("y", String(markY));
        mark.textContent = label;
        svg.appendChild(mark);
        marks.push(mark);
      });

      // The rule runs between the labels, never through them. It sits at about
      // mid-digit height so it reads as the dash of "1 - 2 - 3"; along the
      // baseline it just looked like an underscore between the numbers.
      const boxes = [text, ...marks].map((el) => {
        const b = el.getBBox();
        return { left: b.x, right: b.x + b.width };
      });
      const fontSize = parseFloat(window.getComputedStyle(text).fontSize) || 12;
      const stroke = window.getComputedStyle(text).fill;
      const drawRule = (from: number, to: number, y: number) => {
        if (to - from < 3) return;
        const rule = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line"
        );
        rule.setAttribute("class", HELD_COUNT_CLASS);
        rule.setAttribute("x1", String(from));
        rule.setAttribute("x2", String(to));
        rule.setAttribute("y1", String(y - fontSize * 0.28));
        rule.setAttribute("y2", String(y - fontSize * 0.28));
        rule.setAttribute("stroke", stroke);
        rule.setAttribute("stroke-width", String(Math.max(1, fontSize * 0.09)));
        svg.appendChild(rule);
      };

      if (tiesOverLineBreak) {
        // Never join the attack to a mark on the next system - that rule would
        // be drawn as a diagonal across the page. The attack instead runs to
        // the end of its own staff, which reads as "still going".
        drawRule(boxes[0].right + 2, rowEnd, yOf(text));
        for (let i = 1; i < boxes.length - 1; i++) {
          drawRule(boxes[i].right + 2, boxes[i + 1].left - 2, markY);
        }
      } else {
        for (let i = 0; i < boxes.length - 1; i++) {
          drawRule(boxes[i].right + 2, boxes[i + 1].left - 2, yOf(text));
        }
      }
    });
  }

  /** Places the cursor at an x with the staff's vertical extent. */
  function movePlaybackCursor(left: number, top: number, height: number) {
    if (!playbackCursor) return;
    const x = Math.max(0, left - 2);
    const overhang = height * 0.15;
    playbackCursor.setAttribute("x1", String(x));
    playbackCursor.setAttribute("x2", String(x));
    playbackCursor.setAttribute("y1", String(top + overhang));
    playbackCursor.setAttribute("y2", String(top + height + overhang));
  }

  async function attachCursorAndTiming() {
    // Wait for the SVG to land in the DOM before attaching cursors to it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    decorateHeldCounts();

    playbackCursor = createSvgCursor("abcjs-cursor");
    pitchCursor = createSvgCursor("abcjs-pitch-cursor");
    updatePitchCursor(0); // Static indicator on the first note

    if (timingCallbacks) {
      timingCallbacks.stop();
      timingCallbacks = null;
    }

    const beatsPerMeasure = parseInt(selectedTimeSignature[0]);
    // Reset per attach: beatCallback now fires many times per beat, so the
    // metronome tracks which whole beat it last sounded rather than firing on
    // every call.
    metronomeBeats = newMetronomeBeatState();
    cursorBeats = newMetronomeBeatState();

    timingCallbacks = new abcjs.TimingCallbacks(currentTune, {
      beatCallback: (beatNumber, totalBeats, _totalTime, position) => {
        // With beatSubdivisions below, beatNumber arrives fractional - 0,
        // 0.0625, 0.125 ... - so the click is tied to the whole beat rather
        // than to the callback. Without this the metronome fires once per
        // subdivision, which is sixteen clicks a beat.
        const beat = metronomeClickFor(
          metronomeBeats,
          beatNumber,
          beatsPerMeasure
        );
        if ((passMetronomeOverride ?? isMetronomeOn) && beat.click) playMetronomeClick(beat.isDownbeat);

        if (!playbackCursor) return;
        if (beatNumber >= totalBeats) {
          hidePlaybackCursor();
          return;
        }
        if (effectiveCursorMode !== "smooth" && effectiveCursorMode !== "beat") return;
        // Beat mode steps once per beat; smooth takes every callback, which is
        // where abcjs's interpolation between notes shows up.
        const stepped = crossedWholeBeat(cursorBeats, beatNumber);
        if (effectiveCursorMode === "beat" && !stepped) return;
        // position.left is undefined during the count-in measure.
        if (position && typeof position.left === "number") {
          movePlaybackCursor(position.left, position.top, position.height);
        }
      },
      // Fires once at each note's onset, so the cursor lands on the note and
      // stays there for its full length.
      eventCallback: (event: any) => {
        if (effectiveCursorMode !== "note" || !playbackCursor || !event) return;
        if (typeof event.left !== "number") return;
        movePlaybackCursor(event.left, event.top, event.height);
      },
      lineEndCallback: (data: any, _ev: any, info: any) => {
        // Auto-scroll to keep the next line in view.
        // Line 0 is handled up front by scrollToFirstSystem() when playback
        // starts, so that move happens across the count-in instead of landing
        // 500ms before the first note (lineEndAnticipation) as a sudden jump.
        if (info?.line === 0) return;
        if (scrollSuppressed) return; // a silenced repeat does not scroll either

        const paperDiv = document.getElementById("paper");
        if (!paperDiv) return;
        if (!data || data.top === undefined) return;

        const svg = paperDiv.querySelector("svg");
        if (!svg) return;

        // data.top is in abcjs's internal drawing units, which are the SVG's
        // viewBox units - not CSS pixels. responsive:"resize" scales the SVG up
        // to the container by exactly displayScale, so the offset has to be
        // scaled the same way. Without this every target is short by that
        // factor, and because the error grows with the line's depth it only
        // becomes obvious near the end of a long score.
        const svgRect = svg.getBoundingClientRect();
        const viewBoxHeight = svg.viewBox?.baseVal?.height || 0;
        const scale = viewBoxHeight ? svgRect.height / viewBoxHeight : 1;

        const absoluteLineTop = svgRect.top + window.scrollY + data.top * scale;
        const targetScrollTop = absoluteLineTop - window.innerHeight * 0.1;

        window.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      },
      qpm: tempo,
      extraMeasuresAtBeginning: 1, // This creates the count-in period where metronome plays
      lineEndAnticipation: 500, // Scroll 500ms before the line ends for smoother reading
      // Held at 16 whatever the mode is. abcjs reads this once when playback
      // starts, so pinning it lets the cursor mode be switched mid-session -
      // the callbacks read cursorMode live - without rebuilding the tune.
      beatSubdivisions: 16,
    });
  }

  /**
   * Rerenders the tune with current tempo and display size settings
   */
  async function rerenderTune() {
    if (!originalTuneString || !currentTune) {
      console.warn("No original tune string available for rerendering");
      return;
    }

    // The old audio buffer and note timings belong to the old render, so any
    // playback in flight has to end here rather than run against stale state.
    stopMusic();

    try {
      // Update the tempo in the ABC string
      let updatedTuneString = updateTempoInAbcString(
        originalTuneString,
        tempo
      );
      // Hiding is a render-time strip: originalTuneString keeps the annotated
      // version, so showing them again costs nothing and never regenerates.
      updatedTuneString = withChosenAnnotations(updatedTuneString);
      updatedTuneString = withChosenSound(updatedTuneString);

      // Clear any existing content in the paper div
      const paperDiv = document.getElementById("paper");
      if (paperDiv) {
        paperDiv.innerHTML = "";
      }

      const visualObj = abcjs.renderAbc(
        "paper",
        updatedTuneString,
        getAbcOptions()
      );

      // Check if rendering was successful
      if (!visualObj || !visualObj[0]) {
        throw new Error("Failed to rerender ABC notation - visualObj is empty");
      }

      selectableArray = visualObj[0].getSelectableArray();
      currentTune = visualObj[0];
      lastRenderWidth = document.getElementById("paper")?.clientWidth ?? 0;

      await attachCursorAndTiming();

      // Reset audio buffer since tempo may have changed
      audioBuffer = null;
      createSynth = null;
    } catch (err) {
      console.error("Error rerendering tune:", err);
    }
  }

  /**
   * Renders the ABC notation to the paper div
   * @returns {Promise<any>} The rendered visual object
   */
  async function renderTune(): Promise<any> {
    // Clear any existing content in the paper div
    const paperDiv = document.getElementById("paper");
    if (paperDiv) {
      paperDiv.innerHTML = "";
    }

    const visualObj = abcjs.renderAbc(
      "paper",
      withChosenSound(withChosenAnnotations(renderedString[0])),
      getAbcOptions()
    );

    // Check if rendering was successful
    if (!visualObj || !visualObj[0]) {
      throw new Error("Failed to render ABC notation - visualObj is empty");
    }

    selectableArray = visualObj[0].getSelectableArray();

    // Set currentTune early so the conditional shows the container
    currentTune = visualObj[0];

    await attachCursorAndTiming();

    return visualObj;
  }

  /** Brings the first system to the reading position. Called when playback
   *  starts, so the page settles during the count-in rather than lurching just
   *  as the music begins. Measured from the rendered rect, so no unit
   *  conversion is needed. */
  /** Where the first system currently is, or null if there is no score. */
  function firstSystemTarget(): number | null {
    const firstStaff = document
      .getElementById("paper")
      ?.querySelector(".abcjs-staff");
    if (!firstStaff) return null;
    const top = firstStaff.getBoundingClientRect().top + window.scrollY;
    return firstSystemScrollTarget(top, window.innerHeight);
  }

  /**
   * Send the page back to the first system, and make sure it got there.
   *
   * Measuring once, immediately, is not enough when a pass has just redrawn the
   * score. Annotations add a row to every system, so the whole layout moves and
   * the document changes height - and when it shrinks, the browser clamps the
   * scroll position out from under you. Aim in that moment and the scroll is
   * aimed at a layout that no longer exists, which is how a repeat that turned
   * the syllables on stopped short of the top.
   *
   * So: measure after the browser has actually laid the new score out, then
   * check once more that the target has not moved. The second check keys off
   * the TARGET moving and never off the distance still to travel - a smooth
   * scroll in flight is always far from its destination, and re-issuing on that
   * basis would restart the animation forever.
   */
  function scrollToFirstSystem() {
    const aim = () => {
      const target = firstSystemTarget();
      if (target === null) return;
      if (worthScrolling(target, window.scrollY)) {
        window.scrollTo({ top: target, behavior: "smooth" });
      }
      setTimeout(() => {
        const now = firstSystemTarget();
        if (now === null || !targetMoved(target, now)) return;
        if (!worthScrolling(now, window.scrollY)) return;
        window.scrollTo({ top: now, behavior: "smooth" });
      }, 450);
    };
    // Two frames: one for the browser to take the new score, one for it to lay
    // it out. Measuring inside the same frame as the redraw reads the old page.
    requestAnimationFrame(() => requestAnimationFrame(aim));
  }

  /**
   * Length of the one-measure count-in, in seconds.
   * The cursor timeline (extraMeasuresAtBeginning: 1) includes this measure,
   * but the rendered audio buffer starts at the first real note.
   */
  function getCountInDuration(): number {
    const beatsPerMeasure = parseInt(selectedTimeSignature[0]);
    return (60 / tempo) * beatsPerMeasure;
  }

  /** Total length of the timeline: count-in + the audio itself. */
  function getTimelineDuration(): number {
    return getCountInDuration() + (audioBuffer ? audioBuffer.duration : 0);
  }

  /**
   * Schedules the audio buffer so that timeline position `timelinePos`
   * (0 = downbeat of the count-in) is playing right now.
   * `startTime` is kept as the audioContext time of timeline position 0.
   *
   * `timelineZero` overrides that anchor with an exact audioContext time, which
   * a loop repeat uses to butt up against the previous pass instead of starting
   * from `currentTime` at whatever moment `onended` happened to be delivered.
   */
  function scheduleAudioFrom(
    timelinePos: number,
    timelineZero?: number
  ): boolean {
    if (!audioBuffer) return false;

    const countIn = getCountInDuration();
    const node = audioContext.createBufferSource();
    node.buffer = audioBuffer;
    node.connect(gainNode);
    node.onended = () => {
      // Ignore nodes we already replaced or stopped by hand.
      if (node !== sourceNode) return;
      if (!isPlaying) return;
      // A drill counts its passes, so it decides before the endless loop does.
      if (drillRunning) return advanceDrill();
      if (looping) startLoopRepeat();
      else stopMusic();
    };
    sourceNode = node;

    startTime = timelineZero ?? audioContext.currentTime - timelinePos;
    if (timelinePos < countIn) {
      // Still inside the count-in: schedule the music for when it ends.
      node.start(startTime + countIn, 0);
    } else if (timelineZero !== undefined && startTime + timelinePos > audioContext.currentTime) {
      // Anchored past the count-in - a repeat that skips it - with the anchor
      // still ahead: start exactly on it.
      node.start(startTime + timelinePos, timelinePos - countIn);
    } else {
      // Past the count-in: the buffer offset is the timeline position minus it.
      node.start(audioContext.currentTime, timelinePos - countIn);
      // A repeat with no count-in has no bar of slack, and `onended` arrives a
      // few milliseconds after the audio it reports, so its anchor has usually
      // gone by. Start now and move the anchor to match, so the cursor and the
      // next repeat follow the audio rather than a moment that has passed.
      startTime = audioContext.currentTime - timelinePos;
    }
    return true;
  }

  /**
   * Loop repeat: re-arms the buffer and the cursor for another pass.
   *
   * `onended` fires as the previous pass ends, so the new timeline zero is the
   * old one plus the full timeline - anchoring there keeps the repeats butted
   * together instead of drifting by however late the event was delivered. The
   * count-in measure repeats with it, which gives a breath between passes -
   * unless a practice run's repeat has asked for none, when the timeline is
   * entered at the first note instead: the count-in is only a stretch of the
   * cursor's timeline, so skipping it is a seek, and `startTime` still names
   * the (now skipped) downbeat of the count-in, so the pass after this one
   * anchors on the end of its audio exactly as before.
   */
  function startLoopRepeat() {
    // The node that just ended is spent; drop it before scheduling its successor
    // so stopSourceNode() inside stopMusic() can't try to stop it again.
    const nextZero = startTime + getTimelineDuration();
    const from = passCountInOverride === false ? getCountInDuration() : 0;
    sourceNode = null;
    timingCallbacks?.stop();
    pausedAt = 0;
    if (!scheduleAudioFrom(from, nextZero - from)) {
      stopMusic();
      return;
    }
    // 0 is a full reset, as before; past the count-in it is a seek to the first note.
    timingCallbacks?.start(from, "seconds");

    // The pass that just ended left the cursor collapsed past the last note and
    // the page scrolled to the final system. Put both back now, during the
    // count-in, which is exactly what playMusic() does for a fresh start - the
    // repeat previously began with no cursor and the score still at the bottom,
    // and only caught up when the first note sounded.
    //
    // Parking after start(0) is deliberate: the count-in's beatCallback reports
    // no position (position.left is undefined until the first real note), so it
    // will not overwrite this.
    parkPlaybackCursorAtStart();
    scrollToFirstSystem();
  }

  /**
   * Starts or resumes music playback
   */
  async function playMusic() {
    // If already playing, do nothing.
    if (isPlaying) {
      return;
    }

    // Ensure we have a tune to play.
    if (!currentTune) {
      alert("Please generate a tune first!");
      return;
    }
    // A run abandoned with the bar's Stop never reaches its own clean-up, so
    // whatever its last repeat silenced would stay silent. Outside a run every
    // sound is the reader's own. (Not in stopMusic: the run redraws through
    // rerenderTune, which stops the music on the way.)
    if (!drillRunning) clearPassSounds();
    // Block re-renders while we set up: rerenderTune() clears audioBuffer, and
    // isPlaying is still false during the await below, so nothing else would
    // hold it off.
    isStartingPlayback = true;
    try {
      // Make sure audio is initialized and we have a buffer. Re-check after the
      // await - a re-render during it can have cleared the buffer underneath us.
      for (let attempt = 0; attempt < 2 && !audioBuffer; attempt++) {
        const audioInitialized = await initAudio();
        if (!audioInitialized) return;
      }
      if (!audioBuffer) return;
    } finally {
      isStartingPlayback = false;
    }

    // Playback drives its own click from beatCallback, so hand off here rather
    // than at the top - a Play press that bails out above must not silence it.
    stopStandaloneMetronome();

    // A pause left us a position on the timeline; anything else starts over.
    let resumeFrom = pausedAt;
    if (resumeFrom >= getTimelineDuration()) resumeFrom = 0;
    const fromTheTop = resumeFrom === 0;
    // A repeat that asked for no count-in starts at its first note - here as
    // well as in startLoopRepeat, for the repeat whose redraw means it starts
    // fresh rather than butted against the pass before.
    if (fromTheTop && passCountInOverride === false) resumeFrom = getCountInDuration();

    // Never start the cursor and metronome without the instrument audio - that
    // is what produced a click-only playthrough.
    if (!scheduleAudioFrom(resumeFrom)) {
      console.warn("No audio buffer to schedule; not starting playback.");
      return;
    }
    pausedAt = 0;
    isPlaying = true;

    // Settle the page during the count-in, not on the downbeat.
    if (fromTheTop) scrollToFirstSystem();

    if (timingCallbacks) {
      if (resumeFrom > 0) {
        timingCallbacks.start(resumeFrom, "seconds");
      } else {
        // 0 forces a full reset so a previous pause can't leak into this run.
        timingCallbacks.start(0);
      }
    }
  }

  /**
   * Pauses music playback
   */
  function pauseMusic() {
    if (!isPlaying) return;

    // Where we are on the timeline, count-in included. Works during the
    // count-in too, when the buffer hasn't started sounding yet.
    pausedAt = Math.min(
      Math.max(0, audioContext.currentTime - startTime),
      getTimelineDuration()
    );

    stopSourceNode();
    isPlaying = false;
    if (timingCallbacks) {
      timingCallbacks.pause();
    }
  }

  /** Tears down the current buffer source without triggering its onended. */
  function stopSourceNode() {
    if (!sourceNode) return;
    const node = sourceNode;
    sourceNode = null;
    node.onended = null;
    try {
      node.stop();
    } catch (e) {
      // Already stopped, or never scheduled - nothing to do.
    }
  }

  /**
   * Stops music playback and resets playback state
   */
  function stopMusic() {
    isPlaying = false;
    pausedAt = 0;
    startTime = 0;
    stopSourceNode();
    if (timingCallbacks) {
      timingCallbacks.stop();
    }
    hidePlaybackCursor();
  }

  /**
   * @param {boolean} isDownbeat - Accent this click (beat 1 of the measure)
   * @param {number} when - audioContext time to sound at; defaults to right now.
   *   The standalone metronome passes an exact future time so its clicks are
   *   sample-accurate rather than drifting with the timer that queues them.
   */
  function playMetronomeClick(
    isDownbeat: boolean,
    when: number = audioContext ? audioContext.currentTime : 0
  ) {
    if (!audioContext || metronomeGainNode.gain.value === 0) return;

    const osc = audioContext.createOscillator();
    const clickGain = audioContext.createGain();

    osc.frequency.value = isDownbeat ? 1000 : 800;

    clickGain.gain.setValueAtTime(isDownbeat ? 2 : 1, when);

    clickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.03);

    osc.connect(clickGain);
    clickGain.connect(metronomeGainNode);
    osc.start(when);
    osc.stop(when + 0.03);
  }

  // Lookahead scheduling: a coarse timer queues clicks slightly ahead of time at
  // exact audioContext times, so the pulse doesn't drift the way a bare
  // setInterval would.
  const METRONOME_TICK_MS = 25; // how often we look for clicks to queue
  const METRONOME_LOOKAHEAD = 0.1; // how far ahead (seconds) we queue them
  const METRONOME_MAX_PER_TICK = 64; // belt-and-braces: never spin

  function scheduleMetronomeClicks() {
    if (!audioContext) return;

    // Clamp to 30-600 BPM so a corrupt stored tempo can't stall or spin the loop.
    const secondsPerBeat = Math.min(2, Math.max(0.1, 60 / (Number(tempo) || 60)));
    const beatsPerMeasure = parseInt(selectedTimeSignature[0]) || 4;

    // A backgrounded tab throttles this timer to ~1s, so we can come back to
    // find the next click is already overdue. Web Audio clamps a past start
    // time to "now", so queueing the backlog would fire several clicks at once
    // as one loud pop. Resync instead, and re-establish the downbeat.
    if (nextClickTime < audioContext.currentTime) {
      nextClickTime = audioContext.currentTime + 0.05;
      metronomeBeat = 0;
    }

    const horizon = audioContext.currentTime + METRONOME_LOOKAHEAD;
    let guard = 0;
    while (nextClickTime < horizon && guard++ < METRONOME_MAX_PER_TICK) {
      playMetronomeClick(metronomeBeat % beatsPerMeasure === 0, nextClickTime);
      nextClickTime += secondsPerBeat;
      metronomeBeat++;
    }
  }

  /** Starts the click on its own - no exercise audio, no cursor. */
  async function startStandaloneMetronome() {
    // Playback drives its own click; two sources would beat against each other.
    if (metronomeRunning || isPlaying || !audioContext) return;

    // The button click is the user gesture that unlocks audio.
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    metronomeBeat = 0;
    nextClickTime = audioContext.currentTime + 0.05;
    metronomeRunning = true;
    metronomeTimer = setInterval(scheduleMetronomeClicks, METRONOME_TICK_MS);
    scheduleMetronomeClicks(); // don't wait a full tick for the first click
  }

  function stopStandaloneMetronome() {
    metronomeRunning = false;
    if (metronomeTimer) {
      clearInterval(metronomeTimer);
      metronomeTimer = null;
    }
  }

  function toggleStandaloneMetronome() {
    if (metronomeRunning) stopStandaloneMetronome();
    else startStandaloneMetronome();
  }


  /**
   * Handles the generate button click, creates new sight reading exercise
   */
  /**
   * Generate, as a user action.
   *
   * Pressing Generate during a drill ends it: an explicit ask for a new
   * exercise outranks the schedule. The tempo goes back without a re-render,
   * since generating is about to write a fresh tune at it anyway.
   */
  async function handleClick() {
    if (drillRunning) await stopDrill(false);
    await generateExercise();
  }

  async function generateExercise() {
    // Client-side validation (scale degrees are irrelevant in rhythm-only mode)
    if (!rhythmOnly && !validateSettings(selectedScaleDegrees, maxSkip)) {
      error =
        "The gap between selected scale degrees is larger than the Max Skip. Please increase Max Skip or select more notes to fill the gap.";
      isLoading = false;
      return;
    }

    isLoading = true;
    error = null;

    try {
      // Validate rhythms first
      if (!validateSelectedRhythms(selectedRhythms)) {
        throw new Error("Please select at least one valid rhythm");
      }

      // Reset audio state for new tune
      stopMusic();
      audioBuffer = null; // Force re-initialization
      createSynth = null;
      currentTune = null;

      const params = {
        bpm,
        clef: selectedClef,
        timeSig:
          timeSignatures[selectedTimeSignature as keyof typeof timeSignatures],
        measures: measures,
        maxSkip: maxSkip,
        tempo: tempo,
        range: selectedRange,
        rhythms: selectedRhythms,
        scaleDegrees: Array.from(selectedScaleDegrees),
        selectedSharpDegrees: Array.from(selectedSharpDegrees),
        selectedFlatDegrees: Array.from(selectedFlatDegrees),

        selectedClef: selectedClef,
        selectedTimeSignature: selectedTimeSignature,
        key: selectedKey,
        // Always written in, whatever the buttons say - they strip at render,
        // so either can come back without regenerating the exercise.
        showSolfege: !rhythmOnly,
        lyricSystem,
        rhythmOnly: rhythmOnly,
        // Written into a pitched exercise too, not just the rhythm staff, so a
        // practice run can show them on its repeats. Stripped at render like
        // the solfège, so nothing appears until something asks for it.
        showRhythmSyllables: true,
        syllableSystemId,
        customSyllables: $mySyllables,
        allowTiesAcrossBarline,
        moveOnEighthNotes: moveEighthNotes,
        accidentalsFollowStep: accidentalsFollowStep,
        partsObject: {
          numofParts: 1,
          parts: {
            Unison: {
              order: 0,
              smallName: "U",
            },
          },
        },
      };

      // Validate parameters before sending
      if (!params.rhythms || params.rhythms.length === 0) {
        throw new Error("No rhythms selected");
      }
      if (
        !params.timeSig ||
        !params.timeSig.name ||
        !params.timeSig.tsPerMeasure
      ) {
        throw new Error("Invalid time signature");
      }
      if (!params.measures || params.measures <= 0) {
        throw new Error("Invalid number of measures");
      }
      if (!params.range || !params.range.min || !params.range.max) {
        throw new Error("Invalid range");
      }

      console.log(
        "Sending params to generate:",
        JSON.stringify(params, null, 2)
      );

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(params),
      });

      let text;
      try {
        text = await response.text();
      } catch (e) {
        throw new Error("Failed to read response body");
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse response as JSON:", text);
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}...`);
      }

      if (!response.ok) {
        console.error("Error response:", result);
        throw new Error(
          result.error || `HTTP error! status: ${response.status}`
        );
      }

      console.log("Response data:", result);

      if (result.success) {
        renderedString = result.data;
        originalTuneString = result.data[0]; // Store the original tune string
        currentScore = (result.data[2] as UnisonScore) ?? null;
        writtenSyllableSystem = syllableSystemId;
        writtenLyricSystem = lyricSystem;
        // A new exercise is not the one a link opened: the URL stops pointing at it.
        useExerciseScore(currentScore);
        exerciseHash = "";
        updateUrlFromState();
        await renderTune();
      } else {
        throw new Error(result.error || "Failed to generate music");
      }
    } catch (err) {
      console.error("Detailed error:", err);
      error = err instanceof Error ? err.message : "An error occurred";
    } finally {
      isLoading = false;
    }
  }

  /**
   * Practice run: generate, play, repeat, generate the next, get faster.
   *
   * Sight-reading practice is not one exercise - it is a session. Running one
   * by hand means pressing Generate, pressing Play, waiting, pressing Play
   * again, nudging the tempo up, pressing Generate: six actions per exercise,
   * every one of them a reason to stop paying attention to the music. This runs
   * the whole session and leaves the reader's hands free.
   *
   * Built on the existing loop machinery rather than beside it. A repeat pass
   * is exactly `startLoopRepeat()`, which already anchors the next pass to the
   * end of the last so the count-in butts up against it instead of drifting by
   * however late `onended` was delivered; the drill only decides whether to
   * take another pass, move on, or stop.
   */
  let drillExercises = 4;
  let drillRepeats = 2;
  /** Added to the tempo for each NEW exercise, not for each repeat. */
  let drillRampBpm = 0;
  /** Silence before each new exercise starts, to read it first. */
  let drillPreviewSeconds = 5;
  /** Cursor and auto-scroll off for the repeats, so the reader holds their own place. */
  /**
   * What the repeats look like.
   *
   * The first pass is always the reader's own settings - that is the pass they
   * are actually sight-reading. What changes is what they get on the way back
   * through: the cursor they were denied, or the syllables to check themselves
   * against.
   *
   * "same" leaves that half of the display alone, which is also what makes the
   * default free: if nothing differs, nothing is redrawn and the repeat butts
   * straight against the pass before it.
   */
  type PassCursor = "same" | CursorMode;
  type PassAnnotation = "same" | "none" | "kodaly" | "counting" | "solfege";
  let drillRepeatCursor: PassCursor = "same";
  let drillRepeatAnnotation: PassAnnotation = "same";
  /**
   * What the repeats sound like: the notes, the click and the drone. The first
   * pass is the one being read and keeps the reader's own controls; the repeats
   * are for singing it on your own, which is why a director wants the piano
   * gone from them. All three are live - a gain node, the beat callback and an
   * oscillator - so changing them costs nothing and a repeat still follows
   * straight on from the pass before.
   */
  let drillRepeatNotes: PassSwitch = "same";
  let drillRepeatMetronome: PassSwitch = "same";
  let drillRepeatDrone: PassSwitch = "same";
  /**
   * Whether a repeat starts with a bar of count-in. There is no count-in
   * control outside a run - every pass has one - so Same and On would say the
   * same thing, and only On and Off are offered.
   */
  let drillRepeatCountIn: "on" | "off" = "on";
  const passSwitchOptions: [PassSwitch, string][] = [
    ["same", "Same"],
    ["on", "On"],
    ["off", "Off"],
  ];
  /** Whether a repeat would sound nothing at all, which is worth saying. */
  $: repeatsSilent =
    !(passOverride(1, drillRepeatNotes) ?? masterVolume > 0) &&
    !(passOverride(1, drillRepeatMetronome) ?? isMetronomeOn) &&
    (rhythmOnly || !(passOverride(1, drillRepeatDrone) ?? dronePlaying));
  /** A count-in with nothing clicking in it is a bar of silence, also worth saying. */
  $: repeatCountInSilent =
    drillRepeatCountIn === "on" && !(passOverride(1, drillRepeatMetronome) ?? isMetronomeOn);

  /** The syllable system a repeat asks for, if it asks for one. */
  /**
   * Solfège names scale degrees, so it has nothing to say on the rhythm staff -
   * a rhythm-only exercise is not written with it and the option would be a
   * button that does nothing.
   */
  $: repeatAnnotationOptions = [
    ["same", "Same"],
    ["none", "None"],
    ["kodaly", "Kodály"],
    ["counting", "Counting"],
    ...(rhythmOnly ? [] : [["solfege", "Solfège"]]),
  ] as [PassAnnotation, string][];

  $: repeatSyllableSystem =
    drillRepeatAnnotation === "kodaly" || drillRepeatAnnotation === "counting"
      ? drillRepeatAnnotation
      : null;
  /**
   * The system the reader's own passes are labelled in, so a repeat in another
   * one can hand it back. A repeat's syllables are a re-label of the same
   * exercise, so the two passes can differ - which they could not when the run
   * had to write every exercise in the repeats' system.
   */
  let drillFirstSyllableSystem = defaultSyllableSystem.id;
  /** The reader's own annotation settings, kept so a run can hand them back. */
  let drillFirstSolfege = false;
  let drillFirstSyllables = false;

  /**
   * The settings are collapsed to start with: a run is five controls a director
   * sets once, and open by default they push the score off the page.
   */
  let drillPanelOpen = false;
  let drillRunning = false;
  let drillIndex = 0;
  let drillRepeat = 0;
  let drillStartBpm = 0;
  /** Counts down during the look-at-it pause; 0 when not waiting. */
  let drillCountdown = 0;
  let drillTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * What a repeat pass wants the cursor to do; null means the reader's own setting.
   *
   * Held apart from `cursorMode` rather than written into it. Overwriting the
   * real setting would put the run's choice in the URL and, if a run were
   * interrupted, leave it there for good.
   */
  let passCursorOverride: CursorMode | null = null;
  $: effectiveCursorMode = passCursorOverride ?? cursorMode;
  /**
   * Auto-scroll stops only when a REPEAT has deliberately silenced the cursor.
   * Turning the cursor off by hand has never stopped the page following the
   * music, and should not start now.
   */
  $: scrollSuppressed = passCursorOverride === "off";
  /**
   * What this pass does with the notes, the click and the drone; null means the
   * reader's own control. Held apart from their settings for the same reason as
   * passCursorOverride, and read inline where they apply rather than through a
   * `$:` copy - applyPassDisplay sets them outside Svelte's flush, and a
   * reactive copy would lag behind the pass it belongs to.
   */
  let passNotesOverride: boolean | null = null;
  let passMetronomeOverride: boolean | null = null;
  let passDroneOverride: boolean | null = null;
  /** False when this pass starts at its first note, with no bar of count-in. */
  let passCountInOverride: boolean | null = null;
  /**
   * Whether this pass of a PITCHED exercise shows rhythm syllables. Only a
   * repeat that asks for Kodaly or counting sets it; see withChosenAnnotations.
   * (On the rhythm staff the reader's own `showRhythmSyllables` decides.)
   */
  let passSyllables = false;

  /** Every sound back to the reader's own controls. */
  function clearPassSounds() {
    if (
      passNotesOverride === null &&
      passMetronomeOverride === null &&
      passDroneOverride === null &&
      passCountInOverride === null
    ) return;
    passNotesOverride = passMetronomeOverride = passDroneOverride = passCountInOverride = null;
    applyInstrumentGain();
    syncDrone();
  }

  $: drillSettings = {
    exercises: drillExercises,
    repeats: drillRepeats,
    rampBpm: drillRampBpm,
  };
  $: drillRampEndBpm = rampEndBpm(drillRunning ? drillStartBpm : bpm, drillSettings);

  /**
   * Where the run has got to, in one sentence.
   *
   * Derived once and shown in two places - the settings panel and the playback
   * bar - so they cannot drift apart. The bar is the one that matters: during a
   * run the reader is watching the score, not the panel.
   */
  $: drillStatusLine = drillRunning
    ? `Practice run · exercise ${drillIndex + 1} of ${drillExercises}, pass ${drillRepeat + 1} of ${drillRepeats}` +
      (drillCountdown > 0 ? ` · starts in ${drillCountdown}s` : "") +
      (drillRampBpm > 0 ? ` · ${bpm} BPM` : "")
    : null;

  function clearDrillTimer() {
    if (drillTimer !== null) {
      clearTimeout(drillTimer);
      drillTimer = null;
    }
  }

  /** A pause the reader can see the end of, and that Stop can cut short. */
  function drillPause(seconds: number): Promise<void> {
    if (seconds <= 0) return Promise.resolve();
    drillCountdown = seconds;
    return new Promise<void>((resolve) => {
      const tick = () => {
        if (!drillRunning) {
          drillCountdown = 0;
          resolve();
          return;
        }
        drillCountdown -= 1;
        if (drillCountdown <= 0) {
          drillCountdown = 0;
          drillTimer = null;
          resolve();
          return;
        }
        drillTimer = setTimeout(tick, 1000);
      };
      drillTimer = setTimeout(tick, 1000);
    });
  }

  /**
   * The runner, wired to this page.
   *
   * Everything it needs is a function here; it never touches a tune or a
   * buffer itself. That is what lets a test drive a whole run - passes only
   * end when audio ends, and an automated browser will not start audio at all.
   */
  let runner: PracticeRunner | null = null;

  function makeRunner(): PracticeRunner {
    return new PracticeRunner(
      {
        generate: async () => {
          try {
            await generateExercise();
          } catch (e) {
            console.error("Practice run: generation failed", e);
          }
        },
        canPlay: () => !error && !!currentTune,
        wait: (seconds) => drillPause(seconds),
        play: () => playMusic(),
        repeatPass: () => startLoopRepeat(),
        isPlaying: () => isPlaying,
        stopPlayback: () => stopMusic(),
        getBpm: () => bpm,
        setBpm: (next) => handleBpmChange(next),
        applyPassDisplay: async (pass) => {
          const first = pass === 0;

          // The cursor is read live by the playback callbacks, so this costs
          // nothing and never touches the score.
          passCursorOverride =
            first || drillRepeatCursor === "same" ? null : drillRepeatCursor;
          if ((passCursorOverride ?? cursorMode) === "off") hidePlaybackCursor();

          // The notes, the click and the drone are all live - the gain node,
          // the beat callback and an oscillator - so none of them touches the
          // score, and a repeat that changes only what it sounds like still
          // butts against the pass before. Set before the annotations below,
          // whose early returns would otherwise skip them.
          passNotesOverride = passOverride(pass, drillRepeatNotes);
          applyInstrumentGain();
          passMetronomeOverride = passOverride(pass, drillRepeatMetronome);
          // The drone sounds the tonic, which the rhythm staff does not have.
          passDroneOverride = rhythmOnly ? null : passOverride(pass, drillRepeatDrone);
          syncDrone();
          // Read when the repeat is scheduled (startLoopRepeat, playMusic). The
          // count-in is only a stretch of the cursor's timeline - the audio
          // holds none - so skipping it is a seek, not a redraw.
          passCountInOverride = passOverride(pass, drillRepeatCountIn);

          // The annotations are stripped as the score is drawn, so changing
          // them means drawing it again - and that is what costs the audio
          // timeline. Work out what is wanted before deciding anything.
          //
          // Rhythm syllables mean two different things by mode. On the rhythm
          // staff they are the reader's own setting, with its control right
          // there. On a pitched exercise nobody set them: the only way they
          // belong on one is a repeat that asks for Kodaly or counting. So the
          // pitched side has its own flag, and the rhythm-staff setting - which
          // is saved, and so easily left on - never reaches a pitched run.
          const syllablesShown = rhythmOnly ? showRhythmSyllables : passSyllables;
          let wantSolfege = showSolfege;
          let wantSyllables = rhythmOnly ? showRhythmSyllables : false;
          // The system the repeats ask for, or the reader's own on pass one.
          // A repeat in a different system is a re-label, not a new exercise:
          // the run used to write EVERY exercise in the repeat's system, which
          // is why choosing Kodaly to read and counting on the repeats gave
          // counting on both.
          let wantSystem = drillFirstSyllableSystem;
          if (!first && drillRepeatAnnotation !== "same") {
            wantSolfege = drillRepeatAnnotation === "solfege";
            wantSyllables =
              drillRepeatAnnotation === "kodaly" || drillRepeatAnnotation === "counting";
            if (repeatSyllableSystem) wantSystem = repeatSyllableSystem;
          } else if (first && drillRepeatAnnotation !== "same") {
            // Back to the reader's own, which is what the run started from.
            wantSolfege = drillFirstSolfege;
            wantSyllables = rhythmOnly ? drillFirstSyllables : false;
          }
          const sameDisplay =
            wantSolfege === showSolfege && wantSyllables === syllablesShown;
          if (sameDisplay && wantSystem === writtenSyllableSystem) return false;
          showSolfege = wantSolfege;
          if (rhythmOnly) showRhythmSyllables = wantSyllables;
          else passSyllables = wantSyllables;
          if (!currentTune || !originalTuneString) return false;
          // Only the syllables it will actually show need re-labelling.
          if (wantSyllables) relabelScore(wantSystem);
          await rerenderTune();
          return true;
        },
        rerender: async () => {
          if (currentTune && originalTuneString) await rerenderTune();
        },
        onChange: ({ running, index, repeat }) => {
          drillRunning = running;
          drillIndex = index;
          drillRepeat = repeat;
          if (!running) {
            drillCountdown = 0;
            clearDrillTimer();
          }
        },
        onError: (message) => {
          error = error ?? message;
        },
      },
      drillSettings,
      { readingSeconds: drillPreviewSeconds }
    );
  }

  async function startDrill() {
    if (drillRunning || isLoading) return;
    drillStartBpm = bpm;
    drillFirstSolfege = showSolfege;
    drillFirstSyllables = showRhythmSyllables;
    // The reader's own system, to come back to on every first pass. The run no
    // longer borrows the system it writes in - each pass re-labels instead.
    drillFirstSyllableSystem = syllableSystemId;
    // Tone only starts inside a click, and this is one. A repeat that brings in
    // a drone the reader never switched on starts it from a pass boundary,
    // where there is no click to start Tone with.
    void Tone.start();
    // Built fresh each time so a run uses the settings as they are at Start,
    // and cannot be half-reconfigured while it is going.
    runner = makeRunner();
    await runner.start();
  }

  /**
   * @param rerender - put the score back in step with the restored tempo.
   *   Skipped when the caller is about to generate anyway, since generating
   *   writes a fresh exercise at whatever the tempo is by then.
   */
  async function stopDrill(rerender = true) {
    await runner?.stop(rerender);
    // Back to the reader's own wording, whatever the repeats were showing.
    if (relabelScore(syllableSystemId) && currentTune && originalTuneString) {
      await rerenderTune();
    }
  }

  /** A pass just ended. Called from the buffer's `onended`. */
  function advanceDrill() {
    runner?.passEnded();
  }

  function validateSettings(
    degrees: Set<number>,
    maxSkipValue: number
  ): boolean {
    if (degrees.size <= 1) {
      return true; // Not enough notes to have a skip
    }

    const degreeArray = Array.from(degrees);
    const visited = new Set<number>();
    const queue: number[] = [degreeArray[0]]; // Start traversal from the first note.
    visited.add(degreeArray[0]);

    let head = 0;
    while (head < queue.length) {
      const currentNode = queue[head];
      head++;

      // Find all other selected degrees that are reachable from the current one.
      for (const potentialNeighbor of degreeArray) {
        if (visited.has(potentialNeighbor)) {
          continue;
        }

        // Calculate the shortest distance on the circular scale (1-7)
        const distance = Math.min(
          Math.abs(currentNode - potentialNeighbor),
          7 - Math.abs(currentNode - potentialNeighbor)
        );

        if (distance <= maxSkipValue) {
          visited.add(potentialNeighbor);
          queue.push(potentialNeighbor);
        }
      }
    }

    // If the number of visited notes equals the total number of selected notes,
    // the set of notes is fully connected.
    return visited.size === degrees.size;
  }

  /**
   * Updates the selected range for note generation
   * @param {Object} newRange - The new range object with min and max values
   */
  function handleRangeChange(newRange: { min: number; max: number }) {
    selectedRange = newRange;
    console.log("Range changed:", selectedRange); // Debug
  }

  /**
   * Toggles a scale degree selection
   * @param {number} degree - The scale degree to toggle
   */
  function toggleScaleDegree(degree: number) {
    if (selectedScaleDegrees.has(degree)) {
      selectedScaleDegrees.delete(degree);
    } else {
      selectedScaleDegrees.add(degree);
    }
    selectedScaleDegrees = selectedScaleDegrees; // Trigger reactivity
  }

  /**
   * Toggles a sharp scale degree selection
   * @param {number} degree - The scale degree to toggle
   */
  function toggleSharpDegree(degree: number) {
    if (selectedSharpDegrees.has(degree)) {
      selectedSharpDegrees.delete(degree);
    } else {
      selectedSharpDegrees.add(degree);
    }
    selectedSharpDegrees = selectedSharpDegrees; // Trigger reactivity
  }

  /**
   * Toggles a flat scale degree selection
   * @param {number} degree - The scale degree to toggle
   */
  function toggleFlatDegree(degree: number) {
    if (selectedFlatDegrees.has(degree)) {
      selectedFlatDegrees.delete(degree);
    } else {
      selectedFlatDegrees.add(degree);
    }
    selectedFlatDegrees = selectedFlatDegrees; // Trigger reactivity
  }

  /**
   * Updates the selected clef and adjusts note range accordingly
   * @param {string} clef - The clef to switch to
   */
  function updateClef(clef: string) {
    selectedClef = clef;
    // change ranges based on clef
    switch (clef) {
      case "treble":
        selectedRange = { ...DEFAULT_TREBLE_RANGE };
        break;
      case "bass":
        selectedRange = { min: 7, max: 14 };
        break;
      case "alto":
        selectedRange = { min: 12, max: 19 };
        break;
      case "tenor":
        selectedRange = { min: 10, max: 17 };
        break;
    }
  }

  // Add state variables
  let dronePlaying = false;
  let droneOscillator: Tone.Oscillator | null = null;
  let droneVolume = new Tone.Volume(-12).toDestination(); // Default volume at -12dB
  let currentDroneVolume = -12; // Track current volume for the slider

  /**
   * Handles changes to the main audio volume
   * @param {Event} event - The input event from the volume slider
   */
  function handleVolumeChange(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    masterVolume = value;
    isMuted = masterVolume === 0;
    applyInstrumentGain();
  }

  /**
   * Toggles the main audio mute state
   */
  function toggleMute() {
    isMuted = !isMuted;
    if (isMuted) {
      previousVolume = masterVolume;
      masterVolume = 0;
    } else {
      masterVolume = previousVolume === 0 ? 0.5 : previousVolume;
    }
    applyInstrumentGain();
  }

  /**
   * The instrument's gain: the reader's volume, unless a practice run's repeat
   * says otherwise.
   *
   * A silent repeat is the run's doing, not a setting, so the slider and the
   * mute button go on showing the reader's own value, and moving them during a
   * silent pass takes effect at the next pass that sounds. A repeat set to On
   * plays even when the reader has muted the piano - that is what asking for
   * it means - at the level they had before muting.
   */
  function applyInstrumentGain() {
    if (!gainNode) return;
    if (passNotesOverride === null) {
      gainNode.gain.value = masterVolume * 0.7;
    } else if (passNotesOverride) {
      const level = masterVolume > 0 ? masterVolume : previousVolume > 0 ? previousVolume : 0.5;
      gainNode.gain.value = level * 0.7;
    } else {
      gainNode.gain.value = 0;
    }
  }

  function handleMetronomeVolumeChange(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    metronomeVolume = value;
    if (metronomeGainNode) {
      metronomeGainNode.gain.value = metronomeVolume * 2;
    }
  }

  /**
   * Toggles the drone sound on/off
   *
   * `dronePlaying` is the reader's setting - the button's label and pressed
   * state - and a practice run's repeat may override it without touching it.
   */
  function toggleDrone() {
    dronePlaying = !dronePlaying;
    syncDrone();
  }

  /**
   * Start or stop the drone to match what should be sounding: the reader's
   * button, unless this pass says otherwise. Safe to call at every pass
   * boundary - it only acts when the two disagree.
   */
  function syncDrone() {
    const wanted = passDroneOverride ?? dronePlaying;
    if (wanted && !droneOscillator) {
      Tone.start();
      const rootNote = getRootNoteFrequency(selectedKey);
      droneOscillator = new Tone.Oscillator({
        frequency: rootNote,
        type: "sine",
      })
        .connect(droneVolume)
        .start();
    } else if (!wanted && droneOscillator) {
      droneOscillator.stop();
      droneOscillator = null;
    }
  }

  /**
   * Handles changes to the drone volume
   * @param {Event} event - The input event from the volume slider
   */
  function handleDroneVolumeChange(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    currentDroneVolume = value;
    droneVolume.volume.value = value;
  }

  /**
   * Gets the frequency for a given key's root note
   * @param {string} key - The musical key
   * @returns {number} The frequency in Hz
   */
  function getRootNoteFrequency(key: string): number {
    const keyMap: Record<string, number> = {
      C: 60,
      G: 67,
      D: 62,
      A: 69,
      E: 64,
      B: 71,
      F: 65,
      Bb: 58,
      Eb: 63,
      Ab: 56,
      Db: 61,
    };
    return Tone.Frequency(keyMap[key], "midi").toFrequency();
  }

  // ── PlaybackBar handlers ───────────────────────────────────────────────────
  /** Moves the playback cursor to the first note without sounding anything.
   *  Coordinates are abcjs drawing units, the same space beatCallback uses. */
  function parkPlaybackCursorAtStart() {
    const first = selectableArray[0];
    // The pass's cursor, not the reader's: a repeat with the cursor off was
    // parked visible at the start and then never moved.
    if ((passCursorOverride ?? cursorMode) === "off") {
      hidePlaybackCursor();
      return;
    }
    if (!playbackCursor || !first?.absEl || !first?.staffPos) {
      hidePlaybackCursor();
      return;
    }
    const x = Math.max(0, first.absEl.x - 2);
    playbackCursor.setAttribute("x1", String(x));
    playbackCursor.setAttribute("x2", String(x));
    playbackCursor.setAttribute("y1", String(first.staffPos.top - 10));
    playbackCursor.setAttribute("y2", String(first.staffPos.top + 80));
  }

  /** Back-to-start cues the top and leaves it there. Starting playback is the
   *  Play button's job - this used to call playMusic() and take that decision
   *  away from you. */
  function handleRestart() {
    stopMusic();
    parkPlaybackCursorAtStart();
  }
  function handleToggleLoop() { looping = !looping; }
  /** Live readout while dragging - cheap, no re-render. */
  function handleBpmChange(newBpm: number) {
    tempo = newBpm;
    bpm = newBpm;
  }

  /** Commit on release: re-rendering per input event would stop playback and
   *  re-render dozens of times during a single drag. */
  function handleBpmCommit(newBpm: number) {
    handleBpmChange(newBpm);
    if (currentTune && originalTuneString) rerenderTune();
  }
  /** A link that opens these settings, and writes a new exercise from them. */
  function settingsLink(): string {
    updateUrlFromState();
    return window.location.href.split("#")[0];
  }
  function handlePrint() { window.print(); }

  /** The exercise as it is drawn: the annotations that are on, in the chosen sound. */
  const shownAbc = () => withChosenSound(withChosenAnnotations(originalTuneString ?? ""));

  /** Save a file of the exercise on screen, named for its key and meter. */
  function save(type: ExportType, data: BlobPart) {
    const { key, meter } = keyAndMeterOf(shownAbc());
    const name = exportFileName(
      rhythmOnly ? { page: "rhythm", meter } : { page: "unison", key, meter },
      type
    );
    downloadFile(data, name, EXPORT_TYPES[type].mime);
  }

  /**
   * What Print / Export offers: the exercise as shown, at the tempo playing
   * now. Unison ABC has no title line, so the MusicXML is given one.
   */
  $: exports = [
    {
      id: "musicxml",
      label: "MusicXML",
      detail: "Opens in MuseScore, Finale, Sibelius, Dorico",
      disabled: !currentTune,
      run: () => {
        const abc = shownAbc();
        const { key } = keyAndMeterOf(abc);
        save(
          "musicxml",
          abcToMusicXml(abc, {
            tempo,
            title: rhythmOnly ? "Rhythm Exercise" : `Sight Reading Exercise - ${key ?? ""}`.trim(),
            defaultPartName: rhythmOnly ? "Rhythm" : "Voice",
          })
        );
      },
    },
    {
      id: "midi",
      label: "MIDI",
      detail: "What you hear, at this tempo",
      disabled: !currentTune,
      run: () => save("midi", midiFileFor(shownAbc(), { bpm: tempo, transpose: transposeSemitones })),
    },
    {
      id: "abc",
      label: "ABC notation",
      detail: "The text the score is written in",
      disabled: !currentTune,
      run: () => save("abc", withTempo(shownAbc(), tempo)),
    },
  ];

  // abcjs's responsive mode scales the score but never reflows it, so a real
  // width change needs a re-render. Observe the container rather than the
  // window: it also catches layout changes that fire no resize event, and it
  // runs after layout so clientWidth is already settled.
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRenderWidth = 0;
  /** True while playMusic is awaiting audio init, when isPlaying is still false. */
  let isStartingPlayback = false;
  let paperObserver: ResizeObserver | null = null;

  function onPaperResize() {
    const paper = document.getElementById("paper");
    if (!paper) return;
    // Hysteresis: re-rendering changes #paper's height, which would otherwise
    // feed straight back into this observer.
    if (Math.abs(paper.clientWidth - lastRenderWidth) < 24) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyViewportChange, 250);
  }

  /** rerenderTune() calls stopMusic(), which tears down startTime/pausedAt and
   *  the timing callbacks - so never re-render mid-exercise. Defer instead. */
  function applyViewportChange() {
    if (!currentTune || !originalTuneString) return;
    if (isPlaying || isStartingPlayback || metronomeRunning) {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyViewportChange, 500);
      return;
    }
    lastRenderWidth = document.getElementById("paper")?.clientWidth ?? 0;
    rerenderTune();
  }

  /**
   * Show the exercise a link carries, without generating anything.
   *
   * The settings in the link have already loaded. The panel's meter, key and
   * clef follow the exercise, so the metronome counts its bars; the score is
   * written out with every annotation, as a generated one is, and the display
   * settings strip what is not wanted.
   */
  async function openLinkedExercise(value: string) {
    if (isLoading) return;
    isLoading = true;
    error = null;
    try {
      const opened = await unpackExercise(value, "unison");
      if (!opened.ok) {
        if (opened.problem === "wrong-page" && opened.kind) {
          window.location.replace(PAGE_FOR[opened.kind] + exerciseFragment(value));
          return;
        }
        error = linkProblemMessage(opened.problem);
        exerciseHash = "";
        updateUrlFromState();
        return;
      }
      if (opened.exercise.kind !== "unison") return;
      const score = opened.exercise.score;
      if (drillRunning) await stopDrill(false);
      stopMusic();
      audioBuffer = null;
      createSynth = null;
      currentTune = null;

      rhythmOnly = score.staff === "rhythm";
      if (score.timeSig.name in timeSignatures) selectedTimeSignature = score.timeSig.name;
      if (score.key && possibleKeys.includes(score.key)) selectedKey = score.key;
      if (score.clef && clefOptions.includes(score.clef)) selectedClef = score.clef;

      currentScore = score;
      originalTuneString = assembleUnisonAbc(score, {
        showSolfege: !rhythmOnly,
        lyricSystem,
        showRhythmSyllables: true,
        syllableSystemId,
        customSyllables: $mySyllables,
      });
      writtenSyllableSystem = syllableSystemId;
      writtenLyricSystem = lyricSystem;
      renderedString = [originalTuneString, [], score];
      exerciseHash = exerciseFragment(value);
      useExerciseScore(score);
      updateUrlFromState();
      await renderTune();
    } catch (err) {
      console.error("Could not open the linked exercise:", err);
      error = linkProblemMessage("invalid");
    } finally {
      isLoading = false;
    }
  }

  /** A link pasted over this one changes only the hash, which reloads nothing. */
  function onHashChange() {
    const value = exerciseParam(window.location.hash);
    if (value && exerciseFragment(value) !== exerciseHash) openLinkedExercise(value);
  }

  onMount(() => {
    const paper = document.getElementById("paper");
    if (paper && typeof ResizeObserver !== "undefined") {
      lastRenderWidth = paper.clientWidth;
      paperObserver = new ResizeObserver(onPaperResize);
      paperObserver.observe(paper);
    }
    // Belt and braces for browsers that coalesce the observer on rotation.
    window.addEventListener("orientationchange", onPaperResize);
    loadMySyllables().catch(() => {});
    // A link to a ladder step, from the other page's picker or a class's plan.
    const linkedStep = ladderById[linkedStepId ?? ""];
    if (linkedStep) applyLadderStep(linkedStep);
    const linked = exerciseParam(window.location.hash);
    if (linked) openLinkedExercise(linked);
    window.addEventListener("hashchange", onHashChange);
  });

  onDestroy(() => {
    paperObserver?.disconnect();
    window.removeEventListener("orientationchange", onPaperResize);
    window.removeEventListener("hashchange", onHashChange);
    if (resizeTimer) clearTimeout(resizeTimer);
    stopStandaloneMetronome();
    if (droneOscillator) {
      droneOscillator.stop();
      droneOscillator = null;
    }
    Tone.Transport.stop();
  });

  // Add this function to validate selected rhythms
  function validateSelectedRhythms(rhythms: Rhythm[]) {
    if (!rhythms || rhythms.length === 0) {
      console.error("No rhythms selected");
      return false;
    }

    console.log("Selected rhythms:", rhythms);
    let totalWeight = 0;
    rhythms.forEach((rhythm) => {
      if (!rhythm || typeof rhythm.weight !== "number") {
        console.error("Invalid rhythm object:", rhythm);
        return false;
      }
      totalWeight += rhythm.weight;
    });

    if (totalWeight === 0) {
      console.error("All selected rhythms have zero weight");
      return false;
    }

    return true;
  }

  // Add this function to create the pitch cursor
  // Add this function to update the pitch cursor position
  function updatePitchCursor(index: number) {
    if (!pitchCursor || !selectableArray[index]) return;

    const note = selectableArray[index];
    if (note?.absEl?.x && note?.absEl?.y) {
      const x = note.absEl.x + 10; // Offset slightly to the right of the note
      const height = 80; // Height of the cursor line
      pitchCursor.setAttribute("x1", x.toString());
      pitchCursor.setAttribute("x2", x.toString());
      pitchCursor.setAttribute("y1", (note.staffPos.top - 10).toString());
      pitchCursor.setAttribute("y2", (note.staffPos.top + height).toString());
    }
  }

  // Add event listener for note progression
  if (typeof window !== "undefined") {
    window.addEventListener("noteProgression", ((event: CustomEvent) => {
      updatePitchCursor(event.detail.index);
    }) as EventListener);
  }
</script>

<div class="w-full" style="padding-bottom: calc(var(--bottom-bar-h, 96px) + env(safe-area-inset-bottom, 0px) + 1rem)">
  <!-- Preset bar: the same one as choral, over unison's own saved list. The
       built-in UIL and difficulty presets are choral settings, so they are not
       offered here. -->
  <PresetDropdown
    store={UNISON_PRESET_STORE}
    showBuiltins={false}
    activeLabel={activePresetLabel}
    {activeSavedId}
    edited={presetEdited}
    onRevert={revertPreset}
    page="unison"
    onSelectStep={applyLadderStep}
    {activeStepId}
    currentParams={() => currentOptions}
    onSelectSaved={applySavedPreset}
    onRenamed={(p) => { if (p.id === activeSavedId) { activePresetLabel = p.name; revertPreset = () => applySavedPreset(p); } }}
    onDelete={(id) => { if (id === activeSavedId) { activePresetLabel = ''; activeSavedId = null; revertPreset = undefined; } }}
  />

  <main class="flex flex-col items-center w-full max-w-5xl mx-auto px-2 md:px-4">

    {#if error}
      <div class="w-full mt-4 rounded-lg border border-sr-brass bg-sr-brass-bg p-4 no-print">
        <p class="text-sm text-sr-brass">{error}</p>
      </div>
    {/if}

    <!-- Tab panel -->
    <div class="tab-panel sr-panel w-full my-4 no-print">

      <!-- Tab bar -->
      <div class="sr-bar flex items-stretch">
        <div class="flex items-center overflow-x-auto tab-scroll">
        {#each visibleTabs as tab}
          <button
            type="button"
            class="sr-tab px-4 py-3 sm:py-2 -mb-px shrink-0 whitespace-nowrap
              {selectedTab === tab ? 'sr-on' : ''}"
            on:click={() => (selectedTab = tab)}
          >
            {({'setup':'Setup','rhythm':'Rhythm','notes':'Notes','range':'Range'})[tab] ?? tab}
            {#if (tab === 'setup' && setupDirty) || (tab === 'rhythm' && rhythmDirty) || (tab === 'notes' && notesDirty) || (tab === 'range' && rangeDirty)}
              <span class="sr-pip inline-block w-1.5 h-1.5 rounded-full ml-1 mb-0.5 align-middle"></span>
            {/if}
          </button>
        {/each}
        </div>

        <!-- Generate button always visible in tab bar -->
        <button
          class="sr-btn ml-auto mr-2 my-1.5 shrink-0 flex items-center gap-1.5"
          on:click={handleClick}
          disabled={isLoading}
        >
          <RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
          <span>Generate</span>
        </button>
      </div>

      <!-- Tab content -->
      <div class="p-4">

        <!-- Setup Tab -->
        {#if selectedTab === 'setup'}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div class="space-y-2 col-span-1 sm:col-span-2">
              <p class="sr-label">Mode</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Mode">
                <button
                  class="sr-tok {!rhythmOnly ? 'sr-on' : ''}"
                  on:click={() => (rhythmOnly = false)}
                >Pitched</button>
                <button
                  class="sr-tok {rhythmOnly ? 'sr-on' : ''}"
                  on:click={() => (rhythmOnly = true)}
                >Rhythm only</button>
              </div>
            </div>

            {#if !rhythmOnly}
              <div class="space-y-2">
                <p class="sr-label">Key</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Key">
                  {#each possibleKeys as key}
                    <button
                      class="sr-tok {selectedKey === key ? 'sr-on' : ''}"
                      on:click={() => (selectedKey = key)}
                    >{key}</button>
                  {/each}
                </div>
              </div>

              <div class="space-y-2">
                <p class="sr-label">Clef</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Clef">
                  {#each clefOptions as clef}
                    <button
                      class="sr-tok {selectedClef === clef ? 'sr-on' : ''}"
                      on:click={() => updateClef(clef)}
                    >{clef}</button>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="space-y-2">
              <p class="sr-label">Time Signature</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Time Signature">
                {#each Object.keys(timeSignatures) as ts}
                  <button
                    class="sr-tok {selectedTimeSignature === ts ? 'sr-on' : ''}"
                    on:click={() => { selectedTimeSignature = ts; metronomeBeat = 0; }}
                  >{ts}</button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <p class="sr-label">Measures</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Measures">
                {#each measureOptions as opt}
                  <button
                    class="sr-tok {measures === opt ? 'sr-on' : ''}"
                    on:click={() => (measures = opt)}
                  >{opt}</button>
                {/each}
              </div>
            </div>
          </div>

          <!-- How the exercise is shown and played, as opposed to what gets
               written. None of these regenerate anything. -->
          <section class="mt-6 rounded border border-sr-hairline bg-sr-raise p-4" aria-labelledby="score-options-heading">
            <h3 id="score-options-heading" class="text-sm font-semibold text-sr-ink mb-1">Score options</h3>
            <p class="text-xs text-sr-faint mb-4">How the exercise is shown and played. Changing these keeps the exercise on screen.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div class="space-y-2">
              <p class="sr-label">Playback sound</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Playback sound">
                {#if rhythmOnly}
                  {#each RHYTHM_SOUNDS as sound}
                    <button
                      class="sr-tok {rhythmSoundId === sound.id ? 'sr-on' : ''}"
                      on:click={() => handleSoundChange(sound.id)}
                      aria-pressed={rhythmSoundId === sound.id}
                    >{sound.label}</button>
                  {/each}
                {:else}
                  {#each INSTRUMENTS as instrument}
                    <button
                      class="sr-tok {instrumentProgram === instrument.program ? 'sr-on' : ''}"
                      on:click={() => handleSoundChange(instrument.program)}
                      aria-pressed={instrumentProgram === instrument.program}
                    >{instrument.label}</button>
                  {/each}
                {/if}
              </div>
              <p class="text-xs text-sr-faint">
                {rhythmOnly
                  ? (rhythmSoundFor(rhythmSoundId).kind === "click"
                      ? "A click - every note sounds the same length. Good for attacks."
                      : "Sustains, so a held note is heard held.")
                  : "Changes the sound straight away - the exercise stays as it is."}
              </p>
            </div>

            <div class="space-y-2">
              <p class="sr-label">Playback transpose</p>
              <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Playback transpose">
                <button
                  class="sr-btn-quiet disabled:opacity-40"
                  on:click={() => handleTransposeChange(transposeSemitones - 1)}
                  disabled={transposeSemitones <= MIN_TRANSPOSE}
                  aria-label="Transpose playback down a semitone"
                >−</button>
                <span class="px-2 text-sm tabular-nums min-w-[3.5rem] text-center">
                  {transposeSemitones > 0 ? "+" : ""}{transposeSemitones}
                </span>
                <button
                  class="sr-btn-quiet disabled:opacity-40"
                  on:click={() => handleTransposeChange(transposeSemitones + 1)}
                  disabled={transposeSemitones >= MAX_TRANSPOSE}
                  aria-label="Transpose playback up a semitone"
                >+</button>
                {#if transposeSemitones !== 0}
                  <button
                    class="sr-btn-quiet"
                    on:click={() => handleTransposeChange(0)}
                  >Reset</button>
                {/if}
              </div>
              <p class="text-xs text-sr-faint">
                {transposeLabel(selectedKey, transposeSemitones)} The score is unchanged.
              </p>
            </div>

            <!-- Pitched exercises only. Rhythm-only has no scale degrees to
                 name, and its syllables live in the Rhythm tab - the one
                 place they are set. -->
            {#if !rhythmOnly}
            <div class="space-y-2">
              <p class="sr-label">Annotations</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Annotations">
                {#each lyricSystems as [value, label]}
                  <button
                    class="sr-tok {showSolfege && lyricSystem === value ? 'sr-on' : ''}"
                    on:click={() => handleLyricSystem(value)}
                    aria-pressed={showSolfege && lyricSystem === value}
                  >{label}</button>
                {/each}
              </div>
              <p class="text-xs text-sr-faint">
                {#if !showSolfege}
                  Clean - the same exercise, printed for sight-reading.
                {:else if lyricSystem === "movable"}
                  Movable do under the staff - do is the tonic, so a tune reads the same in
                  every key.
                {:else if lyricSystem === "fixed"}
                  Fixed do under the staff - C is do whatever the key.
                {:else}
                  The note names under the staff.
                {/if}
              </p>
            </div>
            {/if}

            <div class="space-y-2">
              <p class="sr-label">Cursor</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Cursor">
                {#each cursorModes as mode}
                  <button
                    class="sr-tok {cursorMode === mode ? 'sr-on' : ''}"
                    on:click={() => (cursorMode = mode)}
                    aria-pressed={cursorMode === mode}
                  >{cursorModeLabels[mode]}</button>
                {/each}
              </div>
              <p class="text-xs text-sr-faint">
                {cursorMode === "off"
                  ? "No cursor during playback."
                  : cursorMode === "smooth"
                    ? "Travels along with the music."
                    : cursorMode === "beat"
                      ? "Steps on every beat."
                      : "Lands on each note and waits there."}
              </p>
            </div>
            </div>
          </section>

          <!-- Practice run. Its own box after Score options, since the repeat
               settings below refer to the cursor "above". -->
          <section class="mt-6 rounded border border-sr-hairline bg-sr-raise p-4 space-y-4" aria-labelledby="practice-run-heading">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                class="flex items-start gap-2 text-left"
                aria-expanded={drillPanelOpen}
                aria-controls="practice-run-settings"
                on:click={() => (drillPanelOpen = !drillPanelOpen)}
              >
                <span class="text-sr-muted mt-0.5">
                  {#if drillPanelOpen}<ChevronDown size={16} />{:else}<ChevronRight size={16} />{/if}
                </span>
                <span>
                  <span id="practice-run-heading" class="block text-sm font-semibold text-sr-ink">Practice Run</span>
                  <span class="block text-xs text-sr-faint mt-0.5">
                    Generates and plays a whole session, hands free.
                  </span>
                </span>
              </button>
              {#if drillRunning}
                <button
                  class="sr-btn-quiet font-semibold text-sr-danger border-sr-danger"
                  on:click={() => stopDrill()}
                >Stop run</button>
              {:else}
                <button
                  class="sr-btn"
                  on:click={startDrill}
                  disabled={isLoading}
                >Start run</button>
              {/if}
            </div>

            {#if drillStatusLine}
              <p class="text-sm text-sr-action-fg bg-sr-tint rounded px-3 py-2">
                {drillStatusLine}
              </p>
            {/if}

            <div id="practice-run-settings" class:hidden={!drillPanelOpen} class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div class="space-y-2">
                <p class="sr-label">New Exercises</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="New exercises in a run">
                  {#each [1, 2, 4, 6, 8, 12] as n}
                    <button
                      class="sr-tok {drillExercises === n ? 'sr-on' : ''}"
                      on:click={() => (drillExercises = n)}
                      aria-pressed={drillExercises === n}
                    >{n}</button>
                  {/each}
                </div>
                <p class="text-xs text-sr-faint">A new exercise is written for each one.</p>
              </div>

              <div class="space-y-2">
                <p class="sr-label">Passes Each</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Passes of each exercise">
                  {#each [1, 2, 3, 4] as n}
                    <button
                      class="sr-tok {drillRepeats === n ? 'sr-on' : ''}"
                      on:click={() => (drillRepeats = n)}
                      aria-pressed={drillRepeats === n}
                    >{n}</button>
                  {/each}
                </div>
                <p class="text-xs text-sr-faint">How many times each exercise is played before the next.</p>
              </div>

              <div class="space-y-2">
                <p class="sr-label">Speed Ramp</p>
                <div class="flex flex-wrap items-center gap-3" role="group" aria-label="Speed ramp">
                  <input
                    type="range" min="0" max="20" step="2"
                    bind:value={drillRampBpm}
                    class="w-40 sr-range"
                    aria-label="Tempo added per new exercise"
                    disabled={drillRunning}
                  />
                  <span class="text-sm font-semibold whitespace-nowrap">+{drillRampBpm} BPM</span>
                </div>
                <p class="text-xs text-sr-faint">
                  {#if drillRampBpm === 0}
                    Every exercise at {bpm} BPM.
                  {:else}
                    Each new exercise is faster: {drillRunning ? drillStartBpm : bpm} up to {drillRampEndBpm} BPM. The tempo goes back when the run ends.
                  {/if}
                </p>
              </div>

              <div class="space-y-2">
                <p class="sr-label">Reading Time</p>
                <div class="flex flex-wrap items-center gap-3" role="group" aria-label="Reading time">
                  <input
                    type="range" min="0" max="30" step="1"
                    bind:value={drillPreviewSeconds}
                    class="w-40 sr-range"
                    aria-label="Seconds to read a new exercise before it plays"
                  />
                  <span class="text-sm font-semibold whitespace-nowrap">{drillPreviewSeconds}s</span>
                </div>
                <p class="text-xs text-sr-faint">
                  {drillPreviewSeconds === 0
                    ? "Each new exercise starts straight away."
                    : "Silence to scan a new exercise before it plays."}
                </p>
              </div>

              <div class="space-y-2 sm:col-span-2 border-t border-sr-hairline pt-3">
                <p class="sr-label">On The Repeats</p>
                <p class="text-xs text-sr-faint">
                  The first pass is always your own settings - that is the one
                  being sight-read. These are what comes back on the way through again.
                </p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-1">
                  <div class="space-y-2">
                    <p class="sr-label">Repeat Cursor</p>
                    <div class="flex flex-wrap gap-2" role="group" aria-label="Cursor on the repeats">
                      {#each [['same', 'Same'], ...cursorModes.map((m) => [m, cursorModeLabels[m]])] as [value, label]}
                        <button
                          class="sr-tok {drillRepeatCursor === value ? 'sr-on' : ''}"
                          on:click={() => (drillRepeatCursor = value)}
                          aria-label={`Repeat cursor: ${label}`}
                          aria-pressed={drillRepeatCursor === value}
                        >{label}</button>
                      {/each}
                    </div>
                    <p class="text-xs text-sr-faint">
                      {drillRepeatCursor === 'same'
                        ? 'The repeats follow the cursor setting above.'
                        : drillRepeatCursor === 'off'
                          ? 'No cursor and no auto-scroll on the repeats, so the reader holds their own place.'
                          : 'The repeats use this cursor instead.'}
                    </p>
                  </div>

                  <div class="space-y-2">
                    <p class="sr-label">Repeat Annotations</p>
                    <div class="flex flex-wrap gap-2" role="group" aria-label="Annotations on the repeats">
                      {#each repeatAnnotationOptions as [value, label]}
                        <button
                          class="sr-tok {drillRepeatAnnotation === value ? 'sr-on' : ''}"
                          on:click={() => (drillRepeatAnnotation = value)}
                          aria-label={`Repeat annotations: ${label}`}
                          aria-pressed={drillRepeatAnnotation === value}
                        >{label}</button>
                      {/each}
                    </div>
                    <p class="text-xs text-sr-faint">
                      {#if drillRepeatAnnotation === 'same'}
                        The repeats show whatever the first pass showed.
                      {:else if drillRepeatAnnotation === 'none'}
                        Read it clean on the way back through as well.
                      {:else if drillRepeatAnnotation === 'solfege'}
                        Solfège under the notes on the repeats, to check yourself against.
                      {:else}
                        {drillRepeatAnnotation === 'kodaly' ? 'Kodály' : 'Counting'} syllables on the repeats,
                        whatever the first pass is read in. Your own system comes back on the
                        next exercise and when the run ends.
                      {/if}
                    </p>
                  </div>

                  <div class="space-y-2">
                    <p class="sr-label">Repeat {rhythmOnly ? 'Percussion' : 'Piano'}</p>
                    <div class="flex flex-wrap gap-2" role="group" aria-label={`${rhythmOnly ? 'Percussion' : 'Piano'} on the repeats`}>
                      {#each passSwitchOptions as [value, label]}
                        <button
                          class="sr-tok {drillRepeatNotes === value ? 'sr-on' : ''}"
                          on:click={() => (drillRepeatNotes = value)}
                          aria-label={`Repeat ${rhythmOnly ? 'percussion' : 'piano'}: ${label}`}
                          aria-pressed={drillRepeatNotes === value}
                        >{label}</button>
                      {/each}
                    </div>
                    <p class="text-xs text-sr-faint">
                      {drillRepeatNotes === 'same'
                        ? `The repeats play the ${rhythmOnly ? 'percussion' : 'notes'} if the first pass does.`
                        : drillRepeatNotes === 'on'
                          ? `The ${rhythmOnly ? 'percussion plays' : 'notes play'} on the repeats, even with the volume muted.`
                          : `Nothing played on the repeats - ${rhythmOnly ? 'clap' : 'sing'} it on your own. The volume stays where you set it.`}
                    </p>
                  </div>

                  <div class="space-y-2">
                    <p class="sr-label">Repeat Metronome</p>
                    <div class="flex flex-wrap gap-2" role="group" aria-label="Metronome on the repeats">
                      {#each passSwitchOptions as [value, label]}
                        <button
                          class="sr-tok {drillRepeatMetronome === value ? 'sr-on' : ''}"
                          on:click={() => (drillRepeatMetronome = value)}
                          aria-label={`Repeat metronome: ${label}`}
                          aria-pressed={drillRepeatMetronome === value}
                        >{label}</button>
                      {/each}
                    </div>
                    <p class="text-xs text-sr-faint">
                      {drillRepeatMetronome === 'same'
                        ? 'The repeats click if the metronome is on.'
                        : drillRepeatMetronome === 'on'
                          ? 'The click comes in on the repeats, even with the metronome off.'
                          : 'No click on the repeats - keep the beat yourself.'}
                    </p>
                  </div>

                  <div class="space-y-2">
                    <p class="sr-label">Repeat Count-In</p>
                    <div class="flex flex-wrap gap-2" role="group" aria-label="Count-in before the repeats">
                      {#each [['on', 'On'], ['off', 'Off']] as [value, label]}
                        <button
                          class="sr-tok {drillRepeatCountIn === value ? 'sr-on' : ''}"
                          on:click={() => (drillRepeatCountIn = value === 'off' ? 'off' : 'on')}
                          aria-label={`Repeat count-in: ${label}`}
                          aria-pressed={drillRepeatCountIn === value}
                        >{label}</button>
                      {/each}
                    </div>
                    <p class="text-xs text-sr-faint">
                      {drillRepeatCountIn === 'on'
                        ? 'A bar of count-in before each repeat, as before the first pass.'
                        : 'The repeat follows straight on from the last note, with no bar in between.'}
                    </p>
                  </div>

                  {#if !rhythmOnly}
                    <div class="space-y-2">
                      <p class="sr-label">Repeat Drone</p>
                      <div class="flex flex-wrap gap-2" role="group" aria-label="Drone on the repeats">
                        {#each passSwitchOptions as [value, label]}
                          <button
                            class="sr-tok {drillRepeatDrone === value ? 'sr-on' : ''}"
                            on:click={() => (drillRepeatDrone = value)}
                            aria-label={`Repeat drone: ${label}`}
                            aria-pressed={drillRepeatDrone === value}
                          >{label}</button>
                        {/each}
                      </div>
                      <p class="text-xs text-sr-faint">
                        {drillRepeatDrone === 'same'
                          ? 'The drone is left as you set it.'
                          : drillRepeatDrone === 'on'
                            ? 'The tonic sounds under the repeats, to hold the key by.'
                            : 'The drone stops for the repeats and comes back after.'}
                      </p>
                    </div>
                  {/if}
                </div>

                {#if repeatsSilent}
                  <p class="text-xs text-sr-faint">
                    Nothing sounds on the repeats. The music still runs, so a repeat takes
                    exactly as long as the first pass - only the cursor moves.
                  </p>
                {:else if repeatCountInSilent}
                  <p class="text-xs text-sr-faint">
                    With no click on the repeats, their count-in is a silent bar - the repeat
                    still waits it out.
                  </p>
                {/if}

                {#if drillRepeatAnnotation !== 'same'}
                  <p class="text-xs text-sr-faint">
                    Changing what is written on the score means drawing it again, so a repeat
                    that changes the annotations starts from the count-in rather than following
                    straight on.
                  </p>
                {/if}
              </div>
            </div>
            </div>
          </section>

        <!-- Rhythm Tab -->
        {:else if selectedTab === 'rhythm'}
          <div class="space-y-3">
            <p class="sr-label">Select Allowed Rhythms</p>
            {#each rhythmPickerGroups(filterRhythms) as group}
            <p class="text-xs text-sr-faint">{group.label}</p>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Select Allowed Rhythms: {group.label}">
              {#each group.rhythms as rhythm}
                <button
                  class="sr-tok-sq px-2 py-1 h-12 min-w-12 flex items-center justify-center
                    {selectedRhythms.some((r) => r?.name === rhythm.name)
                      ? 'sr-on'
                      : ''}"
                  aria-label={rhythmLabel(rhythm.name)}
                  aria-pressed={selectedRhythms.some((r) => r?.name === rhythm.name)}
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
            {/each}

            <!-- Applies in both modes: without it, a selection that cannot
                 tile the measure (half notes alone in 3/4) has no valid
                 output at all. -->
            <div class="space-y-2 pt-1">
              <p class="sr-label">
                Ties Across Barline
              </p>
              <button
                class="sr-tok {allowTiesAcrossBarline ? 'sr-on' : ''}"
                on:click={() => (allowTiesAcrossBarline = !allowTiesAcrossBarline)}
                aria-label="Ties across barline"
                aria-pressed={allowTiesAcrossBarline}
              >{allowTiesAcrossBarline ? 'On' : 'Off'}</button>
              <p class="text-xs text-sr-faint">
                {allowTiesAcrossBarline
                  ? 'A long note may run past the barline, written as tied notes.'
                  : 'Every note stays inside its measure.'}
              </p>
            </div>

            {#if rhythmOnly}
              <!-- The one place rhythm syllables are set. Only meaningful on
                   the one-line staff, where there are no scale degrees and
                   solfege is unavailable. -->
              <div class="space-y-2 pt-1">
                <p class="sr-label">
                  Rhythm Syllables
                </p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Rhythm Syllables">
                  <button
                    class="sr-tok {!showRhythmSyllables ? 'sr-on' : ''}"
                    on:click={() => setRhythmSyllables('off')}
                    aria-pressed={!showRhythmSyllables}
                  >Off</button>
                  <!-- Driven by the registry, so a new system is a data change
                       here as well as in the generator. -->
                  {#each Object.values(syllableSystems) as system}
                    <button
                      class="sr-tok {showRhythmSyllables && syllableSystemId === system.id ? 'sr-on' : ''}"
                      on:click={() => setRhythmSyllables(system.id)}
                      aria-pressed={showRhythmSyllables && syllableSystemId === system.id}
                    >{system.label}</button>
                  {/each}
                  {#if $mySyllables}
                    <button
                      class="sr-tok {showRhythmSyllables && syllableSystemId === CUSTOM_SYLLABLE_ID ? 'sr-on' : ''}"
                      on:click={() => setRhythmSyllables(CUSTOM_SYLLABLE_ID)}
                      aria-pressed={showRhythmSyllables && syllableSystemId === CUSTOM_SYLLABLE_ID}
                      title="Your own syllables, from your account"
                    >Mine</button>
                  {/if}
                </div>
                <p class="text-xs text-sr-faint">
                  {showRhythmSyllables
                    ? syllableHint
                    : 'No syllables. The exercise is unchanged - turning them back on costs nothing.'}
                  {#if $mySyllables}
                    <a class="underline ml-1" href="/account#syllables">Edit mine</a>
                  {:else if $syllablesAvailable}
                    <a class="underline ml-1" href="/account#syllables">Use your own syllables</a>
                  {/if}
                </p>
                <SignupHint id="own-syllables">Want the words your choir uses - ta-a, ti-ka, whatever you teach?</SignupHint>
              </div>
            {/if}
          </div>

        <!-- Notes Tab -->
        {:else if selectedTab === 'notes'}
          <div class="space-y-5">
            <!-- Scale Degrees -->
            <div class="space-y-2">
              <p class="sr-label">Scale Degrees</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Scale Degrees">
                {#each sharpScaleDegrees as degree}
                  <button
                    class="sr-tok px-2
                      {selectedSharpDegrees.has(degree.value) ? 'sr-on' : ''}
                      {degree.value === 1 ? 'sm:ml-5' : degree.value === 4 ? 'sm:ml-10' : ''}"
                    on:click={() => toggleSharpDegree(degree.value)}
                  >{degree.display}</button>
                {/each}
              </div>
              <div class="flex flex-wrap gap-2">
                {#each scaleDegrees as degree}
                  <button
                    class="sr-tok {selectedScaleDegrees.has(degree) ? 'sr-on' : ''}"
                    on:click={() => toggleScaleDegree(degree)}
                  >{degree}</button>
                {/each}
              </div>
              <div class="flex flex-wrap gap-2">
                {#each flatScaleDegrees as degree}
                  <button
                    class="sr-tok px-2
                      {selectedFlatDegrees.has(degree.value) ? 'sr-on' : ''}
                      {degree.value === 2 ? 'sm:ml-5' : degree.value === 5 ? 'sm:ml-10' : ''}"
                    on:click={() => toggleFlatDegree(degree.value)}
                  >{degree.display}</button>
                {/each}
              </div>
            </div>

            <!-- Max Skip -->
            <div class="space-y-2">
              <p class="sr-label">Max Melodic Skip</p>
              <div class="flex flex-wrap items-center gap-3" role="group" aria-label="Max Melodic Skip">
                <button type="button" class="sr-btn-quiet"
                  aria-label="Decrease max skip"
                  on:click={() => { if (maxSkip > 1) maxSkip -= 1; }}><Minus size={16} /></button>
                <span class="text-sm font-bold w-6 text-center">{maxSkip}</span>
                <button type="button" class="sr-btn-quiet"
                  aria-label="Increase max skip"
                  on:click={() => { if (maxSkip < 8) maxSkip += 1; }}><Plus size={16} /></button>
                <span class="text-xs text-sr-faint">{skipIntervalNames[maxSkip] ?? `${maxSkip} steps`}</span>
              </div>
            </div>

            <!-- Toggles -->
            <div class="space-y-2">
              <p class="sr-label">Accidentals Follow Step</p>
              <button
                class="sr-tok {accidentalsFollowStep ? 'sr-on' : ''}"
                on:click={() => (accidentalsFollowStep = !accidentalsFollowStep)}
                aria-label="Accidentals follow step"
                aria-pressed={accidentalsFollowStep}
              >{accidentalsFollowStep ? 'On' : 'Off'}</button>
            </div>

            <div class="space-y-2">
              <p class="sr-label">Move 8th Notes</p>
              <button
                class="sr-tok {moveEighthNotes ? 'sr-on' : ''}"
                on:click={() => (moveEighthNotes = !moveEighthNotes)}
                aria-label="Move 8th notes"
                aria-pressed={moveEighthNotes}
              >{moveEighthNotes ? 'On' : 'Off'}</button>
            </div>

            <!-- The second solfège switch that used to sit here set the flag
                 and never redrew the score, so it looked broken until something
                 else did. One control, in Setup > Annotations, beside the other
                 things that change what is printed. -->
          </div>

        <!-- Range Tab -->
        {:else if selectedTab === 'range'}
          <div class="space-y-3">
            <p class="sr-label">Note Range</p>
            <RangeSelector
              range={selectedRange}
              clef={selectedClef}
              onRangeChange={handleRangeChange}
            />
          </div>
        {/if}

      </div>
    </div>

    <!-- Music Display -->
    <div class="relative w-full">
      <div
        id="paper"
        class="sr-sheet w-full my-2"
      >
        {#if isLoading}
          <div class="flex items-center justify-center h-48">
            <div class="text-slate-500 text-sm">Generating exercise…</div>
          </div>
        {/if}
      </div>
    </div>

    <!-- While playing, leave a viewport's worth of room below the score. The
         document otherwise ends at the last system, so the browser clamps the
         scroll and the final lines can never rise to the reading position. -->
    {#if isPlaying}
      <div aria-hidden="true" class="w-full" style="height: 75vh"></div>
    {/if}

    <div class="h-4"></div>
  </main>

  <!-- Sticky playback bar. The unison-only audio controls ride in its "extra"
       slot, so mobile gets one bar instead of two stacked ones. Slot content is
       compiled in this component's scope, so every handler below still binds
       directly to local state. -->
  <PlaybackBar
    {isPlaying}
    bpm={tempo}
    {looping}
    voiceNames={[]}
    mutedVoices={new Set()}
    hasExercise={currentTune !== null}
    onPlay={playMusic}
    onPause={pauseMusic}
    onStop={stopMusic}
    onRestart={handleRestart}
    onBpmChange={handleBpmChange}
    onBpmCommit={handleBpmCommit}
    onGenerate={handleClick}
    isGenerating={isLoading}
    status={drillStatusLine}
    onToggleLoop={handleToggleLoop}
    onToggleMute={() => {}}
    {settingsLink}
    {exerciseLink}
    onPrint={handlePrint}
    {exports}
  >
    <svelte:fragment slot="extra">
      <TunerWidget buttonClass="flex items-center gap-1 bg-slate-600 hover:bg-slate-500 rounded px-3 py-2 sm:py-1 text-xs" />
      <!-- Instrument volume (the percussion level in rhythm-only mode) -->
      <div class="flex items-center gap-2">
        <button
          class="flex-shrink-0 opacity-80 hover:opacity-100 flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8"
          on:click={toggleMute}
          title={rhythmOnly ? 'Toggle percussion' : 'Toggle piano'}
          aria-label={rhythmOnly ? 'Toggle percussion' : 'Toggle piano'}
        >
          <Piano size={22} />
        </button>
        <input
          type="range" min="0" max="1" step="0.05"
          bind:value={masterVolume}
          on:input={handleVolumeChange}
          class="w-16 accent-teal-400"
          aria-label={rhythmOnly ? 'Percussion volume' : 'Piano volume'}
        />
      </div>

      <!-- Metronome -->
      <div class="flex items-center gap-2">
        <button
          class="flex-shrink-0 opacity-80 hover:opacity-100 flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8"
          on:click={() => (isMetronomeOn = !isMetronomeOn)}
          title="Toggle metronome"
          aria-label="Toggle metronome click during playback"
          aria-pressed={isMetronomeOn}
        >
          <MetronomeIcon size={22} />
        </button>
        <input
          type="range" min="0" max="1" step="0.05"
          bind:value={metronomeVolume}
          on:input={handleMetronomeVolumeChange}
          class="w-16 accent-teal-400"
          aria-label="Metronome volume"
        />
        <button
          class="rounded px-3 py-2 sm:py-0.5 text-xs font-semibold disabled:opacity-40 {metronomeRunning ? 'bg-amber-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}"
          on:click={toggleStandaloneMetronome}
          disabled={isPlaying}
          aria-pressed={metronomeRunning}
          title="Free-running click, no playback"
        >{metronomeRunning ? 'Click On' : 'Click'}</button>
      </div>

      {#if !rhythmOnly}
        <div class="w-px h-5 bg-slate-600 hidden sm:block"></div>

        <!-- Drone (sounds the tonic, so pitched mode only) -->
        <div class="flex items-center gap-2">
          <button
            class="rounded px-3 py-2 sm:py-0.5 text-xs font-semibold {dronePlaying ? 'bg-amber-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}"
            on:click={toggleDrone}
            aria-pressed={dronePlaying}
          >{dronePlaying ? 'Drone On' : 'Drone'}</button>
          {#if dronePlaying}
            <input
              type="range" min="-60" max="0" step="1"
              value={currentDroneVolume}
              on:input={handleDroneVolumeChange}
              class="w-16 accent-amber-400"
              aria-label="Drone volume"
            />
            <span class="text-xs text-slate-400">{currentDroneVolume}dB</span>
          {/if}
        </div>
      {/if}

      <div class="w-px h-5 bg-slate-600 hidden sm:block"></div>

      <!-- Display size -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400 uppercase tracking-wide">Size</span>
        <button
          class="flex items-center justify-center bg-slate-600 hover:bg-slate-500 rounded h-11 w-9 sm:h-6 sm:w-6"
          on:click={() => { displayScale = Math.max(0.5, displayScale - 0.1); if (currentTune && originalTuneString) rerenderTune(); }}
          aria-label="Decrease score size"
        ><Minus size={14} /></button>
        <span class="text-xs font-bold w-8 text-center">{displayScale.toFixed(1)}x</span>
        <button
          class="flex items-center justify-center bg-slate-600 hover:bg-slate-500 rounded h-11 w-9 sm:h-6 sm:w-6"
          on:click={() => { displayScale = Math.min(3, displayScale + 0.1); if (currentTune && originalTuneString) rerenderTune(); }}
          aria-label="Increase score size"
        ><Plus size={14} /></button>
      </div>
    </svelte:fragment>
  </PlaybackBar>
</div>

<style>
  :global(.abcjs-pitch-cursor) {
    stroke: #1411c4;
    stroke-width: 2;
    pointer-events: none;
    transition: all 0.3s ease;
  }

  /* Improve scrolling on music display */
  #paper {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e0 #f7fafc;
    min-height: 200px;

    width: 100%;
  }

  #paper::-webkit-scrollbar {
    height: 8px;
    width: 8px;
  }

  #paper::-webkit-scrollbar-track {
    background: #f7fafc;
    border-radius: 4px;
  }

  #paper::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 4px;
  }

  #paper::-webkit-scrollbar-thumb:hover {
    background: #a0aec0;
  }

  /* Ensure SVG content is properly displayed and centered */
  /* Horizontal-scroll fallback for a score too wide to shrink further */
  .tab-scroll {
    scrollbar-width: none;
  }
  .tab-scroll::-webkit-scrollbar {
    display: none;
  }
</style>
