<script lang="ts">
  /**
   * The big screen's frame for a class game (Games, 2 November 2026): how to
   * join (the director's permanent live code, its address and a QR code, the
   * same room as their poster), who has joined, the game's own stage in the
   * middle (the slot), and the board. Before the first round, the game's
   * setup: how many rounds (or endless) and Teams. Any name can be removed
   * with its ×: that device goes back to its made-up name (game-names.ts).
   * The game components hold the game; this shows the room and asks.
   */
  import { onDestroy, onMount } from "svelte";
  import { qrPath } from "../../lib/qr";
  import { players as fetchPlayers, type HostRoom } from "../../lib/games/host-room";
  import { isFinal, type BoardRow, type LiveGame } from "../../lib/games/live-game";
  import { nameKey, nameProblem } from "../../lib/games/game-names";
  import { teamStandings } from "../../lib/games/game-score";

  export let room: HostRoom;
  export let game: LiveGame | null = null;
  export let board: BoardRow[] = [];
  /** The board is shown between rounds, not while one plays. */
  export let showBoard = true;
  export let onEnd: () => void;
  /** The teacher removes a name. */
  export let onBlock: (name: string) => void = () => {};
  /** Setup, before the first round: rounds in the game (null endless) and teams (0 off). */
  export let total: number | null = 10;
  export let teamCount = 0;
  /** The players in the room now, by name, for the game to deal teams from. */
  export let joined: string[] = [];

  const ROUNDS: (number | null)[] = [3, 5, 10, 20, null];
  let timer: ReturnType<typeof setInterval> | null = null;
  let bigCode = false;
  const site = typeof location === "undefined" ? "" : location.host.replace(/^www\./, "");
  $: url = typeof location === "undefined" ? "" : `${location.origin}${room.path}`;
  $: qr = url ? qrPath(url) : null;
  $: setup = !game || game.number === 0;
  $: blocked = new Set(game?.blocked ?? []);
  /** A name the check flags is never shown, even if a device skipped the check. */
  $: shown = joined.filter((n) => !blocked.has(nameKey(n)));
  $: standings = game?.teams?.length ? teamStandings(board, game.teams) : [];
  $: final = !!game && isFinal(game);

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
      {#if game && game.number > 0}<p class="text-sm font-bold text-sr-ink-2">Round {game.number}{game.total ? ` of ${game.total}` : ""}</p>{/if}
    </div>
    <div class="text-right">
      <p class="font-display text-3xl font-bold tabular-nums" data-players={shown.length}>{shown.length}</p>
      <p class="text-xs font-bold text-sr-muted">{shown.length === 1 ? "player" : "players"}</p>
      <button type="button" class="sr-btn-quiet text-xs mt-1" on:click={onEnd}>End game</button>
    </div>
  </div>

  {#if setup}
    <div class="setup sr-panel">
      <div class="row" role="group" aria-label="Rounds">
        <span>Rounds</span>
        {#each ROUNDS as n}
          <button type="button" class="sr-tok text-sm" class:sr-on={total === n} aria-pressed={total === n} on:click={() => (total = n)}>{n ?? "Endless"}</button>
        {/each}
      </div>
      <div class="row" role="group" aria-label="Teams">
        <span>Teams</span>
        {#each [0, 2, 3, 4] as n}
          <button type="button" class="sr-tok text-sm" class:sr-on={teamCount === n} aria-pressed={teamCount === n} on:click={() => (teamCount = n)} data-teams={n}>{n === 0 ? "Off" : `${n} teams`}</button>
        {/each}
      </div>
      {#if teamCount}<p class="text-xs text-sr-muted">Everyone here when the first round starts is put on a team at random; anyone who joins later goes to the smallest.</p>{/if}
    </div>
  {/if}

  <slot />

  {#if showBoard}
    {#if final}<p class="final font-display">Final results</p>{/if}
    {#if standings.length}
      <ol class="teams" aria-label="Teams">
        {#each standings as t, i (t.id)}
          <li class="team team-{t.id}" class:top={i === 0}>
            <span class="font-display text-2xl font-bold">{t.name}</span>
            <span class="text-sm font-bold">{t.average} a player · {t.players} {t.players === 1 ? "player" : "players"}</span>
          </li>
        {/each}
      </ol>
    {/if}
    {#if board.length}
      <ol class="board sr-panel" aria-label="Leaderboard">
        {#each board.slice(0, final ? 20 : 10) as row, i (row.tag)}
          <li class:top={i === 0}>
            <span class="place">{i + 1}</span>
            <span class="who">{row.name}{#if row.team}<span class="dot team-{row.team}" aria-hidden="true"></span>{/if}</span>
            {#if row.last}<span class="last">+{row.last}</span>{/if}
            <span class="pts tabular-nums">{row.points}</span>
            <button type="button" class="x" on:click={() => onBlock(row.name)} aria-label="Remove the name {row.name}" title="Remove this name">×</button>
          </li>
        {/each}
      </ol>
    {/if}
    {#if setup || !board.length}
      <div class="names" aria-label="Players">
        {#each shown as name (name)}
          <span class="sr-tok name-chip">{nameProblem(name) ? "(a name)" : name}<button type="button" class="x" on:click={() => onBlock(name)} aria-label="Remove the name {name}" title="Remove this name" data-block={name}>×</button></span>
        {/each}
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
  .setup { padding: 0.8rem 1.2rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
  .row > span { font-weight: 800; font-size: 0.9rem; color: var(--sr-ink-2); min-width: 4.5rem; }
  .names { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
  .name-chip { display: inline-flex; align-items: center; gap: 0.3rem; }
  .x { border: none; background: none; color: var(--sr-muted); font-weight: 800; font-size: 1.1rem; line-height: 1; padding: 0 0.2rem; cursor: pointer; opacity: 0.5; }
  .x:hover, .x:focus-visible { opacity: 1; color: var(--sr-danger, #e5484d); }
  .final { text-align: center; font-size: 2.4rem; font-weight: 700; color: var(--sr-ink); }
  .teams { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.6rem; }
  .team { border-radius: 22px; padding: 0.8rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .team.top { box-shadow: 0 0 0 4px var(--sr-action); }
  .team-mint { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .team-peach { background: var(--sr-peach); color: var(--sr-peach-ink); }
  .team-butter { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .team-sky { background: var(--sr-sky); color: var(--sr-sky-ink); }
  .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 999px; margin-left: 0.5rem; vertical-align: middle; border: 1px solid rgba(0, 0, 0, 0.15); }
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
