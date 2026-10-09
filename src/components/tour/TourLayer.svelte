<script lang="ts">
  /**
   * The first visit and the walkthrough (src/lib/tour.ts), on the three
   * practice pages. A welcome card the first time (Quick start, Show me
   * around, Skip), then, when asked for, a bubble at a time pointing at one
   * control, the rest of the page dimmed. Started again by `sr-start-tour`
   * (the "?" button, the navbar) or `?tour=1`.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import { fade, fly } from "svelte/transition";
  import X from "lucide-svelte/icons/x";
  import {
    FIRST_STEP_HREF,
    TOUR_STEPS,
    arrival,
    markTourSeen,
    markWelcomed,
    shouldWelcome,
    tourPageFor,
    type TourPage,
    type TourStep,
  } from "../../lib/tour";

  /** A student's start is the teacher's assignment, never this card. */
  export let student = false;

  let page: TourPage | null = null;
  let welcoming = false;
  let steps: TourStep[] = [];
  let index = -1;
  let rect: DOMRect | null = null;
  let bubble: HTMLElement;
  let bubbleH = 0;
  let vw = 0;
  let vh = 0;
  let returnFocus: HTMLElement | null = null;
  let reduceMotion = false;
  let frame = 0;

  const storage = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };

  $: running = index >= 0 && index < steps.length;
  $: step = running ? steps[index] : null;
  $: if (typeof document !== "undefined") document.documentElement.classList.toggle("sr-tour-open", running || welcoming);

  /** On screen and drawn: not missing, not display:none, not inside a closed menu. */
  function anchorOf(s: TourStep): HTMLElement | null {
    const el = document.querySelector<HTMLElement>(`[data-tour="${s.anchor}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    if (el.closest("[inert]")) return null;
    return el;
  }

  async function start(waitForPage = false) {
    if (!page) return;
    welcoming = false;
    returnFocus = document.activeElement as HTMLElement | null;
    // Close whatever is open first (a settings popover, the preset menu).
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await tick();
    // A page still drawing (opened with ?tour=1) may not have every control
    // yet: wait a moment for them, then leave out any that never came.
    const all = TOUR_STEPS[page];
    const until = Date.now() + 2500;
    while (waitForPage && Date.now() < until && all.some((s) => !anchorOf(s))) {
      await new Promise((r) => setTimeout(r, 150));
    }
    steps = all.filter((s) => anchorOf(s));
    if (!steps.length) return;
    await show(0);
  }

  async function show(i: number) {
    index = i;
    const el = steps[i] && anchorOf(steps[i]);
    if (!el) {
      rect = null;
      return;
    }
    // Fixed controls (the playback bar, Tools) are already in view.
    if (getComputedStyle(el).position !== "fixed" && !el.closest(".playback-bar")) {
      el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }
    measure();
    // Smooth scrolling ends when it ends: measure again once it has settled.
    for (const ms of [250, 600, 1000]) setTimeout(() => index === i && measure(), ms);
    await tick();
    bubble?.querySelector<HTMLElement>("[data-tour-next]")?.focus({ preventScroll: true });
  }

  /** Follows the control while the page scrolls into place, and on resize. */
  function measure() {
    cancelAnimationFrame(frame);
    // steps[index], not `step`: that updates only at the next tick.
    const current = index >= 0 ? steps[index] : null;
    const el = current && anchorOf(current);
    rect = el ? el.getBoundingClientRect() : null;
    vw = window.innerWidth;
    vh = window.innerHeight;
  }
  function follow() {
    if (index < 0) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }

  function finish() {
    index = -1;
    steps = [];
    rect = null;
    if (page) markTourSeen(page, storage());
    markWelcomed(storage());
    returnFocus?.focus?.({ preventScroll: true });
  }

  const next = () => (index + 1 < steps.length ? show(index + 1) : finish());
  const back = () => index > 0 && show(index - 1);

  function quickStart() {
    markWelcomed(storage());
    welcoming = false;
    window.location.href = FIRST_STEP_HREF;
  }

  function skipWelcome() {
    markWelcomed(storage());
    if (page) markTourSeen(page, storage());
    welcoming = false;
  }

  function onKey(e: KeyboardEvent) {
    if (welcoming && e.key === "Escape") {
      e.preventDefault();
      skipWelcome();
      return;
    }
    if (!running) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  }

  const onStart = () => void start();

  onMount(() => {
    page = tourPageFor(location.pathname);
    reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    vw = window.innerWidth;
    vh = window.innerHeight;
    window.addEventListener("sr-start-tour", onStart);
    window.addEventListener("scroll", follow, { passive: true, capture: true });
    window.addEventListener("resize", follow);
    window.addEventListener("scrollend", follow, { capture: true });
    window.addEventListener("keydown", onKey, true);
    if (!page) return;
    // The page draws its controls after this mounts; wait for them.
    const { search, hash } = arrival();
    const asked = new URLSearchParams(search).get("tour") === "1";
    if (asked) setTimeout(() => void start(true), 600);
    else if (shouldWelcome({ page, search, hash, student, store: storage() })) {
      setTimeout(() => (welcoming = true), 700);
    }
  });
  onDestroy(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("sr-start-tour", onStart);
    window.removeEventListener("scroll", follow, { capture: true } as EventListenerOptions);
    window.removeEventListener("resize", follow);
    window.removeEventListener("scrollend", follow, { capture: true } as EventListenerOptions);
    window.removeEventListener("keydown", onKey, true);
    document.documentElement.classList.remove("sr-tour-open");
    cancelAnimationFrame(frame);
  });

  const PAD = 8;
  const GAP = 14;
  $: phone = vw > 0 && vw <= 640;
  $: hole = rect && {
    left: rect.left - PAD,
    top: rect.top - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };
  /** Under the control when it fits, else over it; on a phone a sheet at the edge away from it. */
  $: place = (() => {
    if (!hole) return phone ? "bottom: 16px" : `top: ${Math.max(16, vh / 2 - bubbleH / 2)}px; left: ${Math.max(16, vw / 2 - 176)}px`;
    if (phone) return hole.top + hole.height / 2 > vh / 2 ? "top: 76px" : "bottom: 16px";
    const width = Math.min(352, vw - 32);
    const left = Math.min(Math.max(16, hole.left + hole.width / 2 - width / 2), vw - width - 16);
    const below = hole.top + hole.height + GAP;
    const top = below + bubbleH + 16 <= vh ? below : Math.max(16, hole.top - GAP - bubbleH);
    return `top: ${top}px; left: ${left}px; width: ${width}px`;
  })();
</script>

{#if welcoming}
  <div class="tour-scrim" transition:fade={{ duration: reduceMotion ? 0 : 160 }}></div>
  <div class="tour-welcome sr-panel" role="dialog" aria-modal="true" aria-labelledby="tour-welcome-title" transition:fly={{ y: reduceMotion ? 0 : 12, duration: reduceMotion ? 0 : 200 }}>
    <button class="tour-close" aria-label="Close" on:click={skipWelcome}><X size={18} /></button>
    {#if page === "piano"}
      <h2 id="tour-welcome-title" class="tour-h">Welcome to piano sight reading</h2>
      <p class="tour-p">An exercise is ready below. Want a quick look at where everything is? It takes half a minute.</p>
      <div class="tour-actions">
        <!-- svelte-ignore a11y-autofocus -->
        <button class="sr-btn" autofocus on:click={() => void start()}>Show me around</button>
        <button class="sr-btn-quiet tour-skip" on:click={skipWelcome}>Skip</button>
      </div>
    {:else}
      <h2 id="tour-welcome-title" class="tour-h">New here?</h2>
      <p class="tour-p">Start with step 1 of abcStepByStep: a short rhythm to clap or speak, no singing yet. Each step adds one new thing.</p>
      <div class="tour-actions">
        <!-- svelte-ignore a11y-autofocus -->
        <button class="sr-btn" autofocus on:click={quickStart}>Quick start</button>
        <button class="sr-tok" on:click={() => void start()}>Show me around</button>
        <button class="sr-btn-quiet tour-skip" on:click={skipWelcome}>Skip</button>
      </div>
      <p class="tour-hint">You can take the tour any time with the <span class="tour-q" aria-hidden="true">?</span> button.</p>
    {/if}
  </div>
{/if}

{#if running && step}
  <!-- Catches clicks on the dimmed page, so nothing behind changes mid-tour. -->
  <div class="tour-catch" aria-hidden="true"></div>
  {#if hole}
    <div class="tour-hole" style="left: {hole.left}px; top: {hole.top}px; width: {hole.width}px; height: {hole.height}px"></div>
  {:else}
    <div class="tour-scrim"></div>
  {/if}
  <div
    bind:this={bubble}
    bind:clientHeight={bubbleH}
    class="tour-bubble sr-panel"
    class:tour-sheet={phone}
    style={place}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-title"
    aria-describedby="tour-body"
  >
    {#key index}
      <div in:fade={{ duration: reduceMotion ? 0 : 140 }}>
        <p class="tour-count">{index + 1} of {steps.length}</p>
        <h2 id="tour-title" class="tour-h">{step.title}</h2>
        <p id="tour-body" class="tour-p">{step.body}</p>
      </div>
    {/key}
    <div class="tour-nav">
      <button class="sr-btn-quiet tour-skip" on:click={finish}>Skip tour</button>
      <span class="tour-dots" aria-hidden="true">
        {#each steps as _, i}<span class:on={i === index}></span>{/each}
      </span>
      <span class="flex gap-2">
        {#if index > 0}<button class="sr-tok" on:click={back}>Back</button>{/if}
        <button class="sr-btn" data-tour-next on:click={next}>{index + 1 < steps.length ? "Next" : "Done"}</button>
      </span>
    </div>
  </div>
{/if}

<style>
  .tour-scrim,
  .tour-catch {
    position: fixed;
    inset: 0;
    z-index: 80;
  }
  .tour-scrim {
    background: rgb(var(--sr-bar-rgb) / 0.62);
  }
  .tour-hole {
    position: fixed;
    z-index: 81;
    border-radius: var(--sr-r-md);
    box-shadow:
      0 0 0 3px var(--sr-action),
      0 0 0 9999px rgb(var(--sr-bar-rgb) / 0.62);
    pointer-events: none;
    transition: left 0.22s ease, top 0.22s ease, width 0.22s ease, height 0.22s ease;
  }
  .tour-bubble,
  .tour-welcome {
    position: fixed;
    z-index: 82;
    padding: 1.1rem 1.25rem 1rem;
    border: 1px solid var(--sr-hairline);
    box-shadow: 0 18px 50px -20px rgb(var(--sr-bar-rgb) / 0.6);
    color: var(--sr-ink);
  }
  .tour-bubble {
    width: min(22rem, calc(100vw - 2rem));
    transition: top 0.22s ease, left 0.22s ease;
  }
  .tour-sheet {
    left: 16px !important;
    right: 16px;
    width: auto !important;
  }
  .tour-welcome {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(28rem, calc(100vw - 2rem));
    padding: 1.6rem 1.5rem 1.3rem;
  }
  .tour-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 2.25rem;
    height: 2.25rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--sr-muted);
  }
  .tour-close:hover { background: var(--sr-track); }
  .tour-h {
    font-family: var(--sr-font-display);
    font-weight: 600;
    font-size: 1.2rem;
    line-height: 1.25;
    margin: 0 2rem 0.35rem 0;
  }
  .tour-welcome .tour-h { font-size: 1.5rem; }
  .tour-p {
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--sr-muted);
  }
  .tour-count {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--sr-action-fg);
    margin-bottom: 0.15rem;
  }
  .tour-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 1.1rem;
  }
  .tour-hint {
    margin-top: 0.9rem;
    font-size: 0.8rem;
    color: var(--sr-faint);
  }
  .tour-q {
    display: inline-grid;
    place-items: center;
    width: 1.3em;
    height: 1.3em;
    border-radius: 999px;
    border: 1.5px solid currentColor;
    font-weight: 800;
    font-size: 0.85em;
  }
  .tour-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.9rem;
  }
  .tour-skip {
    white-space: nowrap;
    font-size: 0.85rem;
    min-height: 2.5rem;
  }
  .tour-dots {
    display: flex;
    gap: 5px;
  }
  .tour-dots span {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--sr-hairline);
  }
  .tour-dots span.on { background: var(--sr-action); }
  @media (max-width: 380px) {
    .tour-dots { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tour-hole, .tour-bubble { transition: none; }
  }
</style>
