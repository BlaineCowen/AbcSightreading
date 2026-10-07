<script lang="ts">
  import { onMount, tick } from "svelte";
  import { signedInUser } from "../../lib/auth-client";
  import { billingStatus } from "../../lib/billing-client";
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
   * Part of Pro: without it the wheel still opens, and each card says what the
   * tool is and how to get it.
   */

  type Tool = { id: ToolId; label: string; x: number; y: number; w: number };
  // Six wedges round a hub, clockwise from the top (the mockup's geometry).
  const TOOLS: Tool[] = [
    { id: "tuner", label: "Tuner", x: 108, y: 16, w: 64 },
    { id: "metronome", label: "Metronome", x: 184, y: 62, w: 72 },
    { id: "drone", label: "Drone", x: 188, y: 154, w: 64 },
    { id: "pitches", label: "Pitches", x: 104, y: 200, w: 72 },
    { id: "timer", label: "Timer", x: 28, y: 154, w: 64 },
    { id: "analysis", label: "Analysis", x: 24, y: 62, w: 72 },
  ];
  const LISTENING: ToolId[] = ["tuner", "analysis"];

  /**
   * The wheel's slices, all from one set of measurements: a disc, six slices
   * that meet edge to edge (the gutters between them are the disc showing
   * through a stroke, so they are the same width all the way out), and the
   * centre button inside a ring as wide as the one at the rim.
   */
  const C = 140, RIM = 134, HUB = 54, CENTRE = 45, GUTTER = 5;
  const at = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  };
  const wedge = (i: number) => {
    const a0 = i * 60 - 120, a1 = i * 60 - 60;
    return `M${at(RIM, a0)} A${RIM} ${RIM} 0 0 1 ${at(RIM, a1)} L${at(HUB, a1)} A${HUB} ${HUB} 0 0 0 ${at(HUB, a0)} Z`;
  };

  let wheelOpen = false;
  /** The slice under the pointer or keyboard focus, coloured as a whole. */
  let hovered: ToolId | null = null;
  let tool: ToolId | null = null;
  let allowed: boolean | null = null;
  let signedIn = false;

  async function checkPlan() {
    signedIn = !!(await signedInUser());
    const status = await billingStatus();
    allowed = !!status && status.plan !== "free";
  }
  let wheelEl: HTMLDivElement;
  let root: HTMLDivElement;

  onMount(() => {
    checkPlan();
    initTuner();
    initDrone();
  });

  /**
   * The Tools button opens the wheel, and closes whatever is open: the wheel,
   * or a tool's card. Switching tools happens in the card's own toolbar.
   */
  async function toggleWheel() {
    if (!wheelOpen && tool) {
      closeCard();
      return;
    }
    wheelOpen = !wheelOpen;
    hovered = null;
    if (wheelOpen) {
      await tick();
      wheelEl?.querySelector<HTMLButtonElement>(`[data-tool="${tool ?? $toolSettings.lastTool}"]`)?.focus();
    }
  }

  /** Open a tool. A click, so it may start the microphone. */
  async function pick(id: ToolId) {
    wheelOpen = false;
    hovered = null;
    tool = id;
    setTool({ lastTool: id });
    if (allowed === null) await checkPlan();
    const listening = LISTENING.includes(id);
    if (allowed && listening && tuner.get().engineStatus !== "running") startTuner();
    if (!listening && tuner.get().engineStatus === "running" && !tuner.get().micHeld) stopTuner();
  }

  function closeCard() {
    tool = null;
    // Grade holds the microphone while it listens; leave it on for that.
    if (tuner.get().engineStatus === "running" && !tuner.get().micHeld) stopTuner();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (wheelOpen) wheelOpen = false;
    else if (tool) closeCard();
  }
  /**
   * A click anywhere else on the page closes the wheel or the card. What is
   * sounding (metronome, drone, timer) keeps going; only the listening tools
   * stop, as with the card's own close button.
   */
  function onDocPointer(e: PointerEvent) {
    if (!root || root.contains(e.target as Node)) return;
    // The playback bar's own Tools button (on a phone) toggles it itself.
    if ((e.target as Element | null)?.closest?.("[data-tools-toggle]")) return;
    if (wheelOpen) wheelOpen = false;
    else if (tool) closeCard();
  }

  /**
   * On a phone the floating button is hidden (it sat over the music) and the
   * playback bar's More controls carry a Tools button, which asks for the
   * wheel with this event.
   */
  onMount(() => {
    const toggle = () => void toggleWheel();
    window.addEventListener("sr-tools-toggle", toggle);
    return () => window.removeEventListener("sr-tools-toggle", toggle);
  });

  $: running = $droneOn || $tuner.metronomeRunning || $timer.running || $tuner.engineStatus === "running";
  $: current = TOOLS.find((t) => t.id === tool);
</script>

<svelte:window on:keydown={onKey} on:pointerdown={onDocPointer} />

<div bind:this={root} class="no-print">
  <!-- The card for the open tool -->
  {#if tool && !wheelOpen}
    <div
      class="tools-card fixed z-50 left-3 right-3 sm:left-auto sm:right-6 {tool === 'analysis' ? 'sm:w-[420px]' : 'sm:w-[340px]'} bg-sr-raise border border-sr-hairline rounded-2xl shadow-2xl flex flex-col overflow-hidden text-sr-ink"
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
            The practice tools (tuner, metronome, drone, starting pitches,
            analysis and timer) are part of Pro, with unlimited exercises, for $19.99 a year.
          </p>
          {#if signedIn}
            <a class="sr-btn text-sm text-center" href="/account#plan">Get Pro</a>
          {:else}
            <!-- A free account alone does not unlock them: say so, and send the
                 sign-up straight on to choosing Pro. -->
            <p class="text-sm text-sr-ink-2">Pro goes with an account: create one, then choose Pro.</p>
            <a class="sr-btn text-sm text-center" href="/login?mode=signup&next={encodeURIComponent('/account#plan')}">Get Pro</a>
            <a class="text-xs text-sr-muted underline text-center" href="/login?next={encodeURIComponent('/account#plan')}">I have an account</a>
            <a class="text-xs text-sr-muted underline text-center" href="/pricing">Compare plans</a>
          {/if}
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
    <button class="fixed inset-0 z-40 bg-[#15213a]/25 cursor-default" aria-label="Close the tools" tabindex="-1" on:click={() => (wheelOpen = false)}></button>
    <div
      bind:this={wheelEl}
      class="tools-wheel fixed z-50 w-[280px] h-[280px] left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-9"
      role="group"
      aria-label="Practice tools"
    >
      <!-- The slices are the targets: hovering anywhere on one, or on its label,
           colours the whole slice, and a click anywhere on it opens the tool.
           The buttons below carry the same action for the keyboard. -->
      <svg width="280" height="280" viewBox="0 0 280 280" class="absolute inset-0" aria-hidden="true">
        <circle cx={C} cy={C} r={C} fill="var(--sr-raise)" />
        {#each TOOLS as t, i}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <path
            d={wedge(i)}
            class="transition-colors cursor-pointer"
            fill={tool === t.id || hovered === t.id ? "var(--sr-action)" : "var(--sr-track)"}
            stroke="var(--sr-raise)"
            stroke-width={GUTTER}
            stroke-linejoin="round"
            on:mouseenter={() => (hovered = t.id)}
            on:mouseleave={() => (hovered = null)}
            on:click={() => pick(t.id)}
          />
        {/each}
        <circle cx={C} cy={C} r={CENTRE} fill="var(--sr-action)" />
      </svg>
      {#each TOOLS as t}
        <button
          data-tool={t.id}
          class="absolute h-16 rounded-xl flex flex-col items-center justify-center gap-1 text-[12px] font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sr-action {tool === t.id || hovered === t.id ? 'text-sr-action-ink' : 'text-sr-ink-2'}"
          style="left: {t.x}px; top: {t.y}px; width: {t.w}px"
          on:mouseenter={() => (hovered = t.id)}
          on:mouseleave={() => (hovered = null)}
          on:focus={() => (hovered = t.id)}
          on:blur={() => (hovered = null)}
          on:click={() => pick(t.id)}
        ><Icon id={t.id} size={22} />{t.label}</button>
      {/each}
      <button
        class="absolute left-[100px] top-[100px] w-[80px] h-[80px] rounded-full flex items-center justify-center text-sr-action-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        on:click={() => (wheelOpen = false)}
        aria-label="Close the tools"
      ><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
  {/if}

  <!-- The button -->
  <button
    class="tools-fab fixed z-50 right-4 sm:right-6 h-14 min-w-14 px-4 rounded-full bg-sr-action text-sr-action-ink shadow-xl flex items-center justify-center gap-2 text-sm font-semibold hover:brightness-110"
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
  /* On a phone the playback bar's More controls carry Tools instead (it sat over the music). */
  @media (max-width: 640px) { .tools-fab { display: none; } }
  /* Above the button by its own height (3.5rem, which grows with the big-screen text) and a gap; a fixed 68px overlapped it at 4K. */
  .tools-wheel { bottom: calc(var(--tools-fab-bottom) + 3.5rem + 12px); filter: drop-shadow(0 16px 30px rgba(15, 23, 42, 0.28)); }
  .tools-card { bottom: calc(var(--tools-fab-bottom) + 3.5rem + 12px); }
</style>
