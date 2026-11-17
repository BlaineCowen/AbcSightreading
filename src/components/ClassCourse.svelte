<script lang="ts">
  import { ArrowUp, ArrowDown, EyeOff, Check, Play } from "lucide-svelte";
  import { setPassed, setCourse, setCourseSteps } from "../lib/classes";
  import { STEP_BY_STEP } from "../lib/curriculum/catalogue";
  import { TRACKS } from "../lib/curriculum/tracks";
  import { OWN_COURSE, LEVEL_ITEMS, classItems, courseName, hiddenItems, itemForKey, listOps, nextItem, type OwnPreset } from "../lib/class-course";
  import type { ClassWithProgress } from "../lib/class-validate";

  /**
   * One class's course (ClassProgress and the class cards on /teach): the
   * course it works through (abcStepByStep, an instrument course, or the
   * teacher's own), its checklist with the date each step was passed, and the
   * next step to practise. Customize hides, reorders and adds steps (the
   * teacher's own presets, or UIL and NYSSMA levels) for that class alone.
   * Ticks are keyed by preset, so changing the list never loses what a class
   * has passed.
   */
  export let c: ClassWithProgress;
  export let own: OwnPreset[] = [];
  /** Runs a change and reports a failure (the parent shows it). */
  export let run: (fn: () => Promise<unknown>, what: string) => Promise<void>;

  let editing = false;
  let adding = "";

  $: items = classItems(c, own);
  $: done = items.filter((it) => c.passed[it.key]).length;
  $: next = nextItem(items, c.passed);
  $: keys = listOps.start(c);

  const toggle = (key: string, now: boolean) => run(() => setPassed(c.id, key, !now), "save that");
  const changeCourse = (course: string) => {
    if (c.courseSteps && !confirm(`Switch ${c.name} to ${courseName(course)}? Your changes to its list of steps start over; ticks are kept.`)) return;
    return run(() => setCourse(c.id, course || null), "change the course");
  };
  const saveList = (list: string[]) => run(() => setCourseSteps(c.id, list), "save the list");
  const dateOf = (ms: number | undefined) =>
    ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

  /** What "Add a step" offers: steps of its course it hides, then the teacher's presets, then levels. */
  function addable() {
    const shown = new Set(listOps.start(c));
    return [
      { group: "Hidden steps of this course", items: hiddenItems(c) },
      { group: "My presets", items: own.map((p) => itemForKey(`saved:${p.id}`, own)!).filter((i) => i && !shown.has(i.key)) },
      { group: "UIL and NYSSMA levels", items: LEVEL_ITEMS.filter((i) => !shown.has(i.key)) },
    ].filter((g) => g.items.length);
  }

  const band = TRACKS.filter((t) => t.family === "band");
  const strings = TRACKS.filter((t) => t.family === "strings");
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-sm text-sr-muted">Course</span>
    <select class="course-select" value={c.course ?? ""} on:change={(e) => changeCourse(e.currentTarget.value)} aria-label="Course for {c.name}">
      {#if !c.course}<option value="">Choose a course…</option>{/if}
      <option value={STEP_BY_STEP}>abcStepByStep</option>
      <optgroup label="Beginning band">{#each band as t}<option value={t.id}>{t.name}</option>{/each}</optgroup>
      <optgroup label="Beginning orchestra">{#each strings as t}<option value={t.id}>{t.name}</option>{/each}</optgroup>
      <option value={OWN_COURSE}>My own course</option>
    </select>
  </div>

  {#if c.course}
    <!-- Where they are: how far, and the next step to practise. -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex-1 min-w-[10rem]">
        <div class="h-2 rounded bg-sr-track overflow-hidden" aria-hidden="true">
          <div class="h-full bg-sr-action" style="width: {items.length ? (100 * done) / items.length : 0}%"></div>
        </div>
        <p class="mt-1 text-xs text-sr-muted tabular-nums">{done} of {items.length} steps passed · {courseName(c.course)}{c.courseSteps ? " (customized)" : ""}</p>
      </div>
      {#if next}
        <a class="sr-btn text-sm flex items-center gap-1.5" href={next.href}><Play size={14} aria-hidden="true" />Next: {next.label}</a>
      {:else if items.length}
        <span class="text-sm font-bold text-sr-mint-ink bg-sr-mint rounded-full px-3 py-1.5">Course complete</span>
      {/if}
      <button class="sr-tok text-sm" aria-pressed={editing} on:click={() => (editing = !editing)}>{editing ? "Done" : "Customize"}</button>
    </div>

    {#if items.length}
      <ol class="checklist">
        {#each items as it, k (it.key)}
          <li class="flex items-center gap-2 py-1.5 border-b border-sr-hairline/60 last:border-0">
            <input
              type="checkbox"
              class="sr-check"
              checked={!!c.passed[it.key]}
              on:change={() => toggle(it.key, !!c.passed[it.key])}
              aria-label="{c.name} passed {it.label}"
            />
            <a class="min-w-0 flex-1 group" href={it.href}>
              <span class="block text-sm text-sr-ink truncate group-hover:underline {c.passed[it.key] ? 'opacity-70' : ''}">{it.label}</span>
              {#if it.detail}<span class="block text-xs text-sr-muted truncate">{it.detail}</span>{/if}
            </a>
            {#if c.passed[it.key]}<span class="text-xs text-sr-faint whitespace-nowrap"><Check size={12} class="inline" /> {dateOf(c.passed[it.key])}</span>{/if}
            {#if editing}
              <button class="icon" disabled={k === 0} on:click={() => saveList(listOps.move(keys, it.key, -1))} aria-label="Move {it.label} earlier"><ArrowUp size={14} /></button>
              <button class="icon" disabled={k === items.length - 1} on:click={() => saveList(listOps.move(keys, it.key, 1))} aria-label="Move {it.label} later"><ArrowDown size={14} /></button>
              <button class="icon" on:click={() => saveList(listOps.hide(keys, it.key))} aria-label="Hide {it.label} from {c.name}'s course" title="Hide from this class"><EyeOff size={14} /></button>
            {/if}
          </li>
        {/each}
      </ol>
      <p class="text-xs text-sr-muted flex items-center gap-1"><Check size={12} /> Ticks save as you make them. On the practice pages, pick the class beside the preset and use <strong>Mark passed</strong>.</p>
    {:else}
      <p class="text-sm text-sr-muted">
        {c.course === OWN_COURSE ? "No steps yet. Press Customize and add your own presets, or UIL and NYSSMA levels, in the order you teach them." : "This course has no steps."}
      </p>
    {/if}

    {#if editing}
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <select class="course-select" bind:value={adding} aria-label="A step to add to {c.name}'s course">
          <option value="">Add a step…</option>
          {#each addable() as g}
            <optgroup label={g.group}>{#each g.items as it}<option value={it.key}>{it.label}</option>{/each}</optgroup>
          {/each}
        </select>
        <button class="sr-tok text-sm" disabled={!adding} on:click={() => { const k = adding; adding = ""; if (k) saveList(listOps.add(keys, k, null)); }}>Add at the end</button>
        {#if c.courseSteps && c.course !== OWN_COURSE}
          <button class="sr-link text-sm ml-auto" on:click={() => run(() => setCourseSteps(c.id, null), "reset the list")}>Back to the course as written</button>
        {/if}
      </div>
      <p class="text-xs text-sr-muted">Changes are for {c.name} only. Ticks stay with each step, wherever it moves.</p>
    {/if}
  {:else}
    <p class="text-sm text-sr-muted">Choose a course to see {c.name}'s checklist and next step.</p>
  {/if}
</div>

<style>
  .course-select {
    border-radius: 999px;
    background: var(--sr-track);
    color: var(--sr-ink);
    font-size: 14px;
    font-weight: 700;
    padding: 0.4rem 2rem 0.4rem 0.9rem;
    max-width: 100%;
  }
  .icon {
    padding: 0.35rem;
    border-radius: 999px;
    color: var(--sr-faint);
  }
  .icon:hover { color: var(--sr-ink-2); background: var(--sr-track); }
  .icon:disabled { opacity: 0.3; }
  .checklist { max-height: 26rem; overflow-y: auto; padding-right: 0.25rem; }
</style>
