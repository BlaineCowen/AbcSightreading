<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import abcjs from "abcjs";
  import type { TimingCallbacks } from "abcjs";
  import RangeSelector from "./ui/rangeSelector.svelte";
  import { rhythms, type Rhythm } from "../resources/rhythms";
  import * as Tone from "tone";
  import MetronomeIcon from "./ui/metronomeIcon.svelte";
  import { Piano, Minus, Plus, RefreshCw } from "lucide-svelte";
  import PlaybackBar from "./PlaybackBar.svelte";
  import "abcjs/abcjs-audio.css";
  // import PitchVisualizer from "./PitchVisualizer.svelte";

  // --- Static Options ---
  const possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
  const timeSignatures = {
    "4/4": { name: "4/4", tsPerMeasure: 32, beamGroupSize: 8 },
    "3/4": { name: "3/4", tsPerMeasure: 24, beamGroupSize: 8 },
    "2/4": { name: "2/4", tsPerMeasure: 16, beamGroupSize: 8 },
  };
  const clefOptions = ["treble", "bass", "alto", "tenor"];
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
    if (typeof window !== "undefined") {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      gainNode = audioContext.createGain();
      gainNode.gain.value = masterVolume * 0.7;
      gainNode.connect(audioContext.destination);

      metronomeGainNode = audioContext.createGain();
      metronomeGainNode.gain.value = metronomeVolume * 2;
      metronomeGainNode.connect(audioContext.destination);

      toneSynth.connect(gainNode);
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

    const b = parseInt(getParam("bpm") || "", 10);
    if (!isNaN(b) && b >= 30 && b <= 120) {
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
    if (urlParams.has("rhythmOnly"))
      options.rhythmOnly = getParam("rhythmOnly") === "true";

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
   * Plays a single note using the Tone.js synth
   * @param {string} noteName - The name of the note (e.g., "f", "G", "c'")
   */
  const playNote = async (noteName: string) => {
    await Tone.start();

    // Convert ABC notation to Tone.js notation
    // ABC: C is middle C (C4), c is C5, c' is C6, C, is C3
    let octave = 4; // Default to middle C octave
    let note = noteName;

    // Handle commas (lower octave)
    while (note.endsWith(",")) {
      octave--;
      note = note.slice(0, -1);
    }

    // Handle apostrophes (raise octave)
    while (note.includes("'")) {
      octave++;
      note = note.replace("'", "");
    }

    // If lowercase, raise octave by 1 (since lowercase means one octave above in ABC)
    if (note === note.toLowerCase()) {
      octave++;
    }

    // Convert to uppercase for Tone.js
    note = note.toUpperCase();

    // Handle accidentals
    note = note.replace("^", "#").replace("_", "b");

    toneSynth.triggerAttackRelease(`${note}${octave}`, "8n");
  };

  const SELECTABLE_RESTS = new Set([
    "eighthRestEighth",
    "quarterRest",
    "halfRest",
    "wholeRest",
  ]);

  let filterRhythms = rhythms.filter((rhythm) => {
    if (rhythm.name.includes("thirtySecond")) return false;
    if (rhythm.name === "dotQuarter") return false;
    if (rhythm.rest) return SELECTABLE_RESTS.has(rhythm.name);
    return true;
  });

  const rhythmSvgs = Object.fromEntries(
    rhythms
      .filter(
        (rhythm) =>
          !rhythm.name.includes("thirtySecond") &&
          rhythm.name !== "dotQuarter" &&
          (!rhythm.rest || SELECTABLE_RESTS.has(rhythm.name))
      )
      .map((rhythm) => [
        rhythm.name,
        import(`../assets/svgs/${rhythm.name}.svg?raw`),
      ])
  );

  /**
   * Returns the initial state for the sight reading options, either from localStorage or defaults
   * @returns {Object} The initial state configuration
   */
  function getInitialState() {
    if (typeof window !== "undefined") {
      const urlOptions = loadStateFromUrl();
      if (urlOptions) {
        console.log("loading from url");
        return {
          selectedClef: urlOptions.selectedClef || "treble",
          selectedRange: urlOptions.selectedRange || { min: 17, max: 21 },
          selectedScaleDegrees: new Set<number>(
            urlOptions.selectedScaleDegrees || [1, 3, 5]
          ),
          selectedSharpDegrees: new Set(urlOptions.selectedSharpDegrees || []),
          selectedFlatDegrees: new Set(urlOptions.selectedFlatDegrees || []),
          selectedKey: urlOptions.selectedKey || "F",
          selectedRhythms: (urlOptions.selectedRhythms || [])
            .map((name: string) => rhythms.find((r) => r.name === name))
            .filter(Boolean) || [
            rhythms.find((r) => r.name === "eighthEighth"),
            rhythms.find((r) => r.name === "quarter"),
          ],
          selectedTimeSignature: urlOptions.selectedTimeSignature || "4/4",
          measures: urlOptions.measures || 8,
          maxSkip: urlOptions.maxSkip || 4,
          bpm: urlOptions.bpm || 60,
          moveEighthNotes: urlOptions.moveEighthNotes || false,
          accidentalsFollowStep: urlOptions.accidentalsFollowStep || true,
          showSolfege: urlOptions.showSolfege || false,
          rhythmOnly: urlOptions.rhythmOnly || false,
        };
      }
    }
    // Try to load from localStorage first
    const saved = localStorage.getItem("sightReadingOptions");
    if (saved) {
      try {
        const options = JSON.parse(saved);
        // Handle backward compatibility for selectedTimeSignature
        let ts = "4/4";
        if (options.selectedTimeSignature) {
          if (typeof options.selectedTimeSignature === "object") {
            ts = options.selectedTimeSignature.name || "4/4";
          } else {
            ts = options.selectedTimeSignature;
          }
        }

        return {
          selectedClef: options.selectedClef || "treble",
          selectedRange: options.selectedRange || { min: 17, max: 21 },
          selectedScaleDegrees: new Set<number>(
            options.selectedScaleDegrees || [1, 3, 5]
          ),
          selectedSharpDegrees: new Set(options.selectedSharpDegrees || []),
          selectedFlatDegrees: new Set(options.selectedFlatDegrees || []),
          selectedKey: options.selectedKey || "F",
          selectedRhythms: (options.selectedRhythms || [])
            .map((name: string) => rhythms.find((r) => r.name === name))
            .filter(Boolean) || [
            rhythms.find((r) => r.name === "eighthEighth"),
            rhythms.find((r) => r.name === "quarter"),
          ],
          selectedTimeSignature: ts,
          measures: options.measures || 8,
          maxSkip: options.maxSkip || 4,
          bpm: options.bpm || 60,
          moveEighthNotes: options.moveEighthNotes || false,
          accidentalsFollowStep: options.accidentalsFollowStep || true,
          showSolfege: options.showSolfege || false,
          rhythmOnly: options.rhythmOnly || false,
        };
      } catch (e) {
        console.error("Error loading saved options:", e);
      }
    }
    // Return defaults if no saved state or error
    return {
      selectedClef: "treble",
      selectedRange: { min: 17, max: 21 },
      selectedScaleDegrees: new Set<number>([1, 3, 5]),
      selectedSharpDegrees: new Set(),
      selectedFlatDegrees: new Set(),
      selectedKey: "F",
      selectedRhythms: [
        rhythms.find((r) => r.name === "eighthEighth"),
        rhythms.find((r) => r.name === "quarter"),
      ],
      selectedTimeSignature: "4/4",
      measures: 8,
      maxSkip: 4,
      bpm: 60,
      moveEighthNotes: false,
      accidentalsFollowStep: false,
      showSolfege: false,
      rhythmOnly: false,
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
  let showSolfege = initialState.showSolfege || false;
  let rhythmOnly = initialState.rhythmOnly || false;

  let renderedString: any;
  let originalTuneString: string | null = null; // Store the original tune string for rerendering
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
          selectedRange = { min: 10, max: 15 }; // C4 to C5
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
    maxSkip: 4, scaleDegrees: [1, 3, 5], range: { min: 17, max: 21 },
    rhythmNames: ['eighthEighth', 'quarter'],
  };
  $: setupDirty = selectedKey !== DEFAULTS.key || selectedClef !== DEFAULTS.clef ||
    selectedTimeSignature !== DEFAULTS.timeSig || measures !== DEFAULTS.measures;
  $: rhythmDirty = JSON.stringify(selectedRhythms.map((r: Rhythm) => r.name).sort()) !==
    JSON.stringify([...DEFAULTS.rhythmNames].sort());
  $: notesDirty = maxSkip !== DEFAULTS.maxSkip ||
    JSON.stringify(Array.from(selectedScaleDegrees).sort()) !== JSON.stringify([...DEFAULTS.scaleDegrees].sort()) ||
    selectedSharpDegrees.size > 0 || selectedFlatDegrees.size > 0 ||
    accidentalsFollowStep !== false || moveEighthNotes !== false || showSolfege !== false;
  $: rangeDirty = selectedRange.min !== DEFAULTS.range.min || selectedRange.max !== DEFAULTS.range.max;

  // Notes and Range only mean something when there are pitches to control.
  $: visibleTabs = (rhythmOnly ? ['setup', 'rhythm'] : ['setup', 'rhythm', 'notes', 'range']) as Tab[];
  $: if (!visibleTabs.includes(selectedTab)) selectedTab = 'setup';

  const STORAGE_KEY = "sightReadingOptions";

  // Save options whenever they change
  $: {
    const options = {
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
      rhythmOnly,
    };
    try {
      console.log("Saving options:", options);
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
    params.set("rhythms", selectedRhythms.map((r: Rhythm) => r.name).join(","));
    params.set("timeSignature", selectedTimeSignature);
    params.set("measures", measures.toString());
    params.set("maxSkip", maxSkip.toString());
    params.set("bpm", bpm.toString());
    params.set("moveEighthNotes", moveEighthNotes.toString());
    params.set("accidentalsFollowStep", accidentalsFollowStep.toString());
    params.set("showSolfege", showSolfege.toString());
    params.set("rhythmOnly", rhythmOnly.toString());

    const newUrl = `${window.location.pathname}?${params.toString()}`;
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
        soundFontVolumeMultiplier: rhythmOnly ? 4.0 : 3.0,
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
        preferredMeasuresPerLine: isNarrow() ? 2 : 4,
        minSpacing: 1.5,
        maxSpacing: 5,
      },
      clickListener: async (event: any) => {
        // Every note on the rhythm staff is the same placeholder pitch, so
        // playing it back would be meaningless.
        if (rhythmOnly) return;
        if (event.pitches && event.pitches.length > 0) {
          await playNote(event.pitches[0].name);
        }
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
  async function attachCursorAndTiming() {
    // Wait for the SVG to land in the DOM before attaching cursors to it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    playbackCursor = createSvgCursor("abcjs-cursor");
    pitchCursor = createSvgCursor("abcjs-pitch-cursor");
    updatePitchCursor(0); // Static indicator on the first note

    if (timingCallbacks) {
      timingCallbacks.stop();
      timingCallbacks = null;
    }

    const beatsPerMeasure = parseInt(selectedTimeSignature[0]);

    timingCallbacks = new abcjs.TimingCallbacks(currentTune, {
      beatCallback: (beatNumber, totalBeats, _totalTime, position) => {
        if (isMetronomeOn) {
          // Play a click sound on each beat
          const beatInMeasure = beatNumber % beatsPerMeasure;
          playMetronomeClick(beatInMeasure === 0);
        }
        if (!playbackCursor) return;
        if (beatNumber >= totalBeats) {
          hidePlaybackCursor();
          return;
        }
        // position.left is undefined during the count-in measure.
        if (position && typeof position.left === "number") {
          const x = Math.max(0, position.left - 2);
          const cursorHeight = position.height;
          const shortenBy = cursorHeight * 0.15;
          const startY = position.top + shortenBy;
          const endY = position.top + position.height + cursorHeight * 0.15;

          playbackCursor.setAttribute("x1", x.toString());
          playbackCursor.setAttribute("x2", x.toString());
          playbackCursor.setAttribute("y1", startY.toString());
          playbackCursor.setAttribute("y2", endY.toString());
        }
      },
      lineEndCallback: (data: any, _ev: any, info: any) => {
        // Auto-scroll to keep the next line in view.
        // Line 0 is handled up front by scrollToFirstSystem() when playback
        // starts, so that move happens across the count-in instead of landing
        // 500ms before the first note (lineEndAnticipation) as a sudden jump.
        if (info?.line === 0) return;

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
      const updatedTuneString = updateTempoInAbcString(
        originalTuneString,
        tempo
      );

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
      renderedString[0],
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
  function scrollToFirstSystem() {
    const firstStaff = document
      .getElementById("paper")
      ?.querySelector(".abcjs-staff");
    if (!firstStaff) return;
    const top = firstStaff.getBoundingClientRect().top + window.scrollY;
    const target = Math.max(0, top - window.innerHeight * 0.1);
    // A tiny nudge reads as a glitch; only move if it is genuinely elsewhere.
    if (Math.abs(target - window.scrollY) < 24) return;
    window.scrollTo({ top: target, behavior: "smooth" });
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
   */
  function scheduleAudioFrom(timelinePos: number): boolean {
    if (!audioBuffer) return false;

    const countIn = getCountInDuration();
    const node = audioContext.createBufferSource();
    node.buffer = audioBuffer;
    node.connect(gainNode);
    node.onended = () => {
      // Ignore nodes we already replaced or stopped by hand.
      if (node !== sourceNode) return;
      if (isPlaying) stopMusic();
    };
    sourceNode = node;

    startTime = audioContext.currentTime - timelinePos;
    if (timelinePos < countIn) {
      // Still inside the count-in: schedule the music for when it ends.
      node.start(startTime + countIn, 0);
    } else {
      // Past the count-in: the buffer offset is the timeline position minus it.
      node.start(audioContext.currentTime, timelinePos - countIn);
    }
    return true;
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

    // Never start the cursor and metronome without the instrument audio - that
    // is what produced a click-only playthrough.
    if (!scheduleAudioFrom(resumeFrom)) {
      console.warn("No audio buffer to schedule; not starting playback.");
      return;
    }
    pausedAt = 0;
    isPlaying = true;

    // Settle the page during the count-in, not on the downbeat.
    if (resumeFrom === 0) scrollToFirstSystem();

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
  async function handleClick() {
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
        showSolfege: rhythmOnly ? false : showSolfege,
        rhythmOnly: rhythmOnly,
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
        selectedRange = { min: 15, max: 21 };
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
    if (gainNode) {
      gainNode.gain.value = masterVolume * 0.7;
    }
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
    if (gainNode) {
      gainNode.gain.value = masterVolume * 0.7;
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
   */
  function toggleDrone() {
    if (!dronePlaying) {
      Tone.start();
      const rootNote = getRootNoteFrequency(selectedKey);
      droneOscillator = new Tone.Oscillator({
        frequency: rootNote,
        type: "sine",
      })
        .connect(droneVolume)
        .start();
    } else {
      droneOscillator?.stop();
      droneOscillator = null;
    }
    dronePlaying = !dronePlaying;
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
  function handleShare() {
    updateUrlFromState();
    navigator.clipboard.writeText(window.location.href).then(() => alert('Link copied to clipboard!'));
  }
  function handlePrint() { window.print(); }

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

  onMount(() => {
    const paper = document.getElementById("paper");
    if (paper && typeof ResizeObserver !== "undefined") {
      lastRenderWidth = paper.clientWidth;
      paperObserver = new ResizeObserver(onPaperResize);
      paperObserver.observe(paper);
    }
    // Belt and braces for browsers that coalesce the observer on rotation.
    window.addEventListener("orientationchange", onPaperResize);
  });

  onDestroy(() => {
    paperObserver?.disconnect();
    window.removeEventListener("orientationchange", onPaperResize);
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

<div class="w-full" style="padding-bottom: calc(var(--bottom-bar-h, 96px) + 1rem)">
  <main class="flex flex-col items-center w-full">

    <!-- Tab panel -->
    <div class="w-full max-w-4xl mx-auto px-2 md:px-4">
      <div class="tab-panel w-full bg-white shadow-md rounded-lg my-4">

        <!-- Tab bar -->
        <div class="flex items-stretch border-b border-slate-200">
          <div class="flex items-center overflow-x-auto tab-scroll">
          {#each visibleTabs as tab}
            <button
              type="button"
              class="px-4 py-3 sm:py-2 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap
                {selectedTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'}"
              on:click={() => (selectedTab = tab)}
            >
              {({'setup':'Setup','rhythm':'Rhythm','notes':'Notes','range':'Range'})[tab] ?? tab}
              {#if (tab === 'setup' && setupDirty) || (tab === 'rhythm' && rhythmDirty) || (tab === 'notes' && notesDirty) || (tab === 'range' && rangeDirty)}
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 mb-0.5 align-middle"></span>
              {/if}
            </button>
          {/each}
          </div>

          <!-- Generate button always visible in tab bar -->
          <button
            class="ml-auto mr-2 my-1.5 shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Mode</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {!rhythmOnly ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (rhythmOnly = false)}
                  >Pitched</button>
                  <button
                    class="px-3 py-2 sm:py-1 rounded text-sm {rhythmOnly ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                    on:click={() => (rhythmOnly = true)}
                  >Rhythm only</button>
                </div>
              </div>

              {#if !rhythmOnly}
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
                  <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Clef</p>
                  <div class="flex flex-wrap gap-2">
                    {#each clefOptions as clef}
                      <button
                        class="px-3 py-2 sm:py-1 rounded text-sm {selectedClef === clef ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                        on:click={() => updateClef(clef)}
                      >{clef}</button>
                    {/each}
                  </div>
                </div>
              {/if}

              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Time Signature</p>
                <div class="flex flex-wrap gap-2">
                  {#each Object.keys(timeSignatures) as ts}
                    <button
                      class="px-3 py-2 sm:py-1 rounded text-sm {selectedTimeSignature === ts ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                      on:click={() => { selectedTimeSignature = ts; metronomeBeat = 0; }}
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

          <!-- Notes Tab -->
          {:else if selectedTab === 'notes'}
            <div class="space-y-5">
              <!-- Scale Degrees -->
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Scale Degrees</p>
                <div class="flex flex-wrap gap-2">
                  {#each sharpScaleDegrees as degree}
                    <button
                      class="px-2 py-2 sm:py-1 rounded text-sm
                        {selectedSharpDegrees.has(degree.value) ? 'bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}
                        {degree.value === 1 ? 'sm:ml-5' : degree.value === 4 ? 'sm:ml-10' : ''}"
                      on:click={() => toggleSharpDegree(degree.value)}
                    >{degree.display}</button>
                  {/each}
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each scaleDegrees as degree}
                    <button
                      class="px-3 py-2 sm:py-1 rounded text-sm {selectedScaleDegrees.has(degree) ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                      on:click={() => toggleScaleDegree(degree)}
                    >{degree}</button>
                  {/each}
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each flatScaleDegrees as degree}
                    <button
                      class="px-2 py-2 sm:py-1 rounded text-sm
                        {selectedFlatDegrees.has(degree.value) ? 'bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}
                        {degree.value === 2 ? 'sm:ml-5' : degree.value === 5 ? 'sm:ml-10' : ''}"
                      on:click={() => toggleFlatDegree(degree.value)}
                    >{degree.display}</button>
                  {/each}
                </div>
              </div>

              <!-- Max Skip -->
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Max Melodic Skip</p>
                <div class="flex flex-wrap items-center gap-3">
                  <button type="button" class="flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 bg-slate-100 rounded hover:bg-slate-200"
                    aria-label="Decrease max skip"
                    on:click={() => { if (maxSkip > 1) maxSkip -= 1; }}><Minus size={16} /></button>
                  <span class="text-sm font-bold w-6 text-center">{maxSkip}</span>
                  <button type="button" class="flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 bg-slate-100 rounded hover:bg-slate-200"
                    aria-label="Increase max skip"
                    on:click={() => { if (maxSkip < 8) maxSkip += 1; }}><Plus size={16} /></button>
                  <span class="text-xs text-slate-400">{skipIntervalNames[maxSkip] ?? `${maxSkip} steps`}</span>
                </div>
              </div>

              <!-- Toggles -->
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Accidentals Follow Step</p>
                <button
                  class="px-3 py-2 sm:py-1 rounded text-sm {accidentalsFollowStep ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                  on:click={() => (accidentalsFollowStep = !accidentalsFollowStep)}
                >{accidentalsFollowStep ? 'On' : 'Off'}</button>
              </div>

              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Move 8th Notes</p>
                <button
                  class="px-3 py-2 sm:py-1 rounded text-sm {moveEighthNotes ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                  on:click={() => (moveEighthNotes = !moveEighthNotes)}
                >{moveEighthNotes ? 'On' : 'Off'}</button>
              </div>

              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Show Solfege</p>
                <button
                  class="px-3 py-2 sm:py-1 rounded text-sm {showSolfege ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}"
                  on:click={() => (showSolfege = !showSolfege)}
                >{showSolfege ? 'On' : 'Off'}</button>
              </div>
            </div>

          <!-- Range Tab -->
          {:else if selectedTab === 'range'}
            <div class="space-y-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Note Range</p>
              <RangeSelector
                range={selectedRange}
                clef={selectedClef}
                onRangeChange={handleRangeChange}
              />
            </div>
          {/if}

        </div>
      </div>
    </div>

    {#if error}
      <div class="w-full max-w-4xl mx-auto px-2 md:px-4">
        <div class="p-4 bg-red-100 text-red-700 rounded-md text-sm">
          {error}
        </div>
      </div>
    {/if}

    <!-- Music Display -->
    <div class="w-full px-2">
      <div
        id="paper"
        class="bg-white rounded-lg shadow-md my-2"
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
    onToggleLoop={handleToggleLoop}
    onToggleMute={() => {}}
    onShare={handleShare}
    onPrint={handlePrint}
  >
    <svelte:fragment slot="extra">
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
          class="w-16 accent-blue-400"
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
          class="w-16 accent-blue-400"
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
  :global(.abcjs-cursor) {
    stroke: #1411c4;
    stroke-width: 2;
    pointer-events: none;
  }

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
