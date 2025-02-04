<script lang="ts">
  import { onMount } from "svelte";
  import { createNewSr } from "./generatePartString.ts";
  import abcjs from "abcjs";
  import { chords } from "../resources/chords.ts";

  let bpm = 60;

  let levels = [1, 2, 3, 4, 5];
  let selectedLevel = 1;

  let possibleVoicing: {
    [key: string]: {
      numofParts: number;
      parts: {
        [key: string]: {
          order: number;
          smallName: string;
          clef: string;
          range: number[];
          selectedRange: {
            [key: number]: number[];
          };
        };
      };
    };
  } = {
    "4 Part Mixed": {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: "treble",
          range: [15, 23],
          selectedRange: {
            1: [15, 23],
            2: [15, 23],
            3: [15, 23],
            4: [15, 23],
            5: [15, 23],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: "treble",
          range: [14, 21],
          selectedRange: {
            1: [14, 21],
            2: [14, 21],
            3: [14, 21],
            4: [14, 21],
            5: [14, 21],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: "treble-8",
          range: [11, 17],
          selectedRange: {
            1: [11, 17],
            2: [11, 17],
            3: [11, 17],
            4: [11, 17],
            5: [11, 17],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: "bass",
          range: [7, 14],
          selectedRange: {
            1: [7, 14],
            2: [7, 14],
            3: [7, 14],
            4: [7, 14],
            5: [7, 14],
          },
        },
      },
    },
    "3 Part Mixed": {
      numofParts: 3,
      parts: {
        Soprano: {
          order: 2,
          smallName: "S",
          clef: "treble",
          range: [15, 23],
          selectedRange: {
            1: [15, 23],
            2: [15, 23],
            3: [15, 23],
            4: [15, 23],
            5: [15, 23],
          },
        },
        Alto: {
          order: 1,
          smallName: "A",
          clef: "treble",
          range: [14, 21],
          selectedRange: {
            1: [14, 21],
            2: [14, 21],
            3: [14, 21],
            4: [14, 21],
            5: [14, 21],
          },
        },
        Baritone: {
          order: 0,
          smallName: "B",
          clef: "bass",
          range: [6, 14],
          selectedRange: {
            1: [6, 14],
            2: [6, 14],
            3: [6, 14],
            4: [6, 14],
            5: [6, 14],
          },
        },
      },
    },
    "3 Part Treble": {
      numofParts: 3,
      parts: {
        Soprano1: {
          order: 2,
          smallName: "S1",
          clef: "treble",
          range: [15, 23],
          selectedRange: {
            1: [15, 23],
            2: [15, 23],
            3: [15, 23],
            4: [15, 23],
            5: [15, 23],
          },
        },
        Soprano2: {
          order: 1,
          smallName: "S2",
          clef: "treble",
          range: [15, 22],
          selectedRange: {
            1: [15, 22],
            2: [15, 22],
            3: [15, 22],
            4: [15, 22],
            5: [15, 22],
          },
        },
        Alto: {
          order: 0,
          smallName: "A",
          clef: "treble",
          range: [14, 21],
          selectedRange: {
            1: [14, 21],
            2: [14, 21],
            3: [14, 21],
            4: [14, 21],
            5: [14, 21],
          },
        },
      },
    },
    "3 Part Tenor/Bass": {
      numofParts: 3,
      parts: {
        Tenor: {
          order: 2,
          smallName: "T",
          clef: "treble-8",
          range: [10, 32],
          selectedRange: {
            1: [8, 17],
            2: [8, 17],
            3: [8, 17],
            4: [8, 17],
            5: [8, 17],
          },
        },
        Baritone: {
          order: 1,
          smallName: "B1",
          clef: "bass",
          range: [0, 18],
          selectedRange: {
            1: [6, 17],
            2: [6, 17],
            3: [6, 17],
            4: [6, 17],
            5: [6, 17],
          },
        },
        Bass: {
          order: 0,
          smallName: "B2",
          clef: "bass",
          range: [0, 15],
          selectedRange: {
            1: [4, 15],
            2: [4, 15],
            3: [4, 15],
            4: [4, 15],
            5: [4, 15],
          },
        },
      },
    },
    "2 Part Treble": {
      numofParts: 2,
      parts: {
        Soprano: {
          order: 1,
          smallName: "S",
          clef: "treble",
          range: [20, 32],
          selectedRange: {
            1: [16, 25],
            2: [16, 25],
            3: [16, 25],
            4: [16, 25],
            5: [16, 25],
          },
        },

        Alto: {
          order: 0,
          smallName: "A",
          clef: "treble",
          range: [15, 25],
          selectedRange: {
            1: [15, 23],
            2: [15, 23],
            3: [15, 23],
            4: [15, 23],
            5: [15, 23],
          },
        },
      },
    },
    Unison: {
      numofParts: 1,
      parts: {
        Unison: {
          order: 0,
          smallName: "V",
          clef: "treble",
          range: [20, 32],
          selectedRange: {
            1: [16, 25],
            2: [16, 25],
            3: [16, 25],
            4: [16, 25],
            5: [16, 25],
          },
        },
      },
    },
  };

  let timeSignatures: {
    [key: string]: {
      name: string;
      eighthsPerMeasure: number;
    };
  } = {
    "4/4": {
      name: "4/4",
      eighthsPerMeasure: 8,
    },
    "3/4": {
      name: "3/4",
      eighthsPerMeasure: 6,
    },
    "2/4": {
      name: "2/4",
      eighthsPerMeasure: 4,
    },
  };

  let selectedTimeSignature = "4/4";

  // let possibleLevels = [1, 2, 3, 4, 5];
  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
  let selectedKey = "F";

  // const measureOptions = [4, 8, 12, 16, 20, 24, 28, 32];
  let selectedMeasures = 8;
  let maxSkip = 3;
  const maxSkipRange = [2, 8];

  let abcjsReturn = [];
  let chordProgression = [] as any[];
  let renderedString = "";
  let progress = 0.0;
  let measures = 8;

  let songPlaying = false;

  let selectedVoicing = "" as string;

  let showDropdown = false;

  // function updateRange(partName: string, newRange: number[]) {
  //   console.log(partName, newRange);

  //   const parts = possibleVoicing[selectedVoicing].parts;
  //   parts[partName].selectedRange = newRange;
  //   possibleVoicing[selectedVoicing].parts = { ...parts }; // Reassign to trigger reactivity
  // }

  // Parse URL parameters and set values
  function loadParams() {
    const urlParams = new URLSearchParams(window.location.search);
    selectedVoicing = urlParams.get("voices") || "4 Part Mixed";
    bpm = parseInt(urlParams.get("bpm") || "60");
    selectedLevel = parseInt(urlParams.get("level") || "1");
    selectedKey = urlParams.get("key") || "F";
    selectedMeasures = parseInt(urlParams.get("measures") || "8");
  }

  // Update URL parameters when settings change
  function updateURLParams() {
    const url = new URL(window.location.href);
    url.searchParams.set("voices", selectedVoicing.toString());
    url.searchParams.set("bpm", bpm.toString());
    url.searchParams.set("level", selectedLevel.toString());
    url.searchParams.set("key", selectedKey);
    url.searchParams.set("measures", selectedMeasures.toString());
    window.history.replaceState({}, "", url);
  }

  onMount(() => {
    selectedVoicing = "4 Part Mixed";
    loadParams();
  });

  function handleVoicing(event: any) {
    selectedVoicing = event.target.innerText;
    console.log(selectedVoicing);
  }

  const drumBeats: {
    [key: string]: string;
  } = {
    "4/4": "dddd 76 77 77 77 60 30 30 30",
    "3/4": "ddd 76 77 77 60 30 30",
  };

  // interface NoteEvent {
  //   milliseconds: number;
  // }

  interface ICursorControl {
    extraMeasuresAtBeginning?: number;
    beatSubdivisions: number;
    onFinished: () => void;
  }

  async function renderTune(): Promise<any> {
    return import("abcjs").then((abcjs) => {
      var renderedTune = abcjs.renderAbc("paper", renderedString, {
        responsive: "resize",
      });
      return renderedTune;
    });
  }

  let params: any;

  // reset abcjs
  $: params = {
    bpm: bpm,
    key: selectedKey,
    timeSig: timeSignatures[selectedTimeSignature],
    level: selectedLevel,
    measures: measures,
    maxSkip: maxSkip,
    partsObject: possibleVoicing[selectedVoicing],
    chords: chords,
  };

  async function handleClick() {
    // update URL parameters
    updateURLParams();
    // show progress bar
    const progressBarContainer = document.getElementById(
      "progress-bar-container"
    ) as HTMLDivElement;
    progressBarContainer.style.display = "block";

    // hide start button
    // const startButton = document.getElementById("start") as HTMLButtonElement;

    abcjsReturn = createNewSr(params);

    if (typeof abcjsReturn[0] == "string") {
      renderedString = abcjsReturn[0];
    } else {
      renderedString = abcjsReturn[0].toString();
    }

    if (typeof abcjsReturn[1] == "object") {
      chordProgression = abcjsReturn[1];
      console.log(chordProgression);
    }

    const renderedTune = await renderTune();

    renderedTune[0].setTiming();

    var timeSigName = timeSignatures[selectedTimeSignature].name;
    var audioParams = {
      drum: drumBeats[timeSigName],
      drumBars: 1,
      drumIntro: 1,
    };

    // const totalTime = renderedTune[0].getTotalTime();

    // const measureTime = renderedTune[0].getTotalTime() / measures;

    var synthControl = new abcjs.synth.SynthController();

    const cursorControl: ICursorControl = {
      extraMeasuresAtBeginning: 1,
      beatSubdivisions: 2,
      onFinished: () => {
        progress = 100;
        console.log("ended");
      },
    };

    // var myContext = new AudioContext();

    var createSynth = new abcjs.synth.CreateSynth();

    createSynth
      .init({ visualObj: renderedTune[0] })
      .then(function () {
        synthControl
          .setTune(renderedTune[0], false, audioParams)
          .then(function () {
            synthControl.load("#audio", cursorControl);
          })
          .then(function () {
            console.log("Audio successfully loaded.");
          })
          .then(function () {
            synthControl.play();
          })
          .catch(function (error) {
            console.warn("Audio problem:", error);
          });
      })
      .catch(function (error) {
        console.warn("Audio problem:", error);
      });

    songPlaying = true;

    // hide #audio
    const audio = document.getElementById("audio") as HTMLDivElement;
    audio.style.display = "none";
  }

  function handleChordWeightChange(event: any, chord: any) {
    const value = event.target.value;
    const chordName = chord.name;

    chords[chordName].baseMultiplier = Math.round(value * 100) / 100;
  }
</script>

<main>
  <div id="audio" class="flex justify-center w-full"></div>
  <div class="flex justify-center items-center text-xl bg-white h-20">
    <h1>Choral Sight Reading</h1>
  </div>

  <div
    id="song-options"
    class="flex flex-col items-center justify-center mx-10"
  >
    <div class="flex justify-center w-full">
      <div
        id="start"
        class="border-black bg-blue-500 rounded-md w-1/3 z-20 p-1 m-2 flex justify-center"
      >
        <button id="start" class="" on:click={handleClick}>Create</button>
      </div>
    </div>
    <!-- Dropdown for Options -->
    <div class="w-full max-w-md bg-white shadow-md rounded-lg p-4 my-4">
      <button
        on:click={() => (showDropdown = !showDropdown)}
        class="w-full bg-blue-500 text-white p-2 rounded-md text-center"
      >
        Select Options
      </button>

      <!-- Dropdown Content -->
      {#if showDropdown}
        <div class="mt-4 space-y-4">
          <!-- Select Parts -->
          <div class="text-center">
            <h2 class="text-lg">Select Parts</h2>
            <div class="flex flex-wrap justify-center">
              {#each Object.entries(possibleVoicing) as [voicing]}
                <button
                  id="voicing"
                  class="{selectedVoicing === voicing
                    ? 'bg-blue-500 hover:bg-blue-500'
                    : 'bg-blue-50'} border h-auto shadow-md hover:bg-blue-100 active:bg-blue-500 focus:ring w-1/3 rounded-md z-20 p-1 m-1"
                  on:click={handleVoicing}>{voicing}</button
                >
              {/each}
            </div>
          </div>

          <!-- Level -->
          <div class="text-center">
            <h2 class="text-lg">Level</h2>
            <div class="flex flex-wrap justify-center">
              {#each levels as level}
                <button
                  id="level"
                  class="{selectedLevel === level
                    ? 'bg-blue-500 hover:bg-blue-500'
                    : 'bg-blue-50'} border h-auto shadow-md hover:bg-blue-100 active:bg-blue-500 focus:ring w-1/3 rounded-md z-20 p-1 m-1"
                  on:click={() => (selectedLevel = level)}>{level}</button
                >
              {/each}
            </div>
          </div>

          <!-- Time Signature -->
          <div class="text-center">
            <h2 class="text-lg">Time Signature</h2>
            <div class="flex flex-wrap justify-center">
              {#each Object.entries(timeSignatures) as [timeSig]}
                <button
                  id="timeSig"
                  class="{selectedTimeSignature === timeSig
                    ? 'bg-blue-500 hover:bg-blue-500'
                    : 'bg-blue-50'} border h-auto shadow-md hover:bg-blue-100 active:bg-blue-500 focus:ring w-1/3 rounded-md z-20 p-1 m-1"
                  on:click={() => (selectedTimeSignature = timeSig)}
                  >{timeSig}</button
                >
              {/each}
            </div>
          </div>

          <!-- Max Skip -->
          <div class="text-center">
            <h2 class="text-lg">Max Skip</h2>
            <div class="flex items-center justify-center space-x-4">
              <button
                class="border shadow-md hover:bg-blue-100 active:bg-blue-500 focus:ring w-8 h-8 rounded-md"
                on:click={() => {
                  if (maxSkip > maxSkipRange[0]) maxSkip -= 1;
                }}>-</button
              >

              <span class="text-2xl">{maxSkip}</span>

              <button
                class="border shadow-md hover:bg-blue-100 active:bg-blue-500 focus:ring w-8 h-8 rounded-md"
                on:click={() => {
                  if (maxSkip < maxSkipRange[1]) maxSkip += 1;
                }}>+</button
              >
            </div>
          </div>

          <!-- Key -->
          <div class="text-center">
            <h2 class="text-lg">Key</h2>
            <div class="flex flex-wrap justify-center">
              {#each possibleKeys as key}
                <button
                  id="key"
                  class="{selectedKey === key
                    ? 'bg-blue-500 hover:bg-blue-500'
                    : 'bg-blue-50'} border h-auto shadow-md hover:bg-blue-100 active:bg-blue-500 focus:ring w-1/3 rounded-md z-20 p-1 m-1"
                  on:click={() => (selectedKey = key)}>{key}</button
                >
              {/each}
            </div>
          </div>

          <!-- Chord Weights (Progress Bar) -->
          <div class="text-center">
            <h2 class="text-lg">Chord Weights</h2>
            <div class="flex flex-wrap justify-center">
              {#each Object.values(chords) as chord, index}
                <div class="flex flex-col items-center w-1/4 my-1 mx-2">
                  <!-- Label with `for` attribute linked to the input's `id` -->
                  <label for="slider-{index}" class="text-sm mb-1"
                    >{chord.symbol}</label
                  >
                  <input
                    type="range"
                    id="slider-{index}"
                    min="0"
                    max="100"
                    value={chord.baseMultiplier}
                    on:input={(event) => handleChordWeightChange(event, chord)}
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div
      id="paper"
      class="w-full h-1/2 flex justify-center border-black bg-gray-100 rounded-md p-1 m-2"
    ></div>

    <div id="audio" class="bg-white"></div>

    <!-- progress bar -->
    <div
      id="progress-bar-container"
      class="hidden"
      style="width: 100%; background-color: #eee;"
    >
      <div
        id="progress-bar"
        style="width: {progress}%; background-color: green; height: 20px;"
      ></div>
    </div>

    {#if songPlaying}
      <div class="flex justify-center bg-white">
        <button class="border-black bg-blue-500 rounded-md p-1 m-2">
          Stop
        </button>
      </div>
    {/if}

    <div class="h-4">
      <p class="text-pink-500 text-xxl">
        {chordProgression.map((chord) => chord.name).join(" ")}
      </p>
    </div>
  </div>
</main>
