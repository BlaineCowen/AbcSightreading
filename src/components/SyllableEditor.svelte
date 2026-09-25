<script lang="ts">
  import { onMount } from "svelte";
  import {
    checkCustomSyllables,
    customSyllableSystem,
    syllableTemplates,
    NAMED_FIGURES,
    type CustomSyllables,
    type NamedFigure,
  } from "../resources/rhythm-syllables";
  import { syllablesForFigure } from "../lib/generateUnison";
  import { selectableRhythms } from "../lib/selectable-rhythms";
  import { rhythmLabel } from "../lib/rhythm-labels";
  import { mySyllables, syllablesAvailable, loadMySyllables, saveMySyllables } from "../lib/syllable-prefs";

  /**
   * A teacher's own rhythm syllables, on the account page. Start from a
   * template, change the words, and every figure's syllables show beside it as
   * the exercises will print them - worked out by the same code, so the
   * preview cannot drift from the page.
   */

  const svgs = import.meta.glob("../assets/svgs/*.svg", { as: "raw", eager: true }) as Record<string, string>;
  const svgFor = (name: string) => svgs[`../assets/svgs/${name}.svg`] ?? "";

  const clone = (c: CustomSyllables): CustomSyllables => JSON.parse(JSON.stringify(c));
  /** One spelling of a set, whatever order its fields came back from the server in. */
  const canonical = (c: unknown) => {
    const checked = checkCustomSyllables(c);
    return checked.ok ? JSON.stringify(checked.value) : JSON.stringify(c);
  };

  let draft: CustomSyllables = clone(syllableTemplates[0].syllables);
  let savedJson = "";
  let loaded = false;
  let problem = "";
  let notice = "";
  let busy = false;

  const NAMED_ROWS: [NamedFigure, string][] = [
    ["dotQuarterEighth", "Dotted quarter, eighth"],
    ["dotHalfQuarter", "Dotted half, quarter"],
    ["eighthQuarterEighth", "Syncopation: eighth, quarter, eighth"],
    ["eighthDotQuarter", "Eighth, dotted quarter"],
    ["dotEighthSixteenth", "Dotted eighth, sixteenth"],
  ];

  onMount(async () => {
    try {
      await loadMySyllables();
      if ($mySyllables) draft = clone($mySyllables);
      savedJson = $mySyllables ? canonical($mySyllables) : "";
    } catch (e) {
      problem = "Could not load your syllables: " + (e instanceof Error ? e.message : "unknown error");
    }
    loaded = true;
  });

  $: checked = checkCustomSyllables(draft);
  $: system = checked.ok ? customSyllableSystem(checked.value) : null;
  $: preview = system
    ? selectableRhythms.map((r) => ({ name: r.name, label: rhythmLabel(r.name), syllables: syllablesForFigure(r, system!) }))
    : [];
  $: dirty = canonical(draft) !== (savedJson || canonical(syllableTemplates[0].syllables));
  $: hasSaved = !!$mySyllables;

  function startFrom(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    (e.currentTarget as HTMLSelectElement).value = "";
    const t = syllableTemplates.find((t) => t.id === id);
    if (!t) return;
    if (dirty && !confirm(`Replace what you have with ${t.label}?`)) return;
    draft = clone(t.syllables);
    notice = "";
  }

  async function save() {
    if (!checked.ok) return;
    busy = true;
    problem = notice = "";
    try {
      const saved = await saveMySyllables(checked.value);
      savedJson = canonical(saved);
      notice = "Saved. Choose “Mine” under Rhythm Syllables on the Unison page.";
    } catch (e) {
      problem = "Could not save: " + (e instanceof Error ? e.message : "unknown error");
    }
    busy = false;
  }

  async function clear() {
    if (!confirm("Stop using your own syllables? The Unison page goes back to Kodály and Counting.")) return;
    busy = true;
    problem = notice = "";
    try {
      await saveMySyllables(null);
      savedJson = "";
      draft = clone(syllableTemplates[0].syllables);
      notice = "Removed.";
    } catch (e) {
      problem = "Could not remove them: " + (e instanceof Error ? e.message : "unknown error");
    }
    busy = false;
  }

  const input =
    "w-20 border border-sr-hairline bg-sr-raise text-sr-ink rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sr-action";
</script>

<section id="syllables" class="w-full max-w-5xl bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-5 scroll-mt-20">
  <div class="flex flex-col gap-1">
    <h2 class="text-lg font-semibold text-sr-ink">Rhythm syllables</h2>
    <p class="text-sm text-sr-muted">
      Use the words your choirs already say. Your set appears as <strong>Mine</strong>
      beside Kodály and Counting on the Unison page.
    </p>
  </div>

  {#if !loaded}
    <p class="text-sm text-sr-muted">Loading…</p>
  {:else if !$syllablesAvailable}
    <p class="text-sm text-sr-muted">Sign in to keep your own syllables.</p>
  {:else}
    <label class="flex flex-wrap items-center gap-2 text-sm text-sr-ink-2">
      Start from
      <select class="bg-sr-raise border border-sr-hairline rounded-md px-2 py-1 text-sm" on:change={startFrom}>
        <option value="">Choose a template…</option>
        {#each syllableTemplates as t}
          <option value={t.id}>{t.label}</option>
        {/each}
      </select>
    </label>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- The words -->
      <div class="flex flex-col gap-4">
        <fieldset class="flex flex-col gap-1">
          <legend class="sr-label mb-1">The beat</legend>
          <label class="flex items-center gap-2 text-sm text-sr-ink-2">
            <input class={input} bind:value={draft.beat} aria-label="Quarter note" /> a quarter note
          </label>
        </fieldset>

        <fieldset class="flex flex-col gap-1">
          <legend class="sr-label mb-1">Dividing the beat</legend>
          <div class="flex flex-wrap items-center gap-1">
            {#each [0, 1, 2, 3] as i}
              <input class={input} bind:value={draft.slots[i]} aria-label="Sixteenth {i + 1} of a beat" />
            {/each}
          </div>
          <p class="text-xs text-sr-muted">
            The four sixteenths of a beat. Eighths take the first and third
            ({draft.slots[0]}-{draft.slots[2]}), and the mixed figures take theirs from here too.
          </p>
        </fieldset>

        <fieldset class="flex flex-col gap-1">
          <legend class="sr-label mb-1">Held notes</legend>
          <div class="flex flex-wrap items-center gap-1 text-sm text-sr-ink-2">
            <input class={input} bind:value={draft.holdStart} aria-label="Start of a held note" />
            then
            <input class={input} bind:value={draft.holdEach} aria-label="Each further beat of a held note" placeholder="(nothing)" />
            for each beat it is held
          </div>
          <p class="text-xs text-sr-muted">Leave the second empty if your choirs do not voice the held beats.</p>
        </fieldset>

        <fieldset class="flex flex-col gap-1">
          <legend class="sr-label mb-1">Rests</legend>
          <label class="flex items-center gap-2 text-sm text-sr-ink-2">
            <input class={input} bind:value={draft.rest} aria-label="Rest" /> any rest
          </label>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="sr-label mb-1">Figures with their own names</legend>
          {#each NAMED_ROWS as [figure, label]}
            <div class="flex flex-wrap items-center gap-2">
              <span class="rhythm-icon !w-12 !h-8 shrink-0 text-sr-ink" aria-hidden="true">{@html svgFor(figure)}</span>
              <span class="text-xs text-sr-muted w-32">{label}</span>
              {#each Array(NAMED_FIGURES[figure]) as _, i}
                <input class="{input} !w-16" bind:value={draft.named[figure][i]} aria-label="{label}, note {i + 1}" />
              {/each}
            </div>
          {/each}
        </fieldset>
      </div>

      <!-- What the exercises will print -->
      <div class="flex flex-col gap-2">
        <h3 class="sr-label">How it reads</h3>
        {#if !checked.ok}
          <p class="text-sm text-sr-danger" role="alert">{checked.error}</p>
        {:else}
          <ul class="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {#each preview as row (row.name)}
              <li class="flex items-center gap-2 bg-sr-raise border border-sr-hairline rounded px-2 py-1">
                <span class="rhythm-icon !w-12 !h-8 shrink-0 text-sr-ink" title={row.label}>{@html svgFor(row.name)}</span>
                <span class="text-sm text-sr-ink font-medium">{row.syllables.join(" ")}</span>
              </li>
            {/each}
          </ul>
          <p class="text-xs text-sr-muted">From the downbeat of a 4/4 bar. Held notes spell the beats they run through.</p>
        {/if}
      </div>
    </div>

    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
    {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}

    <div class="flex flex-wrap gap-2 items-center">
      <button class="sr-btn" on:click={save} disabled={busy || !checked.ok || (hasSaved && !dirty)}>
        {hasSaved ? "Save changes" : "Save as my syllables"}
      </button>
      {#if hasSaved}
        <button class="sr-btn-quiet text-sr-danger" on:click={clear} disabled={busy}>Stop using my own</button>
      {/if}
    </div>
  {/if}
</section>
