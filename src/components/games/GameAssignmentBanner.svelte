<script lang="ts">
  /**
   * Over a game opened from an assignment: what it is, what counts as done,
   * how far along the student is, and the teacher's note. The setup is the
   * teacher's and can't be changed (the levels and Customize are hidden).
   */
  import { ClipboardCheck } from "lucide-svelte";
  import type { OpenGameAssignment } from "../../lib/game-assignment-client";
  import type { GameProgress } from "../../lib/game-assignments";

  export let assignment: OpenGameAssignment;
  export let progress: GameProgress = assignment.progress;
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
</script>

<div class="banner" class:done={progress.status === "done"} data-game-assignment={assignment.id} data-status={progress.status}>
  <ClipboardCheck size={22} aria-hidden="true" />
  <div class="txt">
    <p class="t">{assignment.title}</p>
    <p class="s">
      {assignment.goalText}{assignment.dueAt ? ` · due ${day(assignment.dueAt)}` : ""}
      {#if assignment.role === "student"}
        · <b data-assignment-progress>{progress.status === "done" ? "Done!" : `${progress.passed} of ${assignment.goal.rounds} so far`}</b>{#if progress.best !== null} · best {progress.best}{/if}
      {:else}
        · You're the teacher: your rounds don't count.
      {/if}
    </p>
    {#if assignment.note}<p class="s">{assignment.note}</p>{/if}
  </div>
  <a class="sr-btn-quiet bg-sr-raise" href={location.pathname}>Play freely</a>
</div>

<style>
  .banner { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.8rem 1rem; border-radius: 22px; background: var(--sr-butter); color: var(--sr-butter-ink); }
  .banner.done { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .txt { flex: 1; min-width: 0; }
  .t { font-weight: 800; }
  .s { font-size: 0.85rem; }
</style>
