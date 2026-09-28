<script lang="ts">
  import { sessionSeconds } from "../lib/practice-tracker";

  /**
   * The assignment a student is working on: what it is, and minutes so far
   * against minutes set. Its settings are locked while it is open; leaving it
   * goes back to the page's own.
   */
  export let assignment: { title: string; minutes: number; note: string; seconds: number; role: string; dueAt: number | null };

  $: done = Math.floor((assignment.seconds + $sessionSeconds) / 60);
  $: percent = Math.min(100, Math.round(((assignment.seconds + $sessionSeconds) / (assignment.minutes * 60)) * 100));
  $: leave = typeof location !== "undefined" ? location.pathname : "/";
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
</script>

<div class="w-full max-w-xl mt-3 rounded-lg border border-sr-hairline bg-sr-panel p-3 flex flex-col gap-2 no-print" role="status">
  <div class="flex justify-between gap-3 items-baseline">
    <p class="text-sm text-sr-ink"><span class="text-xs uppercase tracking-wide text-sr-brass font-semibold mr-1">Assignment</span> {assignment.title}</p>
    {#if assignment.role === "student"}
      <p class="text-sm tabular-nums text-sr-ink-2 shrink-0">{Math.min(done, assignment.minutes)} of {assignment.minutes} min</p>
    {:else}
      <p class="text-sm text-sr-muted shrink-0">{assignment.minutes} min</p>
    {/if}
  </div>
  {#if assignment.role === "student"}
    <div class="h-2 rounded bg-sr-track overflow-hidden"><div class="h-full bg-sr-action transition-all" style="width: {percent}%"></div></div>
  {/if}
  {#if assignment.note}<p class="text-sm text-sr-ink-2">{assignment.note}</p>{/if}
  <p class="text-xs text-sr-muted">
    {#if percent >= 100}Done! Keep going if you like.{:else}Time counts while you're practising here.{/if}
    {#if assignment.dueAt}Due {day(assignment.dueAt)}.{/if}
    The settings are the assignment's. <a class="underline" href={leave}>Leave the assignment</a>
  </p>
</div>
