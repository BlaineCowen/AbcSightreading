<script lang="ts">
  import { onMount } from "svelte";
  import { createNewSr } from "./generateUnison";
  import abcjs from "abcjs";
  import RangeSelector from "./ui/rangeSelector.svelte";
  import { rhythms, type Rhythm } from "../resources/rhythms";
  import * as Tone from "tone";
  import { toneNoteArray } from "../resources/toneNoteArray";
  import SpeakerIcon from "./ui/speaker-icon.svelte";
  import SpeakerIconOff from "./ui/speaker-icon-off.svelte";

  // import { chords } from "../resources/chords";
  // Import all SVGs dynamically

  const synth = new Tone.Synth().toDestination();

  let playSynth = true;

  let filterRhythms = Object.values(rhythms).filter((rhythm) => {
    console.log(rhythm.name); // Log rhythm names
    return (
      !rhythm.name.includes("thirtySecond") &&
      !rhythm.name.toLowerCase().includes("rest")
    );
  });

  const rhythmSvgs = Object.fromEntries(
    Object.entries(rhythms)
      .filter(
        ([name]) =>
          !name.includes("thirtySecond") && !name.toLowerCase().includes("rest")
      )
      .map(([name]) => [name, import(`../assets/svgs/${name}.svg?raw`)])
  );

  // Wrap initial state declarations in a function
  function getInitialState() {
    // Try to load from localStorage first
    const saved = localStorage.getItem("sightReadingOptions");
    if (saved) {
      try {
        const options = JSON.parse(saved);
        return {
          selectedClef: options.selectedClef || "treble",
          selectedRange: options.selectedRange || { min: 17, max: 21 },
          selectedScaleDegrees: new Set(
            options.selectedScaleDegrees || [1, 3, 5]
          ),
          selectedKey: options.selectedKey || "F",
          selectedRhythms: (options.selectedRhythms || [])
            .map((name: string) =>
              Object.values(rhythms).find((r) => r.name === name)
            )
            .filter(Boolean) || [rhythms.eighthEighth, rhythms.quarter],
          selectedTimeSignature: options.selectedTimeSignature || {
            name: "4/4",
            tsPerMeasure: 32,
          },
          measures: options.measures || 8,
          bpm: options.bpm || 60,
          accidentals: options.accidentals || false,
          moveEighthNotes: options.moveEighthNotes || false,
          accidentalsFollowStep: options.accidentalsFollowStep || true,
          tempo: options.tempo || 60,
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
      selectedRhythms: [rhythms.eighthEighth, rhythms.quarter],
      selectedTimeSignature: {
        name: "4/4",
        tsPerMeasure: 32,
      },
      measures: 8,
      bpm: 60,
      accidentals: false,
      moveEighthNotes: false,
      accidentalsFollowStep: false,
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

  let renderedString: any;
  let progress = 0;
  let songPlaying = false;

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

  const drumBeats = {
    "4/4": "dddd 76 77 77 77 60 30 30 30",
    "3/4": "ddd 76 77 77 60 30 30",
    "2/4": "dd 76 77 60 30",
  };

  // Add this state variable
  let optionsVisible = true;

  // Add these localStorage functions
  const STORAGE_KEY = "sightReadingOptions";

  // Load saved options
  function loadOptions() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const options = JSON.parse(saved);
        console.log("Loaded options from storage:", options);

        selectedClef = options.selectedClef || "treble";
        (selectedRange = options.selectedRange || { min: 17, max: 21 }),
          (selectedScaleDegrees = new Set(
            options.selectedScaleDegrees || [1, 3, 5]
          ));
        selectedKey = options.selectedKey || "F";
        selectedRhythms = (options.selectedRhythms || [])
          .map((name: string) =>
            Object.values(rhythms).find((r) => r.name === name)
          )
          .filter(Boolean) || [rhythms.eighthEighth, rhythms.quarter]; // Remove any undefined values
        selectedTimeSignature = options.selectedTimeSignature || {
          name: "4/4",
          tsPerMeasure: 32,
        };
        measures = options.measures || 8;
        bpm = options.bpm || 60;
        tempo = options.tempo || 60;
        accidentals = options.accidentals || false; // Load accidentals state
        moveEighthNotes = options.moveEighthNotes || false; // Load new state
        accidentalsFollowStep = options.accidentalsFollowStep || false; // Load new state
      } catch (e) {
        console.error("Error loading saved options:", e);
        localStorage.removeItem(STORAGE_KEY); // Clear corrupted data
      }
    }
  }

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
    };
    try {
      console.log("Saving options:", options);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch (e) {
      console.error("Error saving options:", e);
    }
  }

  // Load options when component mounts
  onMount(() => {
    loadOptions();
  });

  const playNote = (note: any) => {
    console.log(note);
    if (playSynth) {
      synth.triggerAttackRelease(toneNoteArray[note - 12], "8n");
    }
  };

  async function renderTune(): Promise<any> {
    return import("abcjs").then((abcjs) => {
      var renderedTune = abcjs.renderAbc("paper", renderedString[0], {
        add_classes: true,
        scale: 2,
        staffwidth: 900,
        wrap: {
          preferredMeasuresPerLine: 3,
          minSpacing: 1,
          maxSpacing: 5,
        },
        clickListener: (event: any) => {
          playNote(event.midiPitches[0].pitch);
        },
      });
      return renderedTune;
    });
  }

  async function handleClick() {
    // Auto-minimize when generating
    optionsVisible = false;

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
      scaleDegrees: selectedScaleDegrees,
      selectedClef: selectedClef,
      selectedTimeSignature: selectedTimeSignature,
      key: selectedKey,
      chords: availableChords,
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

    renderedString = createNewSr(params);
    const renderedTune = await renderTune();
    const audioParams = {
      drum: drumBeats[selectedTimeSignature as keyof typeof drumBeats],
      drumBars: 1,
      drumIntro: 1,
    };

    var synthControl = new abcjs.synth.SynthController();
    var createSynth = new abcjs.synth.CreateSynth();

    createSynth.init({ visualObj: renderedTune[0] }).then(() => {
      synthControl
        .setTune(renderedTune[0], false, audioParams)
        .then(() => {
          synthControl.load("#audio");
          // synthControl.play();
        })
        .catch((error) => {
          console.warn("Audio problem:", error);
        });
    });

    songPlaying = true;
  }

  function handleRangeChange(newRange: { min: number; max: number }) {
    selectedRange = newRange;
    console.log("Range changed:", selectedRange); // Debug
  }

  function toggleScaleDegree(degree: number) {
    if (selectedScaleDegrees.has(degree)) {
      selectedScaleDegrees.delete(degree);
    } else {
      selectedScaleDegrees.add(degree);
    }
    selectedScaleDegrees = selectedScaleDegrees; // Trigger reactivity
  }

  // Function to update selectedClef
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

  function toggleDrone() {
    if (!dronePlaying) {
      Tone.start();
      const rootNote = getRootNoteFrequency(selectedKey);
      droneOscillator = new Tone.Oscillator({
        frequency: rootNote,
        type: "sine",
        volume: -12,
      })
        .toDestination()
        .start();
    } else {
      droneOscillator?.stop();
      droneOscillator = null;
    }
    dronePlaying = !dronePlaying;
  }

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
</script>

<div class="w-full">
  <main class="flex flex-col items-center w-full max-w-4xl mx-auto pb-20">
    <div class="flex flex-col items-center w-full">
      <div
        id="audio"
        class="w-full flex justify-center gap-2 items-center my-4"
      ></div>

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
          class="w-full mt-4 bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600"
          on:click={handleClick}
        >
          Generate Exercise
        </button>
      </div>
    </div>

    <div class="w-full flex justify-left">
      {#if playSynth}
        <button on:click={() => (playSynth = !playSynth)}>
          <SpeakerIcon />
        </button>
      {:else}
        <button on:click={() => (playSynth = !playSynth)}>
          <SpeakerIconOff />
        </button>
      {/if}
      <button
        class="px-4 py-2 rounded {dronePlaying
          ? 'bg-red-500'
          : 'bg-green-500'} text-white"
        on:click={toggleDrone}
      >
        {dronePlaying ? "Stop Drone" : "Start Drone"}
      </button>
    </div>

    <!-- Music Display -->
    <div id="paper" class="bg-white rounded-lg shadow-md my-4"></div>

    <!-- padding -->
    <div class="h-96"></div>

    <!-- Progress Bar -->
    {#if songPlaying}
      <div class="w-full bg-gray-200 rounded-full h-2.5 my-4">
        <div
          class="bg-blue-500 h-2.5 rounded-full"
          style="width: {progress}%"
        ></div>
      </div>
    {/if}
  </main>
</div>
