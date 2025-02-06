<script lang="ts">
  import { onMount } from "svelte";
  import { createNewSr } from "./generateUnison";
  import abcjs from "abcjs";
  import RangeSelector from "./ui/rangeSelector.svelte";
  import { rhythms } from "../resources/rhythms";
  import { chords } from "../resources/chords";

  let bpm = 60;
  let renderedString = "";
  let progress = 0;
  let songPlaying = false;

  // Simplified options
  let selectedClef = "treble";
  const clefOptions = ["treble", "bass", "alto", "tenor"];

  let selectedRange = { min: 10, max: 15 };

  const scaleDegrees = [1, 2, 3, 4, 5, 6, 7];

  let selectedScaleDegrees = new Set([1, 3, 5]); // Default to major triad

  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
  let selectedKey = "F";

  // Initialize with quarter and half notes
  let selectedRhythms = [rhythms.quarter, rhythms.half];

  let selectedTimeSignature = "4/4";
  const timeSignatures = {
    "4/4": { name: "4/4", eighthsPerMeasure: 8 },
    "3/4": { name: "3/4", eighthsPerMeasure: 6 },
    "2/4": { name: "2/4", eighthsPerMeasure: 4 },
  };

  let measures = 8;
  const measureOptions = [4, 8, 12, 16];

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

  async function renderTune(): Promise<any> {
    return import("abcjs").then((abcjs) => {
      var renderedTune = abcjs.renderAbc("paper", renderedString[0], {
        add_classes: true,
        responsive: "resize",
        staffwidth: 800,
      });
      return renderedTune;
    });
  }

  async function handleClick() {
    const params = {
      bpm,
      clef: selectedClef,
      timeSig: timeSignatures[selectedTimeSignature],
      measures: 8,
      maxSkip: 5,

      range: selectedRange,
      rhythms: selectedRhythms,
      scaleDegrees: selectedScaleDegrees,
      selectedClef: selectedClef,
      selectedTimeSignature: selectedTimeSignature,
      key: selectedKey,
      chords: ["1", "4", "5"],
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

    var audioParams = {
      drum: drumBeats[selectedTimeSignature],
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
          synthControl.play();
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
</script>

<main class="flex flex-col items-center w-full max-w-4xl mx-auto">
  <div id="audio" class="w-full flex justify-center"></div>

  <!-- Options Panel -->
  <div class="w-full bg-white shadow-md rounded-lg p-4 my-4">
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
              on:click={() => (selectedClef = clef)}
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
              class="px-3 py-1 rounded {selectedTimeSignature === timeSig
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
      <!-- check range selector   -->
      <div class="space-y-2">
        <h2 class="text-lg font-semibold">Range</h2>
        <div class="flex flex-wrap gap-2">
          <span class="px-3 py-1 rounded bg-gray-100"
            >Min: {selectedRange.min}</span
          >
          <span class="px-3 py-1 rounded bg-gray-100"
            >Max: {selectedRange.max}</span
          >
        </div>
        <RangeSelector
          range={selectedRange}
          onRangeChange={handleRangeChange}
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
    </div>

    <!-- Rhythm Selection -->
    <div class="space-y-2">
      <h2 class="text-lg font-semibold">Rhythms</h2>
      <div class="flex flex-wrap gap-2">
        {#each Object.entries(rhythms) as [key, rhythm]}
          <button
            class="px-3 py-1 rounded {selectedRhythms.includes(rhythm)
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100'}"
            on:click={() => {
              if (selectedRhythms.includes(rhythm)) {
                selectedRhythms = selectedRhythms.filter((r) => r !== rhythm);
              } else {
                selectedRhythms = [...selectedRhythms, rhythm];
              }
            }}
          >
            {rhythm.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- Create Button -->
    <button
      class="w-full mt-4 bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600"
      on:click={handleClick}
    >
      Generate Exercise
    </button>
  </div>

  <!-- Music Display -->
  <div id="paper" class="w-full bg-white rounded-lg shadow-md p-4"></div>

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
