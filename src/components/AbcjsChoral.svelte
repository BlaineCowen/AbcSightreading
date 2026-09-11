<script lang="ts">
  import {
    crossedWholeBeat,
    newMetronomeBeatState,
  } from "../lib/metronome-beats";
  import { onMount, onDestroy, tick } from "svelte";
  import abcjs from "abcjs";
  import { RefreshCw, Minus, Plus } from "lucide-svelte";
  import { chords as fullChordSet } from "../resources/chords";
  import { rhythms as allRhythms } from "../resources/rhythms";
  import {
    canAppearInChoral,
    containsRest,
    isSelectableRhythm,
  } from "../lib/selectable-rhythms";
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
  import { canFillExercise } from "../lib/rhythm-feasibility";
  import { unisonProbabilityFor } from "../lib/unison-spans";
  import { rhymeProbabilityFor } from "../lib/rhyming-phrases";
  import {
    INSTRUMENTS,
    DEFAULT_INSTRUMENT,
    isInstrumentProgram,
    withInstrument,
  } from "../lib/instruments";
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

  /** Off draws nothing; smooth glides with the music; note lands on each note. */
  const voiceTextures = ["full", "staggered", "independent"] as const;
  type TextureMode = (typeof voiceTextures)[number];
  const voiceTextureLabels: Record<TextureMode, string> = {
    full: "All voices",
    staggered: "Staggered entrances",
    independent: "Independent parts",
  };
  const isVoiceTextureMode = (v: unknown): v is TextureMode =>
    typeof v === "string" && (voiceTextures as readonly string[]).includes(v);
  let voiceTexture: TextureMode = "full";

  /** Playback voice. See src/lib/instruments.ts for why the list is short. */
  let instrumentProgram: number = DEFAULT_INSTRUMENT;

  /** Solfège syllables under each staff. Off by default - a teaching aid, opted into. */
  let showSolfege = false;
  /**
   * The master switch for everything printed alongside the notes.
   *
   * Turning it off re-writes the same exercise without syllables or chord
   * symbols - the clean copy to hand out - and leaves `showSolfege` untouched,
   * so turning it back on restores what was there.
   */
  let annotationsShown = true;

  /**
   * Re-writes the current exercise with different annotations.
   *
   * Held from the last generation so a display toggle costs a re-render rather
   * than a new exercise; null until something has been generated.
   */
  let renderCurrent: ((display: any) => string) | null = null;

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
  let cursorMode: CursorMode = "smooth";
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
  function withInversions(names: Iterable<string>): Set<string> {
    const set = new Set(names);
    for (const name of isMinorKey(selectedKey) ? minorInversions : majorInversions) {
      set.add(name);
    }
    return set;
  }

  let userAllowedChords: Set<string> = new Set(majorChordNames);

  const majorChordGroups: Record<string, string[]> = {
    Diatonic: ['1','2','3','4','5','5-7','6','7'],
    'Chromatic Chords': ['5/5','5/6','5/2','m4','1-7'],
    // The chromatic-bass inversions. These are the only way the raised note
    // reaches the bass deliberately, with its approach and resolution enforced,
    // so they belong in front of the user rather than buried in the chord set.
    'Chromatic Bass': ['5/5-6','5/6-6','5/2-6'],
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
    maxSkip: 4, nctProbability: 0.1,
    voiceTexture: 'full',
    rhythmNames: ['quarter', 'half', 'dotHalf'],
  };

  $: setupDirty = selectedVoicing !== DEFAULTS.voicing ||
    [...selectedKeys].sort().join(",") !== DEFAULTS.key ||
    selectedTimeSignature !== DEFAULTS.timeSig || measures !== DEFAULTS.measures ||
    voiceTexture !== DEFAULTS.voiceTexture;
  $: rhythmDirty = JSON.stringify(selectedRhythms.map(r => r.name).sort()) !==
    JSON.stringify([...DEFAULTS.rhythmNames].sort()) ||
    Object.keys(rhythmBias).length > 0;
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
  /** No exercise yet and nothing being written - show the shape of a score. */
  $: showScorePlaceholder = !renderedTune && !isGenerating;

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
      // Gives every staff an abcjs-l<line> / abcjs-v<voice> class, which is how
      // the cursor works out how tall a system is. Without it the SVG carries
      // no staff groups at all and the cursor can only cover one voice.
      add_classes: true,
      responsive: "resize",
      staffwidth,
      wrap: { minSpacing: 1.2, maxSpacing: 2.7, preferredMeasuresPerLine: measuresPerLine },
    });
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

  function buildAudioParams() {
    return {
      drum: drumBeats[selectedTimeSignature] ?? '',
      drumBars: 1,
      drumIntro: 1,
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
    };
  }

  // ── URL persistence ────────────────────────────────────────────────────────
  function loadParams() {
    const p = new URLSearchParams(window.location.search);
    selectedVoicing = p.get("voices") || "4 Part Mixed";
    const keyParam = p.get("key") || "C";
    const keyList = keyParam.split(",").map((k) => k.trim()).filter(Boolean);
    selectedKeys = new Set(keyList.length ? keyList : ["C"]);
    selectedKey = keyList[0] ?? "C";
    measures = parseInt(p.get("measures") || "8");
    bpm = parseInt(p.get("bpm") || "60");
    const cursor = p.get("cursor");
    if (isCursorMode(cursor)) cursorMode = cursor;
    const instrument = p.get("sound");
    if (isInstrumentProgram(instrument)) instrumentProgram = Number(instrument);
    // A shared link carries the annotation state - the whole point of the clean
    // copy is being able to send it.
    showSolfege = p.get("solfege") === "1";
    annotationsShown = p.get("annot") !== "0";
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
    const preset = p.get("preset");
    if (preset && builtinPresets[preset]) applyDifficultyPreset(preset);
  }

  function updateURLParams() {
    const p = new URLSearchParams();
    p.set("key", [...selectedKeys].join(","));
    p.set("timeSig", selectedTimeSignature);
    p.set("voicing", selectedVoicing);
    p.set("measures", measures.toString());
    p.set("bpm", bpm.toString());
    p.set("cursor", cursorMode);
    p.set("sound", String(instrumentProgram));
    p.set("solfege", showSolfege ? "1" : "0");
    p.set("annot", annotationsShown ? "1" : "0");
    p.set("texture", voiceTexture);
    const biasPairs = Object.entries(rhythmBias);
    if (biasPairs.length) {
      p.set("bias", biasPairs.map(([n, v]) => `${n}:${v}`).join(","));
    } else {
      p.delete("bias");
    }
    window.history.replaceState({}, "", `?${p.toString()}`);
  }

  onMount(() => {
    // Astro 4 leaves a `client:only` fallback in the DOM after the island
    // hydrates - it is not swapped out - so the skeleton would sit on top of the
    // real UI forever. Take it down as soon as there is something to replace it.
    document.querySelectorAll("[data-skeleton]").forEach((el) => el.remove());
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

  // What the active UIL level allows, or null when no level is active. Used to
  // dim options rather than remove them - the point of the change is that
  // nothing disappears, so a reader can still see the whole vocabulary and step
  // outside the level deliberately.
  $: activePreset = activeUILLevel ? uilPresets[activeUILLevel] : null;
  $: presetKeys = activePreset ? new Set(activePreset.allowedKeys) : null;
  $: presetVoicings = activePreset?.allowedVoicings?.length
    ? new Set(activePreset.allowedVoicings)
    : null;
  $: presetRhythmNames = activePreset ? new Set(activePreset.allowedRhythmNames) : null;
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

  function applyUILPreset(levelKey: string) {
    const p = uilPresets[levelKey];
    if (!p) return;
    activeUILLevel = levelKey;
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
      selectedVoicing = p.allowedVoicings[0];
    }
    // Every preset starts at 8 measures. The levels declare 24-56, but that is
    // the length of a real UIL sight-reading example, not what you want when
    // you press Generate to drill a phrase - and the form rules that would make
    // a 24+ measure exercise hold together do not exist yet.
    measures = 8;
    // Rests are offered but not switched on. Every UIL level lists
    // wholeRest/halfRest/quarterRest, and having them all selected sprays rests
    // through the middle of phrases, where in a sung exercise they are not
    // material - they are punctuation. They stay in the picker, dimmed rather
    // than removed, for anyone who wants them.
    //
    // The one rest that matters is not lost by this: the quarter that completes
    // an interior phrase ending is structural and comes from the catalogue, not
    // from this selection. See interiorCadenceFigure in rhythm-generation.
    selectedRhythms = allRhythms.filter(
      (r) =>
        p.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest
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
    selectedKeys = new Set(p.keys?.length ? p.keys : [p.key]);
    selectedTimeSignature = p.timeSig;
    selectedVoicing = p.voicing;
    measures = p.measures;
    maxSkip = p.maxSkip;
    bpm = p.bpm;
    selectedRhythms = allRhythms.filter((r) => p.selectedRhythmNames.includes(r.name));
    userAllowedChords = withInversions(p.allowedChordNames ?? allChordNames);
    nctProbability = p.nctProbability;
    // Optional, so presets saved before voice texture existed still load.
    if (isVoiceTextureMode(p.voiceTexture)) voiceTexture = p.voiceTexture;
    rhythmBias = p.rhythmBias ? { ...p.rhythmBias } : {};
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
      keys: [...selectedKeys],
      timeSig: selectedTimeSignature,
      voicing: selectedVoicing,
      measures,
      maxSkip,
      bpm,
      selectedRhythmNames: selectedRhythms.map((r) => r.name),
      allowedChordNames: userAllowedChords.size < allChordNames.length ? Array.from(userAllowedChords) : undefined,
      nctProbability,
      voiceTexture,
      rhythmBias,
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

  async function handlePlay() {
    if (!synthControl) return;
    if (!(await ensureAudioRunning())) return;
    await synthControl.play();
    isPlaying = true;
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

  /** What the assembler should print, given the two controls. */
  function displayOptions() {
    return {
      chordSymbols: annotationsShown,
      solfege: annotationsShown && showSolfege,
      midiProgram: instrumentProgram,
    };
  }

  /** Re-write the score with the current annotation settings. */
  async function reRenderAnnotations() {
    updateURLParams();
    if (!renderCurrent) return;
    renderedString = renderCurrent(displayOptions());
    await applyRenderedString();
  }

  async function handleToggleSolfege() {
    showSolfege = !showSolfege;
    await reRenderAnnotations();
  }

  async function handleToggleAnnotations() {
    annotationsShown = !annotationsShown;
    await reRenderAnnotations();
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

  async function handleClick() {
    if (isGenerating) return; // ignore a second click while working
    updateURLParams();

    const validRhythms = selectedRhythms.filter((r): r is Rhythm => r !== undefined);
    if (validRhythms.length === 0) {
      alert("Please select at least one rhythm.");
      return;
    }
    if (!rhythmsCanFill) {
      alert(
        `These rhythms cannot fill a bar of ${selectedTimeSignature}. ` +
          `Add a shorter note - a quarter or an eighth - or change the time signature.`
      );
      return;
    }

    // Draw the key for this exercise. With one key selected this is that key, so
    // nothing changes for the ordinary case.
    const keyPool = [...selectedKeys];
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
      voiceTexture,
      rhythmBias,
      chromaticFrequency,
      midiProgram: instrumentProgram,
      display: displayOptions(),
      // Two-part writing at the beginner levels opens in unison and splits.
      // Level-driven rather than a control: it is what the level *is*, not a
      // preference, and it only ever applies to a two-voice texture.
      unisonProbability: unisonProbabilityFor(activeUILLevel ?? undefined),
      // The consequent phrase opens with the antecedent's material and departs
      // at the cadence - a parallel period. Level-driven for the same reason as
      // unison: repetition is what the beginner repertoire is made of, and it
      // thins as the writing is meant to become continuous.
      rhymeProbability: rhymeProbabilityFor(activeUILLevel ?? undefined),
      allowedChordNames:
        effectiveChordNames.length < drawnModeChordNames.length
          ? effectiveChordNames
          : undefined,
    };

    isGenerating = true;
    await tick();
    await painted();

    try {
      const {
        abcString,
        chordProgression: generatedProgression,
        render,
      } = generateChoralExercise(params);
      renderedString = abcString;
      chordProgression = generatedProgression as Chord[];
      // Kept so the annotation toggles can re-write this exercise instead of
      // replacing it.
      renderCurrent = render;

      const tune = await renderTune();
      if (!tune || tune.length === 0) throw new Error("Failed to render ABC notation.");
      tune[0].setTiming();
      renderedTune = tune[0];
      createPlaybackCursor();
      systemExtents = []; // re-measured lazily once layout has settled
      cursorBeats = newMetronomeBeatState();

      await initSynth(renderedTune);
      generatedBpm = bpm;
    } catch (error: unknown) {
      console.error("Error generating exercise:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      isGenerating = false;
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
          class="ml-auto mr-2 my-1.5 shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-lg px-4 py-2 text-sm"
          on:click={handleClick}
          disabled={isGenerating}
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
                    class="px-3 py-2 sm:py-1 rounded text-sm {selectedVoicing === voicing ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'} {outside(presetVoicings, voicing) && selectedVoicing !== voicing ? 'opacity-40' : ''}"
                    title={outside(presetVoicings, voicing) ? `Outside ${activePreset?.label ?? 'this level'}` : undefined}
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
                    class="px-3 py-2 sm:py-1 rounded text-sm {selectedKeys.has(key) ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'} {outside(presetKeys, key) && !selectedKeys.has(key) ? 'opacity-40' : ''}"
                    title={outside(presetKeys, key) ? `Outside ${activePreset?.label ?? 'this level'}` : undefined}
                    on:click={() => {
                      const next = new Set(selectedKeys);
                      if (next.has(key) && next.size > 1) {
                        next.delete(key);
                        selectedKeys = next;
                        // Keep the displayed key inside the pool.
                        if (selectedKey === key) selectedKey = [...next][0];
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
              {#if selectedKeys.size > 1}
                <p class="text-xs text-slate-400">
                  {selectedKeys.size} keys selected — one is drawn at random each
                  time you generate. Click a key to remove it.
                </p>
              {/if}
              {#if activePreset}
                <p class="text-xs text-slate-400">
                  Dimmed keys are outside {activePreset.label}, not removed — pick
                  one and you simply leave the level.
                </p>
              {/if}
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

            <div class="space-y-2 sm:col-span-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Voice texture</p>
              <div class="flex flex-wrap gap-2">
                {#each voiceTextures as mode}
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {voiceTexture === mode ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (voiceTexture = mode)}
                    aria-pressed={voiceTexture === mode}
                  >{voiceTextureLabels[mode]}</button>
                {/each}
              </div>
              <p class="text-xs text-slate-400">
                {voiceTexture === "full"
                  ? "Every part sings throughout, apart from rests in the rhythm."
                  : voiceTexture === "staggered"
                    ? measures < 8
                      ? "Parts enter one at a time, lowest first — needs 8 measures or more."
                      : "Parts enter one at a time, lowest first."
                    : measures < 12
                      ? "Entrances, plus parts dropping out — tacet passages need 12 measures or more."
                      : "Entrances, plus parts dropping out for a few measures at a time."}
              </p>
            </div>

            <div class="space-y-2 sm:col-span-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Playback sound</p>
              <div class="flex flex-wrap gap-2">
                {#each INSTRUMENTS as instrument}
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {instrumentProgram === instrument.program ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => handleInstrumentChange(instrument.program)}
                    aria-pressed={instrumentProgram === instrument.program}
                  >{instrument.label}</button>
                {/each}
              </div>
              <p class="text-xs text-slate-400">
                Changes the sound straight away — the exercise stays as it is.
              </p>
            </div>

            <div class="space-y-2 sm:col-span-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Annotations</p>
              <div class="flex flex-wrap gap-2">
                <button
                  class="px-3 py-2 sm:py-1 rounded text-sm {showSolfege ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                  on:click={handleToggleSolfege}
                  aria-pressed={showSolfege}
                >Solfège</button>
                <button
                  class="px-3 py-2 sm:py-1 rounded text-sm {annotationsShown ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                  on:click={handleToggleAnnotations}
                  aria-pressed={annotationsShown}
                >{annotationsShown ? 'Shown' : 'Hidden'}</button>
              </div>
              <p class="text-xs text-slate-400">
                {annotationsShown
                  ? (showSolfege
                      ? "Chord symbols above the top staff, solfège under each part."
                      : "Chord symbols above the top staff.")
                  : "Hidden — the same exercise, printed clean for sight-reading."}
              </p>
            </div>

            <div class="space-y-2 sm:col-span-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Cursor</p>
              <div class="flex flex-wrap gap-2">
                {#each cursorModes as mode}
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {cursorMode === mode ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (cursorMode = mode)}
                    aria-pressed={cursorMode === mode}
                  >{cursorModeLabels[mode]}</button>
                {/each}
              </div>
              <p class="text-xs text-slate-400">
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

        <!-- Rhythm Tab -->
        {:else if selectedTab === 'rhythm'}
          <div class="space-y-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Select Allowed Rhythms</p>
            <div class="flex flex-wrap gap-2">
              {#each Object.values(filterRhythms) as rhythm}
                <button
                  class="px-1 py-1 w-12 h-12 flex items-center justify-center rounded relative
                    {selectedRhythms.some((r) => r?.name === rhythm.name)
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 hover:bg-slate-200'}
                    {outside(presetRhythmNames, rhythm.name) && !selectedRhythms.some((r) => r?.name === rhythm.name) ? 'opacity-40' : ''}
                    {unusableRhythmNames.has(rhythm.name) ? 'ring-2 ring-amber-400' : ''}"
                  title={unusableRhythmNames.has(rhythm.name)
                    ? `Selected, but cannot appear in ${selectedTimeSignature}`
                    : outside(presetRhythmNames, rhythm.name)
                      ? `Outside ${activePreset?.label ?? 'this level'}`
                      : undefined}
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
            {#if selectedRhythms.length > 0}
              <div class="space-y-2 pt-1">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  How often
                </p>
                <div class="space-y-1.5">
                  {#each selectedRhythms.filter((r) => r) as rhythm}
                    <div class="flex items-center gap-3">
                      <span class="rhythm-icon-sm w-8 h-8 shrink-0 flex items-center justify-center">
                        {#await rhythmSvgs[rhythm.name] then svg}
                          {@html svg.default}
                        {:catch}
                          <span class="text-[10px]">{rhythm.name}</span>
                        {/await}
                      </span>
                      <div class="flex flex-wrap gap-1">
                        {#each rhythmFrequencies as freq}
                          <button
                            class="px-2 py-1 rounded text-xs {frequencyOf(rhythmBias, rhythm.name) === freq.value
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}"
                            on:click={() => setFrequency(rhythm.name, freq.value)}
                            aria-pressed={frequencyOf(rhythmBias, rhythm.name) === freq.value}
                          >{freq.label}</button>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
                <p class="text-xs text-slate-400">
                  Sixteenths are kept rare on purpose — a sung exercise lives on
                  quarters and halves. Turn one up here if you want to drill it.
                </p>
              </div>
            {/if}
            {#if unusableRhythmNames.size > 0}
              <p class="text-xs text-amber-600">
                Ringed in amber: selected, but cannot appear in {selectedTimeSignature}.
                A rhythm has to be at least a quarter note and fit inside one measure.
              </p>
            {/if}
            {#if activePreset}
              <p class="text-xs text-slate-400">
                Dimmed rhythms are outside {activePreset.label}. They are still
                available — picking one just takes you off the level.
              </p>
            {/if}
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
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}
                          {outside(presetChordNames, chordName) && !userAllowedChords.has(chordName) ? 'opacity-40' : ''}"
                        title={outside(presetChordNames, chordName) ? `Outside ${activePreset?.label ?? 'this level'}` : undefined}
                        on:click={() => {
                          const next = withInversions(userAllowedChords);
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

    {#if !rhythmsCanFill}
      <p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 my-2">
        The selected rhythms cannot fill a bar of {selectedTimeSignature}, so nothing
        can be generated. Add a shorter note — a quarter or an eighth — or change
        the time signature.
      </p>
    {/if}

    {#if audioNotice}
      <p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 my-2">
        {audioNotice}
      </p>
    {/if}

    <!-- Sheet music -->
    <div class="relative w-full" class:min-h-40={isGenerating}>
      <!-- Kept in the DOM even while hidden: renderAbc finds it by id, and it
           is un-hidden before renderTune measures its width. -->
      <div
        id="paper"
        class="bg-white rounded-lg shadow-md w-full my-2"
        class:hidden={showScorePlaceholder}
      ></div>

      <!-- Before the first exercise exists, #paper is an empty white card that
           reads as something failing to load. Show the shape of a score instead.
           A sibling rather than a child, because renderAbc empties #paper. -->
      {#if showScorePlaceholder}
        <div
          class="bg-white rounded-lg shadow-md w-full my-2 p-6 flex flex-col gap-5"
          aria-hidden="true"
        >
          {#each voiceNames as _}
            <div class="skel-staff">
              {#each [0, 1, 2, 3, 4] as _line}
                <div class="skel-staff-line"></div>
              {/each}
            </div>
          {/each}
          <p class="text-center text-sm text-slate-400">
            Press Generate to write an exercise.
          </p>
        </div>
      {/if}

      {#if isGenerating}
        <div class="generating-overlay" aria-live="polite">
          <div class="generating-inner">
            <div class="generating-spinner" aria-hidden="true"></div>
            <p class="text-sm font-medium text-slate-500">Writing the exercise…</p>
          </div>
        </div>
      {/if}
    </div>

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
    onGenerate={handleClick}
    onToggleLoop={handleToggleLoop}
    onToggleMute={handleToggleMute}
    onShare={handleShare}
    onPrint={handlePrint}
  />
</div>

<style>
  /* The little rhythm glyphs beside the frequency buttons. */
  .rhythm-icon-sm :global(svg) {
    width: 100%;
    height: 100%;
    object-fit: contain;
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

  :global(.rhythm-icon svg) {
    width: 100%;
    height: 100%;
  }
</style>
