<script lang="ts">
  /**
   * Assign bars of one part of a piece from My music to a class: which part,
   * which bars, what plays along, the tempo, how many attempts. The same form
   * on a class's card (the piece is chosen here) and in the piece's viewer
   * (the class is). It says why a part cannot be assigned before anyone
   * presses Assign, and shows the excerpt as students will see it.
   */
  import { onMount, tick } from "svelte";
  import { loadPiece, listPieces } from "../../lib/pieces/client";
  import { abcForPiece } from "../../lib/pieces/write-abc";
  import { MAX_ATTEMPTS, excerptLabel, partProblem, singleLineParts, type Strictness } from "../../lib/pieces/assign";
  import { partSettingsFor, type PartSettings, type PieceSummary } from "../../lib/pieces/rules";
  import { MAX_MINUTES } from "../../lib/practice";
  import type { PieceScore } from "../../lib/pieces/model";

  /** A fixed piece (the viewer), or chosen here (a class's card). */
  export let pieceId: string | null = null;
  /** A fixed class (a class's card), or chosen here (the viewer). */
  export let classId: string | null = null;
  /** Where to start: the viewer's current bars and tempo. */
  export let initial: { from?: number; to?: number; tempo?: number } = {};
  export let onDone: (r: { id: string; classId: string; className: string }) => void;
  export let onCancel: () => void;

  let pieces: PieceSummary[] = [];
  let classes: { id: string; name: string }[] = [];
  let chosenPiece = pieceId ?? "";
  let chosenClass = classId ?? "";
  let score: PieceScore | null = null;
  let settings: PartSettings = {};
  let loadingPiece = false;
  let problem = "";
  let busy = false;

  let partId = "";
  let from = 0;
  let to = 0;
  let accompaniment = new Set<string>();
  let tempo = 100;
  let limitAttempts = false;
  let maxAttempts = 3;
  let strictness: Strictness = "standard";
  let minutes = 0;
  let dueAt = "";
  let note = "";
  let previewEl: HTMLDivElement;

  onMount(async () => {
    if (!pieceId) {
      try {
        pieces = await listPieces();
      } catch (e) {
        problem = (e as Error).message;
      }
    } else await choosePiece(pieceId);
    if (!classId) {
      const res = await fetch("/api/classes");
      if (res.ok) classes = (await res.json()).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
      if (classes.length === 1) chosenClass = classes[0].id;
    }
  });

  async function choosePiece(id: string) {
    chosenPiece = id;
    score = null;
    if (!id) return;
    loadingPiece = true;
    try {
      const loaded = await loadPiece(id);
      score = loaded.score;
      settings = partSettingsFor(loaded.score, loaded.parts);
      const lines = singleLineParts(score);
      partId = lines[0] ?? score.parts[0].id;
      from = Math.min(initial.from ?? 0, score.measures.length - 1);
      to = Math.min(initial.to ?? Math.min(score.measures.length - 1, from + 7), score.measures.length - 1);
      tempo = Math.round(initial.tempo ?? score.measures.find((m) => m.tempo)?.tempo ?? 100);
      resetAccompaniment();
    } catch (e) {
      problem = (e as Error).message;
    } finally {
      loadingPiece = false;
    }
  }

  /** Every other part the teacher has not muted plays along. */
  function resetAccompaniment() {
    if (!score) return;
    accompaniment = new Set(score.parts.filter((p) => p.id !== partId && !settings[p.id]?.muted).map((p) => p.id));
  }

  function choosePart(id: string) {
    partId = id;
    resetAccompaniment();
  }

  function toggleAccompaniment(id: string) {
    const next = new Set(accompaniment);
    next.has(id) ? next.delete(id) : next.add(id);
    accompaniment = next;
  }

  const nameOf = (id: string) => settings[id]?.name ?? score?.parts.find((p) => p.id === id)?.name ?? "Part";
  $: lineParts = score ? new Set(singleLineParts(score)) : new Set<string>();
  $: why = score ? partProblem(score, partId, from, to) : null;
  $: playing = score ? score.parts.filter((p) => accompaniment.has(p.id) && p.id !== partId) : [];
  $: summary = score && !why
    ? `Students sing or play ${excerptLabel({ ...score, parts: score.parts.map((p) => ({ ...p, name: nameOf(p.id) })) }, { partId, from, to })}` +
      (playing.length ? `, with ${listOf(playing.map((p) => nameOf(p.id)))} playing along` : ", on their own") +
      `, at ${tempo} bpm. ${limitAttempts ? `${maxAttempts} graded attempt${maxAttempts === 1 ? "" : "s"}.` : "As many attempts as they like."}`
    : "";

  function listOf(names: string[]): string {
    return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  // The excerpt as students will see it: their part and what plays along.
  let drawTimer: ReturnType<typeof setTimeout> | null = null;
  $: if (score && previewEl && !why) schedulePreview(partId, from, to, accompaniment);
  function schedulePreview(..._deps: unknown[]) {
    if (drawTimer) clearTimeout(drawTimer);
    drawTimer = setTimeout(drawPreview, 150);
  }
  async function drawPreview() {
    if (!score || !previewEl) return;
    await tick();
    const abcjs = (await import("abcjs")).default;
    const idx = score.parts.map((p, i) => (p.id === partId || accompaniment.has(p.id) ? i : -1)).filter((i) => i >= 0);
    const names = Object.fromEntries(score.parts.map((p, i) => [i, p.id === partId ? `${nameOf(p.id)} (students)` : nameOf(p.id)]));
    const { abc } = abcForPiece(score, { parts: idx, from, to, names, barsPerLine: 4, tempoChanges: false });
    abcjs.renderAbc(previewEl, abc, { responsive: "resize", staffwidth: 700, scale: 0.8 });
  }

  async function assign() {
    if (!score || why || !chosenClass) return;
    busy = true;
    problem = "";
    const res = await fetch(`/api/classes/${chosenClass}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presetKey: `piece:${chosenPiece}`,
        minutes,
        dueAt,
        note,
        piece: { partId, from, to, accompaniment: [...accompaniment], tempo, maxAttempts: limitAttempts ? maxAttempts : null, strictness },
      }),
    });
    const body = await res.json().catch(() => ({}));
    busy = false;
    if (!res.ok) {
      problem = body.error ?? "Could not assign that.";
      return;
    }
    onDone({ id: body.id, classId: chosenClass, className: classes.find((c) => c.id === chosenClass)?.name ?? "" });
  }

  const today = new Date().toISOString().slice(0, 10);
</script>

<form class="flex flex-col gap-4" on:submit|preventDefault={assign}>
  {#if !classId}
    <label class="field">
      <span>Class</span>
      {#if classes.length}
        <select bind:value={chosenClass} required>
          <option value="" disabled>Choose a class…</option>
          {#each classes as c}<option value={c.id}>{c.name}</option>{/each}
        </select>
      {:else}
        <span class="text-sm font-normal text-sr-muted">No classes yet. Make one on <a class="sr-link" href="/account">your account page</a>.</span>
      {/if}
    </label>
  {/if}

  {#if !pieceId}
    <label class="field">
      <span>Piece</span>
      {#if pieces.length}
        <select value={chosenPiece} on:change={(e) => choosePiece(e.currentTarget.value)} required>
          <option value="" disabled>Choose a piece…</option>
          {#each pieces as p}<option value={p.id}>{p.title}</option>{/each}
        </select>
      {:else}
        <span class="text-sm font-normal text-sr-muted">Nothing in My music yet. <a class="sr-link" href="/pieces">Upload a piece</a> first.</span>
      {/if}
    </label>
  {/if}

  {#if loadingPiece}
    <p class="text-sm text-sr-muted">Loading the piece…</p>
  {:else if score}
    <fieldset class="flex flex-col gap-2">
      <legend class="legend">Their part</legend>
      <div class="chips">
        {#each score.parts as p (p.id)}
          <button
            type="button"
            class="chip"
            class:on={partId === p.id}
            disabled={!lineParts.has(p.id)}
            title={lineParts.has(p.id) ? "" : "More than one note at a time throughout: it can play along, but not be graded"}
            aria-pressed={partId === p.id}
            on:click={() => choosePart(p.id)}>{nameOf(p.id)}</button
          >
        {/each}
      </div>
    </fieldset>

    <div class="flex flex-wrap gap-4">
      <label class="field">
        <span>From bar</span>
        <select bind:value={from} on:change={() => (to = Math.max(to, from))}>
          {#each score.measures as m, i}<option value={i}>{m.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>To bar</span>
        <select bind:value={to}>
          {#each score.measures as m, i}<option value={i} disabled={i < from}>{m.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Tempo</span>
        <span class="flex items-center gap-2 font-normal text-sr-ink"><input class="w-20" type="number" min="30" max="240" bind:value={tempo} /> bpm</span>
      </label>
    </div>

    {#if score.parts.length > 1}
      <fieldset class="flex flex-col gap-2">
        <legend class="legend">Playing along</legend>
        <div class="chips">
          {#each score.parts.filter((p) => p.id !== partId) as p (p.id)}
            <button type="button" class="chip" class:on={accompaniment.has(p.id)} aria-pressed={accompaniment.has(p.id)} on:click={() => toggleAccompaniment(p.id)}>
              {nameOf(p.id)}
            </button>
          {/each}
        </div>
      </fieldset>
    {/if}

    {#if why}
      <p class="text-sm text-sr-brass" role="alert">{why}</p>
    {:else}
      <div class="preview" aria-label="What students will see">
        <div bind:this={previewEl}></div>
      </div>
    {/if}

    <fieldset class="flex flex-col gap-2">
      <legend class="legend">Graded attempts</legend>
      <div class="flex flex-wrap items-center gap-3 text-sm text-sr-ink">
        <label class="flex items-center gap-2"><input type="radio" name="attempts" checked={!limitAttempts} on:change={() => (limitAttempts = false)} /> As many as they like</label>
        <label class="flex items-center gap-2">
          <input type="radio" name="attempts" checked={limitAttempts} on:change={() => (limitAttempts = true)} /> Up to
          <input class="w-16" type="number" min="1" max={MAX_ATTEMPTS} bind:value={maxAttempts} on:focus={() => (limitAttempts = true)} aria-label="Number of attempts" />
        </label>
        <label class="flex items-center gap-2">
          Grading
          <select bind:value={strictness}>
            <option value="easy">Easy</option>
            <option value="standard">Standard</option>
            <option value="strict">Strict</option>
          </select>
        </label>
      </div>
    </fieldset>

    <div class="flex flex-wrap gap-4">
      <label class="field">
        <span>Practice minutes <span class="font-normal">(optional)</span></span>
        <input class="w-24" type="number" min="0" max={MAX_MINUTES} bind:value={minutes} />
      </label>
      <label class="field">
        <span>Due <span class="font-normal">(optional)</span></span>
        <input type="date" min={today} bind:value={dueAt} />
      </label>
    </div>
    <label class="field">
      <span>Note for students <span class="font-normal">(optional)</span></span>
      <input bind:value={note} maxlength="300" placeholder="Sing it on loo first, then on the words" />
    </label>

    {#if summary}<p class="summary">{summary}</p>{/if}
  {/if}

  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

  <div class="flex flex-wrap gap-2">
    <button class="sr-btn" disabled={busy || !score || !!why || !chosenClass}>{busy ? "Assigning…" : "Assign"}</button>
    <button type="button" class="sr-btn-quiet" on:click={onCancel}>Cancel</button>
  </div>
</form>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--sr-muted);
  }
  .legend {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--sr-muted);
    margin-bottom: 0.3rem;
  }
  form :global(select),
  form :global(input[type="number"]),
  form :global(input[type="date"]),
  .field input {
    min-height: 2.5rem;
    border-radius: 12px;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-panel);
    color: var(--sr-ink);
    padding: 0 0.6rem;
    font-weight: 400;
    font-size: 0.95rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    min-height: 2.5rem;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--sr-hairline);
    color: var(--sr-ink-2);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .chip.on {
    background: var(--sr-action);
    border-color: var(--sr-action);
    color: var(--sr-action-ink);
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .preview {
    background: #fff;
    border-radius: 20px;
    padding: 0.5rem;
    border: 1px solid var(--sr-hairline);
    max-height: 22rem;
    overflow: auto;
  }
  .summary {
    font-weight: 700;
    color: var(--sr-peach-ink);
    background: var(--sr-peach);
    border-radius: 16px;
    padding: 0.75rem 1rem;
  }
</style>
