<script lang="ts">
  /**
   * The lane under Tap the rhythm's music (Blaine, 18 November 2026: the beat
   * bar "is not what I meant at all. I meant a Guitar Hero style bar going
   * across"). Each note is a pill as long as it lasts, sliding right to left
   * into a hit line near the left edge: tap as a pill's front reaches the
   * line. Rests are gaps with a dashed outline; thin lines mark the beats,
   * thicker ones the bars, and the count-in's beats are numbered.
   *
   * Kept out of the music (learnmusic.fun's Rhythm Hero lane was "way too big
   * and messes up the notation"): a slim strip of its own under the score.
   * One strip moves, by transform, from `set(beat)` on the same audio clock
   * the clicks and the scoring use (RhythmGame's runTimeline); nothing is
   * laid out per frame.
   *
   * Still (before a round and after it), the lane sits under the music it
   * belongs to (Blaine, 19 November 2026: "make sure the bars under the
   * notes line up with the starts of notes better"): abcjs spaces notes by
   * how they look, not how long they last, so even beats drifted away from
   * the noteheads. Each note and rest is measured in `paper` (by its cursor,
   * as rhythm-marks.ts finds it) and its pill starts under it; between them
   * the beats are spread evenly, and the bar ticks sit on the drawn barlines.
   * Music on two lines (four bars) keeps even beats: one strip cannot sit
   * under both lines. Playing, the lane scrolls at an even speed as before.
   *
   * The still lane, under each line of the music, is RhythmLaneStill.svelte.
   */
  import { onMount } from "svelte";

  /** The notes and rests, in beats from the first note of the music. */
  export let notes: { start: number; len: number; cursor: number }[] = [];
  export let rests: { start: number; len: number; cursor: number }[] = [];
  /** Beats in the music, in a bar, and counted in before it. */
  export let totalBeats = 8;
  export let beatsPerBar = 4;
  export let countBeats = 4;
  /** After a round: each note's mark by its cursor (right, close, miss). */
  export let marks: Map<number, "right" | "close" | "miss"> | null = null;
  /** The whole rhythm fitted in the lane, still (after a round, with its marks). */
  export let fit = false;
  /** The drawn music, to line the still lane up under; `drawn` changes each time it is drawn again. */
  export let paper: HTMLElement | null = null;
  export let drawn = 0;
  /** Each note's length in beats written on its pill (the Beats choice). */
  export let beats = false;
  import { beatLabel } from "../../lib/games/beat-label";

  /** How far in the hit line is, and how many beats are seen coming. */
  const HIT = 0.18;
  const AHEAD = 3.2;
  let track: HTMLDivElement;
  let strip: HTMLDivElement;
  let width = 600;
  $: hitX = fit ? 10 : width * HIT;
  $: perBeat = fit ? (width - 20) / Math.max(1, totalBeats) : (width - hitX) / AHEAD;
  let beatNow = -countBeats;

  /** Where each beat sits under the drawn music (beats and px from the lane's left, rising), or null for even beats. */
  let under: { at: number[]; x: number[]; bars: number[] } | null = null;
  function measure() {
    under = null;
    if (!fit || !paper || !track) return;
    const els = [...paper.querySelectorAll(".abcjs-note, .abcjs-rest")];
    if (!els.length || els.some((el) => !el.classList.contains("abcjs-l0"))) return;
    const left = track.getBoundingClientRect().left;
    const xOf = (el: Element | undefined) => (el ? el.getBoundingClientRect().left - left : NaN);
    const points = [...notes, ...rests]
      .map((n) => ({ at: n.start, x: xOf(els[n.cursor]) }))
      .filter((p) => Number.isFinite(p.x))
      .sort((a, b) => a.at - b.at);
    const barXs = [...paper.querySelectorAll(".abcjs-bar")].map((el) => el.getBoundingClientRect().left - left + el.getBoundingClientRect().width / 2).sort((a, b) => a - b);
    const endX = barXs[barXs.length - 1];
    if (points.length < 2 || endX === undefined) return;
    points.push({ at: totalBeats, x: endX });
    // Rising only: a pill never runs backwards.
    for (let i = 1; i < points.length; i++) if (points[i]!.x <= points[i - 1]!.x || points[i]!.at <= points[i - 1]!.at) return;
    under = { at: points.map((p) => p.at), x: points.map((p) => p.x), bars: barXs };
  }
  /** A beat's place in px from the strip's left: under the music when measured, else even. */
  function px(b: number, u = under, per = perBeat) {
    if (!u) return b * per;
    const { at, x } = u;
    if (b <= at[0]!) return x[0]! - (at[0]! - b) * per;
    for (let i = 1; i < at.length; i++) {
      if (b <= at[i]!) return x[i - 1]! + ((b - at[i - 1]!) / (at[i]! - at[i - 1]!)) * (x[i]! - x[i - 1]!);
    }
    return x[x.length - 1]! + (b - at[at.length - 1]!) * per;
  }
  $: fit, width, drawn, notes, rests, paper, requestAnimationFrame(measure);

  /** Where the music is, in beats from its first note (negative in the count-in); null puts it back at the start. */
  export function set(beat: number | null) {
    beatNow = fit ? 0 : beat ?? -countBeats;
    if (strip) strip.style.transform = `translate3d(${fit && under ? 0 : hitX - beatNow * perBeat}px, 0, 0)`;
  }
  $: if (strip && perBeat) under, set(fit ? 0 : beatNow);

  onMount(() => {
    const ro = new ResizeObserver(() => (width = track?.clientWidth || 600));
    ro.observe(track);
    width = track.clientWidth || 600;
    return () => ro.disconnect();
  });

  $: grid = Array.from({ length: countBeats + totalBeats + 1 }, (_, k) => k - countBeats);
</script>

<div class="lane" bind:this={track} aria-hidden="true" data-rhythm-lane>
  <div class="strip" bind:this={strip}>
    {#if under}
      {#each under.bars as x}<span class="tick bar" style="left: {x - 1}px"></span>{/each}
    {:else}
      {#each grid as b}
        <span class="tick" class:gone={fit && b < 0} class:bar={b >= 0 && b % beatsPerBar === 0} class:count={b < 0} style="left: {b * perBeat}px">
          {#if b < 0}<i>{b + countBeats + 1}</i>{/if}
        </span>
      {/each}
    {/if}
    {#each rests as r}
      {@const x0 = px(r.start, under, perBeat)}
      <span class="rest" style="left: {x0 + 3}px; width: {Math.max(8, px(r.start + r.len, under, perBeat) - x0 - 6)}px"></span>
    {/each}
    {#each notes as n (n.cursor)}
      {@const x0 = px(n.start, under, perBeat)}
      <span
        class="pill {marks?.get(n.cursor) ?? ''}"
        class:past={!marks && beatNow > n.start + 0.15}
        style="left: {x0}px; width: {Math.max(10, px(n.start + n.len, under, perBeat) - x0 - 4)}px"
        data-lane-note={n.cursor}
      >{#if beats}<i>{beatLabel(n.len)}</i>{/if}</span>
    {/each}
  </div>
  {#if !fit}<span class="hit" style="left: {hitX}px"></span>{/if}
</div>

<style>
  .lane { position: relative; height: 40px; margin-top: 0.6rem; border-radius: 14px; background: var(--sr-track); overflow: hidden; }
  .strip { position: absolute; inset: 0; will-change: transform; }
  .tick { position: absolute; top: 6px; bottom: 6px; width: 1px; background: var(--sr-hairline-2); }
  .tick.bar { width: 2px; background: var(--sr-ink-2); top: 3px; bottom: 3px; }
  .tick.gone { display: none; }
  .tick.count { background: transparent; border-left: 1px dashed var(--sr-hairline-2); }
  .tick i { position: absolute; left: 4px; top: 4px; font-style: normal; font-size: 0.75rem; font-weight: 800; color: var(--sr-ink-2); }
  .pill { position: absolute; top: 10px; height: 20px; border-radius: 999px; background: var(--sr-action); box-shadow: 0 1px 0 color-mix(in srgb, var(--sr-ink) 25%, transparent); }
  .pill i { display: flex; align-items: center; justify-content: center; height: 100%; overflow: hidden; font-style: normal; font-weight: 800; font-size: 13px; line-height: 1; color: #fff; text-shadow: 0 1px 0 color-mix(in srgb, var(--sr-ink) 30%, transparent); }
  .pill.past { opacity: 0.35; }

  .pill.right { background: #2fb383; }
  .pill.close { background: #e0a100; }
  .pill.miss { background: #e5484d; }
  .rest { position: absolute; top: 13px; height: 14px; border-radius: 999px; border: 2px dashed var(--sr-hairline-2); }
  .hit { position: absolute; top: 0; bottom: 0; width: 4px; margin-left: -2px; border-radius: 2px; background: var(--sr-ink); }
  .hit::before { content: ""; position: absolute; top: -2px; left: -5px; border: 7px solid transparent; border-top-color: var(--sr-ink); }
</style>
