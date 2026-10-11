<script lang="ts">
  import { onMount } from "svelte";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import Music from "lucide-svelte/icons/music";
  import { assignmentKind } from "../lib/practice";
  import { assignmentHref } from "../lib/assignment-client";
  import { CLASSROOM_SCOPES, GRADE_SCOPE, shareToClassroomUrl } from "../lib/classroom";
  import { authClient } from "../lib/auth-client";
  import AssignmentWizard from "./AssignmentWizard.svelte";
  import Gradebook from "./Gradebook.svelte";

  /**
   * A class's assignments. Two kinds, kept apart wherever they show:
   * sight reading (a preset - a step, a level, a saved preset - written new
   * each time, for some minutes) and a piece from My music (bars of one part
   * of the teacher's own music, sung or played along with the rest). Below,
   * each student's practice over the last week, assigned or not.
   */

  export let classId: string;
  export let className = "";
  /** Its students came from Google Classroom: assignments can be posted there and graded. */
  export let googleClass = false;
  /** The teacher's saved presets, both pages, loaded once by the parent. */
  export let saved: { id: string; name: string; page: string }[] = [];
  /** Every class of the teacher's, so one assignment can go to several. */
  export let allClasses: { id: string; name: string }[] = [];

  type Row = {
    studentId: string; seconds: number; exercises: number; lastActive: number | null; status: string; percent: number;
    /** A piece: graded attempts, the best score and which attempt, the part chosen. */
    attempts?: number; best?: number | null; bestId?: string | null; part?: string | null;
  };
  type Assignment = {
    id: string; title: string; page: string; presetKey: string; minutes: number; dueAt: number | null; note: string;
    maxAttempts?: number | null; fixed?: boolean; progress: Row[];
    classroom?: { sentAt: number | null } | null;
  };
  type Student = { id: string; name: string; username?: string | null; week: { seconds: number; exercises: number } };

  let students: Student[] = [];
  let assignments: Assignment[] = [];
  let loaded = false;
  let problem = "";
  /** The assign panel (AssignmentWizard), open or not. */
  let assigning = false;
  let openId: string | null = null;
  let showWeek = false;
  let showBook = false;

  // ── Google Classroom: post an assignment, then send its grades (classroom-grades.ts) ──
  let gcBusy: string | null = null;
  let gcNote: { id: string; text: string; error?: boolean } | null = null;
  async function classroomAction(a: Assignment, action: "post" | "grades") {
    gcBusy = a.id;
    gcNote = null;
    const res = await fetch(`/api/assignments/${a.id}/classroom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    gcBusy = null;
    if (res.ok && action === "post") {
      gcNote = { id: a.id, text: "Posted in Google Classroom. Send grades whenever you like; they arrive as draft grades for you to return." };
      await load();
    } else if (res.ok) {
      const extra = [body.ungraded ? `${body.ungraded} with nothing to grade yet` : "", body.notLinked ? `${body.notLinked} not from Classroom` : ""].filter(Boolean).join(", ");
      gcNote = { id: a.id, text: `${body.sent} grade${body.sent === 1 ? "" : "s"} sent as drafts. Return them in Classroom.${extra ? ` (${extra}.)` : ""}` };
      await load();
    } else if (body.reconnect) {
      // Off to Google for the grades permission; back here to press it again.
      const { error } = await authClient.linkSocial({ provider: "google", scopes: [...CLASSROOM_SCOPES, GRADE_SCOPE], callbackURL: "/account#students" });
      if (error) gcNote = { id: a.id, text: error.message ?? "Could not reach Google.", error: true };
    } else gcNote = { id: a.id, text: body.error ?? "Google Classroom did not take that.", error: true };
  }
  /** A sight-reading attempt opened from its best score: the exercise sung and its take. */
  let shownAttempt: { id: string; exercise: string | null; hasTake: boolean; partName: string } | null = null;
  async function openAttempt(id: string) {
    if (shownAttempt?.id === id) return (shownAttempt = null);
    const res = await fetch(`/api/attempts/${encodeURIComponent(id)}`);
    if (res.ok) shownAttempt = await res.json();
  }
  let confirmRemove: string | null = null;

  async function load() {
    const res = await fetch(`/api/classes/${classId}/assignments`);
    if (res.ok) ({ students, assignments } = await res.json());
    loaded = true;
  }
  onMount(() => {
    void load();
    // Sent from the wizard here or the one at the top of the page, to this class among others.
    const changed = (e: Event) => {
      if ((e as CustomEvent<{ classIds: string[] }>).detail?.classIds?.includes(classId)) void load();
    };
    window.addEventListener("sr-assignments-changed", changed);
    return () => window.removeEventListener("sr-assignments-changed", changed);
  });

  function assigned(r: { classIds: string[]; ids: string[] }) {
    const i = r.classIds.indexOf(classId);
    if (i >= 0) openId = r.ids[i];
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
        : a.fixed ? "one exercise for everyone" : null,
      a.minutes ? `${a.minutes} min` : null,
      a.dueAt ? `due ${day(a.dueAt)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const tally = (a: Assignment) =>
    a.minutes || assignmentKind(a) === "piece" ? `${doneCount(a)} of ${a.progress.length} done` : `${startedCount(a)} of ${a.progress.length} started`;
  /** An attempt opened on the piece, with its marks and take. */
  const attemptHref = (a: Assignment, attemptId: string) => `${assignmentHref(a)}&attempt=${encodeURIComponent(attemptId)}`;
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <h4 class="text-sm font-semibold text-sr-ink">Assignments</h4>
    {#if students.length}
      <span class="flex items-center gap-3">
        {#if assignments.length}<button class="text-xs text-sr-action-fg font-semibold underline" aria-expanded={showBook} on:click={() => (showBook = !showBook)}>{showBook ? "Hide gradebook" : "Gradebook"}</button>{/if}
        <button class="text-xs text-sr-muted underline" on:click={() => (showWeek = !showWeek)}>{showWeek ? "Hide" : "Practice this week"}</button>
      </span>
    {/if}
  </div>

  {#if showBook}<Gradebook {className} {students} {assignments} />{/if}

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
          {#if piece}
            <table class="text-sm w-full">
              <thead><tr class="text-left text-xs text-sr-muted"><th class="font-medium py-1">Student</th><th class="font-medium">Part</th><th class="font-medium text-right">Attempts</th><th class="font-medium text-right">Best</th><th class="font-medium text-right">Practised</th></tr></thead>
              <tbody>
                {#each a.progress as p (p.studentId)}
                  <tr class="border-t border-sr-hairline">
                    <td class="py-1.5 text-sr-ink">{nameOf(p.studentId)}</td>
                    <td class="text-sr-ink-2">{p.part ?? "-"}</td>
                    <td class="text-right tabular-nums">{p.attempts ?? 0}{a.maxAttempts ? ` / ${a.maxAttempts}` : ""}</td>
                    <td class="text-right tabular-nums font-semibold">
                      {#if p.bestId}<a class="underline text-sr-action-fg" href={attemptHref(a, p.bestId)} title="Hear it, with the marks">{p.best}</a>{:else}-{/if}
                    </td>
                    <td class="text-right text-xs text-sr-muted whitespace-nowrap">{p.seconds ? `${Math.max(1, minutes(p.seconds))} min` : "-"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
          <table class="text-sm w-full">
            <thead><tr class="text-left text-xs text-sr-muted"><th class="font-medium py-1">Student</th><th class="font-medium">Time</th><th class="font-medium text-right">{piece ? "" : "Exercises"}</th><th class="font-medium text-right" title="The best graded attempt (Listen and grade, or Clap and grade)">Best</th><th class="font-medium text-right">Last</th></tr></thead>
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
                  <td class="text-right tabular-nums font-semibold">
                    {#if p.bestId}<button class="underline text-sr-action-fg" title="{p.attempts} graded attempt{p.attempts === 1 ? '' : 's'}: open the best" on:click={() => openAttempt(p.bestId ?? "")}>{p.best}</button>{:else}-{/if}
                  </td>
                  <td class="text-right text-xs text-sr-muted whitespace-nowrap">{ago(p.lastActive)}</td>
                </tr>
                {#if shownAttempt && shownAttempt.id === p.bestId}
                  <tr><td colspan="5" class="pb-2">
                    <div class="flex flex-wrap items-center gap-3 rounded-xl bg-sr-panel border border-sr-hairline p-2 text-xs">
                      <span class="text-sr-ink-2">{shownAttempt.partName}</span>
                      {#if shownAttempt.hasTake}<audio controls preload="none" src="/api/attempts/{encodeURIComponent(shownAttempt.id)}/take" class="h-8 max-w-full"></audio>{/if}
                      {#if shownAttempt.exercise}<a class="underline text-sr-action-fg" href={shownAttempt.exercise} target="_blank" rel="noopener">Open the exercise</a>{/if}
                    </div>
                  </td></tr>
                {/if}
              {/each}
            </tbody>
          </table>
          {/if}
          {#if gcNote?.id === a.id}<p class="text-xs {gcNote.error ? 'text-sr-danger' : 'text-sr-ink-2'}" role="status">{gcNote.text}</p>{/if}
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <a class="underline text-sr-action-fg" href={assignmentHref(a)}>{piece ? "Open it: every attempt, and try it as they will" : "Open it as students see it"}</a>
            {#if googleClass}
              {#if a.classroom}
                <button class="underline text-sr-action-fg font-semibold disabled:opacity-50" disabled={gcBusy === a.id} on:click={() => classroomAction(a, "grades")} title="Each student's grade goes to Classroom as a draft grade">{gcBusy === a.id ? "Sending…" : "Send grades to Classroom"}</button>
                {#if a.classroom.sentAt}<span class="text-sr-muted">sent {ago(a.classroom.sentAt)}</span>{/if}
              {:else}
                <button class="underline text-sr-action-fg font-semibold disabled:opacity-50" disabled={gcBusy === a.id} on:click={() => classroomAction(a, "post")} title="Post it as an assignment in the Google Classroom class, so its grades can go there">{gcBusy === a.id ? "Posting…" : "Post to Google Classroom"}</button>
              {/if}
            {:else}
              <a class="underline text-sr-action-fg" target="_blank" rel="noopener" href={shareToClassroomUrl(new URL(assignmentHref(a), location.origin).href, a.title)} title="Post a link to this assignment in Google Classroom">Share to Google Classroom</a>
            {/if}
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

  {#if assigning}
    <AssignmentWizard classes={allClasses.length ? allClasses : [{ id: classId, name: className }]} preselect={classId} {saved} onDone={assigned} onCancel={() => (assigning = false)} />
  {:else}
    <button class="sr-btn-quiet text-sm self-start" on:click={() => ((assigning = true), (problem = ""))}>Create assignment</button>
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
</style>
