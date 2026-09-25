<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { A4_MAX, A4_MIN, NOTES } from "../../lib/tuner/pitch";
  import type { NoteName } from "../../lib/tuner/types";
  import type { Sensitivity } from "../../lib/tuner/pitch-tracker";

  /** Key, note names or solfège, A4, and how quiet a sound it reacts to. */

  const SENSITIVITIES: [Sensitivity, string][] = [
    ["low", "Low"],
    ["medium", "Med"],
    ["high", "High"],
  ];
  const onKey = (e: Event) => tuner.setKey((e.currentTarget as HTMLSelectElement).value as NoteName);
  const onA4 = (e: Event) => tuner.setA4(Number((e.currentTarget as HTMLInputElement).value));
  const field = "bg-sr-raise border border-sr-hairline rounded px-2 py-1 text-sr-ink";
  const step = "w-7 h-7 rounded border border-sr-hairline bg-sr-raise hover:border-sr-faint disabled:opacity-40";
</script>

<div class="flex flex-wrap gap-x-5 gap-y-3 items-center justify-center p-3 bg-sr-panel border border-sr-hairline rounded-lg text-sm">
  <label class="flex items-center gap-2">
    <span class="text-sr-muted">Key</span>
    <select class={field} value={$tuner.key} on:change={onKey}>
      {#each NOTES as note}
        <option value={note}>{note}</option>
      {/each}
    </select>
  </label>

  <div class="flex gap-1" role="group" aria-label="Show">
    <button class="sr-tok {$tuner.displayMode === 'notes' ? 'sr-on' : ''}" on:click={() => tuner.setDisplayMode("notes")}>Notes</button>
    <button class="sr-tok {$tuner.displayMode === 'solfege' ? 'sr-on' : ''}" on:click={() => tuner.setDisplayMode("solfege")}>Solfège</button>
  </div>

  <div class="flex items-center gap-1">
    <span class="text-sr-muted mr-1">A4</span>
    <button class={step} on:click={() => tuner.setA4($tuner.a4 - 1)} disabled={$tuner.a4 <= A4_MIN} aria-label="Lower A4">−</button>
    <input
      type="number"
      min={A4_MIN}
      max={A4_MAX}
      value={$tuner.a4}
      on:change={onA4}
      class="{field} w-16 text-center"
      aria-label="A4 in hertz"
    />
    <button class={step} on:click={() => tuner.setA4($tuner.a4 + 1)} disabled={$tuner.a4 >= A4_MAX} aria-label="Raise A4">+</button>
  </div>

  <div class="flex items-center gap-2" title="How quiet a sound the tuner will react to">
    <span class="text-sr-muted">Sensitivity</span>
    <div class="flex gap-1">
      {#each SENSITIVITIES as [id, label]}
        <button class="sr-tok {$tuner.sensitivity === id ? 'sr-on' : ''}" on:click={() => tuner.setSensitivity(id)}>{label}</button>
      {/each}
    </div>
  </div>
</div>
