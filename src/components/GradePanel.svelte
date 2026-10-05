<script lang="ts">
  import { X, ChevronUp } from "lucide-svelte";
  import { tuner } from "../lib/tuner/store";
  import type { GradeRunner } from "../lib/grade-runner";
  import { guidance, STRICTNESS, type Strictness } from "../lib/grade";

  /**
   * Grade's strip on the Unison page (rules in grade.ts, the run in
   * grade-runner.ts), docked just above the playback bar. It was a tall card
   * over the bottom-left of the page and covered the music; now it is one line
   * while singing, and the page leaves room below the score for it. The Stuck
   * options and the results' note chips open upward, on demand.
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
  /** Do's pitch class in the exercise's key, for naming notes in solfege. */
  export let doPc = 0;
  /** After a run: what the tapped note on the score did. */
  export let detail: string | null = null;
  /** Saving a run for review (the recording and the grading's data); null hides it. */
  export let onSave: (() => void) | null = null;

  const STRICT_LEVELS = Object.entries(STRICTNESS) as [Strictness, (typeof STRICTNESS)[Strictness]][];
  const CURSORS = [["off", "Off"], ["smooth", "Smooth"], ["beat", "Beat"], ["note", "Note"]] as const;
  const CLICKS = [["off", "Off"], ["beat", "Beats"], ["sub", "Subdivided"]] as const;
  let setupOpen = false;

  $: v = $runner;
  $: sung = v.result?.notes ?? [];
  $: toWork = sung.filter((n) => n.outcome !== "first").length;
  $: firstTimes = sung.filter((n) => n.outcome === "first").length;
  const OUTCOME = { first: "right first time", corrected: "corrected", helped: "heard it first", skipped: "skipped" } as const;
  $: perfNotes = v.perf?.notes ?? [];
  $: pitchToWork = perfNotes.filter((n) => n.pitch < 90).length;
  $: rhythmToWork = perfNotes.filter((n) => n.rhythm < 90).length + (v.perf?.rests.filter((r) => r.sung).length ?? 0);
  $: performance = $tuner.gradeMode === "performance";
  let stuckOpen = false;
  let detailsOpen = false;
  $: if (v.phase !== "sing") stuckOpen = false;
  $: if (v.phase !== "results") detailsOpen = false;

  const tone = (score: number) =>
    score >= 90 ? "bg-sr-mint text-sr-mint-ink" : score >= 70 ? "bg-sr-butter text-sr-butter-ink" : "bg-sr-peach text-sr-peach-ink";
  const RING = 2 * Math.PI * 12;
  const help = (kind: "note" | "tonic" | "triad") => {
    stuckOpen = false;
    runner.helpWith(kind);
  };
  const skip = () => {
    stuckOpen = false;
    runner.skip();
  };
  $: line = v.helping
    ? "Listen…"
    : v.credited
      ? "Got it"
      : v.target === null
        ? ""
        : guidance({ sung: v.sung, target: v.target, doPc, onTarget: v.onTarget });
  $: lineTone = v.credited || v.onTarget
    ? "text-sr-action-fg"
    : v.sung !== null && Math.abs(v.cents ?? 0) >= 100
      ? "text-sr-danger"
      : "text-sr-ink-2";
</script>

<div class="grade-dock fixed z-50 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(720px,calc(100vw-2rem))] no-print" role="region" aria-label="Grade">
  <!-- Opened upward from the strip: the setup, the Stuck options, or the results' notes. -->
  {#if setupOpen && v.phase === "idle" && !blocked}
    <div class="mb-2 bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl p-3 flex flex-col gap-2.5 text-sm">
      <div class="flex items-center gap-1.5 flex-wrap" role="group" aria-label="What to grade">
        <span class="text-xs text-sr-muted w-20">Grade</span>
        <button class="sr-tok text-xs px-2.5 py-1 {!performance ? 'sr-on' : ''}" aria-pressed={!performance} on:click={() => tuner.setGrade({ gradeMode: "pitch" })}>Pitch only</button>
        <button class="sr-tok text-xs px-2.5 py-1 {performance ? 'sr-on' : ''}" aria-pressed={performance} on:click={() => tuner.setGrade({ gradeMode: "performance" })}>Pitch & rhythm</button>
      </div>
      <p class="text-xs text-sr-muted -mt-1 ml-[5.4rem]">
        {performance ? "The music runs in time with a click; a note missed stays missed. Pitch and rhythm are scored apart." : "No tempo: the cursor waits on each note until you sing it and hold it a moment. Right first time scores best. Stuck? Hear help, or skip."}
      </p>
      <div class="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Strictness">
        <span class="text-xs text-sr-muted w-20">Strictness</span>
        {#each STRICT_LEVELS as [id, s]}
          <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeStrictness === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeStrictness === id} on:click={() => tuner.setGrade({ gradeStrictness: id })}
            title="In tune within {s.cents} cents{performance ? `; in time within ${s.onsetBeats} of a beat` : ''}">{s.label}</button>
        {/each}
      </div>
      {#if performance}
        <div class="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Cursor">
          <span class="text-xs text-sr-muted w-20">Cursor</span>
          {#each CURSORS as [id, label]}
            <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeCursor === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeCursor === id} on:click={() => tuner.setGrade({ gradeCursor: id })}>{label}</button>
          {/each}
        </div>
        <div class="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Click">
          <span class="text-xs text-sr-muted w-20">Click</span>
          {#each CLICKS as [id, label]}
            <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeClick === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeClick === id} on:click={() => tuner.setGrade({ gradeClick: id })}>{label}</button>
          {/each}
        </div>
      {/if}
      <div class="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Before the count-in, play">
        <span class="text-xs text-sr-muted w-20">First, play</span>
        <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeReference === 'note' ? 'sr-on' : ''}" aria-pressed={$tuner.gradeReference === "note"} on:click={() => tuner.setGradeReference("note")}>the first note</button>
        <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeReference === 'triad' ? 'sr-on' : ''}" aria-pressed={$tuner.gradeReference === "triad"} on:click={() => tuner.setGradeReference("triad")}>the tonic chord</button>
      </div>
    </div>
  {/if}
  {#if detailsOpen && v.perf}
    <div class="mb-2 bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl p-3 flex flex-col gap-2">
      <div class="flex flex-wrap gap-1" aria-label="Each note: pitch over rhythm">
        {#each perfNotes as n, i}
          <span class="flex flex-col rounded-md overflow-hidden w-7 text-[10px] font-bold tabular-nums text-center" title="Note {i + 1}: pitch {n.pitch}%, rhythm {n.rhythm}%{n.missed ? ', not heard' : ''}{n.cutShort ? ', cut short' : ''}">
            <span class="{tone(n.pitch)} leading-4">{i + 1}</span>
            <span class="{tone(n.rhythm)} leading-3 opacity-80">♩</span>
          </span>
        {/each}
      </div>
      {#if v.perf.drift !== undefined && Math.abs(v.perf.drift) >= 15}
        <p class="text-xs font-bold text-sr-ink-2">
          Your tuning drifted {Math.abs(v.perf.drift)} cents {v.perf.drift > 0 ? "sharp" : "flat"} by the end{$tuner.gradeStrictness === "strict" ? "." : " - each note was judged in tune with where you were."}
        </p>
      {/if}
      <p class="text-xs text-sr-muted">
        Each note: pitch on top, rhythm below. On the score, the line is the pitch you sang: blue on the note, red off it.
        An arrow above a note means you came in early or late; a dashed line under it, you let go early; a cross over a rest, you sang through it.
        Tap a note for details.
      </p>
    </div>
  {/if}
  {#if stuckOpen}
    <div class="mb-2 ml-auto w-fit bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl p-2 flex flex-col gap-1">
      <button class="sr-tok text-sm text-left" on:click={() => help("note")} title="The note then scores at most 50">Play this note</button>
      <button class="sr-tok text-sm text-left" on:click={() => help("tonic")}>Play the tonic</button>
      <button class="sr-tok text-sm text-left" on:click={() => help("triad")}>Play the tonic chord</button>
      <button class="sr-tok text-sm text-left" on:click={skip}>Skip this note</button>
    </div>
  {/if}
  {#if detailsOpen && v.result}
    <div class="mb-2 bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl p-3 flex flex-col gap-2">
      <div class="flex flex-wrap gap-1" aria-label="Each note">
        {#each sung as n, i}
          <span
            class="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold tabular-nums {tone(n.score)}"
            title="Note {i + 1}: {OUTCOME[n.outcome]}, {n.score}%{n.help.heardKey ? ', heard the key' : ''}"
          >{i + 1}</span>
        {/each}
      </div>
      <p class="text-xs text-sr-muted">
        {firstTimes} of {sung.length} right first time. On the score, green is right first time, amber corrected or
        helped, red skipped; the line is the pitch you sang, blue on the note, red off it. Tap a note for details.
      </p>
    </div>
  {/if}

  <div class="bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl px-3 py-2 flex items-center gap-2 sm:gap-3 min-h-[56px]">
    {#if allowed === false}
      <p class="flex-1 text-sm text-sr-ink-2">Grade scores your singing, note by note. It's part of Pro, $19.99 a year.</p>
      <a class="sr-btn text-sm px-4 py-2 shrink-0" href={signedIn ? "/account#plan" : `/login?mode=signup&next=${encodeURIComponent("/account#plan")}`}>Get Pro</a>
    {:else if v.phase === "idle"}
      <div class="flex-1 min-w-0 flex flex-col gap-1">
        <p class="text-sm font-bold text-sr-ink">
          {performance ? "Sing it in time. The music keeps going." : "Sing each note. The cursor waits for you."}
        </p>
        {#if blocked}
          <p class="text-xs text-sr-muted">{blocked}</p>
        {:else}
          <button class="text-xs text-sr-action-fg font-bold text-left inline-flex items-center gap-1" on:click={() => (setupOpen = !setupOpen)} aria-expanded={setupOpen}>
            {performance ? "Pitch & rhythm" : "Pitch only"} · {STRICTNESS[$tuner.gradeStrictness].label}{performance ? ` · cursor ${$tuner.gradeCursor} · click ${$tuner.gradeClick === "sub" ? "subdivided" : $tuner.gradeClick}` : ""}
            <ChevronUp size={12} class={setupOpen ? "" : "rotate-180"} />
          </button>
        {/if}
      </div>
      <button class="sr-btn text-sm px-5 py-2 shrink-0" on:click={() => { setupOpen = false; onStart(); }} disabled={!!blocked || allowed === null}>{allowed === null ? "…" : "Start"}</button>
    {:else if v.phase === "reference" || v.phase === "countIn"}
      <p class="flex-1 text-sm font-bold">{v.phase === "reference" ? "Listen…" : "Get ready…"}</p>
      <button class="sr-btn-quiet text-sm shrink-0" on:click={() => runner.stop()}>Stop</button>
    {:else if v.phase === "sing"}
      <svg width="32" height="32" viewBox="0 0 32 32" class="shrink-0" aria-hidden="true">
        <circle cx="16" cy="16" r="12" fill="none" stroke="var(--sr-track)" stroke-width="5" />
        <circle cx="16" cy="16" r="12" fill="none" stroke={v.onTarget || v.credited ? "var(--sr-action)" : "var(--sr-faint)"} stroke-width="5"
          stroke-dasharray={RING} stroke-dashoffset={RING * (1 - v.hold)} transform="rotate(-90 16 16)" stroke-linecap="round" />
      </svg>
      <div class="flex-1 min-w-0 flex flex-col leading-tight">
        <span class="text-xs font-bold text-sr-muted tabular-nums">Note {v.index + 1} of {v.total}</span>
        <span class="text-sm font-semibold truncate {lineTone}" aria-live="polite">{line}</span>
      </div>
      <button
        class="sr-btn-quiet text-sm shrink-0 inline-flex items-center gap-1"
        on:click={() => (stuckOpen = !stuckOpen)}
        aria-expanded={stuckOpen}
      >Stuck? <ChevronUp size={14} class={stuckOpen ? "" : "rotate-180"} /></button>
      <button class="sr-btn-quiet text-sm shrink-0" on:click={() => runner.stop()}>Stop</button>
    {:else if v.phase === "results" && v.perf}
      <div class="flex items-baseline gap-3 shrink-0">
        <span class="flex flex-col items-center leading-none"><span class="text-xl font-extrabold tabular-nums">{v.perf.pitch}%</span><span class="text-[10px] font-bold text-sr-muted uppercase">Pitch</span></span>
        <span class="flex flex-col items-center leading-none"><span class="text-xl font-extrabold tabular-nums">{v.perf.rhythm}%</span><span class="text-[10px] font-bold text-sr-muted uppercase">Rhythm</span></span>
        <span class="text-xl font-extrabold text-sr-action-fg">{v.perf.letter}</span>
      </div>
      <button class="flex-1 min-w-0 text-left text-sm text-sr-ink-2 truncate inline-flex items-center gap-1" on:click={() => (detailsOpen = !detailsOpen)} aria-expanded={detailsOpen}>
        {detail ?? (pitchToWork + rhythmToWork === 0 ? "In tune and in time" : `${pitchToWork} pitch, ${rhythmToWork} rhythm to work on`)}
        <ChevronUp size={14} class="shrink-0 {detailsOpen ? '' : 'rotate-180'}" />
      </button>
      <button class="sr-btn text-sm px-4 py-2 shrink-0" on:click={onStart}>Try again</button>
      <button class="sr-btn-quiet text-sm shrink-0 max-sm:hidden" on:click={onNewExercise}>New exercise</button>
      {#if onSave}<button class="sr-btn-quiet text-xs shrink-0" on:click={onSave} title="Download the recording and the grading's data, to send for review">Save this run</button>{/if}
    {:else if v.phase === "results" && v.result}
      <div class="flex items-baseline gap-2 shrink-0">
        <span class="flex flex-col items-center leading-none"><span class="text-2xl font-extrabold tabular-nums">{v.result.score}%</span><span class="text-[10px] font-bold text-sr-muted uppercase">Pitch</span></span>
        <span class="text-xl font-extrabold text-sr-action-fg">{v.result.letter}</span>
      </div>
      <button class="flex-1 min-w-0 text-left text-sm text-sr-ink-2 truncate inline-flex items-center gap-1" on:click={() => (detailsOpen = !detailsOpen)} aria-expanded={detailsOpen}>
        {detail ?? (toWork === 0 ? "Every note right first time" : `${firstTimes} of ${sung.length} right first time`)}
        <ChevronUp size={14} class="shrink-0 {detailsOpen ? '' : 'rotate-180'}" />
      </button>
      <button class="sr-btn text-sm px-4 py-2 shrink-0" on:click={onStart}>Try again</button>
      <button class="sr-btn-quiet text-sm shrink-0 max-sm:hidden" on:click={onNewExercise}>New exercise</button>
      {#if onSave}<button class="sr-btn-quiet text-xs shrink-0" on:click={onSave} title="Download the recording and the grading's data, to send for review">Save this run</button>{/if}
    {/if}
    <button class="w-8 h-8 rounded-lg flex items-center justify-center text-sr-muted hover:text-sr-ink shrink-0" on:click={onClose} aria-label="Close Grade">
      <X size={16} />
    </button>
  </div>
</div>

<style>
  /* Just above the playback bar, whose height the page publishes. */
  .grade-dock { bottom: calc(var(--bottom-bar-h, 96px) + 10px); }
</style>
