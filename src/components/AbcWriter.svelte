<script lang="ts">
  /**
   * Write ABC by hand, see the score beside it, save it into the repo.
   *
   * For transcribing real sight-reading examples off the page so they can be
   * read back as a corpus - the generator has nothing to measure itself against
   * otherwise.
   *
   * The live preview is abcjs's own `Editor`, not a hand-rolled
   * debounce-and-rerender: it takes a textarea, draws into a paper div, and
   * writes syntax warnings into a third element, which is the entire feature.
   * Reimplementing that would only be reimplementing it worse.
   */
  import { onMount, onDestroy } from "svelte";
  import { Save, FileText, Plus } from "lucide-svelte";
  import {
    abcProblems,
    applyMeta,
    blankScore,
    VOICINGS,
    type AbcProblem,
    type ScoreMeta,
  } from "../lib/abc-score-file";

  type SavedScore = { slug: string; meta: ScoreMeta; abc: string };

  const KEYS = ["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab",
                "Am", "Em", "Bm", "Dm", "Gm", "Cm"];
  const METERS = ["4/4", "3/4", "2/4", "6/8", "2/2"];
  const LEVELS = ["", "1", "2", "3", "4", "5"];

  let title = "";
  let level = "";
  let voicing = "SATB";
  let key = "C";
  let meter = "4/4";
  let source = "";

  let abc = "";
  let saved: SavedScore[] = [];
  let status: { kind: "ok" | "error"; text: string } | null = null;
  let saving = false;
  /** Which saved score is in the editor, so the list can show it as current. */
  let loadedSlug: string | null = null;

  const TEXTAREA_ID = "abc-source";

  let editor: any = null;
  let textarea: HTMLTextAreaElement;
  let paperEl: HTMLDivElement;
  let warningsEl: HTMLDivElement;
  /** False on the deployed site, where there is no writable filesystem. */
  let writable = true;
  let notWritableReason = "";
  /** Things wrong with the ABC that abcjs will not tell you about. */
  let problems: AbcProblem[] = [];
  /** A blank line would leave half the transcription out of the saved file. */
  $: blocking = problems.filter((p) => p.kind !== "no-title");

  /**
   * Put text into the editor.
   *
   * The textarea is not `bind:value`. abcjs's Editor owns that element and reads
   * it on every keystroke, so a Svelte binding writing to it would be a second
   * writer racing the first. Everything goes through here instead, and
   * `fireChanged()` is what tells the Editor to re-read and redraw.
   */
  function setAbc(next: string) {
    abc = next;
    problems = abcProblems(next);
    // `setString` is on the EditArea, not the Editor, and it is the supported
    // way in: it resets the dirty baseline and schedules a redraw. Before the
    // Editor exists, writing the textarea directly is all there is to do.
    if (editor?.editarea) editor.editarea.setString(next);
    else if (textarea) textarea.value = next;
  }

  /** The form's own view of the score, for writing into the text. */
  function formMeta(): ScoreMeta {
    return { title: title || "Untitled", level, voicing, key, meter, source };
  }

  /**
   * A change in the form is a change to the text.
   *
   * The two must not each keep their own idea of the title: the first version
   * of this saved a file named from the form and titled from the template,
   * because only the text was ever written to disk. The text is the thing that
   * gets saved, so the text is what the form edits.
   *
   * Guarded on `editor` so it does nothing until the editor exists, and on an
   * actual difference so typing in the textarea is never fought over.
   */
  function syncFormIntoText() {
    if (!editor?.editarea) return;
    const current = editor.editarea.getString();
    const next = applyMeta(current, formMeta());
    if (next !== current) setAbc(next);
  }

  // Svelte 4: re-runs whenever any of these change.
  $: title, level, voicing, key, meter, source, syncFormIntoText();

  function startBlank() {
    loadedSlug = null;
    status = null;
    setAbc(blankScore(formMeta()));
  }

  function load(score: SavedScore) {
    loadedSlug = score.slug;
    status = null;
    title = score.meta.title ?? "";
    level = score.meta.level ?? "";
    voicing = score.meta.voicing ?? "SATB";
    key = score.meta.key ?? "C";
    meter = score.meta.meter ?? "4/4";
    source = score.meta.source ?? "";
    setAbc(score.abc);
  }

  async function refresh() {
    try {
      const res = await fetch("/api/scores");
      const body = await res.json();
      if (body.success) {
        saved = body.data;
        writable = body.writable !== false;
        notWritableReason = body.reason ?? "";
      } else {
        status = { kind: "error", text: body.error };
      }
    } catch (err) {
      status = { kind: "error", text: "Could not reach the server." };
    }
  }

  async function save() {
    if (saving) return;
    saving = true;
    status = null;
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Applied once more rather than trusted: the reactive sync runs on form
        // changes, and this is the last chance before it goes to disk.
        body: JSON.stringify({ title, abc: applyMeta(abc, formMeta()) }),
      });
      const body = await res.json();
      if (body.success) {
        saved = body.data.scores;
        loadedSlug = body.data.slug;
        status = { kind: "ok", text: `Saved as scores/${body.data.slug}.abc` };
      } else {
        status = { kind: "error", text: body.error };
      }
    } catch (err) {
      status = { kind: "error", text: "Could not reach the server." };
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    // Dynamic, because the Editor constructor renders synchronously and so
    // touches `document` before it returns.
    const mod: any = await import("abcjs");
    // A second Editor on the same textarea would reassign its handlers and
    // leave the first one's debounce timer running against a dead div. This
    // happens on HMR during development, not in normal use.
    if (editor) return;
    // The textarea has to hold the text before the Editor reads it, and the
    // paper and warnings elements have to exist: given neither, the Editor
    // inserts divs of its own into a parent Svelte believes it owns.
    textarea.value = blankScore({ title: "Untitled", voicing, key, meter });
    abc = textarea.value;
    problems = abcProblems(abc);
    // The textarea has to be named by ID, not handed over as an element.
    // The types say `string | HTMLElement` for this argument, but the
    // constructor only wraps a STRING in an EditArea - given an element it
    // assumes the element already implements that interface and immediately
    // calls addSelectionListener on it, which a textarea does not have.
    // paper_id and warnings_id genuinely do take either.
    editor = new mod.Editor(TEXTAREA_ID, {
      paper_id: paperEl,
      warnings_id: warningsEl,
      generate_warnings: true,
      abcjsParams: {
        add_classes: true,
        responsive: "resize",
        staffwidth: 700,
        wrap: { minSpacing: 1.2, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
      },
      // The Editor reads the textarea itself; this only mirrors it back into
      // Svelte so the save button has something to send, and re-runs the checks
      // abcjs does not make.
      onchange: (ed: any) => {
        abc = ed?.editarea?.getString() ?? textarea?.value ?? abc;
        problems = abcProblems(abc);
      },
    });
    await refresh();
  });

  onDestroy(() => {
    // There is no `destroy()` on the Editor, and its EditArea installs its
    // handlers by direct property assignment rather than addEventListener - so
    // they have to be taken off the same way. Left alone, the 300ms debounce
    // can fire after unmount and render into a detached div.
    if (editor) {
      clearTimeout(editor.timerId);
      for (const h of ["onkeyup", "onmousedown", "onmouseup", "onmousemove", "onchange"]) {
        (textarea as any)[h] = null;
      }
    }
    editor = null;
  });
</script>

<div class="w-full max-w-[1600px] mx-auto px-2 md:px-4 space-y-4">
  <!-- Details -->
  <div class="bg-white rounded-lg shadow-md p-4 space-y-3">
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <label class="space-y-1 col-span-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Title</span>
        <input
          bind:value={title}
          placeholder="Forgotten"
          class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </label>
      <label class="space-y-1">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">UIL level</span>
        <select bind:value={level} class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
          {#each LEVELS as l}<option value={l}>{l || "-"}</option>{/each}
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Voicing</span>
        <select bind:value={voicing} class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
          {#each VOICINGS as v}<option value={v}>{v}</option>{/each}
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Key</span>
        <select bind:value={key} class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
          {#each KEYS as k}<option value={k}>{k}</option>{/each}
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Meter</span>
        <select bind:value={meter} class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
          {#each METERS as m}<option value={m}>{m}</option>{/each}
        </select>
      </label>
      <label class="space-y-1 col-span-2 sm:col-span-3 lg:col-span-4">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Source</span>
        <input
          bind:value={source}
          placeholder="Where you read it - year, level, publisher"
          class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </label>
      <div class="flex items-end gap-2 col-span-2">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-slate-100 hover:bg-slate-200"
          on:click={startBlank}
          title="Replace the editor with an empty score using the details above"
        ><Plus size={15} /> Blank score</button>
        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
          on:click={save}
          disabled={saving || !writable || blocking.length > 0}
          title={!writable
            ? notWritableReason
            : blocking.length > 0
              ? blocking[0].message
              : "Write this score into the project"}
        ><Save size={15} /> {saving ? "Saving..." : "Save"}</button>
      </div>
    </div>

    <p class="text-xs text-slate-400">
      The details are written into the file's own ABC header, so each score says
      what it is. Saving writes <code>scores/&lt;title&gt;.abc</code> in the project -
      local dev only, since the deployed site has a read-only filesystem.
    </p>

    {#if !writable}
      <p class="text-sm rounded px-3 py-2 bg-slate-100 text-slate-600" role="status">
        {notWritableReason} Run <code>bun run dev</code> locally to save.
      </p>
    {/if}

    {#if status}
      <p
        class="text-sm rounded px-3 py-2 {status.kind === 'ok'
          ? 'bg-green-50 text-green-800'
          : 'bg-amber-50 text-amber-800'}"
        role="status"
      >{status.text}</p>
    {/if}
  </div>

  <!-- Editor beside score -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
    <div class="bg-white rounded-lg shadow-md p-3 space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">ABC</p>
      <textarea
        id={TEXTAREA_ID}
        bind:this={textarea}
        spellcheck="false"
        class="w-full h-[60vh] font-mono text-sm border border-slate-200 rounded p-2 resize-y"
      ></textarea>
      <!-- abcjs writes parse warnings here as you type. -->
      <div bind:this={warningsEl} class="text-xs text-amber-700 min-h-[1.25rem]"></div>
      {#each problems as problem}
        <p class="text-xs rounded px-2 py-1 bg-amber-50 text-amber-800">{problem.message}</p>
      {/each}
    </div>

    <div class="bg-white rounded-lg shadow-md p-3 space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Score</p>
      <div bind:this={paperEl} class="w-full"></div>
    </div>
  </div>

  <!-- What you have written already -->
  <div class="bg-white rounded-lg shadow-md p-4 space-y-2">
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Saved scores</p>
    {#if saved.length === 0}
      <p class="text-sm text-slate-400">Nothing saved yet.</p>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each saved as score}
          <button
            class="text-left rounded px-3 py-2 text-sm border {loadedSlug === score.slug
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:bg-slate-50'}"
            on:click={() => load(score)}
          >
            <span class="flex items-center gap-1.5 font-medium text-slate-700">
              <FileText size={14} />{score.meta.title || score.slug}
            </span>
            <span class="text-xs text-slate-400">
              {[score.meta.level ? `Level ${score.meta.level}` : null,
                score.meta.voicing,
                score.meta.key,
                score.meta.meter].filter(Boolean).join(" · ")}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
