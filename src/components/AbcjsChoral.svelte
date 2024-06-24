<script lang="ts">
  import { onMount } from "svelte";
  import { createNewSr } from "./generatePartString.ts";
  import abcjs from "abcjs";

  let bpm = 60;
  let beatsPerMeasure = 4;
  let possibleVoicing = {
    "4 Part Mixed": {
      numofParts: 4,
      parts: {
        Soprano: { range: [15, 32] },
        Alto: { range: [10, 25] },
        Tenor: { range: [8, 20] },
        Bass: { range: [0, 15] },
      },
    },
    "3 Part Mixed": {
      numofParts: 3,
      parts: {
        Soprano: { range: [15, 32] },
        Alto: { range: [10, 25] },
        Baritone: { range: [8, 20] },
      },
    },
    "3 Part Treble": {
      numofParts: 3,
      parts: {
        "Soprano 1": { range: [15, 32] },
        "Soprano 2": { range: [10, 25] },
        Alto: { range: [8, 20] },
      },
    },
    "3 Part Tenor/Bass": {
      numofParts: 3,
      parts: {
        Tenor: { range: [15, 32] },
        Baritone: { range: [10, 25] },
        Bass: { range: [8, 20] },
      },
    },
    "2 Part Treble": {
      numofParts: 2,
      parts: {
        Soprano: { range: [15, 32] },
        Alto: { range: [10, 25] },
      },
    },
    Unison: {
      numofParts: 1,
      parts: {
        Unison: { range: [15, 32] },
      },
    },
  };
  let possibleLevels = [1, 2, 3, 4, 5];
  let possibleTimeSignatures = ["4/4", "3/4", "2/4"];
  let possibleKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];

  let abcjsReturn = [];
  let chordProgression = [] as any[];
  let renderedString = "";
  let progress = 0.0;
  let measures = 8;
  let millisecondsSinceStart = 0;
  let score = 100;
  let songPlaying = false;

  let notesArray = [] as any[];
  let spacebarPressArray = [] as number[];
  let scoreArray = [] as any[];

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

  function handleKeyDown(event: KeyboardEvent) {
    if (event.code === "Space") {
      spacebarPressArray.push(millisecondsSinceStart * 10);
    }
  }

  function averageDistance(
    arr1: number[],
    arr2: number[],
    baseDifference: number
  ): number {
    // Sort both arrays
    let sortedArr1 = [...arr1].sort((a, b) => a - b);
    let sortedArr2 = [...arr2].sort((a, b) => a - b);

    // Identify the smaller and larger array
    let smaller: number[], larger: number[];
    if (sortedArr1.length <= sortedArr2.length) {
      smaller = sortedArr1;
      larger = sortedArr2;
    } else {
      smaller = sortedArr2;
      larger = sortedArr1;
    }

    // Calculate the distances for matched pairs
    let distances: number[] = [];
    for (let num of smaller) {
      // Find the closest number in the larger array
      let closestIndex = 0;
      let closestNum = larger[0];
      let minDistance = Math.abs(num - closestNum);
      for (let i = 1; i < larger.length; i++) {
        let distance = Math.abs(num - larger[i]);
        if (distance < minDistance) {
          minDistance = distance;
          closestNum = larger[i];
          closestIndex = i;
        } else {
          break; // Since arrays are sorted, stop if distance increases
        }
      }
      // min dist is sq root ofmin dist
      minDistance = Math.sqrt(minDistance);
      // round to 2 dec
      minDistance = Math.round(minDistance * 100) / 100;

      distances.push(minDistance);
      let progressCheck = progress;

      scoreArray.push([progress, minDistance]);

      // Remove the matched number to prevent reuse
      larger.splice(closestIndex, 1);
    }

    // Add base differences for remaining unmatched numbers in the larger array
    let unmatchedCount = larger.length;
    distances.push(...Array(unmatchedCount).fill(baseDifference));

    // Calculate the average distance
    let totalDistance = distances.reduce((acc, val) => acc + val, 0);
    let averageDist = totalDistance / (arr1.length + arr2.length);

    return averageDist;
  }

  let baseDifference: number = 25;

  // Function to continuously update the score
  function updateScore() {
    if (notesArray.length > 0 && spacebarPressArray.length > 0) {
      score =
        100 - averageDistance(notesArray, spacebarPressArray, baseDifference);
      score = Math.round(score);
      // check if spacebar is longer than notes

      if (spacebarPressArray.length > notesArray.length) {
        score = score - (spacebarPressArray.length - notesArray.length) * 10;
      }
    }
  }

  // Run the updateScore function continuously every second
  setInterval(updateScore, 1000);

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
  });

  interface NoteEvent {
    milliseconds: number;
  }

  interface ICursorControl {
    extraMeasuresAtBeginning?: number;
    beatSubdivisions: number;
    onEvent: (event: NoteEvent) => void;
    onBeat: (beatNumber: number, totalBeats: number) => void;
    onStart: () => void;
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
      onEvent: (event: NoteEvent) => {
        let millisecondOfNote: number = event["milliseconds"];
        notesArray.push(millisecondOfNote);
      },
      onBeat: (beatNumber: number, totalBeats: number) => {
        if (beatNumber == beatsPerMeasure) {
          const startTime = Date.now();
          setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            progress = (elapsedTime / totalTime - measureTime) / 10;

            if (progress > 100) progress = 100;
          }, 1);
        }
      },
      onStart: () => {
        const secretStartTime = Date.now();
        setInterval(() => {
          const secretElapsedTime = Date.now() - secretStartTime;
          millisecondsSinceStart = secretElapsedTime / 10;
        }, 1);
      },
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

    <div class="flex justify-center bg-white w-full">
      <h1>Range</h1>
    </div>
    <div id="range-box" class="flex justify-center w-full">
      <!-- make a range slider using tailwind -->
      <input
        type="range"
        id="range"
        name="range"
        min="0"
        max="32"
        class="w-1/3"
      />
      <span class="text-sm">0</span>
      <span class="text-sm">32</span>
    </div>
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

    <!-- display score -->
    <div class="flex justify-center bg-white">
      <h1 class="text-2xl">{score}</h1>
    </div>
  </div>
</main>
