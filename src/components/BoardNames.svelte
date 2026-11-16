<script lang="ts">
  import { modal } from "../lib/modal";
  import { doneCount, type BoardRoster, type BoardStudent } from "../lib/board-test";

  /**
   * A board test's names (board-test.ts), big enough to tap at the board: a
   * student taps theirs and gets a new exercise to study. Anyone already
   * graded shows their best score, so a test spread over several days shows
   * who is left; they can still be picked (to try again).
   */
  export let roster: BoardRoster | null;
  export let problem = "";
  export let onPick: (s: BoardStudent) => void;
  export let onClose: () => void;
  export let onReload: () => void;

  let showDone = false;
  $: left = roster ? roster.students.filter((s) => s.best === null) : [];
  $: shown = roster ? (showDone ? roster.students : left) : [];
</script>

<dialog class="sr-modal board-veil print:hidden" use:modal={{ onClose, lightDismiss: false }} aria-labelledby="board-names-title">
  <div class="board-card">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h2 id="board-names-title" class="font-display text-3xl font-bold text-sr-ink">Tap your name</h2>
        {#if roster}<p class="text-sm text-sr-muted">{roster.className} · {roster.title} · {doneCount(roster.students)} of {roster.students.length} done</p>{/if}
      </div>
      <div class="flex items-center gap-3 text-sm">
        {#if roster && doneCount(roster.students) > 0}
          <label class="flex items-center gap-1.5 text-sr-ink-2 cursor-pointer"><input type="checkbox" bind:checked={showDone} /> Show who's done</label>
        {/if}
        <button class="sr-btn-quiet text-sm" on:click={onClose}>Close</button>
      </div>
    </div>

    {#if problem}
      <p class="text-sm text-sr-danger" role="alert">{problem} <button class="underline" on:click={onReload}>Try again</button></p>
    {:else if !roster}
      <p class="text-sm text-sr-muted">Loading the class…</p>
    {:else if !roster.students.length}
      <p class="text-sm text-sr-ink-2">No students in {roster.className} yet. Add them on your Classes page.</p>
    {:else if !shown.length}
      <p class="text-lg text-sr-ink-2">Everyone in {roster.className} is done. <button class="underline text-sr-action-fg" on:click={() => (showDone = true)}>Show who's done</button> to let someone try again.</p>
    {:else}
      <div class="names">
        {#each shown as s (s.id)}
          <button class="name" class:done={s.best !== null} on:click={() => onPick(s)}>
            <span class="truncate">{s.name}</span>
            {#if s.best !== null}<span class="score">{s.best}%</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</dialog>

<style>
  .board-veil { display: flex; align-items: center; justify-content: center; padding: 1rem; background: color-mix(in srgb, var(--sr-ink) 28%, transparent); }
  .board-card { width: min(64rem, 100%); max-height: calc(100dvh - 2rem); overflow: auto; display: flex; flex-direction: column; gap: 1rem; padding: 1.5rem; border-radius: 28px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); }
  .names { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.6rem; }
  .name { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 3.5rem; padding: 0.6rem 1rem; border-radius: 18px; background: var(--sr-sky); color: var(--sr-sky-ink); font-family: var(--sr-font-display); font-size: 1.25rem; font-weight: 700; text-align: left; border: 2px solid transparent; }
  .name:hover, .name:focus-visible { border-color: var(--sr-action); }
  .name.done { background: var(--sr-track); color: var(--sr-ink-2); }
  .score { font-size: 0.95rem; font-variant-numeric: tabular-nums; color: var(--sr-mint-ink); background: var(--sr-mint); border-radius: 999px; padding: 0.1rem 0.6rem; }
</style>
