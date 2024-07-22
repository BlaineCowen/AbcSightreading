<script lang="ts">
  import { onMount } from "svelte";
  import { createNewSr } from "./generatePartString.ts";
  import abcjs from "abcjs";
  import Slider from "@bulatdashiev/svelte-slider";
  import { nonChordToneGenerator } from "./nonChordToneGen";

  let bpm = 60;
  let beatsPerMeasure = 4;

  let baseNoteArray = [
    "C,,",
    "D,,",
    "E,,",
    "F,,",
    "G,,",
    "A,,",
    "B,,",
    "C,",
    "D,",
    "E,",
    "F,",
    "G,",
    "A,",
    "B,",
    "C",
    "D",
    "E",
    "F",
    "G",
    "A",
    "B",
    "c",
    "d",
    "e",
    "f",
    "g",
    "a",
    "b",
    "c'",
    "d'",
    "e'",
    "f'",
    "g'",
    "a'",
    "b'",
    "c''",
  ];

  let possibleVoicing: {
    [key: string]: {
      numofParts: number;
      parts: {
        [key: string]: {
          order: number;
          clef: string;
          range: number[];
          selectedRange: number[];
        };
      };
    };
  } = {
    "4 Part Mixed": {
      numofParts: 4,
      parts: {
        Soprano: {
          order: 3,
          clef: "treble",
          range: [20, 32],
          selectedRange: [16, 25],
        },
        Alto: {
          order: 2,
          clef: "treble",
          range: [15, 25],
          selectedRange: [15, 23],
        },
        Tenor: {
          order: 1,
          clef: "treble-8",
          range: [10, 32],
          selectedRange: [8, 17],
        },
        Bass: {
          order: 0,
          clef: "bass",
          range: [0, 15],
          selectedRange: [0, 15],
        },
      },
    },
    "3 Part Mixed": {
      numofParts: 3,
      parts: {
        Soprano: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Alto: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Baritone: {
          order: 0,
          clef: "bass",
          range: [8, 20],
          selectedRange: [8, 20],
        },
      },
    },
    "3 Part Treble": {
      numofParts: 3,
      parts: {
        Soprano1: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Soprano2: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Alto: {
          order: 0,
          clef: "treble",
          range: [8, 20],
          selectedRange: [8, 20],
        },
      },
    },
    "3 Part Tenor/Bass": {
      numofParts: 3,
      parts: {
        Tenor: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Baritone: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Bass: {
          order: 0,
          clef: "treble",
          range: [8, 20],
          selectedRange: [8, 20],
        },
      },
    },
    "2 Part Treble": {
      numofParts: 2,
      parts: {
        Soprano1: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Soprano2: {
          order: 0,
          clef: "treble",
          range: [0, 15],
          selectedRange: [0, 15],
        },
        Alto: {
          order: 0,
          clef: "treble",
          range: [10, 25],
          selectedRange: [10, 25],
        },
      },
    },
    Unison: {
      numofParts: 1,
      parts: {
        Unison: {
          order: 0,
          clef: "treble",
          range: [0, 32],
          selectedRange: [0, 32],
        },
      },
    },
  };

  function updateRange(partName: string, newRange: number[]) {
    console.log(partName, newRange);

    const parts = possibleVoicing[selectedVoicing].parts;
    parts[partName].selectedRange = newRange;
    possibleVoicing[selectedVoicing].parts = { ...parts }; // Reassign to trigger reactivity
  }

  let possibleLevels = [1, 2, 3, 4, 5];
  let possibleTimeSignatures = ["4/4", "3/4", "2/4"];
  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

  let abcjsReturn = [];
  let chordProgression = [] as any[];
  let renderedString = "";
  let progress = 0.0;
  let measures = 8;

  let songPlaying = false;

  let selectedVoicing = "" as string;

  onMount(() => {
    selectedVoicing = "4 Part Mixed";
  });

  function handleVoicing(event: any) {
    selectedVoicing = event.target.innerText;
    console.log(selectedVoicing);
  }

  const drumBeats = {
    "4/4": "dddd 76 77 77 77 60 30 30 30",
  };

  var audioParams = { drum: drumBeats["4/4"], drumBars: 1, drumIntro: 1 };

  interface NoteEvent {
    milliseconds: number;
  }

  interface ICursorControl {
    extraMeasuresAtBeginning?: number;
    beatSubdivisions: number;
    onFinished: () => void;
  }

  async function renderTune(): Promise<any> {
    return import("abcjs").then((abcjs) => {
      var renderedTune = abcjs.renderAbc("paper", renderedString);
      return renderedTune;
    });
  }

  async function handleClick() {
    // show progress bar
    const progressBarContainer = document.getElementById(
      "progress-bar-container"
    ) as HTMLDivElement;
    progressBarContainer.style.display = "block";

    // hide start button
    const startButton = document.getElementById("start") as HTMLButtonElement;
    startButton.style.display = "none";

    // reset abcjs
    const params = {
      bpm: bpm,
      key: "Bb",
      timeSig: "4/4",
      measures: measures,
      partsObject: possibleVoicing[selectedVoicing],
    };

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

    const totalTime = renderedTune[0].getTotalTime();

    const measureTime = renderedTune[0].getTotalTime() / measures;

    var synthControl = new abcjs.synth.SynthController();

    const cursorControl: ICursorControl = {
      extraMeasuresAtBeginning: 1,
      beatSubdivisions: 2,
      onFinished: () => {
        progress = 100;
        console.log("ended");
      },
    };

    var myContext = new AudioContext();

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
</script>

<main>
  <div id="audio" class="flex justify-center"></div>
  <div class="flex justify-center bg-white">
    <h1>Choral Sight Reading</h1>
    <h1>Select Parts</h1>
  </div>
  <div class="flex-wrap justify-center">
    <div class="flex justify-center bg-white mx-10">
      {#each Object.entries(possibleVoicing) as [voicing, value]}
        <button
          id="voicing"
          class="{selectedVoicing === voicing
            ? 'bg-blue-500 hover:bg-blue-500'
            : 'bg-blue-50'} border-1 h-auto shadow-md hover:bg-blue-100 active:bg-blue-500 focus:ring w-1/6 rounded-md z-20 p-1 m-2"
          on:click={handleVoicing}>{voicing}</button
        >
      {/each}
    </div>

    <div class="flex justify-center h-auto bg-white w-full">
      <h1>Range</h1>
    </div>
    {#if possibleVoicing[selectedVoicing]}
      {#each Object.entries(possibleVoicing[selectedVoicing].parts) as [partName, partDetails]}
        <div class="flex justify-center bg-white">
          <h1>{partName}</h1>
          <p>{partDetails.selectedRange[0]}</p>
          <Slider
            min={0}
            max={baseNoteArray.length - 1}
            step={1}
            range={true}
            bind:value={partDetails.selectedRange}
            on:input={() => updateRange(partName, partDetails.selectedRange)}
          />
          <p>{partDetails.selectedRange[1]}</p>
        </div>
      {/each}
    {/if}

    <div class="flex justify-center w-full">
      <div
        id="start"
        class="border-black bg-blue-500 rounded-md w-1/3 z-20 p-1 m-2 flex justify-center"
      >
        <button id="start" class="" on:click={handleClick}>Create</button>
      </div>
    </div>

    <div id="paper" class="boarder-black bg-gray-100 rounded-md p-1 m-2"></div>

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

    <p class="text-yellow-100">
      {chordProgression.map((chord) => chord.name).join(" ")}
    </p>

    <!-- create div that is a long rectangle with rounded corners -->
  </div>
</main>
