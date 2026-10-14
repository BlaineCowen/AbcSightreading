<script lang="ts">
  /**
   * The pad a rhythm is tapped on while Grade listens (grade-rhythm.ts): a
   * wide key floating in the middle near the foot of the screen, like a space
   * bar (Blaine: bigger, in the middle), so either thumb finds it without
   * looking and it stays put while the score scrolls. It answers on
   * pointerdown, not click (no delay, and the time is the touch's own), and
   * presses down on each tap, with a ring and "Tapped!" that stay for at
   least a moment so a quick tap is still seen. The spacebar does the same
   (the page listens; the pad only draws it).
   */
  export let onTap: (t: number) => void;

  import { onDestroy } from "svelte";

  /** How long a press stays drawn at least, so a quick tap is still seen. */
  const MIN_SHOW_MS = 130;

  let pressed = false;
  let ring = 0;
  let downAt = 0;
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;

  function press() {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = null;
    pressed = true;
    downAt = performance.now();
    ring++;
  }
  function release() {
    if (!pressed) return;
    const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - downAt));
    releaseTimer = setTimeout(() => { pressed = false; releaseTimer = null; }, wait);
  }

  function down(e: PointerEvent) {
    e.preventDefault();
    onTap(e.timeStamp);
    press();
  }

  // The page hears the spacebar and grades it; the key only draws it here.
  function keyDown(e: KeyboardEvent) {
    if ((e.code === "Space" || e.key === " ") && !e.repeat) press();
  }
  function keyUp(e: KeyboardEvent) {
    if (e.code === "Space" || e.key === " ") release();
  }
  onDestroy(() => { if (releaseTimer) clearTimeout(releaseTimer); });
</script>

<svelte:window on:keydown={keyDown} on:keyup={keyUp} on:blur={release} />

<div class="tap-pad fixed z-50 no-print">
  <button
    class="pad bg-sr-peach text-sr-peach-ink font-extrabold select-none flex flex-col items-center justify-center leading-tight"
    class:pressed
    on:pointerdown={down}
    on:pointerup={release}
    on:pointercancel={release}
    on:pointerleave={release}
    on:contextmenu|preventDefault
    aria-label="Tap"
  >
    {#key ring}<span class="ripple" aria-hidden="true"></span>{/key}
    <span class="text-2xl">{pressed ? "Tapped!" : "Tap"}</span><span class="keys text-xs font-bold opacity-70">or Space</span>
  </button>
</div>

<style>
  /* Centred, clear of the corner buttons (Tools, Feedback) on either side,
     and above the playback bar and Grade's strip (scripts/check-overlaps.ts). */
  .tap-pad {
    left: 50%;
    transform: translateX(-50%);
    /* Just above Grade's strip, near the thumbs; in rem, as the strip is, so
       it stays clear where the root font grows (4K). */
    bottom: calc(var(--bottom-bar-h, 96px) + 5rem);
    width: min(32rem, calc(100vw - 2rem));
  }
  @media (min-width: 641px) {
    .tap-pad { width: min(32rem, calc(100vw - 20rem)); }
  }
  .pad {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 5.5rem;
    border-radius: 24px;
    /* A key: a darker edge underneath that the press closes. */
    box-shadow: 0 6px 0 color-mix(in srgb, var(--sr-peach-ink) 35%, var(--sr-peach)), 0 14px 28px -12px rgba(0, 0, 0, 0.45);
    transition: transform 50ms ease-out, box-shadow 50ms ease-out, filter 50ms ease-out;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
  }
  /* Pushed down into the key, edge closed, a touch darker and smaller. */
  .pad.pressed {
    transform: translateY(5px) scale(0.985);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--sr-peach-ink) 35%, var(--sr-peach)), 0 4px 10px -6px rgba(0, 0, 0, 0.4);
    filter: brightness(0.92);
  }
  /* A ring spreading out from the middle on every tap, so repeated taps each show. */
  .ripple {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 4rem;
    height: 4rem;
    margin: -2rem 0 0 -2rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--sr-peach-ink) 30%, transparent);
    pointer-events: none;
    animation: ripple 380ms ease-out forwards;
  }
  @keyframes ripple {
    0% { transform: scale(0.3); opacity: 0.9; }
    100% { transform: scale(7); opacity: 0; }
  }
  /* No spacebar on a touch screen. */
  @media (hover: none) and (pointer: coarse) {
    .keys { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pad { transition: none; }
    .ripple { animation: none; opacity: 0; }
  }
</style>
