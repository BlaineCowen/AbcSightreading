<script lang="ts">
  import { ArrowLeftRight } from "lucide-svelte";
  import { tuner } from "../lib/tuner/store";

  /**
   * The pad a rhythm is tapped on while Grade listens (grade-rhythm.ts): big,
   * round and fixed at one edge of the screen, so a thumb finds it without
   * looking and it stays put while the score scrolls. It answers on
   * pointerdown, not click (no delay, and the time is the touch's own), and
   * flashes on each tap. The spacebar does the same (the page listens).
   */
  export let onTap: (t: number) => void;

  let flash = 0;
  function down(e: PointerEvent) {
    e.preventDefault();
    onTap(e.timeStamp);
    flash++;
  }
  $: side = $tuner.tapPadSide;
</script>

<div class="tap-pad fixed z-50 flex flex-col items-center gap-2 no-print {side === 'left' ? 'left-3' : 'right-3'}">
  {#key flash}
    <button
      class="pad w-24 h-24 rounded-full bg-sr-peach text-sr-peach-ink font-extrabold text-lg shadow-xl select-none flex flex-col items-center justify-center leading-tight"
      class:hit={flash > 0}
      on:pointerdown={down}
      on:contextmenu|preventDefault
      aria-label="Tap"
    >Tap<span class="text-[10px] font-bold opacity-70">or Space</span></button>
  {/key}
  <button
    class="w-8 h-8 rounded-full bg-sr-raise border border-sr-hairline text-sr-muted flex items-center justify-center"
    on:click={() => tuner.setGrade({ tapPadSide: side === "left" ? "right" : "left" })}
    title="Move the pad to the other side"
    aria-label="Move the pad to the other side"
  ><ArrowLeftRight size={14} /></button>
</div>

<style>
  /* Mid-height of what the playback bar and Grade's strip leave free. */
  .tap-pad { bottom: calc(var(--bottom-bar-h, 96px) + 90px); }
  .pad { touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; }
  .hit { animation: tap 160ms ease-out; }
  @keyframes tap {
    0% { transform: scale(0.9); filter: brightness(1.15); }
    100% { transform: scale(1); filter: none; }
  }
</style>
