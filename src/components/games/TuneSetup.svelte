<script lang="ts">
  /**
   * Catch the tune, set up by hand (Blaine, 2 November 2026: which steps and
   * skips, which note to start on): the notes in play, the moves allowed, the
   * notes a tune may start on, where it ends, and how long it is. Rows of
   * chips, as the practice pages' settings are. Makes a tune-path level
   * (`allowedMoves`); says so when no tune can be made from the choice.
   */
  import { canMakeTune, stepOf, sylOf, type PathLevel } from "../../lib/games/tune-path";

  export let level: PathLevel;

  const NOTES = ["low so", "low la", "low ti", "do", "re", "mi", "fa", "so", "la", "ti", "high do", "high re", "high mi"];
  const MOVES: [number, string][] = [[0, "Repeat"], [1, "Step"], [2, "Skip (3rd)"], [3, "4th"], [4, "5th"], [5, "6th"], [7, "Octave"]];
  const LENGTHS = [4, 5, 6, 7, 8];

  let notes: string[] = level.notes;
  let moves: number[] = level.allowedMoves ?? MOVES.map(([m]) => m).filter((m) => m <= level.maxMove);
  let starts: string[] = level.starts ?? ["do", "mi", "so"].filter((n) => level.notes.includes(n));
  let endOn: string | null = level.endOn === undefined ? "do" : level.endOn;
  let length = level.length[1];

  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const byPitch = (list: string[]) => [...list].sort((a, b) => stepOf(a) - stepOf(b));

  $: chosenStarts = starts.filter((s) => notes.includes(s));
  $: words = MOVES.filter(([m]) => moves.includes(m)).map(([, w]) => w.replace(/ \(3rd\)/, "").toLowerCase());
  $: level = {
    name: "Custom",
    moves: words.length ? words.join(", ").replace(/, ([^,]*)$/, " and $1") : "nothing",
    notes: byPitch(notes),
    length: [length, length],
    maxMove: Math.max(1, ...moves),
    allowedMoves: [...moves].sort((a, b) => a - b),
    starts: chosenStarts.length ? byPitch(chosenStarts) : undefined,
    endOn: endOn && notes.includes(endOn) ? endOn : null,
  } satisfies PathLevel;
  $: problem =
    notes.length < 2 ? "Choose at least two notes."
    : !moves.some((m) => m > 0) ? "Choose at least one move besides a repeat."
    : !canMakeTune(level) ? "No tune fits these choices: add a move or a note between the ones chosen."
    : null;
</script>

<div class="setup" data-tune-setup>
  <div class="row" role="group" aria-label="Notes">
    <span>Notes</span>
    {#each NOTES as n}
      <button type="button" class="sr-tok chip" class:sr-on={notes.includes(n)} aria-pressed={notes.includes(n)} on:click={() => (notes = toggle(notes, n))}>{n}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Moves">
    <span>Moves</span>
    {#each MOVES as [m, label]}
      <button type="button" class="sr-tok chip" class:sr-on={moves.includes(m)} aria-pressed={moves.includes(m)} on:click={() => (moves = toggle(moves, m))}>{label}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Start on">
    <span>Start on</span>
    {#each byPitch(notes) as n}
      <button type="button" class="sr-tok chip" class:sr-on={starts.includes(n)} aria-pressed={starts.includes(n)} on:click={() => (starts = toggle(starts, n))}>{n}</button>
    {/each}
    {#if !chosenStarts.length}<em class="text-xs text-sr-muted">any note</em>{/if}
  </div>
  <div class="row" role="group" aria-label="End on">
    <span>End on</span>
    {#each [...byPitch(notes).filter((n) => /^(do|high do)$/.test(n)), null] as n}
      <button type="button" class="sr-tok chip" class:sr-on={endOn === n} aria-pressed={endOn === n} on:click={() => (endOn = n)}>{n ?? "Any note"}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Notes in a tune">
    <span>Length</span>
    {#each LENGTHS as n}
      <button type="button" class="sr-tok chip" class:sr-on={length === n} aria-pressed={length === n} on:click={() => (length = n)}>{n}</button>
    {/each}
  </div>
  {#if problem}<p class="text-sm text-sr-danger" role="alert" data-tune-problem>{problem}</p>
  {:else}<p class="text-xs text-sr-muted">Tunes of {length} notes on {byPitch(notes).map((n) => sylOf(stepOf(n))).join(" ")}, moving by {level.moves}{endOn ? `, ending on ${endOn}` : ""}.</p>{/if}
</div>

<style>
  .setup { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1.1rem; border-radius: 22px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
  .row > span { font-weight: 800; font-size: 0.85rem; color: var(--sr-ink-2); min-width: 4.5rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
</style>
