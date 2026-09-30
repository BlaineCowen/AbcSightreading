<script lang="ts">
  import { X } from "lucide-svelte";
  import { tuner } from "../lib/tuner/store";
  import type { GradeRunner } from "../lib/grade-runner";

  /**
   * Grade's card on the Unison page (rules in grade.ts, the run in
   * grade-runner.ts): set up, sing with help to hand, then the result. It sits
   * over the bottom-left of the page, clear of the Tools card on the right.
   */
  export let runner: GradeRunner;
  /** Pro or better; null while that is being checked. */
  export let allowed: boolean | null;
  export let signedIn: boolean;
  export let onStart: () => void;
  export let onClose: () => void;
  export let onNewExercise: () => void;
  /** Why it cannot start now (no exercise, rhythm only), or null. */
  export let blocked: string | null = null;

  $: v = $runner;
  $: sung = v.result?.notes ?? [];
  const tone = (score: number) =>
    score >= 90 ? "bg-sr-mint text-sr-mint-ink" : score >= 70 ? "bg-sr-butter text-sr-butter-ink" : "bg-sr-peach text-sr-peach-ink";
  const RING = 2 * Math.PI * 18;
</script>

<div
  class="grade-card fixed z-50 left-3 right-3 sm:right-auto sm:left-6 sm:w-[360px] bg-sr-raise border border-sr-hairline rounded-2xl shadow-2xl text-sr-ink no-print"
  role="dialog"
  aria-label="Grade"
>
  <div class="flex items-center justify-between px-4 pt-3">
    <h3 class="text-[15px] font-bold">Grade</h3>
    <button class="w-8 h-8 rounded-lg flex items-center justify-center text-sr-muted hover:text-sr-ink" on:click={onClose} aria-label="Close">
      <X size={16} />
    </button>
  </div>

  <div class="p-4 pt-2 flex flex-col gap-3">
    {#if allowed === false}
      <p class="text-sm text-sr-ink-2">
        Grade listens as you sing and scores each note. It's part of Pro, with the tuner and practice tools and
        unlimited exercises, for $19.99 a year.
      </p>
      {#if signedIn}
        <a class="sr-btn text-sm text-center" href="/account#plan">Get Pro</a>
      {:else}
        <a class="sr-btn text-sm text-center" href="/login?mode=signup&next={encodeURIComponent('/account#plan')}">Get Pro</a>
        <a class="text-xs text-sr-muted underline text-center" href="/login?next={encodeURIComponent('/account#plan')}">I have an account</a>
      {/if}
    {:else if v.phase === "idle"}
      <p class="text-sm text-sr-ink-2">
        Sing the exercise. The cursor waits on each note until you sing it (any octave) and hold it for its length.
        Finding each note quickly is most of the score.
      </p>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-bold text-sr-muted">Before the count-in, play</span>
        <div class="flex gap-1.5" role="group" aria-label="Reference">
          <button class="sr-tok text-sm {$tuner.gradeReference === 'note' ? 'sr-on' : ''}" aria-pressed={$tuner.gradeReference === "note"} on:click={() => tuner.setGradeReference("note")}>The first note</button>
          <button class="sr-tok text-sm {$tuner.gradeReference === 'triad' ? 'sr-on' : ''}" aria-pressed={$tuner.gradeReference === "triad"} on:click={() => tuner.setGradeReference("triad")}>The tonic chord</button>
        </div>
      </div>
      {#if blocked}<p class="text-sm text-sr-muted">{blocked}</p>{/if}
      <button class="sr-btn py-2.5" on:click={onStart} disabled={!!blocked || allowed === null}>
        {allowed === null ? "…" : "Start"}
      </button>
    {:else if v.phase === "reference" || v.phase === "countIn"}
      <p class="text-lg font-bold text-center py-4">{v.phase === "reference" ? "Listen…" : "Get ready…"}</p>
      <button class="sr-btn-quiet self-center" on:click={() => runner.stop()}>Stop</button>
    {:else if v.phase === "sing"}
      <div class="flex items-center gap-4">
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="18" fill="none" stroke="var(--sr-track)" stroke-width="6" />
          <circle cx="24" cy="24" r="18" fill="none" stroke={v.onTarget ? "var(--sr-action)" : "var(--sr-faint)"} stroke-width="6"
            stroke-dasharray={RING} stroke-dashoffset={RING * (1 - v.hold)} transform="rotate(-90 24 24)" stroke-linecap="round" />
        </svg>
        <div class="flex flex-col">
          <span class="text-sm font-bold">Note {v.index + 1} of {v.total}</span>
          <span class="text-xs text-sr-muted">
            {v.helping ? "Listen…" : v.onTarget ? "That's it, hold it" : v.cents === null ? "Sing the note at the cursor" : v.cents > 0 ? "A little high" : "A little low"}
          </span>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-bold text-sr-muted">Stuck?</span>
        <div class="flex flex-wrap gap-1.5">
          <button class="sr-tok text-sm" on:click={() => runner.helpWith("note")} title="The note caps at 50">Play this note</button>
          <button class="sr-tok text-sm" on:click={() => runner.helpWith("tonic")}>Play the tonic</button>
          <button class="sr-tok text-sm" on:click={() => runner.helpWith("triad")}>Play the tonic chord</button>
          <button class="sr-tok text-sm" on:click={() => runner.skip()}>Skip</button>
        </div>
      </div>
      <button class="sr-btn-quiet self-start" on:click={() => runner.stop()}>Stop</button>
    {:else if v.phase === "results" && v.result}
      <div class="flex items-baseline gap-3">
        <span class="text-4xl font-extrabold tabular-nums">{v.result.score}%</span>
        <span class="text-2xl font-extrabold text-sr-action-fg">{v.result.letter}</span>
      </div>
      <div class="flex flex-wrap gap-1" aria-label="Each note">
        {#each sung as n, i}
          <span
            class="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold tabular-nums {tone(n.score)}"
            title="Note {i + 1}: {n.score}%{n.skipped ? ', skipped' : n.findBeats !== null ? `, found in ${n.findBeats.toFixed(1)} beats` : ''}{n.help.heardNote ? ', heard the note' : n.help.heardKey ? ', heard the key' : ''}"
          >{i + 1}</span>
        {/each}
      </div>
      <p class="text-xs text-sr-muted">Green: found quickly and in tune. Amber: slow to find, or heard help. Red: stuck or skipped.</p>
      <div class="flex gap-2">
        <button class="sr-btn flex-1" on:click={onStart}>Try again</button>
        <button class="sr-btn-quiet flex-1" on:click={onNewExercise}>New exercise</button>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Above the playback bar, whose height the page publishes. */
  .grade-card { bottom: calc(var(--bottom-bar-h, 96px) + 16px); }
</style>
