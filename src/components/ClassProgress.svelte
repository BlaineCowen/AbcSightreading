<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowUp, ArrowDown, Pencil, X, Check } from "lucide-svelte";
  import {
    classes, classesAvailable, loadClasses, createClass, renameClass, moveClass, deleteClass, setPassed,
  } from "../lib/classes";
  import { presetKeyOf } from "../lib/class-validate";
  import { ladder, ladderStages, stepHref } from "../lib/ladder";
  import { uilPresets } from "../lib/uil-presets";
  import { UNISON_PRESET_STORE, type SavedPreset } from "../lib/preset-storage";

  /**
   * Classes on the account page: add, rename, order and remove them, and see
   * or change what each has passed - the ladder, the UIL levels, and the
   * director's own presets - in one grid.
   */

  let problem = "";
  let newName = "";
  let renamingId: string | null = null;
  let renameValue = "";
  let saved: (SavedPreset<unknown> & { page: string })[] = [];
  let loaded = false;

  const message = (e: unknown) => (e instanceof Error ? e.message : "unknown error");

  onMount(async () => {
    try {
      await loadClasses();
      // The director's own presets, both lists, for their rows in the grid.
      const [choral, unison] = await Promise.all(
        ["abcsr_presets", UNISON_PRESET_STORE].map((store) =>
          fetch(`/api/presets?store=${store}`).then((r) => (r.ok ? r.json() : []))
        )
      );
      saved = [
        ...choral.map((p: SavedPreset<unknown>) => ({ ...p, page: "Choral" })),
        ...unison.map((p: SavedPreset<unknown>) => ({ ...p, page: "Unison" })),
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
    await run(() => createClass(name), "add the class");
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

  const toggle = (classId: string, key: string, now: boolean) =>
    run(() => setPassed(classId, key, !now), "save that");

  const dateOf = (ms: number | undefined) =>
    ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

  /** How far through the ladder a class is: steps passed, of all of them. */
  const ladderCount = (passed: Record<string, number>) =>
    ladder.filter((s) => passed[presetKeyOf.step(s.id)]).length;
</script>

<section class="w-full max-w-5xl bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-5">
  <div class="flex flex-col gap-1">
    <h2 class="text-lg font-semibold text-sr-ink">Classes</h2>
    <p class="text-sm text-sr-muted">
      Keep track of what each of your choirs can read. Tick a step when a class
      sings it well at sight; on the practice pages, pick the class beside the
      preset and use <strong>Mark passed</strong>.
    </p>
  </div>

  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

  {#if !loaded}
    <p class="text-sm text-sr-muted">Loading…</p>
  {:else if !$classesAvailable}
    <p class="text-sm text-sr-muted">Sign in to keep track of classes.</p>
  {:else}
    <!-- The class list -->
    <ul class="flex flex-col gap-1">
      {#each $classes as c, i (c.id)}
        <li class="flex items-center gap-2 bg-sr-raise border border-sr-hairline rounded-md px-3 py-2">
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
            <span class="flex-1 text-sm text-sr-ink font-medium">{c.name}</span>
            <span class="text-xs text-sr-muted tabular-nums">{ladderCount(c.passed)} of {ladder.length} steps</span>
          {/if}
          <button class="p-1 text-sr-faint hover:text-sr-ink-2 disabled:opacity-30" disabled={i === 0} on:click={() => run(() => moveClass(c.id, -1), "move the class")} aria-label="Move {c.name} up"><ArrowUp size={14} /></button>
          <button class="p-1 text-sr-faint hover:text-sr-ink-2 disabled:opacity-30" disabled={i === $classes.length - 1} on:click={() => run(() => moveClass(c.id, 1), "move the class")} aria-label="Move {c.name} down"><ArrowDown size={14} /></button>
          <button class="p-1 text-sr-faint hover:text-sr-ink-2" on:click={() => { renamingId = c.id; renameValue = c.name; }} aria-label="Rename {c.name}"><Pencil size={13} /></button>
          <button class="p-1 text-sr-faint hover:text-sr-danger" on:click={() => remove(c.id, c.name)} aria-label="Delete {c.name}"><X size={14} /></button>
        </li>
      {/each}
    </ul>
    <form class="flex gap-2" on:submit|preventDefault={add}>
      <input
        class="flex-1 max-w-xs border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sr-action"
        placeholder="New class, e.g. Varsity Treble"
        aria-label="New class name"
        bind:value={newName}
      />
      <button class="sr-btn text-sm" type="submit" disabled={!newName.trim()}>Add class</button>
    </form>

    {#if $classes.length}
      <!-- The progress grid: presets down, classes across. Scrolls sideways on
           a phone, with the preset names kept in view. -->
      <div class="overflow-x-auto border border-sr-hairline rounded-md bg-sr-raise">
        <table class="text-sm border-collapse min-w-full">
          <thead>
            <tr class="border-b border-sr-hairline">
              <th class="sticky left-0 bg-sr-raise text-left font-medium text-sr-muted px-3 py-2 min-w-[14rem]">Preset</th>
              {#each $classes as c (c.id)}
                <th class="px-2 py-2 text-xs font-medium text-sr-ink-2 text-center min-w-[6rem]">{c.name}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each ladderStages() as { stage, steps }}
              <tr><td colspan={$classes.length + 1} class="sticky left-0 bg-sr-panel px-3 py-1 text-[11px] uppercase tracking-wide text-sr-faint">{stage}</td></tr>
              {#each steps as step}
                <tr class="border-b border-sr-hairline/60">
                  <th scope="row" class="sticky left-0 bg-sr-raise text-left font-normal px-3 py-1.5">
                    <a class="text-sr-ink hover:underline" href={stepHref(step)}>{step.number}. {step.title}</a>
                    <span class="block text-xs text-sr-muted">{step.newThing}</span>
                  </th>
                  {#each $classes as c (c.id)}
                    {@const key = presetKeyOf.step(step.id)}
                    <td class="text-center px-2">
                      <label class="inline-flex flex-col items-center cursor-pointer" title={c.passed[key] ? `Passed ${dateOf(c.passed[key])}` : "Not yet"}>
                        <input type="checkbox" class="sr-check" checked={!!c.passed[key]} on:change={() => toggle(c.id, key, !!c.passed[key])} aria-label="{c.name} passed step {step.number}" />
                        {#if c.passed[key]}<span class="text-[10px] text-sr-faint">{dateOf(c.passed[key])}</span>{/if}
                      </label>
                    </td>
                  {/each}
                </tr>
              {/each}
            {/each}

            <tr><td colspan={$classes.length + 1} class="sticky left-0 bg-sr-panel px-3 py-1 text-[11px] uppercase tracking-wide text-sr-faint">UIL levels</td></tr>
            {#each Object.entries(uilPresets) as [levelKey, level]}
              <tr class="border-b border-sr-hairline/60">
                <th scope="row" class="sticky left-0 bg-sr-raise text-left font-normal px-3 py-1.5 text-sr-ink">{level.label}</th>
                {#each $classes as c (c.id)}
                  {@const key = presetKeyOf.uil(levelKey)}
                  <td class="text-center px-2">
                    <input type="checkbox" class="sr-check" checked={!!c.passed[key]} on:change={() => toggle(c.id, key, !!c.passed[key])} aria-label="{c.name} passed {level.label}" title={c.passed[key] ? `Passed ${dateOf(c.passed[key])}` : "Not yet"} />
                  </td>
                {/each}
              </tr>
            {/each}

            {#if saved.length}
              <tr><td colspan={$classes.length + 1} class="sticky left-0 bg-sr-panel px-3 py-1 text-[11px] uppercase tracking-wide text-sr-faint">My presets</td></tr>
              {#each saved as p (p.id)}
                <tr class="border-b border-sr-hairline/60">
                  <th scope="row" class="sticky left-0 bg-sr-raise text-left font-normal px-3 py-1.5 text-sr-ink">
                    {p.name} <span class="text-xs text-sr-muted">· {p.page}</span>
                  </th>
                  {#each $classes as c (c.id)}
                    {@const key = presetKeyOf.saved(p.id)}
                    <td class="text-center px-2">
                      <input type="checkbox" class="sr-check" checked={!!c.passed[key]} on:change={() => toggle(c.id, key, !!c.passed[key])} aria-label="{c.name} passed {p.name}" title={c.passed[key] ? `Passed ${dateOf(c.passed[key])}` : "Not yet"} />
                    </td>
                  {/each}
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      <p class="text-xs text-sr-muted flex items-center gap-1"><Check size={12} /> Ticks save as you make them.</p>
    {/if}
  {/if}
</section>
