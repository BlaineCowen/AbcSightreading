<script lang="ts">
  /** The practice tools' icons, one stroke style, drawn in the current colour. */
  export let id: string;
  export let size = 20;
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if id === "tuner"}
    <path d="M12 14l4-4" /><path d="M3.3 19a9 9 0 1 1 17.4 0" />
  {:else if id === "metronome"}
    <path d="M8 21h8l-3-18h-2z" /><path d="M12 15l5-7" />
  {:else if id === "drone"}
    <path d="M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0c1.4-4 3-5 5-4" />
  {:else if id === "pitches"}
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  {:else if id === "analysis"}
    <path d="M3 12h4l3 8 4-16 3 8h4" />
  {:else if id === "timer"}
    <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M9 2h6" />
  {/if}
</svg>
