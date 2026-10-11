<script lang="ts">
  import Download from "lucide-svelte/icons/download";
  import { averageOf, gradeOf, gradebookCsv, type GradeCell } from "../lib/gradebook";

  /**
   * A class's gradebook: a row a student, a column an assignment (oldest
   * first, as a school gradebook runs), the best graded attempt in each cell,
   * or the share of the minutes where nothing is graded yet; the average at
   * the end. Download CSV gives the same grid for any school gradebook.
   */

  type Row = { studentId: string; seconds: number; percent: number; attempts?: number; best?: number | null };
  type Assignment = { id: string; title: string; minutes: number; dueAt: number | null; progress: Row[] };
  type Student = { id: string; name: string; username?: string | null };

  export let className = "";
  export let students: Student[];
  export let assignments: Assignment[];

  $: columns = [...assignments].reverse();
  $: grid = students.map((s) => {
    const cells: GradeCell[] = columns.map((a) => {
      const p = a.progress.find((r) => r.studentId === s.id) ?? { seconds: 0, percent: 0 };
      return gradeOf(a, p);
    });
    return { student: s, cells, average: averageOf(cells.map((c) => c.grade)) };
  });
  $: columnAverage = columns.map((_, i) => averageOf(grid.map((r) => r.cells[i].grade)));

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const band = (g: number | null) => (g === null ? "" : g >= 90 ? "g-high" : g >= 70 ? "g-mid" : "g-low");
  const titleOf = (c: GradeCell) =>
    c.from === "attempt"
      ? `Best of ${c.attempts} graded attempt${c.attempts === 1 ? "" : "s"}`
      : c.from === "time"
        ? "Nothing graded yet: the share of the minutes practised"
        : "Not started";

  function download() {
    const csv = gradebookCsv(
      columns.map((a) => ({ id: a.id, title: a.title, dueAt: a.dueAt })),
      grid.map((r) => ({ name: r.student.name, username: r.student.username ?? null, grades: r.cells.map((c) => c.grade) })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(className || "class").replace(/[^\w\- ]+/g, "").trim() || "class"} grades ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<div class="flex flex-col gap-2">
  {#if !columns.length || !students.length}
    <p class="text-xs text-sr-muted">{!students.length ? "No students yet." : "Nothing assigned yet."} Grades appear here as students practise.</p>
  {:else}
    <div class="book" role="region" aria-label="Gradebook" tabindex="0">
      <table class="text-sm">
        <thead>
          <tr>
            <th class="sticky-col text-left">Student</th>
            {#each columns as a (a.id)}
              <th class="col-head" title={a.title}>
                <span class="block truncate">{a.title}</span>
                {#if a.dueAt}<span class="block text-[11px] font-normal text-sr-muted">due {day(a.dueAt)}</span>{/if}
              </th>
            {/each}
            <th class="col-head">Average</th>
          </tr>
        </thead>
        <tbody>
          {#each grid as r (r.student.id)}
            <tr>
              <th class="sticky-col text-left font-medium text-sr-ink" scope="row">{r.student.name}</th>
              {#each r.cells as c}
                <td class="cell" title={titleOf(c)}>
                  {#if c.grade === null}<span class="text-sr-faint">-</span>
                  {:else}<span class="grade {band(c.grade)}" class:from-time={c.from === "time"}>{c.grade}{c.from === "time" ? "%" : ""}</span>{/if}
                </td>
              {/each}
              <td class="cell font-bold text-sr-ink">{r.average ?? "-"}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th class="sticky-col text-left text-xs text-sr-muted font-medium" scope="row">Class average</th>
            {#each columnAverage as g}<td class="cell text-xs text-sr-muted">{g ?? "-"}</td>{/each}
            <td class="cell"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-sr-muted">Each grade is the best graded attempt. A grade with % is minutes practised, where nothing is graded yet. A dash is not started.</p>
      <button class="sr-btn-quiet text-sm inline-flex items-center gap-1.5 border border-sr-hairline rounded-full px-3 py-1.5" on:click={download}><Download size={14} aria-hidden="true" /> Download CSV</button>
    </div>
  {/if}
</div>

<style>
  .book {
    overflow-x: auto;
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
    border-bottom-color: var(--sr-hairline);
  }
  tfoot th,
  tfoot td {
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
    max-width: 8.5rem;
    min-width: 5.5rem;
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
  .from-time {
    background: transparent;
    color: var(--sr-ink-2);
    font-weight: 600;
    border: 1px dashed var(--sr-hairline);
  }
</style>
