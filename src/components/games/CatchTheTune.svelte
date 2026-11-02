<script lang="ts">
  /**
   * Catch the tune (Games, 2 November 2026; Octavo Academy's game, ported):
   * Pip gives the key (do mi so mi do, so below, do), then plays a tune of
   * five to eight notes; find each note on the board (TuneGrid), the first
   * given. The levels are Octavo's (tune-path.ts): steps on do re mi, then
   * so, la, below do, high do, fa, leaps.
   *
   * Two ways to play. On this device: fill the board, Check, fix the marked
   * ones (Blaine, 2 November 2026: a tap only writes the note in, and only
   * Check says what is right; there was an Each note mode that judged every
   * tap). A tap sounds its note, except while the tune plays, where a second
   * note on top confused. With your class (Pro to host): the big screen plays
   * the tune and shows the empty board; every student fills it in on their
   * own device at /live/<code> (LiveGame.svelte) and sends it; the board
   * then shows the tune, each note's share right and the points.
   */
  import { onDestroy } from "svelte";
  import PipFace from "../PipFace.svelte";
  import TuneGrid from "./TuneGrid.svelte";
  import TuneSetup from "./TuneSetup.svelte";
  import GameHost from "./GameHost.svelte";
  import { PATH_LEVELS, canMakeTune, makePath, nextFrom, stepsOf, sylOf, type PathLevel } from "../../lib/games/tune-path";
  import { playKeyAndTune, playStep } from "../../lib/games/game-audio";
  import { scoreTune, shareRight } from "../../lib/games/game-score";
  import { afterRound, blockName, teamsForStart } from "../../lib/games/host-game";
  import { answers as fetchAnswers, closeRoom, measureOffset, newRound, openRoom, players as fetchPlayers, publishGame, type HostRoom } from "../../lib/games/host-room";
  import { isFinal, type BoardRow, type LiveGame, type TuneAnswer } from "../../lib/games/live-game";

  /** Where do sits: middle C, so low so is G3 and high mi E5, in every voice's reach an octave either way. */
  const DO_MIDI = 60;
  /**
   * Seconds a note in the tune: 2 by default (Blaine, 2 November 2026: it was
   * 0.75, too quick to catch), set with the Speed slider, remembered here.
   */
  const GAP_KEY = "sr-catch-gap";
  let gap = (() => {
    try {
      const v = Number(localStorage.getItem(GAP_KEY));
      return v >= 0.5 && v <= 3 ? v : 2;
    } catch {
      return 2;
    }
  })();
  const saveGap = (v: number) => {
    try { localStorage.setItem(GAP_KEY, String(v)); } catch {}
  };
  $: saveGap(gap);

  let mode: "solo" | "class" = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("host") === "1" ? "class" : "solo";
  /** A level from the menu, or -1 for the teacher's own (TuneSetup), remembered in this browser. */
  let li = 0;
  const CUSTOM_KEY = "sr-catch-custom";
  let custom: PathLevel = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "null");
      if (saved?.notes?.length && Array.isArray(saved.length)) return saved as PathLevel;
    } catch {}
    return { ...PATH_LEVELS[2], name: "Custom" };
  })();
  const saveCustom = (l: PathLevel) => {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(l)); } catch {}
  };
  $: saveCustom(custom);
  // A new set of your own: a tune from it at once (solo), when one can be made.
  let lastCustom = "";
  $: if (li < 0 && mode === "solo" && JSON.stringify(custom) !== lastCustom) {
    lastCustom = JSON.stringify(custom);
    if (canMakeTune(custom)) fresh();
  }
  const levelNow = () => (li < 0 ? custom : PATH_LEVELS[li]);
  $: level = li < 0 ? custom : PATH_LEVELS[li];
  $: inPlay = stepsOf(level);
  $: usable = canMakeTune(level);

  // ── On this device ───────────────────────────────────────────────────
  let hints = true;
  let tune: number[] = makePath(PATH_LEVELS[0]);
  let chosen: (number | null)[] = [];
  /** After a Check, each column right or not; a column changed since is null until the next Check. */
  let marks: (boolean | null)[] | null = null;
  let reveal = false;
  let done = false;
  let heard = false;
  let said = "";
  let caught = 0;
  /** Checks that found a wrong note, and clean catches in a row. */
  let failedChecks = 0;
  let streak = 0;
  let stars = 0;
  let nowCol: number | null = null;
  let player: ReturnType<typeof playKeyAndTune> | null = null;
  let playing = false;

  function fresh() {
    stopSound();
    // levelNow(), not `level`: this first runs as the component starts, before `level` is set.
    tune = makePath(levelNow());
    chosen = tune.map((s, i) => (i === 0 ? s : null));
    marks = null;
    reveal = false;
    done = false;
    heard = false;
    said = "";
    failedChecks = 0;
    stars = 0;
  }
  fresh();
  const setLevel = (i: number) => {
    li = i;
    fresh();
  };

  $: at = chosen.findIndex((x) => x === null);
  $: filled = chosen.length > 0 && chosen.every((x) => x !== null);
  const reachable = (col: number): number[] | null => {
    if (!hints || col <= 0) return null;
    const before = chosen[col - 1];
    return before === null || before === undefined ? null : nextFrom(level, before);
  };

  function stopSound() {
    player?.stop();
    player = null;
    playing = false;
    nowCol = null;
  }
  onDestroy(stopSound);

  async function hear(withKey = true, steps = tune) {
    stopSound();
    heard = true;
    playing = true;
    const p = playKeyAndTune({ steps, doMidi: DO_MIDI, gap, withKey, onNote: (i) => (nowCol = i < 0 ? null : i) });
    player = p;
    await p.done;
    if (player === p) stopSound();
  }

  /** A tap writes the note in, anywhere on the board; nothing is judged until Check. */
  function tap(col: number, step: number) {
    if (!playing) playStep(step, DO_MIDI);
    if (done || col === 0) return;
    chosen = chosen.map((x, i) => (i === col ? step : x));
    if (marks) marks = marks.map((m, i) => (i === col ? null : m));
    said = "";
  }

  function checkAll() {
    marks = chosen.map((x, i) => x === tune[i]);
    const right = marks.filter(Boolean).length - 1;
    const of = tune.length - 1;
    if (right === of) return finish(failedChecks === 0);
    failedChecks++;
    said = `${right} of ${of} right. Fix the marked notes, or show the tune.`;
  }
  /** Stars for a catch: three with no wrong note, two with one or two, one after more. */
  function finish(clean: boolean) {
    done = true;
    caught++;
    stars = clean ? 3 : failedChecks <= 2 ? 2 : 1;
    streak = clean ? streak + 1 : 0;
    said = "";
    setTimeout(() => void hear(false), 500);
  }
  function showTune() {
    reveal = true;
    done = true;
    streak = 0;
    marks = chosen.map((x, i) => x === tune[i]);
  }

  // ── With the class ───────────────────────────────────────────────────
  let room: HostRoom | null = null;
  let hostProblem = "";
  let upgrade = false;
  let signIn = false;
  let opening = false;
  let offset = 0;
  let game: LiveGame | null = null;
  let board: BoardRow[] = [];
  let hostTune: number[] = [];
  let answerCount = 0;
  let joinedCount = 0;
  let share: number[] | null = null;
  let answeringFrom = 0;
  let secondsLeft = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Setup (GameHost): rounds in the game, null endless; teams, 0 off; who is in the room. */
  let total: number | null = 10;
  let teamCount = 0;
  let joined: string[] = [];
  /** Each device's made-up name by tag, from the answers: where a removed name goes. */
  const fallbacks = new Map<string, string>();

  async function host() {
    opening = true;
    hostProblem = "";
    const r = await openRoom();
    opening = false;
    if ("problem" in r) {
      hostProblem = r.problem;
      upgrade = !!r.upgrade;
      signIn = !!r.signIn;
      return;
    }
    room = r.room;
    offset = await measureOffset();
    await newGame();
  }

  /** A new game in the room: the board cleared, setup open again (the room's answers are cleared too). */
  async function newGame() {
    if (!room) return;
    stopPoll();
    board = [];
    share = null;
    game = { kind: "tune", round: newRound(), number: 0, phase: "lobby", board, total, blocked: game?.blocked };
    await publishGame(room.code, game);
  }

  async function block(name: string) {
    if (!room || !game) return;
    const out = blockName(game, board, name, fallbacks);
    board = out.board;
    game = { ...game, blocked: out.blocked, teams: out.teams ?? game.teams, board };
    await publishGame(room.code, game);
  }

  const serverNow = () => Date.now() + offset;
  const limitFor = (n: number) => (20 + 3 * n) * 1000;

  async function startRound() {
    if (!room || !game) return;
    stopPoll();
    share = null;
    answerCount = 0;
    hostTune = makePath(levelNow());
    const teams = game.number === 0 ? teamsForStart(game, joined, teamCount) : game.teams;
    game = {
      kind: "tune",
      round: newRound(),
      number: game.number + 1,
      phase: "playing",
      tune: { steps: inPlay, length: hostTune.length, first: hostTune[0], answerBy: null },
      board,
      total: game.number === 0 ? total : game.total,
      blocked: game.blocked,
      teams,
    };
    await publishGame(room.code, game);
    await hear(true, hostTune);
    answeringFrom = serverNow();
    game = { ...game, phase: "answering", tune: { ...game.tune!, answerBy: answeringFrom + limitFor(hostTune.length) } };
    await publishGame(room.code, game);
    pollTimer = setInterval(pollAnswers, 1000);
  }

  async function pollAnswers() {
    if (!room || !game?.tune?.answerBy) return;
    secondsLeft = Math.max(0, Math.ceil((game.tune.answerBy - serverNow()) / 1000));
    const [got, joined] = await Promise.all([fetchAnswers(room.code, game.round), fetchPlayers(room.code)]);
    answerCount = got.length;
    joinedCount = joined.length;
    if (secondsLeft <= 0 || (got.length > 0 && got.length >= joined.length)) await revealRound();
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function revealRound() {
    if (!room || !game || game.phase !== "answering") return;
    stopPoll();
    stopSound();
    const got = await fetchAnswers(room.code, game.round);
    const limit = (game.tune?.answerBy ?? answeringFrom) - answeringFrom;
    const scored = got.map((a) => {
      const ans = a.answer as TuneAnswer;
      fallbacks.set(a.tag, a.fallback);
      return { tag: a.tag, name: a.name, fallback: a.fallback, notes: ans.notes, points: scoreTune(ans.notes, hostTune, ans.ms, limit).points };
    });
    share = shareRight(scored.map((s) => s.notes), hostTune);
    const out = afterRound(game, board, scored);
    board = out.board;
    game = { ...game, phase: "results", tune: { ...game.tune!, tune: hostTune }, board, teams: out.teams ?? game.teams };
    await publishGame(room.code, game);
  }

  // For the end-to-end check (scripts/check-games.ts). Development builds only.
  if (import.meta.env.DEV && typeof window !== "undefined")
    (window as any).__catchGame = {
      get game() { return game; },
      get hostTune() { return hostTune; },
      get board() { return board; },
      get tune() { return tune; },
    };

  async function endGame() {
    stopPoll();
    stopSound();
    if (room) await closeRoom(room.code);
    room = null;
    game = null;
    mode = "solo";
  }
  onDestroy(stopPoll);
</script>

<div class="catch">
  <div class="tabs" role="tablist" aria-label="How to play">
    <button role="tab" class="sr-tok" class:sr-on={mode === "solo"} aria-selected={mode === "solo"} on:click={() => (room ? null : (mode = "solo"))} disabled={!!room}>On this device</button>
    <button role="tab" class="sr-tok" class:sr-on={mode === "class"} aria-selected={mode === "class"} on:click={() => (mode = "class")}>With your class</button>
  </div>

  <div class="settings">
    <label class="set">
      <span>Notes</span>
      <select class="sr-select" value={li} on:change={(e) => setLevel(Number(e.currentTarget.value))} disabled={game?.phase === "playing" || game?.phase === "answering"} data-tune-level>
        {#each PATH_LEVELS as l, i (l.name)}<option value={i}>{l.name}: {l.notes.join(" ")}</option>{/each}
        <option value={-1}>Custom</option>
      </select>
    </label>
    <label class="set speed">
      <span>Speed</span>
      <span class="pace" aria-hidden="true" title="Slower">🐢</span>
      <input type="range" class="sr-range" min="0.5" max="3" step="0.25" bind:value={gap} aria-label="Speed" aria-valuetext="{gap} seconds a note" title="{gap} s a note" data-tune-speed />
      <span class="pace" aria-hidden="true" title="Faster">🐇</span>
    </label>
    {#if mode === "solo"}
      <label class="flex items-center gap-2 text-sm font-bold text-sr-ink-2"><input type="checkbox" class="sr-check h-4 w-4" bind:checked={hints} /> Hints</label>
    {/if}
  </div>

  {#if li < 0 && !(game && (game.phase === "playing" || game.phase === "answering"))}
    <TuneSetup bind:level={custom} />
  {/if}

  {#if mode === "solo"}
    {#if done && !reveal}
      <div class="win" role="status" data-tune-win={stars}>
        <div class="confetti" aria-hidden="true">{#each Array(18) as _, i}<i style="--i: {i}"></i>{/each}</div>
        <PipFace class="w-20 h-20 win-pip" />
        <p class="win-title font-display">{stars === 3 ? "Perfect catch!" : "You caught it!"}</p>
        <div class="stars" aria-label="{stars} of 3 stars">
          {#each [1, 2, 3] as n}<svg viewBox="0 0 24 24" class:lit={n <= stars} style="--d: {n * 120}ms" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>{/each}
        </div>
        <div class="win-stats">
          <span class="sr-tok">{stars === 3 ? "Right first check" : `${failedChecks} ${failedChecks === 1 ? "check" : "checks"} to fix`}</span>
          {#if streak > 1}<span class="sr-tok streak">{streak} perfect in a row</span>{/if}
          <span class="sr-tok">{caught} {caught === 1 ? "tune" : "tunes"} caught</span>
        </div>
        <div class="flex flex-wrap gap-2 justify-center">
          <button class="sr-btn px-8 py-3 text-lg" on:click={fresh} data-tune-next>Next tune</button>
          <button class="sr-btn-quiet" on:click={() => (playing ? stopSound() : hear(false))}>{playing ? "Stop" : "Hear it again"}</button>
        </div>
      </div>
    {:else}
    <div class="head">
      <PipFace class="w-12 h-12 shrink-0" />
      <p>
        {#if done}Here is the tune.{:else}Hear the key, then {tune.length} notes. It starts on <b>{sylOf(tune[0])}</b>.{/if}
        {#if hints && !done}<span class="block text-sm text-sr-muted">It moves by {level.moves}.</span>{/if}
      </p>
      {#if caught}<span class="caught" aria-label="Tunes caught">{caught}</span>{/if}
    </div>
    <div class="flex flex-wrap gap-2 justify-center">
      <button class="sr-btn" on:click={() => (playing ? stopSound() : hear(true))}>{playing ? "Stop" : heard ? "Hear it again" : "Hear the tune"}</button>
      {#if !done}<button class="sr-btn-quiet" on:click={checkAll} disabled={!filled} data-tune-check>Check</button>{/if}
      {#if !done && marks}<button class="sr-btn-quiet" on:click={showTune}>Show the tune</button>{/if}
      {#if done}<button class="sr-btn" on:click={fresh}>New tune</button>{/if}
    </div>
    {/if}
    <TuneGrid steps={inPlay} length={tune.length} first={tune[0]} {chosen} {marks} answer={reveal ? tune : null} at={done ? -1 : at} {nowCol} {reachable} disabled={done} ontap={tap} />
    <p class="said" aria-live="polite">{said}</p>
  {:else if !room}
    <div class="sr-panel p-6 flex flex-col items-center gap-3 text-center">
      <PipFace class="w-14 h-14" />
      <p class="font-display text-2xl font-bold">Play it with your class</p>
      <p class="text-sr-ink-2 max-w-md">The big screen plays the tune. Everyone fills in the board on their own phone, tablet or laptop at your live code, and the board shows who caught it.</p>
      <button class="sr-btn px-6" on:click={host} disabled={opening}>{opening ? "Opening your room…" : "Open my room"}</button>
      {#if hostProblem}
        <p class="text-sm text-sr-danger" role="alert">{hostProblem}</p>
        {#if upgrade}<a class="sr-btn-quiet" href="/pricing">See Pro</a>{/if}
        {#if signIn}<a class="sr-btn-quiet" href="/login?next={encodeURIComponent('/games/catch-the-tune?host=1')}">Sign in</a>{/if}
      {/if}
    </div>
  {:else}
    <GameHost {room} {game} {board} showBoard={game?.phase !== "playing" && game?.phase !== "answering"} onEnd={endGame} onBlock={block} bind:total bind:teamCount bind:joined>
      <div class="sr-panel stage">
        {#if !game || game.phase === "lobby"}
          <p class="font-display text-2xl font-bold text-center">Ready when everyone has joined</p>
          <div class="flex justify-center"><button class="sr-btn px-8 py-3 text-lg" on:click={startRound} disabled={!usable} data-game-start>Play a tune</button></div>
        {:else}
          <div class="head">
            <PipFace class="w-12 h-12 shrink-0" />
            <p class="text-lg">
              {#if game.phase === "playing"}Listen: the key, then {hostTune.length} notes. It starts on <b>{sylOf(hostTune[0])}</b>.
              {:else if game.phase === "answering"}Fill it in on your device. <b class="tabular-nums" data-answered={answerCount}>{answerCount}</b> of {joinedCount} sent · {secondsLeft}s
              {:else}Here is the tune.{/if}
            </p>
          </div>
          <TuneGrid steps={game.tune?.steps ?? inPlay} length={hostTune.length} first={hostTune[0]} chosen={game.phase === "results" ? hostTune : []} answer={null} {share} {nowCol} disabled />
          <div class="flex flex-wrap gap-2 justify-center">
            {#if game.phase === "answering"}
              <button class="sr-btn-quiet" on:click={() => hear(false, hostTune)}>{playing ? "Playing…" : "Hear it again"}</button>
              <button class="sr-btn" on:click={revealRound} data-game-reveal>Show the tune</button>
            {:else if game.phase === "results"}
              <button class="sr-btn-quiet" on:click={() => hear(false, hostTune)}>Hear it</button>
              {#if isFinal(game)}
                <button class="sr-btn px-6" on:click={newGame} data-game-new>Play again</button>
              {:else}
                <button class="sr-btn px-6" on:click={startRound} disabled={!usable} data-game-start>Next tune</button>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </GameHost>
  {/if}
</div>

<style>
  .catch { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
  .tabs { display: flex; gap: 0.5rem; justify-content: center; }
  .settings { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: center; justify-content: center; }
  .set { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.9rem; color: var(--sr-ink-2); }
  .speed input { width: 7.5rem; direction: rtl; }
  .speed .pace { font-size: 1.3rem; line-height: 1; }
  .set select { border-radius: 999px; padding: 0.4rem 0.9rem; border: 1px solid var(--sr-hairline); background: var(--sr-raise); color: var(--sr-ink); }
  .head { display: flex; align-items: center; gap: 0.8rem; justify-content: center; }
  /* The catch (Blaine, 2 November 2026: a better success screen than a line of text). */
  .win { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.4rem 1rem 1.2rem; border-radius: 28px; background: var(--sr-mint); color: var(--sr-mint-ink); text-align: center; animation: win-in 360ms cubic-bezier(.2, 1.4, .4, 1); }
  .win :global(.win-pip) { animation: win-hop 700ms ease-out 2; }
  .win-title { font-size: clamp(1.8rem, 5vw, 2.6rem); font-weight: 700; line-height: 1.1; }
  .stars { display: flex; gap: 0.4rem; }
  .stars svg { width: 2.6rem; height: 2.6rem; fill: color-mix(in srgb, var(--sr-mint-ink) 18%, transparent); }
  .stars svg.lit { fill: var(--sr-butter); stroke: var(--sr-butter-ink); stroke-width: 1.4; stroke-linejoin: round; animation: star-pop 420ms cubic-bezier(.2, 1.6, .4, 1) both; animation-delay: var(--d); }
  .win-stats { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center; }
  .win-stats .sr-tok { background: var(--sr-raise); font-size: 0.85rem; }
  .win-stats .streak { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .confetti { position: absolute; inset: 0; pointer-events: none; }
  .confetti i { position: absolute; top: -10%; left: calc(var(--i) * 5.5% + 2%); width: 9px; height: 14px; border-radius: 3px; opacity: 0; animation: fall 1.6s ease-in calc(var(--i) * 45ms) 1 forwards; }
  .confetti i:nth-child(4n) { background: var(--sr-peach-ink); }
  .confetti i:nth-child(4n + 1) { background: var(--sr-action); }
  .confetti i:nth-child(4n + 2) { background: var(--sr-butter-ink); }
  .confetti i:nth-child(4n + 3) { background: var(--sr-sky-ink); }
  @keyframes win-in { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes win-hop { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-18%) rotate(-6deg); } }
  @keyframes star-pop { from { transform: scale(0) rotate(-40deg); } to { transform: scale(1) rotate(0); } }
  @keyframes fall { 0% { opacity: 1; transform: translateY(0) rotate(0); } 100% { opacity: 0; transform: translateY(26rem) rotate(calc(var(--i) * 47deg + 200deg)); } }
  @media (prefers-reduced-motion: reduce) { .win, .win :global(.win-pip), .stars svg.lit, .confetti i { animation: none; } .confetti { display: none; } }
  .caught { font-family: var(--font-display, inherit); font-weight: 700; background: var(--sr-mint); color: var(--sr-mint-ink); border-radius: 999px; padding: 0.2rem 0.8rem; }
  .said { min-height: 1.5rem; text-align: center; font-weight: 700; color: var(--sr-ink-2); }
  .stage { padding: 1.2rem; display: flex; flex-direction: column; gap: 1rem; }
</style>
