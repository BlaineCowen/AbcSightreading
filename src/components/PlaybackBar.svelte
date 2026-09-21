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
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Eye from "lucide-svelte/icons/eye";
  import EyeOff from "lucide-svelte/icons/eye-off";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import VolumeX from "lucide-svelte/icons/volume-x";
  import Check from "lucide-svelte/icons/check";
  import DropUp from "./ui/DropUp.svelte";
  import { copyText } from "../lib/clipboard";

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
  /** Voices with no staff. Omit onToggleHidden and the menu only mutes. */
  export let hiddenVoices: Set<string> = new Set();
  export let onToggleHidden: ((voiceName: string) => void) | null = null;
  /**
   * The two links Share offers. The settings link writes a new exercise when
   * opened; the exercise link opens these exact notes, and is null until there
   * is an exercise to link to. Both build synchronously, so the copy happens
   * inside the click - Safari refuses a clipboard write after an await.
   */
  export let settingsLink: () => string;
  export let exerciseLink: (() => string) | null = null;
  export let onPrint: () => void;
  /**
   * Files the Print / Export menu offers after printing. Leave it empty and
   * Print stays a plain button. `run` builds and saves the file; what it
   * throws is shown in the menu.
   */
  export let exports: {
    id: string;
    label: string;
    detail?: string;
    disabled?: boolean;
    run: () => void;
  }[] = [];
  /** Called on release. Consumers whose BPM change is expensive should re-render
   *  here instead of in onBpmChange. */
  export let onBpmCommit: ((bpm: number) => void) | null = null;
  /** Omit to leave Generate out of the bar entirely. */
  export let onGenerate: (() => void) | null = null;
  export let isGenerating: boolean = false;
  /**
   * A line of state that belongs on screen wherever the reader is looking.
   *
   * A practice run reports its position here rather than in the settings panel:
   * during a run the reader is watching the score, often with the panel shut or
   * on another tab, which is exactly where the panel's own copy is not.
   */
  export let status: string | null = null;

  function handleBpmInput(e: Event) {
    onBpmChange(+(e.target as HTMLInputElement).value);
  }

  function handleBpmCommit(e: Event) {
    (onBpmCommit ?? onBpmChange)(+(e.target as HTMLInputElement).value);
  }

  /**
   * Voices live in a drop-up rather than a row of chips: a row grows with the
   * voicing, and at SSAATTBB it crowded everything else off the bar.
   */
  $: hiddenCount = voiceNames.filter((n) => hiddenVoices.has(n)).length;
  $: mutedCount = voiceNames.filter((n) => mutedVoices.has(n)).length;
  /** What is switched off, on the button itself - a hidden voice is easy to forget. */
  $: voicesSummary = [
    hiddenCount ? `${hiddenCount} hidden` : "",
    mutedCount ? `${mutedCount} muted` : "",
  ].filter(Boolean).join(" · ");
  /** At one, the voice still showing cannot be hidden: there would be nothing to read. */
  $: shownCount = voiceNames.length - hiddenCount;

  let shareOpen = false;
  /** Shown on the chip for a moment after a copy, in place of an alert. */
  let copied = false;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  /** A link the browser would not copy, left in the menu to copy by hand. */
  let uncopied: string | null = null;

  async function share(link: string) {
    uncopied = null;
    if (await copyText(link)) {
      shareOpen = false;
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 2000);
    } else {
      uncopied = link;
    }
  }

  $: if (!shareOpen) uncopied = null;

  let exportOpen = false;
  let exportError: string | null = null;
  $: if (!exportOpen) exportError = null;

  function runExport(item: (typeof exports)[number]) {
    exportError = null;
    try {
      item.run();
      exportOpen = false;
    } catch (error) {
      console.error(`Could not export ${item.label}:`, error);
      exportError = `Could not write the ${item.label} file.`;
    }
  }

  function print() {
    exportOpen = false;
    onPrint();
  }

  const selectAll = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };

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
  const menuItem =
    "w-full flex flex-col items-start px-3 py-2 sm:py-1.5 text-left hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-transparent";
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
  {#if status}
    <!-- Full width and first, so it reads the same on a phone as on a desktop
         and never competes with the transport for room. -->
    <div
      class="w-full sm:order-first sm:basis-full bg-slate-700/80 px-3 py-1.5 text-xs font-medium text-blue-200"
      role="status"
    >{status}</div>
  {/if}

  <!-- Transport. sm:order-last + sm:ml-auto park this whole group at the right
       of the desktop row, after the mixer controls spliced in below. -->
  <div class="flex items-center gap-2 sm:gap-4 flex-nowrap sm:flex-wrap px-3 py-2 sm:p-0 sm:py-2
              sm:order-last sm:ml-auto">
    <div class="flex gap-2 items-center">
      {#if onGenerate}
        <button
          class="flex items-center justify-center gap-1.5 shrink-0 sr-btn font-bold px-3 sm:px-4 h-11 sm:h-8 text-sm disabled:opacity-50"
          on:click={onGenerate}
          disabled={isGenerating}
          title="Generate a new exercise"
          aria-label="Generate a new exercise"
        >
          <RefreshCw size={16} class={isGenerating ? "animate-spin" : ""} />
          <span class="hidden sm:inline">Generate</span>
        </button>
      {/if}
      <button
        class={iconBtn}
        disabled={!hasExercise}
        on:click={onRestart}
        title="Back to start"
        aria-label="Back to start"
      ><SkipBack size={18} /></button>

      {#if isPlaying}
        <button
          class="flex items-center justify-center gap-1 sr-btn px-4 h-11 sm:h-8 text-sm font-bold disabled:opacity-40"
          disabled={!hasExercise}
          on:click={onPause}
          aria-label="Pause"
        ><Pause size={18} /><span class="hidden sm:inline">Pause</span></button>
      {:else}
        <button
          class="flex items-center justify-center gap-1 sr-btn px-4 h-11 sm:h-8 text-sm font-bold disabled:opacity-40"
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
        class="hidden sm:flex items-center justify-center rounded h-11 w-11 sm:h-8 sm:w-8 {looping
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

      <button
        class="sm:hidden flex items-center gap-1 rounded px-3 py-2 text-xs font-semibold {looping
          ? 'bg-amber-500 text-white'
          : 'bg-slate-600 hover:bg-slate-500'}"
        on:click={onToggleLoop}
        aria-pressed={looping}
      ><Repeat size={14} /> Loop</button>

      <slot name="extra" />

      {#if voiceNames.length > 1}
        <DropUp
          triggerClass={chipBtn}
          label="Voices"
          title={onToggleHidden ? "Choose which voices are shown and heard" : "Choose which voices play"}
        >
          <svelte:fragment slot="trigger">
            Voices
            {#if voicesSummary}
              <span class="tabular-nums text-amber-300">{voicesSummary}</span>
            {/if}
          </svelte:fragment>
          <div class="flex items-center gap-1 pl-3 pr-1 pt-1 text-[10px] uppercase tracking-wide text-slate-400" aria-hidden="true">
            <span class="flex-1"></span>
            {#if onToggleHidden}<span class="w-11 sm:w-8 text-center">Show</span>{/if}
            <span class="w-11 sm:w-8 text-center">Hear</span>
          </div>
          {#each voiceNames as name}
            {@const hidden = hiddenVoices.has(name)}
            {@const muted = mutedVoices.has(name)}
            <div class="flex items-center gap-1 pl-3 pr-1 text-sm">
              <span class="flex-1 truncate {hidden && muted ? 'text-slate-400' : 'text-slate-100'}">{name}</span>
              {#if onToggleHidden}
                {@const locked = !hidden && shownCount <= 1}
                <button
                  class="flex items-center justify-center rounded h-11 w-11 sm:h-8 sm:w-8
                         hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-transparent
                         {hidden ? 'text-slate-400' : 'text-teal-300'}"
                  on:click={() => onToggleHidden?.(name)}
                  disabled={locked}
                  aria-pressed={!hidden}
                  aria-label="Show {name}"
                  title={locked ? "One voice always stays on the page" : `${hidden ? "Show" : "Hide"} ${name}`}
                >
                  {#if hidden}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
                </button>
              {/if}
              <button
                class="flex items-center justify-center rounded h-11 w-11 sm:h-8 sm:w-8 hover:bg-slate-600
                       {muted ? 'text-slate-400' : 'text-teal-300'}"
                on:click={() => onToggleMute(name)}
                aria-pressed={!muted}
                aria-label="Hear {name}"
                title="{muted ? 'Unmute' : 'Mute'} {name}"
              >
                {#if muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}
              </button>
            </div>
          {/each}
        </DropUp>
      {/if}

      <DropUp triggerClass={chipBtn} label="Share" title="Copy a link" bind:open={shareOpen} menuClass="min-w-[16rem]">
        <svelte:fragment slot="trigger">
          {#if copied}
            <Check size={14} class="text-teal-300" /> Copied
          {:else}
            <Link2 size={14} /> Share
          {/if}
        </svelte:fragment>
        <button
          class={menuItem}
          on:click={() => exerciseLink && share(exerciseLink())}
          disabled={!exerciseLink}
          title={exerciseLink ? "" : "Generate an exercise first"}
        >
          <span class="text-sm text-slate-100">Link to this exercise</span>
          <span class="text-xs text-slate-400">Opens these exact notes</span>
        </button>
        <button class={menuItem} on:click={() => share(settingsLink())}>
          <span class="text-sm text-slate-100">Link to these settings</span>
          <span class="text-xs text-slate-400">Writes a new exercise each time</span>
        </button>
        {#if uncopied}
          <div class="px-3 pt-1 pb-2 text-xs text-slate-300">
            Your browser blocked copying - copy the link from here:
            <input
              class="mt-1 w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 ring-1 ring-slate-600"
              readonly
              value={uncopied}
              aria-label="Link"
              use:selectAll
            />
          </div>
        {/if}
      </DropUp>
      <span class="sr-only" aria-live="polite">{copied ? "Link copied" : ""}</span>

      {#if exports.length}
        <DropUp
          triggerClass={chipBtn}
          label="Print or export"
          title="Print, or save as a file"
          bind:open={exportOpen}
          menuClass="min-w-[17rem]"
        >
          <svelte:fragment slot="trigger"><Printer size={14} /> Print / Export</svelte:fragment>
          <button class={menuItem} on:click={print}>
            <span class="text-sm text-slate-100">Print / Save as PDF</span>
            <span class="text-xs text-slate-400">Your browser's print dialog</span>
          </button>
          {#each exports as item (item.id)}
            <button
              class={menuItem}
              on:click={() => runExport(item)}
              disabled={item.disabled}
              title={item.disabled ? "Generate an exercise first" : ""}
            >
              <span class="text-sm text-slate-100">{item.label}</span>
              {#if item.detail}<span class="text-xs text-slate-400">{item.detail}</span>{/if}
            </button>
          {/each}
          {#if exportError}
            <p class="px-3 pt-1 pb-2 text-xs text-amber-300" role="alert">{exportError}</p>
          {/if}
        </DropUp>
      {:else}
        <button class={chipBtn} on:click={onPrint} title="Print / Save as PDF">
          <Printer size={14} /> Print
        </button>
      {/if}
    </div>
</div>
