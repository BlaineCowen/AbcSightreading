<script lang="ts">
  import { onMount } from "svelte";
  import abcjs from "abcjs";
  import { chords as fullChordSet } from "../resources/chords";
  import { rhythms as allRhythms } from "../resources/rhythms";
  import {
    generateChoralExercise,
    type GenerateChoralParams,
  } from "../lib/generateChoral";
  import type { TimeSignature, PartsObject } from "../lib/types";
  import { ClefType } from "../lib/types";
  import type { Chord } from "../lib/types";
  import type { Rhythm } from "../resources/rhythms";

  let bpm = 60;

  let levels = [1, 2, 3, 4, 5];
  let selectedLevel = 1;

  const measureOptions = [2, 4, 8, 16];

  let possibleVoicing: Record<string, PartsObject> = {
    "4 Part Mixed": {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          smallName: "S",
          clef: ClefType.Treble,
          range: [14, 21],
          selectedRange: {
            1: [14, 21],
            2: [14, 21],
            3: [14, 21],
            4: [14, 21],
            5: [14, 21],
          },
        },
        Alto: {
          order: 2,
          smallName: "A",
          clef: ClefType.Treble,
          range: [12, 16],
          selectedRange: {
            1: [12, 16],
            2: [12, 16],
            3: [12, 16],
            4: [12, 16],
            5: [12, 16],
          },
        },
        Tenor: {
          order: 1,
          smallName: "T",
          clef: ClefType.TrebleOctaveDown,
          range: [7, 14],
          selectedRange: {
            1: [7, 14],
            2: [7, 14],
            3: [7, 14],
            4: [7, 14],
            5: [7, 14],
          },
        },
        Bass: {
          order: 0,
          smallName: "B",
          clef: ClefType.Bass,
          range: [2, 9],
          selectedRange: {
            1: [2, 9],
            2: [2, 9],
            3: [2, 9],
            4: [2, 9],
            5: [2, 9],
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
          clef: ClefType.Treble,
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
          clef: ClefType.Treble,
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
          clef: ClefType.Bass,
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
          clef: ClefType.Treble,
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
          clef: ClefType.Treble,
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
          clef: ClefType.Treble,
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
          clef: ClefType.TrebleOctaveDown,
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
          clef: ClefType.Bass,
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
          clef: ClefType.Bass,
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
          clef: ClefType.Treble,
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
          clef: ClefType.Treble,
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
          clef: ClefType.Treble,
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

  let timeSignatures: Record<string, TimeSignature> = {
    "4/4": {
      name: "4/4",
      tsPerMeasure: 32,
    },
    "3/4": {
      name: "3/4",
      tsPerMeasure: 24,
    },
    "2/4": {
      name: "2/4",
      tsPerMeasure: 16,
    },
  };

  let selectedTimeSignature = "4/4";

  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
  let selectedKey = "C";

  let measures = 8;
  let maxSkip = 4;
  const maxSkipRange = [2, 8];

  let chordProgression: Chord[] = [];
  let renderedString = "";
  let progress = 0.0;
  let songPlaying = false;

  let selectedVoicing = "SATB" as string;

  let showDropdown = false;

  let filterRhythms: Record<string, Rhythm> = {};

  // Filter out 32nd notes and rests, convert to Record for easy lookup
  filterRhythms = Object.fromEntries(
    allRhythms
      .filter(
        (rhythm) =>
          !rhythm.name.includes("thirtySecond") &&
          !rhythm.name.toLowerCase().includes("rest")
      )
      .map((rhythm) => [rhythm.name, rhythm])
  );

  // Default to quarter, half, and eighth notes
  let selectedRhythms: Rhythm[] = allRhythms
    .filter(
      (r) =>
        r.name === "quarter" ||
        r.name === "half" ||
        r.name === "eighth" ||
        r.name == "dotQuarterEighth" ||
        r.name == "dotHalf"
    )
    .map((r) => r as Rhythm);

  const rhythmSvgs = Object.fromEntries(
    allRhythms
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

  function loadParams() {
    const urlParams = new URLSearchParams(window.location.search);
    selectedVoicing = urlParams.get("voices") || "4 Part Mixed";
    bpm = parseInt(urlParams.get("bpm") || "60");
    selectedLevel = parseInt(urlParams.get("level") || "1");
    selectedKey = urlParams.get("key") || "C";
    measures = parseInt(urlParams.get("measures") || "8");
  }

  function updateURLParams() {
    const params = new URLSearchParams();
    params.set("key", selectedKey);
    params.set("timeSig", selectedTimeSignature);
    params.set("level", selectedLevel.toString());
    params.set("voicing", selectedVoicing);
    params.set("bpm", bpm.toString());
    params.set("maxSkip", maxSkip.toString());
    params.set("measures", measures.toString());
    window.history.replaceState({}, "", `?${params.toString()}`);
  }

  onMount(() => {
    selectedVoicing = "4 Part Mixed";
    loadParams();
  });

  const drumBeats: {
    [key: string]: string;
  } = {
    "4/4": "dddd 76 77 77 77 60 30 30 30",
    "3/4": "ddd 76 77 77 60 30 30",
  };

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

  $: {
    // Removed the console log for currentParams for brevity, or keep if useful
    // const currentParams = { ... };
    // console.log("Current params:", currentParams);
  }

  async function handleClick() {
    updateURLParams();

    const validSelectedRhythms: Rhythm[] = selectedRhythms.filter(
      (r): r is Rhythm => r !== undefined
    );
    if (validSelectedRhythms.length === 0) {
      alert("Please select at least one rhythm.");
      return;
    }

    const params: GenerateChoralParams = {
      key: selectedKey,
      timeSig: timeSignatures[selectedTimeSignature],
      partsObject: possibleVoicing[selectedVoicing],
      level: selectedLevel,
      measures: measures,
      maxSkip: maxSkip,
      bpm: bpm,
      selectedRhythms: validSelectedRhythms,
      chords: fullChordSet,
      accidentalsByStep: true,
    };

    try {
      const { abcString, chordProgression: generatedProgression } =
        generateChoralExercise(params);

      renderedString = abcString;
      chordProgression = generatedProgression as Chord[];

      const renderedTune = await renderTune();
      if (!renderedTune || renderedTune.length === 0) {
        throw new Error("Failed to render ABC notation.");
      }
      renderedTune[0].setTiming();

      const timeSigName = params.timeSig.name;
      const audioParams = {
        drum: drumBeats[timeSigName],
        drumBars: 1,
        drumIntro: 1,
      };

      const synthControl = new abcjs.synth.SynthController();
      const cursorControl: ICursorControl = {
        extraMeasuresAtBeginning: 1,
        beatSubdivisions: 2,
        onFinished: () => {
          progress = 100;
          songPlaying = false;
          console.log("ended");
        },
      };
      const createSynth = new abcjs.synth.CreateSynth();

      await createSynth.init({ visualObj: renderedTune[0] });
      await synthControl.setTune(renderedTune[0], false, audioParams);
      await synthControl.load("#audio", cursorControl);
      console.log("Audio successfully loaded.");
      await synthControl.play();
      songPlaying = true;
    } catch (error: unknown) {
      console.error("Error generating exercise:", error);
      let message = "An unknown error occurred.";
      if (error instanceof Error) {
        message = error.message;
      }
      alert(`Error generating exercise: ${message}`);
    }
  }

  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    bpm = parseInt(urlParams.get("bpm") || "60");
    selectedLevel = parseInt(urlParams.get("level") || "1");
    selectedKey = urlParams.get("key") || "C";
    measures = parseInt(urlParams.get("measures") || "8");
  }
</script>

<div class="w-full">
  <main class="flex flex-col items-center w-full max-w-4xl mx-auto pb-20">
    <div class="flex flex-col items-center w-full">
      <div id="audio" class="w-full flex justify-center"></div>

      <div
        class="w-full bg-white shadow-md rounded-lg p-4 my-4 transition-all duration-300"
      >
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

              <div class="space-y-2">
                <h2 class="text-lg font-semibold">Measures</h2>
                <div class="flex flex-wrap gap-2">
                  {#each measureOptions as measureOpt (measureOpt)}
                    <button
                      class="px-3 py-1 rounded {measures === measureOpt
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => (measures = measureOpt)}
                    >
                      {measureOpt}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-2 col-span-2">
                <h2 class="text-lg font-semibold">Rhythms</h2>
                <div class="flex flex-wrap gap-2">
                  {#each Object.values(filterRhythms) as rhythm}
                    <button
                      class="px-1 py-1 w-12 h-12 flex items-center justify-center rounded {selectedRhythms.some(
                        (r) => r?.name === rhythm.name
                      )
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100'}"
                      on:click={() => {
                        if (
                          selectedRhythms.some((r) => r?.name === rhythm.name)
                        ) {
                          selectedRhythms = selectedRhythms.filter(
                            (r) => r?.name !== rhythm.name
                          );
                        } else {
                          selectedRhythms = [...selectedRhythms, rhythm];
                        }
                      }}
                    >
                      {#await rhythmSvgs[rhythm.name]}
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
          </div>
        {/if}

        <button
          class="w-full mt-4 bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600"
          on:click={handleClick}
        >
          Generate Exercise
        </button>
      </div>

      <div id="paper" class="bg-white rounded-lg shadow-md my-4"></div>

      <div class="h-96"></div>

      {#if songPlaying}
        <div class="w-full bg-gray-200 rounded-full h-2.5 my-4">
          <div
            class="bg-blue-500 h-2.5 rounded-full"
            style="width: {progress}%"
          ></div>
        </div>
      {/if}

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

<style>
  :global(.rhythm-icon svg) {
    width: 100%;
    height: 100%;
  }
</style>
