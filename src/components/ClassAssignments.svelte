<script lang="ts">
  import { onMount } from "svelte";
  import { Trash2 } from "lucide-svelte";
  import { presetKeyOf } from "../lib/class-validate";
  import { ladderStages } from "../lib/ladder";
  import { uilPresets } from "../lib/uil-presets";
  import { MAX_MINUTES } from "../lib/practice";
  import { assignmentHref } from "../lib/assignment-client";

  /**
   * A class's assignments: set one (a preset and how many minutes, with an
   * optional due date), and see who has opened it and put the time in. Below,
   * each student's practice over the last week, assigned or not.
   */

  export let classId: string;
  /** The teacher's saved presets, both pages, loaded once by the parent. */
  export let saved: { id: string; name: string; page: string }[] = [];

  type Row = { studentId: string; seconds: number; exercises: number; lastActive: number | null; status: string; percent: number };
  type Assignment = { id: string; title: string; page: string; minutes: number; dueAt: number | null; note: string; progress: Row[] };
  type Student = { id: string; name: string; week: { seconds: number; exercises: number } };

  let students: Student[] = [];
  let assignments: Assignment[] = [];
  let loaded = false;
  let problem = "";
  let assigning = false;
  let busy = false;
  let openId: string | null = null;
  let showWeek = false;

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
    assigning = false;
    form = { presetKey: "", minutes: 15, dueAt: "", note: "" };
    openId = body.id;
    await load();
  }

  async function remove(a: Assignment) {
    if (!confirm(`Remove "${a.title}"? The time students spent stays in their practice log.`)) return;
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
  const today = new Date().toISOString().slice(0, 10);
  const input = "rounded border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-2 py-1";
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

  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

  {#each assignments as a (a.id)}
    <div class="border border-sr-hairline rounded-md">
      <button class="w-full flex items-center justify-between gap-2 p-2 text-left" on:click={() => (openId = openId === a.id ? null : a.id)} aria-expanded={openId === a.id}>
        <span class="text-sm text-sr-ink">{a.title} <span class="text-sr-muted">· {a.minutes} min{a.dueAt ? ` · due ${day(a.dueAt)}` : ""}</span></span>
        <span class="text-xs text-sr-muted shrink-0 tabular-nums">{doneCount(a)} of {a.progress.length} done</span>
      </button>
      {#if openId === a.id}
        <div class="px-2 pb-2 flex flex-col gap-2">
          {#if a.note}<p class="text-sm text-sr-ink-2">{a.note}</p>{/if}
          <table class="text-sm w-full">
            <thead><tr class="text-left text-xs text-sr-muted"><th class="font-medium py-1">Student</th><th class="font-medium">Time</th><th class="font-medium text-right">Exercises</th><th class="font-medium text-right">Last</th></tr></thead>
            <tbody>
              {#each a.progress as p (p.studentId)}
                <tr class="border-t border-sr-hairline">
                  <td class="py-1.5 text-sr-ink">{nameOf(p.studentId)}</td>
                  <td class="w-2/5">
                    <div class="flex items-center gap-2">
                      <div class="h-1.5 flex-1 rounded bg-sr-track overflow-hidden"><div class="h-full {p.status === 'done' ? 'bg-sr-action' : 'bg-sr-brass'}" style="width: {p.percent}%"></div></div>
                      <span class="tabular-nums text-xs text-sr-ink-2 w-14 text-right">{p.status === "not-started" ? "not yet" : `${Math.min(minutes(p.seconds), a.minutes)}/${a.minutes}`}</span>
                    </div>
                  </td>
                  <td class="text-right tabular-nums">{p.exercises}</td>
                  <td class="text-right text-xs text-sr-muted whitespace-nowrap">{ago(p.lastActive)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="flex gap-3 text-xs">
            <a class="underline text-sr-action-fg" href={assignmentHref(a)}>Open it as students see it</a>
            <button class="text-sr-muted hover:text-sr-danger inline-flex items-center gap-1" on:click={() => remove(a)}><Trash2 size={12} /> Remove</button>
          </div>
        </div>
      {/if}
    </div>
  {/each}

  {#if loaded && !assignments.length && !assigning}
    <p class="text-xs text-sr-muted">Nothing assigned yet. Students see assignments when they sign in, and their time counts while they practice.</p>
  {/if}

  {#if assigning}
    <form class="flex flex-col gap-2 border border-sr-hairline rounded-md p-2" on:submit|preventDefault={assign}>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Practice
        <select class={input} bind:value={form.presetKey} required>
          <option value="" disabled>Choose…</option>
          {#each ladderStages() as stage}
            <optgroup label="abcStepByStep: {stage.stage}">
              {#each stage.steps as step}<option value={presetKeyOf.step(step.id)}>{step.number}. {step.title}</option>{/each}
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
      <div class="flex gap-2">
        <button class="sr-btn text-sm" disabled={busy || !form.presetKey}>Assign</button>
        <button type="button" class="text-sm text-sr-muted underline" on:click={() => (assigning = false)}>Cancel</button>
      </div>
    </form>
  {:else}
    <button class="sr-btn-quiet text-sm self-start" on:click={() => (assigning = true)}>Assign practice</button>
  {/if}
</div>
