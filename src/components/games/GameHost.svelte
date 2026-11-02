<script lang="ts">
  /**
   * The big screen's frame for a class game (Games, 2 November 2026): how to
   * join (the director's permanent live code, its address and a QR code, the
   * same room as their poster), who has joined, the game's own stage in the
   * middle (the slot), and the board. The game components hold the game;
   * this only shows the room.
   */
  import { onDestroy, onMount } from "svelte";
  import { qrPath } from "../../lib/qr";
  import { players as fetchPlayers, type HostRoom } from "../../lib/games/host-room";
  import type { BoardRow } from "../../lib/games/live-game";

  export let room: HostRoom;
  export let board: BoardRow[] = [];
  /** The board is shown big (between rounds) or not at all (while a round plays). */
  export let showBoard = true;
  export let onEnd: () => void;

  let joined: string[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let bigCode = false;
  const site = typeof location === "undefined" ? "" : location.host.replace(/^www\./, "");
  $: url = typeof location === "undefined" ? "" : `${location.origin}${room.path}`;
  $: qr = url ? qrPath(url) : null;

  async function refresh() {
    joined = await fetchPlayers(room.code);
  }
  onMount(() => {
    void refresh();
    timer = setInterval(refresh, 3000);
  });
  onDestroy(() => timer && clearInterval(timer));
</script>

<div class="host">
  <div class="join sr-panel">
    {#if qr}
      <button type="button" class="qr" on:click={() => (bigCode = true)} aria-label="Show the code big">
        <svg viewBox="0 0 {qr.size} {qr.size}" shape-rendering="crispEdges" role="img" aria-label="QR code for {url}"><path d={qr.path} /></svg>
      </button>
    {/if}
    <div class="flex-1 min-w-0">
      <p class="text-sm font-bold text-sr-muted">Join on your device at <b class="text-sr-ink">{site}/live</b></p>
      <p class="code font-display">{room.display}</p>
    </div>
    <div class="text-right">
      <p class="font-display text-3xl font-bold tabular-nums" data-players={joined.length}>{joined.length}</p>
      <p class="text-xs font-bold text-sr-muted">{joined.length === 1 ? "player" : "players"}</p>
      <button type="button" class="sr-btn-quiet text-xs mt-1" on:click={onEnd}>End game</button>
    </div>
  </div>

  <slot />

  {#if showBoard}
    {#if board.length}
      <ol class="board sr-panel" aria-label="Leaderboard">
        {#each board.slice(0, 10) as row, i (row.tag)}
          <li class:top={i === 0}>
            <span class="place">{i + 1}</span>
            <span class="who">{row.name}</span>
            {#if row.last}<span class="last">+{row.last}</span>{/if}
            <span class="pts tabular-nums">{row.points}</span>
          </li>
        {/each}
      </ol>
    {:else if joined.length}
      <div class="names" aria-label="Players">
        {#each joined as name (name)}<span class="sr-tok">{name}</span>{/each}
      </div>
    {/if}
  {/if}
</div>

{#if bigCode && qr}
  <button type="button" class="big" on:click={() => (bigCode = false)} aria-label="Close">
    <svg viewBox="0 0 {qr.size} {qr.size}" shape-rendering="crispEdges"><path d={qr.path} /></svg>
    <span class="font-display">{site}/live</span>
    <span class="font-display bigcode">{room.display}</span>
  </button>
{/if}

<style>
  .host { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
  .join { display: flex; align-items: center; gap: 1rem; padding: 0.9rem 1.2rem; }
  .qr { width: 5.5rem; height: 5.5rem; flex-shrink: 0; background: #fff; border-radius: 12px; padding: 4px; }
  .qr svg, .big svg { width: 100%; height: 100%; fill: #15213a; }
  .code { font-size: clamp(2rem, 6vw, 3.6rem); font-weight: 700; letter-spacing: 0.06em; line-height: 1.05; color: var(--sr-ink); }
  .names { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
  .board { list-style: none; margin: 0; padding: 0.6rem 0.9rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .board li { display: flex; align-items: center; gap: 0.8rem; padding: 0.45rem 0.6rem; border-radius: 14px; font-size: 1.15rem; }
  .board li.top { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .place { width: 1.8rem; font-weight: 800; color: var(--sr-muted); }
  .top .place { color: inherit; }
  .who { flex: 1; font-weight: 800; }
  .last { font-size: 0.85rem; font-weight: 800; color: var(--sr-action-fg); }
  .pts { font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.4rem; min-width: 3.5rem; text-align: right; }
  .big {
    position: fixed; inset: 0; z-index: 80; background: var(--sr-raise);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem;
  }
  .big svg { width: min(60vh, 80vw); height: min(60vh, 80vw); }
  .big span { font-size: 2rem; font-weight: 700; color: var(--sr-ink); }
  .big .bigcode { font-size: clamp(3rem, 10vw, 7rem); letter-spacing: 0.08em; }
</style>
