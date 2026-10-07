<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import abcjs from "abcjs";
  import type { TimingCallbacks } from "abcjs";
  import RangeSelector from "./ui/rangeSelector.svelte";
  import { rhythms, type Rhythm } from "../resources/rhythms";
  import { tuner } from "../lib/tuner/store";
  import { SampleBank, type ClickLevel } from "../lib/tuner/click-sounds";
  import { scheduleClick } from "../lib/playback-click";
  import { barCount, drawnLines, evenLines, isDense, measuresPerLine } from "../lib/score-layout";
  import { PracticeRunner, rampEndBpm, passOverride, runOptionsFrom, RUN_DEFAULTS, type PassSwitch, type RunOptions } from "../lib/practice-run";
  import { rhythmLabel } from "../lib/rhythm-labels";
  import {
    firstSystemScrollTarget,
    worthScrolling,
    scrollToReadingPosition,
    revealNextLine,
    systemOf,
    targetMoved,
  } from "../lib/scroll-to-system";
  import { assembleUnisonAbc, withDynamics, type UnisonScore } from "../lib/generateUnison";
  import { DYNAMIC_MARKS, dynamicsSetFrom, toggleDynamic, type DynamicMark } from "../lib/dynamics";
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
    abcFileFor,
    type ExportType,
  } from "../lib/exports";
  import { downloadFile } from "../lib/download";
  import {
    beatsOf,
    beatSymbolOf,
    COMPOUND_METER_NAMES,
    EXERCISE_METER_NAMES,
    isCompound,
    meterKindOf,
    resolveMeter,
    SIMPLE_METER_NAMES,
    tempoField,
    timeSignaturesFor,
  } from "../lib/meter";
  import type { LyricSystem } from "../resources/solfege";
  import PresetDropdown from "./PresetDropdown.svelte";
  import ToolsWheel from "./tools/ToolsWheel.svelte";
  import { setPracticeContext } from "../lib/tools/context";
  import SignupHint from "./SignupHint.svelte";
  import GenerationLimit from "./GenerationLimit.svelte";
  import CountInBadge from "./CountInBadge.svelte";
  import { countInBeats, countInMeasures, hideCountIn, meterOf, showCountIn } from "../lib/count-in";
  import AssignmentBanner from "./AssignmentBanner.svelte";
  import { assignmentIdFromUrl, fetchAssignment, type OpenAssignment } from "../lib/assignment-client";
  import { startPractice } from "../lib/practice-tracker";
  import { ASSIGNMENT_PARAM } from "../lib/practice";
  import { countGeneration, mayGenerate, usage } from "../lib/usage";
  import { revealScore } from "../lib/reveal-score";
  import { activePresetToRestore, rememberActivePreset, restoredSignature, type ActivePresetRecord } from "../lib/active-preset";
  import { linkedPresetId, openLinkedPreset } from "../lib/preset-link";
  import GradePanel from "./GradePanel.svelte";
  import TapPad from "./TapPad.svelte";
  import { ClapListener } from "../lib/clap-listener";
  import { detectClaps } from "../lib/clap-detect";
  import { GradeRunner } from "../lib/grade-runner";
  import { gradeSchedule, STRICTNESS, type GradeNote, type GradeRest } from "../lib/grade";
  import { clearGradeFeedback, drawGradeFeedback, revealTo } from "../lib/grade-feedback";
  import { saveGradeRun, sendGradeRun, startGradeRecording, type GradeRecording } from "../lib/grade-recording";
  import { TakePlayer, noteAt } from "../lib/grade-playback";
  import { createFullscreen } from "../lib/fullscreen";
  import { loadScoreView, saveScoreView, withLineSpacing, withMeasureNumbers, type ScoreView } from "../lib/score-view";
  import { styleCopyright, withCopyright } from "../lib/copyright";
  import { DETECT_LATENCY_MS } from "../lib/grade";
  import type { GradeTrace } from "../lib/grade-runner";
  import { solfegeOf } from "../lib/grade";
  import { billingStatus } from "../lib/billing-client";
  import { signedInUser } from "../lib/auth-client";
  import { initTuner, micInput, startTuner, stopTuner } from "../lib/tuner/controller";
  import { exerciseInfo } from "../lib/tools/context";
  import { NOTES } from "../lib/tuner/pitch";
  import { applyClick, clickFrom, numberIn } from "../lib/preset-click";
  import { exercisePlays, linkPageTempo, metronomeSounding, setClickWithMusic, toggleMetronome } from "../lib/tools/metronome-link";
  import { UNISON_PRESET_STORE, type SavedPreset } from "../lib/preset-storage";
  import { landablePolicy, type SkipDir } from "../lib/skip-policy";
  import {
    ALL_LAND_ON, DEGREE_NAMES, DIR_ARROWS, LAND_ON_CHOICES, NO_LANDING_MESSAGE, SKIP_CHIPS, addExtraSkip, degreesConnected, withoutShortSkips,
    policyFor, readSkipParams, setExactOn, skipSettingsFrom, togglePattern, toggleLandOn, writeSkipParams, PAGE_DEFAULT_LAND_ON,
    type SkipSettings,
  } from "../lib/skip-settings";
  import {
    readShortSkipParams, eighthsFrom, capsFor, MAX_SKIP_RANGE,
  } from "../lib/short-note-skips";
  import { nyssmaById, nyssmaVoiceLevels, type NyssmaLevel } from "../lib/nyssma-presets";
  import { ladderById, rangeForSpan, rangeForStep, stepHref, stepLabel, STEP_PARAM, type LadderStep } from "../lib/ladder";
  import {
    drawFromPool, meterPoolClick, parsePool, parseSpan, presetSignature, poolFrom, sameKindPool, setupSnapshot, spanFrom, togglePoolMember,
    type Span,
  } from "../lib/unison-pools";
  import {
    DEFAULT_RHYTHM_NAMES,
    resolveRhythmSelection,
    rhythmPickerGroups,
    selectableCompoundRhythms,
    selectableRhythms,
    selectableRhythmsFor,
    switchRhythmKind,
    type RhythmMemory,
  } from "../lib/selectable-rhythms";
  import {
    crossedWholeBeat,
    metronomeClickFor,
    newMetronomeBeatState,
  } from "../lib/metronome-beats";
  import * as Tone from "tone";
  import MetronomeIcon from "./ui/metronomeIcon.svelte";
  import {
    MAJOR_KEYS, MINOR_KEYS, MINOR_DEGREES, MINOR_SHARPS, MINOR_FLATS, DEFAULT_MINOR_DEGREES,
    isMinorKey, minorLabel, minorScaleName, degreesFrom,
  } from "../lib/minor-degrees";
  import { minorSolfegeFrom, type MinorSolfege } from "../resources/solfege";
  import { Piano, Minus, Plus, RefreshCw, ChevronDown, ChevronRight, X, Clapperboard, Volume2 } from "lucide-svelte";
  import PlaybackBar from "./PlaybackBar.svelte";
  import PlayAlongVideo from "./PlayAlongVideo.svelte";
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
  // Major keys, then their relative minors (minor-degrees.ts): one pool, a row each.
  const possibleKeys = [...MAJOR_KEYS, ...MINOR_KEYS];
  const timeSignatures = timeSignaturesFor(EXERCISE_METER_NAMES);
  /** The meter picker: simple meters, then compound. */
  const meterGroups = [
    { label: "Simple", names: SIMPLE_METER_NAMES },
    { label: "Compound", names: COMPOUND_METER_NAMES },
  ];
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
  // The metronome - on or off with the music, its level, and ticking on its
  // own - is the page's one metronome, in the tuner store: see metronome-link.

  // Initialize Web Audio API components
  // ── Assignment ─────────────────────────────────────────────────────────────
  // Read at start: the URL sync rewrites the address from the page's state.
  const assignmentId = assignmentIdFromUrl();
  let assignment: OpenAssignment | null = null;

  /** Opens an assignment: its preset applied, the settings locked while it is open. */
  async function openAssignment(id: string) {
    const a = await fetchAssignment(id, "unison");
    if (!a) return;
    const kind = a.presetKey.slice(0, a.presetKey.indexOf(":"));
    const rest = a.presetKey.slice(a.presetKey.indexOf(":") + 1);
    if (kind === "step" && ladderById[rest]) applyLadderStep(ladderById[rest]);
    else if (kind === "saved" && a.params) applySavedPreset(a.params as SavedPreset<any>);
    assignment = a;
    updateUrlFromState();
  }

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
      metronomeGainNode.gain.value = tuner.get().metronomeVolume * 2;
      metronomeGainNode.connect(audioContext.destination);
      // The Tools metronome's samples, so the click here sounds like it.
      void clickBank.load(audioContext);

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

    // A minor key's degrees and how it is sung (minor-degrees.ts).
    const minorDegrees = degreesFrom(getParam("minorDegrees"), MINOR_DEGREES);
    if (minorDegrees) options.minorScaleDegrees = minorDegrees;
    if (urlParams.has("minorSharps")) options.minorSharpDegrees = degreesFrom(getParam("minorSharps"), MINOR_SHARPS) ?? [];
    if (urlParams.has("minorFlats")) options.minorFlatDegrees = degreesFrom(getParam("minorFlats"), MINOR_FLATS) ?? [];
    if (urlParams.has("minorSolfege")) options.minorSolfege = minorSolfegeFrom(getParam("minorSolfege"));

    // One key, or several to draw from ("C,F"). An old link names one.
    const keys = parsePool(getParam("key"), possibleKeys);
    if (keys.length > 0) {
      options.selectedKeys = keys;
      options.selectedKey = keys[0];
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

    // One meter, or several of one kind to draw from ("4/4,2/4").
    const meters = sameKindPool(parsePool(getParam("timeSignature"), Object.keys(timeSignatures)));
    if (meters.length > 0) {
      options.selectedTimeSignatures = meters;
      options.selectedTimeSignature = meters[0];
    }
    // A range that follows the key (a NYSSMA level): scale steps around do,
    // placed on the do at or above `anchor` for each key drawn.
    const span = parseSpan(getParam("span"));
    const anchor = parseInt(getParam("anchor") || "", 10);
    if (span && !isNaN(anchor)) {
      options.rangeSpan = span;
      options.rangeAnchor = anchor;
    }

    const m = parseInt(getParam("measures") || "", 10);
    if (!isNaN(m) && measureOptions.includes(m)) {
      options.measures = m;
    }

    const s = parseInt(getParam("maxSkip") || "", 10);
    if (!isNaN(s) && maxSkipOptions.includes(s)) {
      options.maxSkip = s;
    }

    // Exact skips (skip-settings.ts). A link without them is in Max skip mode.
    const skips = readSkipParams(urlParams);
    if (skips) Object.assign(options, skips);

    // The tempo slider's range. 30-120 turned a link made at 132 into one at 60.
    const b = parseInt(getParam("bpm") || "", 10);
    if (!isNaN(b) && b >= 40 && b <= 200) {
      options.bpm = b;
      options.tempo = b;
    }

    if (urlParams.has("accidentals"))
      options.accidentals = getParam("accidentals") === "true";
    // Old links carry moveEighthNotes; new ones Max 8th / 16th skip (short-note-skips.ts).
    if (urlParams.has("moveEighthNotes"))
      options.moveEighthNotes = getParam("moveEighthNotes") === "true";
    Object.assign(options, readShortSkipParams(urlParams));
    if (urlParams.has("pairsOnePitch")) options.eighthPairsOnePitch = getParam("pairsOnePitch") === "true";
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
    if (urlParams.has("progressions")) options.progressions = getParam("progressions") !== "false";

    const cursor = getParam("cursor");
    if (isCursorMode(cursor)) {
      options.cursorMode = cursor;
    }

    const syllableSystem = getParam("syllableSystem");
    if (isChosenSyllableSystem(syllableSystem)) {
      options.syllableSystemId = syllableSystem;
    }

    if (urlParams.has("dynamics")) options.dynamics = dynamicsSetFrom(getParam("dynamics"));

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

  /**
   * Resolve saved rhythm names against what the meter's kind offers - see
   * resolveRhythmSelection. Never empty: a bad ?rhythms= falls back to the
   * kind's defaults.
   */
  function resolveSelectedRhythms(names: unknown, meter: string = "4/4"): Rhythm[] {
    return resolveRhythmSelection(names, meterKindOf(meter));
  }

  const rhythmSvgs = Object.fromEntries(
    [...selectableRhythms, ...selectableCompoundRhythms].map((rhythm) => [
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
    // Pools of keys and meters; options from before pools hold one of each.
    // A meter pool is one kind, and the rhythms are resolved for its first meter.
    const keys = poolFrom(options.selectedKeys, options.selectedKey, possibleKeys, "F");
    const meters = sameKindPool(poolFrom(options.selectedTimeSignatures, ts, Object.keys(timeSignatures), "4/4"));
    const selectedRange = options.selectedRange || { ...DEFAULT_TREBLE_RANGE };
    return {
      selectedClef: options.selectedClef || "treble",
      selectedRange,
      selectedScaleDegrees: new Set<number>(options.selectedScaleDegrees || [1, 3, 5]),
      selectedSharpDegrees: new Set<number>(options.selectedSharpDegrees || []),
      selectedFlatDegrees: new Set<number>(options.selectedFlatDegrees || []),
      minorScaleDegrees: new Set<number>(degreesFrom(options.minorScaleDegrees, MINOR_DEGREES) ?? DEFAULT_MINOR_DEGREES),
      minorSharpDegrees: new Set<number>(degreesFrom(options.minorSharpDegrees, MINOR_SHARPS) ?? []),
      minorFlatDegrees: new Set<number>(degreesFrom(options.minorFlatDegrees, MINOR_FLATS) ?? []),
      minorSolfege: minorSolfegeFrom(options.minorSolfege),
      selectedKeys: keys,
      selectedKey: keys[0],
      selectedRhythms: resolveSelectedRhythms(options.selectedRhythms, meters[0]),
      selectedTimeSignatures: meters,
      selectedTimeSignature: meters[0],
      rangeSpan: spanFrom(options.rangeSpan),
      rangeAnchor: Number.isInteger(options.rangeAnchor) ? (options.rangeAnchor as number) : selectedRange.min,
      measures: options.measures || 8,
      maxSkip: options.maxSkip || 4,
      // Exact skips and Skips between; presets and options from before load in
      // Max skip mode. An old Max 8th skip of 1 (short notes only step) leaves
      // eighths and sixteenths out of Skips between, which says the same.
      // Without a Skips between list (a new reader, a link that leaves it out),
      // eighths and sixteenths step: PAGE_DEFAULT_LAND_ON.
      skips: eighthsFrom(options, options.maxSkip || 4).dropShortSkips
        ? withoutShortSkips(skipSettingsFrom(options, PAGE_DEFAULT_LAND_ON))
        : skipSettingsFrom(options, PAGE_DEFAULT_LAND_ON),
      bpm: options.bpm || 60,
      // Eighth pairs on one pitch: an old Max 8th skip of 0, or Move 8th Notes off.
      eighths: { onePitch: eighthsFrom(options, options.maxSkip || 4).onePitch },
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
      // Chord progressions (unison-progressions.ts). Unset in presets saved
      // before they existed, which leaves the page's own setting alone.
      progressions: typeof options.progressions === "boolean" ? options.progressions : undefined,
      cursorMode: isCursorMode(options.cursorMode) ? options.cursorMode : "beat",
      run: runOptionsFrom(options.run),
      // How it sounds. Undefined when not saved (older presets and options),
      // which leaves the page's own setting alone.
      rhythmSoundId: isRhythmSoundId(options.rhythmSoundId) ? (options.rhythmSoundId as string) : undefined,
      instrumentProgram: isInstrumentProgram(options.instrumentProgram) ? Number(options.instrumentProgram) : undefined,
      transposeSemitones:
        options.transposeSemitones === undefined ? undefined : clampTranspose(Number(options.transposeSemitones)),
      isMetronomeOn: typeof options.isMetronomeOn === "boolean" ? options.isMetronomeOn : undefined,
      masterVolume: options.masterVolume === undefined ? undefined : numberIn(options.masterVolume, 0, 1, 0.5),
      metronomeVolume: options.metronomeVolume === undefined ? undefined : numberIn(options.metronomeVolume, 0, 1, 0.5),
      click: clickFrom(options.click),
      // Undefined when not saved (older presets and options): Off.
      dynamics: options.dynamics === undefined ? undefined : dynamicsSetFrom(options.dynamics),
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
  /** The NYSSMA level the settings came from, when they came from one. */
  let activeNyssmaId: string | null = null;
  /** Loads the active preset or step again, for Revert. */
  let revertPreset: (() => void) | undefined = undefined;
  /**
   * What "edited" compares: the options with each pool in picker order, so a
   * key removed and added back is no edit (presetSignature, unison-pools.ts).
   */
  const signatureOf = (options: Record<string, unknown>) =>
    presetSignature(options, possibleKeys, Object.keys(timeSignatures));
  $: presetEdited =
    activePresetLabel !== "" && signatureOf(currentOptions) !== activePresetSignature;

  /**
   * Put a saved preset's settings on the page. Like choral, it sets the
   * controls and leaves the exercise alone - Generate is what uses them.
   */
  // The practice tools read the exercise on the page: its key, meter, tempo
  // and each part's first note.
  $: setPracticeContext(typeof originalTuneString === "string" ? originalTuneString : null, bpm, minorSolfege);

  function applySavedPreset(preset: SavedPreset<any>) {
    const next = stateFromOptions(preset.params ?? {});
    selectedClef = next.selectedClef;
    selectedRange = next.selectedRange;
    selectedScaleDegrees = next.selectedScaleDegrees;
    selectedSharpDegrees = next.selectedSharpDegrees;
    selectedFlatDegrees = next.selectedFlatDegrees;
    minorScaleDegrees = next.minorScaleDegrees;
    minorSharpDegrees = next.minorSharpDegrees;
    minorFlatDegrees = next.minorFlatDegrees;
    minorSolfege = next.minorSolfege;
    selectedKey = next.selectedKey;
    selectedKeys = new Set(next.selectedKeys);
    selectedRhythms = next.selectedRhythms;
    selectedTimeSignature = next.selectedTimeSignature;
    selectedTimeSignatures = new Set(next.selectedTimeSignatures);
    rangeSpan = next.rangeSpan;
    rangeAnchor = next.rangeAnchor;
    measures = next.measures;
    maxSkip = next.maxSkip;
    skips = next.skips;
    bpm = next.bpm;
    eighthPairsOnePitch = next.eighths.onePitch;
    accidentalsFollowStep = next.accidentalsFollowStep;
    showSolfege = next.showSolfege;
    lyricSystem = next.lyricSystem;
    rhythmOnly = next.rhythmOnly;
    showRhythmSyllables = next.showRhythmSyllables;
    syllableSystemId = next.syllableSystemId;
    allowTiesAcrossBarline = next.allowTiesAcrossBarline;
    if (typeof next.progressions === "boolean") progressions = next.progressions;
    cursorMode = next.cursorMode;
    // Every preset saved before dynamics existed meant Off - not whatever the
    // page last held (a NYSSMA level's p, mf and f, say).
    dynamicsSet = next.dynamics ?? [];
    if (next.run) setRunOptions(next.run);
    if (next.click) applyClick(next.click);
    // Presets from before the metronome was one kept these on their own.
    if (next.isMetronomeOn !== undefined && next.click?.withMusic === undefined) tuner.setClickWithMusic(next.isMetronomeOn);
    if (next.masterVolume !== undefined) {
      masterVolume = next.masterVolume;
      isMuted = masterVolume === 0;
      applyInstrumentGain();
    }
    if (next.metronomeVolume !== undefined && next.click?.volume === undefined) tuner.setMetronomeVolume(next.metronomeVolume);
    const soundChanged =
      (next.rhythmSoundId !== undefined && next.rhythmSoundId !== rhythmSoundId) ||
      (next.instrumentProgram !== undefined && next.instrumentProgram !== instrumentProgram) ||
      (next.transposeSemitones !== undefined && next.transposeSemitones !== transposeSemitones);
    if (next.rhythmSoundId !== undefined) rhythmSoundId = next.rhythmSoundId;
    if (next.instrumentProgram !== undefined) instrumentProgram = next.instrumentProgram;
    if (next.transposeSemitones !== undefined) transposeSemitones = next.transposeSemitones;
    if (soundChanged) {
      // The audio was built with the old sound or pitch - see handleSoundChange.
      audioBuffer = null;
      createSynth = null;
      if (currentTune && originalTuneString) void rerenderTune();
    }
    activePresetLabel = preset.name;
    activeSavedId = preset.id;
    activeSavedPreset = preset;
    activeStepId = null;
    activeNyssmaId = null;
    revertPreset = () => applySavedPreset(preset);
    // After the reactive snapshot has caught up with the values just set.
    setTimeout(() => (activePresetSignature = signatureOf(currentOptions)), 0);
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
  /** ?preset=, read now: the reactive URL sync rewrites the address before onMount. */
  const arrivedPresetId = linkedPresetId();
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
    selectedRhythms = resolveSelectedRhythms(u.selectedRhythms, u.selectedTimeSignature);
    selectedTimeSignature = u.selectedTimeSignature;
    selectedTimeSignatures = new Set([u.selectedTimeSignature]);
    measures = u.measures;
    if (u.selectedKey) {
      selectedKey = u.selectedKey;
      selectedKeys = new Set([u.selectedKey]);
    }
    rangeSpan = null;
    if (u.selectedScaleDegrees) selectedScaleDegrees = new Set(u.selectedScaleDegrees);
    if (u.maxSkip) maxSkip = u.maxSkip;
    // A step's Move 8th Notes off sings each pair on one pitch.
    eighthPairsOnePitch = u.moveEighthNotes === false;
    // A step's skip size is a Max skip, between any notes.
    skips = { ...setExactOn(skips, false), landOn: [...ALL_LAND_ON] };
    const range = rangeForStep(u, selectedRange);
    if (range) selectedRange = range;
    selectedSharpDegrees = new Set();
    selectedFlatDegrees = new Set();
    // No step prints dynamics; a level's marks would otherwise stay on.
    dynamicsSet = [];
    activePresetLabel = stepLabel(step);
    activeSavedId = null;
    activeStepId = step.id;
    activeNyssmaId = null;
    revertPreset = () => applyLadderStep(step);
    setTimeout(() => (activePresetSignature = signatureOf(currentOptions)), 0);
  }

  /**
   * A NYSSMA Voice level (nyssma-presets.ts): the keys and meters to draw
   * from, its exact skips and what they land on, the Max / 8th / 16th skips,
   * rhythms, tempo, dynamics, length. The clef stays the teacher's; the range
   * becomes the level's span around do, placed on the do at or above the
   * teacher's low note (Level V reaches below it, to low sol), and again for
   * each key drawn. Like a ladder step it sets the controls and leaves the
   * exercise.
   */
  function applyNyssmaLevel(level: NyssmaLevel) {
    rhythmOnly = false;
    // The meter first: from a compound meter it puts that selection away
    // (chooseMeter), then the level's rhythms replace the simple one.
    chooseMeter(level.meters[0]);
    selectedRhythms = resolveSelectedRhythms(level.rhythms, level.meters[0]);
    selectedTimeSignatures = new Set(level.meters);
    selectedKeys = new Set(level.keys);
    selectedKey = level.keys[0];
    measures = level.measures;
    handleBpmChange(level.bpm);
    allowTiesAcrossBarline = false;
    selectedScaleDegrees = new Set(level.scaleDegrees);
    selectedSharpDegrees = new Set();
    selectedFlatDegrees = new Set();
    maxSkip = level.maxSkip;
    eighthPairsOnePitch = false;
    skips = {
      ...level.skips,
      patterns: [...level.skips.patterns],
      extraSkips: level.skips.extraSkips.map((m) => ({ ...m })),
      landOn: [...level.skips.landOn],
    };
    dynamicsSet = [...level.dynamics];
    // Span and anchor go together. The anchor is the teacher's range - but not
    // a range a level (or a preset with a span) already placed, or choosing a
    // level twice would walk it. A range set by hand cleared the span
    // (handleRangeChange), so it is read afresh.
    if (!rangeSpan) rangeAnchor = selectedRange.min;
    rangeSpan = [...level.span] as Span;
    selectedRange = rangeForSpan(rangeSpan, selectedKey, rangeAnchor) ?? selectedRange;
    activePresetLabel = level.label;
    activeNyssmaId = level.id;
    activeSavedId = null;
    activeStepId = null;
    revertPreset = () => applyNyssmaLevel(level);
    setTimeout(() => (activePresetSignature = signatureOf(currentOptions)), 0);
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
        const options = JSON.parse(saved);
        // Once (6 October 2026): a saved Skips between of every value was the
        // old default, almost never chosen; it becomes the new one, eighths
        // and sixteenths stepping. A list chosen after this stays.
        if (!localStorage.getItem("abc-skip-land-v2")) {
          if (Array.isArray(options.landOn) && ALL_LAND_ON.every((l) => options.landOn.includes(l))) options.landOn = [...PAGE_DEFAULT_LAND_ON];
          localStorage.setItem("abc-skip-land-v2", "1");
        }
        // Once (7 October 2026): a page left on a ladder step's settings kept
        // eighth pairs on one pitch, and sometimes a set of notes without do
        // (no tonic, so no progression and no guitar in the video). The page
        // goes back to eighths moving and gets do; saved presets are untouched.
        if (!localStorage.getItem("abc-page-defaults-v3")) {
          options.eighthPairsOnePitch = false;
          delete options.moveEighthNotes;
          delete options.maxEighthSkip;
          if (Array.isArray(options.selectedScaleDegrees) && !options.selectedScaleDegrees.includes(1)) {
            options.selectedScaleDegrees = [1, ...options.selectedScaleDegrees];
          }
          localStorage.setItem("abc-page-defaults-v3", "1");
        }
        return stateFromOptions(options);
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
      minorScaleDegrees: new Set<number>(DEFAULT_MINOR_DEGREES),
      minorSharpDegrees: new Set<number>(),
      minorFlatDegrees: new Set<number>(),
      minorSolfege: "la" as MinorSolfege,
      selectedKey: "F",
      selectedKeys: ["F"],
      selectedRhythms: resolveSelectedRhythms([]),
      selectedTimeSignature: "4/4",
      selectedTimeSignatures: ["4/4"],
      rangeSpan: null as Span | null,
      rangeAnchor: DEFAULT_TREBLE_RANGE.min,
      measures: 8,
      maxSkip: 4,
      skips: skipSettingsFrom({}, PAGE_DEFAULT_LAND_ON),
      bpm: 60,
      // A new reader: the three skips move together.
      eighths: { onePitch: false },
      accidentalsFollowStep: false,
      showSolfege: false,
      rhythmOnly: false,
      showRhythmSyllables: false,
      syllableSystemId: defaultSyllableSystem.id,
      allowTiesAcrossBarline: false,
      cursorMode: "beat",
      dynamics: [] as DynamicMark[],
    };
  }

  const initialState = getInitialState();
  if (initialState.masterVolume !== undefined) {
    masterVolume = previousVolume = initialState.masterVolume;
    isMuted = masterVolume === 0;
  }

  let selectedClef = initialState.selectedClef;
  let selectedRange = initialState.selectedRange;
  let selectedScaleDegrees: Set<number> = initialState.selectedScaleDegrees;
  let selectedSharpDegrees = initialState.selectedSharpDegrees;
  let selectedFlatDegrees = initialState.selectedFlatDegrees;
  /** A minor key's degrees (1-based from its tonic) and how it is sung; used when a minor key is drawn. */
  let minorScaleDegrees: Set<number> = initialState.minorScaleDegrees;
  let minorSharpDegrees: Set<number> = initialState.minorSharpDegrees;
  let minorFlatDegrees: Set<number> = initialState.minorFlatDegrees;
  let minorSolfege: MinorSolfege = initialState.minorSolfege;
  $: minorInPool = [...selectedKeys].some(isMinorKey);
  /**
   * The skip panel's syllables. Its moves are scale degrees from the tonic, so
   * a pool of minor keys names them as the minor is sung: la ti do... la-based,
   * do re me... do-based. A mixed pool keeps the major names.
   */
  $: degreeNames = minorInPool && !majorInPool
    ? MINOR_DEGREES.map((d) => minorLabel(d, null, minorSolfege))
    : [...DEGREE_NAMES];
  $: chipLabel = (label: string) =>
    minorInPool && !majorInPool
      ? label.replace(/\b(Do|Re|Mi|Fa|Sol|La|Ti)\b/g, (w) => {
          const name = degreeNames[["do", "re", "mi", "fa", "sol", "la", "ti"].indexOf(w.toLowerCase())];
          return name.charAt(0).toUpperCase() + name.slice(1);
        })
      : label;
  $: majorInPool = [...selectedKeys].some((k) => !isMinorKey(k));
  let selectedKey = initialState.selectedKey;
  /** Keys to draw from; `selectedKey` is the key of the exercise on screen. */
  let selectedKeys: Set<string> = new Set(initialState.selectedKeys);
  let selectedRhythms = initialState.selectedRhythms;
  let selectedTimeSignature = initialState.selectedTimeSignature;
  /** Meters to draw from, all of one kind; `selectedTimeSignature` is the exercise's own. */
  let selectedTimeSignatures: Set<string> = new Set(initialState.selectedTimeSignatures);
  /** A NYSSMA level's range: scale steps around do, placed from `rangeAnchor` for each key drawn. */
  let rangeSpan: Span | null = initialState.rangeSpan ?? null;
  let rangeAnchor: number = initialState.rangeAnchor ?? initialState.selectedRange.min;
  /** The picker follows the meter's kind: compound figures in 6/8, 9/8, 12/8. */
  $: filterRhythms = selectableRhythmsFor(meterKindOf(selectedTimeSignature));
  /** Each kind's selection while the reader is in the other (switchRhythmKind). */
  let rhythmMemory: RhythmMemory = {};

  /** Choose a meter; crossing between simple and compound swaps the rhythm selection. */
  function chooseMeter(ts: string) {
    const from = meterKindOf(selectedTimeSignature);
    const to = meterKindOf(ts);
    if (from !== to) {
      const switched = switchRhythmKind(rhythmMemory, from, to, selectedRhythms.map((r: Rhythm) => r.name));
      rhythmMemory = switched.memory;
      selectedRhythms = switched.selection;
    }
    selectedTimeSignature = ts;
  }
  let measures = initialState.measures;
  let maxSkip = initialState.maxSkip;
  /** The "Choose exact skips" panel: on/off, patterns, other skips, what a skip lands on (skip-settings.ts). */
  let skips: SkipSettings = initialState.skips;
  $: skipPolicy = policyFor(maxSkip, skips);

  /**
   * The panel starts open only when exact skips are on, and opens whenever
   * they come on from elsewhere (a preset, a link). Turning them off leaves
   * it as it is, so the switch does not snap shut under the finger.
   */
  let exactPanelOpen = skips.exactOn;
  $: if (skips.exactOn) exactPanelOpen = true;

  /** The "+ Add" picker for an other skip: open, and what is chosen so far. */
  let skipPickerOpen = false;
  let pickFrom: number | null = null;
  let pickDir: SkipDir = "up";
  let pickTo: number | null = null;
  $: pickReady = pickFrom !== null && pickTo !== null && pickFrom !== pickTo;
  function openSkipPicker() {
    pickFrom = null;
    pickDir = "up";
    pickTo = null;
    skipPickerOpen = true;
  }
  function addPickedSkip() {
    if (pickFrom === null || pickTo === null || pickFrom === pickTo) return;
    skips = { ...skips, extraSkips: addExtraSkip(skips.extraSkips, { from: pickFrom, to: pickTo, dir: pickDir }) };
    skipPickerOpen = false;
  }
  const skipDirChoices: { dir: SkipDir; label: string }[] = [
    { dir: "up", label: "up" },
    { dir: "down", label: "down" },
    { dir: "both", label: "up or down" },
  ];
  /** Land-on icons, the rhythm picker's own (eighth is drawn for this alone). */
  const landOnSvgs = Object.fromEntries(
    LAND_ON_CHOICES.map((c) => [c.length, import(`../assets/svgs/${c.icon}.svg?raw`)])
  );
  let bpm = initialState.bpm;
  /**
   * Eighth pairs on one pitch (short-note-skips.ts EighthSettings): the
   * ladder's early steps sing ti-ti on one note. Which note values a skip
   * may use is Skips between (skips.landOn), in both modes.
   */
  let eighthPairsOnePitch: boolean = initialState.eighths.onePitch;
  function stepSkip(delta: number) {
    maxSkip = Math.min(MAX_SKIP_RANGE.max, Math.max(MAX_SKIP_RANGE.min, maxSkip + delta));
  }
  /** The steppers' interval names: 0 the same pitch, 1 a step, then a 3rd and up. */
  const skipName = (n: number) =>
    n === 0 ? 'same pitch' : n === 1 ? 'a step' : skipIntervalNames[n] ?? `${n} steps`;
  /** The skip stepper, with its note-value icon (the rhythm picker's own). */
  const skipRows: { which: 'maxSkip'; label: string; icon: string; min: number }[] = [
    { which: 'maxSkip', label: 'Max skip', icon: 'quarter', min: 1 },
  ];
  /**
   * One scale for the three icons, so their noteheads match: an icon's height
   * follows its own viewBox (LilyPond staff-spaces). Shrunk to fit the cell,
   * the sixteenth's longer stem made its notehead smaller than the quarter's.
   */
  const skipIconHeight = (raw: string) =>
    Math.round(Number(/viewBox="[\d.\s-]*?\s([\d.]+)"/.exec(raw)?.[1] ?? 4) * 5.4);
  const skipRowSvgs = Object.fromEntries(
    skipRows.map((r) => [r.which, import(`../assets/svgs/${r.icon}.svg?raw`)])
  );
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
  /**
   * Chord progressions (unison-progressions.ts): the line is written over a
   * repeating progression - I IV V I and the like - with chord notes on the
   * strong beats and passing notes between; with chromatic notes, a diatonic
   * phrase and then a chromatic one. On unless turned off.
   */
  let progressions: boolean = initialState.progressions ?? true;
  // Beat by beat by default: a reader follows the beat (Blaine, 6 October 2026).
  let cursorMode: CursorMode = initialState.cursorMode || "beat";
  /** Printed dynamics: the marks to draw from, or empty for Off (dynamics.ts). */
  let dynamicsSet: DynamicMark[] = initialState.dynamics ?? [];
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
      minorSolfege,
      showRhythmSyllables: true,
      syllableSystemId: systemId,
      customSyllables: $mySyllables,
    });
    writtenSyllableSystem = systemId;
    writtenLyricSystem = lyric;
    return true;
  }

  /**
   * Dynamics are a score option: changing them redraws the marks on the
   * exercise on screen rather than writing a new one. The audio was built
   * with the old velocities, so it goes.
   */
  async function handleDynamicsChange(next: DynamicMark[]) {
    dynamicsSet = next;
    if (!currentScore || currentScore.staff !== "pitched") return;
    currentScore = withDynamics(currentScore, next);
    originalTuneString = assembleUnisonAbc(currentScore, {
      showSolfege: !rhythmOnly,
      lyricSystem: writtenLyricSystem,
      minorSolfege,
      showRhythmSyllables: true,
      syllableSystemId: writtenSyllableSystem,
      customSyllables: $mySyllables,
    });
    renderedString = [originalTuneString, [], currentScore];
    useExerciseScore(currentScore);
    audioBuffer = null;
    createSynth = null;
    if (currentTune) await rerenderTune();
  }
  /**
   * La- or do-based minor: relabels the exercise on screen (a minor one) from
   * its notes, without writing a new one.
   */
  async function handleMinorSolfege(next: MinorSolfege) {
    minorSolfege = next;
    updateUrlFromState();
    if (!currentScore || currentScore.staff !== "pitched" || !isMinorKey(currentScore.key ?? "")) return;
    originalTuneString = assembleUnisonAbc(currentScore, {
      showSolfege: !rhythmOnly,
      lyricSystem: writtenLyricSystem,
      minorSolfege,
      showRhythmSyllables: true,
      syllableSystemId: writtenSyllableSystem,
      customSyllables: $mySyllables,
    });
    renderedString = [originalTuneString, [], currentScore];
    if (currentTune) await rerenderTune();
  }

  function toggleIn(set: Set<number>, d: number): Set<number> {
    const next = new Set(set);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    return next;
  }

  let selectableArray: any[] = [];
  let pitchCursor: SVGLineElement | null = null;
  let playbackCursor: SVGLineElement | null = null; // Follows playback
  /** Phones get one measure-line of music at 1x; desktop keeps the 2x default. */
  const NARROW = 640; // Tailwind's `sm`
  const isNarrow = () =>
    typeof window !== "undefined" && window.innerWidth < NARROW;
  /** Size, bars per line and line spacing: the playback bar's Layout menu (score-view.ts). */
  let scoreView: ScoreView = loadScoreView("unison", { scale: isNarrow() ? 1 : 2, bars: null, spacing: "normal" });
  $: displayScale = scoreView.scale; // Scale for visual display
  function changeScoreView(patch: Partial<ScoreView>) {
    scoreView = { ...scoreView, ...patch };
    saveScoreView("unison", scoreView);
    // The drawing reads displayScale; let it update before redrawing.
    tick().then(() => currentTune && originalTuneString && rerenderTune());
  }

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
  };
  $: setupDirty = [...selectedKeys].join(",") !== DEFAULTS.key || selectedClef !== DEFAULTS.clef ||
    [...selectedTimeSignatures].join(",") !== DEFAULTS.timeSig || measures !== DEFAULTS.measures;
  $: rhythmDirty = JSON.stringify(selectedRhythms.map((r: Rhythm) => r.name).sort()) !==
    JSON.stringify([...DEFAULT_RHYTHM_NAMES[meterKindOf(selectedTimeSignature)]].sort());
  $: notesDirty = maxSkip !== DEFAULTS.maxSkip || skips.exactOn ||
    JSON.stringify(Array.from(selectedScaleDegrees).sort()) !== JSON.stringify([...DEFAULTS.scaleDegrees].sort()) ||
    selectedSharpDegrees.size > 0 || selectedFlatDegrees.size > 0 ||
    (minorInPool && (JSON.stringify(Array.from(minorScaleDegrees).sort()) !== JSON.stringify([...DEFAULT_MINOR_DEGREES]) ||
      minorSharpDegrees.size > 0 || minorFlatDegrees.size > 0 || minorSolfege !== "la")) ||
    accidentalsFollowStep !== false ||
    skips.landOn.length !== PAGE_DEFAULT_LAND_ON.length || PAGE_DEFAULT_LAND_ON.some((l) => !skips.landOn.includes(l)) || eighthPairsOnePitch;
  // A range that follows the key is judged by its placement for the pool's
  // first key in picker order, not the key drawn, so Generate cannot flip the dot.
  $: settledRange = (rangeSpan && rangeForSpan(rangeSpan, possibleKeys.find((k) => selectedKeys.has(k)) ?? selectedKey, rangeAnchor)) || selectedRange;
  $: rangeDirty = settledRange.min !== DEFAULTS.range.min || settledRange.max !== DEFAULTS.range.max;

  // Notes and Range only mean something when there are pitches to control.
  $: visibleTabs = (rhythmOnly ? ['setup', 'rhythm'] : ['setup', 'rhythm', 'notes', 'range']) as Tab[];
  $: if (!visibleTabs.includes(selectedTab)) selectedTab = 'setup';

  const STORAGE_KEY = "sightReadingOptions";

  // Save options whenever they change. The snapshot is also what a preset
  // stores, and what "edited" is measured against.
  $: currentOptions = {
      selectedClef,
      // The pools and the range they imply - never the key and meter last
      // drawn, or every Generate would mark a preset edited (unison-pools.ts).
      ...setupSnapshot({
        keys: [...selectedKeys], meters: [...selectedTimeSignatures],
        span: rangeSpan, anchor: rangeAnchor, range: selectedRange,
      }),
      selectedScaleDegrees: Array.from(selectedScaleDegrees),
      selectedSharpDegrees: Array.from(selectedSharpDegrees),
      selectedFlatDegrees: Array.from(selectedFlatDegrees),
      minorScaleDegrees: Array.from(minorScaleDegrees),
      minorSharpDegrees: Array.from(minorSharpDegrees),
      minorFlatDegrees: Array.from(minorFlatDegrees),
      minorSolfege,
      selectedRhythms: selectedRhythms.map((r: Rhythm) => r.name),
      measures,
      maxSkip,
      ...skips,
      bpm,
      eighthPairsOnePitch,
      accidentalsFollowStep,
      showSolfege,
      lyricSystem,
      rhythmOnly,
      showRhythmSyllables,
      syllableSystemId,
      allowTiesAcrossBarline,
      progressions,
      cursorMode,
      dynamics: dynamicsSet,
      rhythmSoundId,
      instrumentProgram,
      transposeSemitones,
      masterVolume,
      // The page's one metronome (preset-click.ts).
      click: {
        subdivision: $tuner.subdivision, accent: $tuner.accent, sound: $tuner.clickSound,
        withMusic: $tuner.clickWithMusic, volume: $tuner.metronomeVolume,
      },
      run: {
        exercises: drillExercises,
        repeats: drillRepeats,
        rampBpm: drillRampBpm,
        previewSeconds: drillPreviewSeconds,
        repeatCursor: drillRepeatCursor,
        repeatAnnotation: drillRepeatAnnotation,
        repeatNotes: drillRepeatNotes,
        repeatMetronome: drillRepeatMetronome,
        repeatDrone: drillRepeatDrone,
        repeatCountIn: drillRepeatCountIn,
      } satisfies RunOptions,
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
    if (rangeSpan) {
      params.set("span", rangeSpan.join(","));
      params.set("anchor", String(rangeAnchor));
    }
    params.set("scaleDegrees", Array.from(selectedScaleDegrees).join(","));
    params.set(
      "selectedSharpDegrees",
      Array.from(selectedSharpDegrees).join(",")
    );
    params.set(
      "selectedFlatDegrees",
      Array.from(selectedFlatDegrees).join(",")
    );
    params.set("key", [...selectedKeys].join(","));
    if (minorInPool) {
      params.set("minorDegrees", Array.from(minorScaleDegrees).join(","));
      params.set("minorSharps", Array.from(minorSharpDegrees).join(","));
      params.set("minorFlats", Array.from(minorFlatDegrees).join(","));
      params.set("minorSolfege", minorSolfege);
    }
    params.set("rhythmSound", rhythmSoundId);
    params.set("sound", String(instrumentProgram));
    params.set("rhythms", selectedRhythms.map((r: Rhythm) => r.name).join(","));
    params.set("timeSignature", [...selectedTimeSignatures].join(","));
    params.set("measures", measures.toString());
    params.set("maxSkip", maxSkip.toString());
    writeSkipParams(skips, params, PAGE_DEFAULT_LAND_ON);
    params.set("bpm", bpm.toString());
    params.set("pairsOnePitch", String(eighthPairsOnePitch));
    params.set("accidentalsFollowStep", accidentalsFollowStep.toString());
    params.set("showSolfege", showSolfege.toString());
    params.set("lyrics", lyricSystem);
    params.set("rhythmOnly", rhythmOnly.toString());
    params.set("showRhythmSyllables", showRhythmSyllables.toString());
    params.set("transpose", String(transposeSemitones));
    params.set("syllableSystem", syllableSystemId);
    params.set("allowTiesAcrossBarline", allowTiesAcrossBarline.toString());
    params.set("progressions", progressions.toString());
    params.set("cursor", cursorMode);
    if (dynamicsSet.length) params.set("dynamics", dynamicsSet.join(","));
    // An open assignment stays in the address, so a reload keeps it.
    if (assignmentId) params.set(ASSIGNMENT_PARAM, assignmentId);

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
        // abcjs counts qpm in the meter's beat - the dotted quarter in 6/8 -
        // so the page's BPM goes in unchanged (tests/unit/compound-playback.test.ts).
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
    // Replace the Q: (tempo) line, counted in the meter's beat.
    return abcString.replace(/Q:\d+\/\d+=\d+/g, tempoField(selectedTimeSignature, newTempo));
  }

  /**
   * Shared abcjs render options.
   * Both the first render and any rerender must use these so the display size
   * (displayScale) survives generating a new exercise -- `responsive: "resize"`
   * is what actually turns the narrowed staffwidth into visual zoom.
   */
  function getAbcOptions(most?: number) {
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
      // Room above the first staff on a phone for the count-in word
      // (CountInBadge), which sits there rather than on the music. A desktop
      // has room already.
      ...(isNarrow() ? { paddingtop: 40 } : {}),
      wrap: {
        // Syllables sit under every note, so a measure needs more width or
        // abcjs pushes colliding annotations onto a second row - "(sh)" and the
        // eighth after it are the tight pair. Fewer measures per line is a more
        // predictable lever than shrinking the text further.
        // Shared out evenly over the lines (score-layout.ts): asking for 3
        // with 4 bars drew three and a lonely one.
        preferredMeasuresPerLine: measuresPerLine({
          measures: barCount(typeof originalTuneString === "string" ? originalTuneString : "") || measures,
          narrow: isNarrow(),
          dense: isDense({
            lyrics: showRhythmSyllables || showSolfege,
            abc: typeof originalTuneString === "string" ? originalTuneString : "",
          }),
          most,
          want: scoreView.bars,
        }),
        minSpacing: 1.5,
        maxSpacing: 5,
      },
      clickListener: async (event: any) => {
        // After a Grade run, a tapped note says how it went.
        if (gradePhase === "results") {
          const drawn = drawnNotes();
          const i = gradeList.findIndex((n) => drawn[n.cursor]?.absEl?.abcelem === event);
          if (i >= 0) gradeDetailIndex = i;
          // Hearing the take: a tapped note is where it plays from.
          if (i >= 0 && takePlayer && gradeTrace?.spans[i]) takePlayer.seek(gradeTrace.spans[i].from - 150);
        }
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

    // From the meter model: 6/8 is two beats and 12/8 four. The first digit
    // read 12/8 as one beat a bar.
    const beatsPerMeasure = beatsOf(playedMeter());
    // Reset per attach: beatCallback now fires many times per beat, so the
    // metronome tracks which whole beat it last sounded rather than firing on
    // every call.
    metronomeBeats = newMetronomeBeatState();
    cursorBeats = newMetronomeBeatState();

    timingCallbacks = new abcjs.TimingCallbacks(currentTune, {
      beatCallback: (beatNumber, totalBeats, _totalTime, position) => {
        // "1, 2, Ready, Go" over the music through the count-in.
        showCountIn(playedMeter(), beatNumber);
        // With beatSubdivisions below, beatNumber arrives fractional - 0,
        // 0.0625, 0.125 ... - so the click is tied to the whole beat rather
        // than to the callback. Without this the metronome fires once per
        // subdivision, which is sixteen clicks a beat.
        const beat = metronomeClickFor(
          metronomeBeats,
          beatNumber,
          beatsPerMeasure
        );
        // A Grade run with the click off still counts in.
        const gradeQuiet = gradeTimeline && gradeClickChoice === "off" && beatNumber >= countInBeats(playedMeter());
        if ((passMetronomeOverride ?? $tuner.musicClick) && beat.click && !gradeQuiet) playMetronomeClick(beat.isDownbeat);

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
        // A new line has started: bring it to the reading position. The first
        // line is scrollToFirstSystem's, which also keeps the score's top in view.
        const system = systemOf(event?.elements?.[0]?.[0]);
        if (system && system !== playingSystem) {
          if (playingSystem && system !== document.querySelector("#paper .abcjs-staff-wrapper") && !scrollSuppressed) {
            scrollToReadingPosition(system);
          }
          playingSystem = system;
        }
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
        // The whole line, notes above the staff included, when abcjs has
        // drawn it as one; otherwise the line's top from the timing data.
        // Bring it fully on screen now; it settles at the top when it starts
        // (eventCallback), so the line being sung stays in view to its end.
        const system = paperDiv.querySelectorAll(".abcjs-staff-wrapper")[info?.line];
        if (system) return revealNextLine(system);
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
      // abcjs counts qpm in the meter's beat - the dotted quarter in 6/8 -
      // so the page's BPM goes in unchanged (tests/unit/compound-playback.test.ts).
      qpm: tempo,
      extraMeasuresAtBeginning: countInMeasures(playedMeter()), // the count-in, where the metronome plays
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

      const visualObj = drawEven(updatedTuneString);

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
   * Draws the score with its bars shared out evenly over the lines. The bars
   * per line asked of abcjs are only a preference: when the notes need more
   * room, abcjs breaks the lines itself, unevenly (8 bars as 3 + 2 + 3). Then
   * it is drawn once more with no more a line than abcjs managed.
   */
  function drawEven(source: string) {
    // The room between the lines (the Layout menu) is written into the tune as it is drawn.
    // The copyright under the score (copyright.ts), as drawn and printed only.
    const abc = withCopyright(withMeasureNumbers(withLineSpacing(source, scoreView.spacing), scoreView.measureNumbers));
    let visualObj = abcjs.renderAbc("paper", abc, getAbcOptions());
    let drawn = drawnLines(document.getElementById("paper"));
    // Fewer a line each time until the lines come out even: on a phone two bars
    // with lyrics may not fit either, and abcjs then broke them 1 + 1 + 2.
    let most = Math.max(...drawn);
    while (!evenLines(drawn) && most >= 1) {
      const paper = document.getElementById("paper");
      if (paper) paper.innerHTML = "";
      visualObj = abcjs.renderAbc("paper", abc, getAbcOptions(most));
      drawn = drawnLines(document.getElementById("paper"));
      most = Math.min(most - 1, Math.max(...drawn));
    }
    styleCopyright(document.getElementById("paper"));
    return visualObj;
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

    const visualObj = drawEven(withChosenSound(withChosenAnnotations(renderedString[0])));

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
    // The top of the score, not of the first staff line: what sits above the
    // staff - high notes, the tempo, the count-in badge - has to clear the
    // navbar too. Aiming at the staff line left it underneath on a repeat.
    const paper = document.getElementById("paper");
    if (!paper?.querySelector(".abcjs-staff")) return null;
    const top = paper.getBoundingClientRect().top + window.scrollY;
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
   * Length of the count-in, in seconds: one bar, or two in 2/4.
   * The cursor timeline (extraMeasuresAtBeginning) includes it, but the
   * rendered audio buffer starts at the first real note.
   */
  function getCountInDuration(): number {
    // Two bars in 2/4, so "1, 2, Ready, Go" fits (count-in.ts).
    return (60 / tempo) * countInBeats(playedMeter());
  }

  /** The meter of the tune on the page: the count-in follows it. */
  const playedMeter = () => meterOf(currentTune, selectedTimeSignature);

  // The count-in word goes when playback stops, pauses or ends.
  $: if (!isPlaying) hideCountIn();

  /** The line of music being played, so a new line can be scrolled to as it starts. */
  let playingSystem: Element | null = null;
  $: if (!isPlaying) playingSystem = null;

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

    // The metronome ticking on its own becomes the exercise's click, from beat 1
    // of the count-in (metronome-link). Here rather than at the top - a Play
    // press that bails out above must not silence it.
    exercisePlays(true);

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
  const clickBank = new SampleBank();
  /**
   * One beat of the click, as the Tools metronome sets it: its sound, its
   * accent on the downbeat, and its subdivisions after the beat, at exact
   * times. So turning on eighths in the Tools metronome puts eighths under
   * the exercise and under the Click button alike; those two only turn it
   * on and off.
   */
  function playMetronomeClick(
    isDownbeat: boolean,
    when: number = audioContext ? audioContext.currentTime : 0
  ) {
    if (!audioContext || metronomeGainNode.gain.value === 0) return;
    const { clickSound, accent, subdivision } = tuner.get();
    const level: ClickLevel = isDownbeat && accent ? "downbeat" : "beat";
    scheduleClick(audioContext, clickBank, metronomeGainNode, when, clickSound, level);
    // A Grade run in time sets its own: beats, or beats with their subdivision.
    const sub = Math.max(1, Math.round(gradeSubdivision ?? subdivision));
    const secondsPerBeat = Math.min(2, Math.max(0.1, 60 / (Number(tempo) || 60)));
    for (let k = 1; k < sub; k++) {
      scheduleClick(audioContext, clickBank, metronomeGainNode, when + (k * secondsPerBeat) / sub, clickSound, "sub");
    }
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
    if (grading) return;
    if (drillRunning) await stopDrill(false);
    await generateExercise();
  }

  /**
   * What /api/generate is asked for: the page's settings with the key, meter
   * and range drawn for this exercise. Shared by Generate and the play-along
   * video, which writes a longer rhythm at its backing track's tempo.
   */
  /** The degrees a key writes from: the minor selector's for a minor key, the major one's otherwise. */
  function degreesFor(key: string) {
    const minor = isMinorKey(key);
    return {
      scaleDegrees: Array.from(minor ? minorScaleDegrees : selectedScaleDegrees),
      selectedSharpDegrees: Array.from(minor ? minorSharpDegrees : selectedSharpDegrees),
      selectedFlatDegrees: Array.from(minor ? minorFlatDegrees : selectedFlatDegrees),
    };
  }

  function generationParams(drawnKey: string, drawnMeter: string, drawnRange: typeof selectedRange) {
    return {
      bpm,
      clef: selectedClef,
      timeSig:
        timeSignatures[drawnMeter as keyof typeof timeSignatures],
      measures: measures,
      // A number in Max skip mode's form or the custom list - the generator takes either (skip-policy.ts).
      maxSkip: skipPolicy,
      tempo: tempo,
      range: drawnRange,
      rhythms: selectedRhythms,
      // A minor key drawn writes from the minor selector's degrees.
      ...degreesFor(drawnKey),
      minorSolfege,

      selectedClef: selectedClef,
      selectedTimeSignature: drawnMeter,
      key: drawnKey,
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
      progressions,
      // Eighth pairs on one pitch, or no cap: Skips between rules short notes.
      ...capsFor({ onePitch: eighthPairsOnePitch }),
      accidentalsFollowStep: accidentalsFollowStep,
      dynamics: rhythmOnly ? [] : dynamicsSet,
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
  }

  /**
   * A rhythm-only exercise for the play-along video (PlayAlongVideo.svelte),
   * at its backing track's tempo and meter, long enough to fill the video.
   * Ties across the barline are off: each bar is shown alone. Counted against
   * the monthly allowance like any other exercise. Returns the exercise as
   * data, which `playAlongAbc` writes out in whichever syllables the video
   * asks for - so changing them there never needs a new exercise.
   */
  async function playAlongExercise(o: { measures: number; bpm: number; meter: string }): Promise<UnisonScore> {
    if (!(await mayGenerate())) throw new Error("This month's exercises are used up.");
    const params = {
      ...generationParams(selectedKey, o.meter, selectedRange),
      bpm: o.bpm,
      tempo: o.bpm,
      timeSig: timeSignatures[o.meter as keyof typeof timeSignatures],
      measures: o.measures,
      // Pitched or rhythm only, as the page is.
      rhythmOnly,
      allowTiesAcrossBarline: false,
      // Over a chord progression, which the video's bass then plays.
      progressions: true,
    };
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error ?? "The exercise could not be written.");
    void countGeneration();
    return result.data[2] as UnisonScore;
  }

  /**
   * A play-along exercise as ABC to draw: rhythm syllables in the system the
   * video chose ("off" for none, stripped as the page strips them), the
   * page's rhythm sound, the video's tempo.
   */
  function playAlongAbc(score: UnisonScore, o: { syllables: string; bpm: number; meter: string }): string {
    if (score.staff === "pitched") {
      // Pitched: `syllables` is the solfège - a lyric system, or "off". The
      // rhythm syllables written in for practice runs are left out.
      const lyricsOff = o.syllables === "off";
      let pitchedAbc = assembleUnisonAbc(score, {
        showSolfege: !lyricsOff,
        lyricSystem: (lyricsOff ? lyricSystem : o.syllables) as LyricSystem,
        minorSolfege,
        showRhythmSyllables: false,
        syllableSystemId,
        customSyllables: $mySyllables,
      });
      pitchedAbc = pitchedAbc.replace(/Q:\d+\/\d+=\d+/g, tempoField(o.meter, o.bpm));
      if (lyricsOff) pitchedAbc = withoutLyrics(pitchedAbc);
      return withChosenSound(withoutQuotedText(pitchedAbc));
    }
    const off = o.syllables === "off";
    let abc = assembleUnisonAbc(score, {
      showSolfege: false,
      lyricSystem,
      minorSolfege,
      showRhythmSyllables: !off,
      syllableSystemId: off ? syllableSystemId : o.syllables,
      customSyllables: $mySyllables,
    });
    abc = abc.replace(/Q:\d+\/\d+=\d+/g, tempoField(o.meter, o.bpm));
    if (off) abc = withoutQuotedText(abc);
    return withChosenSound(abc);
  }

  /** The syllable systems the video offers: the built-in ones, and the teacher's own once loaded. */
  $: playAlongSyllables = [
    ...Object.values(syllableSystems).map((sys) => ({ id: sys.id, label: sys.label })),
    ...($mySyllables ? [{ id: CUSTOM_SYLLABLE_ID, label: "Mine" }] : []),
  ];

  /**
   * The play-along video is Pro: the Video button beside Generate opens it
   * for Pro and Educator, and takes anyone else to the pricing page. Null
   * until the plan is known.
   */
  let videoAllowed: boolean | null = null;
  onMount(async () => {
    const status = await billingStatus();
    videoAllowed = !!status && status.plan !== "free";
  });

  let playAlongOpen = false;
  function openPlayAlong() {
    if (!videoAllowed) {
      window.location.href = "/pricing";
      return;
    }
    stopMusic();
    playAlongOpen = true;
  }

  async function generateExercise() {
    // Client-side validation (scale degrees are irrelevant in rhythm-only mode)
    // Skips that no selected rhythm can land are no skips: the line steps.
    // Each mode in the key pool is checked with its own degrees.
    const degreeSets = [
      ...(majorInPool ? [selectedScaleDegrees] : []),
      ...(minorInPool ? [minorScaleDegrees] : []),
    ];
    const unconnected = degreeSets.find(
      (d) => !degreesConnected(Array.from(d), landablePolicy(skipPolicy, selectedRhythms))
    );
    if (!rhythmOnly && skips.exactOn && unconnected) {
      error = degreesConnected(Array.from(unconnected), skipPolicy)
        ? NO_LANDING_MESSAGE
        : "With these skips the line cannot get between all the selected notes. Add a skip, or select the notes in between.";
      isLoading = false;
      return;
    }
    if (!rhythmOnly && !skips.exactOn && degreeSets.some((d) => !validateSettings(d, maxSkip))) {
      error =
        "The gap between selected scale degrees is larger than the Max Skip. Please increase Max Skip or select more notes to fill the gap.";
      isLoading = false;
      return;
    }

    // The monthly allowance (src/lib/usage.ts); GenerationLimit says what to
    // do when it is used up. A drill cannot go on without new exercises.
    // Counted only once the exercise is on the page (countGeneration, below).
    if (!(await mayGenerate())) {
      if (drillRunning) await stopDrill();
      return;
    }

    isLoading = true;
    error = null;

    try {
      // One key and one meter per exercise, drawn from the pools; a range that
      // follows the key is placed for the key drawn, from the same anchor.
      // The meter pool is one kind, so the rhythm selection still fits.
      // Drawn into locals, and put on the page only once the exercise is: a
      // failed Generate leaves the key, meter and range of the one on screen.
      const drawnKey = drawFromPool([...selectedKeys]);
      const drawnMeter = drawFromPool([...selectedTimeSignatures]);
      const drawnRange = (rangeSpan && rangeForSpan(rangeSpan, drawnKey, rangeAnchor)) || selectedRange;

      // Validate rhythms first
      if (!validateSelectedRhythms(selectedRhythms)) {
        throw new Error("Please select at least one valid rhythm");
      }

      // Reset audio state for new tune
      stopMusic();
      audioBuffer = null; // Force re-initialization
      createSynth = null;
      currentTune = null;

      const params = generationParams(drawnKey, drawnMeter, drawnRange);

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


      if (result.success) {
        selectedKey = drawnKey;
        selectedTimeSignature = drawnMeter;
        selectedRange = drawnRange;
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
        void countGeneration();
        revealScore(document.getElementById("paper"));
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
  /**
   * A run's settings start from what this device last used (they are kept
   * with the rest of the page's options, and in a saved preset), even when the
   * page was opened from a link, which carries the exercise but not the run.
   */
  const initialRun: RunOptions = (() => {
    try {
      const saved = localStorage.getItem("sightReadingOptions");
      if (saved) return runOptionsFrom(JSON.parse(saved).run) ?? RUN_DEFAULTS;
    } catch {}
    return RUN_DEFAULTS;
  })();
  let drillExercises = initialRun.exercises;
  let drillRepeats = initialRun.repeats;
  /** Added to the tempo for each NEW exercise, not for each repeat. */
  let drillRampBpm = initialRun.rampBpm;
  /** Silence before each new exercise starts, to read it first. */
  let drillPreviewSeconds = initialRun.previewSeconds;
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
  let drillRepeatCursor: PassCursor = initialRun.repeatCursor;
  let drillRepeatAnnotation: PassAnnotation = initialRun.repeatAnnotation;
  /**
   * What the repeats sound like: the notes, the click and the drone. The first
   * pass is the one being read and keeps the reader's own controls; the repeats
   * are for singing it on your own, which is why a director wants the piano
   * gone from them. All three are live - a gain node, the beat callback and an
   * oscillator - so changing them costs nothing and a repeat still follows
   * straight on from the pass before.
   */
  let drillRepeatNotes: PassSwitch = initialRun.repeatNotes;
  let drillRepeatMetronome: PassSwitch = initialRun.repeatMetronome;
  let drillRepeatDrone: PassSwitch = initialRun.repeatDrone;
  /**
   * Whether a repeat starts with a bar of count-in. There is no count-in
   * control outside a run - every pass has one - so Same and On would say the
   * same thing, and only On and Off are offered.
   */
  let drillRepeatCountIn: "on" | "off" = initialRun.repeatCountIn;
  /** A preset's run settings onto the page. A run already going keeps the ones it started with. */
  function setRunOptions(r: RunOptions) {
    drillExercises = r.exercises;
    drillRepeats = r.repeats;
    drillRampBpm = r.rampBpm;
    drillPreviewSeconds = r.previewSeconds;
    drillRepeatCursor = r.repeatCursor;
    drillRepeatAnnotation = r.repeatAnnotation;
    drillRepeatNotes = r.repeatNotes;
    drillRepeatMetronome = r.repeatMetronome;
    drillRepeatDrone = r.repeatDrone;
    drillRepeatCountIn = r.repeatCountIn;
  }
  const passSwitchOptions: [PassSwitch, string][] = [
    ["same", "Same"],
    ["on", "On"],
    ["off", "Off"],
  ];
  /** Whether a repeat would sound nothing at all, which is worth saying. */
  $: repeatsSilent =
    !(passOverride(1, drillRepeatNotes) ?? masterVolume > 0) &&
    !(passOverride(1, drillRepeatMetronome) ?? $tuner.clickWithMusic) &&
    (rhythmOnly || !(passOverride(1, drillRepeatDrone) ?? dronePlaying));
  /** A count-in with nothing clicking in it is a bar of silence, also worth saying. */
  $: repeatCountInSilent =
    drillRepeatCountIn === "on" && !(passOverride(1, drillRepeatMetronome) ?? $tuner.clickWithMusic);

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

  /**
   * This run's length when the month has fewer exercises left than the run
   * asks for: it used to start "exercise 1 of 4" with one left and stop at the
   * wall without a word. Null for a run of the length set.
   */
  let runCap: number | null = null;
  $: drillSettings = {
    exercises: runCap ?? drillExercises,
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
    ? `Drill · exercise ${drillIndex + 1} of ${runCap ?? drillExercises}, pass ${drillRepeat + 1} of ${drillRepeats}` +
      (runCap !== null ? ` · ${runCap} left this month` : "") +
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
            runCap = null;
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
    const left = $usage?.remaining;
    if (left === 0) {
      // Says so, and brings the notice into view.
      await mayGenerate();
      return;
    }
    runCap = left !== null && left !== undefined && left < drillExercises ? left : null;
    await tick();
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
    // Set by hand, the range is the teacher's own and no longer follows the key.
    rangeSpan = null;
    selectedRange = newRange;
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
    // A range that follows the key moves to the new clef's octave.
    rangeAnchor = selectedRange.min;
    if (rangeSpan) selectedRange = rangeForSpan(rangeSpan, selectedKey, rangeAnchor) ?? selectedRange;
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

  $: if (metronomeGainNode) metronomeGainNode.gain.value = $tuner.metronomeVolume * 2;

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
  /** The drone's note: the key's tonic (a minor key's own, la). */
  function getRootNoteFrequency(key: string): number {
    const keyMap: Record<string, number> = {
      "F#": 66,
      "C#": 61,
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
    return Tone.Frequency(keyMap[key.trim().replace(/m$/, "")] ?? 60, "midi").toFrequency();
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
    if (drillRunning) void stopDrill();
    stopMusic();
    parkPlaybackCursorAtStart();
  }
  /**
   * The playback bar's Pause and Stop end a practice run too. On their own
   * they only silenced the pass in flight: the run went on counting down to
   * its next exercise and started playing again by itself. Ending the run also
   * puts the tempo back where the reader had it.
   */
  function handleBarPause() {
    if (drillRunning) {
      void stopDrill();
      return;
    }
    pauseMusic();
  }
  function handleBarStop() {
    if (drillRunning) {
      void stopDrill();
      return;
    }
    stopMusic();
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

  /**
   * The metronome's tempo is this page's (metronome-link): a change there
   * lands here as if made with the tempo buttons, the re-render held back
   * until the presses stop.
   */
  let bpmCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let unlinkTempo: (() => void) | null = null;
  onMount(() => {
    unlinkTempo = linkPageTempo({
      min: 40,
      max: 200,
      setBpm: (v) => {
        handleBpmChange(v);
        if (bpmCommitTimer) clearTimeout(bpmCommitTimer);
        bpmCommitTimer = setTimeout(() => handleBpmCommit(v), 400);
      },
    });
  });

  // Stop, pause or the last note: the click stops with the music.
  let playedBefore = false;
  $: {
    if (playedBefore && !isPlaying) exercisePlays(false);
    playedBefore = isPlaying;
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
            title: rhythmOnly ? "Rhythm Exercise" : `Sight Reading Exercise in ${key ?? ""}`.trim(),
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
      run: () => save("abc", abcFileFor(shownAbc(), tempo)),
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
    if (isPlaying || isStartingPlayback) {
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
      if (score.timeSig.name in timeSignatures) {
        const ts = score.timeSig.name;
        const sameKind = meterKindOf(ts) === meterKindOf([...selectedTimeSignatures][0] ?? ts);
        chooseMeter(ts);
        // A pool of one follows the exercise, as the single setting always did;
        // a pool of the other kind is replaced, since a pool holds one kind.
        if (selectedTimeSignatures.size <= 1 || !sameKind) selectedTimeSignatures = new Set([ts]);
      }
      if (score.key && possibleKeys.includes(score.key)) {
        selectedKey = score.key;
        if (selectedKeys.size <= 1) selectedKeys = new Set([score.key]);
      }
      if (score.clef && clefOptions.includes(score.clef)) selectedClef = score.clef;

      currentScore = score;
      originalTuneString = assembleUnisonAbc(score, {
        showSolfege: !rhythmOnly,
        lyricSystem,
        minorSolfege,
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
    // Practice time, for a student in a class; and an assignment, if the address names one.
    startPractice({ page: "unison", assignmentId, isBusy: () => isPlaying });
    if (assignmentId) openAssignment(assignmentId);
    const linked = exerciseParam(window.location.hash);
    if (linked) openLinkedExercise(linked);
    // A reload keeps the preset the settings came from (active-preset.ts).
    // A saved preset chosen on the Choral page's picker (preset-link.ts), read
    // before the page rewrote its address.
    const presetId = linkedStep || assignmentId || linked ? null : arrivedPresetId;
    if (presetId) void openLinkedPreset("unison", presetId, (p) => applySavedPreset(p));
    const remembered = presetId ? null : activePresetToRestore("unison");
    if (remembered && !linkedStep && !assignmentId && !linked) restoreActivePreset(remembered);
    presetMemoryReady = true;
    window.addEventListener("hashchange", onHashChange);
  });

  // ── Grade (grade.ts, grade-runner.ts) ─────────────────────────────────────
  // Sing the exercise into the microphone: the cursor waits on each note until
  // it is sung and held for its length. Pro, pitched exercises only.
  let gradeOpen = false;
  let gradeAllowed: boolean | null = null;
  let gradeSignedIn = false;
  let gradeList: GradeNote[] = [];
  let gradeLit: Element[] = [];
  const gradeRunner = new GradeRunner({
    moveTo: (i) => gradeCursorTo(i),
    countIn: (beat) => (beat < 0 ? hideCountIn() : showCountIn(playedMeter(), beat)),
    click: (downbeat) => {
      if (audioContext?.state === "suspended") void audioContext.resume();
      playMetronomeClick(downbeat);
    },
    marked: (scores) => markGradedNotes(scores),
    startTimeline: (o) => startGradeTimeline(o),
    stopTimeline: () => stopGradeTimeline(),
    traced: (trace) => drawGradeTrace(trace),
  });
  // For the end-to-end Grade check (scripts/check-grade.ts): the exercise as
  // the page plays it. Development builds only.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as any).__gradeDebug = {
      abc: () => originalTuneString, transpose: () => transposeSemitones, tempo: () => tempo, meter: () => playedMeter(),
      view: () => { let v: unknown; gradeRunner.subscribe((x) => (v = x))(); return v; },
      mic: () => { const t = tuner.get(); return { status: t.engineStatus, dbfs: t.dbfs, pitch: t.pitch }; },
      clapBlocks: () => gradeRunner.lastClapBlocks,
      // A note's detail line, as tapping it shows (for checking the syllables named).
      detailOf: async (i: number) => { gradeDetailIndex = i; await tick(); return gradeDetail; },
      take: () => ({ ...take, note: takeNote, now: takePlayer?.now() ?? null, start: takePlayer?.start ?? null }),
      recording: async () => {
        if (!gradeAudio) return null;
        const bytes = new Uint8Array(await gradeAudio.blob.arrayBuffer());
        let bin = "";
        for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
        return { startedAt: gradeAudio.startedAt, mime: gradeAudio.mime, b64: btoa(bin), spans: gradeTrace?.spans ?? [] };
      },
    };
    (window as any).__gradeDebugSkip = () => gradeRunner.skip();
  }
  // Full screen (src/lib/fullscreen.ts): the score alone, for a TV. The
  // settings are hidden there, so what is written under the notes is chosen
  // from the playback bar.
  const fullscreenCtl = createFullscreen();
  const fullscreenOn = fullscreenCtl.active;
  onDestroy(fullscreenCtl.destroy);
  $: annotationChoices = [
    { id: "measures", label: "Measure numbers", on: scoreView.measureNumbers !== false },
    ...(rhythmOnly
    ? [
        ...playAlongSyllables.map((s) => ({ id: s.id, label: s.label, on: showRhythmSyllables && syllableSystemId === s.id })),
      ]
    : [
        ...lyricSystems.map(([v, l]) => ({ id: v as string, label: l, on: showSolfege && lyricSystem === v })),
      ]),
  ];
  /** Each annotation switches on or off; one system at a time, so another replaces it. */
  function pickAnnotation(id: string) {
    if (id === "measures") return changeScoreView({ measureNumbers: scoreView.measureNumbers === false });
    if (rhythmOnly) return void setRhythmSyllables(showRhythmSyllables && syllableSystemId === id ? "off" : id);
    void handleLyricSystem(id as LyricSystem);
  }

  /** A Grade run in time is using the page's timeline (cursor and click, no melody). */
  let gradeTimeline = false;
  let gradeClickChoice: "off" | "beat" | "sub" = "beat";
  let gradeSubdivision: number | null = null;
  let gradeRestList: GradeRest[] = [];
  let gradeTrace: GradeTrace | null = null;
  /** The note tapped on the score after a run, for its details. */
  let gradeDetailIndex: number | null = null;
  /**
   * Saving runs for review: on the dev server, or with ?gradeDebug=1. The
   * microphone is recorded over each run (grade-recording.ts).
   */
  // Save this run: on the dev server, on every preview deployment (Layout marks
  // them data-preview) so runs can be recorded in a real room, or with ?gradeDebug.
  const gradeDebugOn =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("gradeDebug") || document.documentElement.hasAttribute("data-preview")));
  let gradeRecording: GradeRecording | null = null;
  /** The audio output's delay at the last run in time (ms), added to its beat. */
  let gradeOutputLatencyMs = 0;
  let gradeAudio: { blob: Blob; startedAt: number; mime: string } | null = null;
  async function stopGradeRecording(keep: boolean) {
    const rec = gradeRecording;
    gradeRecording = null;
    const out = rec ? await rec.stop() : null;
    if (keep) gradeAudio = out;
  }
  function gradeRunData() {
    const t = tuner.get();
    const v = $gradeRunner;
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        abc: originalTuneString,
        transpose: transposeSemitones,
        tempo,
        meter: playedMeter(),
        beatUnits: resolveMeter(playedMeter()).beatUnits,
        settings: { mode: t.gradeMode, strictness: t.gradeStrictness, cursor: t.gradeCursor, click: t.gradeClick, reference: t.gradeReference, a4: t.a4 },
        detectLatencyMs: DETECT_LATENCY_MS,
        outputLatencyMs: gradeOutputLatencyMs,
        notes: gradeList,
        rests: gradeRestList,
        t0: gradeTrace?.t0 ?? null,
        spans: gradeTrace?.spans ?? [],
        frames: gradeTrace?.frames ?? [],
        perf: v.perf,
        result: v.result,
        claps: v.claps,
        clapSettings: { input: t.gradeClapInput, who: t.gradeWho, click: t.gradeClapClick, micLatencyMs: t.clapLatencyMs },
        clapBlocks: gradeRunner.lastClapBlocks,
        clapsHeard: gradeRunner.lastHeard,
        userAgent: navigator.userAgent,
    };
  }
  function saveGradeRunNow() {
    saveGradeRun(gradeRunData(), gradeAudio);
  }
  /**
   * Send this run: anyone with Grade but a student (who may be under 13)
   * can send a run and a note to the private grade-runs store, to tell us
   * when grading seems wrong. Their runs are recorded in the browser so
   * there is something to send; nothing leaves it unless they press Send.
   * On the dev server (no store) runs are downloaded instead.
   */
  let gradeShareOn = false;
  async function sendGradeRunNow(note: string): Promise<string> {
    try {
      await sendGradeRun(gradeRunData(), gradeAudio, note);
      return gradeAudio ? "Sent. Thank you: we'll listen to it." : "Sent (the recording could not be made). Thank you.";
    } catch (e) {
      console.error("Sending the run failed:", e);
      return "It could not be sent. Please try again in a moment.";
    }
  }

  /**
   * Pitch & rhythm: the exercise in time from its count-in, on the same
   * TimingCallbacks as Play (so the cursor modes and the count-in words are
   * the page's own) but with no synth: the melody never sounds. Returns the
   * first downbeat, in performance.now ms.
   */
  function startGradeTimeline(o: { cursor: CursorMode; click: "off" | "beat" | "sub" }): number {
    if (!timingCallbacks) return performance.now();
    if (audioContext?.state === "suspended") void audioContext.resume();
    gradeTimeline = true;
    gradeClickChoice = o.click;
    // Beats with their subdivision: twos in simple meter, threes in compound.
    gradeSubdivision = o.click === "sub" ? (isCompound(playedMeter()) ? 3 : 2) : 1;
    passCursorOverride = o.cursor;
    passMetronomeOverride = true;
    scrollToFirstSystem();
    const startedAt = performance.now();
    timingCallbacks.start(0);
    // The click is heard this much after it is played (the audio output's
    // own delay: a few tens of ms on a laptop, far more on Bluetooth), and a
    // singer sings with the click they hear.
    gradeOutputLatencyMs = Math.round((((audioContext as any)?.baseLatency ?? 0) + ((audioContext as any)?.outputLatency ?? 0)) * 1000);
    return startedAt + getCountInDuration() * 1000 + gradeOutputLatencyMs;
  }

  function stopGradeTimeline() {
    if (!gradeTimeline) return;
    gradeTimeline = false;
    gradeSubdivision = null;
    passCursorOverride = null;
    passMetronomeOverride = null;
    timingCallbacks?.stop();
    hidePlaybackCursor();
    hideCountIn();
  }

  /** What was sung, drawn on the score (grade-feedback.ts). */
  function drawGradeTrace(trace: GradeTrace) {
    gradeTrace = trace;
    // The run is over: keep its recording for "Save this run".
    if (gradeRecording) void stopGradeRecording(true);
    const svg = document.querySelector("#paper svg") as SVGSVGElement | null;
    if (!svg) return;
    const drawn = drawnNotes();
    drawGradeFeedback({
      svg,
      notes: gradeList,
      drawn: gradeList.map((n) => drawn[n.cursor]),
      drawnAt: (cursor) => drawn[cursor],
      trace,
      perf: $gradeRunner.perf,
      claps: $gradeRunner.claps,
      doPc: gradeDoPc,
      onsetBeats: STRICTNESS[$tuner.gradeStrictness].onsetBeats,
      bpm: tempo,
    });
  }

  /** What the panel says about the tapped note. */
  $: gradeDetail = (() => {
    const i = gradeDetailIndex;
    const v = $gradeRunner;
    if (i === null || v.phase !== "results") return null;
    const n = gradeList[i];
    if (!n) return null;
    if (v.claps) {
      const r = v.claps.notes[i];
      if (!r) return null;
      if (r.missed) return `Note ${i + 1}: no clap heard`;
      if (r.onsetBeats !== null && Math.abs(r.onsetBeats) > STRICTNESS[$tuner.gradeStrictness].onsetBeats)
        return `Note ${i + 1}: ${Math.abs(r.onsetBeats).toFixed(2)} beats ${r.onsetBeats > 0 ? "late" : "early"}`;
      return `Note ${i + 1}: on time`;
    }
    const want = solfegeOf(n.midi, gradeDoPc);
    if (v.perf) {
      const r = v.perf.notes[i];
      if (!r) return null;
      if (r.missed) return `Note ${i + 1} (${want}): not heard`;
      const parts = [r.pitchOk ? `${want}, ${r.cents === 0 ? "in tune" : `${Math.abs(r.cents ?? 0)} cents ${(r.cents ?? 0) > 0 ? "sharp" : "flat"}`}` : `you sang ${solfegeOf(r.sung ?? n.midi, gradeDoPc)}, the note is ${want}`];
      if (r.onsetBeats !== null && Math.abs(r.onsetBeats) > STRICTNESS[$tuner.gradeStrictness].onsetBeats)
        parts.push(`${Math.abs(r.onsetBeats).toFixed(2)} beats ${r.onsetBeats > 0 ? "late" : "early"}`);
      else if (r.onsetBeats !== null) parts.push("on time");
      if (r.cutShort) parts.push("cut short");
      return `Note ${i + 1}: ${parts.join(" · ")}`;
    }
    const r = v.result?.notes[i];
    if (!r) return null;
    const first = r.firstTry !== null ? `, you first sang ${solfegeOf(r.firstTry, gradeDoPc)}` : "";
    if (r.outcome === "skipped") return `Note ${i + 1} (${want}): skipped${first}`;
    const how = r.outcome === "first" ? "right first time" : r.outcome === "corrected" ? `corrected${first}` : "after hearing it";
    const tune = r.cents !== null && Math.abs(r.cents) >= 10 ? ` · ${Math.abs(r.cents)} cents ${r.cents > 0 ? "sharp" : "flat"}` : "";
    return `Note ${i + 1} (${want}): ${how}${tune}${r.help.heardKey ? " · heard the key" : ""}`;
  })();
  /**
   * Do's pitch class for naming notes in solfege, with the playback
   * transposition. In minor it is the relative major's do (la-based), or the
   * tonic itself when the teacher sings minor do-based.
   */
  $: gradeDoPc = (() => {
    const info = originalTuneString ? exerciseInfo(originalTuneString) : null;
    const doBased = !!info?.minor && minorSolfege === "do" ? 9 : 0;
    return (((info ? NOTES.indexOf(info.doNote) : 0) + doBased + transposeSemitones) % 12 + 12) % 12;
  })();

  /** After a run, colour each note on the score as the card does. */
  let gradeMarked: Element[] = [];
  function clearGradeMarks() {
    disposeTake();
    for (const el of gradeMarked) el.classList.remove("grade-good", "grade-ok", "grade-bad");
    gradeMarked = [];
    clearGradeFeedback(document.querySelector("#paper svg"));
    gradeTrace = null;
    gradeDetailIndex = null;
  }
  function markGradedNotes(scores: number[]) {
    clearGradeMarks();
    const drawn = drawnNotes();
    scores.forEach((score, i) => {
      const at = drawn[gradeList[i]?.cursor ?? -1];
      const cls = score >= 90 ? "grade-good" : score >= 70 ? "grade-ok" : "grade-bad";
      for (const el of (at?.absEl?.elemset ?? []) as Element[]) {
        el.classList.add(cls);
        gradeMarked.push(el);
      }
    });
  }
  $: gradePhase = $gradeRunner.phase;
  $: grading = gradePhase === "reference" || gradePhase === "countIn" || gradePhase === "sing";
  $: gradeBlocked = !originalTuneString ? "Generate an exercise first." : null;
  // The microphone is Grade's only while it runs.
  let gradeHadMic = false;
  $: if (!grading && gradeHadMic) {
    gradeHadMic = false;
    tuner.setMicHeld(false);
    stopTuner();
  }

  async function openGrade() {
    gradeOpen = true;
    if (gradeAllowed === null) {
      const who = await signedInUser();
      gradeSignedIn = !!who;
      // On the dev server only with PUBLIC_GRADE_SEND=1 (a store token in the environment), for testing Send.
      gradeShareOn = !!who && who.accountType !== "student" && (!import.meta.env.DEV || import.meta.env.PUBLIC_GRADE_SEND === "1");
      const status = await billingStatus();
      gradeAllowed = !!status && status.plan !== "free";
    }
  }

  function closeGrade() {
    void stopGradeRecording(false);
    gradeRunner.stop();
    clearGradeMarks();
    gradeOpen = false;
  }

  /** The notes and rests abcjs drew, in order: what a note's `cursor` counts. */
  const drawnNotes = () => selectableArray.filter((e: any) => e?.absEl?.abcelem?.el_type === "note");

  /** Point at note `i` of the graded list (none for -1), and bring it into view. */
  /**
   * Hear your take (grade-playback.ts): the run's recording played back, the
   * written music and click under it when asked, the cursor, the note's
   * feedback and the drawing following it. Kept in this browser; gone when
   * the marks are cleared (a new run, Close, a new exercise).
   */
  /** Score options: open or folded away, remembered in this browser. */
  let scoreOptionsOpen = true;
  try {
    scoreOptionsOpen = localStorage.getItem("sr-score-options-open") !== "0";
  } catch {}
  function toggleScoreOptions() {
    scoreOptionsOpen = !scoreOptionsOpen;
    try {
      localStorage.setItem("sr-score-options-open", scoreOptionsOpen ? "1" : "0");
    } catch {}
  }
  let takePlayer: TakePlayer | null = null;
  let take = { open: false, loading: false, playing: false, progress: 0, music: false, hasMusic: false, error: null as string | null };
  let takeNote = -1;
  /**
   * Where the take is played from: just before the first note. Before it is
   * the key and the count-in, so the progress bar runs from here to the end
   * (it used to run from the recording's start and began half way along).
   */
  let takeFrom = 0;
  const takeProgress = (t: number) =>
    takePlayer ? Math.min(1, Math.max(0, (t - takeFrom) / Math.max(1, takePlayer.end - takeFrom))) : 0;
  $: canHearTake = !!gradeAudio && !!gradeTrace && gradePhase === "results";
  function disposeTake() {
    takePlayer?.dispose();
    takePlayer = null;
    takeNote = -1;
    take = { ...take, open: false, loading: false, playing: false, progress: 0 };
  }
  async function hearTake() {
    if (takePlayer) {
      take = { ...take, open: true };
      if (takePlayer.playing) return takePlayer.pause();
      // After the end it starts again from the first note, not the count-in.
      return takePlayer.play(takePlayer.position <= takePlayer.start ? takeFrom : takePlayer.position);
    }
    if (!gradeAudio || !gradeTrace) return;
    const trace = gradeTrace;
    const meter = playedMeter();
    const beatUnits = resolveMeter(meter).beatUnits;
    const beatMs = 60_000 / Math.max(1, tempo);
    const lastUnits = Math.max(0, ...gradeList.map((n) => n.startUnits + n.lengthUnits), ...gradeRestList.map((r) => r.startUnits + r.lengthUnits));
    // Untimed (Note by note): no music lines up with it.
    const timed = trace.mode !== "pitch" && trace.t0 !== undefined;
    const player = new TakePlayer(gradeAudio, timed
      ? {
          abc: withChosenSound(originalTuneString),
          bpm: tempo,
          transpose: rhythmOnly ? 0 : transposeSemitones,
          volumeMultiplier: rhythmOnly ? volumeMultiplierFor(rhythmSoundFor(rhythmSoundId)) : 3.0,
          t0: trace.t0!,
          beatMs,
          beatsPerBar: parseInt(meter, 10) || 4,
          countInBeats: countInBeats(meter),
          beats: Math.ceil(lastUnits / beatUnits),
          clickSound: $tuner.clickSound,
        }
      : null);
    takePlayer = player;
    take = { ...take, open: true, loading: true, error: null, hasMusic: timed };
    try {
      await player.load();
    } catch (e) {
      console.error("The take could not be played:", e);
      take = { ...take, loading: false, error: "Your take could not be played back in this browser." };
      return;
    }
    if (takePlayer !== player) return;
    player.setMusic(take.music);
    player.onFrame((t) => {
      const i = noteAt(trace.spans, t);
      if (i !== takeNote) {
        takeNote = i;
        gradeCursorTo(i);
        revealTo(document.querySelector("#paper svg"), i);
        gradeDetailIndex = i >= 0 ? i : null;
      }
      take = { ...take, playing: player.playing, progress: takeProgress(t) };
    });
    player.onEnd(() => {
      takeNote = -1;
      gradeCursorTo(-1);
      revealTo(document.querySelector("#paper svg"), null);
      take = { ...take, playing: false, progress: 0 };
    });
    take = { ...take, loading: false };
    // From just before the first note.
    takeFrom = Math.max(player.start, (trace.spans[0]?.from ?? player.start) - 1200);
    await player.play(takeFrom);
    take = { ...take, playing: true };
  }
  function takeMusic(on: boolean) {
    take = { ...take, music: on };
    takePlayer?.setMusic(on);
  }
  function takeSeek(frac: number) {
    if (!takePlayer) return;
    takePlayer.seek(takeFrom + frac * (takePlayer.end - takeFrom));
    take = { ...take, progress: frac };
  }
  function closeTake() {
    takePlayer?.pause();
    gradeCursorTo(-1);
    revealTo(document.querySelector("#paper svg"), null);
    take = { ...take, open: false, playing: false };
  }

  function gradeCursorTo(i: number) {
    for (const el of gradeLit) el.classList.remove("grade-now");
    gradeLit = [];
    if (i < 0) {
      hidePlaybackCursor();
      return;
    }
    const at = drawnNotes()[gradeList[i]?.cursor ?? -1];
    if (!at?.absEl || !playbackCursor) return;
    const x = Math.max(0, at.absEl.x - 2);
    playbackCursor.setAttribute("x1", String(x));
    playbackCursor.setAttribute("x2", String(x));
    playbackCursor.setAttribute("y1", String(at.staffPos.top - 10));
    playbackCursor.setAttribute("y2", String(at.staffPos.top + 80));
    gradeLit = (at.absEl.elemset ?? []) as Element[];
    for (const el of gradeLit) el.classList.add("grade-now");
    const box = gradeLit[0]?.getBoundingClientRect();
    // Kept clear of the navbar above and the Grade strip and playback bar below.
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-bar-h")) || 96;
    if (box && (box.top < 90 || box.bottom > window.innerHeight - barH - 110)) {
      window.scrollBy({ top: box.top - window.innerHeight / 3, behavior: "smooth" });
    }
  }

  async function startGrade() {
    if (gradeBlocked || !originalTuneString || !gradeAllowed) return;
    clearGradeMarks();
    if (drillRunning) await stopDrill();
    if (isPlaying) stopMusic();
    const schedule = gradeSchedule(originalTuneString, transposeSemitones);
    gradeList = schedule.notes;
    gradeRestList = schedule.rests;
    if (!gradeList.length) return;
    // Saving runs for review: the recording starts first. Nothing may await
    // between the tuner starting and the run starting, or the page sees a
    // microphone held with no run and switches it off.
    gradeAudio = null;
    // Every microphone run is recorded, kept in this browser only: Hear your
    // take plays it back; Send this run (not for students) can send it.
    if (!(rhythmOnly && $tuner.gradeClapInput === "keys")) {
      await stopGradeRecording(false);
      gradeRecording = await startGradeRecording();
    }
    if (rhythmOnly) return startClapGrade();
    // The button press is the gesture the microphone needs.
    initTuner();
    await startTuner();
    if (tuner.get().engineStatus !== "running") return;
    tuner.setMicHeld(true);
    gradeHadMic = true;
    // The tonic chord near the first note: do's chord, or la's in minor.
    const info = exerciseInfo(originalTuneString);
    const doPc = ((info ? NOTES.indexOf(info.doNote) : 0) + transposeSemitones + 120) % 12;
    const tonicPc = (doPc + (info?.minor ? 9 : 0)) % 12;
    const first = gradeList[0].midi;
    const tonic = first - ((((first - tonicPc) % 12) + 12) % 12);
    const meter = playedMeter();
    const t = tuner.get();
    gradeRunner.start({
      notes: gradeList,
      rests: gradeRestList,
      bpm: tempo,
      beatsPerBar: parseInt(meter, 10) || 4,
      beatUnits: resolveMeter(meter).beatUnits,
      countInBeats: countInBeats(meter),
      reference: t.gradeReference,
      mode: t.gradeMode,
      strictness: t.gradeStrictness,
      cursor: t.gradeCursor,
      click: t.gradeClick,
      tonicTriad: info?.minor ? [tonic, tonic + 3, tonic + 7] : [tonic, tonic + 4, tonic + 7],
    });
  }

  /**
   * A rhythm clapped into the microphone or tapped (grade-rhythm.ts). With
   * the microphone, the clap listener shares the tuner's stream; it is not
   * awaited, since nothing may await between the tuner starting and the run
   * starting, and the count-in gives it time to load.
   */
  async function startClapGrade() {
    const t0 = tuner.get();
    let mic: ClapListener | null = null;
    if (t0.gradeClapInput === "mic") {
      initTuner();
      await startTuner();
      if (tuner.get().engineStatus !== "running") return;
      tuner.setMicHeld(true);
      gradeHadMic = true;
      const input = micInput();
      if (input) {
        mic = new ClapListener(input.ctx, input.source);
        void mic.start();
      }
    }
    const meter = playedMeter();
    const t = tuner.get();
    gradeRunner.start({
      notes: gradeList,
      rests: gradeRestList,
      bpm: tempo,
      beatsPerBar: parseInt(meter, 10) || 4,
      beatUnits: resolveMeter(meter).beatUnits,
      countInBeats: countInBeats(meter),
      reference: "note",
      mode: "claps",
      strictness: t.gradeStrictness,
      cursor: t.gradeCursor,
      click: t.gradeClapClick,
      tonicTriad: [],
      claps: { who: t.gradeWho, mic, micLatencyMs: t.clapLatencyMs ?? CLAP_MIC_LATENCY_MS, forgiveLag: t.clapLatencyMs === null },
    });
  }
  /**
   * The microphone's delay for a clap until Check timing has measured it:
   * measured end to end with the fake microphone (scripts/check-clap-grade.ts
   * MEASURE=1: 45 ms on every clap). A real microphone adds its own, which
   * Check timing finds.
   */
  const CLAP_MIC_LATENCY_MS = 45;

  /** Taps, on the pad or the spacebar, while a rhythm is graded with them. */
  $: tapping = grading && rhythmOnly && $tuner.gradeClapInput === "keys";
  function onTapKey(e: KeyboardEvent) {
    if (!tapping || e.code !== "Space" || e.repeat) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    e.preventDefault();
    gradeRunner.tap(e.timeStamp);
  }

  /**
   * Check timing: eight clicks to clap along with, and the microphone's delay
   * is the median of how late the claps were heard (each clap matched to the
   * nearest click). Stored in this browser for every run after.
   */
  let timingNote: string | null = null;
  async function checkClapTiming() {
    initTuner();
    await startTuner();
    if (tuner.get().engineStatus !== "running") return;
    tuner.setMicHeld(true);
    const input = micInput();
    if (!input) return;
    const mic = new ClapListener(input.ctx, input.source);
    await mic.start();
    if (audioContext?.state === "suspended") await audioContext.resume();
    const beatMs = 600;
    const outMs = ((audioContext?.baseLatency ?? 0) + (audioContext?.outputLatency ?? 0)) * 1000;
    const clicks: number[] = [];
    timingNote = "Clap with the clicks: 1 2 3 4, then four more…";
    const start = performance.now() + 300;
    for (let k = 0; k < 12; k++) {
      setTimeout(() => playMetronomeClick(k % 4 === 0), start + k * beatMs - performance.now());
      // The first four are a count-in: clap along with the last eight.
      if (k >= 4) clicks.push(start + k * beatMs + outMs);
    }
    setTimeout(() => {
      const claps = detectClaps(mic.stop());
      tuner.setMicHeld(false);
      if (!grading) stopTuner();
      const lags = clicks
        .map((k) => claps.map((c) => c.t - k).filter((d) => d > -150 && d < 250).sort((a, b) => Math.abs(a) - Math.abs(b))[0])
        .filter((d): d is number => d !== undefined)
        .sort((a, b) => a - b);
      if (lags.length < 5) {
        timingNote = `Only ${lags.length} of 8 claps heard. Clap a little louder, nearer the microphone, and try again.`;
        return;
      }
      const ms = Math.round(lags[lags.length >> 1]);
      tuner.setGrade({ clapLatencyMs: ms });
      timingNote = `Checked: this microphone hears claps ${ms} ms late. Claps are timed for that now.`;
    }, start + 12 * beatMs + 400 - performance.now());
  }

  async function gradeNewExercise() {
    gradeRunner.reset();
    await generateExercise();
  }

  /** The saved preset the settings came from, whole, for remembering it. */
  let activeSavedPreset: SavedPreset<any> | null = null;
  let presetMemoryReady = false;
  $: if (presetMemoryReady) {
    rememberActivePreset(
      "unison",
      activePresetLabel
        ? { label: activePresetLabel, stepId: activeStepId, level: activeNyssmaId, saved: activeSavedId ? activeSavedPreset : null, sig: activePresetSignature }
        : null
    );
  }

  /** Which preset was active, and what it held; the settings stay as they are. */
  function restoreActivePreset(rec: ActivePresetRecord) {
    const step = rec.stepId ? ladderById[rec.stepId] : undefined;
    if (step?.unison) {
      activeStepId = step.id;
      activeSavedId = null;
      revertPreset = () => applyLadderStep(step);
    } else if (rec.saved) {
      const saved = rec.saved;
      activeSavedId = saved.id;
      activeSavedPreset = saved;
      activeStepId = null;
      revertPreset = () => applySavedPreset(saved);
    } else if (rec.level && Object.hasOwn(nyssmaById, rec.level)) {
      const level = nyssmaById[rec.level];
      activeNyssmaId = level.id;
      activeSavedId = null;
      activeStepId = null;
      revertPreset = () => applyNyssmaLevel(level);
    } else {
      return;
    }
    activePresetLabel = rec.label;
    // A record from before a setting existed gets it from the page (active-preset.ts).
    activePresetSignature = signatureOf(JSON.parse(restoredSignature(rec.sig, currentOptions)));
  }

  onDestroy(() => {
    paperObserver?.disconnect();
    window.removeEventListener("orientationchange", onPaperResize);
    window.removeEventListener("hashchange", onHashChange);
    if (resizeTimer) clearTimeout(resizeTimer);
    exercisePlays(false);
    unlinkTempo?.();
    if (bpmCommitTimer) clearTimeout(bpmCommitTimer);
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

<div class="w-full" style="padding-bottom: calc(var(--bottom-bar-h, 96px) + env(safe-area-inset-bottom, 0px) + {gradeOpen ? '6rem' : '1rem'})">
  <!-- Preset bar: the same one as choral, over unison's own saved list. The
       UIL levels are Choral's built-ins, so they are not offered here; the
       NYSSMA Voice levels are this page's (nyssma-presets.ts). -->
  <!-- The practice tools: a wheel in the bottom-right corner. -->
  <ToolsWheel />
  {#if gradeOpen}
    <GradePanel
      runner={gradeRunner}
      allowed={gradeAllowed}
      signedIn={gradeSignedIn}
      blocked={gradeBlocked}
      onStart={startGrade}
      onClose={closeGrade}
      onNewExercise={gradeNewExercise}
      doPc={gradeDoPc}
      detail={gradeDetail}
      onSave={gradeDebugOn && !gradeShareOn ? saveGradeRunNow : null}
      onSend={gradeShareOn ? sendGradeRunNow : null}
      onHearTake={canHearTake ? hearTake : null}
      {take}
      onTakeMusic={takeMusic}
      onTakeSeek={takeSeek}
      onTakeClose={closeTake}
      {rhythmOnly}
      onCheckTiming={checkClapTiming}
      {timingNote}
    />
    {#if tapping}
      <TapPad onTap={(t) => gradeRunner.tap(t)} />
    {/if}
  {/if}
  {#if playAlongOpen}
    <PlayAlongVideo
      meters={[...selectedTimeSignatures]}
      generate={playAlongExercise}
      write={playAlongAbc}
      mode={rhythmOnly ? "rhythm" : "pitched"}
      labelNoun={rhythmOnly ? "Syllables" : "Solfège"}
      syllableChoices={rhythmOnly ? playAlongSyllables : lyricSystems.map(([id, label]) => ({ id, label }))}
      initialSyllables={rhythmOnly ? (showRhythmSyllables ? syllableSystemId : "off") : showSolfege ? lyricSystem : "off"}
      pageTempo={tempo}
      transpose={rhythmOnly ? 0 : transposeSemitones}
      {instrumentProgram}
      {rhythmSoundId}
      onClose={() => (playAlongOpen = false)}
    />
  {/if}


  <main class="focus-main wide flex flex-col items-center w-full max-w-5xl mx-auto px-2 md:px-4">
  <!-- The settings (hidden in full screen). -->
  <div class="wide-left w-full flex flex-col items-center">

    {#if !assignment}
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
      nyssmaLevels={nyssmaVoiceLevels}
      {activeNyssmaId}
      onSelectNyssma={(id) => { if (Object.hasOwn(nyssmaById, id)) applyNyssmaLevel(nyssmaById[id]); }}
      currentParams={() => currentOptions}
      onSelectSaved={applySavedPreset}
      onRenamed={(p) => { if (p.id === activeSavedId) { activePresetLabel = p.name; activeSavedPreset = p; revertPreset = () => applySavedPreset(p); } }}
      onDelete={(id) => { if (id === activeSavedId) { activePresetLabel = ''; activeSavedId = null; revertPreset = undefined; } }}
    >
      <GenerationLimit slot="end" part="counter" />
    </PresetDropdown>
    {/if}
    {#if assignment}<AssignmentBanner {assignment} />{/if}
    <GenerationLimit part={assignment ? "all" : "alert"} />
    {#if error}
      <div class="w-full mt-4 rounded-lg border border-sr-brass bg-sr-brass-bg p-4 no-print">
        <p class="text-sm text-sr-brass">{error}</p>
      </div>
    {/if}

    <!-- Tab panel -->
    <div class="tab-panel sr-panel w-full my-4 no-print">

      <!-- Tab bar -->
      <!-- On a phone the tabs take the first row, whole, and the history and
           Generate a second; from md up, one row. -->
      <div class="sr-bar flex flex-wrap md:flex-nowrap items-center">
        <div class="flex items-center overflow-x-auto tab-scroll w-full md:w-auto">
        {#each visibleTabs as tab}
          <button
            type="button"
            class="sr-tab flex-1 md:flex-none px-2 sm:px-4 py-2.5 sm:py-2 text-[13px] sm:text-sm shrink-0 whitespace-nowrap
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

        <!-- The play-along video (Pro), beside Generate: rhythm only or pitched. -->
        <button
          class="sr-btn sr-btn-video ml-auto mr-2 my-1.5 shrink-0 flex items-center gap-1.5"
          on:click={openPlayAlong}
          title={videoAllowed ? "A full-screen play-along, about 1:30, to show or save as a video" : "Play-along videos are part of Pro"}
        >
          <Clapperboard size={16} />
          <span>Video</span>
          {#if videoAllowed === false}
            <span class="sr-pro-tag">Pro</span>
          {/if}
        </button>

        <!-- Generate button always visible in tab bar -->
        <button
          class="sr-btn md:mr-2 my-1.5 shrink-0 flex items-center gap-1.5"
          on:click={handleClick}
          disabled={isLoading}
        >
          <RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
          <span>Generate</span>
        </button>
      </div>

      <!-- Tab content - locked to an open assignment's settings -->
      <div class="p-4" class:opacity-60={!!assignment} {...(assignment ? { inert: true } : {})}>

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
                {#each [{ label: "Major", keys: MAJOR_KEYS }, { label: "Minor", keys: MINOR_KEYS }] as row}
                <div class="flex flex-wrap items-center gap-2" role="group" aria-label="{row.label} keys">
                  <span class="w-12 text-xs text-sr-faint">{row.label}</span>
                  {#each row.keys as key}
                    <button
                      class="sr-tok {selectedKeys.has(key) ? 'sr-on' : ''}"
                      aria-pressed={selectedKeys.has(key)}
                      on:click={() => {
                        const next = togglePoolMember([...selectedKeys], key);
                        selectedKeys = new Set(next);
                        // The key shown follows the click, and stays inside the pool.
                        selectedKey = next.includes(key) ? key : next[0];
                        if (rangeSpan) selectedRange = rangeForSpan(rangeSpan, selectedKey, rangeAnchor) ?? selectedRange;
                      }}
                    >{key}</button>
                  {/each}
                </div>
                {/each}
                {#if selectedKeys.size > 1}
                  <p class="text-xs text-sr-faint">
                    {selectedKeys.size} keys selected. One is drawn at random each time you generate.
                    Click a key to remove it.
                  </p>
                {/if}
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
              {#each meterGroups as group}
                <p class="text-xs text-sr-faint">{group.label}</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Time Signature: {group.label}">
                  {#each group.names as ts}
                    <button
                      class="sr-tok {selectedTimeSignatures.has(ts) ? 'sr-on' : ''}"
                      aria-pressed={selectedTimeSignatures.has(ts)}
                      on:click={() => {
                        // Same kind: in or out of the pool. The other kind
                        // replaces the pool and swaps the rhythms (chooseMeter).
                        const next = meterPoolClick([...selectedTimeSignatures], ts);
                        chooseMeter(next.includes(ts) ? ts : next[0]);
                        selectedTimeSignatures = new Set(next);
                      }}
                    >{ts}</button>
                  {/each}
                </div>
              {/each}
              {#if selectedTimeSignatures.size > 1}
                <p class="text-xs text-sr-faint">
                  {selectedTimeSignatures.size} meters selected. One is drawn each time you generate.
                </p>
              {/if}
              {#if meterKindOf(selectedTimeSignature) === "compound"}
                <p class="text-xs text-sr-faint">
                  Felt in dotted-quarter beats: the tempo counts ♩., and the rhythms are compound figures.
                </p>
              {/if}
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

            {#if !rhythmOnly}
              <div class="space-y-2">
                <p class="sr-label">Chord progression</p>
                <button
                  class="sr-tok {progressions ? 'sr-on' : ''}"
                  on:click={() => (progressions = !progressions)}
                  aria-label="Chord progression"
                  aria-pressed={progressions}
                >{progressions ? 'On' : 'Off'}</button>
                <p class="text-xs text-sr-faint">
                  {#if !progressions}
                    A chord for every note, wherever the line goes.
                  {:else if minorInPool && !majorInPool}
                    The line follows a repeating minor progression, i iv v i, i VI VII i and the like{minorSharpDegrees.has(7) ? ", with a phrase over V that sings the raised leading tone" : ""}.
                  {:else if selectedSharpDegrees.size || selectedFlatDegrees.size}
                    A diatonic phrase first, then a chromatic one: fi over V/V, te over ♭VII, le over iv and so on, each resolving by step.
                  {:else}
                    The line follows a repeating progression, I IV V I and the like: chord notes on the strong beats, passing notes between.
                  {/if}
                </p>
              </div>
            {/if}
          </div>


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
                    : 'No syllables. The exercise is unchanged, and turning them back on costs nothing.'}
                  {#if $mySyllables}
                    <a class="underline ml-1" href="/account#syllables">Edit mine</a>
                  {:else if $syllablesAvailable}
                    <a class="underline ml-1" href="/account#syllables">Use your own syllables</a>
                  {/if}
                </p>
                <SignupHint id="own-syllables">Want the words your group uses (ta-a, ti-ka, whatever you teach)?</SignupHint>
              </div>
            {/if}
          </div>

        <!-- Notes Tab -->
        {:else if selectedTab === 'notes'}
          <div class="space-y-5">
            <!-- Scale Degrees: the major selector while a major key is in the pool,
                 the minor one beside it while a minor key is. -->
            <div class="flex flex-wrap gap-x-10 gap-y-5">
            {#if majorInPool}
            <div class="space-y-2">
              <p class="sr-label">Scale Degrees{minorInPool ? " (major)" : ""}</p>
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
            {/if}
            {#if minorInPool}
            <!-- A minor key's degrees, from its own tonic (minor-degrees.ts):
                 the natural minor row, raised notes over it (♯6 and ♯7 make
                 melodic and harmonic minor), lowered under it. -->
            <div class="space-y-2">
              <p class="sr-label">Scale Degrees (minor)</p>
              <div class="grid grid-cols-[repeat(7,2.6rem)] sm:grid-cols-[repeat(7,3rem)] gap-1.5 sm:gap-2 w-max" role="group" aria-label="Minor scale degrees">
                {#each MINOR_DEGREES as d}
                  {#if MINOR_SHARPS.includes(d)}
                    <button
                      class="sr-tok px-0 flex flex-col items-center leading-tight {minorSharpDegrees.has(d) ? 'sr-on' : ''} {d >= 6 ? 'ring-1 ring-sr-action/40' : ''}"
                      style="grid-column: {d}; grid-row: 1"
                      aria-pressed={minorSharpDegrees.has(d)}
                      on:click={() => (minorSharpDegrees = toggleIn(minorSharpDegrees, d))}
                    >♯{d}<span class="text-[10px] opacity-70">{minorLabel(d, "sharp", minorSolfege)}</span></button>
                  {/if}
                  <button
                    class="sr-tok px-0 flex flex-col items-center leading-tight {minorScaleDegrees.has(d) ? 'sr-on' : ''}"
                    style="grid-column: {d}; grid-row: 2"
                    aria-pressed={minorScaleDegrees.has(d)}
                    on:click={() => (minorScaleDegrees = toggleIn(minorScaleDegrees, d))}
                  >{d}<span class="text-[10px] opacity-70">{minorLabel(d, null, minorSolfege)}</span></button>
                  {#if MINOR_FLATS.includes(d)}
                    <button
                      class="sr-tok px-0 flex flex-col items-center leading-tight {minorFlatDegrees.has(d) ? 'sr-on' : ''}"
                      style="grid-column: {d}; grid-row: 3"
                      aria-pressed={minorFlatDegrees.has(d)}
                      on:click={() => (minorFlatDegrees = toggleIn(minorFlatDegrees, d))}
                    >♭{d}<span class="text-[10px] opacity-70">{minorLabel(d, "flat", minorSolfege)}</span></button>
                  {/if}
                {/each}
              </div>
              <p class="text-xs text-sr-faint">{minorScaleName(minorSharpDegrees, minorSolfege)}. Raise 7 for harmonic minor, 6 and 7 for melodic.</p>
              <div class="flex flex-wrap items-center gap-2 pt-1" role="group" aria-label="Minor solfège">
                <span class="text-xs text-sr-faint">Sing minor</span>
                <button class="sr-tok {minorSolfege === 'la' ? 'sr-on' : ''}" aria-pressed={minorSolfege === 'la'}
                  on:click={() => handleMinorSolfege("la")}>La-based</button>
                <button class="sr-tok {minorSolfege === 'do' ? 'sr-on' : ''}" aria-pressed={minorSolfege === 'do'}
                  on:click={() => handleMinorSolfege("do")}>Do-based</button>
              </div>
              <p class="text-xs text-sr-faint">
                {minorSolfege === "la"
                  ? "The tonic is la: la ti do re mi fa so, the relative major's syllables."
                  : "The tonic is do: do re me fa so le te."}
              </p>
            </div>
            {/if}
            </div>

            <!-- Skips: the largest skip by note value, and the exact-skips panel
                 under them (short-note-skips.ts, skip-settings.ts). -->
            <div class="space-y-2">
              <p class="sr-label">Skips</p>
              <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[auto_auto_auto_minmax(0,1fr)] sm:gap-x-3"
                role="group" aria-label="Skips">
                {#each skipRows as row}
                  {@const value = maxSkip}
                  {@const dimmed = skips.exactOn}
                  <span class="flex h-8 w-7 items-end justify-center pb-0.5 text-sr-ink transition-opacity" class:opacity-40={dimmed} aria-hidden="true">
                    {#await skipRowSvgs[row.which] then svg}
                      <span class="skip-icon flex" style="height: {skipIconHeight(svg.default)}px">{@html svg.default}</span>
                    {/await}
                  </span>
                  <!-- On a phone the interval name sits under the label, so nothing wraps. -->
                  <span class="min-w-0 leading-tight">
                    <span class="block text-[13px] font-bold text-sr-ink whitespace-nowrap transition-opacity" class:opacity-40={dimmed}
                      id="skip-row-{row.which}">{row.label}</span>
                    {#if dimmed}
                      <span class="block text-[11px] font-bold text-sr-muted sm:hidden">Using your exact skips</span>
                    {:else}
                      <span class="block text-[11px] text-sr-faint sm:hidden">{skipName(value)}</span>
                    {/if}
                  </span>
                  <div class="flex items-center gap-1.5 transition-opacity" class:opacity-40={dimmed}
                    role="group" aria-labelledby="skip-row-{row.which}"
                    aria-describedby={dimmed ? 'exact-skips-note' : undefined}>
                    <button type="button" class="sr-btn-quiet !px-2.5 !py-1.5"
                      aria-label="Decrease {row.label.toLowerCase()}" disabled={value <= row.min}
                      on:click={() => stepSkip(-1)}><Minus size={14} /></button>
                    <span class="text-sm font-bold w-5 text-center tabular-nums">{value}</span>
                    <button type="button" class="sr-btn-quiet !px-2.5 !py-1.5"
                      aria-label="Increase {row.label.toLowerCase()}" disabled={value >= 8}
                      on:click={() => stepSkip(1)}><Plus size={14} /></button>
                  </div>
                  {#if dimmed}
                    <span id="exact-skips-note" class="hidden text-xs font-bold text-sr-muted sm:block">Using your exact skips</span>
                  {:else}
                    <span class="hidden text-xs text-sr-faint sm:block">{skipName(value)}</span>
                  {/if}
                {/each}
              </div>

              <!-- Skips between: which note values a skip may use, both its notes
                   (skip-policy.ts). In both modes. Steps go anywhere. -->
              <div class="space-y-2 pt-1">
                <p class="text-xs font-bold text-sr-muted">Skips between</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Skips between">
                  {#each LAND_ON_CHOICES as choice}
                    <button type="button"
                      class="sr-tok-sq h-12 w-12 p-1.5 flex items-center justify-center {skips.landOn.includes(choice.length) ? 'sr-on' : ''}"
                      aria-label={choice.label}
                      title={choice.label}
                      aria-pressed={skips.landOn.includes(choice.length)}
                      on:click={() => (skips = { ...skips, landOn: toggleLandOn(skips.landOn, choice.length) })}>
                      {#await landOnSvgs[choice.length]}
                        <span class="text-xs">…</span>
                      {:then svg}
                        <span class="rhythm-icon">{@html svg.default}</span>
                      {:catch}
                        <span class="text-xs">{choice.label}</span>
                      {/await}
                    </button>
                  {/each}
                </div>
                <p class="text-xs text-sr-faint">
                  {skips.landOn.length === ALL_LAND_ON.length
                    ? 'A skip may be sung between any notes.'
                    : 'A skip only between the notes chosen, both of them: leave out eighths and an eighth is stepped to and from. Steps go anywhere.'}
                </p>
              </div>

              <div class="space-y-1 pt-1">
                <button type="button"
                  class="sr-tok {eighthPairsOnePitch ? 'sr-on' : ''}"
                  aria-pressed={eighthPairsOnePitch}
                  on:click={() => (eighthPairsOnePitch = !eighthPairsOnePitch)}
                >Eighth pairs on one pitch: {eighthPairsOnePitch ? 'On' : 'Off'}</button>
                <p class="text-xs text-sr-faint">
                  {eighthPairsOnePitch
                    ? 'Each ti-ti is sung on one note, so the rhythm is all that is new.'
                    : 'Eighth pairs move like any other notes.'}
                </p>
              </div>

              <details class="exact-skips group" bind:open={exactPanelOpen}>
                <summary class="inline-flex items-center gap-1.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden rounded-full -ml-1 pl-1 pr-3 py-1 text-[13px] font-bold text-sr-action-fg hover:bg-sr-track">
                  <ChevronRight size={16} class="shrink-0 transition-transform group-open:rotate-90" />
                  <span>Choose exact skips</span>
                  {#if skips.exactOn}
                    <span class="rounded-full bg-sr-action text-sr-action-ink px-2 py-0.5 text-[11px] font-extrabold">On</span>
                  {/if}
                </summary>

                <div class="mt-2 ml-1 space-y-4 border-l-2 border-sr-track pl-3 pb-1 sm:ml-2 sm:pl-4">
                  <button type="button" class="flex items-center gap-3 text-left"
                    aria-pressed={skips.exactOn}
                    on:click={() => (skips = setExactOn(skips, !skips.exactOn))}>
                    <span class="relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors
                      {skips.exactOn ? 'bg-sr-action' : 'bg-sr-hairline'}" aria-hidden="true">
                      <span class="absolute top-1 left-1 h-4 w-4 rounded-full bg-sr-panel shadow transition-transform
                        {skips.exactOn ? 'translate-x-4' : ''}"></span>
                    </span>
                    <span class="text-sm font-bold text-sr-ink">Only allow these skips</span>
                  </button>

                  <div class="space-y-2">
                    <p class="text-xs font-bold text-sr-muted">Patterns</p>
                    <div class="flex flex-wrap gap-2" role="group" aria-label="Patterns">
                      {#each SKIP_CHIPS as chip}
                        <button type="button"
                          class="sr-tok px-3 py-1.5 text-[13px] {skips.patterns.includes(chip.id) ? 'sr-on' : ''}"
                          aria-pressed={skips.patterns.includes(chip.id)}
                          on:click={() => (skips = togglePattern(skips, chip.id))}>{chipLabel(chip.label)}</button>
                      {/each}
                    </div>

                    <!-- Other skips: hidden until there are some. Most teachers only need the patterns. -->
                    {#if skips.extraSkips.length}
                      <p class="pt-1 text-xs font-bold text-sr-muted">Other skips</p>
                      <div class="flex flex-wrap items-center gap-2">
                        {#each skips.extraSkips as move, k}
                          <span class="inline-flex items-center gap-1 rounded-full bg-sr-sky text-sr-sky-ink pl-3 pr-1 py-1 text-[13px] font-bold">
                            {degreeNames[move.from - 1]} {DIR_ARROWS[move.dir]} {degreeNames[move.to - 1]}
                            <button type="button" class="rounded-full p-1 hover:bg-sr-panel"
                              aria-label="Remove {degreeNames[move.from - 1]} {skipDirChoices.find((c) => c.dir === move.dir)?.label} to {degreeNames[move.to - 1]}"
                              on:click={() => (skips = { ...skips, extraSkips: skips.extraSkips.filter((_, j) => j !== k) })}><X size={13} /></button>
                          </span>
                        {/each}
                      </div>
                    {/if}
                    {#if !skipPickerOpen}
                      <button type="button" class="sr-link -ml-1.5" on:click={openSkipPicker}>+ Add another skip</button>
                    {:else}
                      <div class="flex w-fit max-w-full flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border-2 border-sr-track p-3"
                        role="group" aria-label="Add a skip">
                        <div class="space-y-1">
                          <p class="text-[11px] font-bold text-sr-muted">From</p>
                          <div class="grid grid-cols-[repeat(7,minmax(0,2.25rem))] gap-1" role="group" aria-label="From">
                            {#each degreeNames as name, k}
                              <button type="button" class="sr-tok min-w-0 w-full px-0 py-1.5 text-[13px] {pickFrom === k + 1 ? 'sr-on' : ''}"
                                aria-pressed={pickFrom === k + 1}
                                on:click={() => (pickFrom = k + 1)}>{name}</button>
                            {/each}
                          </div>
                        </div>
                        <div class="space-y-1">
                          <p class="text-[11px] font-bold text-sr-muted">Direction</p>
                          <div class="flex gap-1" role="group" aria-label="Direction">
                            {#each skipDirChoices as choice}
                              <button type="button" class="sr-tok px-0 py-1.5 w-9 text-[15px] leading-5 {pickDir === choice.dir ? 'sr-on' : ''}"
                                aria-label={choice.label} aria-pressed={pickDir === choice.dir}
                                on:click={() => (pickDir = choice.dir)}>{DIR_ARROWS[choice.dir]}</button>
                            {/each}
                          </div>
                        </div>
                        <div class="space-y-1">
                          <p class="text-[11px] font-bold text-sr-muted">To</p>
                          <div class="grid grid-cols-[repeat(7,minmax(0,2.25rem))] gap-1" role="group" aria-label="To">
                            {#each degreeNames as name, k}
                              <button type="button" class="sr-tok min-w-0 w-full px-0 py-1.5 text-[13px] {pickTo === k + 1 ? 'sr-on' : ''}"
                                aria-pressed={pickTo === k + 1} disabled={pickFrom === k + 1}
                                on:click={() => (pickTo = k + 1)}>{name}</button>
                            {/each}
                          </div>
                        </div>
                        <div class="flex items-center gap-2">
                          <button type="button" class="sr-btn px-4 py-1.5 text-[13px]" disabled={!pickReady}
                            on:click={addPickedSkip}>Add</button>
                          <button type="button" class="sr-link" on:click={() => (skipPickerOpen = false)}>Cancel</button>
                        </div>
                      </div>
                    {/if}
                  </div>

                  {#if skips.exactOn && skips.patterns.length === 0 && skips.extraSkips.length === 0}
                    <p class="text-xs text-sr-muted">Stepwise only - no skips.</p>
                  {/if}

                  <p class="text-xs text-sr-faint">Steps are always allowed. Each skip may be sung in any octave.</p>
                </div>
              </details>
            </div>

            <div class="space-y-2">
              <p class="sr-label">Stepwise accidentals</p>
              <button
                class="sr-tok {accidentalsFollowStep ? 'sr-on' : ''}"
                on:click={() => (accidentalsFollowStep = !accidentalsFollowStep)}
                aria-label="Stepwise accidentals"
                aria-pressed={accidentalsFollowStep}
              >{accidentalsFollowStep ? 'On' : 'Off'}</button>
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
            {#if rangeSpan}
              <p class="text-xs text-sr-faint">
                This range follows the key: it is placed around do for each key drawn. Change it
                here and it becomes your own.
              </p>
            {/if}
          </div>
        {/if}


      </div>
    </div>

      <!-- Score options: how the exercise is shown and played (none of it
         regenerates anything). Its own box below the setup, and it folds away;
         whether it is open is remembered (scoreOptionsOpen). -->
    <section class="sr-panel w-full mb-4 p-4 no-print" class:opacity-60={!!assignment} {...(assignment ? { inert: true } : {})} aria-labelledby="score-options-heading">
      <button type="button" class="w-full flex items-start gap-2 text-left" aria-expanded={scoreOptionsOpen} aria-controls="score-options-body" on:click={toggleScoreOptions}>
        <ChevronRight size={18} class="mt-0.5 shrink-0 transition-transform {scoreOptionsOpen ? 'rotate-90' : ''}" />
        <span>
          <span id="score-options-heading" class="block text-sm font-semibold text-sr-ink">Score options</span>
          <span class="block text-xs text-sr-faint">How the exercise is shown and played. Changing these keeps the exercise on screen.</span>
        </span>
      </button>
      {#if scoreOptionsOpen}
      <div id="score-options-body" class="mt-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
      <div class="space-y-2">
        <p class="sr-label">Playback sound</p>
        <div class="sr-select">
          <Volume2 size={14} class="sr-select-ico" aria-hidden="true" />
          <select
            class="sr-select-input"
            aria-label="Playback sound"
            value={rhythmOnly ? rhythmSoundId : String(instrumentProgram)}
            on:change={(e) => handleSoundChange(rhythmOnly ? e.currentTarget.value : Number(e.currentTarget.value))}
          >
            {#if rhythmOnly}
              {#each RHYTHM_SOUNDS as sound}<option value={sound.id}>{sound.label}</option>{/each}
            {:else}
              {#each INSTRUMENTS as instrument}<option value={String(instrument.program)}>{instrument.label}</option>{/each}
            {/if}
          </select>
        </div>
        <p class="text-xs text-sr-faint">
          {rhythmOnly
            ? (rhythmSoundFor(rhythmSoundId).kind === "click"
                ? "A click: every note sounds the same length. Good for attacks."
                : "Sustains, so a held note is heard held.")
            : "Changes the sound straight away. The exercise stays as it is."}
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

      <!-- Measure numbers in both modes. The syllables are pitched only:
           rhythm-only has no scale degrees to name, and its syllables live
           in the Rhythm tab - the one place they are set. -->
      <div class="space-y-2">
        <p class="sr-label">Annotations</p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Annotations">
          <button
            class="sr-tok {scoreView.measureNumbers !== false ? 'sr-on' : ''}"
            on:click={() => changeScoreView({ measureNumbers: scoreView.measureNumbers === false })}
            aria-pressed={scoreView.measureNumbers !== false}
          >Measure numbers</button>
          {#if !rhythmOnly}
          {#each lyricSystems as [value, label]}
            <button
              class="sr-tok {showSolfege && lyricSystem === value ? 'sr-on' : ''}"
              on:click={() => handleLyricSystem(value)}
              aria-pressed={showSolfege && lyricSystem === value}
            >{label}</button>
          {/each}
          {/if}
        </div>
        <p class="text-xs text-sr-faint">
          {#if rhythmOnly}
            {scoreView.measureNumbers !== false ? "A number over each bar." : "No measure numbers."} Rhythm syllables are in the Rhythm tab.
          {:else if !showSolfege}
            Clean: the same exercise, printed for sight-reading.
          {:else if lyricSystem === "movable"}
            Movable do under the staff: do is the tonic, so a tune reads the same in
            every key.
          {:else if lyricSystem === "fixed"}
            Fixed do under the staff: C is do whatever the key.
          {:else}
            The note names under the staff.
          {/if}
        </p>
      </div>

      {#if !rhythmOnly}
      <div class="space-y-2">
        <p class="sr-label">Dynamics</p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Dynamics">
          <button class="sr-tok {dynamicsSet.length === 0 ? 'sr-on' : ''}" aria-pressed={dynamicsSet.length === 0} on:click={() => handleDynamicsChange([])}>Off</button>
          <!-- On: every mark; a level that names its own (NYSSMA) shows On and keeps them. -->
          <button class="sr-tok {dynamicsSet.length > 0 ? 'sr-on' : ''}" aria-pressed={dynamicsSet.length > 0} on:click={() => dynamicsSet.length === 0 && handleDynamicsChange([...DYNAMIC_MARKS])}>On</button>
        </div>
        <p class="text-xs text-sr-faint">
          {dynamicsSet.length === 0
            ? "No dynamics printed."
            : dynamicsSet.length === 1
              ? `${dynamicsSet[0]} under the first note. Playback follows it.`
              : "One under the first note, and each 4-bar phrase may change it. Playback follows them."}
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
      </div>
      {/if}
    </section>

  <!-- Drill: its own box below the settings (it was inside the setup panel, under every tab). -->
    <section class="sr-panel w-full mb-4 p-4 space-y-4 no-print" class:opacity-60={!!assignment} {...(assignment ? { inert: true } : {})} aria-labelledby="drill-heading">
      <!-- The whole header is the toggle: the button's ::after stretches
           over the bar, and Start / Stop sit above it. -->
      <div class="relative flex items-center justify-between gap-3 flex-wrap cursor-pointer">
        <button
          type="button"
          class="flex items-start gap-2 text-left after:absolute after:inset-0 after:content-['']"
          aria-expanded={drillPanelOpen}
          aria-controls="drill-settings"
          on:click={() => (drillPanelOpen = !drillPanelOpen)}
        >
          <span class="text-sr-muted mt-0.5">
            {#if drillPanelOpen}<ChevronDown size={16} />{:else}<ChevronRight size={16} />{/if}
          </span>
          <span>
            <span id="drill-heading" class="block text-sm font-semibold text-sr-ink">Drill</span>
            <span class="block text-xs text-sr-faint mt-0.5">
              Generates and plays a whole session, hands free.
            </span>
          </span>
        </button>
        {#if drillRunning}
          <button
            class="sr-btn-quiet relative z-10 font-semibold text-sr-danger border-sr-danger"
            on:click={() => stopDrill()}
          >Stop drill</button>
        {:else}
          <!-- Peach, with a play mark: not the blue of Generate, which it
               was easy to take it for. -->
          <button
            class="relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-extrabold bg-sr-peach text-sr-peach-ink hover:brightness-95 disabled:opacity-50"
            on:click={startDrill}
            disabled={isLoading}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 1.2v9.6L10.4 6z" /></svg>
            Start drill
          </button>
        {/if}
      </div>

      {#if drillStatusLine}
        <p class="text-sm text-sr-action-fg bg-sr-tint rounded px-3 py-2">
          {drillStatusLine}
        </p>
      {/if}

      <div id="drill-settings" class:hidden={!drillPanelOpen} class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div class="space-y-2">
          <p class="sr-label">New Exercises</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="New exercises in a drill">
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
              Each new exercise is faster: {drillRunning ? drillStartBpm : bpm} up to {drillRampEndBpm} BPM. The tempo goes back when the drill ends.
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
            The first pass is always your own settings, since that is the one
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
                  next exercise and when the drill ends.
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
                    : 'No click on the repeats. Keep the beat yourself.'}
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
              exactly as long as the first pass. Only the cursor moves.
            </p>
          {:else if repeatCountInSilent}
            <p class="text-xs text-sr-faint">
              With no click on the repeats, their count-in is a silent bar, and the repeat
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
  </div>

  <!-- The music (all full screen keeps). -->
  <div class="wide-right focus-keep w-full">
    <!-- Music Display (all that full screen keeps) -->
    <div class="focus-score relative w-full">
      <!-- "1, 2, Ready, Go" at the top-left of the music, above the first staff. -->
      <CountInBadge />
      <!-- Kept in full screen: a class grades its clapping on the TV. -->
      <div class="flex justify-end">
        <button
          class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold bg-sr-peach text-sr-peach-ink hover:brightness-95 disabled:opacity-50"
          on:click={openGrade}
          disabled={grading}
          title={rhythmOnly ? "Clap it (or tap it) and get a score, alone or as a class" : "Sing it into the microphone and get a score"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          {rhythmOnly ? "Clap and grade" : "Listen and grade"}
          <span class="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">Beta</span>
        </button>
      </div>
      <!-- Before the first exercise, say what to do: the page used to open on an
           empty white card. Outside #paper, which abcjs empties when it draws. -->
      {#if !originalTuneString && !isLoading}
        <div class="sr-sheet w-full my-2 px-6 py-8 flex flex-col gap-4">
          <div class="skel-staff">
            {#each [0, 1, 2, 3, 4] as _line}<div class="skel-staff-line"></div>{/each}
          </div>
          <p class="text-center text-sm text-[#56637f] font-semibold">Press Generate to write an exercise.</p>
        </div>
      {/if}
      <div
        id="paper"
        class="sr-sheet w-full my-2"
        class:hidden={!originalTuneString && !isLoading}
      >
        {#if isLoading}
          <div class="flex items-center justify-center h-48">
            <div class="text-sr-muted text-sm">Generating exercise…</div>
          </div>
        {/if}
      </div>
    </div>

    <!-- While playing, leave a viewport's worth of room below the score. The
         document otherwise ends at the last system, so the browser clamps the
         scroll and the final lines can never rise to the reading position. -->
    {#if isPlaying}
      <div aria-hidden="true" class="focus-keep w-full" style="height: 75vh"></div>
    {/if}

    <div class="h-4"></div>
  </div>
  </main>

  <!-- Sticky playback bar. The unison-only audio controls ride in its "extra"
       slot, so mobile gets one bar instead of two stacked ones. Slot content is
       compiled in this component's scope, so every handler below still binds
       directly to local state. -->
  <PlaybackBar
    fullscreen={$fullscreenOn}
    onToggleFullscreen={fullscreenCtl.toggle}
    {annotationChoices}
    onAnnotation={pickAnnotation}
    {scoreView}
    onScoreView={changeScoreView}
    {isPlaying}
    bpm={tempo}
    beatSymbol={beatSymbolOf(meterOf(currentTune, selectedTimeSignature))}
    {looping}
    voiceNames={[]}
    mutedVoices={new Set()}
    hasExercise={currentTune !== null}
    onPlay={() => { if (!grading) playMusic(); }}
    onPause={handleBarPause}
    onStop={handleBarStop}
    onRestart={handleRestart}
    onBpmChange={handleBpmChange}
    onBpmCommit={handleBpmCommit}
    isPreparing={isStartingPlayback}
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
      <!-- Instrument volume (the percussion level in rhythm-only mode); kept in full screen -->
      <div class="fs-keep flex items-center gap-2">
        <button
          class="flex-shrink-0 opacity-80 hover:opacity-100 flex items-center justify-center h-11 w-11 xl:h-8 xl:w-8"
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
          class="w-16 accent-sr-bar-on"
          aria-label={rhythmOnly ? 'Percussion volume' : 'Piano volume'}
        />
      </div>

      <!-- Metronome; kept in full screen -->
      <div class="fs-keep flex items-center gap-2">
        <button
          class="flex-shrink-0 opacity-80 hover:opacity-100 flex items-center justify-center h-11 w-11 xl:h-8 xl:w-8"
          on:click={() => setClickWithMusic(!$tuner.clickWithMusic)}
          title="Click with the music"
          aria-label="Toggle metronome click during playback"
          aria-pressed={$tuner.clickWithMusic}
        >
          <MetronomeIcon size={22} />
        </button>
        <input
          type="range" min="0" max="1" step="0.05"
          value={$tuner.metronomeVolume}
          on:input={(e) => tuner.setMetronomeVolume(Number(e.currentTarget.value))}
          class="w-16 accent-sr-bar-on"
          aria-label="Metronome volume"
        />
        <button
          class="rounded-full px-3 py-2 xl:py-0.5 text-xs font-semibold {metronomeSounding($tuner) ? 'bg-sr-peach text-sr-peach-ink' : 'bg-sr-bar-btn hover:bg-sr-bar-btn-hi'}"
          on:click={toggleMetronome}
          aria-pressed={metronomeSounding($tuner)}
          title="The metronome, the same one as in Tools: on its own, or with the music while it plays"
        >{metronomeSounding($tuner) ? 'Click On' : 'Click'}</button>
      </div>

      <!-- The drone lives in the Tools wheel (its card follows the exercise's key); the bar kept a second one. -->
    </svelte:fragment>
  </PlaybackBar>
</div>


<svelte:window on:keydown={onTapKey} />
<style>
  /* Grade: the note waiting to be sung, then how each went. */
  :global(#paper .grade-now), :global(#paper .grade-now path) {
    fill: #2f6fe0;
    color: #2f6fe0;
  }
  :global(#paper .grade-good), :global(#paper .grade-good path) { fill: #1f9d6b; color: #1f9d6b; }
  :global(#paper .grade-ok), :global(#paper .grade-ok path) { fill: #c98a00; color: #c98a00; }
  :global(#paper .grade-bad), :global(#paper .grade-bad path) { fill: #d13f2f; color: #d13f2f; }
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
  .skip-icon :global(svg) {
    height: 100%;
    width: auto;
  }
  .tab-scroll::-webkit-scrollbar {
    display: none;
  }
  /* The play-along video button: peach, so it reads as its own thing beside
     Generate's blue. */
  .sr-btn-video {
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
  }
  .sr-btn-video:hover:not(:disabled) {
    background: var(--sr-peach);
    filter: brightness(0.96);
  }
  .sr-pro-tag {
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    padding: 3px 7px;
    border-radius: 999px;
    background: var(--sr-peach-ink);
    color: var(--sr-peach);
  }
</style>
