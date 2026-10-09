<script lang="ts">
  /**
   * A teacher's own piece (src/lib/pieces/): drawn and played by abcjs from
   * ABC written out of the model (write-abc.ts). Each part has its own
   * instrument, volume, mute and show or hide, saved to the piece; the music
   * plays at any tempo, whole or a run of bars.
   *
   * Hidden parts are still heard: the page draws the shown parts and plays a
   * parse of every part (the Choral page's way, through setUpAudio).
   */
  import { onDestroy, onMount, tick } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import Pause from "lucide-svelte/icons/pause";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import VolumeX from "lucide-svelte/icons/volume-x";
  import Eye from "lucide-svelte/icons/eye";
  import EyeOff from "lucide-svelte/icons/eye-off";
  import Pencil from "lucide-svelte/icons/pencil";
  import { INSTRUMENTS } from "../../lib/instruments";
  import { abcForPiece, type PieceAbc } from "../../lib/pieces/write-abc";
  import { loadPiece, updatePiece } from "../../lib/pieces/client";
  import type { PieceScore } from "../../lib/pieces/model";
  import { partSettingsFor, type PartSettings, type PieceSummary } from "../../lib/pieces/rules";

  export let id: string;

  let piece: PieceSummary | null = null;
  let score: PieceScore | null = null;
  let parts: PartSettings = {};
  let error = "";
  let status = "";

  let bpm = 100;
  let scoreBpm = 100;
  let from = 0;
  let to = 0;
  let excerpt = false;
  let isPlaying = false;
  let isPreparing = false;
  let looping = false;
  let narrow = false;

  let renaming = false;
  let titleDraft = "";

  let drawn: PieceAbc | null = null;
  let renderedTune: any = null;
  let synthControl: any = null;

  onMount(async () => {
    narrow = window.innerWidth <= 640;
    try {
      const loaded = await loadPiece(id);
      piece = loaded.piece;
      score = loaded.score;
      parts = partSettingsFor(loaded.score, loaded.parts);
      const firstTempo = score.measures.find((m) => m.tempo)?.tempo;
      scoreBpm = bpm = firstTempo ?? 100;
      to = score.measures.length - 1;
      await tick();
      await render();
    } catch (e) {
      error = (e as Error).message;
    }
  });

  onDestroy(() => {
    try { synthControl?.destroy?.(); } catch {}
  });

  $: partOrder = score ? score.parts.map((p, i) => ({ p, i, s: parts[p.id] })).filter((x) => x.s) : [];
  $: shownParts = partOrder.filter((x) => !x.s.hidden).map((x) => x.i);
  $: barChoices = score ? score.measures.map((m, i) => ({ i, label: m.label })) : [];

  function abcOptions(partIdx: number[]) {
    const programs = Object.fromEntries(partOrder.map((x) => [x.i, x.s.program]));
    const range = excerpt ? { from, to } : {};
    const perLine = narrow ? 2 : score && score.parts.length > 6 ? 3 : 4;
    return { parts: partIdx, programs, barsPerLine: perLine, tempo: scoreBpm, ...range };
  }

  async function render() {
    if (!score) return;
    pause();
    const abcjs = (await import("abcjs")).default;
    const shown = shownParts.length ? shownParts : [0];
    drawn = abcForPiece(score, abcOptions(shown));
    const box = document.getElementById("piece-box");
    const staffwidth = Math.max(300, Math.floor((box?.clientWidth ?? 760) / (narrow ? 1 : 1.25)) - 30);
    document.getElementById("piece-paper")?.removeAttribute("style");
    const [tune] = abcjs.renderAbc("piece-paper", drawn.abc, {
      add_classes: true,
      responsive: "resize",
      staffwidth,
      scale: score.parts.length > 6 ? 0.8 : 1,
    });
    renderedTune = tune;
    await buildSynth();
  }

  async function buildSynth() {
    if (!renderedTune || !score) return;
    const abcjs = (await import("abcjs")).default;
    try { synthControl?.destroy?.(); } catch {}
    // Every part plays, shown or not: the audio is a parse of all of them.
    const all = abcForPiece(score, abcOptions(score.parts.map((_, i) => i)));
    const [full] = abcjs.parseOnly(all.abc) as any[];
    renderedTune.setUpAudio = (params: any) => full.setUpAudio(params);
    const levels = all.voices.map((v) => {
      const s = parts[score!.parts[v.part].id];
      return !s || s.muted ? 0 : s.volume / 80;
    });
    synthControl = new abcjs.synth.SynthController();
    let lit: Element[] = [];
    const cursorControl = {
      onEvent: (event: any) => {
        for (const e of lit) e.classList.remove("piece-now");
        lit = (event?.elements ?? []).flat();
        for (const e of lit) e.classList.add("piece-now");
        const first = lit[0] as HTMLElement | undefined;
        first?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      },
      onFinished: () => {
        for (const e of lit) e.classList.remove("piece-now");
        lit = [];
        isPlaying = false;
        if (looping) void play();
      },
    };
    await synthControl.setTune(renderedTune, false, {
      soundFontUrl: "/api/soundfont/",
      soundFontVolumeMultiplier: 3.0,
      // One track a voice, in the order the ABC lists them.
      sequenceCallback: (tracks: any[]) => {
        tracks.forEach((track, t) => {
          const level = levels[t] ?? 1;
          for (const note of track) note.volume = Math.max(0, Math.min(127, Math.round(note.volume * level)));
        });
        return tracks;
      },
    });
    await synthControl.load("#piece-audio", cursorControl, { displayWarp: true });
    setWarp();
  }

  function setWarp() {
    try { synthControl?.setWarp(Math.round((bpm / scoreBpm) * 100)); } catch {}
  }

  async function play() {
    if (!synthControl || isPreparing) return;
    isPreparing = true;
    try {
      const abcjs = (await import("abcjs")).default;
      const ctx = abcjs.synth.activeAudioContext?.();
      if (ctx && ctx.state !== "running") await ctx.resume();
      await synthControl.play();
      isPlaying = true;
    } finally {
      isPreparing = false;
    }
  }

  /** abcjs's play() toggles isStarted and pause() never resets it (see AbcjsChoral pausePlayback). */
  function pause() {
    if (!synthControl) return;
    synthControl.pause();
    synthControl.isStarted = false;
    isPlaying = false;
  }

  function rewind() {
    pause();
    try { synthControl?.seek(0); } catch {}
    document.querySelectorAll("#piece-paper .piece-now").forEach((e) => e.classList.remove("piece-now"));
  }

  // ── Parts ───────────────────────────────────────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function saveParts() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await updatePiece(id, { parts });
        status = "";
      } catch (e) {
        status = (e as Error).message;
      }
    }, 600);
  }

  async function changePart(partId: string, patch: Partial<PartSettings[string]>, redraw: boolean) {
    parts = { ...parts, [partId]: { ...parts[partId], ...patch } };
    saveParts();
    if (redraw) await render();
    else {
      pause();
      await buildSynth();
    }
  }

  function solo(partId: string) {
    const only = Object.entries(parts).every(([pid, s]) => (pid === partId ? !s.muted : s.muted));
    parts = Object.fromEntries(Object.entries(parts).map(([pid, s]) => [pid, { ...s, muted: only ? false : pid !== partId }]));
    saveParts();
    pause();
    void buildSynth();
  }

  // ── Bars ────────────────────────────────────────────────────────────────
  async function setRange(f: number, t: number) {
    from = Math.min(f, t);
    to = Math.max(f, t);
    excerpt = !!score && !(from === 0 && to === score.measures.length - 1);
    await render();
  }

  async function wholePiece() {
    if (!score) return;
    excerpt = false;
    from = 0;
    to = score.measures.length - 1;
    await render();
  }

  async function saveTitle() {
    if (!piece) return;
    const title = titleDraft.trim();
    renaming = false;
    if (!title || title === piece.title) return;
    try {
      await updatePiece(id, { title });
      piece = { ...piece, title };
    } catch (e) {
      status = (e as Error).message;
    }
  }
</script>

<div class="w-full max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4 pb-32">
  {#if error}
    <div class="sr-panel p-6 flex flex-col gap-3">
      <p class="text-sr-ink">{error}</p>
      <a class="sr-btn self-start" href="/pieces">Back to My music</a>
    </div>
  {:else if !piece || !score}
    <p class="text-sr-muted">Loading the music…</p>
  {:else}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <a class="sr-link text-sm" href="/pieces">My music</a>
        {#if renaming}
          <form class="flex gap-2 mt-1" on:submit|preventDefault={saveTitle}>
            <label class="sr-only" for="piece-title">Title</label>
            <!-- svelte-ignore a11y-autofocus -->
            <input id="piece-title" class="title-input" bind:value={titleDraft} maxlength="120" autofocus on:blur={saveTitle} />
          </form>
        {:else}
          <h1 class="text-2xl sm:text-3xl font-bold text-sr-ink flex items-center gap-2">
            <span class="truncate">{piece.title}</span>
            <button type="button" class="icon-btn" aria-label="Rename" on:click={() => ((titleDraft = piece?.title ?? ""), (renaming = true))}>
              <Pencil size={16} aria-hidden="true" />
            </button>
          </h1>
        {/if}
        <p class="text-sm text-sr-muted">{piece.composer ? `${piece.composer} · ` : ""}{score.parts.length} part{score.parts.length === 1 ? "" : "s"} · {score.measures.length} bars</p>
      </div>
    </header>

    {#if piece.warnings.length}
      <p class="text-sm text-sr-muted">{piece.warnings.join(". ")}.</p>
    {/if}

    <section class="sr-panel p-4 flex flex-col gap-2" aria-labelledby="parts-h">
      <h2 id="parts-h" class="font-bold text-sr-ink">Parts</h2>
      <ul class="flex flex-col divide-y divide-sr-hairline">
        {#each partOrder as { p, s } (p.id)}
          <li class="part-row">
            <span class="part-name" title={p.name}>{s.name}</span>
            <label class="sr-only" for="inst-{p.id}">Instrument for {s.name}</label>
            <select id="inst-{p.id}" class="part-select" value={s.program} on:change={(e) => changePart(p.id, { program: Number(e.currentTarget.value) }, true)}>
              {#each INSTRUMENTS as inst}<option value={inst.program}>{inst.label}</option>{/each}
            </select>
            <label class="vol">
              <span class="sr-only">Volume for {s.name}</span>
              <input type="range" min="0" max="100" step="5" value={s.volume} on:change={(e) => changePart(p.id, { volume: Number(e.currentTarget.value) }, false)} />
            </label>
            <span class="part-btns">
              <button type="button" class="icon-btn" class:off={s.muted} aria-pressed={s.muted} aria-label="{s.muted ? 'Unmute' : 'Mute'} {s.name}" on:click={() => changePart(p.id, { muted: !s.muted }, false)}>
                {#if s.muted}<VolumeX size={18} aria-hidden="true" />{:else}<Volume2 size={18} aria-hidden="true" />{/if}
              </button>
              <button type="button" class="sr-tok text-xs" on:click={() => solo(p.id)}>Solo</button>
              <button type="button" class="icon-btn" class:off={s.hidden} aria-pressed={s.hidden} aria-label="{s.hidden ? 'Show' : 'Hide'} {s.name}" on:click={() => changePart(p.id, { hidden: !s.hidden }, true)}>
                {#if s.hidden}<EyeOff size={18} aria-hidden="true" />{:else}<Eye size={18} aria-hidden="true" />{/if}
              </button>
            </span>
          </li>
        {/each}
      </ul>
      {#if status}<p class="text-sm text-sr-brass" role="status">{status}</p>{/if}
    </section>

    <section class="sr-panel p-4 flex flex-wrap items-end gap-4" aria-label="Bars and tempo">
      <label class="field">
        <span>From bar</span>
        <select value={from} on:change={(e) => setRange(Number(e.currentTarget.value), Math.max(Number(e.currentTarget.value), to))}>
          {#each barChoices as b}<option value={b.i}>{b.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>To bar</span>
        <select value={to} on:change={(e) => setRange(from, Number(e.currentTarget.value))}>
          {#each barChoices as b}<option value={b.i} disabled={b.i < from}>{b.label}</option>{/each}
        </select>
      </label>
      {#if excerpt}
        <button type="button" class="sr-btn-quiet text-sm" on:click={wholePiece}>Whole piece</button>
      {/if}
      <label class="field">
        <span>Tempo</span>
        <span class="flex items-center gap-2">
          <input type="range" min="30" max="220" step="1" bind:value={bpm} on:change={setWarp} aria-label="Tempo" />
          <span class="tabular-nums font-bold text-sr-ink w-16">{bpm} bpm</span>
        </span>
      </label>
      <label class="flex items-center gap-2 text-sm text-sr-ink">
        <input type="checkbox" bind:checked={looping} /> Loop
      </label>
    </section>

    <div id="piece-box" class="score-paper">
      <div id="piece-paper"></div>
    </div>
    <div id="piece-audio" class="hidden"></div>

    <div class="transport no-print" role="group" aria-label="Playback">
      <button type="button" class="t-btn" aria-label="Back to the start" on:click={rewind}><SkipBack size={20} aria-hidden="true" /></button>
      {#if isPlaying}
        <button type="button" class="t-btn t-main" aria-label="Pause" on:click={pause}><Pause size={24} aria-hidden="true" /></button>
      {:else}
        <button type="button" class="t-btn t-main" aria-label="Play" disabled={isPreparing} on:click={play}><Play size={24} aria-hidden="true" /></button>
      {/if}
      <span class="t-label">{excerpt ? `Bars ${score.measures[from].label} to ${score.measures[to].label}` : "Whole piece"} · {bpm} bpm</span>
    </div>
  {/if}
</div>

<style>
  .score-paper {
    background: #fff;
    border-radius: 28px;
    padding: 1rem;
    box-shadow: var(--sr-card-shadow);
    overflow-x: auto;
  }
  :global(#piece-paper .piece-now) {
    fill: var(--sr-action);
  }
  .part-row {
    display: grid;
    grid-template-columns: minmax(6rem, 1fr) minmax(8rem, 12rem) minmax(5rem, 9rem) auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0;
  }
  @media (max-width: 640px) {
    .part-row {
      grid-template-columns: 1fr auto;
    }
    .part-row .part-select,
    .part-row .vol {
      grid-column: span 1;
    }
  }
  .part-name {
    font-weight: 700;
    color: var(--sr-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .part-select,
  .field select,
  .title-input {
    min-height: 2.5rem;
    border-radius: 12px;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-panel);
    color: var(--sr-ink);
    padding: 0 0.6rem;
  }
  .title-input {
    font-size: 1.4rem;
    font-weight: 700;
    width: min(32rem, 80vw);
  }
  .vol input {
    width: 100%;
  }
  .part-btns {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    color: var(--sr-ink-2);
  }
  .icon-btn:hover {
    background: var(--sr-hairline);
  }
  .icon-btn.off {
    color: var(--sr-muted);
    opacity: 0.6;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--sr-muted);
  }
  .transport {
    position: fixed;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem 0.5rem 0.5rem;
    border-radius: 999px;
    background: rgb(var(--sr-bar-rgb));
    color: #fff;
    box-shadow: var(--sr-card-shadow);
    max-width: calc(100vw - 2rem);
  }
  .t-btn {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    color: #fff;
  }
  .t-btn:hover {
    background: rgb(255 255 255 / 0.12);
  }
  .t-main {
    width: 3.25rem;
    height: 3.25rem;
    background: var(--sr-action);
  }
  .t-label {
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
