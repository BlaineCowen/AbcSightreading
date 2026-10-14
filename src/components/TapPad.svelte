<script lang="ts">
  /**
   * The pad a rhythm is tapped on while Grade listens (grade-rhythm.ts): a
   * wide key floating in the middle near the foot of the screen, like a space
   * bar (Blaine: bigger, in the middle), so either thumb finds it without
   * looking and it stays put while the score scrolls. It answers on
   * pointerdown, not click (no delay, and the time is the touch's own), and
   * presses down on each tap. The spacebar does the same (the page listens).
   */
  export let onTap: (t: number) => void;

  let flash = 0;
  function down(e: PointerEvent) {
    e.preventDefault();
    onTap(e.timeStamp);
    flash++;
  }
</script>

<div class="tap-pad fixed z-50 no-print">
  {#key flash}
    <button
      class="pad bg-sr-peach text-sr-peach-ink font-extrabold select-none flex flex-col items-center justify-center leading-tight"
      class:hit={flash > 0}
      on:pointerdown={down}
      on:contextmenu|preventDefault
      aria-label="Tap"
    ><span class="text-2xl">Tap</span><span class="keys text-xs font-bold opacity-70">or Space</span></button>
  {/key}
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
    width: 100%;
    height: 5.5rem;
    border-radius: 24px;
    /* A key: a darker edge underneath that the press closes. */
    box-shadow: 0 6px 0 color-mix(in srgb, var(--sr-peach-ink) 35%, var(--sr-peach)), 0 14px 28px -12px rgba(0, 0, 0, 0.45);
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
  }
  /* No spacebar on a touch screen. */
  @media (hover: none) and (pointer: coarse) {
    .keys { display: none; }
  }
  .hit { animation: tap 140ms ease-out; }
  @keyframes tap {
    0% { transform: translateY(5px); box-shadow: 0 1px 0 color-mix(in srgb, var(--sr-peach-ink) 35%, var(--sr-peach)); filter: brightness(1.08); }
    100% { transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hit { animation: none; }
  }
</style>
