<!-- One labelled row of the metronome's settings: the label in its own column
     on a wide screen, above the controls on a phone or a Tools card. -->
<script lang="ts">
  export let label: string;
  /** A second line under the label: "felt 3+2+2". */
  export let note = "";
  export let compact = false;
</script>

<div
  class="grid gap-x-6 gap-y-2 {compact ? '' : 'sm:grid-cols-[8.5rem_1fr] sm:items-start'}"
  role="group"
  aria-label={label}
>
  <div class={compact ? "" : "sm:pt-2"}>
    <div class="text-[13px] font-bold text-sr-ink-2">{label}</div>
    {#if note}<div class="text-xs text-sr-muted">{note}</div>{/if}
  </div>
  <div class="min-w-0 flex flex-col gap-2"><slot /></div>
</div>
