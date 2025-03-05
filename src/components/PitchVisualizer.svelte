<script lang="ts">
  import { onDestroy } from "svelte";
  import { PitchDetector } from "pitchy";

  export let selectedKey: string;
  export let selectableArray: any[] = [];

  let isListening = false;
  let currentSolfege = "";
  let currentOctave = 0;
  let currentCents = 0;
  let micError: string | null = null;
  let currentNoteIndex = 0;
  let noteInTuneStartTime: number | null = null;
  const REQUIRED_IN_TUNE_TIME = 500; // Time in ms note must be in tune

  // Improve smoothing and analysis
  let lastPitch = 0;
  let smoothingFactor = 0.2; // Reduced for more stability
  let pitchHistory: number[] = [];
  const HISTORY_SIZE = 8; // Increased for better stability
  const MIN_AMPLITUDE = 0.01;
  const CLARITY_THRESHOLD = 0.75;

  // Add frequency constants
  const A4_FREQ = 440.0;
  const CENTS_PER_SEMITONE = 100;

  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let gainNode: GainNode | null = null;
  let stream: MediaStream | null = null;
  let detector: any = null;
  let rafId: number | null = null;

  // Key to frequency mapping (middle C = C4 = 261.63Hz)
  const keyToRootFreq: Record<string, number> = {
    C: 261.63,
    G: 392.0,
    D: 293.66,
    A: 440.0,
    E: 329.63,
    B: 493.88,
    F: 349.23,
    Bb: 466.16,
    Eb: 311.13,
    Ab: 415.3,
    Db: 277.18,
  };

  // Solfege scale degrees (relative to root) in reverse order for display
  const solfegeMap = [
    { degree: 11, name: "ti" },
    { degree: 9, name: "la" },
    { degree: 7, name: "sol" },
    { degree: 5, name: "fa" },
    { degree: 4, name: "mi" },
    { degree: 2, name: "re" },
    { degree: 0, name: "do" },
  ];

  // Enhanced frequency to note mapping
  function freqToNote(frequency: number): { note: number; cents: number } {
    const noteNum = 12 * Math.log2(frequency / A4_FREQ) + 69;
    const closestNote = Math.round(noteNum);
    const cents = Math.round((noteNum - closestNote) * CENTS_PER_SEMITONE);
    return { note: closestNote, cents };
  }

  async function startListening() {
    try {
      audioContext = new AudioContext();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContext.createMediaStreamSource(stream);

      // Enhanced gain and analysis setup
      gainNode = audioContext.createGain();
      gainNode.gain.value = 1.5; // Reduced gain for better stability

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 8192; // Increased for better frequency resolution
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.8; // Increased smoothing

      source.connect(gainNode);
      gainNode.connect(analyser);

      detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const input = new Float32Array(detector.inputLength);

      function analyze() {
        if (!isListening || !analyser || !detector) return;

        analyser.getFloatTimeDomainData(input);

        // Calculate RMS amplitude for better noise rejection
        const rms = Math.sqrt(
          input.reduce((acc, val) => acc + val * val, 0) / input.length
        );

        if (rms > MIN_AMPLITUDE) {
          const [pitch, clarity] = detector.findPitch(
            input,
            audioContext!.sampleRate
          );

          if (clarity > CLARITY_THRESHOLD) {
            // Apply exponential moving average for pitch smoothing
            if (lastPitch === 0) {
              lastPitch = pitch;
            } else {
              lastPitch =
                lastPitch * (1 - smoothingFactor) + pitch * smoothingFactor;
            }

            // Enhanced pitch history management
            pitchHistory.push(lastPitch);
            if (pitchHistory.length > HISTORY_SIZE) {
              pitchHistory.shift();
            }

            // Use median filtering with weighted recent samples
            const recentPitches = [...pitchHistory].sort((a, b) => a - b);
            const medianPitch =
              recentPitches[Math.floor(recentPitches.length / 2)];

            updateNote(medianPitch);
          }
        }

        rafId = requestAnimationFrame(analyze);
      }

      isListening = true;
      micError = null;
      analyze();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      micError = "Could not access microphone. Please check permissions.";
      isListening = false;
    }
  }

  function updateNote(frequency: number) {
    const rootFreq = keyToRootFreq[selectedKey];
    if (!rootFreq) return;

    // Get the note number and cents relative to A4
    const { note: noteNum, cents: rawCents } = freqToNote(frequency);

    // Calculate the distance from the root note
    const rootNoteNum = Math.round(12 * Math.log2(rootFreq / A4_FREQ) + 69);
    const semitoneDistance = noteNum - rootNoteNum;

    // Calculate corrected cents
    const correctedCents = Math.max(-50, Math.min(50, rawCents));
    currentCents = correctedCents;

    // Calculate octave and scale degree
    const normalizedDistance = ((semitoneDistance % 12) + 12) % 12;
    const octaveShift = Math.floor(semitoneDistance / 12);

    // Update octave
    currentOctave = 4 + octaveShift;

    // Find corresponding solfege
    const solfege = solfegeMap.find((s) => s.degree === normalizedDistance);
    if (solfege && pitchHistory.length >= HISTORY_SIZE - 1) {
      currentSolfege = solfege.name;

      // Check if we're on the correct note
      if (
        selectableArray.length > 0 &&
        currentNoteIndex < selectableArray.length
      ) {
        const currentNote = selectableArray[currentNoteIndex];
        if (currentNote?.absEl?.abcelem?.pitches?.[0]) {
          const targetPitch = currentNote.absEl.abcelem.pitches[0];
          const isCorrectNote =
            Math.abs((semitoneDistance % 12) - targetPitch.pitch) < 1;
          const isInTune = Math.abs(correctedCents) <= 10;

          if (isCorrectNote && isInTune) {
            if (!noteInTuneStartTime) {
              noteInTuneStartTime = Date.now();
            } else if (
              Date.now() - noteInTuneStartTime >=
              REQUIRED_IN_TUNE_TIME
            ) {
              // Move to next note
              currentNoteIndex++;
              noteInTuneStartTime = null;
              // Dispatch event for visualization update
              const event = new CustomEvent("noteProgression", {
                detail: { index: currentNoteIndex },
              });
              window.dispatchEvent(event);
            }
          } else {
            noteInTuneStartTime = null;
          }
        }
      }
    }
  }

  function stopListening() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    isListening = false;
    currentSolfege = "";
    currentCents = 0;
    lastPitch = 0;
    pitchHistory = [];
    currentOctave = 0;
    currentNoteIndex = 0;
    noteInTuneStartTime = null;
  }

  onDestroy(() => {
    stopListening();
  });
</script>

<div class="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 z-50">
  <div class="flex gap-4">
    <!-- Pitch visualization -->
    <div class="relative h-80 w-16 bg-gray-100 rounded-lg">
      <!-- Note progress indicator -->
      {#if selectableArray.length > 0}
        <div class="absolute top-0 left-0 w-full">
          <div class="text-xs text-gray-500 mb-1">
            Note {currentNoteIndex + 1} of {selectableArray.length}
          </div>
          <div class="w-full bg-gray-200 h-1 rounded-full">
            <div
              class="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style="width: {(currentNoteIndex / selectableArray.length) *
                100}%"
            ></div>
          </div>
        </div>
      {/if}

      {#each solfegeMap as { name }, i}
        <!-- Target zone (±10 cents) -->
        <div
          class="absolute left-0 w-full h-[10%] bg-green-100/20"
          style="top: {(i * 100) / (solfegeMap.length - 1) - 2.5}%"
        />
        <!-- Note label -->
        <div
          class="absolute left-0 w-full text-right pr-2 text-sm font-medium"
          style="top: {(i * 100) / (solfegeMap.length - 1)}%"
        >
          {name}
        </div>
      {/each}

      <!-- Pitch indicator -->
      {#if isListening && currentSolfege}
        {@const solfegeIndex = solfegeMap.findIndex(
          (s) => s.name === currentSolfege
        )}
        {@const basePosition = (solfegeIndex * 100) / (solfegeMap.length - 1)}
        {@const centOffset =
          (currentCents / 100) * (100 / (solfegeMap.length - 1))}
        {@const isInTune = Math.abs(currentCents) <= 10}
        {@const color = isInTune
          ? "bg-green-500"
          : currentCents > 0
            ? "bg-red-500"
            : "bg-blue-500"}
        <div
          class="absolute left-0 w-full h-1 transition-all duration-100 flex items-center justify-end pr-1"
          style="top: {basePosition + centOffset}%"
        >
          <div class="{color} w-full h-full"></div>
          {#if !isInTune}
            <div
              class="absolute right-0 text-sm {currentCents > 0
                ? 'rotate-90'
                : '-rotate-90'}"
              style="color: {currentCents > 0 ? '#ef4444' : '#3b82f6'}"
            >
              ➤
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Controls -->
    <div class="flex flex-col items-center gap-2">
      <button
        class="px-4 py-2 rounded text-white {isListening
          ? 'bg-red-500 hover:bg-red-600'
          : 'bg-blue-500 hover:bg-blue-600'}"
        on:click={() => (isListening ? stopListening() : startListening())}
      >
        {isListening ? "Stop Mic" : "Start Mic"}
      </button>

      {#if micError}
        <div class="text-red-500 text-sm">
          {micError}
        </div>
      {/if}

      {#if isListening}
        <div class="text-2xl font-bold min-w-[3ch] text-center">
          {currentSolfege || "---"}
          {#if currentSolfege}
            <span class="text-lg text-gray-500 ml-1">{currentOctave}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .transition-all {
    transition-property: all;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>
