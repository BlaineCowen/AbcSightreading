<script lang="ts">
  import { onMount } from "svelte";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import Music from "lucide-svelte/icons/music";
  import { presetKeyOf } from "../lib/class-validate";
  import { ladderStages, stepTitle } from "../lib/ladder";
  import { uilPresets } from "../lib/uil-presets";
  import { MAX_MINUTES, assignmentKind } from "../lib/practice";
  import { assignmentHref } from "../lib/assignment-client";
  import AssignPieceForm from "./pieces/AssignPieceForm.svelte";

  /**
   * A class's assignments. Two kinds, kept apart wherever they show:
   * sight reading (a preset - a step, a level, a saved preset - written new
   * each time, for some minutes) and a piece from My music (bars of one part
   * of the teacher's own music, sung or played along with the rest). Below,
   * each student's practice over the last week, assigned or not.
   */

  export let classId: string;
  /** The teacher's saved presets, both pages, loaded once by the parent. */
  export let saved: { id: string; name: string; page: string }[] = [];

  type Row = { studentId: string; seconds: number; exercises: number; lastActive: number | null; status: string; percent: number };
  type Assignment = {
    id: string; title: string; page: string; presetKey: string; minutes: number; dueAt: number | null; note: string;
    maxAttempts?: number | null; progress: Row[];
  };
  type Student = { id: string; name: string; week: { seconds: number; exercises: number } };

  let students: Student[] = [];
  let assignments: Assignment[] = [];
  let loaded = false;
  let problem = "";
  /** The assign panel: closed, choosing a kind, or filling in one. */
  let assigning: null | "choose" | "sight-reading" | "piece" = null;
  let busy = false;
  let openId: string | null = null;
  let showWeek = false;
  let confirmRemove: string | null = null;

  let form = { presetKey: "", minutes: 15, dueAt: "", note: "" };

  async function load() {
    const res = await fetch(`/api/classes/${classId}/assignments`);
    if (res.ok) ({ students, assignments } = await res.json());
    loaded = true;
  }
  onMount(load);

  async function assign() {
    busy = true;
    problem = "";
    const res = await fetch(`/api/classes/${classId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    busy = false;
    if (!res.ok) {
      problem = body.error ?? "Could not assign that.";
      return;
    }
    await assigned(body.id);
  }

  async function assigned(id: string) {
    assigning = null;
    form = { presetKey: "", minutes: 15, dueAt: "", note: "" };
    openId = id;
    await load();
  }

  async function remove(a: Assignment) {
    confirmRemove = null;
    const res = await fetch(`/api/assignments/${a.id}`, { method: "DELETE" });
    if (res.ok) assignments = assignments.filter((x) => x.id !== a.id);
  }

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "";
  const minutes = (s: number) => Math.floor(s / 60);
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const ago = (ms: number | null) => {
    if (!ms) return "-";
    const m = Math.round((Date.now() - ms) / 60_000);
    return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(ms);
  };
  const doneCount = (a: Assignment) => a.progress.filter((p) => p.status === "done").length;
  const startedCount = (a: Assignment) => a.progress.filter((p) => p.status !== "not-started").length;
  /** "15 min · due Oct 12", or for a piece "Up to 3 attempts · due Oct 12". */
  const meta = (a: Assignment) =>
    [
      assignmentKind(a) === "piece"
        ? a.maxAttempts
          ? `up to ${a.maxAttempts} attempt${a.maxAttempts === 1 ? "" : "s"}`
          : "as many attempts as they like"
        : null,
      a.minutes ? `${a.minutes} min` : null,
      a.dueAt ? `due ${day(a.dueAt)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const tally = (a: Assignment) => (a.minutes ? `${doneCount(a)} of ${a.progress.length} done` : `${startedCount(a)} of ${a.progress.length} started`);
  const today = new Date().toISOString().slice(0, 10);
  const input = "rounded-xl border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-2 min-h-10";
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <h4 class="text-sm font-semibold text-sr-ink">Assignments</h4>
    {#if students.length}
      <button class="text-xs text-sr-muted underline" on:click={() => (showWeek = !showWeek)}>{showWeek ? "Hide" : "Practice this week"}</button>
    {/if}
  </div>

  {#if showWeek}
    <table class="text-sm w-full">
      <thead><tr class="text-left text-xs text-sr-muted"><th class="font-medium py-1">Last 7 days</th><th class="font-medium text-right">Minutes</th><th class="font-medium text-right">Exercises</th></tr></thead>
      <tbody>
        {#each students as s (s.id)}
          <tr class="border-t border-sr-hairline"><td class="py-1 text-sr-ink">{s.name}</td><td class="text-right tabular-nums">{minutes(s.week.seconds)}</td><td class="text-right tabular-nums">{s.week.exercises}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if problem && assigning !== "sight-reading"}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

  {#each assignments as a (a.id)}
    {@const piece = assignmentKind(a) === "piece"}
    <div class="border border-sr-hairline rounded-2xl">
      <button class="w-full flex items-center justify-between gap-3 p-3 text-left" on:click={() => (openId = openId === a.id ? null : a.id)} aria-expanded={openId === a.id}>
        <span class="flex items-start gap-2 min-w-0">
          <span class="kind {piece ? 'kind-piece' : 'kind-sr'}">{#if piece}<Music size={12} aria-hidden="true" /> My music{:else}<Sparkles size={12} aria-hidden="true" /> Sight reading{/if}</span>
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-sr-ink">{a.title}</span>
            {#if meta(a)}<span class="block text-xs text-sr-muted">{meta(a)}</span>{/if}
          </span>
        </span>
        <span class="text-xs text-sr-muted shrink-0 tabular-nums">{tally(a)}</span>
      </button>
      {#if openId === a.id}
        <div class="px-3 pb-3 flex flex-col gap-2">
          {#if a.note}<p class="text-sm text-sr-ink-2">{a.note}</p>{/if}
          <table class="text-sm w-full">
            <thead><tr class="text-left text-xs text-sr-muted"><th class="font-medium py-1">Student</th><th class="font-medium">Time</th><th class="font-medium text-right">{piece ? "" : "Exercises"}</th><th class="font-medium text-right">Last</th></tr></thead>
            <tbody>
              {#each a.progress as p (p.studentId)}
                <tr class="border-t border-sr-hairline">
                  <td class="py-1.5 text-sr-ink">{nameOf(p.studentId)}</td>
                  <td class="w-2/5">
                    {#if a.minutes}
                      <div class="flex items-center gap-2">
                        <div class="h-1.5 flex-1 rounded bg-sr-track overflow-hidden"><div class="h-full {p.status === 'done' ? 'bg-sr-action' : 'bg-sr-brass'}" style="width: {p.percent}%"></div></div>
                        <span class="tabular-nums text-xs text-sr-ink-2 w-14 text-right">{p.status === "not-started" ? "not yet" : `${Math.min(minutes(p.seconds), a.minutes)}/${a.minutes}`}</span>
                      </div>
                    {:else}
                      <span class="tabular-nums text-xs text-sr-ink-2">{p.seconds ? `${Math.max(1, minutes(p.seconds))} min practised` : "not yet"}</span>
                    {/if}
                  </td>
                  <td class="text-right tabular-nums">{piece ? "" : p.exercises}</td>
                  <td class="text-right text-xs text-sr-muted whitespace-nowrap">{ago(p.lastActive)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <a class="underline text-sr-action-fg" href={assignmentHref(a)}>Open it as students see it</a>
            {#if confirmRemove === a.id}
              <span class="text-sr-ink">Remove it? Their practice time stays in the log.</span>
              <button class="text-sr-danger font-semibold" on:click={() => remove(a)}>Remove</button>
              <button class="text-sr-muted underline" on:click={() => (confirmRemove = null)}>Keep</button>
            {:else}
              <button class="text-sr-muted hover:text-sr-danger inline-flex items-center gap-1" on:click={() => (confirmRemove = a.id)}><Trash2 size={12} /> Remove</button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/each}

  {#if loaded && !assignments.length && !assigning}
    <p class="text-xs text-sr-muted">Nothing assigned yet. Students see assignments when they sign in, and their time counts while they practise.</p>
  {/if}

  {#if assigning === "choose"}
    <div class="flex flex-col gap-2 border border-sr-hairline rounded-2xl p-3">
      <p class="text-sm font-semibold text-sr-ink">What should they practise?</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <button type="button" class="kind-card bg-sr-sky text-sr-sky-ink" on:click={() => (assigning = "sight-reading")}>
          <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><Sparkles size={14} aria-hidden="true" /> Sight reading</span>
          <span class="font-bold">Something new each time</span>
          <span class="text-sm">An abcStepByStep step, a UIL level or one of your presets. Every exercise is freshly written, so they read rather than remember. Set the minutes.</span>
        </button>
        <button type="button" class="kind-card bg-sr-peach text-sr-peach-ink" on:click={() => (assigning = "piece")}>
          <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><Music size={14} aria-hidden="true" /> My music</span>
          <span class="font-bold">A piece you are learning</span>
          <span class="text-sm">Bars of one part of a piece you uploaded, sung or played with the other parts. Choose the bars, what plays along and how many attempts.</span>
        </button>
      </div>
      <button type="button" class="text-sm text-sr-muted underline self-start" on:click={() => (assigning = null)}>Cancel</button>
    </div>
  {:else if assigning === "sight-reading"}
    <form class="flex flex-col gap-3 border border-sr-hairline rounded-2xl p-3" on:submit|preventDefault={assign}>
      <p class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sr-muted"><Sparkles size={14} aria-hidden="true" /> Sight reading</p>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Practise
        <select class={input} bind:value={form.presetKey} required>
          <option value="" disabled>Choose…</option>
          {#each ladderStages() as stage}
            <optgroup label="abcStepByStep: {stage.stage}">
              {#each stage.steps as step}<option value={presetKeyOf.step(step.id)}>{step.number}. {stepTitle(step)}</option>{/each}
            </optgroup>
          {/each}
          <optgroup label="UIL levels">
            {#each Object.entries(uilPresets) as [key, level]}<option value={presetKeyOf.uil(key)}>{level.label ?? key}</option>{/each}
          </optgroup>
          {#if saved.length}
            <optgroup label="Your presets">
              {#each saved as p}<option value={presetKeyOf.saved(p.id)}>{p.name} ({p.page})</option>{/each}
            </optgroup>
          {/if}
        </select>
      </label>
      <div class="flex flex-wrap gap-3">
        <label class="text-sm text-sr-ink-2 flex items-center gap-2">Minutes <input class="{input} w-20" type="number" min="1" max={MAX_MINUTES} bind:value={form.minutes} required /></label>
        <label class="text-sm text-sr-ink-2 flex items-center gap-2">Due <input class={input} type="date" min={today} bind:value={form.dueAt} /></label>
      </div>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Note for students <span class="text-xs text-sr-faint">optional</span>
        <input class={input} bind:value={form.note} maxlength="300" placeholder="Sing on solfège, then on loo" />
      </label>
      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      <div class="flex gap-2">
        <button class="sr-btn text-sm" disabled={busy || !form.presetKey}>Assign</button>
        <button type="button" class="sr-btn-quiet text-sm" on:click={() => (assigning = "choose")}>Back</button>
      </div>
    </form>
  {:else if assigning === "piece"}
    <div class="flex flex-col gap-3 border border-sr-hairline rounded-2xl p-3">
      <p class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sr-muted"><Music size={14} aria-hidden="true" /> My music</p>
      <AssignPieceForm {classId} onDone={(r) => assigned(r.id)} onCancel={() => (assigning = "choose")} />
    </div>
  {:else}
    <button class="sr-btn-quiet text-sm self-start" on:click={() => ((assigning = "choose"), (problem = ""))}>Assign practice</button>
  {/if}
</div>

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
  .kind-card {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-align: left;
    padding: 1rem 1.1rem;
    border-radius: 20px;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .kind-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--sr-card-shadow);
  }
</style>
