<!-- src/components/PlaybackBar.svelte -->
<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import Play from "lucide-svelte/icons/play";
  import Pause from "lucide-svelte/icons/pause";
  import Square from "lucide-svelte/icons/square";
  import Repeat from "lucide-svelte/icons/repeat";
  import Minus from "lucide-svelte/icons/minus";
  import Plus from "lucide-svelte/icons/plus";
  import Link2 from "lucide-svelte/icons/link-2";
  import Printer from "lucide-svelte/icons/printer";
  import MoreHorizontal from "lucide-svelte/icons/more-horizontal";

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
  /** Called on release. Consumers whose BPM change is expensive should re-render
   *  here instead of in onBpmChange. */
  export let onBpmCommit: ((bpm: number) => void) | null = null;

  function handleBpmInput(e: Event) {
    onBpmChange(+(e.target as HTMLInputElement).value);
  }

  function handleBpmCommit(e: Event) {
    (onBpmCommit ?? onBpmChange)(+(e.target as HTMLInputElement).value);
  }

  /** Mobile only: secondary controls collapse into a sheet above the transport. */
  let expanded = false;

  // The bar's height changes whenever it wraps or the sheet opens, and the score
  // must stay clear of it. Publish the measured height so page content can pad by
  // exactly the right amount rather than guessing with a hardcoded pb-*.
  let barEl: HTMLDivElement;
  let observer: ResizeObserver | null = null;

  function publishBarHeight() {
    if (!barEl) return;
    document.documentElement.style.setProperty(
      "--bottom-bar-h",
      `${Math.ceil(barEl.getBoundingClientRect().height)}px`
    );
  }

  onMount(() => {
    if (!barEl) return;
    // Publish once up front: ResizeObserver does not deliver callbacks while the
    // document is hidden, so relying on its initial fire can leave the page
    // padded by the fallback instead of the real height.
    publishBarHeight();
    if (typeof ResizeObserver === "undefined") return;
    observer = new ResizeObserver(publishBarHeight);
    observer.observe(barEl);
  });

  onDestroy(() => {
    observer?.disconnect();
    if (typeof document !== "undefined") {
      document.documentElement.style.removeProperty("--bottom-bar-h");
    }
  });

  // 44px targets on touch, back to the original compact size from sm up.
  const iconBtn =
    "flex items-center justify-center rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-40 h-11 w-11 sm:h-8 sm:w-8";
  const stepBtn =
    "flex items-center justify-center bg-slate-600 hover:bg-slate-500 rounded h-11 w-9 sm:h-6 sm:w-6";
  const chipBtn =
    "flex items-center gap-1 bg-slate-600 hover:bg-slate-500 rounded px-3 py-2 sm:py-1 text-xs";
</script>

<!--
  Mobile: a column - optional sheet on top, transport below.
  Desktop: `sm:contents` dissolves the sheet wrapper so its groups become direct
  items of this row, reproducing the original single-row bar exactly.
-->
<div
  bind:this={barEl}
  class="playback-bar fixed bottom-0 left-0 right-0 bg-slate-800 text-slate-100 z-50 shadow-lg
         flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:px-4"
  style="padding-bottom: env(safe-area-inset-bottom, 0px)"
>
  <!-- Primary transport row -->
  <div class="flex items-center gap-2 sm:gap-4 flex-nowrap sm:flex-wrap px-3 py-2 sm:p-0 sm:py-2">
    <div class="flex gap-2 items-center">
      <button
        class={iconBtn}
        disabled={!hasExercise}
        on:click={onRestart}
        title="Restart"
        aria-label="Restart"
      ><SkipBack size={18} /></button>

      {#if isPlaying}
        <button
          class="flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-400 rounded px-4 h-11 sm:h-8 text-sm font-bold disabled:opacity-40"
          disabled={!hasExercise}
          on:click={onPause}
          aria-label="Pause"
        ><Pause size={18} /><span class="hidden sm:inline">Pause</span></button>
      {:else}
        <button
          class="flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-400 rounded px-4 h-11 sm:h-8 text-sm font-bold disabled:opacity-40"
          disabled={!hasExercise}
          on:click={onPlay}
          aria-label="Play"
        ><Play size={18} /><span class="hidden sm:inline">Play</span></button>
      {/if}

      <button
        class={iconBtn}
        disabled={!hasExercise}
        on:click={onStop}
        title="Stop"
        aria-label="Stop"
      ><Square size={18} /></button>

      <button
        class="flex items-center justify-center rounded h-11 w-11 sm:h-8 sm:w-8 {looping
          ? 'bg-amber-500 text-white'
          : 'bg-slate-600 hover:bg-slate-500'}"
        on:click={onToggleLoop}
        title="Loop"
        aria-label="Toggle loop"
        aria-pressed={looping}
      ><Repeat size={18} /></button>
    </div>

    <div class="w-px h-6 bg-slate-600 hidden sm:block"></div>

    <!-- BPM -->
    <div class="flex items-center gap-1 sm:gap-2">
      <span class="text-xs text-slate-400 uppercase tracking-wide hidden sm:inline">BPM</span>
      <button
        class={stepBtn}
        on:click={() => (onBpmCommit ?? onBpmChange)(Math.max(40, bpm - 5))}
        aria-label="Decrease tempo"
      ><Minus size={14} /></button>
      <input
        type="range"
        min="40"
        max="200"
        value={bpm}
        on:input={handleBpmInput}
        on:change={handleBpmCommit}
        class="hidden sm:block w-20 accent-blue-500"
        aria-label="Tempo"
      />
      <button
        class={stepBtn}
        on:click={() => (onBpmCommit ?? onBpmChange)(Math.min(200, bpm + 5))}
        aria-label="Increase tempo"
      ><Plus size={14} /></button>
      <span class="font-bold text-sm w-8 text-center">{bpm}</span>
    </div>

      <button
        class="sm:hidden ml-auto flex items-center justify-center rounded h-11 w-11 {expanded
          ? 'bg-amber-500 text-white'
          : 'bg-slate-600 hover:bg-slate-500'}"
        on:click={async () => { expanded = !expanded; await tick(); publishBarHeight(); }}
        title="More controls"
        aria-label="More controls"
        aria-expanded={expanded}
      ><MoreHorizontal size={18} /></button>
  </div>

  <!-- Secondary controls. order-first puts the sheet above the transport on
       mobile; sm:contents splices these groups into the desktop row instead. -->
    <div
      class="order-first sm:order-none {expanded ? 'flex' : 'hidden'}
             sm:contents flex-wrap items-center gap-3 px-3 py-2 border-b border-slate-700
             max-h-[50dvh] overflow-y-auto overscroll-contain"
    >
      <div class="flex sm:hidden items-center gap-2 w-full">
        <span class="text-xs text-slate-400 uppercase tracking-wide">BPM</span>
        <input
          type="range"
          min="40"
          max="200"
          value={bpm}
          on:input={handleBpmInput}
          on:change={handleBpmCommit}
          class="flex-1 accent-blue-500"
          aria-label="Tempo"
        />
      </div>

      <slot name="extra" />

      {#if voiceNames.length > 1}
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 uppercase tracking-wide">Voices</span>
          {#each voiceNames as name}
            <button
              class="rounded px-3 py-2 sm:py-1 text-xs font-bold {mutedVoices.has(name)
                ? 'bg-slate-600 text-slate-500 line-through'
                : 'bg-blue-500 text-white'}"
              on:click={() => onToggleMute(name)}
              title="{mutedVoices.has(name) ? 'Unmute' : 'Mute'} {name}"
            >{name}</button>
          {/each}
        </div>
      {/if}

      <div class="flex gap-2 sm:ml-auto">
        <button class={chipBtn} on:click={onShare} title="Copy share link">
          <Link2 size={14} /> Share
        </button>
        <button class={chipBtn} on:click={onPrint} title="Print / Save as PDF">
          <Printer size={14} /> Print
        </button>
      </div>
    </div>
</div>
