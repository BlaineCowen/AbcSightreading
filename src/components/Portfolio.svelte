<script lang="ts">
  import { onMount } from "svelte";
  import Download from "lucide-svelte/icons/download";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import { RUBRIC, STAGES, growthOf, portfolioCsv, resultOf, suggestedLevel, type PortfolioTry, type Stage } from "../lib/portfolio";

  /**
   * A class's sight-reading portfolio (portfolio.ts): a row a student, a
   * column a checkpoint in the order given, each cell the best graded try
   * (its recording to hear) and the rubric level the teacher gives it, then
   * the change from the first checkpoint to the last. Download CSV is the
   * same grid, for a district's growth records.
   */

  export let classId: string;
  export let className = "";

  type Checkpoint = { id: string; title: string; stage: Stage; tries: number; createdAt: number };
  type Try = PortfolioTry & { assignmentId: string; studentId: string };
  let checkpoints: Checkpoint[] = [];
  let students: { id: string; name: string; username: string | null }[] = [];
  let tries: Try[] = [];
  let loaded = false;
  let problem = "";
  let showRubric = false;

  async function load() {
    const res = await fetch(`/api/classes/${classId}/portfolio`);
    if (!res.ok) return void (problem = "The portfolio could not be loaded.");
    ({ checkpoints, students, tries } = await res.json());
    loaded = true;
  }
  onMount(load);

  $: grid = students.map((s) => ({
    student: s,
    cells: checkpoints.map((c) => resultOf(tries.filter((t) => t.studentId === s.id && t.assignmentId === c.id))),
  }));

  async function score(t: PortfolioTry, level: number) {
    const next = t.rubric === level ? null : level;
    problem = "";
    const res = await fetch(`/api/attempts/${encodeURIComponent(t.id)}/rubric`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rubric: next }),
    });
    if (!res.ok) return void (problem = (await res.json().catch(() => ({}))).error ?? "That level was not saved.");
    tries = tries.map((x) => (x.id === t.id ? { ...x, rubric: next } : x));
  }

  let audio: HTMLAudioElement | null = null;
  let playing: string | null = null;
  function hear(id: string) {
    audio?.pause();
    if (playing === id) return void (playing = null);
    audio = new Audio(`/api/attempts/${encodeURIComponent(id)}/take`);
    audio.onended = () => (playing = null);
    void audio.play().catch(() => ((playing = null), (problem = "That recording could not be played.")));
    playing = id;
  }

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const band = (g: number | null) => (g === null ? "" : g >= 90 ? "g-high" : g >= 70 ? "g-mid" : "g-low");
  const signed = (n: number | null) => (n === null ? "-" : n > 0 ? `+${n}` : String(n));

  function download() {
    const csv = portfolioCsv(
      checkpoints.map((c) => ({ title: c.title, stage: c.stage, createdAt: c.createdAt })),
      grid.map((r) => ({
        name: r.student.name,
        username: r.student.username,
        cells: r.cells.map((c) => ({ score: c.best?.overall ?? null, rubric: c.rubric, at: c.best?.at ?? null })),
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(className || "class").replace(/[^\w\- ]+/g, "").trim() || "class"} portfolio ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<div class="flex flex-col gap-2" data-portfolio>
  {#if !loaded}
    <p class="text-xs text-sr-muted">{problem || "Loading the portfolio…"}</p>
  {:else if !checkpoints.length}
    <p class="text-xs text-sr-muted">
      No checkpoints yet. Create an assignment and mark it a <strong>portfolio checkpoint</strong> (beginning, middle or end of year): each
      student sight-reads a new exercise at the level, and their score and recording are kept here through the school year.
    </p>
  {:else if !students.length}
    <p class="text-xs text-sr-muted">No students yet.</p>
  {:else}
    <div class="book" role="region" aria-label="Portfolio" tabindex="0">
      <table class="text-sm">
        <thead>
          <tr>
            <th class="sticky-col text-left">Student</th>
            {#each checkpoints as c (c.id)}
              <th class="col-head" title={c.title}>
                <span class="block">{STAGES[c.stage]}</span>
                <span class="block truncate text-[11px] font-normal text-sr-muted">{c.title} · {day(c.createdAt)}</span>
              </th>
            {/each}
            {#if checkpoints.length > 1}<th class="col-head">Change</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each grid as r (r.student.id)}
            <tr>
              <th class="sticky-col text-left font-medium text-sr-ink" scope="row">{r.student.name}</th>
              {#each r.cells as c, i}
                <td class="cell">
                  {#if !c.best}
                    <span class="text-sr-faint" title={c.tries ? "Started, not graded" : "Not done yet"}>{c.tries ? "started" : "-"}</span>
                  {:else}
                    <div class="flex flex-col items-center gap-1">
                      <div class="flex items-center gap-1">
                        <span class="grade {band(c.best.overall)}" title="Best of {c.tries} {c.tries === 1 ? 'try' : 'tries'}, {day(c.best.at)}">{c.best.overall}</span>
                        {#if c.best.hasTake}
                          <button type="button" class="hear" aria-label={playing === c.best.id ? "Stop" : `Hear ${r.student.name}`} on:click={() => c.best && hear(c.best.id)}>
                            {#if playing === c.best.id}<Square size={12} aria-hidden="true" />{:else}<Play size={12} aria-hidden="true" />{/if}
                          </button>
                        {/if}
                      </div>
                      <div class="levels" role="group" aria-label="Rubric level for {r.student.name}, {STAGES[checkpoints[i].stage]}">
                        {#each RUBRIC as l}
                          <button
                            type="button"
                            class="lvl"
                            class:on={c.rubric === l.level}
                            class:hint={c.rubric === null && suggestedLevel(c.best.overall) === l.level}
                            aria-pressed={c.rubric === l.level}
                            title="{l.level} {l.name}: {l.criteria}"
                            on:click={() => c.best && score(c.best, l.level)}>{l.level}</button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </td>
              {/each}
              {#if checkpoints.length > 1}
                <td class="cell text-xs">
                  <span class="block font-bold text-sr-ink">{signed(growthOf(r.cells.map((c) => c.best?.overall ?? null)))}</span>
                  <span class="block text-sr-muted">rubric {signed(growthOf(r.cells.map((c) => c.rubric)))}</span>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-sr-muted">
        Each score is the best graded try. Tap 1 to 4 to give the rubric level; the outlined one is what the score suggests.
        <button type="button" class="underline" aria-expanded={showRubric} on:click={() => (showRubric = !showRubric)}>{showRubric ? "Hide the rubric" : "The rubric"}</button>
      </p>
      <button class="sr-btn-quiet text-sm inline-flex items-center gap-1.5 border border-sr-hairline rounded-full px-3 py-1.5" on:click={download}><Download size={14} aria-hidden="true" /> Download CSV</button>
    </div>
    {#if showRubric}
      <dl class="rubric text-xs">
        {#each RUBRIC as l}<dt>{l.level} {l.name}</dt><dd>{l.criteria}</dd>{/each}
      </dl>
    {/if}
  {/if}
</div>

<style>
  .book {
    overflow-x: auto;
    background: var(--sr-panel);
    border: 1px solid var(--sr-hairline);
    border-radius: 16px;
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    min-width: 100%;
  }
  th,
  td {
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--sr-hairline);
  }
  tbody tr:last-child th,
  tbody tr:last-child td {
    border-bottom: 0;
  }
  .sticky-col {
    position: sticky;
    left: 0;
    background: var(--sr-panel);
    z-index: 1;
    max-width: 11rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  thead th {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--sr-ink-2);
    vertical-align: bottom;
  }
  .col-head {
    max-width: 10rem;
    min-width: 7.5rem;
    text-align: center;
  }
  .cell {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .grade {
    display: inline-block;
    min-width: 2.4rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font-weight: 800;
  }
  .g-high {
    background: var(--sr-mint);
    color: var(--sr-mint-ink);
  }
  .g-mid {
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
  }
  .g-low {
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
  }
  .hear {
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    border: 1px solid var(--sr-hairline);
    color: var(--sr-ink-2);
  }
  .levels {
    display: inline-flex;
    gap: 2px;
  }
  .lvl {
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--sr-ink-2);
    border: 1px solid transparent;
  }
  .lvl.hint {
    border: 1px dashed var(--sr-action);
  }
  .lvl.on {
    background: var(--sr-action);
    color: var(--sr-action-ink);
  }
  .rubric {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 0.75rem;
    color: var(--sr-ink-2);
  }
  .rubric dt {
    font-weight: 700;
    color: var(--sr-ink);
  }
</style>
