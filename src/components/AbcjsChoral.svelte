<script lang="ts">
  import { createFullscreen } from "../lib/fullscreen";
  import { loadScoreView, saveScoreView, withLineSpacing, withMeasureNumbers, type ScoreView } from "../lib/score-view";
  import { styleCopyright, withCopyright } from "../lib/copyright";
  import { tuner } from "../lib/tuner/store";
  import { drumPatternFor, withClickByBar } from "../lib/playback-click";
  import { beatLevelsFor } from "../lib/tuner/click-pattern";
  import { assistedLevels, assistsTheClick } from "../lib/tuner/practice-assistant";
  import { barCount, drawnLines, evenLines, isDense, measuresPerLine as barsPerLine } from "../lib/score-layout";
  import {
    crossedWholeBeat,
    newMetronomeBeatState,
  } from "../lib/metronome-beats";
  import { onMount, onDestroy, tick } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import GenerationLimit from "./GenerationLimit.svelte";
  import PlanEndingBanner from "./PlanEndingBanner.svelte";
  import UpgradeNotice from "./UpgradeNotice.svelte";
  import FreeMonthPromo from "./FreeMonthPromo.svelte";
  import CountInBadge from "./CountInBadge.svelte";
  import { revealNextLine, scrollToReadingPosition, systemAt, systemOf } from "../lib/scroll-to-system";
  import { countInMeasures, hideCountIn, meterOf, showCountIn } from "../lib/count-in";
  import AssignmentBanner from "./AssignmentBanner.svelte";
  import { assignmentIdFromUrl, fetchAssignment, type OpenAssignment } from "../lib/assignment-client";
  import { startPractice } from "../lib/practice-tracker";
  import { ASSIGNMENT_PARAM } from "../lib/practice";
  import { countGeneration, mayGenerate, usage } from "../lib/usage";
  import { rememberExercise } from "../lib/recent-client";
  import { revealScore } from "../lib/reveal-score";
  import { activePresetToRestore, rememberActivePreset } from "../lib/active-preset";
  import { linkedPresetId, openLinkedPreset } from "../lib/preset-link";
  import { applyClick, clickFrom, currentClick, numberIn } from "../lib/preset-click";
  import { exercisePlays, linkPageTempo, metronomeSounding, setClickWithMusic, toggleMetronome } from "../lib/tools/metronome-link";
  import abcjs from "abcjs";
  import { RefreshCw, Minus, Plus, ChevronLeft, ChevronRight, ChevronDown, Volume2, Eye } from "lucide-svelte";
  import MetronomeIcon from "./ui/metronomeIcon.svelte";
  import { applyMixLevels } from "../lib/mix-volumes";
  import { chords as fullChordSet } from "../resources/chords";
  import { rhythms as allRhythms } from "../resources/rhythms";
  import { rhythmLabel } from "../lib/rhythm-labels";
  import { beatsOf, timeSignaturesFor } from "../lib/meter";
  import { failureHint, type PartSpan } from "../lib/failure-hint";
  import {
    planForm,
    requiredMeasures,
    describeForm,
    majorKeysFor,
    POLYPHONY_CEILING,
    type FormPlan,
  } from "../lib/form-plan";
  import { startChoralJob, rendererFor, JobCancelled, type ChoralJobResult } from "../lib/choral-jobs";
  import {
    packExercise,
    unpackExercise,
    exerciseParam,
    exerciseFragment,
    choralSummary,
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
  import { minorSolfegeFrom, type LyricSystem, type MinorSolfege } from "../resources/solfege";
  import {
    canAppearInChoral,
    containsRest,
    isSelectableRhythm,
    rhythmPickerGroups,
  } from "../lib/selectable-rhythms";
  import type { GenerateChoralParams } from "../lib/generateChoral";
  import type { TimeSignature, PartsObject } from "../lib/types";
  import { ClefType } from "../lib/types";
  import type { Chord } from "../lib/types";
  import type { Rhythm } from "../resources/rhythms";
  import RangeSelector from "./ui/rangeSelector.svelte";
  import { uilPresets, type UILPreset } from "../lib/uil-presets";
  import { ladderById, stepHref, stepLabel, STEP_PARAM, type LadderStep, type ChoralStepSettings } from "../lib/ladder";
  import { canFillExercise } from "../lib/rhythm-feasibility";
  import { unisonProbabilityFor } from "../lib/unison-spans";
  import { rhymeProbabilityFor } from "../lib/rhyming-phrases";
  import { melodyFirstFor } from "../lib/two-part-treble";
  import { skipLevelFor } from "../lib/uil-skips";
  import { ssaLevelFor } from "../lib/three-part-treble";
  import {
    clampTranspose,
    transposeLabel,
    withPlaybackTranspose,
    MIN_TRANSPOSE,
    MAX_TRANSPOSE,
  } from "../lib/transpose";
  import {
    INSTRUMENTS,
    DEFAULT_INSTRUMENT,
    isInstrumentProgram,
    withInstrument,
  } from "../lib/instruments";
  import PlaybackBar from "./PlaybackBar.svelte";
  import PresetDropdown from "./PresetDropdown.svelte";
  import ToolsWheel from "./tools/ToolsWheel.svelte";
  import { setPracticeContext } from "../lib/tools/context";
  import type { SavedPreset, PresetParams } from "../lib/preset-storage";

  // ── Playback state ─────────────────────────────────────────────────────────
  let synthControl: any = null;
  let renderedTune: any = null;
  let isPlaying = false;
  let looping = false;
  let mutedVoices: Set<string> = new Set();
  /**
   * Voices with no staff on the page - still heard unless muted as well (see
   * initSynth). Unlike muting this goes in the share link: "the alto part on
   * its own" is a link worth sending.
   */
  let hiddenVoices: Set<string> = new Set();
  let bpm = 60;
  let generatedBpm = 60;
  /** 0-1.5, 1 = as written. Remembered per browser, not put in the share link. */
  let playbackVolume = 1;
  const MIX_STORAGE_KEY = "choral-mix-levels";

  // ── Tab state ──────────────────────────────────────────────────────────────
  type Tab = 'setup' | 'rhythm' | 'harmony' | 'ranges';
  let selectedTab: Tab = 'setup';

  // ── Preset state ───────────────────────────────────────────────────────────
  let activePresetLabel = '';
  let _presetParamSig = '';
  /** Each tab's settings when the active preset was applied, for its dot. */
  let _presetTabSigs: Record<string, string> | null = null;
  /** The saved preset the settings came from, so it can be saved over. */
  let activeSavedId: string | null = null;
  /** Loads the active preset again, for Revert. */
  let revertPreset: (() => void) | undefined = undefined;

  /**
   * The level the settings came from - a UIL level, or a ladder step, which is
   * shaped like one - or null when none is chosen. It dims what is outside it
   * and sets the level-driven behaviour (unison openings, phrase rhyme).
   */
  let activeLevel: UILPreset | null = null;
  /** The ladder step the settings came from, when they came from one. */
  let activeStepId: string | null = null;

  // ── Generation parameters ──────────────────────────────────────────────────
  const measureOptions = [2, 4, 8, 16];

  let possibleVoicing: Record<string, PartsObject> = {
    "4 Part Mixed": {
      numofParts: 4,
      parts: {
        Soprano: { order: 3, smallName: "S",  clef: ClefType.Treble,        range: [21, 35], currentRange: [25, 32] },
        Alto:    { order: 2, smallName: "A",  clef: ClefType.Treble,        range: [14, 32], currentRange: [21, 28] },
        Tenor:   { order: 1, smallName: "T",  clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [14, 23] },
        Bass:    { order: 0, smallName: "B",  clef: ClefType.Bass,          range: [2, 24], currentRange: [9,  18] },
      },
    },
    "3 Part Mixed": {
      numofParts: 3,
      parts: {
        Soprano:  { order: 2, smallName: "S",  clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
        Alto:     { order: 1, smallName: "A",  clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
        Baritone: { order: 0, smallName: "B",  clef: ClefType.Bass,   range: [2, 26], currentRange: [9,  18] },
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
        Baritone: { order: 1, smallName: "B1", clef: ClefType.Bass,          range: [2, 26], currentRange: [6,  16] },
        Bass:     { order: 0, smallName: "B2", clef: ClefType.Bass,          range: [2, 24], currentRange: [2,  11] },
      },
    },
    "2 Part Treble": {
      numofParts: 2,
      parts: {
        Soprano: { order: 1, smallName: "S", clef: ClefType.Treble, range: [21, 35], currentRange: [25, 32] },
        Alto:    { order: 0, smallName: "A", clef: ClefType.Treble, range: [14, 32], currentRange: [21, 28] },
      },
    },
    /**
     * Two men's parts, which is what the UIL document actually asks for at the
     * lower levels - level 1 is "Treble: SA" and "Tenor-Bass: TB", level 2 adds
     * TBB beside TB. The app only had the three-part version, and three men
     * moving by no more than a third is close to unwritable: measured over 200
     * exercises on each level's own chords, rhythms and ranges, 3-Part
     * Tenor/Bass fails 46% of the time at level 1 and 18% at level 2, where this
     * fails 0%. A tenor-bass choir at level 1 had nothing to practice with at
     * all - the level offered only treble voicings and unison.
     *
     * The bass gets the full bass range rather than the floor the three-part
     * voicing gives it, since there is no baritone to fit above it.
     */
    "2 Part Tenor/Bass": {
      numofParts: 2,
      parts: {
        Tenor: { order: 1, smallName: "T", clef: ClefType.TrebleOctaveUp, range: [11, 27], currentRange: [14, 23] },
        Bass:  { order: 0, smallName: "B", clef: ClefType.Bass,           range: [2, 24], currentRange: [9,  18] },
      },
    },
  };

  /**
   * Each part's range as the page ships it, before a preset, a link or the
   * Ranges tab touches anything - those all mutate possibleVoicing in place, so
   * without this copy there is nothing to reset a part to.
   */
  const DEFAULT_RANGES: Record<string, Record<string, [number, number]>> = structuredClone(
    Object.fromEntries(
      Object.entries(possibleVoicing).map(([voicing, def]) => [
        voicing,
        Object.fromEntries(
          Object.entries(def.parts).map(([part, p]) => [part, p.currentRange as [number, number]])
        ),
      ])
    )
  );

  /** Choral is simple meter only: compound meter is Unison's for now. */
  let timeSignatures: Record<string, TimeSignature> = timeSignaturesFor(["4/4", "3/4", "2/4"]);

  /** Off draws nothing; smooth glides with the music; note lands on each note. */
  /**
   * "Independent parts" is gone - the tacet spans and mid-piece drop-outs it
   * named are not wanted. A link still carrying it falls back to All voices.
   *
   * "Staggered entrances" is back, and it is the opening entrance and nothing
   * else. It does mean the exercise no longer begins with the full tonic chord,
   * which is the reason it once came out: a singer whose part rests through the
   * first bars can read that as a pickup. The difference is that it is now a
   * texture someone picks on purpose, rather than something the old
   * "independent" setting did to every exercise unasked. All voices is still
   * the default.
   */
  const voiceTextures = ["full", "staggered"] as const;
  type TextureMode = (typeof voiceTextures)[number];
  const voiceTextureLabels: Record<TextureMode, string> = {
    full: "All voices",
    staggered: "Staggered entrances",
  };
  const isVoiceTextureMode = (v: unknown): v is TextureMode =>
    typeof v === "string" && (voiceTextures as readonly string[]).includes(v);
  let voiceTexture: TextureMode = "full";

  /** Playback voice. See src/lib/instruments.ts for why the list is short. */
  let instrumentProgram: number = DEFAULT_INSTRUMENT;

  /** Solfège syllables under each staff. Off by default - a teaching aid, opted into. */
  /**
   * What goes under the notes, or null for nothing: movable-do solfège (do is
   * the tonic), fixed do (C is always do), or the note names themselves.
   */
  let lyricSystem: LyricSystem | null = null;
  /** How a minor key is sung in movable do (solfege.ts): la-based unless chosen. */
  let minorSolfege: MinorSolfege = "la";
  $: showSolfege = lyricSystem !== null;
  /**
   * Chord symbols above the top staff, controlled on their own.
   *
   * There used to be a master switch over both this and the solfège, which meant
   * the two things a director actually wants apart - the harmony to talk about,
   * the syllables to sing from - could only be had together or not at all. Each
   * now re-writes the exercise already on screen.
   */
  // Off by default. Chord symbols over the top staff are an analysis aid, and
  // a sight-reading exercise is meant to be read from the notes - having them
  // on unasked tells the reader the harmony before they have worked it out.
  let showChords = false;

  /**
   * Re-writes the current exercise with different annotations.
   *
   * Held from the last generation so a display toggle costs a re-render rather
   * than a new exercise; null until something has been generated.
   */
  let renderCurrent: ((display: any) => string) | null = null;

  // ── Links to the exercise itself ───────────────────────────────────────────
  /** The exercise on screen as the job produced it: what a link to it packs. */
  type ExerciseSource = Pick<ChoralJobResult, "exercise" | "sections">;
  /**
   * The exercise packed for a link, or null while packing (or with nothing to
   * pack). Packed as soon as an exercise is on screen, not on the click:
   * packing awaits the compressor, and Safari refuses a clipboard write that
   * comes after an await.
   */
  let exercisePacked: string | null = null;
  let packing = 0;
  function useExerciseSource(source: ExerciseSource | null) {
    exercisePacked = null;
    const mine = ++packing;
    if (!source) return;
    packExercise({ kind: "choral", result: source })
      .then((value) => {
        if (mine !== packing) return;
        exercisePacked = value;
        // For the home page's Recent exercises (signed in only).
        void rememberExercise({
          page: "choral",
          title: activePresetLabel || "Choral exercise",
          detail: [selectedVoicing, keyName(selectedKey), selectedTimeSignature, fullLength ? "Full length" : `${measures} bars`].join(" · "),
          href: settingsLink() + exerciseFragment(value),
        });
      })
      .catch((error) => console.error("Could not pack the exercise for a link:", error));
  }
  /**
   * `#ex=…` while the page shows the exercise a link opened. Kept through every
   * settings write to the URL, so a reload reopens it; cleared once Generate
   * replaces it.
   */
  let exerciseHash = "";
  /** A link whose exercise would not open. Its settings still load. */
  let linkError: string | null = null;

  /**
   * Whether the chosen rhythms can actually tile the bar, worked out ahead of
   * pressing Generate.
   *
   * Some selections simply cannot: a dotted quarter + eighth is 16 units, and in
   * 3/4 a bar is 24 - with only half notes beside it there is no way to reach
   * 24, so generation refuses every single time. Without this the only feedback
   * was an alert on each press with nothing on the page changing, which reads as
   * the app being stuck rather than as the selection being impossible.
   *
   * Choral never ties across a barline, hence the `false`.
   */
  $: rhythmsCanFill =
    selectedRhythms.length === 0 ||
    canFillExercise(
      selectedRhythms.filter((r): r is Rhythm => r !== undefined),
      timeSignatures[selectedTimeSignature].tsPerMeasure,
      measures * timeSignatures[selectedTimeSignature].tsPerMeasure,
      false
    );

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
  let cursorMode: CursorMode = "beat";
  let playbackCursor: SVGLineElement | null = null;
  /** Whole-beat tracker for the beat-by-beat cursor. */
  let cursorBeats = newMetronomeBeatState();

  let selectedTimeSignature = "4/4";
  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m"];
  let selectedKey = "C";
  /**
   * The keys to choose between. Generation picks one at random, so a teacher can
   * set "any of F, C, G" and get a different one each time rather than drilling
   * the same key. `selectedKey` is whichever was drawn most recently - it drives
   * the chord picker's mode and the printed title, so the page always says which
   * key you actually got.
   */
  let selectedKeys: Set<string> = new Set(["C"]);
  let measures = 8;
  /**
   * Plan and generate a whole UIL-length example rather than a phrase.
   *
   * Off by default: pressing Generate to drill eight bars is what this page is
   * for most of the time, and a full example takes seven generations and a few
   * seconds. It needs a UIL level, because the length, the shape and how much
   * of it may be polyphonic all come from the level - see form-plan.ts.
   */
  let fullLength = false;
  /** Bars for the full-length piece; set from the level's range when enabled. */
  let fullLengthMeasures = 0;
  let formPlan: FormPlan | null = null;
  let formPlanError: string | null = null;
  /** Section joins the seam check could not make good, by the section before. */
  let roughSeams: string[] = [];
  let maxSkip = 4;
  const maxSkipRange = [2, 8];
  const skipIntervalNames: Record<number, string> = {
    1: 'a 2nd', 2: 'a 3rd', 3: 'a 4th', 4: 'a 5th',
    5: 'a 6th', 6: 'a 7th', 7: 'an octave', 8: 'a 9th',
  };
  let nctProbability = 0.1;
  let accidentalsByStep = true;
  /**
   * Eighths approached and left by step or repeat - see generateChoral.
   *
   * On by default. Choral sight-reading almost never skips into or out of an
   * eighth, and with it off 37% of our short notes did.
   */
  let stepwiseEighths = true;
  let chromaticFrequency = 1;
  /**
   * One chromatic chord to drill ("5/5" for V/V), or null. See `focusChord` in
   * generateChoral: every other chromatic chord is left out and this one is
   * reached for until it appears.
   */
  let focusChord: string | null = null;

  /**
   * Why the last Generate produced nothing.
   *
   * This used to be `alert()` with the thrown message - "Failed to build valid
   * notes after max attempts" - which reads as the app breaking rather than the
   * settings being hard, and cannot be read on a phone without dismissing it.
   *
   * Generation is a search and can genuinely come up empty. The useful thing is
   * not the message but which setting to move, so the hint below names one.
   */
  let generationError: string | null = null;

  /** The likeliest thing to change, given what is actually set. */
  /** The parts as the hint module wants them: a name and a current range. */
  function partSpans(): PartSpan[] {
    return Object.entries(possibleVoicing[selectedVoicing]?.parts ?? {}).map(
      ([name, p]: [string, any]) => ({ name, range: [...p.currentRange] as [number, number] })
    );
  }

  function currentFailureHint(): string {
    return failureHint({
      parts: partSpans(),
      measures,
      chordCount: userAllowedChords.size,
      maxSkip,
      stepwiseEighths,
    });
  }

  let chordProgression: Chord[] = [];
  let renderedString = "";
  /**
   * Semitones to shift PLAYBACK by, leaving the notation exactly as written.
   *
   * A display setting in the same sense as the instrument: it changes nothing
   * about the exercise, so it is kept out of the unsaved-changes signature.
   */
  let transposeSemitones = 0;

  let selectedVoicing = "4 Part Mixed";

  /**
   * A voicing name the table actually has, or the default.
   *
   * Shared links and saved presets carry a voicing by name, so one that has been
   * retired outlives the table - "Unison" did, when single-line practice moved to
   * its own page. Without this the page keeps the dead name, every lookup falls
   * through to `?? {}`, and the result is a voicing with no parts rather than an
   * error anyone would see.
   */
  const knownVoicing = (name: string | null | undefined): string =>
    name && name in possibleVoicing ? name : "4 Part Mixed";

  // ── Chord state ────────────────────────────────────────────────────────────
  function isMinorKey(k: string): boolean { return k.endsWith('m'); }

  const majorChordNames = fullChordSet.filter((c) => c.mode !== 'minor').map((c) => c.name);
  const minorChordNames = fullChordSet.filter((c) => c.mode === 'minor').map((c) => c.name);
  const allChordNames = fullChordSet.map((c) => c.name); // for UIL preset compatibility

  /**
   * Inversions are never a choice. A chord in first inversion is the same
   * harmony as the chord in root position - "V" names the dominant, not one
   * spelling of it - so asking the user to tick V6 separately from V invites
   * them to switch off the bass line's whole vocabulary without meaning to.
   * Every failed generation we chased came from a search left with too few
   * legal bass notes, and this was the biggest single source of that.
   *
   * So: no picker entry, always in the allowed set, in both modes.
   */
  const majorInversions = ['1-6','1-64','2-6','4-6','4-64','5-6','5-64','6-6'];
  const minorInversions = [
    // Deliberately NOT 'm_i64'. The cadential six-four is defined and major
    // grants its equivalent, but in minor it has never actually been
    // reachable - no preset lists it - and switching it on measured 3-Part
    // Treble from 1.3% to 5.5% failures on its own, which an ablation over
    // all eight pinned to this chord alone. It also does nothing for the bass
    // accidentals this set was added to fix: its bass is degree 4, diatonic.
    // Worth having, as its own change, measured on its own terms.
    'm_i6','m_iid6','m_iv6','m_iv64','m_V6','m_V64','m_VI6','m_viid6',
  ];

  /**
   * Whatever the user picked, plus the inversions they never had to pick.
   *
   * Mode-aware, because the two chord vocabularies are disjoint: adding the
   * minor inversion to a major selection would leave the set permanently one
   * name larger than the mode's full list, which is what the unsaved-changes
   * badge compares against.
   */
  /**
   * A chromatic-bass inversion is the same harmony as the chord it inverts, so
   * it is not a separate choice either - it simply comes with its parent.
   *
   * V⁶/V *is* V/V, with the raised note in the bass instead of above it. Asking
   * the user to tick it separately invites them to switch off the only route by
   * which that note reaches the bass deliberately, with its approach and
   * resolution enforced. Tying it to the parent keeps the two together and
   * takes a row of buttons off the panel.
   */
  const chromaticBassInversions: Record<string, string> = {
    "5/5": "5/5-6",
    "5/6": "5/6-6",
    "5/2": "5/2-6",
  };

  function withInversions(names: Iterable<string>): Set<string> {
    const set = new Set(names);
    for (const name of isMinorKey(selectedKey) ? minorInversions : majorInversions) {
      set.add(name);
    }
    // Follows the parent both ways: without the delete, one that was on once
    // would linger after its parent was switched off.
    for (const [parent, inversion] of Object.entries(chromaticBassInversions)) {
      if (set.has(parent)) set.add(inversion);
      else set.delete(inversion);
    }
    return set;
  }

  /** The lyric options, in the order the buttons show them. */
  const lyricSystems: [LyricSystem, string][] = [
    ["movable", "Movable do"],
    ["fixed", "Fixed do"],
    ["names", "Note names"],
  ];

  let userAllowedChords: Set<string> = new Set(majorChordNames);

  const majorChordGroups: Record<string, string[]> = {
    Diatonic: ['1','2','3','4','5','5-7','6','7'],
    'Chromatic Chords': ['5/5','5/6','5/2','m4','1-7'],
    // No 'Chromatic Bass' row: those are inversions of the three secondary
    // dominants above and come with them. See chromaticBassInversions.
  };
  const minorChordGroups: Record<string, string[]> = {
    Diatonic: ['m_i','m_iv','m_V','m_V7','m_VI','m_VII'],
    'Predominant': ['m_iid'],
    'Other': ['m_III','m_viid'],
  };

  $: chordGroups = isMinorKey(selectedKey) ? minorChordGroups : majorChordGroups;
  $: currentModeChordNames = isMinorKey(selectedKey) ? minorChordNames : majorChordNames;

  // ── Rhythm state ───────────────────────────────────────────────────────────
  // isSelectableRhythm is the shared rule for "what a user may pick" - it is
  // what drops the bare dotted quarter, and unison has always used it.
  //
  // Plain rests are offered; a *pattern* containing a rest is not. Choral counts
  // one chord per pattern and skips rests when counting, so a figure like
  // eighthRestEighth is counted as zero chord positions while build-chord-notes
  // still consumes one for its pitched half - the progression runs short and
  // generation fails outright. Unison counts a chord for every step including
  // rests, so the same figure is fine there.
  /**
   * How often each rhythm should turn up, by name. Anything absent is 1.
   *
   * The generator already leans toward slower notes, which is right for a sung
   * exercise, but "right" varies by level and by what a director is drilling
   * this week. Rather than guess a number per rhythm, this is the knob.
   */
  const rhythmFrequencies = [
    { label: "Rare", value: 0.25 },
    { label: "Normal", value: 1 },
    { label: "Often", value: 4 },
  ] as const;
  let rhythmBias: Record<string, number> = {};
  /**
   * Takes the map as an argument rather than closing over it. Svelte tracks what
   * the *template* reads, so a helper that quietly reaches for `rhythmBias`
   * creates no dependency and the buttons never restyle - they were changing the
   * value and showing the old one.
   */
  const frequencyOf = (bias: Record<string, number>, name: string) =>
    bias[name] ?? 1;
  function setFrequency(name: string, value: number) {
    const next = { ...rhythmBias };
    if (value === 1) delete next[name];
    else next[name] = value;
    rhythmBias = next;
  }

  const choralSelectable = (r: Rhythm) =>
    isSelectableRhythm(r) && !(r.pattern === true && containsRest(r));

  let filterRhythms: Record<string, Rhythm> = Object.fromEntries(
    allRhythms.filter(choralSelectable).map((r) => [r.name, r])
  );

  let selectedRhythms: Rhythm[] = allRhythms.filter(
    (r) => ["quarter", "half", "dotHalf"].includes(r.name)
  );

  const rhythmSvgs = Object.fromEntries(
    allRhythms
      .filter(choralSelectable)
      .map((r) => [r.name, import(`../assets/svgs/${r.name}.svg?raw`)])
  );

  // ── Non-default badge logic ────────────────────────────────────────────────
  const DEFAULTS = {
    voicing: '4 Part Mixed', key: 'C', timeSig: '4/4', measures: 8,
    maxSkip: 4, nctProbability: 0.1, stepwiseEighths: true,
    voiceTexture: 'full',
    rhythmNames: ['quarter', 'half', 'dotHalf'],
  };

  /**
   * Each tab's settings as one string. With a preset active, a tab's dot
   * means "changed since you chose the preset", not "differs from the page's
   * bare defaults": choosing a level changes every tab, so measured against
   * the defaults the dots lit up on arrival and said nothing.
   */
  $: _tabSigs = {
    setup: [selectedVoicing, [...selectedKeys].sort().join(","), selectedTimeSignature, measures, voiceTexture].join("|"),
    rhythm: [selectedRhythms.map((r) => r.name).sort().join(","), JSON.stringify(Object.entries(rhythmBias).sort())].join("|"),
    harmony: [maxSkip, Math.round(nctProbability * 100), stepwiseEighths, focusChord, accidentalsByStep, chromaticFrequency, [...userAllowedChords].sort().join(",")].join("|"),
    ranges: Object.values(possibleVoicing[selectedVoicing]?.parts ?? {}).map((p) => p.currentRange.join("-")).join(","),
  };
  $: fromPreset = activePresetLabel && _presetTabSigs ? _presetTabSigs : null;

  $: setupDirty = fromPreset ? _tabSigs.setup !== fromPreset.setup : selectedVoicing !== DEFAULTS.voicing ||
    [...selectedKeys].sort().join(",") !== DEFAULTS.key ||
    selectedTimeSignature !== DEFAULTS.timeSig || measures !== DEFAULTS.measures ||
    voiceTexture !== DEFAULTS.voiceTexture;
  $: rhythmDirty = fromPreset ? _tabSigs.rhythm !== fromPreset.rhythm : JSON.stringify(selectedRhythms.map(r => r.name).sort()) !==
    JSON.stringify([...DEFAULTS.rhythmNames].sort()) ||
    Object.keys(rhythmBias).length > 0;
  $: harmonyDirty = fromPreset ? _tabSigs.harmony !== fromPreset.harmony : maxSkip !== DEFAULTS.maxSkip || nctProbability !== DEFAULTS.nctProbability ||
    stepwiseEighths !== DEFAULTS.stepwiseEighths || focusChord !== null ||
    userAllowedChords.size !== currentModeChordNames.length;
  /**
   * The range a part goes back to: the preset's, while one is on, else the
   * page's default. Without a preset this used to be measured against the
   * part's full range, which nobody starts at, so the Ranges dot was lit
   * almost always.
   *
   * Takes its inputs as arguments so the reactive statements below re-run when
   * any of them changes.
   */
  function rangeTarget(
    voicing: string,
    partName: string,
    presetOn: boolean,
    level: UILPreset | null,
    saved: SavedPreset | null
  ): [number, number] | undefined {
    if (presetOn) {
      // A saved preset sets the ranges of its own voicing only.
      const fromSaved = saved && saved.params.voicing === voicing ? saved.params.voiceRanges?.[partName] : undefined;
      if (fromSaved) return fromSaved;
      // A UIL level or ladder step names every part, in every voicing.
      const fromLevel = !saved ? level?.voiceRanges?.[partName] : undefined;
      if (fromLevel) return fromLevel as [number, number];
    }
    return DEFAULT_RANGES[voicing]?.[partName];
  }

  $: rangeTargets = Object.fromEntries(
    Object.keys(possibleVoicing[selectedVoicing]?.parts ?? {}).map((name) => [
      name,
      rangeTarget(selectedVoicing, name, !!fromPreset, activeLevel, activeSavedId ? activeSavedPreset : null),
    ])
  ) as Record<string, [number, number] | undefined>;

  const rangeDiffers = (current: number[], target: [number, number] | undefined) =>
    !!target && (current[0] !== target[0] || current[1] !== target[1]);

  $: rangesDirty = Object.entries(possibleVoicing[selectedVoicing]?.parts ?? {})
    .some(([name, p]) => rangeDiffers(p.currentRange, rangeTargets[name]));

  /**
   * What the controls are set to, for telling "still the preset" from "edited".
   *
   * The KEY SELECTION, not the key. Generate draws a key from the selection and
   * assigns it to `selectedKey`, so with the drawn key in here every Generate
   * looked like an edit and the preset name vanished the moment you used it -
   * the options stayed put, which made it look like the preset had silently
   * come off. The selection is the setting; the drawn key is an output.
   *
   * Voice ranges are in here too. They were tracked by appending "(modified)"
   * to the label instead, which appended again on every further drag.
   */
  $: _currentParamSig = [
    [...selectedKeys].sort().join(','),
    selectedTimeSignature, selectedVoicing, measures, maxSkip,
    Math.round(nctProbability * 100),
    selectedRhythms.map(r => r.name).sort().join(','),
    [...userAllowedChords].sort().join(','),
    Object.values(possibleVoicing[selectedVoicing]?.parts ?? {})
      .map(p => p.currentRange.join('-')).join(','),
    // Everything else a preset keeps (getCurrentParams), so changing any of it
    // says "edited" too.
    stepwiseEighths, voiceTexture, JSON.stringify(Object.entries(rhythmBias).sort()),
    accidentalsByStep, chromaticFrequency, focusChord,
    lyricSystem, minorSolfege, showChords, cursorMode, instrumentProgram, transposeSemitones,
    [...hiddenVoices].sort().join(','), [...mutedVoices].sort().join(','),
    playbackVolume, $tuner.metronomeVolume, $tuner.clickWithMusic,
    $tuner.subdivision, $tuner.accent, $tuner.clickSound, $tuner.beatLevels?.join(',') ?? '', $tuner.subMask ?? '',
  ].join('|');

  /**
   * The preset is still named, and said to be edited, rather than dropped.
   *
   * Clearing the name threw away the one piece of information worth keeping:
   * which level these settings came from. "UIL Level 4 - edited" says both.
   */
  $: presetEdited = Boolean(
    activePresetLabel && _presetParamSig && _currentParamSig !== _presetParamSig
  );

  // ── Voice names for playback bar ───────────────────────────────────────────
  $: voiceNames = Object.keys(possibleVoicing[selectedVoicing]?.parts ?? {});
  /**
   * The voices of the exercise on screen. The Voices menu lists these, not
   * `voiceNames`: the Voicing setting can change without regenerating, and then
   * names voices the score does not have - and muting counts voices by position.
   */
  let exerciseVoices: string[] = [];
  $: barVoices = exerciseVoices.length ? exerciseVoices : voiceNames;

  /** A new exercise on screen. Hiding all of its voices would leave nothing to read, so that is dropped. */
  function useExerciseVoices(names: string[]) {
    exerciseVoices = names;
    if (names.length && names.every((n) => hiddenVoices.has(n))) {
      hiddenVoices = new Set();
      updateURLParams();
    }
  }
  /** No exercise yet and nothing being written - show the shape of a score. */
  $: showScorePlaceholder = !renderedTune && !isGenerating;

  // ── Synth helpers ──────────────────────────────────────────────────────────
  /**
   * The click under the exercise is abcjs's drum track, written from the Tools
   * metronome: its subdivision, accent and sound (playback-click.ts). There
   * was no pattern for 2/4, so 2/4 exercises played without a click.
   */
  const drumFor = (timeSignature: string) =>
    drumPatternFor({
      beats: beatsOf(timeSignature),
      subdivision: $tuner.subdivision,
      accent: $tuner.accent,
      sound: $tuner.clickSound,
      beatLevels: $tuner.beatLevels,
      subMask: $tuner.subMask,
    });
  /**
   * Whether the synth is built with the click. Playing, it is whether this
   * playback clicks; stopped, whether the next one will - with the music, or
   * because the metronome is ticking on its own and Play will take it over
   * (metronome-link).
   */
  const clickOnFor = (t: typeof $tuner) => (t.exercisePlaying ? t.musicClick : t.clickWithMusic || t.metronomeRunning);
  const clickKeyFor = (t: typeof $tuner) =>
    `${clickOnFor(t)}|${t.subdivision}|${t.accent}|${t.clickSound}|${t.metronomeVolume}|${t.beatLevels?.join(",") ?? ""}|${t.subMask ?? ""}|${JSON.stringify([t.assistant.silent, t.assistant.drop])}`;
  $: clickOn = clickOnFor($tuner);
  /** The click the synth was last built with, to notice when the metronome changes it. */
  let builtClick = "";
  $: clickKey = clickKeyFor($tuner);
  // Rebuilt when the metronome changes, once the changes stop (a volume drag
  // is many). Never mid-exercise, where it would stop the music: the next pause
  // or stop picks the change up - except turning the click on or off, below.
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  $: if (renderedTune && builtClick && clickKey !== builtClick && !isPlaying) {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      if (renderedTune && clickKeyFor(tuner.get()) !== builtClick && !isPlaying) initSynth(renderedTune);
    }, 250);
  }
  // The click turned on or off while the music plays: pause and rebuild, the
  // way muting a voice does. The choice is kept, so Play carries on with it.
  $: if (isPlaying && renderedTune && builtClick && builtClick.split("|")[0] !== String(clickOn)) {
    pausePlayback();
    initSynth(renderedTune);
  }

  /** Magnification is container / (staffwidth + 30), so a fixed staffwidth of
   *  ~740 renders at under half size on a phone. Measure the container instead.
   *
   *  The cap sets how big the notes get on a wide screen: past it, a wider page
   *  only magnifies. It rose with the page column (max-w-4xl -> 5xl, 896 ->
   *  1024px), 740 -> 846, so the extra width became room for the music at the
   *  size it already was, rather than bigger notes in the same layout. */
  /** Size, bars per line and line spacing: the playback bar's Layout menu (score-view.ts). 1x is the page's usual size. */
  let scoreView: ScoreView = loadScoreView("choral", { scale: 1, bars: null, spacing: "normal" });
  function changeScoreView(patch: Partial<ScoreView>) {
    scoreView = { ...scoreView, ...patch };
    saveScoreView("choral", scoreView);
    if (renderedString) renderTune();
  }

  function scoreLayout(most?: number) {
    const cw = document.getElementById("paper")?.clientWidth ?? 1000;
    // Bars shared out evenly over the lines (score-layout.ts): four bars with
    // words under them were three and a lonely one.
    const abc = typeof renderedString === "string" ? renderedString : "";
    return {
      // Bigger is a narrower staff, which responsive:"resize" scales up to the page.
      staffwidth: Math.max(160, Math.round(Math.min(846, cw - 30) / scoreView.scale)),
      measuresPerLine: barsPerLine({
        measures: barCount(abc) || measures,
        narrow: cw < 480,
        dense: isDense({ lyrics: !!lyricSystem, abc }),
        most,
        want: scoreView.bars,
      }),
    };
  }

  async function renderTune() {
    const mod = await import("abcjs");
    const draw = (most?: number) => {
      const { staffwidth, measuresPerLine } = scoreLayout(most);
      // No `scale`: abcjs discards it when responsive:"resize" is set.
      // The copyright under the score (copyright.ts), as drawn and printed only.
      return mod.renderAbc("paper", withCopyright(withMeasureNumbers(withLineSpacing(renderedString, scoreView.spacing), scoreView.measureNumbers)), {
        // Gives every staff an abcjs-l<line> / abcjs-v<voice> class, which is how
        // the cursor works out how tall a system is. Without it the SVG carries
        // no staff groups at all and the cursor can only cover one voice.
        add_classes: true,
        responsive: "resize",
        staffwidth,
        wrap: { minSpacing: 1.2, maxSpacing: 2.7, preferredMeasuresPerLine: measuresPerLine },
      });
    };
    // The bars per line are only a preference to abcjs; if it had to break the
    // lines itself, unevenly, draw again with no more a line than it fitted.
    let result = draw();
    let drawn = drawnLines(document.getElementById("paper"));
    // Fewer a line each time until they come out even: on a phone two bars with
    // lyrics may not fit either, and abcjs then broke them 1 + 1 + 2.
    let most = Math.max(...drawn);
    while (!evenLines(drawn) && most >= 1) {
      result = draw(most);
      drawn = drawnLines(document.getElementById("paper"));
      most = Math.min(most - 1, Math.max(...drawn));
    }
    styleCopyright(document.getElementById("paper"));
    return result;
  }

  /**
   * The cursor is drawn here rather than by abcjs: `cursorControl` is only a
   * set of callbacks, and abcjs draws nothing of its own from it. Recreated
   * after every render, since renderAbc replaces the whole SVG.
   */
  function createPlaybackCursor() {
    const svg = document.querySelector("#paper svg");
    if (!svg) {
      playbackCursor = null;
      return;
    }
    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    line.setAttribute("class", "abcjs-cursor");
    ["x1", "y1", "x2", "y2"].forEach((a) => line.setAttribute(a, "0"));
    svg.appendChild(line);
    playbackCursor = line as SVGLineElement;
  }

  /**
   * Vertical extent of each system, from the top of its first staff to the
   * bottom of its last. A choral system is four staves, and abcjs reports a
   * position whose top/height describe only the ONE voice that event belongs
   * to - so a cursor drawn from it covers a single staff and looks wrong
   * against SATB. Measured per render, since the SVG is rebuilt each time.
   */
  let systemExtents: { top: number; bottom: number }[] = [];

  function measureSystemExtents() {
    systemExtents = [];
    const svg = document.querySelector("#paper svg");
    if (!svg) return;
    const byLine = new Map<string, { top: number; bottom: number }>();
    svg.querySelectorAll(".abcjs-staff").forEach((staff) => {
      const line = (staff.getAttribute("class") || "").match(/abcjs-l(\d+)/)?.[1];
      if (line === undefined) return;
      const box = (staff as SVGGraphicsElement).getBBox();
      const seen = byLine.get(line);
      byLine.set(line, {
        top: seen ? Math.min(seen.top, box.y) : box.y,
        bottom: seen ? Math.max(seen.bottom, box.y + box.height) : box.y + box.height,
      });
    });
    systemExtents = [...byLine.values()].sort((a, b) => a.top - b.top);
  }

  /**
   * The system a reported position belongs to, so the cursor spans its staves.
   *
   * Matched by overlap rather than containment: abcjs reports a band that
   * starts above the top staff line - it leaves room for stems and ledgers -
   * so testing whether its top sits inside a staff never matched, and every
   * position fell through to the raw values.
   */
  function systemExtentFor(top: number, height: number) {
    // Measured on first use rather than straight after render: responsive
    // resizing is still settling at that point.
    if (systemExtents.length === 0) measureSystemExtents();
    const bottom = top + height;
    let best: { top: number; bottom: number } | null = null;
    let bestOverlap = 0;
    for (const e of systemExtents) {
      const overlap = Math.min(bottom, e.bottom) - Math.max(top, e.top);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = e;
      }
    }
    return best ?? { top, bottom };
  }

  function hidePlaybackCursor() {
    if (!playbackCursor) return;
    ["x1", "y1", "x2", "y2"].forEach((a) =>
      playbackCursor!.setAttribute(a, "0")
    );
  }

  /** Places the cursor at an x, spanning the whole system it falls in. */
  function movePlaybackCursor(left: number, top: number, height: number) {
    if (!playbackCursor) return;
    const span = systemExtentFor(top, height);
    const overhang = (span.bottom - span.top) * 0.04;
    const x = Math.max(0, left - 2);
    playbackCursor.setAttribute("x1", String(x));
    playbackCursor.setAttribute("x2", String(x));
    playbackCursor.setAttribute("y1", String(span.top - overhang));
    playbackCursor.setAttribute("y2", String(span.bottom + overhang));
  }

  /**
   * Puts the cursor back on the first note and scrolls the score up to meet it.
   *
   * abcjs only moves the cursor from its playback callbacks, and those do not
   * fire while paused - so rewinding the audio left the cursor sitting wherever
   * it stopped, which reads as it being stuck. Nothing was broken underneath;
   * it just was not told.
   */
  function parkCursorAtStart() {
    if (!playbackCursor || cursorMode === "off") return;
    const firstNote = document.querySelector<SVGGraphicsElement>(
      "#paper svg .abcjs-note"
    );
    if (!firstNote) {
      hidePlaybackCursor();
      return;
    }
    const box = firstNote.getBBox();
    movePlaybackCursor(box.x, box.y, box.height);
    document
      .querySelector("#paper")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Clearing it the moment the setting changes, rather than waiting for the
  // next callback to leave it frozen mid-staff.
  $: if (cursorMode === "off" && playbackCursor) hidePlaybackCursor();

  /** The meter of the tune being played, set as the synth is built: the count-in follows it. */
  // The count-in word goes when playback stops, pauses or ends.
  $: if (!isPlaying) hideCountIn();

  let playedMeter = "4/4";

  function buildAudioParams() {
    // From the store as it is now, not the reactive copies: Play changes the
    // store and builds in the same breath, before those catch up.
    const t = tuner.get();
    builtClick = clickKeyFor(t);
    return {
      ...(clickOnFor(t) && drumFor(selectedTimeSignature) ? { drum: drumFor(selectedTimeSignature), drumBars: 1 } : {}),
      // The count-in: two bars in 2/4, so "1, 2, Ready, Go" fits (count-in.ts).
      drumIntro: countInMeasures(playedMeter),
      // Samples come through our own origin: abcjs otherwise fetches them from
      // paulrosen.github.io, which locked-down networks block, and a blocked
      // fetch yields a silent buffer rather than an error - playback looks fine
      // and only the drum track is audible. See src/pages/api/soundfont/.
      soundFontUrl: "/api/soundfont/",
      // abcjs picks the volume multiplier from the URL, and only recognises its
      // own CDN addresses - any other URL silently drops to 1.0. The proxy
      // serves those exact FluidR3_GM samples, so restate the 3.0 it would have
      // chosen; without this the fix would land as a 3x drop in volume.
      soundFontVolumeMultiplier: 3.0,
      // No midiTranspose: it never reached the tenor. The transposition is
      // written into the score playback reads - see initSynth.
    };
  }

  // ── URL persistence ────────────────────────────────────────────────────────
  function loadParams() {
    const p = new URLSearchParams(window.location.search);
    // Written as "voicing" but, for a long time, read back as "voices" - so a
    // shared link always opened in four parts. Links carrying either still work.
    selectedVoicing = knownVoicing(p.get("voicing") ?? p.get("voices"));
    hiddenVoices = new Set((p.get("hide") ?? "").split(",").map((v) => v.trim()).filter(Boolean));
    const keyParam = p.get("key") || "C";
    const keyList = keyParam.split(",").map((k) => k.trim()).filter(Boolean);
    selectedKeys = new Set(keyList.length ? keyList : ["C"]);
    selectedKey = keyList[0] ?? "C";
    // Written since the start and never read back, so every shared link opened
    // in 4/4 whatever it had been made in.
    const timeSig = p.get("timeSig");
    if (timeSig && timeSig in timeSignatures) selectedTimeSignature = timeSig;
    // Only values the controls can produce: parseInt alone let "abc" through as
    // NaN, which then reached the generator.
    const linkedMeasures = parseInt(p.get("measures") ?? "", 10);
    if (measureOptions.includes(linkedMeasures)) measures = linkedMeasures;
    const linkedBpm = parseInt(p.get("bpm") ?? "", 10);
    if (linkedBpm >= 40 && linkedBpm <= 200) bpm = linkedBpm;
    const cursor = p.get("cursor");
    if (isCursorMode(cursor)) cursorMode = cursor;
    const instrument = p.get("sound");
    if (isInstrumentProgram(instrument)) instrumentProgram = Number(instrument);
    // A shared link carries the annotation state - the whole point of the clean
    // copy is being able to send it.
    // "1" was movable-do solfège, before there was a choice; a shared link
    // written then still opens showing what it showed.
    minorSolfege = minorSolfegeFrom(p.get("minorSolfege"));
    const lyrics = p.get("solfege");
    lyricSystem =
      lyrics === "1" || lyrics === "movable"
        ? "movable"
        : lyrics === "fixed" || lyrics === "names"
          ? lyrics
          : null;
    // On only when the link says so. `!== "0"` turned them on for every visit
    // with no `chords` at all - which is every link into this page - and so
    // overrode the off default above. Shared links always carry 0 or 1.
    showChords = p.get("chords") === "1";
    transposeSemitones = clampTranspose(Number(p.get("transpose") ?? 0));
    const texture = p.get("texture");
    if (isVoiceTextureMode(texture)) voiceTexture = texture;
    const bias = p.get("bias");
    if (bias) {
      const parsed: Record<string, number> = {};
      for (const pair of bias.split(",")) {
        const [name, raw] = pair.split(":");
        const value = Number(raw);
        if (name && Number.isFinite(value) && value > 0) parsed[name] = value;
      }
      rhythmBias = parsed;
    }
    // The Beginner/Intermediate/Advanced presets gave way to the ladder. A
    // link still carrying one opens the step nearest what it used to set.
    const retired: Record<string, string> = {
      Beginner: "parts-two-rhythms", Intermediate: "parts-v7", Advanced: "parts-four",
    };
    const step = ladderById[retired[p.get("preset") ?? ""] ?? ""];
    if (step) applyLadderStep(step);
  }

  function updateURLParams() {
    const p = new URLSearchParams();
    p.set("key", [...selectedKeys].join(","));
    p.set("timeSig", selectedTimeSignature);
    p.set("voicing", selectedVoicing);
    p.set("measures", measures.toString());
    p.set("bpm", bpm.toString());
    p.set("cursor", cursorMode);
    // An open assignment stays in the address, so a reload keeps it.
    if (assignmentId) p.set(ASSIGNMENT_PARAM, assignmentId);
    p.set("sound", String(instrumentProgram));
    p.set("solfege", lyricSystem ?? "0");
    if (minorSolfege === "do") p.set("minorSolfege", "do");
    p.set("chords", showChords ? "1" : "0");
    p.set("transpose", String(transposeSemitones));
    p.set("texture", voiceTexture);
    if (hiddenVoices.size) p.set("hide", [...hiddenVoices].join(","));
    const biasPairs = Object.entries(rhythmBias);
    if (biasPairs.length) {
      p.set("bias", biasPairs.map(([n, v]) => `${n}:${v}`).join(","));
    } else {
      p.delete("bias");
    }
    // The exercise hash rides along: every settings change rewrites the URL,
    // and dropping it would lose the linked exercise on the next reload.
    window.history.replaceState({}, "", `?${p.toString()}${exerciseHash}`);
  }

  /** A link to the exercise on screen, with the settings it is shown in. */
  const exerciseLinkFor = (packed: string) => () => settingsLink() + exerciseFragment(packed);
  $: exerciseLink = exercisePacked === null ? null : exerciseLinkFor(exercisePacked);

  /**
   * Show the exercise a link carries, without generating anything.
   *
   * The settings in the link have already loaded; this puts the panel's key,
   * meter and voicing to what the exercise actually is, so the print title and
   * the metronome agree with the score, then draws it the way a history step
   * does.
   */
  async function openLinkedExercise(value: string) {
    if (isGenerating) return;
    linkError = null;
    generationError = null;
    // The generating state is what un-hides #paper, and renderTune measures its
    // width - drawn into a hidden element the score comes out 160px wide.
    generatingStage = "drawing";
    isGenerating = true;
    await tick();
    await painted();
    try {
      const opened = await unpackExercise(value, "choral");
      if (!opened.ok) {
        if (opened.problem === "wrong-page" && opened.kind) {
          window.location.replace(PAGE_FOR[opened.kind] + exerciseFragment(value));
          return;
        }
        linkError = linkProblemMessage(opened.problem);
        exerciseHash = "";
        updateURLParams();
        return;
      }
      if (opened.exercise.kind !== "choral") return;
      const source = opened.exercise.result;
      const summary = choralSummary(source);
      if (isPlaying) pausePlayback();

      selectedKey = summary.key;
      if (summary.meter in timeSignatures) selectedTimeSignature = summary.meter;
      const voicing = Object.entries(possibleVoicing).find(
        ([, v]) => Object.keys(v.parts).join("|") === summary.voiceNames.join("|")
      )?.[0];
      if (voicing) selectedVoicing = voicing;

      const render = rendererFor({ abc: "", chordProgression: [], roughSeams: [], ...source });
      renderCurrent = render;
      useExerciseVoices(summary.voiceNames);
      generatedBpm = summary.tempo;
      if (!new URLSearchParams(window.location.search).has("bpm")) bpm = summary.tempo;
      roughSeams = [];
      chordProgression = [];
      exerciseHash = exerciseFragment(value);
      useExerciseSource(source);
      pushHistory({
        render,
        chordProgression: [],
        bpm: generatedBpm,
        label: `Shared · ${summary.key} ${isMinorKey(summary.key) ? "minor" : "major"} · ${summary.meter} · ${voicing ?? summary.voiceNames.join(", ")}`,
        voiceNames: summary.voiceNames,
        source,
        linkHash: exerciseHash,
      });
      renderedString = render(displayOptions());
      await applyRenderedString();
      updateURLParams();
    } finally {
      isGenerating = false;
    }
  }

  /** A link pasted over this one changes only the hash, which reloads nothing. */
  function onHashChange() {
    const value = exerciseParam(window.location.hash);
    if (value && exerciseFragment(value) !== exerciseHash) openLinkedExercise(value);
  }

  // ── Assignment ─────────────────────────────────────────────────────────────
  // Read at start: the URL sync rewrites the address from the page's state.
  const assignmentId = assignmentIdFromUrl();
  let assignment: OpenAssignment | null = null;

  /** Opens an assignment: its preset applied, the settings locked while it is open. */
  async function openAssignment(id: string) {
    const a = await fetchAssignment(id, "choral");
    if (!a) return;
    const [kind, rest] = [a.presetKey.slice(0, a.presetKey.indexOf(":")), a.presetKey.slice(a.presetKey.indexOf(":") + 1)];
    if (kind === "step" && ladderById[rest]) applyLadderStep(ladderById[rest]);
    else if (kind === "uil" && uilPresets[rest]) applyLevel(uilPresets[rest]);
    else if (kind === "saved" && a.params) applySavedPreset(a.params as SavedPreset);
    assignment = a;
    updateURLParams();
  }

  onMount(() => {
    // Astro 4 leaves a `client:only` fallback in the DOM after the island
    // hydrates - it is not swapped out - so the skeleton would sit on top of the
    // real UI forever. Take it down as soon as there is something to replace it.
    document.querySelectorAll("[data-skeleton]").forEach((el) => el.remove());
    // A first visit - nothing in the address - opens at UIL Level 3 in F major:
    // four parts at a middle level reads as what the page is for, where the old
    // C major quarters-and-halves looked like a demo. Links, steps and
    // assignments bring their own settings and skip this.
    const arrivedBare = !window.location.search && !exerciseParam(window.location.hash);
    // A link to a ladder step, from the other page's picker or a class's plan.
    const linkedStep = ladderById[new URLSearchParams(window.location.search).get(STEP_PARAM) ?? ""];
    // A UIL level by name, from a class's checklist (class-course.ts uilHref).
    const linkedUIL = (() => {
      const k = new URLSearchParams(window.location.search).get("uil");
      return k && Object.hasOwn(uilPresets, k) ? k : null;
    })();
    const linked = exerciseParam(window.location.hash);
    // On a reload, the preset the settings came from (active-preset.ts). Not
    // over a step, an assignment or an exercise the address brings.
    // A saved preset chosen on the Unison page's picker (preset-link.ts).
    const presetId = linkedStep || linkedUIL || assignmentId || linked ? null : linkedPresetId();
    const remembered = linkedStep || linkedUIL || assignmentId || linked || presetId ? null : activePresetToRestore("choral");
    loadParams();
    if (remembered) {
      restoreActivePreset(remembered, !arrivedBare);
    } else if (arrivedBare) {
      applyUILPreset("UIL 3");
      selectedKeys = new Set(["F"]);
      selectedKey = "F";
    }
    if (linkedStep) applyLadderStep(linkedStep);
    else if (linkedUIL) applyUILPreset(linkedUIL);
    if (presetId) void openLinkedPreset<PresetParams>("choral", presetId, (p) => applySavedPreset(p));
    // Practice time, for a student in a class; and an assignment, if the address names one.
    startPractice({ page: "choral", assignmentId, isBusy: () => isPlaying });
    if (assignmentId) openAssignment(assignmentId);
    loadMixLevels();
    if (linked) openLinkedExercise(linked);
    presetMemoryReady = true;
    window.addEventListener("hashchange", onHashChange);
  });

  /** The saved preset the settings came from, whole, for remembering it. */
  let activeSavedPreset: SavedPreset | null = null;
  let presetMemoryReady = false;
  $: if (presetMemoryReady) {
    rememberActivePreset(
      "choral",
      activePresetLabel
        ? {
            label: activePresetLabel,
            stepId: activeStepId,
            level: !activeStepId && !activeSavedId && activeLevel ? `UIL ${activeLevel.level}` : null,
            saved: activeSavedId ? activeSavedPreset : null,
            sig: { paramSig: _presetParamSig, tabSigs: _presetTabSigs },
          }
        : null
    );
  }

  /**
   * Put back the preset a reload came from. This page's address carries only
   * some settings (key, voicing, tempo, display), so the preset is applied
   * again for the rest, then what the address says goes on top: the page ends
   * as the reader left it, and "edited" and the tab dots measure it against
   * what the preset held.
   */
  function restoreActivePreset(rec: import("../lib/active-preset").ActivePresetRecord, addressOnTop: boolean) {
    const step = rec.stepId ? ladderById[rec.stepId] : undefined;
    if (step?.choral) applyLadderStep(step);
    else if (rec.level && uilPresets[rec.level]) applyUILPreset(rec.level);
    else if (rec.saved) applySavedPreset(rec.saved as SavedPreset);
    else return;
    if (addressOnTop) loadParams();
    activePresetLabel = rec.label;
    // After the apply's own snapshot (a setTimeout of its own), so this wins.
    const sig = rec.sig as { paramSig?: string; tabSigs?: Record<string, string> } | null;
    setTimeout(() => {
      _presetParamSig = sig?.paramSig ?? _currentParamSig;
      _presetTabSigs = sig?.tabSigs ?? _tabSigs;
    }, 0);
  }

  onDestroy(() => {
    try { synthControl?.destroy?.(); } catch {}
    if (typeof window !== "undefined") window.removeEventListener("hashchange", onHashChange);
  });

  // ── Preset application ─────────────────────────────────────────────────────
  // What the active UIL level allows, or null when no level is active. Used to
  // dim options rather than remove them - the point of the change is that
  // nothing disappears, so a reader can still see the whole vocabulary and step
  // outside the level deliberately.
  $: activePreset = activeLevel;
  /** "UIL 3", for the helpers keyed by level name. */
  $: activeLevelKey = activeLevel ? `UIL ${activeLevel.level}` : undefined;

  /** The level number behind the active preset, or null when none is chosen. */
  $: fullLengthLevel = activePreset ? activePreset.level : null;

  /** The length range the level requires in the meter chosen. */
  $: fullLengthRange = fullLengthLevel
    ? requiredMeasures(fullLengthLevel, selectedTimeSignature)
    : null;

  // Re-plan whenever anything the plan depends on moves. The plan is cheap and
  // pure, so this is simpler than keeping it in step by hand.
  $: {
    if (!fullLength || !fullLengthLevel || !fullLengthRange) {
      formPlan = null;
      formPlanError = null;
    } else {
      const [lo, hi] = fullLengthRange;
      // The longer version unless another length is picked (Blaine: Level 5's
      // 6A, and the long end of "approximately 24" at Levels 1-2).
      const want = Math.min(hi, Math.max(lo, fullLengthMeasures || hi));
      try {
        formPlan = planForm({
          level: fullLengthLevel,
          meter: selectedTimeSignature,
          measures: want,
          // A full-length example is in major. The key is drawn at Generate
          // from the level's majors, so the plan here just needs a valid one.
          key: majorKeysFor(fullLengthLevel).includes(selectedKey)
            ? selectedKey
            : undefined,
        });
        formPlanError = null;
      } catch (err) {
        formPlan = null;
        formPlanError = err instanceof Error ? err.message : String(err);
      }
    }
  }
  $: presetKeys = activePreset ? new Set(activePreset.allowedKeys) : null;
  $: presetVoicings = activePreset?.allowedVoicings?.length
    ? new Set(activePreset.allowedVoicings)
    : null;
  $: presetRhythmNames = activePreset ? new Set(activePreset.allowedRhythmNames) : null;
  /** Meters outside the active level, dimmed rather than removed. */
  $: presetMeterNames = activePreset ? new Set(activePreset.allowedMeters) : null;

  /** Levels 1 and 2 are homophonic only - see notes/uil-criteria.md. */
  $: polyphonyAllowed = activePreset
    ? (POLYPHONY_CEILING[activePreset.level] ?? 0) > 0
    : true;
  $: presetChordNames = activePreset ? new Set(activePreset.allowedChordNames) : null;
  /** Dimmed-but-clickable: outside the level, not forbidden. */
  const outside = (allowed: Set<string> | null, name: string) =>
    allowed !== null && !allowed.has(name);

  // A rhythm can be ticked and still never appear - too short to take its own
  // chord, or longer than a measure. Previously the generator just dropped it.
  $: unusableRhythmNames = new Set(
    selectedRhythms
      .filter(
        (r) =>
          !canAppearInChoral(
            r,
            timeSignatures[selectedTimeSignature]?.tsPerMeasure ?? 32
          )
      )
      .map((r) => r.name)
  );

  /**
   * In the level's vocabulary, but not ticked when the level is chosen.
   *
   * Same posture as the rests just above: the level ALLOWS it, so it stays in
   * the picker to be switched on, but it is not what the exercise should be
   * built from by default. Four sixteenths in a row is only reachable at level
   * 5, and having it ticked meant every level 5 exercise came out at the
   * fastest thing the level permits rather than around the middle of it.
   */
  const OFFERED_NOT_SELECTED = new Set(["fourSixteenths"]);

  /**
   * Majors and minors are shown as separate rows.
   *
   * They are different decisions - a level that allows minor at all allows a
   * particular set of them - and mixed into one wrapping block the modes ran
   * together at whatever width the panel happened to be.
   */
  function keysInMode(minor: boolean) {
    return possibleKeys.filter((k) => isMinorKey(k) === minor);
  }

  function selectAllKeys(minor: boolean) {
    const next = new Set(selectedKeys);
    for (const k of keysInMode(minor)) next.add(k);
    selectedKeys = next;
  }

  /**
   * Clears the row even if that empties the pool. Refusing instead made None
   * look broken in the ordinary case - major keys chosen, minor row empty -
   * so an empty pool is allowed and Generate says so, as it does for rhythms.
   * `selectedKey` stays put while empty: it only picks which chord list shows.
   */
  function clearKeys(minor: boolean) {
    const next = new Set(selectedKeys);
    for (const k of keysInMode(minor)) next.delete(k);
    selectedKeys = next;
    if (next.size > 0 && !next.has(selectedKey)) selectedKey = [...next][0];
  }

  /** The select hands back a string; the synth wants the program number. */
  /**
   * The settings row: one pill per setting, each showing what is chosen, and
   * one popover open at a time under it (settingPop). The score's toolbar
   * opens Display (the score options) the same way (toolPop). A tap outside,
   * Escape, Done or New exercise closes them.
   */
  type SettingPop = "voicing" | "key" | "meter" | "length" | "rhythm" | "harmony" | "more";
  let settingPop: SettingPop | null = null;
  let toolPop: "display" | null = null;
  let popLeft = 0;
  $: if (typeof document !== "undefined") document.documentElement.classList.toggle("sr-pop-open", !!(settingPop || toolPop));
  let setbarInView = false;
  let setbarEl: HTMLElement;
  let toolsEl: HTMLElement;
  const POP_WIDTH = 420;
  /** The button that opened the popover, for focus to return to. */
  let popOpener: HTMLElement | null = null;
  /**
   * The boxes ease in and out: down from their pill, or up from the bottom
   * as a sheet on a phone. Nothing moves for anyone who asks for less motion.
   */
  const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const asSheet = () => typeof matchMedia !== "undefined" && matchMedia("(max-width: 640px)").matches;
  const popIn = (node: Element) => fly(node, { y: asSheet() ? 40 : -8, duration: reduceMotion ? 0 : 170, easing: cubicOut });
  const popOut = (node: Element) => fly(node, { y: asSheet() ? 40 : -8, duration: reduceMotion ? 0 : 110 });
  function closePops(returnFocus = true) {
    const opener = popOpener;
    settingPop = null;
    toolPop = null;
    popOpener = null;
    if (returnFocus) opener?.focus({ preventScroll: true });
  }
  /** Focus moves into a popover as it opens: its chosen chip, else its first control. */
  async function focusPop() {
    await tick();
    const pop = document.querySelector<HTMLElement>(".set-pop");
    const target = pop?.querySelector<HTMLElement>(".sr-on, [aria-pressed='true']") ?? pop?.querySelector<HTMLElement>("button, input, select");
    target?.focus({ preventScroll: true });
  }
  function togglePop(which: SettingPop, e: MouseEvent) {
    toolPop = null;
    if (settingPop === which) return (settingPop = null);
    const pill = e.currentTarget as HTMLElement;
    const room = setbarEl?.clientWidth ?? POP_WIDTH;
    popLeft = Math.max(0, Math.min(pill.offsetLeft, room - POP_WIDTH));
    settingPop = which;
    popOpener = pill;
    void focusPop();
  }
  function toggleTool(which: "display") {
    settingPop = null;
    toolPop = toolPop === which ? null : which;
    popOpener = toolPop ? (document.activeElement as HTMLElement | null) : null;
    if (toolPop) void focusPop();
  }
  onMount(() => {
    // Checked on pointerdown, before a chip's click redraws the popover.
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (settingPop && setbarEl && !setbarEl.contains(t)) { settingPop = null; popOpener = null; }
      if (toolPop && toolsEl && !toolsEl.contains(t)) { toolPop = null; popOpener = null; }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (settingPop || toolPop)) closePops();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
    // While the settings row (and its New exercise) is on screen, the bar's
    // Generate steps aside; it comes back once the row scrolls away.
    // On screen means most of it: a sliver at the top edge is not a button to press.
    const seen = new IntersectionObserver(([e]) => (setbarInView = e.intersectionRatio >= 0.6), { threshold: [0, 0.6, 1] });
    if (setbarEl) seen.observe(setbarEl);
    return () => {
      seen.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", esc);
    };
  });
  const keyName = (k: string) => (isMinorKey(k) ? `${k.replace(/m$/, "")} minor` : `${k} major`);
  /**
   * What each pill holds, as one string, and those strings as they were when
   * the preset was chosen: a pill with a dot has been changed since. No preset,
   * no dots (there is nothing to have changed from).
   */
  $: pillSigs = {
    voicing: selectedVoicing,
    key: [...selectedKeys].sort().join(","),
    meter: selectedTimeSignature,
    length: JSON.stringify([measures, fullLength, fullLengthMeasures]),
    rhythm: _tabSigs.rhythm,
    harmony: _tabSigs.harmony,
    more: JSON.stringify([voiceTexture, _tabSigs.ranges]),
  };
  let presetPillSigs: Record<string, string> | null = null;
  let pillsFor: Record<string, string> | null = null;
  $: if (_presetTabSigs !== pillsFor) {
    pillsFor = _presetTabSigs;
    presetPillSigs = _presetTabSigs ? { ...pillSigs } : null;
  }
  $: pillChanged = Object.fromEntries(
    Object.entries(pillSigs).map(([k, v]) => [k, !!activePresetLabel && !!presetPillSigs && presetPillSigs[k] !== v]),
  ) as Record<keyof typeof pillSigs, boolean>;
  $: pillText = {
    voicing: selectedVoicing,
    key: selectedKeys.size === 1 ? keyName([...selectedKeys][0]) : `${selectedKeys.size} keys`,
    meter: selectedTimeSignature,
    length: fullLength ? "Full length" : `${measures} bars`,
    rhythm: `${selectedRhythms.length} ${selectedRhythms.length === 1 ? "rhythm" : "rhythms"}`,
    harmony: (() => {
      // The chords the Harmony box shows switched on (inversions ride along unseen).
      const on = (Object.values(chordGroups) as string[][]).flat().filter((c) => userAllowedChords.has(c)).length;
      return `${on} ${on === 1 ? "chord" : "chords"}`;
    })(),
  };
  function onInstrumentSelect(event: Event) {
    const el = event.currentTarget as HTMLSelectElement;
    handleInstrumentChange(Number(el.value));
  }

  function applyUILPreset(levelKey: string) {
    const p = uilPresets[levelKey];
    if (!p) return;
    applyLevel(p);
    activePresetLabel = p.label;
    activeStepId = null;
    revertPreset = () => applyUILPreset(levelKey);
  }

  /**
   * A ladder step. A step for the Unison page is opened there: its settings are
   * a single line's, and this page has no way to write one.
   */
  function applyLadderStep(step: LadderStep) {
    if (!step.choral) {
      window.location.href = stepHref(step);
      return;
    }
    applyLevel({ ...step.choral, label: stepLabel(step), measureRange: [8, 16] }, step.choral);
    activePresetLabel = stepLabel(step);
    activeStepId = step.id;
    revertPreset = () => applyLadderStep(step);
  }

  /**
   * The voicing to move to when the current one is outside a level: the same
   * kind of choir if the level has one (a tenor-bass class stays tenor-bass
   * when a step goes from four parts to two), otherwise the level's first.
   */
  function nearestVoicing(allowed: string[]): string {
    const kind = ["Tenor/Bass", "Treble", "Mixed"].find((k) => selectedVoicing.includes(k));
    return (kind && allowed.find((v) => v.includes(kind))) || allowed[0];
  }

  /**
   * Put a level's settings on the page. `step` carries what a ladder step says
   * beyond a UIL level: exactly which rhythms to switch on, how long to start,
   * and a texture.
   */
  function applyLevel(p: UILPreset, step?: ChoralStepSettings) {
    activeLevel = p;
    activeSavedId = null;
    // The key list is no longer replaced. Taking the other keys away meant a
    // preset silently removed choices instead of describing them; they are all
    // still here, and the ones outside the level are dimmed instead.
    // Rests are punctuation in a sung exercise, not material. The levels list
    // them, so they stay available - just turned down.
    const restBias: Record<string, number> = {};
    for (const r of allRhythms) {
      if (r.rest && p.allowedRhythmNames.includes(r.name)) restBias[r.name] = 0.25;
    }
    rhythmBias = restBias;

    // Select every key the level allows, so generating randomises between them.
    selectedKeys = new Set(p.allowedKeys);
    if (!p.allowedKeys.includes(selectedKey)) selectedKey = p.allowedKeys[0];
    // allowedVoicings and measureRange are declared by every preset and were
    // never read, so a level that says "4-part mixed, 24-28 measures" did
    // neither. They apply now.
    if (p.allowedVoicings?.length && !p.allowedVoicings.includes(selectedVoicing)) {
      selectedVoicing = nearestVoicing(p.allowedVoicings);
    }
    // The levels name their meters and nothing read them, so picking level 2 -
    // which is 3/4 and 4/4 - left 2/4 selected and generating in it.
    if (p.allowedMeters?.length && !p.allowedMeters.includes(selectedTimeSignature)) {
      selectedTimeSignature = p.allowedMeters[0];
    }
    // Levels 1 and 2 are "homophonic only" and "homophonic with a few simple
    // parallel motion lines" - no polyphony at all. Staggered entrances left
    // selected from a higher level would have written some anyway.
    if ((POLYPHONY_CEILING[p.level] ?? 0) === 0) voiceTexture = "full";
    if (step?.voiceTexture) voiceTexture = step.voiceTexture;
    // Every preset starts at 8 measures. The levels declare 24-56, but that is
    // the length of a real UIL sight-reading example, not what you want when
    // you press Generate to drill a phrase - and the form rules that would make
    // a 24+ measure exercise hold together do not exist yet.
    measures = step?.measures ?? 8;
    // Rests are offered but not switched on. Every UIL level lists
    // wholeRest/halfRest/quarterRest, and having them all selected sprays rests
    // through the middle of phrases, where in a sung exercise they are not
    // material - they are punctuation. They stay in the picker, dimmed rather
    // than removed, for anyone who wants them.
    //
    // The one rest that matters is not lost by this: the quarter that completes
    // an interior phrase ending is structural and comes from the catalogue, not
    // from this selection. See interiorCadenceFigure in rhythm-generation.
    // A step names exactly what it switches on - sixteenths included, when
    // that is the step.
    selectedRhythms = allRhythms.filter((r) =>
      step
        ? step.selectedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest
        : p.allowedRhythmNames.includes(r.name) &&
          choralSelectable(r) &&
          !r.rest &&
          !OFFERED_NOT_SELECTED.has(r.name)
    );
    maxSkip = p.maxSkip;
    userAllowedChords = withInversions(p.allowedChordNames ?? allChordNames);
    if (p.voiceRanges) {
      for (const voicingDef of Object.values(possibleVoicing)) {
        for (const [partName, partDef] of Object.entries(voicingDef.parts)) {
          if (p.voiceRanges[partName]) {
            partDef.currentRange = [...p.voiceRanges[partName]];
          }
        }
      }
      // Reassign, or none of this reaches the page. The loop above mutates the
      // part definitions in place, and Svelte tracks assignment - so the ranges
      // were applied to generation but the Voice Ranges tab went on showing the
      // old ones, and `rangesDirty` never recomputed. applySavedPreset has
      // always done this; the UIL path never did.
      possibleVoicing = { ...possibleVoicing };
    }
    // Use setTimeout so the signature captures post-update values
    setTimeout(() => { _presetParamSig = _currentParamSig; _presetTabSigs = _tabSigs; }, 0);
  }


  // The practice tools read the exercise on the page: its key, meter, tempo
  // and each part's first note.
  $: setPracticeContext(typeof renderedString === "string" ? renderedString : null, bpm, minorSolfege);

  function applySavedPreset(preset: SavedPreset) {
    const { params: p } = preset;
    selectedKey = p.key;
    selectedKeys = new Set(p.keys?.length ? p.keys : [p.key]);
    selectedTimeSignature = p.timeSig;
    selectedVoicing = knownVoicing(p.voicing);
    measures = p.measures;
    maxSkip = p.maxSkip;
    bpm = p.bpm;
    selectedRhythms = allRhythms.filter((r) => p.selectedRhythmNames.includes(r.name));
    userAllowedChords = withInversions(p.allowedChordNames ?? allChordNames);
    nctProbability = p.nctProbability;
    if (typeof p.stepwiseEighths === 'boolean') stepwiseEighths = p.stepwiseEighths;
    // Optional, so presets saved before voice texture existed still load.
    if (isVoiceTextureMode(p.voiceTexture)) voiceTexture = p.voiceTexture;
    rhythmBias = p.rhythmBias ? { ...p.rhythmBias } : {};
    // The rest came later: a preset saved before it leaves each one as it is.
    if (typeof p.accidentalsByStep === "boolean") accidentalsByStep = p.accidentalsByStep;
    if (p.chromaticFrequency !== undefined) chromaticFrequency = numberIn(p.chromaticFrequency, 0, 5, chromaticFrequency);
    if (p.focusChord !== undefined) focusChord = typeof p.focusChord === "string" ? p.focusChord : null;
    const shown = presetDisplayFrom(p);
    const click = clickFrom(p.click);
    if (click) applyClick(click);
    const ranges = p.voiceRanges;
    if (ranges && possibleVoicing[p.voicing]) {
      for (const [partName, range] of Object.entries(ranges)) {
        const part = possibleVoicing[p.voicing].parts[partName];
        if (part) part.currentRange = range;
      }
      possibleVoicing = { ...possibleVoicing };
    }
    activePresetLabel = preset.name;
    activeLevel = null;
    activeStepId = null;
    activeSavedId = preset.id;
    activeSavedPreset = preset;
    revertPreset = () => applySavedPreset(preset);
    if (shown) void showPresetDisplay(shown);
    // Use setTimeout so the signature captures post-update values
    setTimeout(() => { _presetParamSig = _currentParamSig; _presetTabSigs = _tabSigs; }, 0);
  }

  function getCurrentParams(): PresetParams {
    return {
      key: selectedKey,
      keys: [...selectedKeys],
      timeSig: selectedTimeSignature,
      voicing: selectedVoicing,
      measures,
      maxSkip,
      bpm,
      selectedRhythmNames: selectedRhythms.map((r) => r.name),
      allowedChordNames: userAllowedChords.size < allChordNames.length ? Array.from(userAllowedChords) : undefined,
      nctProbability,
      stepwiseEighths,
      voiceTexture,
      rhythmBias,
      voiceRanges: Object.fromEntries(
        Object.entries(possibleVoicing[selectedVoicing]?.parts ?? {}).map(
          ([name, part]) => [name, part.currentRange as [number, number]]
        )
      ),
      accidentalsByStep,
      chromaticFrequency,
      focusChord,
      lyricSystem,
      minorSolfege,
      showChords,
      cursorMode,
      instrumentProgram,
      transposeSemitones,
      hiddenVoices: [...hiddenVoices],
      mutedVoices: [...mutedVoices],
      playbackVolume,
      click: currentClick(),
    };
  }

  /**
   * A preset's display and playback settings, or null when it was saved before
   * they were kept - it then leaves them as they are.
   */
  function presetDisplayFrom(p: PresetParams) {
    if (p.lyricSystem === undefined && p.instrumentProgram === undefined) return null;
    const lyrics = p.lyricSystem;
    return {
      lyricSystem: lyrics === "movable" || lyrics === "fixed" || lyrics === "names" ? lyrics : null,
      minorSolfege: minorSolfegeFrom(p.minorSolfege),
      showChords: p.showChords === true,
      cursorMode: isCursorMode(p.cursorMode) ? p.cursorMode : cursorMode,
      instrumentProgram: isInstrumentProgram(p.instrumentProgram) ? Number(p.instrumentProgram) : instrumentProgram,
      transposeSemitones: clampTranspose(Number(p.transposeSemitones ?? 0)),
      hiddenVoices: new Set(Array.isArray(p.hiddenVoices) ? p.hiddenVoices.map(String) : []),
      mutedVoices: new Set(Array.isArray(p.mutedVoices) ? p.mutedVoices.map(String) : []),
      playbackVolume: numberIn(p.playbackVolume, 0, 1, playbackVolume),
      // Presets from before the metronome was one kept its level here, on
      // this page's 0-1.5 scale; the store's 0.5 is this page's 1.
      metronomeVolume: p.metronomeVolume === undefined || clickFrom(p.click)?.volume !== undefined
        ? null
        : numberIn(p.metronomeVolume / 2, 0, 1, 0.5),
    };
  }

  /** Put them on the page, and re-write the exercise on screen to match. */
  async function showPresetDisplay(d: NonNullable<ReturnType<typeof presetDisplayFrom>>) {
    lyricSystem = d.lyricSystem;
    minorSolfege = d.minorSolfege;
    showChords = d.showChords;
    cursorMode = d.cursorMode;
    instrumentProgram = d.instrumentProgram;
    transposeSemitones = d.transposeSemitones;
    hiddenVoices = d.hiddenVoices;
    mutedVoices = d.mutedVoices;
    playbackVolume = d.playbackVolume;
    if (d.metronomeVolume !== null) tuner.setMetronomeVolume(d.metronomeVolume);
    try {
      localStorage.setItem(MIX_STORAGE_KEY, JSON.stringify({ playback: playbackVolume }));
    } catch {}
    if (isPlaying) pausePlayback();
    // Re-drawing rebuilds the synth too, which is where the instrument,
    // transposition, mutes and levels are baked in.
    await reRenderAnnotations();
  }

  // ── Range change ───────────────────────────────────────────────────────────
  function handleRangeChange(partName: string, newRange: { min: number; max: number }) {
    const part = possibleVoicing[selectedVoicing]?.parts[partName];
    if (part) {
      part.currentRange = [newRange.min, newRange.max];
      possibleVoicing = { ...possibleVoicing };
      // Ranges are part of _currentParamSig now, so the edited flag follows on
      // its own - and does not append "(modified)" again on the next drag.
    }
  }

  /** One part back to its preset's range, or the default without a preset. */
  function resetRange(partName: string) {
    const target = rangeTargets[partName];
    if (target) handleRangeChange(partName, { min: target[0], max: target[1] });
  }

  // ── Playback controls ──────────────────────────────────────────────────────
  /** Shown under the transport when the browser is holding audio back. */
  let audioNotice = "";

  /**
   * Make sure the AudioContext is actually running before asking for sound.
   *
   * iOS suspends the context whenever the phone locks or the tab goes to the
   * background, and nothing brings it back on its own. Everything else keeps
   * working - the transport responds, the cursor moves - and there is simply no
   * sound, until the page is reloaded. That is exactly how this was reported:
   * playback stopped mid-session, on a phone.
   *
   * The resume has to happen inside the user's gesture, which is why it lives on
   * Play rather than on a visibilitychange listener.
   *
   * `resume()` never settles while the browser is still withholding autoplay
   * permission, so awaiting it bare leaves Play looking dead - the same trap
   * initAudio hit in AbcjsSingle. Race it against a timeout and say what
   * happened instead.
   */
  async function ensureAudioRunning(): Promise<boolean> {
    try {
      const mod = await import("abcjs");
      // Null until abcjs has built one; then there is nothing to resume.
      const ctx = mod.synth.activeAudioContext?.();
      if (!ctx || ctx.state === "running") {
        audioNotice = "";
        return true;
      }
      await Promise.race([
        ctx.resume(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (ctx.state === "running") {
        audioNotice = "";
        return true;
      }
      audioNotice =
        "Your browser is holding audio back. Tap anywhere on the page, then press Play again.";
      return false;
    } catch {
      // Never let this check be the reason playback does not happen.
      return true;
    }
  }

  /**
   * True from a Play press until the sound starts. The first play fetches the
   * instrument samples, and a rebuild (muting, a new sound) fetches again; on a
   * slow connection that is seconds of a Play button that seems to do nothing.
   */
  let isPreparing = false;

  async function handlePlay() {
    if (!synthControl || isPreparing) return;
    isPreparing = true;
    try {
      if (!(await ensureAudioRunning())) return;
      // A rebuild started by muting or the mix slider is not awaited where it
      // starts; playing before it finishes would start a half-built synth.
      // Capped, so a build that never settles cannot hold Play forever.
      if (synthBuild) {
        await Promise.race([
          synthBuild.catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 15000)),
        ]);
      }
      // A metronome ticking on its own becomes this playback's click, from beat 1
      // of the count-in (metronome-link). If the synth was built without the
      // click, it is built again with it first.
      const click = exercisePlays(true);
      if (renderedTune && builtClick.split("|")[0] !== String(click)) await initSynth(renderedTune);
      if (!synthControl) return;
      await synthControl.play();
      isPlaying = true;
    } finally {
      isPreparing = false;
    }
  }

  /**
   * Pause, and leave the controller able to start again.
   *
   * abcjs's play() is a TOGGLE - `isStarted = !isStarted` - while its pause()
   * never touches isStarted. So pausing through pause() alone leaves isStarted
   * true, and the next Play flips it to false and calls pause() again: the first
   * press after a Stop does nothing at all, and only a second press plays. That
   * is the "sound stops when I stop the exercise and start over" report, and it
   * applied to every one of our pause calls - the transport, Stop, muting a
   * voice, and changing the playback sound.
   *
   * Playing to the end was never affected: abcjs's own finished() resets
   * isStarted, which is why this only ever showed up after stopping by hand.
   *
   * Setting isStarted directly is abcjs's own pattern - setWarp does exactly
   * this before restarting.
   */
  function pausePlayback() {
    if (!synthControl) return;
    synthControl.pause();
    synthControl.isStarted = false;
    isPlaying = false;
  }

  async function handlePause() {
    pausePlayback();
  }

  /**
   * Rewind to the top: stop the audio, and put the cursor back with it.
   *
   * Both Stop and Back-to-start used to do only the audio half. abcjs moves the
   * cursor from its playback callbacks and those do not fire while paused, so
   * the cursor stayed wherever it had stopped - the score was cued to the
   * beginning while the marker sat in the middle of a line, which reads as the
   * cursor being stuck.
   */
  function rewindToStart() {
    if (!synthControl) return;
    pausePlayback();
    synthControl.seek(0);
    // Beat mode steps only when the beat number changes, and this still held
    // the beat we paused on - so after rewinding it would sit out the first
    // beat of the replay before catching up.
    cursorBeats = newMetronomeBeatState();
    parkCursorAtStart();
  }

  async function handleStop() {
    rewindToStart();
  }

  /** Back-to-start cues the top and leaves it there; Play starts playback. */
  function handleRestart() {
    rewindToStart();
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

  // The metronome's tempo is this page's (metronome-link): a change made on it
  // lands here as if made with the tempo buttons.
  onMount(() => linkPageTempo({ min: 40, max: 200, setBpm: handleBpmChange }));

  // Stop, pause or the last note: the click stops with the music.
  let playedBefore = false;
  $: {
    if (playedBefore && !isPlaying) exercisePlays(false);
    playedBefore = isPlaying;
  }
  onDestroy(() => exercisePlays(false));

  /**
   * Change the playback voice without regenerating the exercise.
   *
   * abcjs takes the instrument from a `%%MIDI program` directive inside the ABC,
   * so it has to be re-parsed - but that is only a re-render and a synth
   * re-init, not a new exercise. Regenerating here would throw away the one the
   * singer is looking at, which is not what changing a sound should do.
   */
  /**
   * Draw whatever is in `renderedString` and put the transport back together.
   *
   * Every step here is load-bearing. renderTune *returns* the tune and does not
   * assign renderedTune, so the result has to be taken - dropping it re-rendered
   * the score correctly and handed the synth the previous tune, which is how
   * changing instrument once left playback on the piano. renderAbc replaces the
   * whole SVG, so the cursor has to be rebuilt and the cached system extents
   * thrown away. And the warp has to be re-applied: initSynth destroys and
   * rebuilds the SynthController, which forgets any tempo the user has dialled
   * in since generating.
   */
  async function applyRenderedString() {
    if (!renderedString) return;
    if (isPlaying) pausePlayback();
    const tune = await renderTune();
    if (!tune || tune.length === 0) return;
    tune[0].setTiming();
    renderedTune = tune[0];
    createPlaybackCursor();
    systemExtents = [];
    cursorBeats = newMetronomeBeatState();
    await initSynth(renderedTune);
    if (generatedBpm > 0 && bpm !== generatedBpm) {
      try { synthControl?.setWarp(Math.round((bpm / generatedBpm) * 100)); } catch {}
    }
  }

  /** What the assembler should print, given the display controls. */
  function displayOptions() {
    return {
      chordSymbols: showChords,
      lyrics: lyricSystem,
      minorSolfege,
      midiProgram: instrumentProgram,
      hiddenVoices: [...hiddenVoices],
    };
  }

  /** Re-write the score with the current display settings. */
  async function reRenderAnnotations() {
    updateURLParams();
    if (!renderCurrent) return;
    renderedString = renderCurrent(displayOptions());
    await applyRenderedString();
  }

  /** Clicking the one that is already on turns it off, like a radio you can clear. */
  async function handleLyricSystem(system: LyricSystem) {
    lyricSystem = lyricSystem === system ? null : system;
    await reRenderAnnotations();
  }

  async function handleToggleChords() {
    showChords = !showChords;
    await reRenderAnnotations();
  }

  // Full screen (src/lib/fullscreen.ts): the score alone, for a TV. The
  // settings are hidden there, so the annotations are chosen from the
  // playback bar: clean, chord symbols, and one of the syllable systems.
  const fullscreenCtl = createFullscreen();
  const fullscreenOn = fullscreenCtl.active;
  onDestroy(fullscreenCtl.destroy);
  $: annotationChoices = [
    { id: "chords", label: "Chord symbols", on: showChords },
    { id: "measures", label: "Measure numbers", on: scoreView.measureNumbers !== false },
    ...lyricSystems.map(([v, l]) => ({ id: v as string, label: l, on: lyricSystem === v })),
  ];
  async function pickAnnotation(id: string) {
    if (id === "clean") {
      showChords = false;
      lyricSystem = null;
      await reRenderAnnotations();
    } else if (id === "chords") await handleToggleChords();
    else if (id === "measures") changeScoreView({ measureNumbers: scoreView.measureNumbers === false });
    else await handleLyricSystem(id as LyricSystem);
  }

  /**
   * Shift playback without touching the score.
   *
   * No re-render: the notation is identical, so only the synth has to be
   * rebuilt - `setTune` bakes the transposition into the MIDI sequence when it
   * builds it, and an existing sequence cannot be shifted after the fact.
   */
  async function handleTransposeChange(next: number) {
    const clamped = clampTranspose(next);
    if (clamped === transposeSemitones) return;
    transposeSemitones = clamped;
    updateURLParams();
    if (!renderedTune) return;
    if (isPlaying) pausePlayback();
    await initSynth(renderedTune);
    if (generatedBpm > 0 && bpm !== generatedBpm) {
      try { synthControl?.setWarp(Math.round((bpm / generatedBpm) * 100)); } catch {}
    }
  }

  async function handleInstrumentChange(program: number) {
    instrumentProgram = program;
    updateURLParams();
    if (!renderedString) return;
    renderedString = withInstrument(renderedString, program);
    await applyRenderedString();
  }

  function handleToggleMute(voiceName: string) {
    const next = new Set(mutedVoices);
    if (next.has(voiceName)) next.delete(voiceName);
    else next.add(voiceName);
    mutedVoices = next;
    if (renderedTune) {
      if (isPlaying) pausePlayback();
      initSynth(renderedTune);
    }
  }

  /** The last voice on the page stays: there would be nothing to read or follow. */
  async function handleToggleHidden(voiceName: string) {
    const next = new Set(hiddenVoices);
    if (next.has(voiceName)) next.delete(voiceName);
    else if (barVoices.some((n) => n !== voiceName && !next.has(n))) next.add(voiceName);
    else return;
    hiddenVoices = next;
    await reRenderAnnotations();
  }

  function loadMixLevels() {
    try {
      const saved = JSON.parse(localStorage.getItem(MIX_STORAGE_KEY) ?? "null");
      if (typeof saved?.playback === "number") playbackVolume = saved.playback;
    } catch {}
  }

  /**
   * abcjs bakes note velocities into its buffer when the tune is primed, so a
   * new level only sounds once the synth is rebuilt. Done on release rather
   * than on every step of the drag, the same way muting a voice works.
   */
  function handleMixCommit() {
    try {
      localStorage.setItem(
        MIX_STORAGE_KEY,
        JSON.stringify({ playback: playbackVolume })
      );
    } catch {}
    if (renderedTune) {
      if (isPlaying) pausePlayback();
      initSynth(renderedTune);
    }
  }

  /** A link that opens these settings, and writes a new exercise from them. */
  function settingsLink(): string {
    updateURLParams();
    return window.location.href.split("#")[0];
  }

  function handlePrint() {
    window.print();
  }

  /** Save a file of the exercise on screen, named for its key and meter. */
  function save(type: ExportType, data: BlobPart) {
    const name = exportFileName({ page: "choral", ...keyAndMeterOf(renderedString) }, type);
    downloadFile(data, name, EXPORT_TYPES[type].mime);
  }

  /**
   * What Print / Export offers. MusicXML and ABC are the score as shown - the
   * staves on the page, the annotations that are on - at the tempo playing
   * now. MIDI is what you hear: hidden voices are still in it, muted ones are
   * not, in the chosen sound and transposition, without the count-in.
   */
  $: exports = [
    {
      id: "musicxml",
      label: "MusicXML",
      detail: "Opens in MuseScore, Finale, Sibelius, Dorico",
      disabled: !renderedTune,
      run: () => save("musicxml", abcToMusicXml(renderedString, { tempo: bpm })),
    },
    {
      id: "midi",
      label: "MIDI",
      detail: "The voices you hear, at this tempo",
      disabled: !renderedTune,
      run: () =>
        save(
          "midi",
          midiFileFor(
            renderCurrent!({
              chordSymbols: false,
              lyrics: null,
              midiProgram: instrumentProgram,
              hiddenVoices: [...mutedVoices],
            }),
            { bpm, transpose: transposeSemitones }
          )
        ),
    },
    {
      id: "abc",
      label: "ABC notation",
      detail: "The text the score is written in",
      disabled: !renderedTune,
      run: () => save("abc", abcFileFor(renderedString, bpm)),
    },
  ];

  // ── Synth init ─────────────────────────────────────────────────────────────
  /** The synth build in flight, if any - handlePlay waits for it. */
  let synthBuild: Promise<void> | null = null;

  function initSynth(tune: any): Promise<void> {
    const build = buildSynth(tune);
    synthBuild = build;
    const settle = () => {
      if (synthBuild === build) synthBuild = null;
    };
    build.then(settle, settle);
    return build;
  }

  async function buildSynth(tune: any) {
    playedMeter = meterOf(tune, selectedTimeSignature);
    const voicesOff = barVoices
      .map((name, i) => (mutedVoices.has(name) ? i : -1))
      .filter((i) => i >= 0);

    // Playback reads its own copy of the score. abcjs gets the notes to play by
    // calling the tune's setUpAudio (in CreateSynth), so point that at a parse
    // of the whole score - hidden voices included, since a hidden voice has no
    // staff on the page but is still heard - with the playback transposition
    // written into every voice (withPlaybackTranspose says why midiTranspose
    // cannot do it). The cursor follows the drawn tune's timing, untouched: the
    // two share every bar and beat. voicesOff counts the whole score's voices,
    // which is barVoices' order. Done on every build, so a copy from before a
    // transpose change never outlives it.
    if (renderCurrent) {
      let audio = withPlaybackTranspose(
        renderCurrent({ ...displayOptions(), hiddenVoices: [] }),
        transposeSemitones
      );
      // The practice assistant's silent bars and dropped beats, bar by bar
      // (practice-assistant.ts). A new draw of dropped beats each build.
      const t = tuner.get();
      if (clickOnFor(t) && assistsTheClick(t.assistant)) {
        const beats = beatsOf(selectedTimeSignature);
        const base = beatLevelsFor({ beats, accent: t.accent, beatLevels: t.beatLevels });
        const seed = Math.floor(Math.random() * 2 ** 31);
        audio = withClickByBar(audio, (bar) =>
          drumPatternFor({
            beats, subdivision: t.subdivision, accent: t.accent, sound: t.clickSound, subMask: t.subMask,
            beatLevels: assistedLevels(base, bar, t.assistant, seed),
          })
        );
      }
      const [full] = abcjs.parseOnly(audio);
      tune.setUpAudio = (params: any) => full.setUpAudio(params);
    }

    if (synthControl) {
      try { synthControl.destroy(); } catch {}
      synthControl = null;
    }

    synthControl = new abcjs.synth.SynthController();
    // The line being played, and the one already turned to ahead of it.
    let playingSystem: Element | null = null;
    let turnedTo: Element | null = null;

    const cursorControl = {
      extraMeasuresAtBeginning: countInMeasures(playedMeter),
      // Held at 16 whatever the cursor mode is. abcjs reads this once when
      // playback starts, so pinning it lets the mode be changed mid-session -
      // the callbacks read cursorMode live - without rebuilding the synth.
      beatSubdivisions: 16,
      onFinished: () => {
        isPlaying = false;
        hidePlaybackCursor();
        if (looping && synthControl) {
          synthControl.play().then(() => { isPlaying = true; });
        }
      },
      // abcjs interpolates position.left between the surrounding notes on every
      // call, which is what makes this glide rather than step.
      onBeat: (beatNumber: number, _totalBeats: number, _totalTime: number, position: any) => {
        // "1, 2, Ready, Go" over the music through the count-in.
        showCountIn(playedMeter, beatNumber);
        if (cursorMode !== "smooth" && cursorMode !== "beat") return;
        // Beat mode steps once per beat; smooth takes every callback, which is
        // where abcjs's interpolation between notes shows up.
        const stepped = crossedWholeBeat(cursorBeats, beatNumber);
        if (cursorMode === "beat" && !stepped) return;
        // position.left is undefined through the count-in.
        if (position && typeof position.left === "number") {
          movePlaybackCursor(position.left, position.top, position.height);
        }
      },
      onEvent: (event: any) => {
        if (cursorMode === "note" && event && typeof event.left === "number") {
          movePlaybackCursor(event.left, event.top, event.height);
        }
        // Follow the music a whole line at a time. A new line (the first after
        // a start or a loop, or one the early turn below missed) comes to the
        // reading position. `nearest`, used before, moved the page only as far
        // as the next note, so a new line barely showed.
        const system = systemOf(event?.elements?.[0]?.[0]);
        if (system && system !== playingSystem) {
          const first = system === document.querySelector("#paper .abcjs-staff-wrapper");
          scrollToReadingPosition(first ? document.getElementById("paper") : system);
          playingSystem = system;
          turnedTo = null;
        }
      },
      // Half a second before the line ends, bring the next line fully on
      // screen, so it is there when the eye gets to it.
      lineEndAnticipation: 500,
      // abcjs calls this whenever the next note sits at a new height, which in
      // four parts can happen within a line; so it turns only when that height
      // falls in a different line from the one playing.
      onLineEnd: (lineEvent: { top?: number }) => {
        const next = systemAt(lineEvent?.top);
        if (!next || next === playingSystem || next === turnedTo) return;
        revealNextLine(next);
        turnedTo = next;
      },
    };

    const audioParams = {
      ...buildAudioParams(),
      ...(voicesOff.length ? { voicesOff } : {}),
      // Read at render time, so a level change needs the synth rebuilt - see
      // handleMixCommit.
      sequenceCallback: (tracks: any[]) =>
        // The metronome's level is the page's one (0.5 in the store is 1 here).
        applyMixLevels(tracks, { playback: playbackVolume, metronome: tuner.get().metronomeVolume * 2 }),
    };
    await synthControl.setTune(tune, false, audioParams);
    // displayWarp builds abcjs's tempo box in the hidden #audio div. Nothing
    // shows it, but setWarp (every tempo change) writes to it, and without it
    // threw part way through: after a Stop, or mid-play before it resumed.
    await synthControl.load("#audio", cursorControl, { displayWarp: true });
  }

  // ── Main generate handler ─────────────────────────────────────────────────
  /**
   * True while an exercise is being built.
   *
   * Generation runs on the main thread, so nothing repaints while it is
   * working: setting this and calling straight into the generator would show
   * the overlay only *after* the wait it was meant to cover. The two frames
   * below give the browser a chance to paint first, and the overlay's own
   * animations are opacity and transform only, which keep running on the
   * compositor even while the main thread is blocked.
   *
   * The overlay is drawn immediately but fades in on a delay, so the ordinary
   * 8-measure exercise - about 30-120ms - finishes before anything is visible
   * and there is no flicker. A 48-measure one takes 300ms to nearly 2s, and
   * that is what this is for.
   */
  let isGenerating = false;

  /**
   * Resolves once the browser has painted - or after a short wait, whichever
   * comes first.
   *
   * The timeout is not belt-and-braces: a hidden tab stops firing
   * requestAnimationFrame altogether, so waiting on it alone deadlocks and the
   * exercise is never generated at all. Verified - with the tab backgrounded,
   * no frame arrived in 1.2s and Generate simply did nothing. Showing the
   * overlay is worth one frame of delay; it is not worth refusing to work.
   */
  const painted = () =>
    Promise.race([
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 60)),
    ]);

  /**
   * The last few exercises, so Generate is not a one-way door.
   *
   * Pressing Generate destroys what is on screen. That is usually what you
   * want and occasionally a small disaster: a director generates, glances at
   * it, generates again, and then wants the one before back - and the only way
   * to get it was to keep generating and hope, because every exercise is new.
   *
   * An entry stores the exercise's `render`, not its ABC string. Re-running it
   * with the CURRENT display options means going back shows the old exercise
   * with the annotation settings you have now, which is right: solfège and
   * chord symbols are a display preference, not part of the exercise.
   *
   * Append-only rather than browser-style, where going back and generating
   * truncates the branch ahead. Everything in here is an exercise the user
   * actually generated; silently destroying some of them to keep a tree shape
   * buys nothing when the list is this short. Oldest falls off the front.
   */
  type HistoryEntry = {
    render: (display: any) => string;
    chordProgression: Chord[];
    /** The tempo it was generated at, which is what playback warps against. */
    bpm: number;
    /** What it was: key, meter, voicing, as the panel would say it. */
    label: string;
    /** Its voices, top to bottom - see exerciseVoices. */
    voiceNames: string[];
    /** The job's plain data, which a link to it packs. */
    source: ExerciseSource;
    /** `#ex=…` for an exercise opened from a link, so going back to it restores the URL. */
    linkHash?: string;
  };
  const HISTORY_LIMIT = 10;
  let history: HistoryEntry[] = [];
  let historyIndex = -1;

  function pushHistory(entry: HistoryEntry) {
    history = [...history, entry].slice(-HISTORY_LIMIT);
    historyIndex = history.length - 1;
  }

  /**
   * Show an exercise already generated, without regenerating it.
   *
   * Everything `applyRenderedString` needs is restored first - including
   * `renderCurrent`, or the annotation toggles would go on re-writing whichever
   * exercise happened to be the newest.
   */
  async function goToHistory(index: number) {
    if (isGenerating) return;
    if (index < 0 || index >= history.length || index === historyIndex) return;
    const entry = history[index];
    historyIndex = index;
    renderCurrent = entry.render;
    useExerciseVoices(entry.voiceNames);
    useExerciseSource(entry.source);
    exerciseHash = entry.linkHash ?? "";
    renderedString = entry.render(displayOptions());
    chordProgression = entry.chordProgression;
    generatedBpm = entry.bpm;
    generationError = null;
    await applyRenderedString();
    updateURLParams();
  }

  async function handleClick() {
    if (isGenerating) return; // ignore a second click while working
    updateURLParams();
    generationError = null;

    // Same banner as a failed search: from the reader's side, pressing Generate
    // and getting nothing is one situation however it came about.
    const validRhythms = selectedRhythms.filter((r): r is Rhythm => r !== undefined);
    if (validRhythms.length === 0) {
      generationError = "No rhythms are selected, so there is nothing to write with. Pick at least one under Rhythm.";
      return;
    }
    if (selectedKeys.size === 0 && !(fullLength && fullLengthLevel)) {
      generationError = "No keys are selected. Pick at least one under Key.";
      return;
    }
    if (!rhythmsCanFill) {
      generationError =
        `These rhythms cannot fill a bar of ${selectedTimeSignature}. ` +
        `Add a shorter note (a quarter or an eighth), or change the time signature.`;
      return;
    }

    // The monthly allowance (src/lib/usage.ts); GenerationLimit says what to do when it is used up.
    // Counted only once the exercise is on the page (countGeneration, below).
    if (!(await mayGenerate())) return;

    // Draw the key for this exercise. With one key selected this is that key, so
    // nothing changes for the ordinary case.
    let keyPool = [...selectedKeys];
    // A full-length example starts in major - planForm refuses a minor key
    // outright, so the draw has to agree with it rather than fail at the end of
    // seven generations. If nothing selected is major, the level's majors are
    // used, because the alternative is refusing to generate over a setting the
    // reader cannot see the relevance of.
    if (fullLength && fullLengthLevel) {
      const majors = majorKeysFor(fullLengthLevel);
      const selectedMajors = keyPool.filter((k) => majors.includes(k));
      keyPool = selectedMajors.length > 0 ? selectedMajors : majors;
    }
    const drawnKey = keyPool[Math.floor(Math.random() * keyPool.length)] ?? selectedKey;
    selectedKey = drawnKey;

    // The chord picker only ever shows one mode at a time, so a pool spanning
    // major and minor can leave the ticked chords belonging to the wrong one.
    // Keep whatever still applies to the key actually drawn; if that leaves
    // nothing, use the whole vocabulary for that mode rather than generating
    // from an empty set.
    const drawnModeChordNames = isMinorKey(drawnKey) ? minorChordNames : majorChordNames;
    const chordsForDrawnKey = [...userAllowedChords].filter((n) =>
      drawnModeChordNames.includes(n)
    );
    const effectiveChordNames = chordsForDrawnKey.length
      ? chordsForDrawnKey
      : drawnModeChordNames;

    const params: GenerateChoralParams = {
      key: drawnKey,
      timeSig: timeSignatures[selectedTimeSignature],
      partsObject: possibleVoicing[selectedVoicing],
      measures,
      maxSkip,
      bpm,
      selectedRhythms: validRhythms,
      chords: fullChordSet,
      accidentalsByStep,
      nctProbability,
      stepwiseEighths,
      voiceTexture,
      rhythmBias,
      chromaticFrequency,
      focusChord: focusChord ?? undefined,
      midiProgram: instrumentProgram,
      display: displayOptions(),
      // Two-part writing at the beginner levels opens in unison and splits.
      // Level-driven rather than a control: it is what the level *is*, not a
      // preference, and it only ever applies to a two-voice texture.
      unisonProbability: unisonProbabilityFor(activeLevelKey),
      // The consequent phrase opens with the antecedent's material and departs
      // at the cadence - a parallel period. Level-driven for the same reason as
      // unison: repetition is what the beginner repertoire is made of, and it
      // thins as the writing is meant to become continuous.
      rhymeProbability: rhymeProbabilityFor(activeLevelKey),
      // Two treble parts at the beginning levels: a tune with a harmony part
      // under it (two-part-treble.ts). Ignored for any other voicing.
      melodyFirst: melodyFirstFor(activeLevelKey),
      skipLevel: skipLevelFor(activeLevelKey),
      cadenceTypes: activeLevelKey ? uilPresets[activeLevelKey]?.allowedCadenceTypes : undefined,
      dottedOnStrongBeats: !!(activeLevelKey && uilPresets[activeLevelKey]?.dottedOnStrongBeats),
      breathRests: !(activeLevelKey && uilPresets[activeLevelKey]?.noRests),
      // Three treble parts at Levels 2-3: each part its job (three-part-treble.ts).
      ssaLevel: ssaLevelFor(activeLevelKey),
      // Every other voicing at a UIL level: each part its job (part-writer.ts).
      partWriterLevel: activeLevelKey ? Number(activeLevelKey.replace("UIL ", "")) : null,
      allowedChordNames:
        effectiveChordNames.length < drawnModeChordNames.length
          ? effectiveChordNames
          : undefined,
    };

    /** The voicing can be changed while this is written; these are the voices it gets. */
    const jobVoices = voiceNames;

    generationError = null;
    generatingStage = "writing";
    isGenerating = true;
    await tick();
    await painted();

    try {
      let abcString: string;
      let generatedProgression: Chord[];
      let render: (display: any) => string;

      // Off the page's thread, so a hard exercise cannot freeze it - see
      // choral-jobs.ts. A full-length piece is one job too: every section is
      // generated and joined in the worker.
      currentJob = startChoralJob(
        fullLength && formPlan
          ? { kind: "piece", params, plan: formPlan, maxSkip }
          : { kind: "exercise", params }
      );
      const result = await currentJob.result;
      abcString = result.abc;
      generatedProgression = result.chordProgression;
      render = rendererFor(result);
      // A seam that never came good is reported, not hidden: the piece is
      // still worth having, and the reader should know where to look.
      roughSeams = result.roughSeams;

      useExerciseVoices(jobVoices);
      // The Voices menu stays usable while this is written, so a voice can be
      // hidden or shown in the meantime - write it as things are set now.
      const displayNow = displayOptions();
      if (JSON.stringify(displayNow) !== JSON.stringify(params.display)) {
        abcString = render(displayNow);
      }

      renderedString = abcString;
      chordProgression = generatedProgression as Chord[];
      // Kept so the annotation toggles can re-write this exercise instead of
      // replacing it.
      renderCurrent = render;
      const source: ExerciseSource = { exercise: result.exercise, sections: result.sections };
      useExerciseSource(source);
      // A new exercise is not the one a link opened: the URL stops pointing at it.
      exerciseHash = "";
      linkError = null;
      updateURLParams();
      pushHistory({
        render,
        chordProgression: chordProgression,
        bpm,
        label: `${drawnKey} ${isMinorKey(drawnKey) ? "minor" : "major"} · ${selectedTimeSignature} · ${selectedVoicing}${fullLength ? ` · ${formPlan?.measures ?? measures} bars` : ""}`,
        voiceNames: jobVoices,
        source,
      });

      // The search is done; what is left is on this thread - drawing the score,
      // then building the audio - and on a phone a long score takes a moment
      // for each. Say so, rather than "writing" through all of it.
      generatingStage = "drawing";
      await tick();
      await painted();
      const tune = await renderTune();
      if (!tune || tune.length === 0) throw new Error("Failed to render ABC notation.");
      tune[0].setTiming();
      renderedTune = tune[0];
      // The score is on the page: now it counts.
      void countGeneration();
      revealScore(document.getElementById("paper"));
      createPlaybackCursor();
      systemExtents = []; // re-measured lazily once layout has settled
      cursorBeats = newMetronomeBeatState();

      generatingStage = "audio";
      await tick();
      await painted();
      await initSynth(renderedTune);
      generatedBpm = bpm;
    } catch (error: unknown) {
      // Cancelling is not a failure: the exercise already on screen stays.
      if (error instanceof JobCancelled) return;
      // Kept for the console; the banner is what the reader gets.
      console.error("Error generating exercise:", error);
      generationError = currentFailureHint();
    } finally {
      currentJob = null;
      isGenerating = false;
    }
  }

  /** What the overlay says the page is doing. Only "writing" can be cancelled. */
  let generatingStage: "writing" | "drawing" | "audio" = "writing";

  /** The generation in progress, so it can be cancelled. */
  let currentJob: { cancel: () => void } | null = null;
  function cancelGeneration() {
    currentJob?.cancel();
  }

  /**
   * Seconds since Generate was pressed, while it runs. Only shown once it has
   * taken long enough to wonder about - the ordinary exercise is back in
   * milliseconds, and a counter flashing up for those is noise.
   */
  let generatingSeconds = 0;
  let generatingTimer: ReturnType<typeof setInterval> | null = null;
  $: if (isGenerating && !generatingTimer) {
    generatingSeconds = 0;
    generatingTimer = setInterval(() => (generatingSeconds += 1), 1000);
  } else if (!isGenerating && generatingTimer) {
    clearInterval(generatingTimer);
    generatingTimer = null;
  }
</script>

<div class="w-full" style="padding-bottom: calc(var(--bottom-bar-h, 96px) + env(safe-area-inset-bottom, 0px) + 1rem)">
  <!-- Print title (hidden on screen, shown on print) -->
  <p class="print-title">{selectedKey} {isMinorKey(selectedKey) ? 'minor' : 'major'} · {selectedTimeSignature} · {selectedVoicing}</p>

  <!-- Preset bar -->
  <!-- The practice tools: a wheel in the bottom-right corner. -->
  <ToolsWheel />


  <main class="focus-main wide flex flex-col items-center w-full max-w-5xl mx-auto px-2 md:px-4">
  <!-- The settings (hidden in full screen). -->
  <div class="wide-left w-full flex flex-col items-center">

    {#if !assignment}
    <PresetDropdown
      activeLabel={activePresetLabel}
      {activeSavedId}
      edited={presetEdited}
      onRevert={revertPreset}
      currentParams={getCurrentParams}
      page="choral"
      onSelectBuiltin={applyUILPreset}
      onSelectStep={applyLadderStep}
      {activeStepId}
      onSelectSaved={applySavedPreset}
      onRenamed={(p) => { if (p.id === activeSavedId) { activePresetLabel = p.name; activeSavedPreset = p; revertPreset = () => applySavedPreset(p); } }}
      onDelete={(id) => { if (id === activeSavedId) { activePresetLabel = ''; activeSavedId = null; revertPreset = undefined; } }}
    >
      <GenerationLimit slot="end" part="counter" />
    </PresetDropdown>
    {/if}
    {#if assignment}<AssignmentBanner {assignment} />{/if}
    <GenerationLimit part={assignment ? "all" : "alert"} />
    <!-- A paid plan that will not renew, in its last month (plan-ending.ts). -->
    {#if !assignment}<UpgradeNotice /><PlanEndingBanner /><FreeMonthPromo variant="note" />{/if}
    {#if generationError}
      <div
        class="w-full mt-4 rounded-lg border border-sr-brass bg-sr-brass-bg p-4 no-print"
        role="status"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-sr-brass font-semibold">
              Could not write an exercise with these settings
            </p>
            <p class="mt-1 text-sm text-sr-brass">{generationError}</p>
          </div>
          <button
            class="text-sr-brass hover:text-sr-ink text-xl leading-none"
            on:click={() => (generationError = null)}
            aria-label="Dismiss"
          >&times;</button>
        </div>
      </div>
    {/if}

    {#if linkError}
      <div
        class="w-full mt-4 rounded-lg border border-sr-brass bg-sr-brass-bg p-4 no-print"
        role="status"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-sr-brass">Could not open the exercise in this link</p>
            <p class="mt-1 text-sm text-sr-brass">{linkError}</p>
          </div>
          <button
            class="text-sr-brass hover:text-sr-ink text-xl leading-none"
            on:click={() => (linkError = null)}
            aria-label="Dismiss"
          >&times;</button>
        </div>
      </div>
    {/if}

    <!-- The settings as one row of pills, each showing what is chosen; a pill
         opens only its own choices (settingPop), under it, or as a sheet on a
         phone. The exercise history and New exercise end the row. -->
    <section class="setbar sr-panel w-full my-4 no-print" aria-label="Exercise settings" bind:this={setbarEl}>
      <div class="setbar-pills" class:opacity-60={!!assignment} {...(assignment ? { inert: true } : {})}>
        <button class="set-pill" aria-expanded={settingPop === 'voicing'} on:click={(e) => togglePop('voicing', e)}>{pillText.voicing}{#if pillChanged.voicing}<span class="set-pill-dot" title="Changed from the preset"></span>{/if}<ChevronDown size={14} class="set-pill-chev" aria-hidden="true" /></button>
        <button class="set-pill" aria-expanded={settingPop === 'key'} on:click={(e) => togglePop('key', e)}>{pillText.key}{#if pillChanged.key}<span class="set-pill-dot" title="Changed from the preset"></span>{/if}<ChevronDown size={14} class="set-pill-chev" aria-hidden="true" /></button>
        <button class="set-pill" aria-expanded={settingPop === 'meter'} on:click={(e) => togglePop('meter', e)}>{pillText.meter}{#if pillChanged.meter}<span class="set-pill-dot" title="Changed from the preset"></span>{/if}<ChevronDown size={14} class="set-pill-chev" aria-hidden="true" /></button>
        <button class="set-pill" aria-expanded={settingPop === 'length'} on:click={(e) => togglePop('length', e)}>{pillText.length}{#if pillChanged.length}<span class="set-pill-dot" title="Changed from the preset"></span>{/if}<ChevronDown size={14} class="set-pill-chev" aria-hidden="true" /></button>
        <button class="set-pill" aria-expanded={settingPop === 'rhythm'} on:click={(e) => togglePop('rhythm', e)}>{pillText.rhythm}{#if pillChanged.rhythm}<span class="set-pill-dot" title="Changed from the preset"></span>{/if}<ChevronDown size={14} class="set-pill-chev" aria-hidden="true" /></button>
        <button class="set-pill" aria-expanded={settingPop === 'harmony'} on:click={(e) => togglePop('harmony', e)}>{pillText.harmony}{#if pillChanged.harmony}<span class="set-pill-dot" title="Changed from the preset"></span>{/if}<ChevronDown size={14} class="set-pill-chev" aria-hidden="true" /></button>
        <button class="set-pill set-pill-more" aria-expanded={settingPop === 'more'} on:click={(e) => togglePop('more', e)}>More{#if pillChanged.more}<span class="set-pill-dot" title="Changed from the preset"></span>{/if}</button>
      </div>
      <div class="setbar-end">
        <!-- Back through the exercises already generated this session. -->
        {#if history.length > 1}
          <div
            class="flex items-center gap-1 shrink-0 no-print"
            role="group"
            aria-label="Exercise history"
          >
            <!-- Back to the exercise before; and, while looking back, straight to the newest. -->
            <button
              class="sr-tok flex items-center gap-1 min-h-10"
              on:click={() => goToHistory(historyIndex - 1)}
              disabled={historyIndex <= 0 || isGenerating}
              title={historyIndex > 0 ? history[historyIndex - 1].label : "No earlier exercise"}
            ><ChevronLeft size={16} aria-hidden="true" />Previous</button>
            {#if historyIndex < history.length - 1}
              <button
                class="sr-tok flex items-center gap-1 min-h-10"
                on:click={() => goToHistory(history.length - 1)}
                disabled={isGenerating}
                title={history[history.length - 1].label}
              >Latest<ChevronRight size={16} aria-hidden="true" /></button>
            {/if}
          </div>
        {/if}
        <button class="sr-btn setbar-new flex items-center gap-1.5" aria-label="Generate a new exercise" on:click={handleClick} disabled={isGenerating}>
          <RefreshCw size={16} class={isGenerating ? 'animate-spin' : ''} />
          <span>New exercise</span>
          {#if $usage && $usage.limit !== null && $usage.remaining !== null}
            <!-- This month's exercises left, on the button that uses them. -->
            <span
              class="setbar-count {$usage.remaining <= 3 ? 'low' : ''}"
              title="{$usage.remaining} exercises left this month"
              aria-label="{$usage.remaining} left this month"
            >{$usage.remaining}</span>
          {/if}
        </button>
      </div>

      {#if settingPop}
        <button class="set-scrim" aria-label="Close" tabindex="-1" on:click={() => closePops()} transition:fade={{ duration: reduceMotion ? 0 : 140 }}></button>
        <div
          in:popIn
          out:popOut
          class="set-pop {settingPop === 'rhythm' || settingPop === 'harmony' || settingPop === 'more' ? 'set-pop-wide' : ''}"
          style="--pop-left: {popLeft}px"
          role="dialog"
          aria-label={({ voicing: 'Voicing', key: 'Key', meter: 'Time signature', length: 'Length', rhythm: 'Rhythms', harmony: 'Harmony', more: 'More settings' })[settingPop]}
        >
          <p class="set-pop-title">{({ voicing: 'Voicing', key: 'Key', meter: 'Time signature', length: 'Length', rhythm: 'Rhythms', harmony: 'Harmony', more: 'More settings' })[settingPop]}</p>
          <div class:opacity-60={!!assignment} {...(assignment ? { inert: true } : {})}>
          {#if settingPop === 'voicing'}
            <div class="space-y-2">
              
              <div class="flex flex-wrap gap-2" role="group" aria-label="Voicing">
                {#each Object.keys(possibleVoicing) as voicing}
                  <button
                    class="sr-tok {selectedVoicing === voicing ? 'sr-on' : ''} {outside(presetVoicings, voicing) && selectedVoicing !== voicing ? 'sr-outside' : ''}"
                    title={outside(presetVoicings, voicing) ? `Outside ${activePreset?.label ?? 'this level'}` : undefined}
                    on:click={() => (selectedVoicing = voicing)}
                  >{voicing}</button>
                {/each}
              </div>
            </div>
          {:else if settingPop === 'key'}
            <div class="space-y-2">
              {#each [false, true] as minorRow}
                {@const rowKeys = keysInMode(minorRow)}
                {@const chosen = rowKeys.filter((k) => selectedKeys.has(k)).length}
                <div class="space-y-2 {minorRow ? 'pt-1' : ''}">
                  <div class="flex items-baseline justify-between gap-3">
                    <span class="flex items-baseline gap-2">
                      <span class="sr-label">{minorRow ? 'Minor keys' : 'Major keys'}</span>
                      <span class="text-xs text-sr-faint tabular-nums">{chosen} of {rowKeys.length}</span>
                    </span>
                    <span class="inline-flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        class="sr-link"
                        disabled={chosen === rowKeys.length}
                        on:click={() => selectAllKeys(minorRow)}
                      >All</button>
                      <span class="text-xs text-sr-faint">/</span>
                      <button
                        type="button"
                        class="sr-link"
                        disabled={chosen === 0}
                        on:click={() => clearKeys(minorRow)}
                      >None</button>
                    </span>
                  </div>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Key {minorRow ? 'minor' : 'major'}">
                {#each rowKeys as key}
                  <button
                    class="sr-tok {selectedKeys.has(key) ? 'sr-on' : ''} {outside(presetKeys, key) && !selectedKeys.has(key) ? 'sr-outside' : ''}"
                    title={outside(presetKeys, key) ? `Outside ${activePreset?.label ?? 'this level'}` : undefined}
                    on:click={() => {
                      const next = new Set(selectedKeys);
                      if (next.has(key)) {
                        next.delete(key);
                        selectedKeys = next;
                        // Keep the displayed key inside the pool.
                        if (selectedKey === key && next.size > 0) selectedKey = [...next][0];
                        return;
                      }
                      next.add(key);
                      selectedKeys = next;
                      const wasMinor = isMinorKey(selectedKey);
                      const nowMinor = isMinorKey(key);
                      selectedKey = key;
                      if (wasMinor !== nowMinor) {
                        userAllowedChords = new Set([
                          ...(nowMinor ? minorChordNames : majorChordNames),
                          ...(nowMinor ? minorInversions : majorInversions),
                        ]);
                      }
                    }}
                  >{key}</button>
                {/each}
              </div>
                </div>
              {/each}
              {#if selectedKeys.size > 1}
                <p class="text-xs text-sr-faint">
                  {selectedKeys.size} keys selected. One is drawn at random each
                  time you generate. Click a key to remove it.
                </p>
              {/if}
              {#if activePreset}
                <p class="text-xs text-sr-faint">
                  Dimmed keys are outside {activePreset.label}, not removed. Pick
                  one and you simply leave the level.
                </p>
              {/if}
            </div>
          {:else if settingPop === 'meter'}
            <div class="space-y-2">
              
              <div class="flex flex-wrap gap-2" role="group" aria-label="Time Signature">
                {#each Object.keys(timeSignatures) as ts}
                  <button
                    class="sr-tok {selectedTimeSignature === ts ? 'sr-on' : ''} {presetMeterNames && !presetMeterNames.has(ts) ? 'sr-outside' : ''}"
                    title={presetMeterNames && !presetMeterNames.has(ts) ? `Outside ${activePresetLabel || "this level"}` : ""}
                    on:click={() => (selectedTimeSignature = ts)}
                  >{ts}</button>
                {/each}
              </div>
            </div>
          {:else if settingPop === 'length'}
            <div class="space-y-2">
              
              <div class="flex flex-wrap gap-2 items-center" role="group" aria-label="Measures">
                {#each measureOptions as opt}
                  <button
                    class="sr-tok {!fullLength && measures === opt ? 'sr-on' : ''}"
                    on:click={() => { fullLength = false; measures = opt; }}
                  >{opt}</button>
                {/each}
                <button
                  class="sr-tok {fullLength ? 'sr-on' : ''}"
                  aria-pressed={fullLength}
                  on:click={() => {
                    fullLength = !fullLength;
                    if (fullLength && fullLengthRange) fullLengthMeasures = fullLengthRange[1];
                  }}
                >Full length piece</button>
              </div>

              {#if fullLength}
                <div class="rounded border border-sr-hairline bg-sr-raise p-3 space-y-3 text-sm">
                  {#if !fullLengthLevel}
                    <p class="text-sr-ink-2">
                      Pick a UIL level first. The length, the shape and how much of the piece may be
                      polyphonic all come from the level.
                    </p>
                  {:else if formPlanError}
                    <p class="text-sr-brass">{formPlanError}</p>
                  {:else if formPlan && fullLengthRange}
                    <div class="space-y-1">
                      <p class="sr-label">
                        Length: level {fullLengthLevel} wants {fullLengthRange[0]}&ndash;{fullLengthRange[1]} bars in {selectedTimeSignature}
                      </p>
                      <div class="flex flex-wrap gap-2" role="group" aria-label="Full length">
                        {#each [fullLengthRange[0], Math.round((fullLengthRange[0] + fullLengthRange[1]) / 2), fullLengthRange[1]] as opt}
                          <button
                            class="sr-tok {formPlan.measures === opt ? 'sr-on' : ''}"
                            on:click={() => (fullLengthMeasures = opt)}
                          >{opt} bars</button>
                        {/each}
                      </div>
                    </div>

                    <div class="space-y-1">
                      <p class="sr-label">Form</p>
                      <ul class="space-y-0.5 font-mono text-xs text-sr-ink-2">
                        {#each formPlan.sections as section}
                          <li>
                            <span class="inline-block w-10 font-semibold">{section.label}</span>
                            <span class="inline-block w-20">bars {section.startsAtBar}&ndash;{section.startsAtBar + section.measures - 1}</span>
                            <span>{section.style}{section.restates ? ` of ${section.restates}` : ""}</span>
                            {#if section.keyArea !== "tonic"}
                              <span class="text-sr-action-fg">&middot; {section.keyArea === "dominant" ? "toward V" : "toward vi"}</span>
                            {/if}
                            {#if section.texture === "staggered"}
                              <span class="text-violet-700">&middot; staggered entrances</span>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    </div>

                    <p class="text-xs text-sr-muted">
                      Polyphony {Math.round(100 * formPlan.polyphony.share)}% of the
                      {Math.round(100 * formPlan.polyphony.ceiling)}% level {fullLengthLevel} allows.
                      {#if formPlan.shortEndingBar}
                        A lower level may stop at bar {formPlan.shortEndingBar}.
                      {/if}
                      Always major. Minor keys are for the shorter exercises above.
                    </p>
                    <p class="text-xs text-sr-brass">
                      Sections marked &ldquo;toward V&rdquo; or &ldquo;toward vi&rdquo; are planned but not yet
                      written that way: chord generation cannot be told to cadence anywhere but home
                      yet, so they will come out at home.
                    </p>
                  {/if}
                </div>
              {/if}
            </div>
          {:else if settingPop === 'rhythm'}
          <div class="space-y-3">
            
            {#each rhythmPickerGroups(Object.values(filterRhythms)) as group}
            <p class="text-xs text-sr-faint">{group.label}</p>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Select Allowed Rhythms: {group.label}">
              {#each group.rhythms as rhythm}
                <button
                  class="sr-tok-sq px-2 py-1 h-12 min-w-12 flex items-center justify-center relative
                    {selectedRhythms.some((r) => r?.name === rhythm.name)
                      ? 'sr-on'
                      : ''}
                    {outside(presetRhythmNames, rhythm.name) && !selectedRhythms.some((r) => r?.name === rhythm.name) ? 'sr-outside' : ''}
                    {unusableRhythmNames.has(rhythm.name) ? 'sr-warn' : ''}"
                  title={unusableRhythmNames.has(rhythm.name)
                    ? `Selected, but cannot appear in ${selectedTimeSignature}`
                    : outside(presetRhythmNames, rhythm.name)
                      ? `Outside ${activePreset?.label ?? 'this level'}`
                      : undefined}
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
            {#if selectedRhythms.length > 0}
              <div class="space-y-2 pt-1">
                <p class="sr-label">
                  How often
                </p>
                <div class="space-y-1.5" role="group" aria-label="How often">
                  {#each rhythmPickerGroups(selectedRhythms.filter((r) => r)).flatMap((g) => g.rhythms) as rhythm}
                    <div class="flex items-center gap-3" role="group" aria-label={`How often: ${rhythmLabel(rhythm.name)}`}>
                      <span class="rhythm-icon-sm h-8 w-auto shrink-0 flex items-center justify-center">
                        {#await rhythmSvgs[rhythm.name] then svg}
                          {@html svg.default}
                        {:catch}
                          <span class="text-[10px]">{rhythm.name}</span>
                        {/await}
                      </span>
                      <div class="flex flex-wrap gap-1">
                        {#each rhythmFrequencies as freq}
                          <button
                            class="sr-freq {frequencyOf(rhythmBias, rhythm.name) === freq.value
                              ? 'sr-on'
                              : ''}"
                            on:click={() => setFrequency(rhythm.name, freq.value)}
                            aria-pressed={frequencyOf(rhythmBias, rhythm.name) === freq.value}
                          >{freq.label}</button>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
                <p class="text-xs text-sr-faint">
                  Sixteenths are kept rare on purpose, since a sung exercise lives on
                  quarters and halves. Turn one up here if you want to drill it.
                </p>
              </div>
            {/if}
            {#if unusableRhythmNames.size > 0}
              <p class="text-xs text-sr-brass">
                Ringed in amber: selected, but cannot appear in {selectedTimeSignature}.
                A rhythm has to be at least a quarter note and fit inside one measure.
              </p>
            {/if}
            {#if activePreset}
              <p class="text-xs text-sr-faint">
                Dimmed rhythms are outside {activePreset.label}. They are still
                available. Picking one just takes you off the level.
              </p>
            {/if}
          </div>
          {:else if settingPop === 'harmony'}
          <div class="space-y-5">
            <!-- Chord toggles -->
            {#each Object.entries(chordGroups) as [groupName, chordNames]}
              <div class="space-y-2">
                <p class="sr-label">{groupName}</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label={groupName}>
                  {#each chordNames as chordName}
                    {@const chord = fullChordSet.find(c => c.name === chordName)}
                    {#if chord}
                      <button
                        type="button"
                        class="sr-tok
                          {userAllowedChords.has(chordName)
                            ? 'sr-on'
                            : ''}
                          {outside(presetChordNames, chordName) && !userAllowedChords.has(chordName) ? 'sr-outside' : ''}"
                        title={outside(presetChordNames, chordName) ? `Outside ${activePreset?.label ?? 'this level'}` : undefined}
                        on:click={() => {
                          // Toggle first, THEN re-apply the inversions. The
                          // other order grants a chromatic-bass inversion off
                          // the parent's old state, so switching the parent off
                          // left its inversion behind and it kept appearing.
                          const next = new Set(userAllowedChords);
                          if (next.has(chordName)) next.delete(chordName);
                          else next.add(chordName);
                          userAllowedChords = withInversions(next);
                        }}
                      >{chord.symbol}</button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}

            <!-- Drilling one chromatic chord. Major only: every chord it offers
                 is a major-mode chromatic chord. -->
            <div class="space-y-2">
              <p class="sr-label">Focus on a chord</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Focus on a chord">
                <button
                  type="button"
                  class="sr-tok {focusChord === null ? 'sr-on' : ''}"
                  aria-pressed={focusChord === null}
                  on:click={() => (focusChord = null)}
                >None</button>
                {#each majorChordGroups['Chromatic Chords'] as chordName}
                  {@const chord = fullChordSet.find(c => c.name === chordName)}
                  {#if chord}
                    <button
                      type="button"
                      class="sr-tok {focusChord === chordName ? 'sr-on' : ''}"
                      aria-pressed={focusChord === chordName}
                      aria-label={`Focus on ${chord.symbol}`}
                      on:click={() => (focusChord = focusChord === chordName ? null : chordName)}
                    >{chord.symbol}</button>
                  {/if}
                {/each}
              </div>
              <p class="text-xs text-sr-faint">
                {#if focusChord === null}
                  Pick a chromatic chord to drill: every exercise is built around it, usually
                  more than once, and the other chromatic chords are left out.
                {:else if [...selectedKeys].every((k) => isMinorKey(k))}
                  Only minor keys are selected, and these are major-key chords. Add a major key
                  for the focus to apply.
                {:else}
                  Every exercise in a major key uses {fullChordSet.find(c => c.name === focusChord)?.symbol},
                  usually more than once, with its inversion. Other chromatic chords are left out.
                  {#if [...selectedKeys].some((k) => isMinorKey(k))}
                    Minor keys drawn from your selection ignore it.
                  {/if}
                {/if}
              </p>
            </div>

            <!-- How often the chromatic chords above are reached for. Lives with
                 them rather than further down: it does nothing unless one of
                 them is switched on. -->
            <div class="space-y-2">
              <p class="sr-label">Chromatic Chord Frequency</p>
              <div class="flex flex-wrap items-center gap-3" role="group" aria-label="Chromatic Chord Frequency">
                <span class="text-xs text-sr-muted">Less</span>
                <input type="range" min="0" max="5" step="0.5" bind:value={chromaticFrequency} class="w-40 sr-range" aria-label="Chromatic chord frequency" />
                <span class="text-xs text-sr-muted">More</span>
                <span class="text-sm font-semibold">{chromaticFrequency}×</span>
              </div>
              <p class="text-xs text-sr-faint">
                How often the chromatic chords above are chosen. Each brings its
                own first inversion with it, so the raised note can reach the bass.
              </p>
            </div>

            <!-- NCT Probability -->
            <div class="space-y-2">
              <p class="sr-label">Non-Chord Tone Amount</p>
              <div class="flex flex-wrap items-center gap-3" role="group" aria-label="Non-Chord Tone Amount">
                <span class="text-xs text-sr-muted">None</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={nctProbability} class="w-40 sr-range" aria-label="Non-chord tone amount" />
                <span class="text-xs text-sr-muted">Heavy</span>
                <span class="text-sm font-semibold">{Math.round(nctProbability * 100)}%</span>
              </div>
              <p class="text-xs text-sr-faint">Passing · Neighbor · Suspension · Anticipation · Appoggiatura · Escape</p>
            </div>

            <!-- Accidentals by Step -->
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" bind:checked={accidentalsByStep} class="sr-check" />
                Chromatic tones approached &amp; resolved by step
              </label>
              <p class="text-xs text-sr-faint">Sharps resolve up · Flats resolve down</p>
            </div>

            <!-- Stepwise eighths -->
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" bind:checked={stepwiseEighths} class="sr-check" />
                Eighth notes move by step
              </label>
              <p class="text-xs text-sr-faint">Stepwise or repeated: no skips into or out of an eighth</p>
            </div>

            <!-- Max Skip -->
            <div class="space-y-2">
              <p class="sr-label">Max Melodic Skip</p>
              <div class="flex flex-wrap items-center gap-3" role="group" aria-label="Max Melodic Skip">
                <button type="button" class="sr-btn-quiet"
                  aria-label="Narrower maximum skip"
                  on:click={() => { if (maxSkip > maxSkipRange[0]) maxSkip -= 1; }}><Minus size={16} /></button>
                <span class="text-sm font-bold w-6 text-center">{maxSkip}</span>
                <button type="button" class="sr-btn-quiet"
                  aria-label="Wider maximum skip"
                  on:click={() => { if (maxSkip < maxSkipRange[1]) maxSkip += 1; }}><Plus size={16} /></button>
                <span class="text-xs text-sr-faint">{skipIntervalNames[maxSkip] ?? `${maxSkip} steps`}</span>
              </div>
            </div>
          </div>
          {:else if settingPop === 'more'}
            <div class="space-y-5">
            <div class="space-y-2">
              <p class="sr-label">Voice texture</p>
              {#if fullLength}
                <p class="text-xs text-sr-muted">
                  The form decides this per section for a full-length piece: the imitative
                  passage gets staggered entrances and the rest all voices.
                </p>
              {/if}
              <div class="flex flex-wrap gap-2" role="group" aria-label="Voice texture">
                {#each voiceTextures as mode}
                  <button
                    class="sr-tok {voiceTexture === mode ? 'sr-on' : ''} {mode === 'staggered' && !polyphonyAllowed ? 'sr-outside' : ''}"
                    title={mode === 'staggered' && !polyphonyAllowed ? `${activePresetLabel || "This level"} is homophonic only` : ""}
                    on:click={() => (voiceTexture = mode)}
                    aria-pressed={voiceTexture === mode}
                  >{voiceTextureLabels[mode]}</button>
                {/each}
              </div>
              <p class="text-xs text-sr-faint">
                {voiceTexture === "full"
                  ? "Every part sings throughout, apart from rests in the rhythm."
                  : measures < 12
                    ? "Parts drop out for a few measures at a time. Needs 12 measures or more. Every part is there for the opening and the cadence."
                    : "Parts drop out for a few measures at a time. Every part is there for the opening and the cadence."}
              </p>
            </div>
              <div class="space-y-2">
                <p class="sr-label">Voice ranges</p>
          {#if selectedVoicing && possibleVoicing[selectedVoicing]}
            <div class="grid gap-4 sm:grid-cols-2">
              {#each Object.entries(possibleVoicing[selectedVoicing].parts) as [partName, part]}
                <div class="space-y-1.5">
                  <!-- A text button, so showing it does not make this row taller
                       than the next card's and knock the grid out of line. -->
                  <div class="flex items-baseline gap-3">
                    <p class="sr-label">{partName}</p>
                    {#if rangeDiffers(part.currentRange, rangeTargets[partName])}
                      <button
                        type="button"
                        class="text-xs font-semibold text-sr-brass hover:underline underline-offset-2"
                        on:click={() => resetRange(partName)}
                        title={fromPreset ? `Back to ${activePresetLabel}'s ${partName} range` : `Back to the default ${partName} range`}
                        aria-label="Reset {partName} range"
                      >Reset</button>
                    {/if}
                  </div>
                  <RangeSelector
                    range={{ min: part.currentRange[0], max: part.currentRange[1] }}
                    clef={part.clef}
                    onRangeChange={(newRange) => handleRangeChange(partName, newRange)}
                  />
                </div>
              {/each}
            </div>
          {/if}
              </div>
            </div>
          {/if}
          </div>
          <div class="set-pop-foot">
            <button class="sr-tok" on:click={() => closePops()}>Done</button>
            <button class="sr-btn flex items-center gap-1.5" on:click={() => { closePops(false); handleClick(); }} disabled={isGenerating}>
              <RefreshCw size={16} />
              <span>New exercise</span>
            </button>
          </div>
        </div>
      {/if}
    </section>

    <!-- Hidden abcjs audio element -->
    <div id="audio" class="hidden"></div>

    {#if !rhythmsCanFill}
      <p class="text-sm text-sr-brass bg-sr-brass-bg border border-sr-brass rounded-md px-3 py-2 my-2">
        The selected rhythms cannot fill a bar of {selectedTimeSignature}, so nothing
        can be generated. Add a shorter note (a quarter or an eighth), or change
        the time signature.
      </p>
    {/if}

    {#if audioNotice}
      <p class="text-sm text-sr-brass bg-sr-brass-bg border border-sr-brass rounded-md px-3 py-2 my-2">
        {audioNotice}
      </p>
    {/if}

    {#if roughSeams.length > 0}
      <p class="text-sm text-sr-brass bg-sr-brass-bg border border-sr-brass rounded-md px-3 py-2 my-2">
        The join after {roughSeams.length === 1 ? "section" : "sections"}
        {roughSeams.join(", ")} could not be made smooth after several tries. There may be a
        wide leap or a stranded accidental where that section ends. Generating again usually
        clears it.
      </p>
    {/if}

    <!-- Sheet music (all that full screen keeps) -->
  </div>

  <!-- The music (all full screen keeps). -->
  <div class="wide-right focus-keep w-full">
    <div class="focus-score relative w-full" class:min-h-40={isGenerating}>
      <!-- The score's own toolbar: how it is shown and played (Display, the
           score options), opening under it. -->
      <div class="score-tools focus-hide no-print" bind:this={toolsEl}>
        <button class="tool-btn" aria-expanded={toolPop === 'display'} on:click={() => toggleTool('display')}>
          <Eye size={16} aria-hidden="true" />Display
        </button>
        {#if toolPop}
          <button class="set-scrim" aria-label="Close" tabindex="-1" on:click={() => closePops()} transition:fade={{ duration: reduceMotion ? 0 : 140 }}></button>
          <div in:popIn out:popOut class="set-pop set-pop-tools" role="dialog" aria-label="Display">
            <p class="set-pop-title">Display</p>
            <div class:opacity-60={!!assignment} {...(assignment ? { inert: true } : {})}>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
      <div class="space-y-2">
        <p class="sr-label">Playback sound</p>
        <div class="sr-select">
          <Volume2 size={14} class="sr-select-ico" aria-hidden="true" />
          <select
            class="sr-select-input"
            aria-label="Playback sound"
            value={instrumentProgram}
            on:change={onInstrumentSelect}
          >
            {#each INSTRUMENTS as instrument}
              <option value={instrument.program}>{instrument.label}</option>
            {/each}
          </select>
        </div>
        <p class="text-xs text-sr-faint">
          Changes the sound straight away. The exercise stays as it is.
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

      <div class="space-y-2">
        <p class="sr-label">Annotations</p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Annotations">
          <button
            class="sr-tok {showChords ? 'sr-on' : ''}"
            on:click={handleToggleChords}
            aria-pressed={showChords}
          >Chord symbols</button>
          <button
            class="sr-tok {scoreView.measureNumbers !== false ? 'sr-on' : ''}"
            on:click={() => changeScoreView({ measureNumbers: scoreView.measureNumbers === false })}
            aria-pressed={scoreView.measureNumbers !== false}
          >Measure numbers</button>
          {#each lyricSystems as [value, label]}
            <button
              class="sr-tok {lyricSystem === value ? 'sr-on' : ''}"
              on:click={() => handleLyricSystem(value)}
              aria-pressed={lyricSystem === value}
            >{label}</button>
          {/each}
        </div>
        <p class="text-xs text-sr-faint">
          {#if showChords}
            Chord symbols above the top staff{lyricSystem ? ", " : "."}
          {/if}
          {#if lyricSystem === "movable"}
            Movable do under each part: do is the tonic, so a tune reads the same in
            every key.
          {:else if lyricSystem === "fixed"}
            Fixed do under each part: C is do whatever the key.
          {:else if lyricSystem === "names"}
            The note names under each part.
          {:else if !showChords}
            Clean: the same exercise, printed for sight-reading.
          {/if}
        </p>
        {#if lyricSystem === "movable" && [...selectedKeys].some((k) => isMinorKey(k))}
          <!-- How minor is sung: the tonic as la (the relative major's syllables) or as do. -->
          <div class="flex flex-wrap items-center gap-2 pt-1" role="group" aria-label="Minor solfège">
            <span class="text-xs text-sr-faint">Sing minor</span>
            <button class="sr-tok {minorSolfege === 'la' ? 'sr-on' : ''}" aria-pressed={minorSolfege === 'la'}
              on:click={() => { minorSolfege = "la"; void reRenderAnnotations(); }}>La-based</button>
            <button class="sr-tok {minorSolfege === 'do' ? 'sr-on' : ''}" aria-pressed={minorSolfege === 'do'}
              on:click={() => { minorSolfege = "do"; void reRenderAnnotations(); }}>Do-based</button>
          </div>
          <p class="text-xs text-sr-faint">
            {minorSolfege === "la" ? "In minor the tonic is la: la ti do re mi fa so." : "In minor the tonic is do: do re me fa so le te."}
          </p>
        {/if}
      </div>

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
            <p class="text-xs text-sr-faint mt-4">These change how the exercise looks and sounds. The notes stay the same.</p>
            <div class="set-pop-foot">
              <button class="sr-tok" on:click={() => closePops()}>Done</button>
            </div>
          </div>
        {/if}
      </div>
      <!-- Kept in the DOM even while hidden: renderAbc finds it by id, and it
           is un-hidden before renderTune measures its width. -->
      <!-- "1, 2, Ready, Go" at the top-left of the music, above the first staff. -->
      <CountInBadge />
      <div
        id="paper"
        class="sr-sheet w-full my-2"
        class:hidden={showScorePlaceholder}
      ></div>

      <!-- Before the first exercise exists, #paper is an empty white card that
           reads as something failing to load. Show the shape of a score instead.
           A sibling rather than a child, because renderAbc empties #paper. -->
      {#if showScorePlaceholder}
        <div
          class="sr-sheet w-full my-2 p-6 flex flex-col gap-5"
          aria-hidden="true"
        >
          {#each voiceNames as _}
            <div class="skel-staff">
              {#each [0, 1, 2, 3, 4] as _line}
                <div class="skel-staff-line"></div>
              {/each}
            </div>
          {/each}
          <p class="text-center text-sm text-[#56637f] font-semibold">
            Press New exercise to write one.
          </p>
        </div>
      {/if}

      {#if isGenerating}
        <div class="generating-overlay" aria-live="polite">
          <div class="generating-inner">
            <div class="generating-spinner" aria-hidden="true"></div>
            <p class="text-sm font-medium text-sr-muted">
              {generatingStage === "drawing"
                ? "Drawing the score…"
                : generatingStage === "audio"
                  ? "Getting the sound ready…"
                  : `Writing the ${fullLength ? "piece" : "exercise"}…`}{generatingSeconds >= 2 ? ` ${generatingSeconds}s` : ""}
            </p>
            {#if generatingStage === "writing" && generatingSeconds >= 2}
              <p class="text-xs text-sr-faint max-w-xs">
                Long exercises at the higher levels are a harder search, and can take a
                few seconds.
              </p>
              <button class="sr-btn-quiet mt-1" on:click={cancelGeneration}>Cancel</button>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="h-4"></div>

  </div>
  </main>

  <!-- Sticky playback bar -->
  <PlaybackBar
    tools
    hideGenerate={setbarInView}
    fullscreen={$fullscreenOn}
    onToggleFullscreen={fullscreenCtl.toggle}
    {annotationChoices}
    onAnnotation={pickAnnotation}
    {scoreView}
    onScoreView={changeScoreView}
    {isPlaying}
    {bpm}
    {looping}
    voiceNames={barVoices}
    {mutedVoices}
    {hiddenVoices}
    hasExercise={renderedTune !== null}
    onPlay={handlePlay}
    onPause={handlePause}
    onStop={handleStop}
    onRestart={handleRestart}
    onBpmChange={handleBpmChange}
    {isPreparing}
    onGenerate={handleClick}
    onToggleLoop={handleToggleLoop}
    onToggleMute={handleToggleMute}
    onToggleHidden={handleToggleHidden}
    {settingsLink}
    {exerciseLink}
    onPrint={handlePrint}
    {exports}
  >
    <svelte:fragment slot="extra">
      <div class="fs-keep flex items-center gap-2" title="Voices volume">
        <Volume2 size={18} class="shrink-0 text-sr-faint" aria-hidden="true" />
        <input
          type="range" min="0" max="1.5" step="0.05"
          bind:value={playbackVolume}
          on:change={handleMixCommit}
          class="w-20 accent-sr-bar-on"
          aria-label="Voices volume"
        />
      </div>
      <!-- The page's one metronome, the same as in Tools (metronome-link); kept in full screen. -->
      <div class="fs-keep flex items-center gap-2">
        <button
          class="flex-shrink-0 flex items-center justify-center h-11 w-11 xl:h-8 xl:w-8 {$tuner.clickWithMusic ? 'opacity-100' : 'opacity-50'}"
          on:click={() => setClickWithMusic(!$tuner.clickWithMusic)}
          title="Click with the music"
          aria-label="Toggle metronome click during playback"
          aria-pressed={$tuner.clickWithMusic}
        >
          <MetronomeIcon size={20} />
        </button>
        <input
          type="range" min="0" max="1" step="0.05"
          value={$tuner.metronomeVolume}
          on:input={(e) => tuner.setMetronomeVolume(Number(e.currentTarget.value))}
          class="w-16 h-10 xl:h-auto accent-sr-bar-on"
          aria-label="Metronome volume"
        />
        <button
          class="rounded-full px-3 min-h-11 xl:min-h-0 py-2 xl:py-0.5 text-xs font-semibold {metronomeSounding($tuner) ? 'bg-sr-peach text-sr-peach-ink' : 'bg-sr-bar-btn hover:bg-sr-bar-btn-hi'}"
          on:click={toggleMetronome}
          aria-pressed={metronomeSounding($tuner)}
          title="The metronome, the same one as in Tools: on its own, or with the music while it plays"
        >{metronomeSounding($tuner) ? 'Click On' : 'Click'}</button>
      </div>
    </svelte:fragment>
  </PlaybackBar>
</div>

<style>
  /* The settings row: pills that each open their own popover, then New exercise. */
  .setbar {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem;
  }
  .setbar-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; flex: 1 1 26rem; min-width: 0; }
  .set-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 2.5rem;
    padding: 0.4rem 0.55rem 0.4rem 0.8rem;
    border-radius: 999px;
    background: var(--sr-track);
    color: var(--sr-ink);
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
    border: 2px solid transparent;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .set-pill:hover { border-color: var(--sr-tint); }
  .set-pill[aria-expanded="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  .set-pill-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--sr-action); flex: none; }
  .set-pill[aria-expanded="true"] .set-pill-dot { background: var(--sr-action-ink); }
  .setbar-count {
    margin-left: 0.15rem;
    min-width: 1.25rem;
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 11px;
    line-height: 1.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    background: rgba(255, 255, 255, 0.3);
  }
  .setbar-count.low { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .set-pill-k { font-size: 12px; font-weight: 600; opacity: 0.7; }
  :global(.set-pill-chev) { opacity: 0.7; }
  .set-pill-more { background: transparent; color: var(--sr-action-fg); padding-inline: 0.6rem; }
  .set-pill-more[aria-expanded="true"] { background: var(--sr-tint); color: var(--sr-action-fg); }
  .setbar-new { min-height: 2.75rem; }
  .setbar-end { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }

  /* One popover at a time: under its pill, or a bottom sheet on a phone. */
  .set-pop {
    position: absolute;
    z-index: 40;
    top: calc(100% + 0.5rem);
    left: var(--pop-left, 0px);
    width: min(26.25rem, 100%);
    max-height: min(70vh, 40rem);
    overflow: auto;
    padding: 1rem 1.125rem 1.125rem;
    border-radius: 24px;
    background: var(--sr-raise);
    color: var(--sr-ink);
    border: 1px solid var(--sr-hairline);
    box-shadow: 0 2px 6px rgba(21, 33, 58, 0.08), 0 30px 60px -20px rgba(21, 33, 58, 0.45);
    text-align: left;
  }
  .set-pop-wide { left: 0; width: 100%; }
  .set-pop-tools { left: auto; right: 0; width: min(40rem, 100%); }
  .set-pop-title {
    font-family: var(--sr-font-display);
    font-weight: 600;
    font-size: 17px;
    margin-bottom: 0.625rem;
  }
  .set-pop-foot {
    position: sticky;
    bottom: -1.125rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin: 1rem -1.125rem -1.125rem;
    padding: 0.75rem 1.125rem;
    background: var(--sr-raise);
    border-top: 1px solid var(--sr-hairline-2);
  }
  .set-scrim { display: none; }
  .sr-link-btn { color: var(--sr-action-fg); font-weight: 800; font-size: 14px; padding-top: 0.25rem; }

  /* The score's toolbar, above the paper. */
  .score-tools {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.5rem;
    padding: 0 0.875rem;
    border-radius: 999px;
    background: var(--sr-panel);
    color: var(--sr-ink-2);
    font-size: 14px;
    font-weight: 800;
    box-shadow: var(--sr-card-shadow);
    border: 2px solid transparent;
  }
  .tool-btn:hover { border-color: var(--sr-tint); }
  .tool-btn[aria-expanded="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  .tool-btn-live { border-color: var(--sr-action); }

  @media (max-width: 640px) {
    .setbar-end { flex: 1; }
    .setbar-new { flex: 1; justify-content: center; }
    .set-pop,
    .set-pop-wide,
    .set-pop-tools {
      position: fixed;
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      width: 100%;
      max-height: 78vh;
      border-radius: 28px 28px 0 0;
      z-index: 60;
      padding-bottom: calc(1.125rem + env(safe-area-inset-bottom, 0px));
    }
    .set-pop-foot { bottom: calc(-1.125rem - env(safe-area-inset-bottom, 0px)); }
    .set-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 55;
      background: rgba(21, 33, 58, 0.35);
    }
  }

  /* The little rhythm glyphs beside the frequency buttons, at the icons' own
     shared scale like the picker (globals.css), capped to the row. Stretching
     each to the row's full height blew the whole note - a notehead with no
     stem, a quarter of the others' height - up to four times its size. */
  .rhythm-icon-sm :global(svg) {
    width: auto;
    height: auto;
    max-width: none;
    max-height: 100%;
  }

  /*
   * Keep auto-scrolling clear of the navbar.
   *
   * The navbar is fixed, 4rem tall, and reveals itself on *any* upward scroll
   * (Navbar.svelte). Scrolling back to the top for a repeat is an upward
   * scroll, so it slides back down over the first system exactly as the music
   * arrives there.
   *
   * scroll-margin-top is what this property is for: the browser leaves the gap
   * when scrolling an element into view, so the notes clear the navbar whether
   * it happens to be showing or not. Better than suppressing the navbar during
   * programmatic scrolls, which would have to guess when one is happening.
   */
  :global(#paper),
  :global(#paper .abcjs-note),
  :global(#paper .abcjs-staff) {
    scroll-margin-top: 5rem;
  }

  /*
   * The generating overlay.
   *
   * Both animations are opacity and transform only. That matters: generation
   * blocks the main thread, and those are the two properties a browser can
   * animate on the compositor, so the spinner keeps turning through a block
   * that would freeze anything driven by JavaScript or by layout.
   *
   * The fade is delayed, so a fast exercise finishes before the overlay is
   * ever visible and the screen does not flash on every click.
   */
  .generating-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.72);
    opacity: 0;
    animation: generating-fade 180ms ease-out 220ms forwards;
    z-index: 5;
    /* Promote to its own layer. Without this Chrome runs the fade on the main
     * thread, which is precisely the thread generation is blocking - measured
     * with getAnimations(), currentTime stayed at 0 through a 700ms block, so
     * the overlay mounted and never appeared. */
    will-change: opacity;
  }
  .generating-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }
  .generating-spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid rgba(37, 99, 235, 0.2);
    border-top-color: rgb(37, 99, 235);
    animation: generating-spin 720ms linear infinite;
    will-change: transform;
  }
  @keyframes generating-fade {
    to { opacity: 1; }
  }
  @keyframes generating-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .generating-spinner { animation: none; }
    .generating-overlay { animation-duration: 1ms; }
  }

  .tab-scroll {
    scrollbar-width: none;
  }
  .tab-scroll::-webkit-scrollbar {
    display: none;
  }

  /* The icons carry their own size at one shared scale - see globals.css. */
  :global(.rhythm-icon svg) {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
  }
</style>
