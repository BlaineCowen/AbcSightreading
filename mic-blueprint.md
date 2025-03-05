# Microphone Pitch Detection Implementation

## Overview
Add real-time pitch detection using the Web Audio API and Pitchy.js to show the current sung note's solfege based on the selected key.

## Dependencies
```bash
npm install pitchy @types/pitchy
```

## Components

### 1. MicrophonePitch.svelte
New component to handle pitch detection and solfege display.

```typescript
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { PitchDetector } from 'pitchy';
  
  export let selectedKey: string;
  
  let audioContext: AudioContext;
  let analyser: AnalyserNode;
  let detector: any;
  let stream: MediaStream;
  let isListening = false;
  let currentNote = '';
  let currentSolfege = '';
  
  // Key to frequency mapping (middle C = C4 = 261.63Hz)
  const keyToRootFreq: Record<string, number> = {
    'C': 261.63,
    'G': 392.00,
    'D': 293.66,
    'A': 440.00,
    'E': 329.63,
    'B': 493.88,
    'F': 349.23,
    'Bb': 466.16,
    'Eb': 311.13,
    'Ab': 415.30,
    'Db': 277.18
  };
  
  // Solfege scale degrees (relative to root)
  const solfegeMap = [
    { degree: 0, name: 'do' },
    { degree: 2, name: 're' },
    { degree: 4, name: 'mi' },
    { degree: 5, name: 'fa' },
    { degree: 7, name: 'sol' },
    { degree: 9, name: 'la' },
    { degree: 11, name: 'ti' }
  ];
  
  async function startListening() {
    try {
      audioContext = new AudioContext();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      source.connect(analyser);
      
      detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const input = new Float32Array(detector.inputLength);
      
      isListening = true;
      
      function analyze() {
        if (!isListening) return;
        
        analyser.getFloatTimeDomainData(input);
        const [pitch, clarity] = detector.findPitch(input, audioContext.sampleRate);
        
        if (clarity > 0.8) { // Only process clear pitches
          updateNote(pitch);
        }
        
        requestAnimationFrame(analyze);
      }
      
      analyze();
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  }
  
  function updateNote(frequency: number) {
    const rootFreq = keyToRootFreq[selectedKey];
    const semitoneDistance = 12 * Math.log2(frequency / rootFreq);
    const normalizedDistance = Math.round(semitoneDistance) % 12;
    
    const solfege = solfegeMap.find(s => s.degree === normalizedDistance);
    if (solfege) {
      currentSolfege = solfege.name;
    }
  }
  
  function stopListening() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
      audioContext.close();
    }
    isListening = false;
  }
  
  onDestroy(() => {
    stopListening();
  });
</script>

<div class="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 z-50">
  <div class="flex items-center gap-4">
    <button
      class="px-4 py-2 rounded {isListening ? 'bg-red-500' : 'bg-blue-500'} text-white"
      on:click={() => isListening ? stopListening() : startListening()}
    >
      {isListening ? 'Stop Mic' : 'Start Mic'}
    </button>
    {#if isListening}
      <div class="text-2xl font-bold">
        {currentSolfege || '---'}
      </div>
    {/if}
  </div>
</div>
```

### 2. Integration in AbcjsSingle.svelte

Add the following to your existing component:

```typescript
import MicrophonePitch from './MicrophonePitch.svelte';

// In your template section:
<MicrophonePitch {selectedKey} />
```

## Features

1. **Real-time Pitch Detection**
   - Uses Web Audio API for audio input
   - Pitchy.js for accurate pitch detection
   - Updates at 60fps using requestAnimationFrame

2. **Solfege Mapping**
   - Maps detected frequencies to scale degrees
   - Shows solfege syllables based on current key
   - Handles all supported keys (Ab through E)

3. **UI Elements**
   - Sticky div in bottom-right corner
   - Start/Stop microphone button
   - Clear solfege display
   - Minimal, modern design matching existing UI

4. **Error Handling**
   - Graceful microphone permission handling
   - Clear error messages for unsupported browsers
   - Cleanup on component destruction

## Technical Notes

1. **Pitch Detection Accuracy**
   - Uses clarity threshold (0.8) to avoid false readings
   - Normalizes frequencies to nearest semitone
   - Handles octave independence

2. **Performance**
   - Efficient frequency-to-solfege mapping
   - Minimal UI updates to prevent jank
   - Proper cleanup of audio resources

3. **Browser Support**
   - Requires Web Audio API support
   - Needs secure context (HTTPS) for getUserMedia
   - Falls back gracefully on unsupported browsers

## Future Enhancements

1. **Pitch Accuracy Display**
   - Visual indicator for how close to perfect pitch
   - Cents deviation display

2. **Recording Feature**
   - Save recorded attempts
   - Playback capability

3. **Multiple Voice Support**
   - Handle multiple simultaneous pitches
   - Chord detection

4. **Visual Feedback**
   - Waveform visualization
   - Color coding for pitch accuracy

## Implementation Steps

1. Install dependencies
2. Create MicrophonePitch component
3. Add to AbcjsSingle
4. Test across different keys
5. Add error handling
6. Polish UI/UX
7. Add browser compatibility checks 