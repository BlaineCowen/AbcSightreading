<script lang="ts">
  import { onMount } from "svelte";
  import { assignmentHref } from "../lib/assignment-client";
  import { assignmentKind } from "../lib/practice";

  /**
   * A student's assignments from every class they are in: what, how long, by
   * when, and how far along. Opening one puts its settings on the practice
   * page and counts the time. Shows nothing for an account in no class.
   */

  type Item = {
    id: string; title: string; page: string; presetKey: string; minutes: number; dueAt: number | null; note: string; maxAttempts?: number | null;
    className: string; seconds: number; status: "not-started" | "in-progress" | "done"; percent: number; best?: number | null;
  };
  /** Given by the server (the home page), so it arrives with the page; otherwise fetched. */
  export let initial: { enrolled: boolean; assignments: Item[] } | null = null;
  let items: Item[] = initial?.assignments ?? [];
  let enrolled = initial?.enrolled ?? false;
  let showDone = false;

  onMount(async () => {
    if (initial) return;
    const res = await fetch("/api/assignments");
    if (res.ok) ({ enrolled, assignments: items } = await res.json());
  });

  $: todo = items.filter((a) => a.status !== "done");
  $: done = items.filter((a) => a.status === "done");
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const overdue = (a: Item) => a.dueAt !== null && a.dueAt < Date.now();
</script>

{#if enrolled}
  <section class="w-full max-w-md bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-3">
    <h2 class="text-lg font-semibold text-sr-ink">Assignments</h2>
    {#if !items.length}
      <p class="text-sm text-sr-muted">Nothing assigned yet. Your practice time still counts, and your teacher can see it.</p>
    {/if}
    {#each todo as a (a.id)}
      <a href={assignmentHref(a)} class="block rounded-md border border-sr-hairline bg-sr-raise p-3 hover:border-sr-action no-underline">
        <span class="kind {assignmentKind(a) === 'piece' ? 'kind-piece' : 'kind-sr'}">{assignmentKind(a) === "piece" ? "Piece" : "Sight reading"}</span>
        <div class="flex justify-between gap-2 text-sm mt-1">
          <span class="font-medium text-sr-ink">{a.title}</span>
          {#if a.minutes}<span class="tabular-nums text-sr-ink-2 shrink-0">{Math.floor(a.seconds / 60)} of {a.minutes} min</span>
          {:else if a.page === "piece" && a.best !== null && a.best !== undefined}<span class="tabular-nums text-sr-ink-2 shrink-0">best {a.best}</span>{/if}
        </div>
        {#if a.minutes}<div class="h-1.5 rounded bg-sr-track overflow-hidden mt-2"><div class="h-full bg-sr-action" style="width: {a.percent}%"></div></div>{/if}
        <p class="text-xs mt-1.5 {overdue(a) ? 'text-sr-danger' : 'text-sr-muted'}">
          {a.className}{a.dueAt ? ` · ${overdue(a) ? "was due" : "due"} ${day(a.dueAt)}` : ""} · {a.status === "not-started" ? "Start" : "Keep going"} →
        </p>
        {#if a.note}<p class="text-xs text-sr-ink-2 mt-1">{a.note}</p>{/if}
      </a>
    {/each}
    {#if done.length}
      <button class="text-xs text-sr-muted underline self-start" on:click={() => (showDone = !showDone)}>{showDone ? "Hide" : "Show"} {done.length} done</button>
      {#if showDone}
        {#each done as a (a.id)}
          <a href={assignmentHref(a)} class="text-sm text-sr-ink-2 flex justify-between"><span>✓ {a.title}</span><span class="text-sr-muted">{a.className}</span></a>
        {/each}
      {/if}
    {/if}
  </section>
{/if}

<style>
  .kind {
    display: inline-block;
    font-size: 11px;
    font-weight: 800;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
  .kind-sr {
    background: var(--sr-sky);
    color: var(--sr-sky-ink);
  }
  .kind-piece {
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
  }
</style>
