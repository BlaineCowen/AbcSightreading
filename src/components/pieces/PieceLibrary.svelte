<script lang="ts">
  /**
   * My music: a teacher's own pieces, uploaded as MusicXML from MuseScore,
   * Sibelius, Finale or Dorico (src/lib/pieces/). Drop or choose a file; the
   * server reads it and says what it found (parts, bars, anything left out),
   * and the piece opens in the viewer.
   */
  import { onMount } from "svelte";
  import Upload from "lucide-svelte/icons/upload";
  import Trash from "lucide-svelte/icons/trash-2";
  import Music from "lucide-svelte/icons/music";
  import { deletePiece, listPieces, uploadPiece } from "../../lib/pieces/client";
  import { ACCEPTED, isPieceFileName, type PieceSummary } from "../../lib/pieces/rules";

  let pieces: PieceSummary[] = [];
  let loading = true;
  let error = "";
  let uploading = "";
  let justAdded: PieceSummary | null = null;
  let dragging = false;
  let confirmDelete: string | null = null;
  let input: HTMLInputElement;

  onMount(async () => {
    try {
      pieces = await listPieces();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  async function add(files: FileList | File[] | null) {
    const list = [...(files ?? [])];
    if (list.length === 0) return;
    error = "";
    justAdded = null;
    for (const file of list) {
      if (!isPieceFileName(file.name)) {
        error = `${file.name} is not MusicXML. Export it from your notation program as MusicXML (.mxl or .musicxml).`;
        continue;
      }
      uploading = file.name;
      try {
        const piece = await uploadPiece(file);
        pieces = [piece, ...pieces];
        justAdded = piece;
      } catch (e) {
        error = `${file.name}: ${(e as Error).message}`;
      }
    }
    uploading = "";
    if (input) input.value = "";
  }

  async function remove(id: string) {
    confirmDelete = null;
    try {
      await deletePiece(id);
      pieces = pieces.filter((p) => p.id !== id);
      if (justAdded?.id === id) justAdded = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    void add(e.dataTransfer?.files ?? null);
  }

  const partsLine = (p: PieceSummary) =>
    p.parts.length <= 4 ? p.parts.join(", ") : `${p.parts.slice(0, 3).join(", ")} and ${p.parts.length - 3} more`;
</script>

<div class="w-full max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
  <header>
    <h1 class="text-3xl sm:text-4xl font-bold text-sr-ink">My music</h1>
    <p class="mt-1 text-sr-muted">Your own pieces, from MuseScore, Sibelius, Finale or Dorico. Play them with any part on or off, and practise one part along with the rest.</p>
  </header>

  <label
    class="drop sr-panel flex flex-col items-center justify-center gap-2 text-center p-8 cursor-pointer"
    class:dragging
    on:dragover|preventDefault={() => (dragging = true)}
    on:dragleave={() => (dragging = false)}
    on:drop={drop}
  >
    <Upload size={28} aria-hidden="true" class="text-sr-action" />
    {#if uploading}
      <span class="font-bold text-sr-ink">Reading {uploading}…</span>
    {:else}
      <span class="font-bold text-sr-ink">Drop a MusicXML file here, or choose one</span>
      <span class="text-sm text-sr-muted">.mxl, .musicxml or .xml. In your notation program: File, Export, MusicXML.</span>
    {/if}
    <input bind:this={input} class="sr-only" type="file" accept={ACCEPTED} multiple disabled={!!uploading} on:change={(e) => add(e.currentTarget.files)} />
  </label>

  {#if error}
    <p class="rounded-2xl border border-sr-brass bg-sr-brass-bg p-4 text-sm text-sr-brass" role="alert">{error}</p>
  {/if}

  {#if justAdded}
    <div class="rounded-2xl bg-sr-mint p-4 text-sr-mint-ink flex flex-wrap items-center justify-between gap-3" role="status">
      <div>
        <p class="font-bold">Added {justAdded.title}: {justAdded.parts.length} part{justAdded.parts.length === 1 ? "" : "s"}, {justAdded.bars} bars.</p>
        {#each justAdded.warnings as w}<p class="text-sm">{w}.</p>{/each}
      </div>
      <a class="sr-btn" href="/pieces/{justAdded.id}">Open it</a>
    </div>
  {/if}

  <section aria-labelledby="pieces-h" class="flex flex-col gap-3">
    <h2 id="pieces-h" class="text-xl font-bold text-sr-ink">Pieces</h2>
    {#if loading}
      <p class="text-sr-muted">Loading…</p>
    {:else if pieces.length === 0}
      <p class="text-sr-muted">No pieces yet. Add one above.</p>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each pieces as p (p.id)}
          <li class="sr-panel flex items-center gap-3 p-3 sm:p-4">
            <span class="icon" aria-hidden="true"><Music size={20} /></span>
            <a class="min-w-0 flex-1" href="/pieces/{p.id}">
              <span class="block font-bold text-sr-ink truncate">{p.title}</span>
              <span class="block text-sm text-sr-muted truncate">{p.composer ? `${p.composer} · ` : ""}{partsLine(p)} · {p.bars} bars</span>
            </a>
            {#if confirmDelete === p.id}
              <span class="flex items-center gap-2">
                <span class="text-sm text-sr-ink hidden sm:inline">Delete it?</span>
                <button type="button" class="sr-btn text-sm" on:click={() => remove(p.id)}>Delete</button>
                <button type="button" class="sr-btn-quiet text-sm" on:click={() => (confirmDelete = null)}>Keep</button>
              </span>
            {:else}
              <button type="button" class="del" aria-label="Delete {p.title}" on:click={() => (confirmDelete = p.id)}>
                <Trash size={18} aria-hidden="true" />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <p class="text-xs text-sr-muted">Only you can see your pieces. Upload only music you have the right to use, such as your own arrangements or music in the public domain.</p>
</div>

<style>
  .drop {
    border: 2px dashed var(--sr-hairline);
    min-height: 10rem;
    transition: border-color 120ms ease, background 120ms ease;
  }
  .drop:hover,
  .drop.dragging,
  .drop:focus-within {
    border-color: var(--sr-action);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: var(--sr-sky);
    color: var(--sr-sky-ink);
    flex: none;
  }
  .del {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    color: var(--sr-muted);
  }
  .del:hover {
    background: var(--sr-hairline);
    color: var(--sr-ink);
  }
</style>
