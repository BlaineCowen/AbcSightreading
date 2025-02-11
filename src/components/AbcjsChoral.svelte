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

  // function handleVoicing(event: any) {
  //   selectedVoicing = event.target.innerText;
  //   console.log(selectedVoicing);
  // }

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
        scale: 1.5,
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

<div class="w-full">
  <main class="flex flex-col items-center w-full max-w-4xl mx-auto pb-20">
    <div class="flex flex-col items-center w-full">
      <div id="audio" class="w-full flex justify-center"></div>

      <!-- Options Panel -->
      <div
        class="w-full bg-white shadow-md rounded-lg p-4 my-4 transition-all duration-300"
      >
        <!-- Header with minimize button -->
        <div class="flex justify-between items-center mb-2">
          <h2 class="text-lg font-semibold">Options</h2>
          <button
            class="p-1 hover:bg-gray-100 rounded"
            on:click={() => (showDropdown = !showDropdown)}
          >
            {#if showDropdown}
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

        {#if showDropdown}
          <div class="space-y-4 overflow-hidden transition-all duration-300">
            <div class="grid grid-cols-2 gap-4">
              <!-- Voicing Selection -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Voicing</h2>
                <div class="flex flex-wrap gap-2">
                  {#each Object.keys(possibleVoicing) as voicing}
                    <button
                      class="px-3 py-1 rounded {selectedVoicing === voicing
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (selectedVoicing = voicing)}
                    >
                      {voicing}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Level Selection -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Level</h2>
                <div class="flex flex-wrap gap-2">
                  {#each levels as level}
                    <button
                      class="px-3 py-1 rounded {selectedLevel === level
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (selectedLevel = level)}
                    >
                      {level}
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

              <!-- Max Skip -->
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Max Skip</h2>
                <div class="flex items-center gap-4">
                  <button
                    class="px-3 py-1 rounded bg-gray-100"
                    on:click={() => {
                      if (maxSkip > maxSkipRange[0]) maxSkip -= 1;
                    }}
                  >
                    -
                  </button>
                  <span>{maxSkip}</span>
                  <button
                    class="px-3 py-1 rounded bg-gray-100"
                    on:click={() => {
                      if (maxSkip < maxSkipRange[1]) maxSkip += 1;
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <!-- Chord Weights -->
              <div class="space-y-2 col-span-2">
                <h2 class="text-lg font-semibold">Chord Weights</h2>
                <div class="grid grid-cols-4 gap-4">
                  {#each Object.values(chords) as chord}
                    <div class="flex flex-col gap-1">
                      <label for={chord.symbol} class="text-sm"
                        >{chord.symbol}</label
                      >
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={chord.baseMultiplier}
                        on:input={(event) =>
                          handleChordWeightChange(event, chord)}
                        class="w-full"
                      />
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Generate Button -->
        <button
          class="w-full mt-4 bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600"
          on:click={handleClick}
        >
          Generate Exercise
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

      <!-- Chord Progression Display -->
      {#if chordProgression.length > 0}
        <div class="text-center mt-4">
          <p class="text-gray-600">
            {chordProgression.map((chord) => chord.name).join(" ")}
          </p>
        </div>
      {/if}
    </div>
  </main>
</div>
