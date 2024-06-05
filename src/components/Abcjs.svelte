
<script lang="ts">

  import { onMount } from 'svelte';
  import { createNewSr, generateTune } from './renderer.ts';
  import abcjs from 'abcjs';
  import Spacebar from './Spacebar.svelte'; 


  let bpm = 60;
  let beatsPerMeasure = 4;
  let renderedString = "";
  let progress = 0.0;
  let measures = 8;
  let millisecondsSinceStart = 0;
  let score = 100;
    

  let notesArray = [] as any[];
  let spacebarPressArray = [] as number[];

  const drumBeats = {
    "4/4": "dddd 76 77 77 77 60 30 30 30",
  }

  var audioParams = {drum: drumBeats['4/4'], drumBars: 1,  drumIntro: 1};

  function handleKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space') {
          spacebarPressArray.push(millisecondsSinceStart * 10);
          console.log("spacebar array: ", spacebarPressArray);
      }
  }

  function averageDistance(arr1: number[], arr2: number[], baseDifference: number): number {

    console.log(
      "arr1: ", arr1,
      "arr2: ", arr2,
      "baseDifference: ", baseDifference
    );
    
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
        if (minDistance < 20 ){
          minDistance = 0;
        
        }
        else if (minDistance >= 20 && minDistance < 40){
          minDistance = 5;
        }
        else if (minDistance >= 40 && minDistance < 60){
          minDistance = 10;
        }
        else if (minDistance >= 60 && minDistance < 80){
          minDistance = 15;
        }
        else {
          minDistance = 25;
        
        }
        distances.push(minDistance);
        // Remove the matched number to prevent reuse
        larger.splice(closestIndex, 1);
    }

    // Add base differences for remaining unmatched numbers in the larger array
    let unmatchedCount = larger.length;
    distances.push(...Array(unmatchedCount).fill(baseDifference));

    console.log("Distances: ", distances);
    

    // Calculate the average distance
    let totalDistance = distances.reduce((acc, val) => acc + val, 0);
    let averageDist = totalDistance / (arr1.length + arr2.length);
    
    
    return averageDist;
}

let baseDifference: number = 25;

// Function to continuously update the score
function updateScore() {

if (notesArray.length > 0 && spacebarPressArray.length > 0) {
  score = 100 - averageDistance(notesArray, spacebarPressArray, baseDifference);
  score = Math.round(score);
  // check if spacebar is longer than notes
  if (spacebarPressArray.length > notesArray.length) {
    score = score - (spacebarPressArray.length - notesArray.length) * 10;
  }
}
}

// Run the updateScore function continuously every second
setInterval(updateScore, 1000);
console.log(`Average Distance: ${score}`);


  onMount(() => {
      window.addEventListener('keydown', handleKeyDown);
  });

  interface NoteEvent {
    milliseconds: number;
  }

  interface ICursorControl {
    extraMeasuresAtBeginning?: number;
    beatSubdivisions: number;
    onEvent: (event: NoteEvent) => void;
    onBeat: (beatNumber: number, totalBeats: number, ) => void;
    onStart: () => void;
    onFinished: () => void;

  }

  async function renderTune(): Promise<any> {
  return import('abcjs').then((abcjs) => {
    var renderedTune = abcjs.renderAbc("paper", renderedString);
    return renderedTune;
  });    
}

async function handleClick() {

      // reset abcjs
  const params = {
    bpm: bpm,
    key: 'D',
    timeSig: '4/4',
    notes: generateTune(measures),
    measures: measures
  };


  renderedString = createNewSr(params);

  const renderedTune = await renderTune();

  renderedTune[0].setTiming();

  const totalTime = renderedTune[0].getTotalTime();

  const measureTime = renderedTune[0].getTotalTime() / measures;
      

  console.log("here is audio")
  var synthControl = new abcjs.synth.SynthController();


  const cursorControl: ICursorControl = {
    extraMeasuresAtBeginning: 1,
    beatSubdivisions: 2,
    onEvent: (event: NoteEvent) => {
      let millisecondOfNote: number = event["milliseconds"];
      notesArray.push(millisecondOfNote);
      console.log("note array: ", notesArray);
      
    },
    onBeat: (beatNumber: number, totalBeats: number) => {
      if (beatNumber == beatsPerMeasure) {
        const startTime = Date.now();
      setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        progress = (elapsedTime / totalTime - measureTime)/10;

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
    }
  };

  synthControl.load("#audio", cursorControl, {
    displayLoop: true, 
    displayRestart: true, 
    displayPlay: true, 
    displayProgress: true, 
    displayWarp: true
  });

  var myContext = new AudioContext();

  var createSynth = new abcjs.synth.CreateSynth();

  createSynth.init({ visualObj: renderedTune[0] }).then(function () {
    synthControl.setTune(renderedTune[0], false, audioParams).then(function () {
      console.log("Audio successfully loaded.")
    }).catch(function (error) {
      console.warn("Audio problem:", error);
    });
  }).catch(function (error) {
    console.warn("Audio problem:", error);
  });
};

</script>


<main>
<div class="flex justify-center bg-white">
<div id="paper" class="bg-white"></div>
</div>

<div class="flex justify-center bg-white">
<h1 class="text-2xl">{bpm}</h1>


<button > type="primary" id="start" on:click={handleClick}>Start Game 
</button>



</div>

<div id="audio" class="bg-white"></div>

<!-- progress bar -->
<div id="progress-bar-container" style="width: 100%; background-color: #eee;">
<div id="progress-bar" style="width: {progress}%; background-color: #007BFF; height: 20px;"></div>
</div>

<!-- create div that is a long rectangle with rounded corners -->

<div id="spacebar-container" class ="p-10 bg-gray-50 flex justify-center">

<Spacebar></Spacebar>

</div>

<!-- display score -->
<div class="flex justify-center bg-white">  
<h1 class="text-2xl">{score}</h1>
</div>
</main>


