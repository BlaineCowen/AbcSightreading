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
  import KeyStrip from "./KeyStrip.svelte";
  import { Check, Eye, Flame, Music, Play, RotateCcw, SkipForward, Square, Target, X } from "lucide-svelte";
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
  /** The slider runs slow to fast, left to right, and fills from the left (Blaine, 4 November 2026): it holds 3.5 minus the seconds a note. */
  $: pace = 3.5 - gap;
  $: paceFill = ((pace - 0.5) / 2.5) * 100;

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
  /** Squares a Check found wrong ("col:step"): they stay red and cannot be picked again. */
  let ruled: string[] = [];
  let caught = 0;
  /** Checks that found a wrong note, and clean catches in a row. */
  let failedChecks = 0;
  let streak = 0;
  let stars = 0;
  let nowCol: number | null = null;
  /** The note of the key sounding (-1 the chord), null when it is not (KeyStrip). */
  let keyAt: number | null = null;
  let player: ReturnType<typeof playKeyAndTune> | null = null;
  let playing = false;

  function fresh() {
    stopSound();
    // levelNow(), not `level`: this first runs as the component starts, before `level` is set.
    tune = makePath(levelNow());
    chosen = tune.map((s, i) => (i === 0 ? s : null));
    marks = null;
    ruled = [];
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
    keyAt = null;
  }
  onDestroy(stopSound);

  async function hear(withKey = true, steps = tune) {
    stopSound();
    heard = true;
    playing = true;
    const p = playKeyAndTune({ steps, doMidi: DO_MIDI, gap, withKey, onNote: (i) => (nowCol = i < 0 ? null : i), onKey: (k) => (keyAt = k) });
    player = p;
    await p.done;
    if (player === p) stopSound();
  }

  /**
   * A tap writes the note in, anywhere on the board; nothing is judged until
   * Check. A tap on a note already written takes it off again (Blaine,
   * 4 November 2026), silently.
   */
  function tap(col: number, step: number) {
    if (done || col === 0) {
      if (!playing) playStep(step, DO_MIDI);
      return;
    }
    const off = chosen[col] === step;
    if (!playing && !off) playStep(step, DO_MIDI);
    chosen = chosen.map((x, i) => (i === col ? (off ? null : step) : x));
    if (marks) marks = marks.map((m, i) => (i === col ? null : m));
    said = "";
  }

  function checkAll() {
    marks = chosen.map((x, i) => x === tune[i]);
    // Each wrong note is ruled out and its column emptied, to be filled again.
    ruled = [...ruled, ...chosen.flatMap((x, i) => (marks![i] === false && x !== null ? [`${i}:${x}`] : []))];
    const wrongCols = marks.map((m, i) => (m === false ? i : -1)).filter((i) => i >= 0);
    chosen = chosen.map((x, i) => (wrongCols.includes(i) ? null : x));
    marks = marks.map((m) => (m === false ? null : m));
    const right = marks.filter(Boolean).length - 1;
    const of = tune.length - 1;
    if (right === of) return finish(failedChecks === 0);
    failedChecks++;
    said = `${right} of ${of} right`;
  }
  /** Stars for a catch: three with no wrong note, two with one or two, one after more. */
  function finish(clean: boolean) {
    done = true;
    caught++;
    stars = clean ? 3 : failedChecks <= 2 ? 2 : 1;
    streak = clean ? streak + 1 : 0;
    said = "";
    // The tune plays again only if the student asks (Blaine, 4 November 2026).
    winOpen = true;
  }
  /** The catch pop-up is up; closing it leaves the board, the tune caught, and New tune. */
  let winOpen = false;
  $: if (!done) winOpen = false;
  let nextBtn: HTMLButtonElement | null = null;
  /** Confetti pieces, scattered anew for each three-star catch: where, how fast, which way they drift and spin. */
  let bits: string[] = [];
  $: if (winOpen && stars === 3)
    bits = Array.from({ length: 70 }, () => {
      const r = Math.random;
      return `--x:${(r() * 100).toFixed(1)}%;--y:${(-5 - r() * 25).toFixed(0)}vh;--dx:${((r() - 0.5) * 30).toFixed(0)}vw;--dur:${(1.8 + r() * 1.6).toFixed(2)}s;--delay:${(r() * 0.6).toFixed(2)}s;--spin:${Math.round((r() - 0.5) * 1440)}deg;--w:${(7 + r() * 7).toFixed(0)}px;--h:${(10 + r() * 10).toFixed(0)}px`;
    });
  $: if (winOpen && nextBtn) nextBtn.focus({ preventScroll: true });
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
      <input type="range" class="fill-range" min="0.5" max="3" step="0.25" value={pace} on:input={(e) => (gap = 3.5 - Number(e.currentTarget.value))} style="--p: {paceFill}%" aria-label="Speed" aria-valuetext="{gap} seconds a note" title="{gap} s a note" data-tune-speed />
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
    {#if winOpen}
      <!-- The catch: a pop-up over the page, so nothing scrolls (Blaine, 4 November 2026). Confetti for three stars only. -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div class="win-back" on:click|self={() => (winOpen = false)}>
        {#if stars === 3}<div class="confetti" aria-hidden="true" data-confetti>{#each bits as s}<i style={s}></i>{/each}</div>{/if}
        <div class="win" role="dialog" aria-modal="true" aria-labelledby="win-title" data-tune-win={stars} on:keydown={(e) => e.key === "Escape" && (winOpen = false)}>
          <button type="button" class="win-x" on:click={() => (winOpen = false)} aria-label="Close and look at the board"><X size={22} aria-hidden="true" /></button>
          <PipFace class="w-24 h-24 win-pip" />
          <p id="win-title" class="win-title font-display">{stars === 3 ? "Perfect catch!" : "You caught it!"}</p>
          <div class="stars" aria-label="{stars} of 3 stars">
            {#each [1, 2, 3] as n}<svg viewBox="0 0 24 24" class:lit={n <= stars} style="--d: {n * 140}ms" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>{/each}
          </div>
          <!-- Plain lines, not pills: they are facts, not buttons (Blaine, 4 November 2026). -->
          <ul class="win-stats">
            <li><Target size={18} aria-hidden="true" /> {stars === 3 ? "Right on the first check" : `${failedChecks} ${failedChecks === 1 ? "check" : "checks"} to fix it`}</li>
            {#if streak > 1}<li class="streak"><Flame size={18} aria-hidden="true" /> {streak} perfect in a row</li>{/if}
            <li><Music size={18} aria-hidden="true" /> {caught} {caught === 1 ? "tune" : "tunes"} caught</li>
          </ul>
          <div class="flex flex-wrap gap-2 justify-center">
            <button class="sr-btn big" bind:this={nextBtn} on:click={fresh} data-tune-next><SkipForward size={22} aria-hidden="true" /> Next tune</button>
            <button class="sr-btn-quiet big" on:click={() => (playing ? stopSound() : hear(false))}>{#if playing}<Square size={22} aria-hidden="true" /> Stop{:else}<Play size={22} aria-hidden="true" /> Hear it again{/if}</button>
          </div>
        </div>
      </div>
    {/if}
    <div class="head">
      <PipFace class="w-12 h-12 shrink-0" />
      <p>
        {#if done && !reveal}You caught it!{:else if done}Here is the tune.{:else}Hear the key, then {tune.length} notes. It starts on <b>{sylOf(tune[0])}</b>.{/if}
        {#if hints && !done}<span class="block text-sm text-sr-muted">It moves by {level.moves}.</span>{/if}
      </p>
      {#if caught}<span class="caught" aria-label="Tunes caught">{caught}</span>{/if}
    </div>
    <div class="boardwrap">
      <TuneGrid steps={inPlay} length={tune.length} first={tune[0]} {chosen} {marks} {ruled} answer={reveal ? tune : null} at={done ? -1 : at} {nowCol} {reachable} disabled={done} ontap={tap} />
      <KeyStrip at={keyAt} tune={nowCol === 0} />
      {#if said}
        <!-- The Check's result, floating over the board (Blaine, 4 November 2026); any tap closes it. -->
        <div class="checkcard" role="alertdialog" aria-labelledby="cc-title" data-tune-said>
          <span id="cc-title" class="cc-title font-display">{said}</span>
          <span class="cc-body">The red squares are ruled out. Fill those notes in again, or show the tune.</span>
          <button type="button" class="sr-btn big cc-ok" on:click={() => (said = "")} data-tune-said-ok><Check size={22} aria-hidden="true" /> Got it</button>
        </div>
      {/if}
    </div>
    {#if hints && !done}
      <!-- Held in place while it has nothing to show, so the buttons under it do not jump. -->
      <p class="legend" aria-hidden="true" style:visibility={at > 0 && chosen[at - 1] !== null ? "visible" : "hidden"}>
        <span><i class="sw can"></i> Can come next</span>
        <span><i class="sw cant"></i> Too far from the last note</span>
        {#if ruled.length}<span><i class="sw out">✕</i> Ruled out by Check</span>{/if}
      </p>
    {/if}
    <!-- Under the board, big, with icons (Blaine, 4 November 2026: above it they were out of a short student's reach on a wall screen). -->
    <div class="controls">
        <button class="sr-btn big" on:click={() => (playing ? stopSound() : hear(true))} data-tune-hear>
          {#if playing}<Square size={22} aria-hidden="true" /> Stop{:else if heard}<RotateCcw size={22} aria-hidden="true" /> Hear it again{:else}<Play size={22} aria-hidden="true" /> Hear the tune{/if}
        </button>
        {#if !done}<button class="sr-btn big check" on:click={checkAll} disabled={!filled} data-tune-check><Check size={22} aria-hidden="true" /> Check</button>{/if}
        {#if !done && marks}<button class="sr-btn-quiet big" on:click={showTune}><Eye size={22} aria-hidden="true" /> Show the tune</button>{/if}
        {#if done}<button class="sr-btn big" on:click={fresh}><SkipForward size={22} aria-hidden="true" /> New tune</button>{/if}
      </div>
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
          <div class="boardwrap">
            <TuneGrid steps={game.tune?.steps ?? inPlay} length={hostTune.length} first={hostTune[0]} chosen={game.phase === "results" ? hostTune : []} answer={null} {share} {nowCol} disabled />
            <KeyStrip at={keyAt} tune={nowCol === 0} />
          </div>
          <div class="flex flex-wrap gap-2 justify-center">
            {#if game.phase === "answering"}
              <button class="sr-btn-quiet big" on:click={() => hear(false, hostTune)}><RotateCcw size={22} aria-hidden="true" /> {playing ? "Playing…" : "Hear it again"}</button>
              <button class="sr-btn big" on:click={revealRound} data-game-reveal><Eye size={22} aria-hidden="true" /> Show the tune</button>
            {:else if game.phase === "results"}
              <button class="sr-btn-quiet big" on:click={() => hear(false, hostTune)}><Play size={22} aria-hidden="true" /> Hear it</button>
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
  .speed input { width: 7.5rem; }
  /* Filled from the left up to the thumb, in every browser (Safari's own range shows no fill). */
  .fill-range { -webkit-appearance: none; appearance: none; height: 10px; border-radius: 999px; background: linear-gradient(to right, var(--sr-action) var(--p), var(--sr-track) var(--p)); cursor: pointer; }
  .fill-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--sr-raise); border: 3px solid var(--sr-action); box-shadow: 0 1px 3px color-mix(in srgb, var(--sr-ink) 25%, transparent); }
  .fill-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--sr-raise); border: 3px solid var(--sr-action); }
  .fill-range::-moz-range-track { background: transparent; }
  .fill-range:focus-visible { outline: 3px solid var(--sr-action); outline-offset: 3px; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }
  .big { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 56px; padding: 0.8rem 1.6rem; font-size: 1.15rem; }
  .big.check { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .big.check:hover:not(:disabled) { background: color-mix(in srgb, var(--sr-mint) 80%, var(--sr-mint-ink)); }
  .speed .pace { font-size: 1.3rem; line-height: 1; }
  .set select { border-radius: 999px; padding: 0.4rem 0.9rem; border: 1px solid var(--sr-hairline); background: var(--sr-raise); color: var(--sr-ink); }
  .head { display: flex; align-items: center; gap: 0.8rem; justify-content: center; }
  /* The catch (Blaine, 2 November 2026: a better success screen than a line of text). */
  .win-back { position: fixed; inset: 0; z-index: 60; overflow: hidden; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, var(--sr-ink) 35%, transparent); animation: fade 200ms ease; }
  .win { position: relative; overflow: hidden; width: min(26rem, 100%); display: flex; flex-direction: column; align-items: center; gap: 0.7rem; padding: 1.8rem 1.2rem 1.4rem; border-radius: 32px; background: var(--sr-mint); color: var(--sr-mint-ink); text-align: center; box-shadow: 0 24px 60px color-mix(in srgb, var(--sr-ink) 35%, transparent); animation: win-in 420ms cubic-bezier(.2, 1.5, .4, 1); }
  .win-x { position: absolute; top: 0.7rem; right: 0.7rem; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 999px; border: 0; background: transparent; color: var(--sr-mint-ink); z-index: 2; }
  .win-x:hover { background: color-mix(in srgb, var(--sr-mint-ink) 10%, transparent); }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  .win :global(.win-pip) { animation: win-hop 700ms ease-out 2; }
  .win-title { font-size: clamp(2rem, 6vw, 2.8rem); font-weight: 700; line-height: 1.1; }
  .stars { display: flex; gap: 0.4rem; }
  .stars svg { width: 2.6rem; height: 2.6rem; fill: color-mix(in srgb, var(--sr-mint-ink) 18%, transparent); }
  .stars svg.lit { fill: var(--sr-butter); stroke: var(--sr-butter-ink); stroke-width: 1.4; stroke-linejoin: round; animation: star-pop 420ms cubic-bezier(.2, 1.6, .4, 1) both; animation-delay: var(--d); }
  .win-stats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; font-weight: 700; font-size: 0.95rem; }
  .win-stats li { display: inline-flex; align-items: center; gap: 0.4rem; }
  .win-stats .streak { color: var(--sr-peach-ink); }
  .confetti { position: absolute; inset: 0; pointer-events: none; }
  /* Three stars: confetti over the whole screen, behind the card. */
  .confetti i { position: absolute; top: var(--y); left: var(--x); width: var(--w); height: var(--h); border-radius: 3px; opacity: 0; animation: fall var(--dur) cubic-bezier(.25, .2, .55, 1) var(--delay) 1 forwards; }
  .confetti i:nth-child(5n) { background: var(--sr-butter); }
  .confetti i:nth-child(5n + 1) { background: var(--sr-action); }
  .confetti i:nth-child(5n + 2) { background: var(--sr-peach); }
  .confetti i:nth-child(5n + 3) { background: var(--sr-mint); }
  .confetti i:nth-child(5n + 4) { background: var(--sr-raise); }
  @keyframes win-in { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes win-hop { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-18%) rotate(-6deg); } }
  @keyframes star-pop { from { transform: scale(0) rotate(-40deg); } to { transform: scale(1) rotate(0); } }
  @keyframes fall { 0% { opacity: 1; transform: translate(0, 0) rotate(0); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), 125vh) rotate(var(--spin)); } }
  @media (prefers-reduced-motion: reduce) { .win-back, .win, .win :global(.win-pip), .stars svg.lit, .confetti i { animation: none; } .confetti { display: none; } }
  .caught { font-family: var(--font-display, inherit); font-weight: 700; background: var(--sr-mint); color: var(--sr-mint-ink); border-radius: 999px; padding: 0.2rem 0.8rem; }
  .boardwrap { position: relative; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; justify-content: center; font-size: 0.85rem; font-weight: 700; color: var(--sr-ink-2); margin: -0.25rem 0 0; }
  .legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
  .sw { display: inline-grid; place-items: center; width: 1.6rem; height: 1.1rem; border-radius: 5px; font-style: normal; font-size: 0.7rem; font-weight: 900; }
  .sw.can { border: 3px solid var(--sr-action); background: color-mix(in srgb, var(--sr-action) 30%, var(--sr-raise)); }
  .sw.cant { border: 2px dashed color-mix(in srgb, var(--sr-muted) 60%, transparent); background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--sr-muted) 28%, var(--sr-raise)) 0 4px, var(--sr-raise) 4px 8px); }
  .sw.out { border: 2px solid var(--sr-danger, #e5484d); color: var(--sr-danger, #e5484d); background: color-mix(in srgb, var(--sr-danger, #e5484d) 16%, var(--sr-raise)); }
  .checkcard { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 6; width: min(22rem, calc(100% - 1rem)); display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.1rem 1.3rem; border: 0; border-radius: 24px; background: var(--sr-peach); color: var(--sr-peach-ink); text-align: center; box-shadow: 0 14px 40px color-mix(in srgb, var(--sr-ink) 28%, transparent); animation: card-in 220ms cubic-bezier(.2, 1.4, .4, 1); }
  .cc-title { font-size: 1.6rem; font-weight: 700; line-height: 1.1; }
  .cc-body { font-weight: 700; font-size: 0.95rem; }
  .cc-ok { margin-top: 0.2rem; min-height: 48px; }
  @keyframes card-in { from { transform: translate(-50%, -50%) scale(0.85); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .checkcard { animation: none; } }
  .stage { padding: 1.2rem; display: flex; flex-direction: column; gap: 1rem; }
</style>
