<script lang="ts">
  /**
   * Write a score one part at a time, see it engraved, save it into the repo.
   *
   * For transcribing real sight-reading examples off the page so they can be
   * read back as a corpus - the generator has nothing to measure itself against
   * otherwise.
   *
   * **Why a box per part rather than one ABC document.** Multi-voice ABC is laid
   * out by line order: the lines are read as voice 1, voice 2, ... and round
   * again for the next system. Write a part across two lines while the others
   * have one, and every line after it lands on the wrong staff - the bass turns
   * up on the soprano, carrying its clef with it. Neither `[V:B]` at the start
   * of the line nor a `V:B` field line rescues it. That rule has nothing to do
   * with the music and cannot be worked out by trying things, so this page does
   * not ask anyone to obey it: each part gets a box, and `assembleScore` emits
   * one line per voice in the order the header declares them.
   *
   * The preview is a plain `renderAbc` of the assembled file rather than abcjs's
   * `Editor`, which binds to a single textarea and cannot span several.
   */
  import { onMount, onDestroy } from "svelte";
  import { Save, FileText, Plus } from "lucide-svelte";
  import {
    abcProblems,
    applyMeta,
    assembleScore,
    blankScore,
    buildHeader,
    splitScore,
    voiceIdsFromHeader,
    voicePartsFor,
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

  /** Everything up to and including `K:`. Editable, but normally left alone. */
  let header = "";
  /** The music for each voice, keyed by voice id. No `[V:x]` prefixes. */
  let voices: Record<string, string> = {};
  let showHeader = false;

  let saved: SavedScore[] = [];
  let status: { kind: "ok" | "error"; text: string } | null = null;
  let saving = false;
  let loadedSlug: string | null = null;
  let writable = true;
  let notWritableReason = "";

  let abcjsMod: any = null;
  let paperEl: HTMLDivElement;
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let warnings: string[] = [];
  let problems: AbcProblem[] = [];

  $: voiceIds = voiceIdsFromHeader(header);
  $: voiceLabel = Object.fromEntries(
    voicePartsFor(voicing).map((p) => [p.id, p.name])
  ) as Record<string, string>;
  /** An example in the part's own register - a bass line is no help in the
   *  soprano box, which is what a single shared placeholder gave. */
  $: voicePlaceholder = Object.fromEntries(
    voicePartsFor(voicing).map((p) => [
      p.id,
      p.clef === "bass" ? "C,2 D,2 E,2 F,2 | G,4 C,4 |" : "c2 d2 e2 f2 | g4 c4 |",
    ])
  ) as Record<string, string>;
  $: assembled = header ? assembleScore(header, voices, meter) : "";
  $: problems = assembled ? abcProblems(assembled) : [];
  $: blocking = problems.filter((p) => p.kind !== "no-title");

  /** Redraw whenever the assembled file changes, a beat after typing stops. */
  $: if (assembled && abcjsMod && paperEl) scheduleRender(assembled);

  function scheduleRender(abc: string) {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      try {
        // `wrap` does nothing without a `staffwidth` to wrap against - abcjs
        // has no idea how wide a system may be otherwise, and lays the whole
        // part out in a single line. Measured from the container rather than
        // fixed, the same way the choral page does it, so a narrow window gets
        // fewer bars per line instead of a shrunken score.
        const cw = paperEl.clientWidth || 900;
        const tunes = abcjsMod.renderAbc(paperEl, abc, {
          add_classes: true,
          responsive: "resize",
          staffwidth: Math.max(160, Math.min(740, cw - 30)),
          wrap: {
            minSpacing: 1.2,
            maxSpacing: 2.7,
            preferredMeasuresPerLine: cw < 480 ? 2 : 4,
          },
        });
        warnings = tunes?.[0]?.warnings ?? [];
      } catch (err) {
        // A hard parse failure leaves the last good score on screen, which is
        // more use than a blank page while you fix a typo.
        warnings = [String(err instanceof Error ? err.message : err)];
      }
    }, 300);
  }

  function formMeta(): ScoreMeta {
    return { title: title || "Untitled", level, voicing, key, meter, source };
  }

  /** A change in the form is a change to the header it generated. */
  function syncFormIntoHeader() {
    if (!header) return;
    const next = applyMeta(header, formMeta());
    if (next !== header) header = next;
  }
  $: title, level, voicing, key, meter, source, syncFormIntoHeader();

  /**
   * Rebuild the header for a new voicing, keeping any music already typed.
   *
   * Changing SATB to SAB changes which voices exist and the boxes have to
   * follow - but a part that still exists should not lose what is in it.
   */
  function rebuildForVoicing() {
    header = buildHeader(formMeta());
    const kept: Record<string, string> = {};
    for (const id of voiceIdsFromHeader(header)) kept[id] = voices[id] ?? "";
    voices = kept;
  }

  function startBlank() {
    loadedSlug = null;
    status = null;
    header = splitScore(blankScore(formMeta())).header;
    // The boxes start empty rather than full of `z8 | z8 |`: the assembler
    // fills untouched parts with rests anyway, and an empty box is a clearer
    // invitation than one already full of text to delete.
    voices = Object.fromEntries(voiceIdsFromHeader(header).map((id) => [id, ""]));
  }

  function load(score: SavedScore) {
    loadedSlug = score.slug;
    status = null;
    const parts = splitScore(score.abc);
    header = parts.header;
    title = score.meta.title ?? "";
    level = score.meta.level ?? "";
    voicing = score.meta.voicing ?? "SATB";
    key = score.meta.key ?? "C";
    meter = score.meta.meter ?? "4/4";
    source = score.meta.source ?? "";
    voices = Object.fromEntries(
      voiceIdsFromHeader(parts.header).map((id) => [id, parts.voices[id] ?? ""])
    );
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
    } catch {
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
        body: JSON.stringify({ title, abc: assembled }),
      });
      const body = await res.json();
      if (body.success) {
        saved = body.data.scores;
        loadedSlug = body.data.slug;
        status = { kind: "ok", text: `Saved as scores/${body.data.slug}.abc` };
      } else {
        status = { kind: "error", text: body.error };
      }
    } catch {
      status = { kind: "error", text: "Could not reach the server." };
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    abcjsMod = await import("abcjs");
    startBlank();
    await refresh();
  });

  onDestroy(() => {
    if (renderTimer) clearTimeout(renderTimer);
  });
</script>

<div class="w-full max-w-[1600px] mx-auto px-2 md:px-4 space-y-4">
  <!-- Details -->
  <div class="bg-white rounded-lg shadow-md p-4 space-y-3">
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <label class="space-y-1 col-span-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Title</span>
        <input bind:value={title} placeholder="Forgotten"
          class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
      </label>
      <label class="space-y-1">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">UIL level</span>
        <select bind:value={level} class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
          {#each LEVELS as l}<option value={l}>{l || "-"}</option>{/each}
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Voicing</span>
        <select bind:value={voicing} on:change={rebuildForVoicing}
          class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
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
        <input bind:value={source} placeholder="Where you read it - year, level, publisher"
          class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
      </label>
      <div class="flex items-end gap-2 col-span-2">
        <button class="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-slate-100 hover:bg-slate-200"
          on:click={startBlank} title="Empty every part and start again">
          <Plus size={15} /> Blank score</button>
        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
          on:click={save}
          disabled={saving || !writable || blocking.length > 0}
          title={!writable ? notWritableReason : blocking[0]?.message ?? "Write this score into the project"}
        ><Save size={15} /> {saving ? "Saving..." : "Save"}</button>
      </div>
    </div>

    <p class="text-xs text-slate-400">
      One box per part - just the bars, no <code>[V:]</code> prefixes and no
      worrying about line breaks. Type as many lines as you like; they are joined
      into one line per voice when the file is written, which is the layout ABC
      needs. Parts you leave empty are filled with rests.
    </p>

    {#if !writable}
      <p class="text-sm rounded px-3 py-2 bg-slate-100 text-slate-600" role="status">
        {notWritableReason} Run <code>bun run dev</code> locally to save.
      </p>
    {/if}
    {#if status}
      <p class="text-sm rounded px-3 py-2 {status.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}"
        role="status">{status.text}</p>
    {/if}
  </div>

  <!--
    Parts beside the score, each pane scrolling on its own.

    A single page scroll meant the score slid away exactly when it was wanted -
    while typing into a part further down. The score pane was sticky, which
    pinned its top but gave no way to reach the bottom of a long score.

    So both panes are capped at the viewport height and scroll inside it: type
    in one, follow along in the other, neither moving the other. Only from `lg`
    up, where the two sit side by side - stacked on a narrow screen the page
    scroll is the natural one.
  -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
    <div class="space-y-3 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
      {#each voiceIds as id (id)}
        <div class="bg-white rounded-lg shadow-md p-3 space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {voiceLabel[id] ?? id}
          </p>
          <textarea
            bind:value={voices[id]}
            spellcheck="false"
            placeholder={voicePlaceholder[id] ?? "c2 d2 e2 f2 |"}
            class="w-full h-24 font-mono text-sm border border-slate-200 rounded p-2 resize-y"
          ></textarea>
        </div>
      {/each}

      <div class="bg-white rounded-lg shadow-md p-3 space-y-2">
        <button class="text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
          on:click={() => (showHeader = !showHeader)}>
          Header {showHeader ? "-" : "+"}
        </button>
        {#if showHeader}
          <p class="text-xs text-slate-400">
            Written from the details above. Edit it for anything they do not
            cover - a pickup bar, a tempo, an extra voice.
          </p>
          <textarea
            bind:value={header}
            spellcheck="false"
            class="w-full h-48 font-mono text-sm border border-slate-200 rounded p-2 resize-y"
          ></textarea>
        {/if}
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-md p-3 space-y-2 lg:sticky lg:top-20
                lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400 sticky top-0 bg-white pb-1">
        Score
      </p>
      <div bind:this={paperEl} class="w-full"></div>
      {#each warnings as warning}
        <p class="text-xs text-amber-700">{warning}</p>
      {/each}
      {#each problems as problem}
        <p class="text-xs rounded px-2 py-1 bg-amber-50 text-amber-800">{problem.message}</p>
      {/each}
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
                score.meta.voicing, score.meta.key, score.meta.meter]
                .filter(Boolean).join(" · ")}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
