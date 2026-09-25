<script lang="ts">
  import { onMount, tick } from "svelte";
  import { signedInUser } from "../../lib/auth-client";
  import { tuner } from "../../lib/tuner/store";
  import { initTuner, startTuner, stopTuner } from "../../lib/tuner/controller";
  import { toolSettings, setTool, type ToolId } from "../../lib/tools/settings";
  import { droneOn, initDrone } from "../../lib/tools/state";
  import { timer } from "../../lib/tools/timer";
  import ToolTuner from "./ToolTuner.svelte";
  import ToolMetronome from "./ToolMetronome.svelte";
  import ToolDrone from "./ToolDrone.svelte";
  import ToolPitches from "./ToolPitches.svelte";
  import ToolAnalysis from "./ToolAnalysis.svelte";
  import ToolTimer from "./ToolTimer.svelte";
  import Icon from "./ToolIcon.svelte";

  /**
   * The practice tools: a button in the bottom-right corner that opens a wheel
   * of six tools - tuner, metronome, drone, starting pitches, analysis and a
   * timer. Picking one opens it as a card above the button; the card's strip
   * of icons switches between them without going back to the wheel.
   *
   * Tools that listen (the tuner, analysis) open the microphone while they are
   * showing and close it when they are not. Tools that sound (the drone, the
   * metronome, the timer) keep going with the card closed, and the button says
   * so with its dot.
   *
   * Part of Pro: signed out, the wheel still opens, and each card says what the
   * tool is and how to get it.
   */

  type Tool = { id: ToolId; label: string; wedge: string; x: number; y: number; w: number };
  // Six wedges round a hub, clockwise from the top (the mockup's geometry).
  const TOOLS: Tool[] = [
    { id: "tuner", label: "Tuner", wedge: "M78.4 23.2 A132 132 0 0 1 201.6 23.2 L164.3 94.0 A52 52 0 0 0 115.7 94.0 Z", x: 108, y: 16, w: 64 },
    { id: "metronome", label: "Metronome", wedge: "M210.3 28.3 A132 132 0 0 1 271.9 134.9 L192.0 138.0 A52 52 0 0 0 167.7 96.0 Z", x: 184, y: 62, w: 72 },
    { id: "drone", label: "Drone", wedge: "M271.9 145.1 A132 132 0 0 1 210.3 251.7 L167.7 184.0 A52 52 0 0 0 192.0 142.0 Z", x: 188, y: 154, w: 64 },
    { id: "pitches", label: "Pitches", wedge: "M201.6 256.8 A132 132 0 0 1 78.4 256.8 L115.7 186.0 A52 52 0 0 0 164.3 186.0 Z", x: 104, y: 200, w: 72 },
    { id: "timer", label: "Timer", wedge: "M69.7 251.7 A132 132 0 0 1 8.1 145.1 L88.0 142.0 A52 52 0 0 0 112.3 184.0 Z", x: 28, y: 154, w: 64 },
    { id: "analysis", label: "Analysis", wedge: "M8.1 134.9 A132 132 0 0 1 69.7 28.3 L112.3 96.0 A52 52 0 0 0 88.0 138.0 Z", x: 24, y: 62, w: 72 },
  ];
  const LISTENING: ToolId[] = ["tuner", "analysis"];

  let wheelOpen = false;
  let tool: ToolId | null = null;
  let allowed: boolean | null = null;
  let wheelEl: HTMLDivElement;
  let root: HTMLDivElement;

  onMount(() => {
    signedInUser().then((u) => (allowed = !!u));
    initTuner();
    initDrone();
  });

  async function toggleWheel() {
    wheelOpen = !wheelOpen;
    if (wheelOpen) {
      await tick();
      wheelEl?.querySelector<HTMLButtonElement>(`[data-tool="${tool ?? $toolSettings.lastTool}"]`)?.focus();
    }
  }

  /** Open a tool. A click, so it may start the microphone. */
  async function pick(id: ToolId) {
    wheelOpen = false;
    tool = id;
    setTool({ lastTool: id });
    if (allowed === null) allowed = !!(await signedInUser());
    const listening = LISTENING.includes(id);
    if (allowed && listening && tuner.get().engineStatus !== "running") startTuner();
    if (!listening && tuner.get().engineStatus === "running") stopTuner();
  }

  function closeCard() {
    tool = null;
    if (tuner.get().engineStatus === "running") stopTuner();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (wheelOpen) wheelOpen = false;
    else if (tool) closeCard();
  }
  function onDocPointer(e: PointerEvent) {
    if (wheelOpen && root && !root.contains(e.target as Node)) wheelOpen = false;
  }

  $: running = $droneOn || $tuner.metronomeRunning || $timer.running || $tuner.engineStatus === "running";
  $: current = TOOLS.find((t) => t.id === tool);
  $: next = typeof location !== "undefined" ? encodeURIComponent(location.pathname + location.search) : "%2F";
</script>

<svelte:window on:keydown={onKey} on:pointerdown={onDocPointer} />

<div bind:this={root} class="no-print">
  <!-- The card for the open tool -->
  {#if tool && !wheelOpen}
    <div
      class="tools-card fixed z-50 left-3 right-3 sm:left-auto sm:right-6 sm:w-[340px] bg-sr-raise border border-sr-hairline rounded-2xl shadow-2xl flex flex-col overflow-hidden text-sr-ink"
      role="dialog"
      aria-label={current?.label ?? "Tool"}
    >
      <div class="flex items-center gap-0.5 p-2 bg-sr-panel border-b border-sr-hairline" role="toolbar" aria-label="Tools">
        {#each TOOLS as t}
          <button
            class="w-9 h-9 rounded-lg flex items-center justify-center border {tool === t.id ? 'border-sr-action bg-sr-tint text-sr-action-fg' : 'border-transparent text-sr-muted hover:text-sr-ink'}"
            on:click={() => pick(t.id)}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            title={t.label}
          ><Icon id={t.id} size={18} /></button>
        {/each}
        <span class="flex-1"></span>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-sr-muted hover:text-sr-ink" on:click={closeCard} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div class="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
        {#if allowed === false}
          <h3 class="text-[15px] font-semibold">{current?.label}</h3>
          <p class="text-sm text-sr-ink-2">
            The practice tools - tuner, metronome, drone, starting pitches,
            analysis and timer - are part of Pro. For now, Pro comes with every account.
          </p>
          <a class="sr-btn text-sm text-center" href="/login?mode=signup&next={next}">Create a free account</a>
          <a class="text-xs text-sr-muted underline text-center" href="/login?next={next}">I have an account</a>
        {:else if allowed === null}
          <p class="text-sm text-sr-muted">…</p>
        {:else if tool === "tuner"}
          <ToolTuner />
        {:else if tool === "metronome"}
          <ToolMetronome />
        {:else if tool === "drone"}
          <ToolDrone />
        {:else if tool === "pitches"}
          <ToolPitches />
        {:else if tool === "analysis"}
          <ToolAnalysis />
        {:else if tool === "timer"}
          <ToolTimer />
        {/if}
      </div>
    </div>
  {/if}

  <!-- The wheel, over a dimmed page; a tap on the page closes it. -->
  {#if wheelOpen}
    <button class="fixed inset-0 z-40 bg-slate-900/20 cursor-default" aria-label="Close the tools" tabindex="-1" on:click={() => (wheelOpen = false)}></button>
    <div
      bind:this={wheelEl}
      class="tools-wheel fixed z-50 w-[280px] h-[280px] left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-9"
      role="group"
      aria-label="Practice tools"
    >
      <svg width="280" height="280" viewBox="0 0 280 280" class="absolute inset-0" aria-hidden="true">
        {#each TOOLS as t, i}
          <path
            d={t.wedge}
            class="transition-colors"
            fill={tool === t.id ? "var(--sr-tint)" : i % 2 ? "var(--sr-panel)" : "var(--sr-raise)"}
            stroke="var(--sr-hairline)"
          />
        {/each}
        <circle cx="140" cy="140" r="46" fill="var(--sr-action)" />
      </svg>
      {#each TOOLS as t}
        <button
          data-tool={t.id}
          class="absolute h-16 rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-sr-action-fg hover:bg-sr-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-sr-action"
          style="left: {t.x}px; top: {t.y}px; width: {t.w}px"
          on:click={() => pick(t.id)}
        ><Icon id={t.id} size={22} />{t.label}</button>
      {/each}
      <button
        class="absolute left-[106px] top-[106px] w-[68px] h-[68px] rounded-full flex items-center justify-center text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        on:click={() => (wheelOpen = false)}
        aria-label="Close the tools"
      ><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
  {/if}

  <!-- The button -->
  <button
    class="tools-fab fixed z-50 right-4 sm:right-6 h-14 min-w-14 px-4 rounded-full bg-sr-action text-white shadow-xl flex items-center justify-center gap-2 text-sm font-semibold hover:brightness-110"
    on:click={toggleWheel}
    aria-expanded={wheelOpen}
    aria-label="Practice tools{current ? `: ${current.label} open` : ''}"
  >
    {#if current && !wheelOpen}
      <Icon id={current.id} size={20} />
      <span class="hidden sm:inline">{current.label}</span>
    {:else}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3" /></svg>
      <span class="hidden sm:inline">Tools</span>
    {/if}
    {#if running}<span class="w-2 h-2 rounded-full bg-green-400" title="A tool is running"></span>{/if}
  </button>
</div>

<style>
  /*
   * Above the playback bar (whose height the page publishes) and above the
   * Feedback button, which sits 80px up in the same corner on every page.
   */
  .no-print { --tools-fab-bottom: max(calc(var(--bottom-bar-h, 96px) + 16px), 132px); }
  .tools-fab { bottom: var(--tools-fab-bottom); }
  .tools-wheel { bottom: calc(var(--tools-fab-bottom) + 68px); filter: drop-shadow(0 16px 30px rgba(15, 23, 42, 0.28)); }
  .tools-card { bottom: calc(var(--tools-fab-bottom) + 68px); }
</style>
