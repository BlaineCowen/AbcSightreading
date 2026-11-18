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
   */
  import { onMount } from "svelte";

  /** The notes and rests, in beats from the first note of the music. */
  export let notes: { start: number; len: number; cursor: number }[] = [];
  export let rests: { start: number; len: number }[] = [];
  /** Beats in the music, in a bar, and counted in before it. */
  export let totalBeats = 8;
  export let beatsPerBar = 4;
  export let countBeats = 4;
  /** After a round: each note's mark by its cursor (right, close, miss). */
  export let marks: Map<number, "right" | "close" | "miss"> | null = null;
  /** The whole rhythm fitted in the lane, still (after a round, with its marks). */
  export let fit = false;

  /** How far in the hit line is, and how many beats are seen coming. */
  const HIT = 0.18;
  const AHEAD = 3.2;
  let track: HTMLDivElement;
  let strip: HTMLDivElement;
  let width = 600;
  $: hitX = fit ? 10 : width * HIT;
  $: perBeat = fit ? (width - 20) / Math.max(1, totalBeats) : (width - hitX) / AHEAD;
  let beatNow = -countBeats;

  /** Where the music is, in beats from its first note (negative in the count-in); null puts it back at the start. */
  export function set(beat: number | null) {
    beatNow = fit ? 0 : beat ?? -countBeats;
    if (strip) strip.style.transform = `translate3d(${hitX - beatNow * perBeat}px, 0, 0)`;
  }
  $: if (strip && perBeat) set(fit ? 0 : beatNow);

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
    {#each grid as b}
      <span class="tick" class:gone={fit && b < 0} class:bar={b >= 0 && b % beatsPerBar === 0} class:count={b < 0} style="left: {b * perBeat}px">
        {#if b < 0}<i>{b + countBeats + 1}</i>{/if}
      </span>
    {/each}
    {#each rests as r}
      <span class="rest" style="left: {r.start * perBeat + 3}px; width: {Math.max(8, r.len * perBeat - 6)}px"></span>
    {/each}
    {#each notes as n (n.cursor)}
      <span
        class="pill {marks?.get(n.cursor) ?? ''}"
        class:past={!marks && beatNow > n.start + 0.15}
        style="left: {n.start * perBeat}px; width: {Math.max(10, n.len * perBeat - 4)}px"
        data-lane-note={n.cursor}
      ></span>
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
  .pill.past { opacity: 0.35; }
  .pill.right { background: #2fb383; }
  .pill.close { background: #e0a100; }
  .pill.miss { background: #e5484d; }
  .rest { position: absolute; top: 13px; height: 14px; border-radius: 999px; border: 2px dashed var(--sr-hairline-2); }
  .hit { position: absolute; top: 0; bottom: 0; width: 4px; margin-left: -2px; border-radius: 2px; background: var(--sr-ink); }
  .hit::before { content: ""; position: absolute; top: -2px; left: -5px; border: 7px solid transparent; border-top-color: var(--sr-ink); }
</style>
