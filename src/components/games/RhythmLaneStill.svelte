<script lang="ts">
  /**
   * Tap the rhythm's still lane (Blaine, 19 November 2026: "have the bars
   * always underneath the notes, statically, the distance you would hold that
   * note"; then "need to make it work when there are multiple lines"). A row
   * under each line of music, laid over the drawing: each note's pill starts
   * under its notehead and runs to where the next one is drawn; rests are
   * dashed gaps. Nothing scrolls; a line moves along the row being played
   * and the sounding note's pill glows. A held note that crosses onto the
   * next line goes on in that line's row.
   *
   * Measured from the drawing (`paper`, abcjs with add_classes): each note
   * and rest by its cursor among `.abcjs-note, .abcjs-rest` (as
   * rhythm-marks.ts finds them), its line by its `abcjs-lN` class, a line's
   * end at its last barline, a row's top under the lowest thing drawn on its
   * line (syllables included). RhythmGame leaves room under each line
   * (`%%staffsep` and padding) so a row never covers the next line.
   */
  /** The notes and rests, in beats from the first note of the music. */
  export let notes: { start: number; len: number; cursor: number }[] = [];
  export let rests: { start: number; len: number; cursor: number }[] = [];
  export let totalBeats = 8;
  export let beatsPerBar = 4;
  /** After a round: each note's mark by its cursor (right, close, miss). */
  export let marks: Map<number, "right" | "close" | "miss"> | null = null;
  export let paper: HTMLElement | null = null;
  /** Changes each time the music is drawn again, to measure it again. */
  export let drawn = 0;

  type Row = { from: number; to: number; top: number; left: number; width: number; at: number[]; x: number[]; bars: number[]; barAt: number[] };
  let box: HTMLDivElement;
  let rows: Row[] = [];
  let beatNow = -1;

  /** A beat's x on a row: between the measured points, in proportion. */
  function px(r: Row, b: number) {
    const { at, x } = r;
    if (b <= at[0]!) return x[0]!;
    for (let i = 1; i < at.length; i++) {
      if (b <= at[i]!) return x[i - 1]! + ((b - at[i - 1]!) / (at[i]! - at[i - 1]!)) * (x[i]! - x[i - 1]!);
    }
    return x[x.length - 1]!;
  }

  function measure() {
    if (!paper || !box) return;
    const base = box.getBoundingClientRect();
    const els = [...paper.querySelectorAll(".abcjs-note, .abcjs-rest")];
    const lineOf = (el: Element | undefined) => {
      const m = el ? /\babcjs-l(\d+)\b/.exec(el.getAttribute("class") ?? "") : null;
      return m ? Number(m[1]) : -1;
    };
    const items = [...notes, ...rests].map((n) => ({ at: n.start, el: els[n.cursor] })).filter((p) => p.el).sort((a, b) => a.at - b.at);
    const lines = [...new Set(els.map(lineOf))].filter((l) => l >= 0).sort((a, b) => a - b);
    const out: Row[] = [];
    // Lines break at barlines: each starts where the bars before it end.
    let from = 0;
    for (const l of lines) {
      const barXs = [...paper.querySelectorAll(`.abcjs-bar.abcjs-l${l}`)].map((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2 - base.left;
      }).sort((a, b) => a - b);
      const to = Math.min(totalBeats, from + Math.max(1, barXs.length) * beatsPerBar);
      // The line's first note or rest is on its first beat, even when it is a
      // tied note held over from the line before (not in the schedule).
      const first = els.find((el) => lineOf(el) === l);
      const mine = items.filter((p) => lineOf(p.el) === l && p.at >= from && p.at < to);
      const points = [...(first && !mine.some((p) => p.el === first) ? [{ at: from, el: first }] : []), ...mine];
      const at = points.map((p) => p.at);
      const x = points.map((p) => p.el!.getBoundingClientRect().left - base.left);
      const end = barXs[barXs.length - 1];
      if (end !== undefined && end > x[x.length - 1]!) {
        at.push(to);
        x.push(end);
      }
      if (x.length) {
        const onLine = [...paper.querySelectorAll(`.abcjs-l${l}`)].map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
        const bottom = Math.max(...onLine.map((r) => r.bottom)) - base.top;
        // Each barline is where its bar ends, so a note that ends on it stops there.
        const barAt = barXs.map((_, j) => from + (j + 1) * beatsPerBar);
        out.push({ from, to, top: bottom + 8, left: x[0]! - 6, width: x[x.length - 1]! - x[0]! + 12, at, x, bars: barXs, barAt });
      }
      from = to;
    }
    rows = out;
  }
  $: notes, rests, totalBeats, beatsPerBar, drawn, paper, requestAnimationFrame(measure);

  /** Where the music is, in beats from its first note; null (or the count-in) shows no line. */
  export function set(beat: number | null) {
    beatNow = beat ?? -1;
  }
  $: playing = rows.findIndex((r) => beatNow >= r.from && beatNow < r.to);

  /** The pieces of a note or rest on a row (a held note can run onto the next line). */
  const pieces = (r: Row, start: number, len: number) => {
    const a = Math.max(start, r.from);
    const b = Math.min(start + len, r.to);
    if (b <= a) return [];
    const bar = r.barAt.findIndex((t) => Math.abs(t - b) < 1e-6);
    const end = bar >= 0 ? r.bars[bar]! - 3 : px(r, b);
    return [{ x: px(r, a), w: end - px(r, a), first: a === start }];
  };
</script>

<div class="lanes" bind:this={box} aria-hidden="true" data-rhythm-lane data-still-lane>
  {#each rows as r, i}
    <div class="row" style="top: {r.top}px; left: {r.left}px; width: {r.width}px">
      {#each r.bars as bx}<span class="bar" style="left: {bx - r.left - 1}px"></span>{/each}
      {#each rests as n}
        {#each pieces(r, n.start, n.len) as p}
          <span class="rest" style="left: {p.x - r.left + 3}px; width: {Math.max(8, p.w - 6)}px"></span>
        {/each}
      {/each}
      {#each notes as n (n.cursor)}
        {#each pieces(r, n.start, n.len) as p}
          <span
            class="pill {marks?.get(n.cursor) ?? ''}"
            class:now={!marks && beatNow >= n.start && beatNow < n.start + n.len}
            class:cont={!p.first}
            style="left: {p.x - r.left}px; width: {Math.max(10, p.w - 4)}px"
            data-lane-note={p.first ? n.cursor : undefined}
          ></span>
        {/each}
      {/each}
      {#if playing === i}<span class="head" style="left: {px(r, beatNow) - r.left}px"></span>{/if}
    </div>
  {/each}
</div>

<style>
  .lanes { position: absolute; inset: 0; pointer-events: none; }
  .row { position: absolute; height: 34px; border-radius: 12px; background: var(--sr-track); }
  .bar { position: absolute; top: 3px; bottom: 3px; width: 2px; background: var(--sr-ink-2); }
  .pill { position: absolute; top: 7px; height: 20px; border-radius: 999px; background: var(--sr-action); box-shadow: 0 1px 0 color-mix(in srgb, var(--sr-ink) 25%, transparent); }
  .pill.cont { border-top-left-radius: 4px; border-bottom-left-radius: 4px; }
  .pill.now { box-shadow: 0 0 0 3px color-mix(in srgb, var(--sr-action) 35%, transparent); }
  .pill.right { background: #2fb383; }
  .pill.close { background: #e0a100; }
  .pill.miss { background: #e5484d; }
  .rest { position: absolute; top: 10px; height: 14px; border-radius: 999px; border: 2px dashed var(--sr-hairline-2); }
  @media (max-width: 600px) {
    .row { height: 28px; }
    .pill { top: 5px; height: 18px; }
    .rest { top: 8px; height: 12px; }
  }
  .head { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--sr-ink); }
</style>
