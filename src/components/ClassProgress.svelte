<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowUp, ArrowDown, Pencil, X } from "lucide-svelte";
  import ClassCourse from "./ClassCourse.svelte";
  import {
    classes, classesAvailable, loadClasses, createClass, renameClass, moveClass, deleteClass,
  } from "../lib/classes";
  import { UNISON_PRESET_STORE, type SavedPreset } from "../lib/preset-storage";
  import { STEP_BY_STEP } from "../lib/curriculum/catalogue";
  import { TRACKS } from "../lib/curriculum/tracks";
  import { OWN_COURSE, type OwnPreset } from "../lib/class-course";

  /**
   * Classes on /teach for a teacher without the Educator plan (an educator has
   * the class cards of EducatorStudents), one card each: the course the class works
   * through (abcStepByStep, an instrument course, or the teacher's own), its
   * checklist with the date each step was passed, and the next step to
   * practise. Customize hides, reorders and adds steps (the teacher's own
   * presets, or UIL and NYSSMA levels) for that class alone. Ticks are keyed
   * by preset, so changing the list never loses what a class has passed.
   */
  /** An Educator account (its students join with a code); anyone else is told how to get there. */
  export let educator = false;
  let problem = "";
  let newName = "";
  let newCourse: string = STEP_BY_STEP;
  let renamingId: string | null = null;
  let renameValue = "";
  let own: OwnPreset[] = [];
  let loaded = false;

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
    {#if !educator}
      <p class="educator-note text-sm">
        Want your students to practice and grade themselves on their own devices? Founding teachers get the Educator plan free
        through May 2027, with a join code for each class.
        <a class="underline font-semibold" href="/founders">Join as a founding teacher</a>
      </p>
    {/if}
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
            <button class="icon" disabled={i === 0} on:click={() => run(() => moveClass(c.id, -1), "move the class")} aria-label="Move {c.name} up"><ArrowUp size={14} /></button>
            <button class="icon" disabled={i === $classes.length - 1} on:click={() => run(() => moveClass(c.id, 1), "move the class")} aria-label="Move {c.name} down"><ArrowDown size={14} /></button>
            <button class="icon" on:click={() => { renamingId = c.id; renameValue = c.name; }} aria-label="Rename {c.name}"><Pencil size={13} /></button>
            <button class="icon hover:text-sr-danger" on:click={() => remove(c.id, c.name)} aria-label="Delete {c.name}"><X size={14} /></button>
          </div>

          <ClassCourse {c} {own} {run} />
        </li>
      {/each}
    </ul>
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
  .educator-note {
    padding: 0.75rem 1rem;
    border-radius: 18px;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
  }
</style>
