<script lang="ts">
  /**
   * Choosing Note Rain's notes on a staff (Blaine, 18 November 2026: "choosing
   * the range isn't intuitive. I see the control but don't understand what it
   * means"; learnmusic.fun had Lowest and Highest steppers). Every note the
   * clef offers is drawn where it sits, two ledger lines below the staff to
   * two above, its name under it; tap a note to rain it or not. Shortcuts for
   * the lines, the spaces, the staff, or everything.
   */
  import { createEventDispatcher } from "svelte";
  import { BOTTOM_LINE, clefRange, letterOf, noteLabel, onLine, type Clef } from "../../lib/games/note-rain";

  export let clef: Clef;
  export let chosen: number[];
  const dispatch = createEventDispatcher<{ change: number[] }>();

  $: steps = clefRange(clef);
  $: bottom = BOTTOM_LINE[clef];
  const HALF = 7; // half a staff space, px in the SVG
  const GAP = 38; // one note to the next
  const LEFT = 40;
  $: top = bottom + 8;
  const TOP_Y = 46;
  const yOf = (s: number) => TOP_Y + (top - s) * HALF;
  $: width = LEFT + steps.length * GAP + 10;
  $: height = yOf(steps[0]!) + 40;
  /** The ledger lines a note needs. */
  const ledgers = (s: number) => {
    const out: number[] = [];
    for (let l = bottom - 2; l >= s; l -= 2) out.push(l);
    for (let l = top + 2; l <= s; l += 2) out.push(l);
    return out;
  };
  const set = (list: number[]) => dispatch("change", [...new Set(list)].sort((a, b) => a - b));
  const toggle = (s: number) => set(chosen.includes(s) ? chosen.filter((x) => x !== s) : [...chosen, s]);
  const staffOnly = () => steps.filter((s) => s >= bottom && s <= top);
  function key(e: KeyboardEvent, s: number) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle(s);
    }
  }
</script>

<div class="picker" data-staff-picker>
  <div class="quick" role="group" aria-label="Quick choices">
    <button type="button" class="sr-tok chip" on:click={() => set(staffOnly().filter((s) => onLine(clef, s)))}>The lines</button>
    <button type="button" class="sr-tok chip" on:click={() => set(staffOnly().filter((s) => !onLine(clef, s)))}>The spaces</button>
    <button type="button" class="sr-tok chip" on:click={() => set(staffOnly())}>The staff</button>
    <button type="button" class="sr-tok chip" on:click={() => set(steps)}>Everything</button>
    <button type="button" class="sr-tok chip" on:click={() => set([])}>Clear</button>
  </div>
  <div class="scroll">
    <svg viewBox="0 0 {width} {height}" width={width} role="group" aria-label="Notes on the {clef} staff">
      {#each [0, 2, 4, 6, 8] as k}
        <line x1="6" x2={width - 6} y1={yOf(bottom + k)} y2={yOf(bottom + k)} class="line" />
      {/each}
      <text x="8" y={yOf(bottom + 4) + 5} class="clef">{clef === "treble" ? "Treble" : "Bass"}</text>
      {#each steps as s, i}
        {@const x = LEFT + i * GAP + GAP / 2}
        {@const on = chosen.includes(s)}
        <g
          class="note"
          class:on
          role="checkbox"
          aria-checked={on}
          aria-label={noteLabel(s)}
          tabindex="0"
          on:click={() => toggle(s)}
          on:keydown={(e) => key(e, s)}
          data-step={s}
        >
          <rect x={x - GAP / 2 + 2} y="4" width={GAP - 4} height={height - 8} rx="10" class="hit" />
          {#each ledgers(s) as l}<line x1={x - 13} x2={x + 13} y1={yOf(l)} y2={yOf(l)} class="line" />{/each}
          <ellipse cx={x} cy={yOf(s)} rx="8.5" ry="6.5" transform="rotate(-20 {x} {yOf(s)})" class="head" />
          <text x={x} y={height - 12} class="name" text-anchor="middle">{letterOf(s)}<tspan class="oct">{Math.floor(s / 7)}</tspan></text>
        </g>
      {/each}
    </svg>
  </div>
  <p class="hint">Tap a note to make it fall, tap it again to leave it out. {chosen.length} chosen.</p>
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 0.5rem; }
  .quick { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
  .scroll { overflow-x: auto; background: var(--sr-paper); border: 1px solid var(--sr-hairline); border-radius: 18px; padding: 0.25rem; }
  svg { display: block; max-width: none; height: auto; }
  .line { stroke: var(--sr-ink-2); stroke-width: 1.2; }
  .clef { font-size: 10px; font-weight: 800; fill: var(--sr-muted); writing-mode: vertical-rl; }
  .note { cursor: pointer; outline: none; }
  .hit { fill: transparent; }
  .note:hover .hit { fill: var(--sr-tint); }
  .note:focus-visible .hit { stroke: var(--sr-action); stroke-width: 2; }
  .head { fill: var(--sr-paper); stroke: var(--sr-hairline-2); stroke-width: 2; stroke-dasharray: 3 2; }
  .note.on .head { fill: var(--sr-action); stroke: var(--sr-action); stroke-dasharray: none; }
  .name { font-size: 12px; font-weight: 800; fill: var(--sr-muted); }
  .note.on .name { fill: var(--sr-action-fg); }
  .oct { font-size: 8px; }
  .hint { font-size: 0.8rem; color: var(--sr-ink-2); }
</style>
