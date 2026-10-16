<script lang="ts">
  import { onDestroy, tick } from "svelte";

  /**
   * Where a drill has got to, on the music itself, at its top-right as the
   * count-in is at its top-left and in the same colours (Blaine, 15 October
   * 2026: better indicators on the drill, like the count-in): which exercise
   * of how many, a dot for each pass with this one filled, and while a new
   * exercise waits to be read, the seconds left on a draining ring. Goes in
   * the score's positioned wrapper beside CountInBadge, so full screen keeps
   * it. Measured clear of the title, the tempo mark and the bar numbers;
   * where there is no room above the staff (a phone) it stays off the music
   * and the playback bar's line says where the drill is.
   */
  export let running = false;
  /** From 0. */
  export let index = 0;
  export let exercises = 1;
  /** From 0. */
  export let pass = 0;
  export let passes = 1;
  /** Seconds left to read a new exercise; 0 once it plays. */
  export let countdown = 0;
  export let readSeconds = 0;

  let wrap: HTMLDivElement;
  let box: { top: number; right: number; scale: number } | null = null;

  /** Above the first staff at the right, below anything printed there. */
  function measure() {
    const host = wrap?.parentElement;
    const paper = host?.querySelector<HTMLElement>("#paper");
    const staff = paper?.querySelector(".abcjs-staff");
    if (!host || !paper || !staff) return null;
    const h = host.getBoundingClientRect();
    const p = paper.getBoundingClientRect();
    const right = h.right - p.right + 12;
    const left = p.right - h.left - right - 200;
    const rel = (r: DOMRect) => ({ x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height });
    const firstLine = [staff, ...paper.querySelectorAll(".abcjs-l0.abcjs-note, .abcjs-l0.abcjs-rest, .abcjs-l0.abcjs-ledger")];
    const musicTop = Math.min(...firstLine.map((el) => rel(el.getBoundingClientRect())).filter((r) => r.h > 0).map((r) => r.y));
    const inTheWay = [...paper.querySelectorAll("text, .abcjs-tempo, .abcjs-title, .abcjs-subtitle")]
      .map((el) => rel(el.getBoundingClientRect()))
      .filter((r) => r.w > 0 && r.h > 0 && r.x + r.w > left && r.y < musicTop);
    const paperTop = p.top - h.top;
    const top = Math.max(paperTop + 6, ...inTheWay.map((r) => r.y + r.h + 4));
    // 52px is the badge at full size; under 0.75 of that it would cover the
    // music (a phone), and the playback bar's line says it instead.
    const room = musicTop - 6 - top;
    if (room < 39) return null;
    return { top, right, scale: Math.min(1, room / 52) };
  }

  async function place() {
    await tick();
    requestAnimationFrame(() => (box = measure()));
  }
  $: if (running) void (index, pass, countdown > 0, place());

  const onResize = () => running && place();
  if (typeof window !== "undefined") window.addEventListener("resize", onResize);
  onDestroy(() => {
    if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
  });

  const R = 15;
  const C = 2 * Math.PI * R;
  $: reading = countdown > 0 && readSeconds > 0;
  // Where the ring is at each new second, then drained to the next over it.
  let left = 1;
  const share = (n: number) => Math.max(0, Math.min(1, n / Math.max(1, readSeconds)));
  function drain(n: number) {
    left = share(n);
    requestAnimationFrame(() => requestAnimationFrame(() => (left = share(n - 1))));
  }
  $: if (reading) drain(countdown);
</script>

<div bind:this={wrap} class="contents">
  {#if running && box}
    <div
      class="drill no-print"
      style="top: {box.top}px; right: {box.right}px; --s: {box.scale}"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {#if reading}
        <svg class="read-timer" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r={R} class="track" />
          <circle cx="20" cy="20" r={R} class="left" stroke-dasharray={C} stroke-dashoffset={C * (1 - left)} />
          {#key countdown}<text x="20" y="21" class="secs">{countdown}</text>{/key}
        </svg>
      {/if}
      <div class="words">
        <span class="small">Exercise {index + 1} of {exercises}</span>
        {#key `${index}-${pass}-${reading}`}
          <span class="big">
            {#if reading}Read it{:else}Pass {pass + 1} of {passes}{/if}
          </span>
        {/key}
      </div>
      {#if passes > 1 && !reading}
        <span class="dots" aria-hidden="true">
          {#each Array(passes) as _, k}<span class="dot" class:done={k < pass} class:now={k === pass}></span>{/each}
        </span>
      {/if}
      <span class="sr-only">{reading ? `${countdown} seconds to read it` : ""}</span>
    </div>
  {/if}
</div>

<style>
  .drill {
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 52px;
    padding: 0 0.85rem;
    border-radius: 14px;
    background: var(--sr-countin-bg, #2f6fe0);
    color: var(--sr-countin-ink, #fff);
    font-family: var(--sr-font-display, inherit);
    line-height: 1;
    pointer-events: none;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.18);
    transform: scale(var(--s, 1));
    transform-origin: top right;
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .small {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.85;
  }
  .big {
    font-size: 1.3rem;
    font-weight: 800;
    animation: pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  .dots {
    display: flex;
    gap: 0.3rem;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 999px;
    border: 2px solid currentColor;
    opacity: 0.55;
  }
  .dot.done {
    background: currentColor;
  }
  /* This pass: filled, full strength and larger, in both themes. */
  .dot.now {
    background: currentColor;
    opacity: 1;
    transform: scale(1.35);
  }
  .read-timer circle {
    fill: none;
    stroke-width: 4;
  }
  .read-timer .track {
    stroke: currentColor;
    opacity: 0.3;
  }
  .read-timer {
    overflow: visible;
  }
  .read-timer .left {
    stroke: currentColor;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 20px 20px;
    transition: stroke-dashoffset 1s linear;
  }
  .secs {
    fill: currentColor;
    font-size: 15px;
    font-weight: 800;
    text-anchor: middle;
    dominant-baseline: middle;
    animation: pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes pop {
    from { transform: scale(1.4); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .big, .secs { animation: none; }
    .read-timer .left { transition: none; }
  }
</style>
