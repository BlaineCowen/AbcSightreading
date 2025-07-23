<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import abcjs from "abcjs";
  import type { TimingCallbacks } from "abcjs";
  import RangeSelector from "./ui/rangeSelector.svelte";
  import { rhythms, type Rhythm } from "../resources/rhythms";
  import * as Tone from "tone";
  import PianoIcon from "./ui/pianoIcon.svelte";
  import MetronomeIcon from "./ui/metronomeIcon.svelte";
  import "abcjs/abcjs-audio.css";
  // import PitchVisualizer from "./PitchVisualizer.svelte";

  // Audio and playback state
  let currentTune: any = null;
  let timingCallbacks: TimingCallbacks | null = null;
  let isPlaying = false;
  let createSynth: any = null;
  let totalDuration = 0;
  let currentProgress = 0;

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

  let filterRhythms = rhythms.filter((rhythm) => {
    console.log("Available rhythm:", rhythm.name, rhythm); // Log full rhythm objects
    return (
      !rhythm.name.includes("thirtySecond") &&
      !rhythm.name.toLowerCase().includes("rest")
    );
  });

  const rhythmSvgs = Object.fromEntries(
    rhythms
      .filter(
        (rhythm) =>
          !rhythm.name.includes("thirtySecond") &&
          !rhythm.name.toLowerCase().includes("rest")
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
          selectedScaleDegrees: new Set(
            options.selectedScaleDegrees || [1, 3, 5]
          ),
          selectedKey: options.selectedKey || "F",
          selectedRhythms: (options.selectedRhythms || [])
            .map((name: string) => rhythms.find((r) => r.name === name))
            .filter(Boolean) || [
            rhythms.find((r) => r.name === "eighthEighth"),
            rhythms.find((r) => r.name === "quarter"),
          ],
          selectedTimeSignature: ts,
          measures: options.measures || 8,
          bpm: options.bpm || 60,
          accidentals: options.accidentals || false,
          moveEighthNotes: options.moveEighthNotes || false,
          accidentalsFollowStep: options.accidentalsFollowStep || true,
          tempo: options.tempo || 60,
          showSolfege: options.showSolfege || false,
        };
      } catch (e) {
        console.error("Error loading saved options:", e);
      }
    }
    // Return defaults if no saved state or error
    return {
      selectedClef: "treble",
      selectedRange: { min: 17, max: 21 },
      selectedScaleDegrees: new Set([1, 3, 5]),
      selectedKey: "F",
      selectedRhythms: [
        rhythms.find((r) => r.name === "eighthEighth"),
        rhythms.find((r) => r.name === "quarter"),
      ],
      selectedTimeSignature: "4/4",
      measures: 8,
      bpm: 60,
      accidentals: false,
      moveEighthNotes: false,
      accidentalsFollowStep: false,
      showSolfege: false,
    };
  }

  const initialState = getInitialState();
  let selectedClef = initialState.selectedClef;
  let selectedRange = initialState.selectedRange;
  let selectedScaleDegrees = initialState.selectedScaleDegrees;
  let selectedKey = initialState.selectedKey;
  let selectedRhythms = initialState.selectedRhythms;
  let selectedTimeSignature = initialState.selectedTimeSignature;
  let measures = initialState.measures;
  let bpm = initialState.bpm;
  let accidentals = initialState.accidentals;
  let moveEighthNotes = initialState.moveEighthNotes;
  let accidentalsFollowStep = initialState.accidentalsFollowStep;
  let tempo = initialState.tempo;
  let showSolfege = initialState.showSolfege || false;

  let renderedString: any;
  let selectableArray: any[] = [];
  let pitchCursor: SVGLineElement | null = null;

  // Define possible keys
  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

  // Define time signatures
  const timeSignatures = {
    "4/4": { name: "4/4", tsPerMeasure: 32 },
    "3/4": { name: "3/4", tsPerMeasure: 24 },
    "2/4": { name: "2/4", tsPerMeasure: 16 },
  };

  // Simplified options
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
    { display: "♭4", value: 4 },
    { display: "♭5", value: 5 },
    { display: "♭6", value: 6 },
    { display: "♭7", value: 7 },
  ];

  let availableChords = ["1", "2", "3", "4", "5", "6", "7"];

  // Update availableChords based on accidentals
  $: {
    if (accidentals) {
      availableChords = [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "5/2",
        "5/4",
        "5/6",
        "m4",
      ];
    } else {
      availableChords = ["1", "2", "3", "4", "5", "6", "7"];
    }
  }

  const measureOptions = [1, 2, 4, 8, 12, 16];

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

  // Add this state variable
  let optionsVisible = true;

  // Add these localStorage functions
  const STORAGE_KEY = "sightReadingOptions";

  // Save options whenever they change
  $: {
    const options = {
      selectedClef,
      selectedRange: { ...selectedRange },
      selectedScaleDegrees: Array.from(selectedScaleDegrees),
      selectedKey,
      selectedRhythms: selectedRhythms.map((r: Rhythm) => r.name),
      selectedTimeSignature,
      measures,
      bpm,
      accidentals,
      moveEighthNotes,
      accidentalsFollowStep,
      showSolfege,
    };
    try {
      console.log("Saving options:", options);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch (e) {
      console.error("Error saving options:", e);
    }
  }

  /**
   * Updates the progress bar based on current playback position
   * @param {number} position - Current position in milliseconds
   */
  function updateProgress(position: number) {
    currentProgress = (position / totalDuration) * 100;
  }

  /**
   * Handles clicks on the progress bar to seek to a specific position
   * @param {MouseEvent} event - The click event
   */
  function handleProgressClick(event: MouseEvent) {
    const progressBar = event.currentTarget as HTMLDivElement;
    const rect = progressBar.getBoundingClientRect();
    const position = (event.clientX - rect.left) / rect.width;

    if (timingCallbacks) {
      timingCallbacks.setProgress(position, "percent");
      updateProgress(position * totalDuration);
    }
  }

  /**
   * Initializes the audio synthesis engine and buffer
   * @returns {Promise<boolean>} Success status of initialization
   */
  async function initAudio() {
    if (!currentTune) {
      console.warn("No tune available - generate one first");
      return false;
    }
    // Ensure AudioContext is running
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    if (!createSynth) {
      createSynth = new abcjs.synth.CreateSynth();
    }
    // We don't need midiBuffer anymore. We'll get the full AudioBuffer.
    // The init call loads the required instrument sounds.
    await createSynth.init({
      audioContext: audioContext, // Pass our context to abcjs
      visualObj: currentTune,
      options: {
        qpm: tempo,
      },
    });
    // prime() gets it ready to create the buffer
    await createSynth.prime();
    // This gets the entire playable audio file.
    audioBuffer = await createSynth.getAudioBuffer();
    return true;
  }

  /**
   * Renders the ABC notation to the paper div
   * @returns {Promise<any>} The rendered visual object
   */
  async function renderTune(): Promise<any> {
    const abcOptions = {
      add_classes: true,
      generateDownload: true,
      generateInline: true,
      generateTiming: true,
      scale: 2,
      staffwidth: 900,
      paddingTop: 15,
      paddingBottom: 15,
      wrap: {
        preferredMeasuresPerLine: 3,
        minSpacing: 1,
        maxSpacing: 5,
      },
      clickListener: async (event: any) => {
        console.log("clickListener", event);
        if (event.pitches && event.pitches.length > 0) {
          await playNote(event.pitches[0].name);
        }
      },
    };

    const visualObj = abcjs.renderAbc("paper", renderedString[0], abcOptions);
    selectableArray = visualObj[0].getSelectableArray();
    console.log("selectableArray", selectableArray);

    /**
     * Creates a cursor element for tracking playback position
     * @returns {SVGLineElement|null} The created cursor element
     */
    function createCursor() {
      const svg = document.querySelector("#paper svg");
      if (!svg) return null;

      const cursor = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      cursor.setAttribute("class", "abcjs-cursor");
      cursor.setAttributeNS(null, "x1", "0");
      cursor.setAttributeNS(null, "y1", "0");
      cursor.setAttributeNS(null, "x2", "0");
      cursor.setAttributeNS(null, "y2", "0");
      svg.appendChild(cursor);
      return cursor;
    }

    // Wait for SVG to be rendered
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cursor = createCursor();
    pitchCursor = createPitchCursor();
    updatePitchCursor(0); // Position cursor at first note

    currentTune = visualObj[0];

    const beatsPerMeasure = parseInt(selectedTimeSignature[0]);

    // Create new timing callbacks
    timingCallbacks = new abcjs.TimingCallbacks(currentTune, {
      beatCallback: (beatNumber, totalBeats, totalTime, position) => {
        if (isMetronomeOn) {
          // Play a click sound on each beat
          const beatInMeasure = beatNumber % beatsPerMeasure;
          playMetronomeClick(beatInMeasure === 0);
        }
        totalDuration = totalTime;
        if (position && cursor && typeof position.left === "number") {
          if (beatNumber === totalBeats) {
            cursor.setAttribute("x1", "0");
            cursor.setAttribute("x2", "0");
            cursor.setAttribute("y1", "0");
            cursor.setAttribute("y2", "0");
          } else {
            const x = Math.max(0, position.left - 2);
            const cursorHeight = position.height;
            const shortenBy = cursorHeight * 0.15;
            const startY = position.top + shortenBy;
            const endY = position.top + position.height + cursorHeight * 0.15;

            cursor.setAttribute("x1", x.toString());
            cursor.setAttribute("x2", x.toString());
            cursor.setAttribute("y1", startY.toString());
            cursor.setAttribute("y2", endY.toString());
          }
        }
      },
      qpm: tempo,
    });

    return visualObj;
  }

  /**
   * Starts or resumes music playback
   */
  async function playMusic() {
    // If already playing, do nothing.
    if (isPlaying) {
      return;
    }
    // If we are paused, just resume.
    if (pausedAt > 0) {
      return resumeMusic();
    }

    // Ensure we have a tune to play.
    if (!currentTune) {
      alert("Please generate a tune first!");
      return;
    }
    // Make sure audio is initialized and we have a buffer.
    if (!audioBuffer) {
      const audioInitialized = await initAudio();
      if (!audioInitialized || !audioBuffer) return;
    }

    if (!audioBuffer) return;

    // We have a buffer, let's play it.
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(gainNode);

    // When the song is over, clean up.
    sourceNode.onended = () => {
      if (isPlaying) {
        // only if it finished naturally, not if stopped
        stopMusic();
      }
    };

    sourceNode.start(0);
    startTime = audioContext.currentTime;
    isPlaying = true;

    // Start the visual cursor
    if (timingCallbacks) {
      timingCallbacks.start();
    }
  }

  function resumeMusic() {
    if (isPlaying || !pausedAt || !audioBuffer) return;

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(gainNode);

    sourceNode.onended = () => {
      if (isPlaying) {
        stopMusic();
      }
    };

    sourceNode.start(0, pausedAt); // Start from where we paused
    // Adjust startTime to account for the pause
    startTime = audioContext.currentTime - pausedAt;
    pausedAt = 0; // Clear paused state
    isPlaying = true;

    if (timingCallbacks) {
      timingCallbacks.start(); // Resumes from paused state
    }
  }

  /**
   * Pauses music playback
   */
  function pauseMusic() {
    if (!isPlaying || !sourceNode) return;
    pausedAt = audioContext.currentTime - startTime;
    sourceNode.onended = null; // Prevent onended from firing on a manual stop
    sourceNode.stop();
    sourceNode = null;
    isPlaying = false;
    if (timingCallbacks) {
      timingCallbacks.pause();
    }
  }

  /**
   * Stops music playback and resets playback state
   */
  function stopMusic() {
    isPlaying = false;
    pausedAt = 0;
    startTime = 0;
    if (sourceNode) {
      sourceNode.onended = null;
      sourceNode.stop();
      sourceNode = null;
    }
    if (timingCallbacks) {
      timingCallbacks.stop();
    }
  }

  function playMetronomeClick(isDownbeat: boolean) {
    if (!audioContext || metronomeGainNode.gain.value === 0) return;

    const osc = audioContext.createOscillator();
    const clickGain = audioContext.createGain();

    // Set the frequency you wanted
    osc.frequency.value = isDownbeat ? 1000 : 800;

    // This is the fix:
    // 1. Set the gain to full volume INSTANTLY at the current time.
    clickGain.gain.setValueAtTime(
      isDownbeat ? 1.5 : 1,
      audioContext.currentTime
    );

    // 2. Schedule a ramp down to (near) silence over the next 0.03 seconds.
    clickGain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.03
    );

    osc.connect(clickGain);
    clickGain.connect(metronomeGainNode);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.03);
  }

  /**
   * Handles the generate button click, creates new sight reading exercise
   */
  async function handleClick() {
    optionsVisible = false;
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
        maxSkip: 4,
        tempo: tempo,
        range: selectedRange,
        rhythms: selectedRhythms,
        scaleDegrees: Array.from(selectedScaleDegrees),
        selectedClef: selectedClef,
        selectedTimeSignature: selectedTimeSignature,
        key: selectedKey,
        chords: availableChords,
        showSolfege: showSolfege,
        moveOnEighthNotes: moveEighthNotes,
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

  onDestroy(() => {
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
  function createPitchCursor() {
    const svg = document.querySelector("#paper svg");
    if (!svg) return null;

    const cursor = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    cursor.setAttribute("class", "abcjs-pitch-cursor");
    cursor.setAttributeNS(null, "x1", "0");
    cursor.setAttributeNS(null, "y1", "0");
    cursor.setAttributeNS(null, "x2", "0");
    cursor.setAttributeNS(null, "y2", "0");
    svg.appendChild(cursor);
    return cursor;
  }

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

<div class="w-full">
  <main class="flex flex-col items-center w-full max-w-4xl mx-auto pb-20">
    <!-- <PitchVisualizer {selectedKey} {selectableArray} /> -->
    <div class="flex flex-col items-center w-full">
      <!-- Options Panel -->
      <div
        class="w-full bg-white shadow-md rounded-lg p-4 my-4 transition-all duration-300"
      >
        <!-- Header with minimize button -->
        <div class="flex justify-between items-center mb-2">
          <h2 class="text-lg font-semibold">Options</h2>
          <button
            class="p-1 hover:bg-gray-100 rounded"
            on:click={() => (optionsVisible = !optionsVisible)}
          >
            {#if optionsVisible}
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

        <!-- Options content with transition -->
        {#if optionsVisible}
          <div class="space-y-4 overflow-hidden transition-all duration-300">
            <div class="grid grid-cols-2 gap-4">
              <!-- Clef Selection -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Clef</h2>
                <div class="flex flex-wrap gap-2">
                  {#each clefOptions as clef}
                    <button
                      class="px-3 py-1 rounded {selectedClef === clef
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => updateClef(clef)}
                    >
                      {clef}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Time Signature -->
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

              <!-- Number of Measures -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Measures</h2>
                <div class="flex flex-wrap gap-2">
                  {#each measureOptions as option}
                    <button
                      class="px-3 py-1 rounded {measures === option
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (measures = option)}
                    >
                      {option}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Key Selection -->
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

              <!-- tempo -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Tempo</h2>
                <span class="text-sm text-gray-500">{tempo}</span>
                <input
                  type="range"
                  min="30"
                  max="120"
                  value={tempo}
                  on:input={(e) =>
                    (tempo =
                      // @ts-ignore
                      e.target.value)}
                />
              </div>

              <!-- check range selector   -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Range</h2>

                <RangeSelector
                  range={selectedRange}
                  clef={selectedClef}
                  onRangeChange={handleRangeChange}
                  onClefChange={updateClef}
                />
              </div>

              <!-- select scale degrees -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Scale Degrees</h2>
                <div class="flex flex-wrap gap-2">
                  {#each sharpScaleDegrees as degree}
                    <button
                      class="px-2 py-1 rounded bg-gray-100 {degree.value === 1
                        ? 'ml-5'
                        : degree.value === 4
                          ? 'ml-10'
                          : ''}"
                    >
                      {degree.display}
                    </button>
                  {/each}
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each scaleDegrees as degree}
                    <button
                      class="px-3 py-1 rounded {selectedScaleDegrees.has(degree)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => toggleScaleDegree(degree)}
                    >
                      {degree}
                    </button>
                  {/each}
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each flatScaleDegrees as degree}
                    <button
                      class="px-2 py-1 rounded bg-gray-100 {degree.value === 2
                        ? 'ml-5'
                        : degree.value === 5
                          ? 'ml-10'
                          : ''}"
                    >
                      {degree.display}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- accidentals -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Accidentals</h2>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="px-3 py-1 rounded {accidentals
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100'}"
                    on:click={() => (accidentals = !accidentals)}
                  >
                    {accidentals ? "On" : "Off"}
                  </button>
                </div>
              </div>

              <!-- move eighth notes -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Move 8th Notes</h2>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="px-3 py-1 rounded {moveEighthNotes
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100'}"
                    on:click={() => (moveEighthNotes = !moveEighthNotes)}
                  >
                    {moveEighthNotes ? "On" : "Off"}
                  </button>
                </div>
              </div>

              <!-- accidentals follow step -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Accidentals Follow Step</h2>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="px-3 py-1 rounded {accidentalsFollowStep
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100'}"
                    on:click={() =>
                      (accidentalsFollowStep = !accidentalsFollowStep)}
                  >
                    {accidentalsFollowStep ? "On" : "Off"}
                  </button>
                </div>
              </div>

              <!-- show solfege -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Show Solfege</h2>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="px-3 py-1 rounded {showSolfege
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100'}"
                    on:click={() => (showSolfege = !showSolfege)}
                  >
                    {showSolfege ? "On" : "Off"}
                  </button>
                </div>
              </div>
            </div>

            <!-- Rhythm Selection -->
            <div class="space-y-2">
              <h2 class="text-lg font-semibold">Rhythms</h2>
              <div class="flex flex-wrap gap-2">
                {#each Object.values(filterRhythms) as rhythm}
                  <button
                    class="px-1 py-1 w-12 h-12 flex items-center justify-center rounded {selectedRhythms.some(
                      // @ts-ignore
                      (r) => r.name === rhythm.name
                    )
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100'}"
                    on:click={() => {
                      if (
                        selectedRhythms.some(
                          (
                            // @ts-ignore
                            r
                          ) => r.name === rhythm.name
                        )
                      ) {
                        selectedRhythms = selectedRhythms.filter(
                          // @ts-ignore
                          (r) => r.name !== rhythm.name
                        );
                      } else {
                        selectedRhythms = [...selectedRhythms, rhythm];
                      }
                    }}
                  >
                    {#await rhythmSvgs[rhythm.name]}
                      <!-- Loading state -->
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
        {/if}
        <!-- Create Button -->

        <button
          class="w-full mt-4 bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          on:click={handleClick}
          disabled={isLoading}
        >
          {isLoading ? "Generating..." : "Generate Exercise"}
        </button>

        {#if error}
          <div class="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        {/if}
      </div>
    </div>

    <div class="w-full flex items-center gap-4 p-4">
      <button class="flex-shrink-0" on:click={toggleMute}>
        {#if isMuted || masterVolume === 0}
          <PianoIcon />
        {:else}
          <PianoIcon />
        {/if}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        bind:value={masterVolume}
        on:input={handleVolumeChange}
        class="w-24"
        aria-label="Master volume"
      />
      <!-- Metronome Controls -->
      <div class="flex items-center gap-2 border-l-2 pl-4 ml-4">
        <button on:click={() => (isMetronomeOn = !isMetronomeOn)}>
          <MetronomeIcon />
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={metronomeVolume}
          on:input={handleMetronomeVolumeChange}
          class="w-24"
          aria-label="Metronome volume"
        />
      </div>
      <div class="flex items-center gap-2">
        <button
          class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          on:click={toggleDrone}
        >
          {dronePlaying ? "Stop Drone" : "Start Drone"}
        </button>
        {#if dronePlaying}
          <div class="flex items-center gap-2">
            <input
              type="range"
              min="-60"
              max="0"
              step="1"
              value={currentDroneVolume}
              on:input={handleDroneVolumeChange}
              class="w-32"
              aria-label="Drone volume"
            />
            <span class="text-sm">{currentDroneVolume}dB</span>
          </div>
        {/if}
      </div>
      <div class="flex gap-2">
        <button
          class="px-4 py-2 rounded {!currentTune
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-500'} text-white"
          disabled={!currentTune}
          on:click={isPlaying ? pauseMusic : playMusic}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          class="px-4 py-2 rounded {!currentTune
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-red-500'} text-white"
          disabled={!currentTune}
          on:click={stopMusic}
        >
          Stop
        </button>
      </div>
    </div>

    <!-- Music Display -->
    <div
      id="paper"
      class="bg-white rounded-lg shadow-md my-4 relative overflow-hidden"
    ></div>

    <!-- padding -->
    <div class="h-96"></div>

    <!-- Progress Bar -->
    {#if currentTune}
      <button
        type="button"
        class="w-full bg-gray-200 rounded-full h-2.5 my-4"
        on:click={handleProgressClick}
        on:keydown={(e) => {
          if (e.key === "Enter") {
            handleProgressClick(
              new MouseEvent("click", {
                clientX:
                  e.currentTarget.getBoundingClientRect().left +
                  e.currentTarget.offsetWidth / 2,
                clientY:
                  e.currentTarget.getBoundingClientRect().top +
                  e.currentTarget.offsetHeight / 2,
              })
            );
          }
        }}
        aria-label="Progress bar"
      >
        <div
          class="bg-blue-500 h-2.5 rounded-full"
          style="width: {currentProgress}%"
          role="progressbar"
          aria-valuenow={currentProgress}
          aria-valuemin="0"
          aria-valuemax="100"
        ></div>
      </button>
    {/if}
  </main>
</div>

<style>
  :global(.abcjs-cursor) {
    padding-bottom: 20%;
    stroke: blue;
    stroke-width: 2;
    pointer-events: none;
  }

  :global(.abcjs-pitch-cursor) {
    stroke: #22c55e;
    stroke-width: 2;
    pointer-events: none;
    transition: all 0.3s ease;
  }
</style>
