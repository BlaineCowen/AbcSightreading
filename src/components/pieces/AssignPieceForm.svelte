<script lang="ts">
  /**
   * Assign bars of a piece from My music to a class: which bars, what
   * students hear with their part, the tempo, how many attempts. Each student
   * chooses their own part when they open it. The same form on a class's
   * card (the piece is chosen here) and in the piece's viewer (the class is).
   * It says why bars cannot be assigned before anyone presses Assign, and
   * shows the excerpt.
   */
  import { onMount, tick } from "svelte";
  import { loadPiece, listPieces } from "../../lib/pieces/client";
  import { abcForPiece } from "../../lib/pieces/write-abc";
  import { HEARING, HEARING_LABEL, MAX_ATTEMPTS, barsLabel, barsProblem, partsFor, type Hearing, type Strictness } from "../../lib/pieces/assign";
  import { partSettingsFor, type PartSettings, type PieceSummary } from "../../lib/pieces/rules";
  import { MAX_MINUTES } from "../../lib/practice";
  import type { PieceScore } from "../../lib/pieces/model";
  import { barBoxes, barFromEvent, barHits, noteElements, shadeBars, type BarBox } from "../../lib/pieces/score-dom";

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

  let from = 0;
  /** Where playback starts: at `from` (a count-in only), or bars before it as a lead-in. */
  let leadIn = 0;
  /** The first bar clicked, waiting for the last (a range picked like dates on a calendar). */
  let anchor: number | null = null;
  /** The next click on the music sets where the lead-in starts. */
  let pickingLead = false;
  /** The bar under the pointer, for the live preview. */
  let hoverBar: number | null = null;
  /** A mouse drag across bars: where it started, and whether it has left that bar. */
  let dragFrom: number | null = null;
  let dragged = false;
  let boxes: BarBox[] = [];
  let drawnFor = "";
  let to = 0;
  let hearing: Hearing = "others";
  let playing = new Set<string>();
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
      from = Math.min(initial.from ?? 0, score.measures.length - 1);
      to = Math.min(initial.to ?? Math.min(score.measures.length - 1, from + 7), score.measures.length - 1);
      leadIn = from;
      anchor = null;
      pickingLead = false;
      drawnFor = "";
      tempo = Math.round(initial.tempo ?? score.measures.find((m) => m.tempo)?.tempo ?? 100);
      // "Only what you choose" starts on a piano or organ part, if the piece has one.
      const keys = score.parts.filter((p) => /piano|organ|keyboard|accomp/i.test(nameOf(p.id))).map((p) => p.id);
      playing = new Set(keys);
    } catch (e) {
      problem = (e as Error).message;
    } finally {
      loadingPiece = false;
    }
  }

  function togglePlaying(id: string) {
    const next = new Set(playing);
    next.has(id) ? next.delete(id) : next.add(id);
    playing = next;
  }

  const nameOf = (id: string) => settings[id]?.name ?? score?.parts.find((p) => p.id === id)?.name ?? "Part";
  // The lead-in never starts after the graded bars.
  $: if (leadIn > from) leadIn = from;
  $: why = score ? barsProblem(score, from, to, leadIn) ?? (hearing === "selected" && playing.size === 0 ? "Choose the parts that play along." : null) : null;
  $: choosable = score ? partsFor(score, from, to) : [];
  $: notChoosable = score ? score.parts.filter((p) => !choosable.includes(p.id)) : [];
  $: summary = score && !why
    ? `Each student chooses their part (${listOf(choosable.map(nameOf))}) and sings or plays ${barsLabel(score, { from, to })}${leadIn < from ? ` after a lead-in from bar ${score.measures[leadIn].label}` : ""} at ${tempo} bpm, hearing ` +
      {
        others: "the other parts with their own silent",
        quiet: "every part, their own softly",
        selected: `only ${listOf([...playing].map(nameOf))}`,
        acappella: "nothing but a click",
      }[hearing] +
      `. ${limitAttempts ? `${maxAttempts} graded attempt${maxAttempts === 1 ? "" : "s"}.` : "As many attempts as they like."}`
    : "";

  function listOf(names: string[]): string {
    return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  // The whole piece, as students will see it: tap a bar to choose it, the
  // graded bars shaded and the lead-in lighter. Drawn once a piece; shaded
  // again as the choice changes.
  $: if (score && previewEl) void drawPreview(chosenPiece);
  $: if (boxes.length) shade(from, to, leadIn, anchor, hoverBar, pickingLead);

  async function drawPreview(key: string) {
    if (!score || !previewEl || drawnFor === key) return;
    drawnFor = key;
    await tick();
    const abcjs = (await import("abcjs")).default;
    const idx = score.parts.map((p, i) => (settings[p.id]?.hidden ? -1 : i)).filter((i) => i >= 0);
    const names = Object.fromEntries(score.parts.map((p, i) => [i, nameOf(p.id)]));
    const drawn = abcForPiece(score, { parts: idx.length ? idx : [0], names, barsPerLine: 4, tempoChanges: false });
    const [tune] = abcjs.renderAbc(previewEl, drawn.abc, {
      add_classes: true,
      responsive: "resize",
      staffwidth: 700,
      scale: 0.8,
    });
    const svg = previewEl.querySelector("svg");
    boxes = barBoxes(svg, noteElements(tune, drawn, score));
    barHits(svg, boxes);
    shade();
    // The chosen bars in view.
    const first = svg?.querySelector(`[data-bar="${leadIn}"]`);
    if (first && previewEl.parentElement) {
      const box = previewEl.parentElement;
      box.scrollTop = Math.max(0, first.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 40);
    }
  }

  const barName = (i: number) => score?.measures[i]?.label ?? String(i + 1);
  const barsName = (a: number, b: number) => (a === b ? `bar ${barName(a)}` : `bars ${barName(a)} to ${barName(b)}`);

  function shade(..._deps: unknown[]) {
    if (!score) return;
    const svg = previewEl?.querySelector("svg") ?? null;
    // Waiting for the last bar: the range so far follows the pointer.
    if (anchor !== null) {
      const end = hoverBar ?? anchor;
      const [a, b] = [Math.min(anchor, end), Math.max(anchor, end)];
      shadeBars(svg, boxes, [{ from: a, to: b, cls: "shade-graded", label: `Graded: ${barsName(a, b)}` }]);
    } else {
      const lead = pickingLead && hoverBar !== null && hoverBar < from ? hoverBar : leadIn;
      shadeBars(svg, boxes, [
        ...(lead < from ? [{ from: lead, to: from - 1, cls: "shade-lead", label: "Lead-in" }] : []),
        { from, to, cls: "shade-graded", label: `Graded: ${barsName(from, to)}` },
      ]);
    }
    svg?.querySelectorAll<SVGElement>(".bar-hit").forEach((r) => {
      const bar = Number(r.dataset.bar);
      r.classList.toggle("lead-ok", pickingLead && bar < from);
      r.classList.toggle("anchor", anchor === bar);
    });
  }

  /** Sets the graded bars, keeping a lead-in that still comes before them. */
  function setRange(a: number, b: number) {
    const lead = leadIn < from ? leadIn : null;
    from = Math.min(a, b);
    to = Math.max(a, b);
    leadIn = lead !== null && lead < from ? lead : from;
  }

  /** A click on a bar: the first bar, then the last; or the lead-in's bar. */
  function clickBar(bar: number) {
    if (pickingLead) {
      if (bar < from) leadIn = bar;
      pickingLead = false;
      return;
    }
    if (anchor === null) {
      anchor = bar;
      setRange(bar, bar);
    } else {
      setRange(anchor, bar);
      anchor = null;
    }
  }

  function onPointerDown(e: PointerEvent) {
    const bar = barFromEvent(e);
    if (bar === null || e.pointerType !== "mouse" || pickingLead || e.button !== 0) return;
    e.preventDefault();
    dragFrom = bar;
    dragged = false;
  }

  function onPointerMove(e: PointerEvent) {
    const bar = barFromEvent(e);
    hoverBar = bar;
    if (dragFrom === null || bar === null) return;
    if (bar !== dragFrom || dragged) {
      dragged = true;
      anchor = null;
      setRange(dragFrom, bar);
    }
  }

  function onPointerUp() {
    // A drag picks the range at once; a press without moving is a click.
    if (dragFrom !== null && dragged) suppressClick = true;
    dragFrom = null;
  }

  let suppressClick = false;
  function onClick(e: MouseEvent) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const bar = barFromEvent(e);
    if (bar !== null) clickBar(bar);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape" || (anchor === null && !pickingLead)) return;
    e.stopPropagation();
    if (anchor !== null) anchor = null;
    pickingLead = false;
  }

  $: prompt = !score
    ? ""
    : pickingLead
      ? `Click the bar where playback starts, before bar ${barName(from)}.`
      : anchor !== null
        ? `Now click the last bar to grade. It starts at bar ${barName(anchor)}; click it again for just that bar.`
        : `Graded: ${barsName(from, to)}${leadIn < from ? `, after a lead-in from bar ${barName(leadIn)}` : ""}. Click a bar to choose again, or drag across bars.`;

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
        piece: { from, to, leadIn, hearing, playing: [...playing], tempo, maxAttempts: limitAttempts ? maxAttempts : null, strictness },
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
    <div class="picker-head">
      <p class="prompt" class:waiting={anchor !== null || pickingLead} aria-live="polite">
        <span class="step">{pickingLead ? "Lead-in" : anchor !== null ? "2" : "1"}</span>
        {prompt}
      </p>
      <div class="chips">
        {#if anchor !== null || pickingLead}
          <button type="button" class="chip" on:click={() => ((anchor = null), (pickingLead = false))}>Cancel</button>
        {:else if leadIn < from}
          <button type="button" class="chip" on:click={() => (pickingLead = true)}>Move the lead-in</button>
          <button type="button" class="chip" on:click={() => (leadIn = from)}>No lead-in</button>
        {:else if from > 0}
          <button type="button" class="chip" on:click={() => (pickingLead = true)}>Add a lead-in</button>
        {/if}
      </div>
    </div>
    <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
    <div class="preview" class:picking-lead={pickingLead} aria-label="The piece: click the first bar to grade, then the last. The lists below do the same." on:pointerdown={onPointerDown} on:pointermove={onPointerMove} on:pointerup={onPointerUp} on:pointerleave={() => (hoverBar = null)} on:click={onClick} on:keydown={onKey}>
      <div bind:this={previewEl}></div>
    </div>
    <div class="flex flex-wrap gap-4">
      <label class="field">
        <span>Graded from bar</span>
        <select bind:value={from} on:change={() => ((anchor = null), (to = Math.max(to, from)), (leadIn = Math.min(leadIn, from)))}>
          {#each score.measures as m, i}<option value={i}>{m.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>to bar</span>
        <select bind:value={to}>
          {#each score.measures as m, i}<option value={i} disabled={i < from}>{m.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Playback starts</span>
        <select bind:value={leadIn}>
          {#each score.measures.slice(0, from + 1) as m, i}
            <option value={i}>{i === from ? "With the graded bars (count-in only)" : `At bar ${m.label} (a lead-in)`}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Tempo</span>
        <span class="flex items-center gap-2 font-normal text-sr-ink"><input class="w-20" type="number" min="30" max="240" bind:value={tempo} /> bpm</span>
      </label>
    </div>

    <p class="text-sm text-sr-ink-2">
      Each student chooses their part when they open it{choosable.length ? `: ${listOf(choosable.map(nameOf))}` : ""}.
      {#if notChoosable.length}<span class="text-sr-muted">{listOf(notChoosable.map(nameOf))} {notChoosable.length === 1 ? "plays" : "play"} more than one note at a time here, so {notChoosable.length === 1 ? "it can" : "they can"} play along but not be graded.</span>{/if}
    </p>

    <fieldset class="flex flex-col gap-2">
      <legend class="legend">What they hear with their part</legend>
      <div class="hearing">
        {#each HEARING as h}
          <label class="hear" class:on={hearing === h}>
            <input class="sr-only" type="radio" name="hearing" value={h} bind:group={hearing} />
            <span class="font-bold text-sr-ink">{HEARING_LABEL[h].title}</span>
            <span class="text-xs text-sr-muted">{HEARING_LABEL[h].detail}</span>
          </label>
        {/each}
      </div>
      {#if hearing === "selected"}
        <div class="chips" role="group" aria-label="Parts that play along">
          {#each score.parts as p (p.id)}
            <button type="button" class="chip" class:on={playing.has(p.id)} aria-pressed={playing.has(p.id)} on:click={() => togglePlaying(p.id)}>{nameOf(p.id)}</button>
          {/each}
        </div>
        <p class="text-xs text-sr-muted">A student's own part stays silent even if it is picked here.</p>
      {/if}
    </fieldset>

    {#if why}<p class="text-sm text-sr-brass" role="alert">{why}</p>{/if}

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
  .hearing {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }
  .hear {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.75rem 0.9rem;
    border-radius: 16px;
    border: 2px solid var(--sr-hairline);
    cursor: pointer;
  }
  .hear.on {
    border-color: var(--sr-action);
    background: var(--sr-tint);
  }
  .hear:focus-within {
    outline: 2px solid var(--sr-action);
    outline-offset: 2px;
  }
  .preview :global(.shade-graded) { fill: var(--sr-peach); opacity: 0.6; }
  .preview :global(.shade-lead) { fill: var(--sr-sky); opacity: 0.5; }
  .preview :global(.shade-graded-label), .preview :global(.shade-lead-label) {
    font: 800 12px Nunito, sans-serif;
    fill: var(--sr-peach-ink);
  }
  .preview :global(.shade-lead-label) { fill: var(--sr-sky-ink); }
  .preview :global(.bar-hit) { fill: transparent; cursor: pointer; }
  .preview :global(.bar-hit:hover) { fill: var(--sr-action); fill-opacity: 0.1; }
  .preview :global(.bar-hit.anchor) { stroke: var(--sr-peach-ink); stroke-width: 2; stroke-dasharray: 5 4; }
  .preview.picking-lead :global(.bar-hit) { cursor: not-allowed; }
  .preview.picking-lead :global(.bar-hit.lead-ok) { cursor: pointer; }
  .preview.picking-lead :global(.bar-hit.lead-ok:hover) { fill: var(--sr-sky-ink); fill-opacity: 0.12; }
  .preview { user-select: none; -webkit-user-select: none; }
  .picker-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .prompt {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--sr-ink);
    flex: 1 1 20rem;
  }
  .prompt .step {
    flex: none;
    min-width: 1.8rem;
    height: 1.8rem;
    padding: 0 0.5rem;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    font-size: 0.8rem;
    background: var(--sr-tint);
    color: var(--sr-action);
  }
  .prompt.waiting .step {
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
  }
  .preview {
    background: #fff;
    border-radius: 20px;
    padding: 0.5rem;
    border: 1px solid var(--sr-hairline);
    max-height: 26rem;
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
