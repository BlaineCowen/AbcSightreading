<script lang="ts">
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import { READERS, READER_GROUPS, readerById } from "../lib/readers";
  import { PART_SETS, noteName, type PartRange } from "../lib/assignment-parts";

  /**
   * The parts students pick from on a sight-reading assignment
   * (assignment-parts.ts), in the assignment form: quick sets (SATB, all
   * band...), any part on or off, and for each part chosen its range, which
   * starts as the part's own and the director moves to suit their singers or
   * players. Only a range that differs from the part's own is sent.
   */
  export let readers: string[] = [];
  export let ranges: Record<string, PartRange> = {};

  const toggle = (id: string) => {
    readers = readers.includes(id) ? readers.filter((r) => r !== id) : [...readers, id];
  };
  const useSet = (ids: string[]) => {
    const all = ids.every((id) => readers.includes(id));
    readers = all ? readers.filter((r) => !ids.includes(r)) : [...new Set([...readers, ...ids])];
  };
  const rangeOf = (id: string, rs = ranges): PartRange => rs[id] ?? readerById[id].range;
  function setRange(id: string, end: "min" | "max", v: number) {
    const r = { ...rangeOf(id), [end]: v };
    if (r.max - r.min < 4) return;
    ranges = { ...ranges, [id]: r };
  }
  function reset(id: string) {
    const { [id]: _, ...rest } = ranges;
    ranges = rest;
  }
  /** Notes to choose from: an octave past the part's own range each way. */
  const choices = (id: string) => {
    const own = readerById[id].range;
    return Array.from({ length: own.max - own.min + 15 }, (_, i) => own.min - 7 + i).filter((n) => n >= 0 && n <= 42);
  };
  $: chosen = READERS.filter((r) => readers.includes(r.id));
  const changed = (id: string, rs: Record<string, PartRange>) => !!rs[id] && (rs[id].min !== readerById[id].range.min || rs[id].max !== readerById[id].range.max);
</script>

<div class="flex flex-col gap-3" data-parts-picker>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Quick sets">
    {#each PART_SETS as s (s.id)}
      <button type="button" class="sr-tok" class:sr-on={s.readers.every((id) => readers.includes(id))} on:click={() => useSet(s.readers)}>{s.label}</button>
    {/each}
  </div>
  {#each READER_GROUPS as g (g.family)}
    <details open={g.family === "voice" || READERS.some((r) => r.family === g.family && readers.includes(r.id))}>
      <summary class="text-xs text-sr-muted font-semibold cursor-pointer">{g.label}</summary>
      <div class="flex flex-wrap gap-1.5 mt-1.5">
        {#each READERS.filter((r) => r.family === g.family) as r (r.id)}
          <button type="button" class="sr-tok text-xs" class:sr-on={readers.includes(r.id)} aria-pressed={readers.includes(r.id)} on:click={() => toggle(r.id)}>{r.name}</button>
        {/each}
      </div>
    </details>
  {/each}
  {#if chosen.length}
    <div class="flex flex-col gap-1.5">
      <p class="text-xs text-sr-muted">Each part's range. Move it to fit your students; the music is the same for everyone, written in each part's range{chosen.some((r) => r.family !== "voice" && r.transposeSemitones) ? ", and transposing instruments read the concert key in their own key" : ""}.</p>
      {#each chosen as r (r.id)}
        <div class="range-row flex flex-wrap items-center gap-2 text-sm">
          <span class="w-32 truncate text-sr-ink font-medium" title={r.name}>{r.name}</span>
          <label class="flex items-center gap-1 text-sr-ink-2">from
            <select class="sel" value={rangeOf(r.id, ranges).min} on:change={(e) => setRange(r.id, "min", Number(e.currentTarget.value))} aria-label="{r.name} lowest note">
              {#each choices(r.id) as n}<option value={n}>{noteName(n)}</option>{/each}
            </select>
          </label>
          <label class="flex items-center gap-1 text-sr-ink-2">to
            <select class="sel" value={rangeOf(r.id, ranges).max} on:change={(e) => setRange(r.id, "max", Number(e.currentTarget.value))} aria-label="{r.name} highest note">
              {#each choices(r.id) as n}<option value={n}>{noteName(n)}</option>{/each}
            </select>
          </label>
          {#if changed(r.id, ranges)}
            <button type="button" class="text-xs text-sr-muted inline-flex items-center gap-1 underline" on:click={() => reset(r.id)}><RotateCcw size={12} aria-hidden="true" /> {noteName(r.range.min)} to {noteName(r.range.max)}</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sel {
    border-radius: 12px;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-panel);
    color: var(--sr-ink);
    font-size: 0.875rem;
    padding: 0 0.4rem;
    min-height: 2.25rem;
  }
</style>
