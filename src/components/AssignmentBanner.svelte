<script lang="ts">
  import { sessionSeconds } from "../lib/practice-tracker";
  import { STAGES, type Stage } from "../lib/portfolio";
  import { readerById } from "../lib/readers";

  /**
   * The assignment a student is working on: what it is, and minutes so far
   * against minutes set. Its settings are locked while it is open; leaving it
   * goes back to the page's own.
   */
  export let assignment: { title: string; minutes: number; note: string; seconds: number; role: string; dueAt: number | null };
  /** One exercise for the whole class, not new ones each time. */
  export let fixed = false;
  /** A portfolio checkpoint (portfolio.ts): its stage and tries. */
  export let checkpoint: { stage: Stage; tries: number } | null = null;
  /** The parts students pick from (assignment-parts.ts), the one picked, and what to say about it. */
  export let parts: string[] | null = null;
  export let partId: string | null = null;
  export let partNote = "";
  export let onPart: (id: string) => void = () => {};

  $: done = Math.floor((assignment.seconds + $sessionSeconds) / 60);
  $: timed = assignment.minutes > 0;
  $: percent = timed ? Math.min(100, Math.round(((assignment.seconds + $sessionSeconds) / (assignment.minutes * 60)) * 100)) : 0;
  $: leave = typeof location !== "undefined" ? location.pathname : "/";
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
</script>

<div class="w-full max-w-xl mt-3 rounded-lg border border-sr-hairline bg-sr-panel p-3 flex flex-col gap-2 no-print" role="status">
  <div class="flex justify-between gap-3 items-baseline">
    <p class="text-sm text-sr-ink"><span class="text-xs uppercase tracking-wide text-sr-brass font-semibold mr-1">Assignment</span> {assignment.title}</p>
    {#if !timed}
      {#if checkpoint}<p class="text-sm text-sr-muted shrink-0">{STAGES[checkpoint.stage]}</p>{/if}
    {:else if assignment.role === "student"}
      <p class="text-sm tabular-nums text-sr-ink-2 shrink-0">{Math.min(done, assignment.minutes)} of {assignment.minutes} min</p>
    {:else}
      <p class="text-sm text-sr-muted shrink-0">{assignment.minutes} min</p>
    {/if}
  </div>
  {#if parts?.length}
    <label class="part flex flex-wrap items-center gap-2 text-sm text-sr-ink" class:need={!partId} data-part-picker>
      <span class="font-semibold">{partId ? "Your part" : "Choose your part first"}</span>
      <select class="rounded-xl border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-2 min-h-10" value={partId ?? ""} on:change={(e) => e.currentTarget.value && onPart(e.currentTarget.value)}>
        {#if !partId}<option value="" disabled>Pick one</option>{/if}
        {#each parts as id}<option value={id}>{readerById[id]?.name ?? id}</option>{/each}
      </select>
      <span class="text-xs text-sr-muted">{partId ? "The music is written in your range." : "It sets your clef and range."}</span>
    </label>
    {#if partNote}<p class="text-xs text-sr-muted">{partNote}</p>{/if}
  {/if}
  {#if checkpoint}
    <p class="text-sm text-sr-ink-2" data-checkpoint-note>
      <strong>Portfolio checkpoint.</strong> Sight-read it with Grade{checkpoint.tries === 1 ? ": one try" : `: ${checkpoint.tries} tries`}, each a new exercise.
      {#if assignment.role === "student"}Play is off so you meet the music fresh; Grade gives you the tonic chord and counts you in.{/if}
    </p>
  {/if}
  {#if assignment.role === "student" && timed}
    <div class="h-2 rounded bg-sr-track overflow-hidden"><div class="h-full bg-sr-action transition-all" style="width: {percent}%"></div></div>
  {/if}
  {#if assignment.note}<p class="text-sm text-sr-ink-2">{assignment.note}</p>{/if}
  {#if fixed}<p class="text-sm text-sr-ink-2">Everyone in the class sings this same exercise.</p>{/if}
  <p class="text-xs text-sr-muted">
    {#if timed}{#if percent >= 100}Done! Keep going if you like.{:else}Time counts while you're practicing here.{/if}{/if}
    {#if assignment.dueAt}Due {day(assignment.dueAt)}.{/if}
    The settings are the assignment's. <a class="underline" href={leave}>Leave the assignment</a>
  </p>
</div>

<style>
  .part {
    padding: 0.5rem 0.65rem;
    border-radius: 14px;
    background: var(--sr-sky);
    --sr-ink: var(--sr-sky-ink);
    --sr-muted: var(--sr-sky-ink);
  }
  .part.need {
    background: var(--sr-butter);
    --sr-ink: var(--sr-butter-ink);
    --sr-muted: var(--sr-butter-ink);
  }
</style>
