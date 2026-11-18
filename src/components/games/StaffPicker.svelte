<script lang="ts">
  /**
   * Choosing Note Rain's notes on a staff (Blaine, 18 November 2026: "choosing
   * the range isn't intuitive"; then, the same day, "the customize feature
   * looks really ugly" and "we don't have a regular clef": the first picker
   * was hand-drawn, with dashed ghost notes and the word "Treble" on its side
   * where the clef goes). Now the staff is real notation, drawn by abcjs as
   * the game's cards are: the clef, every note the clef offers as a whole
   * note (two ledger lines below the staff to two above), the chosen ones in
   * blue and the rest grey. Each note is a big button the height of the
   * staff with its name under it; tap to rain it or not. Shortcuts for the
   * lines, the spaces, the staff, or everything.
   */
  import { createEventDispatcher, onMount, tick } from "svelte";
  import abcjs from "abcjs";
  import { BOTTOM_LINE, abcOf, clefRange, letterOf, noteLabel, octaveOf, onLine, type Clef } from "../../lib/games/note-rain";

  export let clef: Clef;
  export let chosen: number[];
  const dispatch = createEventDispatcher<{ change: number[] }>();

  $: steps = clefRange(clef);
  $: bottom = BOTTOM_LINE[clef];
  const set = (list: number[]) => dispatch("change", [...new Set(list)].sort((a, b) => a - b));
  const toggle = (s: number) => set(chosen.includes(s) ? chosen.filter((x) => x !== s) : [...chosen, s]);
  const staffOnly = () => steps.filter((s) => s >= bottom && s <= bottom + 8);

  let box: HTMLDivElement;
  let paper: HTMLDivElement;
  let width = 0;
  /** Each note's column over the drawing: its middle and width, in px from the box's left. */
  let cols: { step: number; x: number; w: number }[] = [];
  let drawnFor = "";

  async function draw() {
    if (!paper || !width) return;
    const key = `${clef}|${width}`;
    if (key === drawnFor) return paint();
    drawnFor = key;
    abcjs.renderAbc(paper, `X:1\nM:none\nL:1/1\nK:C clef=${clef}\n${steps.map(abcOf).join(" ")}`, {
      staffwidth: Math.max(300, width - 12),
      scale: 1.35,
      paddingtop: 6,
      paddingbottom: 6,
      paddingleft: 4,
      paddingright: 4,
      add_classes: true,
    });
    await tick();
    const left = box.getBoundingClientRect().left;
    const heads = [...paper.querySelectorAll(".abcjs-note")];
    const xs = heads.map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2 - left;
    });
    cols = steps.map((step, i) => {
      const prev = xs[i - 1] ?? xs[i]! - (xs[i + 1]! - xs[i]!);
      const next = xs[i + 1] ?? xs[i]! + (xs[i]! - prev);
      return { step, x: xs[i] ?? 0, w: Math.max(18, (next - prev) / 2) };
    });
    paint();
  }
  /** The chosen notes blue, the others grey, on the drawing itself. */
  function paint() {
    const heads = [...(paper?.querySelectorAll(".abcjs-note") ?? [])];
    heads.forEach((el, i) => el.classList.toggle("off", !chosen.includes(steps[i]!)));
  }
  $: chosen, paint();
  $: clef, width, void draw();

  onMount(() => {
    const ro = new ResizeObserver(() => (width = Math.round(box?.clientWidth ?? 0)));
    ro.observe(box);
    width = Math.round(box.clientWidth);
    return () => ro.disconnect();
  });
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
    <div class="box" bind:this={box}>
      <div class="paper" bind:this={paper} aria-hidden="true"></div>
      <div class="cols" role="group" aria-label="Notes on the {clef} staff">
        {#each cols as c (c.step)}
          {@const on = chosen.includes(c.step)}
          <button type="button" class="col" class:on style="left: {c.x - c.w / 2}px; width: {c.w}px" aria-pressed={on} aria-label={noteLabel(c.step)} on:click={() => toggle(c.step)} data-step={c.step}>
            <span class="name">{letterOf(c.step)}<sub>{octaveOf(c.step)}</sub></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
  <p class="hint">Tap a note to make it fall, tap it again to leave it out. {chosen.length} chosen.</p>
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 0.6rem; }
  .quick { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
  /* On a phone the staff keeps notes a finger wide and scrolls sideways; wider, it fits. */
  .scroll { overflow-x: auto; border-radius: 22px; background: #fff; border: 1px solid var(--sr-hairline); }
  .box { position: relative; min-width: 34rem; padding-bottom: 2.1rem; }
  .paper :global(svg) { display: block; }
  .paper :global(.abcjs-note) { fill: var(--sr-action); transition: fill 120ms ease; }
  .paper :global(.abcjs-note.off) { fill: #b9c1d0; }
  .cols { position: absolute; inset: 0; }
  .col { position: absolute; top: 0; bottom: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0.35rem; border-radius: 14px; background: transparent; }
  .col:hover { background: color-mix(in srgb, var(--sr-action) 8%, transparent); }
  .col:focus-visible { outline: 2px solid var(--sr-action); outline-offset: -2px; }
  .name { min-width: 1.7rem; padding: 0.1rem 0.3rem; border-radius: 999px; font-size: 0.78rem; font-weight: 800; color: var(--sr-ink-2); background: var(--sr-track); line-height: 1.3; }
  .name sub { font-size: 0.6rem; }
  .col.on .name { background: var(--sr-action); color: var(--sr-action-ink); }
  .hint { font-size: 0.8rem; color: var(--sr-ink-2); }
</style>
