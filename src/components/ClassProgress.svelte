<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowUp, ArrowDown, Pencil, X, Check, EyeOff, Play } from "lucide-svelte";
  import {
    classes, classesAvailable, loadClasses, createClass, renameClass, moveClass, deleteClass, setPassed, setCourse, setCourseSteps,
  } from "../lib/classes";
  import { UNISON_PRESET_STORE, type SavedPreset } from "../lib/preset-storage";
  import { STEP_BY_STEP } from "../lib/curriculum/catalogue";
  import { TRACKS } from "../lib/curriculum/tracks";
  import {
    OWN_COURSE, LEVEL_ITEMS, classItems, courseName, hiddenItems, itemForKey, listOps, nextItem, type OwnPreset,
  } from "../lib/class-course";
  import type { ClassWithProgress } from "../lib/class-validate";

  /**
   * Classes on the account page, one card each: the course the class works
   * through (abcStepByStep, an instrument course, or the teacher's own), its
   * checklist with the date each step was passed, and the next step to
   * practise. Customize hides, reorders and adds steps (the teacher's own
   * presets, or UIL and NYSSMA levels) for that class alone. Ticks are keyed
   * by preset, so changing the list never loses what a class has passed.
   */
  let problem = "";
  let newName = "";
  let newCourse: string = STEP_BY_STEP;
  let renamingId: string | null = null;
  let renameValue = "";
  let own: OwnPreset[] = [];
  let loaded = false;
  /** The class whose checklist is being customized. */
  let editing: string | null = null;
  /** What "Add a step" will put in, per class. */
  let adding: Record<string, string> = {};

  const message = (e: unknown) => (e instanceof Error ? e.message : "unknown error");

  onMount(async () => {
    try {
      await loadClasses();
      const [choral, unison] = await Promise.all(
        ["abcsr_presets", UNISON_PRESET_STORE].map((store) =>
          fetch(`/api/presets?store=${store}`).then((r) => (r.ok ? r.json() : [])),
        ),
      );
      own = [
        ...choral.map((p: SavedPreset<unknown>) => ({ id: p.id, name: p.name, page: "choral" as const })),
        ...unison.map((p: SavedPreset<unknown>) => ({ id: p.id, name: p.name, page: "unison" as const })),
      ];
    } catch (e) {
      problem = "Could not load your classes: " + message(e);
    }
    loaded = true;
  });

  async function run(fn: () => Promise<unknown>, what: string) {
    try {
      await fn();
      problem = "";
    } catch (e) {
      problem = `Could not ${what}: ${message(e)}`;
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    await run(() => createClass(name, newCourse || null), "add the class");
    newName = "";
  }
  async function finishRename() {
    const id = renamingId;
    const name = renameValue.trim();
    renamingId = null;
    const current = $classes.find((c) => c.id === id);
    if (!id || !name || current?.name === name) return;
    await run(() => renameClass(id, name), "rename the class");
  }
  async function remove(id: string, name: string) {
    if (!confirm(`Delete the class "${name}" and everything it has passed?`)) return;
    await run(() => deleteClass(id), "delete the class");
  }
  const toggle = (classId: string, key: string, now: boolean) => run(() => setPassed(classId, key, !now), "save that");
  const changeCourse = (c: ClassWithProgress, course: string) => {
    if (c.courseSteps && !confirm(`Switch ${c.name} to ${courseName(course)}? Your changes to its list of steps start over; ticks are kept.`)) return;
    return run(() => setCourse(c.id, course || null), "change the course");
  };
  const saveList = (c: ClassWithProgress, keys: string[]) => run(() => setCourseSteps(c.id, keys), "save the list");

  const dateOf = (ms: number | undefined) =>
    ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

  /** What "Add a step" offers a class: steps of its course it hides, then the teacher's presets, then levels. */
  function addable(c: ClassWithProgress) {
    const shown = new Set(listOps.start(c));
    return [
      { group: "Hidden steps of this course", items: hiddenItems(c) },
      { group: "My presets", items: own.map((p) => itemForKey(`saved:${p.id}`, own)!).filter((i) => !shown.has(i.key)) },
      { group: "UIL and NYSSMA levels", items: LEVEL_ITEMS.filter((i) => !shown.has(i.key)) },
    ].filter((g) => g.items.length);
  }

  const band = TRACKS.filter((t) => t.family === "band");
  const strings = TRACKS.filter((t) => t.family === "strings");
</script>

<section class="w-full max-w-5xl bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-5">
  <div class="flex flex-col gap-1">
    <h2 class="text-lg font-semibold text-sr-ink">Classes</h2>
    <p class="text-sm text-sr-muted">
      Give each class a course to work through and tick each step when the class sings it well at sight.
      On the practice pages, pick the class beside the preset and use <strong>Mark passed</strong>.
    </p>
  </div>

  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

  {#if !loaded}
    <p class="text-sm text-sr-muted">Loading…</p>
  {:else if !$classesAvailable}
    <p class="text-sm text-sr-muted">Sign in to keep track of classes.</p>
  {:else}
    <form class="flex flex-wrap gap-2 items-center" on:submit|preventDefault={add}>
      <input
        class="flex-1 min-w-[12rem] max-w-xs border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sr-action"
        placeholder="New class, e.g. Varsity Treble"
        aria-label="New class name"
        bind:value={newName}
      />
      <select class="course-select" bind:value={newCourse} aria-label="Course for the new class">
        <option value={STEP_BY_STEP}>abcStepByStep</option>
        <optgroup label="Beginning band">{#each band as t}<option value={t.id}>{t.name}</option>{/each}</optgroup>
        <optgroup label="Beginning orchestra">{#each strings as t}<option value={t.id}>{t.name}</option>{/each}</optgroup>
        <option value={OWN_COURSE}>My own course (built from my presets)</option>
      </select>
      <button class="sr-btn text-sm" type="submit" disabled={!newName.trim()}>Add class</button>
    </form>

    <ul class="flex flex-col gap-4">
      {#each $classes as c, i (c.id)}
        {@const items = classItems(c, own)}
        {@const done = items.filter((it) => c.passed[it.key]).length}
        {@const next = nextItem(items, c.passed)}
        {@const keys = listOps.start(c)}
        <li class="class-card">
          <!-- Name, course and order -->
          <div class="flex flex-wrap items-center gap-2">
            {#if renamingId === c.id}
              <input
                class="flex-1 border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sr-action"
                bind:value={renameValue}
                aria-label="New name for {c.name}"
                on:keydown={(e) => { if (e.key === "Enter") finishRename(); if (e.key === "Escape") renamingId = null; }}
                on:blur={finishRename}
                autofocus
              />
            {:else}
              <h3 class="flex-1 min-w-0 text-base font-bold text-sr-ink truncate">{c.name}</h3>
            {/if}
            <select class="course-select" value={c.course ?? ""} on:change={(e) => changeCourse(c, e.currentTarget.value)} aria-label="Course for {c.name}">
              {#if !c.course}<option value="">Choose a course…</option>{/if}
              <option value={STEP_BY_STEP}>abcStepByStep</option>
              <optgroup label="Beginning band">{#each band as t}<option value={t.id}>{t.name}</option>{/each}</optgroup>
              <optgroup label="Beginning orchestra">{#each strings as t}<option value={t.id}>{t.name}</option>{/each}</optgroup>
              <option value={OWN_COURSE}>My own course</option>
            </select>
            <button class="icon" disabled={i === 0} on:click={() => run(() => moveClass(c.id, -1), "move the class")} aria-label="Move {c.name} up"><ArrowUp size={14} /></button>
            <button class="icon" disabled={i === $classes.length - 1} on:click={() => run(() => moveClass(c.id, 1), "move the class")} aria-label="Move {c.name} down"><ArrowDown size={14} /></button>
            <button class="icon" on:click={() => { renamingId = c.id; renameValue = c.name; }} aria-label="Rename {c.name}"><Pencil size={13} /></button>
            <button class="icon hover:text-sr-danger" on:click={() => remove(c.id, c.name)} aria-label="Delete {c.name}"><X size={14} /></button>
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
              <button class="sr-tok text-sm" aria-pressed={editing === c.id} on:click={() => (editing = editing === c.id ? null : c.id)}>
                {editing === c.id ? "Done" : "Customize"}
              </button>
            </div>

            <!-- The checklist -->
            {#if items.length}
              <ol class="checklist">
                {#each items as it, k (it.key)}
                  <li class="flex items-center gap-2 py-1.5 border-b border-sr-hairline/60 last:border-0">
                    <input
                      type="checkbox"
                      class="sr-check"
                      checked={!!c.passed[it.key]}
                      on:change={() => toggle(c.id, it.key, !!c.passed[it.key])}
                      aria-label="{c.name} passed {it.label}"
                    />
                    <a class="min-w-0 flex-1 group" href={it.href}>
                      <span class="block text-sm text-sr-ink truncate group-hover:underline {c.passed[it.key] ? 'opacity-70' : ''}">{it.label}</span>
                      {#if it.detail}<span class="block text-xs text-sr-muted truncate">{it.detail}</span>{/if}
                    </a>
                    {#if c.passed[it.key]}<span class="text-xs text-sr-faint whitespace-nowrap"><Check size={12} class="inline" /> {dateOf(c.passed[it.key])}</span>{/if}
                    {#if editing === c.id}
                      <button class="icon" disabled={k === 0} on:click={() => saveList(c, listOps.move(keys, it.key, -1))} aria-label="Move {it.label} earlier"><ArrowUp size={14} /></button>
                      <button class="icon" disabled={k === items.length - 1} on:click={() => saveList(c, listOps.move(keys, it.key, 1))} aria-label="Move {it.label} later"><ArrowDown size={14} /></button>
                      <button class="icon" on:click={() => saveList(c, listOps.hide(keys, it.key))} aria-label="Hide {it.label} from {c.name}'s course" title="Hide from this class"><EyeOff size={14} /></button>
                    {/if}
                  </li>
                {/each}
              </ol>
            {:else}
              <p class="text-sm text-sr-muted">
                {c.course === OWN_COURSE ? "No steps yet. Press Customize and add your own presets, or UIL and NYSSMA levels, in the order you teach them." : "This course has no steps."}
              </p>
            {/if}

            {#if editing === c.id}
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <select class="course-select" value={adding[c.id] ?? ""} on:change={(e) => (adding = { ...adding, [c.id]: e.currentTarget.value })} aria-label="A step to add to {c.name}'s course">
                  <option value="">Add a step…</option>
                  {#each addable(c) as g}
                    <optgroup label={g.group}>{#each g.items as it}<option value={it.key}>{it.label}</option>{/each}</optgroup>
                  {/each}
                </select>
                <button
                  class="sr-tok text-sm"
                  disabled={!adding[c.id]}
                  on:click={() => { const k = adding[c.id]; adding = { ...adding, [c.id]: "" }; if (k) saveList(c, listOps.add(keys, k, null)); }}
                >Add at the end</button>
                {#if c.courseSteps && c.course !== OWN_COURSE}
                  <button class="sr-link text-sm ml-auto" on:click={() => run(() => setCourseSteps(c.id, null), "reset the list")}>Back to the course as written</button>
                {/if}
              </div>
              <p class="text-xs text-sr-muted">Changes are for {c.name} only. Ticks stay with each step, wherever it moves.</p>
            {/if}
          {:else}
            <p class="text-sm text-sr-muted">Choose a course above to see {c.name}'s checklist and next step.</p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if $classes.length}
      <p class="text-xs text-sr-muted flex items-center gap-1"><Check size={12} /> Ticks save as you make them.</p>
    {/if}
  {/if}
</section>

<style>
  .class-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.1rem;
    border-radius: 18px;
    background: var(--sr-raise);
    border: 1px solid var(--sr-hairline);
  }
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
