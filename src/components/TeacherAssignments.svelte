<script lang="ts">
  import { onMount } from "svelte";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import Music from "lucide-svelte/icons/music";
  import { assignmentKind } from "../lib/practice";
  import { assignmentHref } from "../lib/assignment-client";
  import { BOARD_PARAM } from "../lib/board-test";

  /**
   * The account page's Assignments tab (Blaine, 16 November 2026: "click an
   * assignment ... open it again and assign to more students"): every
   * assignment in every class, newest first. One given to several classes
   * (the same title and settings) shows once; opened, it lists its classes,
   * each with Open (or Test on the board), and gives it to more classes
   * (POST /api/assignments/<id>/copy). A class's students all have its
   * assignments, and students added later get them too.
   */

  type Item = {
    id: string; classId: string; className: string; group: string; title: string; page: string; presetKey: string;
    minutes: number; dueAt: number | null; note: string; createdAt: number; board?: boolean; fixed?: boolean;
    maxAttempts?: number | null; students: number; done: number; started: number;
  };
  type Cls = { id: string; name: string; students: number };

  let classes: Cls[] = [];
  let items: Item[] = [];
  let loaded = false;
  let problem = "";
  let openKey: string | null = null;
  let query = "";
  /** Classes chosen to give the open assignment to. */
  let chosen: string[] = [];
  let busy = false;
  let note = "";

  async function load() {
    try {
      const res = await fetch("/api/assignments/teaching");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load your assignments.");
      ({ classes, assignments: items } = data);
      problem = "";
    } catch (e) {
      problem = (e as Error).message;
    }
    loaded = true;
  }
  let box: HTMLElement;
  let seen = false;
  onMount(() => {
    // Loaded when the tab is first shown, not with the rest of /account.
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting) && !seen) {
        seen = true;
        void load();
      }
    });
    io.observe(box);
    // Made in the Classes tab: shown here next time it is open.
    const changed = () => {
      if (seen) void load();
    };
    window.addEventListener("sr-assignments-changed", changed);
    return () => {
      io.disconnect();
      window.removeEventListener("sr-assignments-changed", changed);
    };
  });

  /** One row per assignment given to one or more classes: the newest first. */
  $: groups = (() => {
    const by = new Map<string, Item[]>();
    for (const a of items) by.set(a.group, [...(by.get(a.group) ?? []), a]);
    return [...by.entries()].map(([key, list]) => ({ key, first: list[0], list }));
  })();
  $: shown = query.trim()
    ? groups.filter((g) => `${g.first.title} ${g.list.map((a) => a.className).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    : groups;

  function toggle(key: string) {
    openKey = openKey === key ? null : key;
    chosen = [];
    note = "";
  }

  async function give(g: { first: Item; list: Item[] }) {
    if (!chosen.length) return;
    busy = true;
    note = "";
    const res = await fetch(`/api/assignments/${encodeURIComponent(g.first.id)}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classIds: chosen }),
    });
    const data = await res.json().catch(() => ({}));
    busy = false;
    if (!res.ok) {
      note = data.error ?? "Could not assign it. Try again.";
      return;
    }
    const names = chosen.map((id) => classes.find((c) => c.id === id)?.name ?? "").filter(Boolean);
    note = `Given to ${names.join(", ")}.`;
    window.dispatchEvent(new CustomEvent("sr-assignments-changed", { detail: { classIds: chosen } }));
    chosen = [];
    await load();
  }

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const meta = (a: Item) =>
    [
      a.board ? "test on the board" : null,
      assignmentKind(a) === "piece" ? (a.maxAttempts ? `up to ${a.maxAttempts} attempt${a.maxAttempts === 1 ? "" : "s"}` : null) : a.fixed ? "one exercise for everyone" : null,
      a.minutes ? `${a.minutes} min` : null,
      a.dueAt ? `due ${day(a.dueAt)}` : null,
      `made ${day(a.createdAt)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  const tally = (a: Item) => (a.minutes || a.board || assignmentKind(a) === "piece" ? `${a.done} of ${a.students} done` : `${a.started} of ${a.students} started`);
  const classWord = (n: number) => `${n} class${n === 1 ? "" : "es"}`;
</script>

<section bind:this={box} class="w-full max-w-3xl bg-sr-panel border border-sr-hairline rounded-[28px] p-5 sm:p-6 flex flex-col gap-4">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="font-display text-2xl font-bold text-sr-ink">Assignments</h2>
      <p class="text-sm text-sr-muted">Every assignment in your classes. Open one to run it again or give it to more classes.</p>
    </div>
    {#if groups.length > 5}
      <input class="rounded-full border border-sr-hairline bg-sr-track text-sr-ink px-4 py-2 text-sm w-full sm:w-56" type="search" placeholder="Find an assignment or class" bind:value={query} aria-label="Find an assignment or class" />
    {/if}
  </div>

  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem} <button class="underline" on:click={load}>Try again</button></p>{/if}
  {#if !loaded}
    <p class="text-sm text-sr-muted">Loading…</p>
  {:else if !groups.length && !problem}
    <p class="text-sm text-sr-ink-2">Nothing assigned yet. Make one from Create assignment on the Classes tab, or Assign on a practice page.</p>
  {:else if !shown.length}
    <p class="text-sm text-sr-muted">No assignment or class matches “{query}”.</p>
  {/if}

  {#each shown as g (g.key)}
    {@const a = g.first}
    {@const piece = assignmentKind(a) === "piece"}
    {@const open = openKey === g.key}
    {@const others = classes.filter((c) => !g.list.some((x) => x.classId === c.id))}
    <div class="border border-sr-hairline rounded-2xl bg-sr-raise">
      <button class="w-full flex items-center justify-between gap-3 p-3 text-left" aria-expanded={open} on:click={() => toggle(g.key)}>
        <span class="flex items-start gap-2 min-w-0">
          <span class="kind {piece ? 'kind-piece' : 'kind-sr'}">{#if piece}<Music size={12} aria-hidden="true" /> My music{:else}<Sparkles size={12} aria-hidden="true" /> Sight reading{/if}</span>
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-sr-ink">{a.title}</span>
            <span class="block text-xs text-sr-muted">{meta(a)}</span>
          </span>
        </span>
        <span class="text-xs text-sr-muted shrink-0 text-right">{g.list.length === 1 ? a.className : classWord(g.list.length)}</span>
      </button>

      {#if open}
        <div class="px-3 pb-3 flex flex-col gap-3">
          {#if a.note}<p class="text-sm text-sr-ink-2">{a.note}</p>{/if}
          <ul class="flex flex-col">
            {#each g.list as c (c.id)}
              <li class="flex flex-wrap items-center justify-between gap-2 border-t border-sr-hairline py-2">
                <span class="text-sm text-sr-ink font-semibold">{c.className}</span>
                <span class="flex items-center gap-3 text-xs">
                  <span class="text-sr-muted tabular-nums">{tally(c)}</span>
                  {#if c.board}
                    <a class="sr-btn text-xs px-3 py-1.5 no-underline" href="{assignmentHref(c)}&{BOARD_PARAM}=1">Test on the board</a>
                  {:else}
                    <a class="sr-btn-quiet text-xs px-3 py-1.5 no-underline" href={assignmentHref(c)}>Open</a>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>

          <div class="flex flex-col gap-2 rounded-xl border border-sr-hairline p-3">
            <span class="text-sm font-bold text-sr-ink-2">Give it to more classes</span>
            {#if others.length}
              <div class="flex flex-wrap gap-2">
                {#each others as c (c.id)}
                  <button class="sr-tok text-sm {chosen.includes(c.id) ? 'sr-on' : ''}" aria-pressed={chosen.includes(c.id)}
                    on:click={() => (chosen = chosen.includes(c.id) ? chosen.filter((x) => x !== c.id) : [...chosen, c.id])}>{c.name}</button>
                {/each}
                {#if others.length > 2}
                  <button class="text-xs underline text-sr-action-fg" on:click={() => (chosen = chosen.length === others.length ? [] : others.map((c) => c.id))}>{chosen.length === others.length ? "None" : "All of them"}</button>
                {/if}
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button class="sr-btn text-sm px-5" disabled={busy || !chosen.length} on:click={() => give(g)}>{busy ? "Assigning…" : chosen.length ? `Assign to ${classWord(chosen.length)}` : "Assign"}</button>
                <span class="text-xs text-sr-muted">Same settings, due date and note. Each class has its own scores.</span>
              </div>
            {:else}
              <p class="text-xs text-sr-muted">Every one of your classes has it. Students you add to a class get its assignments too.</p>
            {/if}
            {#if note}<p class="text-sm text-sr-ink-2" role="status">{note}</p>{/if}
          </div>
        </div>
      {/if}
    </div>
  {/each}
</section>

<style>
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex: none;
    margin-top: 0.1rem;
    font-size: 11px;
    font-weight: 800;
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    white-space: nowrap;
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
