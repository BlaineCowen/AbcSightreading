<!-- src/components/PlaybackBar.svelte -->
<script lang="ts">
  export let isPlaying: boolean = false;
  export let bpm: number = 60;
  export let looping: boolean = false;
  export let voiceNames: string[] = [];
  export let mutedVoices: Set<string> = new Set();
  export let hasExercise: boolean = false;

  export let onPlay: () => void;
  export let onPause: () => void;
  export let onStop: () => void;
  export let onRestart: () => void;
  export let onBpmChange: (bpm: number) => void;
  export let onToggleLoop: () => void;
  export let onToggleMute: (voiceName: string) => void;
  export let onShare: () => void;
  export let onPrint: () => void;
</script>

<div class="playback-bar fixed bottom-0 left-0 right-0 bg-slate-800 text-slate-100 px-4 py-2 flex items-center gap-4 flex-wrap z-50 shadow-lg">
  <!-- Transport -->
  <div class="flex gap-2 items-center">
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-sm disabled:opacity-40"
      disabled={!hasExercise}
      on:click={onRestart}
      title="Restart"
    >⏮</button>

    {#if isPlaying}
      <button
        class="bg-blue-500 hover:bg-blue-400 rounded px-3 py-1 text-sm font-bold disabled:opacity-40"
        disabled={!hasExercise}
        on:click={onPause}
      >⏸ Pause</button>
    {:else}
      <button
        class="bg-blue-500 hover:bg-blue-400 rounded px-3 py-1 text-sm font-bold disabled:opacity-40"
        disabled={!hasExercise}
        on:click={onPlay}
      >▶ Play</button>
    {/if}

    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-sm disabled:opacity-40"
      disabled={!hasExercise}
      on:click={onStop}
      title="Stop"
    >⏹</button>

    <button
      class="rounded px-2 py-1 text-sm {looping ? 'bg-amber-500 text-white' : 'bg-slate-600 hover:bg-slate-500'}"
      on:click={onToggleLoop}
      title="Loop"
    >🔁</button>
  </div>

  <!-- Divider -->
  <div class="w-px h-6 bg-slate-600 hidden sm:block"></div>

  <!-- BPM -->
  <div class="flex items-center gap-2">
    <span class="text-xs text-slate-400 uppercase tracking-wide">BPM</span>
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-0.5 text-sm"
      on:click={() => onBpmChange(Math.max(40, bpm - 5))}
    >−</button>
    <input
      type="range"
      min="40"
      max="200"
      value={bpm}
      on:input={(e) => onBpmChange(+(e.currentTarget as HTMLInputElement).value)}
      class="w-20 accent-blue-500"
    />
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-0.5 text-sm"
      on:click={() => onBpmChange(Math.min(200, bpm + 5))}
    >+</button>
    <span class="font-bold text-sm w-8">{bpm}</span>
  </div>

  <!-- Voice Mutes -->
  {#if voiceNames.length > 1}
    <div class="w-px h-6 bg-slate-600 hidden sm:block"></div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-slate-400 uppercase tracking-wide">Voices</span>
      {#each voiceNames as name}
        <button
          class="rounded px-2 py-1 text-xs font-bold {mutedVoices.has(name) ? 'bg-slate-600 text-slate-500 line-through' : 'bg-blue-500 text-white'}"
          on:click={() => onToggleMute(name)}
          title="{mutedVoices.has(name) ? 'Unmute' : 'Mute'} {name}"
        >{name}</button>
      {/each}
    </div>
  {/if}

  <!-- Right side -->
  <div class="flex gap-2 ml-auto">
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-xs"
      on:click={onShare}
      title="Copy share link"
    >🔗 Share</button>
    <button
      class="bg-slate-600 hover:bg-slate-500 rounded px-2 py-1 text-xs"
      on:click={onPrint}
      title="Print / Save as PDF"
    >🖨 Print</button>
  </div>
</div>
