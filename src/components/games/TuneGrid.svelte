<script lang="ts">
  /**
   * Catch the tune's board (Octavo Academy's, ported 2 November 2026): a
   * column for each note, a row for each note in play, high at the top, named
   * on the left in its colour. A note the level leaves out (fa between mi and
   * so) is a thin empty row, so a move over it looks like the skip it is.
   * The first note is given. Used solo, on the big screen and on a student's
   * device.
   */
  import { colorOf, shortOf, sylOf } from "../../lib/games/tune-path";

  /** The notes in play, as scale steps, any order. */
  export let steps: number[];
  export let length: number;
  export let first: number;
  /** Each column's chosen step (the first is the given note), null while empty. */
  export let chosen: (number | null)[] = [];
  /** After a check: each column right or not (null: changed since, not judged). */
  export let marks: (boolean | null)[] | null = null;
  /** The tune, shown where a column was wrong (the reveal). */
  export let answer: number[] | null = null;
  /** The share of a room right, under each column (the big screen's reveal). */
  export let share: number[] | null = null;
  /** The column being worked on, and the one sounding now. */
  export let at = -1;
  export let nowCol: number | null = null;
  /** The notes a column can hold (the hint), or null for any: lit in the column being worked on, nothing dimmed. */
  export let reachable: (col: number) => number[] | null = () => null;
  /**
   * Squares a Check found wrong, as "col:step": red with a cross and no longer
   * tappable, so the same wrong note is not tried twice (Blaine, 4 November 2026).
   */
  export let ruled: string[] = [];
  export let disabled = false;
  export let ontap: (col: number, step: number) => void = () => {};

  $: lo = Math.min(...steps);
  $: hi = Math.max(...steps);
  $: rows = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i).map((step) => ({ step, on: steps.includes(step) }));
  $: cols = Array.from({ length }, (_, i) => i);
  $: picks = cols.map((c) => (c === 0 ? first : chosen[c] ?? null));
  /** Grid rows the outline spans: the numbers, every pitch row, and the shares when shown. */
  $: rowSpan = 1 + rows.length + (share ? 1 : 0);
</script>

<div class="board" style="--cols: {length}" role="group" aria-label="The tune: a column for each note, a row for each pitch">
  <span class="corner"></span>
  {#each cols as col (col)}<span class="num" class:cur={col === at} class:now={nowCol === col}>{col + 1}</span>{/each}
  {#each rows as { step: r, on } (r)}
    {#if !on}
      <span class="name off" aria-hidden="true"><span class="long">{sylOf(r)}</span><span class="short">{shortOf(r)}</span></span>
      <span class="offrow" style="grid-column: 2 / -1" aria-label="{sylOf(r)} is not used: a move over it is a skip"></span>
    {:else}
      <span class="name" style="--c: {colorOf(r)}"><span class="long">{sylOf(r)}</span><span class="short">{shortOf(r)}</span></span>
      {#each cols as col (col)}
        {@const can = reachable(col)}
        {@const picked = picks[col] === r}
        {@const out = ruled.includes(`${col}:${r}`)}
        {@const hinting = col === at && can !== null && !picked && !out}
        <button
          type="button"
          class="cell"
          class:picked
          class:given={col === 0 && picked}
          class:cur={col === at}
          class:now={nowCol === col}
          class:wrong={picked && marks?.[col] === false}
          class:right={picked && marks?.[col] === true && col > 0}
          class:answer={!!answer && answer[col] === r && !picked}
          class:can={hinting && can.includes(r)}
          class:cant={hinting && !can.includes(r)}
          class:ruled={out}
          style="--c: {colorOf(r)}"
          disabled={disabled || col === 0 || out}
          data-col={col}
          data-step={r}
          aria-label="Note {col + 1}: {sylOf(r)}{out ? ', ruled out' : hinting ? (can.includes(r) ? ', can come next' : ', too far from the last note') : ''}"
          aria-pressed={picked}
          on:click={() => ontap(col, r)}
        >{#if out}<span class="x" aria-hidden="true">✕</span>{:else if picked || (!!answer && answer[col] === r)}<span class="long">{sylOf(r).replace(/^(low|high) /, "")}</span><span class="short">{shortOf(r)}</span>{/if}</button>
      {/each}
    {/if}
  {/each}
  {#if share}
    <span class="corner"></span>
    {#each cols as col (col)}<span class="share" title="{Math.round(share[col] * 100)}% right">{col === 0 ? "" : `${Math.round(share[col] * 100)}%`}</span>{/each}
  {/if}
  {#if nowCol !== null && nowCol >= 0 && nowCol < length}
    <!-- The column sounding now, outlined (Blaine, 4 November 2026: a faint tint was too hard to follow). -->
    <span class="playing" style="grid-column: {nowCol + 2} / span 1; grid-row: 1 / span {rowSpan}" aria-hidden="true" data-playing-col={nowCol}></span>
  {/if}
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: minmax(2.4rem, auto) repeat(var(--cols), minmax(0, 1fr));
    gap: 6px;
    align-items: center;
    width: 100%;
  }
  .num { text-align: center; font-weight: 800; font-size: 0.85rem; color: var(--sr-muted); border-radius: 999px; padding: 2px 0; }
  .num.cur { color: var(--sr-action-fg); }
  .num.now { background: var(--sr-action); color: var(--sr-action-ink); }
  .board { position: relative; }
  /* Absolute, so it lies over its column's grid area without taking a cell from the board. */
  .playing {
    position: absolute;
    inset: -5px -4px;
    border: 4px solid var(--sr-action);
    border-radius: 16px;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--sr-action) 22%, transparent);
    pointer-events: none;
    z-index: 1;
  }
  .name { font-family: var(--font-display, inherit); font-weight: 700; color: var(--c); text-align: right; padding-right: 4px; font-size: 1.05rem; }
  .name.off { opacity: 0.35; font-size: 0.8rem; color: var(--sr-muted); }
  .short { display: none; }
  .offrow { height: 6px; border-radius: 999px; background: var(--sr-track); opacity: 0.7; }
  .cell {
    aspect-ratio: 1.6 / 1;
    min-height: 2.25rem;
    border-radius: 12px;
    border: 2px solid var(--sr-hairline);
    background: var(--sr-raise);
    font-weight: 800;
    color: #fff;
    transition: transform 80ms ease, background 120ms ease;
  }
  .cell:not(:disabled):hover { border-color: var(--c); }
  .cell:not(:disabled):active { transform: scale(0.94); }
  .cell.cur { border-color: color-mix(in srgb, var(--sr-action) 45%, var(--sr-hairline)); }
  .cell.picked { background: var(--c); border-color: var(--c); }
  .cell.given { opacity: 0.85; }
  /* The hint (Blaine, 2 November 2026: dimming the notes it cannot reach gave
     too much away): the notes it can reach are tinted, the rest left as they are. */
  /* Blaine, 4 November 2026: the tint alone did not say which moves were
     allowed. Now the column being worked on splits plainly: a note the last
     one can reach has a thick solid border in its colour and a tint; a note
     it cannot is hatched grey with a dashed border. */
  .cell.can { background: color-mix(in srgb, var(--c) 30%, var(--sr-raise)); border: 3px solid var(--c); }
  .cell.cant { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--sr-muted) 28%, var(--sr-raise)) 0 5px, var(--sr-raise) 5px 11px); border: 2px dashed color-mix(in srgb, var(--sr-muted) 60%, transparent); }
  .cell.ruled { background: color-mix(in srgb, var(--sr-danger, #e5484d) 16%, var(--sr-raise)); border: 3px solid var(--sr-danger, #e5484d); color: var(--sr-danger, #e5484d); opacity: 1; }
  .cell.ruled:disabled { cursor: not-allowed; }
  .x { font-size: 1.3rem; font-weight: 900; line-height: 1; }
  .cell.right { box-shadow: 0 0 0 3px var(--sr-mint); }
  .cell.wrong { box-shadow: 0 0 0 3px var(--sr-danger, #e5484d); opacity: 0.75; }
  .cell.answer { border: 3px dashed var(--c); color: var(--c); background: var(--sr-raise); }
  .cell:disabled { cursor: default; }
  .share { text-align: center; font-size: 0.8rem; font-weight: 800; color: var(--sr-ink-2); }
  /* A phone (Blaine, 2 November 2026: seven notes were cluttered there): the
     names to one letter in a narrow column, and every cell a thumb's height
     (44 px) whatever its width, rather than a wide shape that left 25 px. */
  @media (max-width: 520px) {
    .long { display: none; }
    .short { display: inline; }
    .board { gap: 4px; grid-template-columns: 1.4rem repeat(var(--cols), minmax(0, 1fr)); }
    .name { font-size: 0.95rem; padding-right: 0; text-align: center; }
    .name.off { font-size: 0.7rem; }
    .num { font-size: 0.75rem; }
    .cell { aspect-ratio: auto; height: 2.75rem; min-height: 0; border-radius: 10px; border-width: 1.5px; font-size: 0.9rem; }
    .offrow { height: 4px; }
  }
</style>
