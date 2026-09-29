<script lang="ts">
  import { exercise } from "../../lib/tools/context";
  import { playNotes } from "../../lib/tools/tone";
  import { tuner } from "../../lib/tuner/store";
  import { NOTES } from "../../lib/tuner/pitch";

  /**
   * Starting pitches: each part's first note in this exercise, the way a
   * director gives them before a choir reads - do first, then the parts, then
   * the opening chord.
   */

  $: pitches = $exercise?.startingPitches ?? [];
  // With no exercise (the abcTuner page): the tuner's key, do up to do.
  const SCALE: [number, string][] = [[0, "do"], [2, "re"], [4, "mi"], [5, "fa"], [7, "so"], [9, "la"], [11, "ti"], [12, "do"]];
  $: keyDo = 60 + NOTES.indexOf($tuner.key);
  // Do in the octave of the lowest part's first note, so it sits in reach.
  $: doMidi = (() => {
    if (!$exercise) return 60;
    const low = pitches.length ? Math.min(...pitches.map((p) => p.midi)) : 60;
    const pc = NOTES.indexOf($exercise.doNote);
    let m = Math.floor(low / 12) * 12 + pc;
    if (m > low) m -= 12;
    return m;
  })();
</script>

<h3 class="text-[15px] font-semibold text-sr-ink">Starting pitches</h3>

{#if !$exercise}
  <p class="text-sm text-sr-muted">Pitches in {$tuner.key}. On a practice page this gives each part's first note instead.</p>
  <div class="grid grid-cols-4 gap-2">
    {#each SCALE as [step, name], i}
      <button
        class="h-11 rounded-[14px] font-bold text-sm {i === 0 || i === 7 ? 'bg-sr-action text-sr-action-ink' : 'bg-sr-track text-sr-ink-2 hover:bg-sr-tint'}"
        on:click={() => playNotes([keyDo + step], 1.6, $tuner.a4)}
        title="Play {name}"
      >{name}</button>
    {/each}
  </div>
  <button class="h-11 sr-btn font-semibold" on:click={() => playNotes([keyDo, keyDo + 4, keyDo + 7], 2.2, $tuner.a4)}>Play the tonic chord</button>
{:else if $exercise.rhythmOnly}
  <p class="text-sm text-sr-muted">This is a rhythm exercise, so there are no pitches to give.</p>
{:else}
  <p class="text-sm text-sr-muted">{pitches.length === 1 ? "The first note of this exercise." : "Each part's first note in this exercise."}</p>
  <div class="grid gap-2 {pitches.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
    {#each pitches as p}
      <button
        class="h-12 rounded-lg border border-sr-hairline bg-sr-raise hover:border-sr-faint flex items-center justify-between px-3 text-sm"
        on:click={() => playNotes([p.midi], 1.6, $tuner.a4)}
        title="Play the {p.part} starting note"
      >
        <span class="text-sr-muted truncate">{pitches.length === 1 ? "First note" : p.part}</span>
        <strong class="text-sr-ink whitespace-nowrap">{p.label} · {$tuner.displayMode === "solfege" ? p.solfege : p.solfege.toLowerCase()}</strong>
      </button>
    {/each}
  </div>
  <div class="flex gap-2">
    <button class="flex-1 h-11 rounded-lg border border-sr-hairline bg-sr-raise text-sr-ink-2 hover:border-sr-faint" on:click={() => playNotes([doMidi], 1.6, $tuner.a4)}>Give do ({$exercise.doLabel})</button>
    {#if pitches.length > 1}
      <button class="flex-1 h-11 sr-btn font-semibold" on:click={() => playNotes(pitches.map((p) => p.midi), 2.2, $tuner.a4)}>Play the first chord</button>
    {/if}
  </div>
{/if}
