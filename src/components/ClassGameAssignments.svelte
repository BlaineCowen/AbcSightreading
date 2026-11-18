<script lang="ts">
  /**
   * A class's game assignments on /teach (game-assignments.ts): each game, its
   * goal, how many students are done, and each student's rounds. Made from a
   * game's page with Assign to classes; removed here.
   */
  import { onMount } from "svelte";
  import { gameAssignmentHref } from "../lib/game-assignments";

  export let classId: string;
  type Row = {
    id: string; game: string; title: string; goalText: string; goal: { rounds: number }; dueAt: number | null; note: string; done: number; students: number;
    progress: { studentId: string; name: string; rounds: number; passed: number; best: number | null; status: string }[];
  };
  let rows: Row[] = [];
  let loaded = false;
  let open: string | null = null;
  async function load() {
    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(classId)}/game-assignments`);
      if (res.ok) rows = (await res.json()).assignments;
    } catch {}
    loaded = true;
  }
  onMount(load);
  async function remove(id: string) {
    const res = await fetch(`/api/game-assignments/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) rows = rows.filter((r) => r.id !== id);
  }
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
</script>

{#if loaded && rows.length}
  <section class="flex flex-col gap-2" data-class-games>
    <h3 class="font-display text-lg font-bold">Games</h3>
    {#each rows as r (r.id)}
      <div class="card">
        <div class="flex flex-wrap justify-between gap-2 items-baseline">
          <a class="font-bold text-sr-ink" href={gameAssignmentHref(r)}>{r.title}</a>
          <span class="text-sm text-sr-ink-2 tabular-nums" data-game-done={r.done}>{r.done} of {r.students} done</span>
        </div>
        <p class="text-xs text-sr-muted">{r.goalText}{r.dueAt ? ` · due ${day(r.dueAt)}` : ""}{r.note ? ` · ${r.note}` : ""}</p>
        <div class="flex gap-3 text-xs">
          <button class="underline text-sr-ink-2" on:click={() => (open = open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Show"} students</button>
          <button class="underline text-sr-danger" on:click={() => remove(r.id)}>Remove</button>
        </div>
        {#if open === r.id}
          <ul class="text-sm flex flex-col gap-1">
            {#each r.progress as p (p.studentId)}
              <li class="flex justify-between gap-2"><span>{p.status === "done" ? "✓ " : ""}{p.name}</span><span class="tabular-nums text-sr-ink-2">{p.rounds ? `${p.passed} of ${r.goal.rounds} · best ${p.best}` : "not started"}</span></li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  .card { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.75rem 0.9rem; border-radius: 18px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); }
</style>
