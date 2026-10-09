<script lang="ts">
  import TimeSignature from "./TimeSignature.svelte";
  import SubdivisionPicker from "./SubdivisionPicker.svelte";
  import SoundPanel from "./SoundPanel.svelte";

  /**
   * The metronome's settings in one column, for the practice pages' Tools
   * card: time signature, subdivision and sound, all in view. /tuner lays the
   * same parts out as cards (TunerMetronome).
   */

  /** Called when the singer picks a meter or subdivision themselves. */
  export let onManual: () => void = () => {};
  export let compact = false;
  /** On a practice page the meter is the exercise's: shown, not chosen. */
  export let lockedMeter = false;

  const heading = "text-[13px] font-bold text-sr-ink";
</script>

<div class="flex flex-col gap-5 text-sm">
  <section class="flex flex-col gap-2" aria-label="Time signature">
    <h4 class={heading}>Time signature</h4>
    <TimeSignature {compact} locked={lockedMeter} {onManual} />
  </section>
  <section class="flex flex-col gap-2" aria-label="Subdivide">
    <h4 class={heading}>Subdivide</h4>
    <SubdivisionPicker {compact} {onManual} />
  </section>
  <section class="flex flex-col gap-2" aria-label="Sound">
    <h4 class={heading}>Sound</h4>
    <SoundPanel {compact} showVolume={false} />
  </section>
</div>
