<script lang="ts">
  /**
   * The rhythm game (Games, 2 November 2026): a few bars of rhythm drawn big,
   * a two-bar count-in (listen, then tap with the clicks), then tap the
   * rhythm on the spacebar or the pad while the metronome keeps the beat.
   * Graded by Clap and grade's rules (grade-rhythm.ts, beat by beat), the
   * lag taken off from the count-in's taps (game-lag.ts).
   *
   * On this device, or with your class (Pro to host): the big screen draws
   * the rhythm and plays the clicks; every student taps on their own device
   * at /live/<code> (LiveGame.svelte), stamped on the server clock, and the
   * big screen scores everyone and shows the board.
   */
  import { onDestroy, tick } from "svelte";
  import abcjs from "abcjs";
  import TapPad from "../TapPad.svelte";
  import GameHost from "./GameHost.svelte";
  import { GAME_BARS, GAME_TEMPOS, RHYTHM_LEVELS, roundParams, rhythmLevel } from "../../lib/games/rhythm-levels";
  import { bookClicks, gameAudio, loadClicks } from "../../lib/games/game-audio";
  import { scoreRhythm, addRound, type RhythmScore } from "../../lib/games/game-score";
  import { roomLag, countInLag } from "../../lib/games/game-lag";
  import { countInBarsFor, rhythmTimes, type BoardRow, type LiveGame, type RhythmAnswer, type RhythmRound } from "../../lib/games/live-game";
  import { answers as fetchAnswers, closeRoom, measureOffset, newRound, openRoom, players as fetchPlayers, publishGame, type HostRoom } from "../../lib/games/host-room";
  import { gradeSchedule } from "../../lib/grade-schedule";
  import { beatUnitOf } from "../../lib/meter";
  import { audioToPage } from "../../lib/clap-listener";
  import { STRICTNESS, type Strictness } from "../../lib/grade";
  import { tuner } from "../../lib/tuner/store";
  import { countInWordsFor } from "../../lib/count-in";

  let mode: "solo" | "class" = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("host") === "1" ? "class" : "solo";
  let levelId = RHYTHM_LEVELS[0].id;
  let bars = 2;
  let bpm = 84;
  let strictness: Strictness = "standard";
  $: level = rhythmLevel(levelId);
  const setStrictness = (id: string) => (strictness = id as Strictness);

  type Exercise = { abc: string; meter: string; beatsPerBar: number; beatUnits: number; schedule: ReturnType<typeof gradeSchedule> };
  let exercise: Exercise | null = null;
  let loading = false;
  let problem = "";
  let paper: HTMLDivElement;

  async function write(): Promise<Exercise | null> {
    loading = true;
    problem = "";
    try {
      const r = roundParams(level, { bars, bpm });
      const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r.params) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Could not write a rhythm.");
      const abc: string = data.data[0];
      return { abc, meter: r.meter, beatsPerBar: r.beatsPerBar, beatUnits: beatUnitOf(r.meter), schedule: gradeSchedule(abc) };
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not write a rhythm.";
      return null;
    } finally {
      loading = false;
    }
  }

  async function draw() {
    await tick();
    if (!paper || !exercise) return;
    abcjs.renderAbc(paper, exercise.abc, { responsive: "resize", staffwidth: 520, scale: 1.6, paddingtop: 10, paddingbottom: 10, add_classes: true });
  }

  /** Each note's mark on the music: green right, butter close, peach missed. */
  function mark(result: RhythmScore["result"] | null) {
    const heads = [...(paper?.querySelectorAll(".abcjs-note") ?? [])];
    heads.forEach((el, i) => {
      el.classList.remove("g-right", "g-close", "g-miss");
      const n = result?.notes[i];
      if (!n) return;
      el.classList.add(n.missed ? "g-miss" : n.rhythm >= 90 ? "g-right" : "g-close");
    });
  }

  // ── Running a round (both modes) ───────────────────────────────────────
  let running = false;
  let word = "";
  let wordTimers: ReturnType<typeof setTimeout>[] = [];
  let clicks: { stop(): void } | null = null;
  let progress = 0;
  let raf = 0;

  /**
   * The count-in's words and the clicks, from `startSec` on the audio clock:
   * "1, 2, Ready, Go" (tapped along with), then the music with the click
   * going on.
   */
  async function runTimeline(ex: Exercise, startSec: number) {
    await loadClicks();
    const beatSec = 60 / bpm;
    const countBeats = countInBarsFor(ex.beatsPerBar) * ex.beatsPerBar;
    const words = countInWordsFor(countBeats);
    const musicBeats = bars * ex.beatsPerBar;
    clicks = bookClicks({ start: startSec, beats: countBeats + musicBeats, beatSec, beatsPerBar: ex.beatsPerBar });
    const ctx = gameAudio();
    const msUntil = (sec: number) => Math.max(0, (sec - ctx.currentTime) * 1000);
    for (let k = 0; k < countBeats; k++) wordTimers.push(setTimeout(() => (word = words[k]), msUntil(startSec + k * beatSec)));
    const musicSec = startSec + countBeats * beatSec;
    const endSec = musicSec + musicBeats * beatSec;
    wordTimers.push(setTimeout(() => (word = ""), msUntil(musicSec)));
    const step = () => {
      progress = Math.max(0, Math.min(1, (ctx.currentTime - musicSec) / (endSec - musicSec)));
      if (ctx.currentTime < endSec && running) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return endSec;
  }
  function stopTimeline() {
    running = false;
    clicks?.stop();
    clicks = null;
    wordTimers.forEach(clearTimeout);
    wordTimers = [];
    cancelAnimationFrame(raf);
    word = "";
  }
  onDestroy(() => {
    stopTimeline();
    stopPoll();
  });

  // ── On this device ─────────────────────────────────────────────────────
  let taps: number[] = [];
  let solo: RhythmScore | null = null;
  let round: RhythmRound | null = null;
  let total = 0;
  let rounds = 0;

  async function soloNew() {
    stopTimeline();
    solo = null;
    exercise = await write();
    await draw();
    mark(null);
  }

  async function soloPlay() {
    if (!exercise || running) return;
    solo = null;
    mark(null);
    taps = [];
    const ex = exercise;
    const ctx = gameAudio();
    const startSec = ctx.currentTime + 0.4;
    running = true;
    const endSec = await runTimeline(ex, startSec);
    // Everything on this page's clock (performance.now), the taps' own.
    const toPage = audioToPage(ctx);
    round = { bpm, meter: ex.meter, beatsPerBar: ex.beatsPerBar, bars, at: toPage(startSec) };
    setTimeout(() => {
      if (!running || !round) return;
      stopTimeline();
      solo = scoreRhythm({ round, schedule: ex.schedule, beatUnits: ex.beatUnits, taps, strictness, deviceLagMs: $tuner.tapLatencyMs });
      total += solo.points;
      rounds++;
      mark(solo.result);
    }, (endSec - ctx.currentTime) * 1000 + 500);
  }

  function onTap(t: number) {
    if (running && mode === "solo") taps = [...taps, t];
  }
  function onKey(e: KeyboardEvent) {
    if ((e.code === "Space" || e.key === " ") && !e.repeat && running && mode === "solo") {
      e.preventDefault();
      onTap(e.timeStamp);
    }
  }

  // ── With the class ─────────────────────────────────────────────────────
  let room: HostRoom | null = null;
  let hostProblem = "";
  let upgrade = false;
  let signIn = false;
  let opening = false;
  let offset = 0;
  let game: LiveGame | null = null;
  let board: BoardRow[] = [];
  let answerCount = 0;
  let roomScore: number | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const serverNow = () => Date.now() + offset;

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
    strictness = "easy";
    offset = await measureOffset();
    board = [];
    game = { kind: "rhythm", round: newRound(), number: 0, phase: "lobby", board };
    await publishGame(room.code, game);
  }

  /** The lead every device gets to hear of a round before its count-in starts. */
  const LEAD_MS = 4000;

  async function hostRound() {
    if (!room || !game) return;
    stopPoll();
    roomScore = null;
    answerCount = 0;
    const ex = await write();
    if (!ex) return;
    exercise = ex;
    await draw();
    mark(null);
    const at = serverNow() + LEAD_MS;
    const r: RhythmRound = { bpm, meter: ex.meter, beatsPerBar: ex.beatsPerBar, bars, at };
    game = { kind: "rhythm", round: newRound(), number: game.number + 1, phase: "playing", rhythm: r, board };
    if (!(await publishGame(room.code, game))) {
      problem = "Could not start the round. Check the connection and try again.";
      return;
    }
    // The server's moment on this page's audio clock.
    const ctx = gameAudio();
    const startSec = ctx.currentTime + (at - serverNow()) / 1000;
    running = true;
    await runTimeline(ex, startSec);
    const t = rhythmTimes(r);
    setTimeout(async () => {
      if (!running || !game || !room) return;
      stopTimeline();
      game = { ...game, phase: "answering" };
      await publishGame(room.code, game);
      const until = Date.now() + 5000;
      pollTimer = setInterval(async () => {
        if (!room || !game) return;
        const [got, joined] = await Promise.all([fetchAnswers(room.code, game.round), fetchPlayers(room.code)]);
        answerCount = got.length;
        if (Date.now() > until || (got.length > 0 && got.length >= joined.length)) await scoreRound();
      }, 1000);
    }, t.endAt - serverNow() + 600);
  }

  async function scoreRound() {
    if (!room || !game?.rhythm || !exercise || game.phase !== "answering") return;
    stopPoll();
    const r = game.rhythm;
    const ex = exercise;
    const got = await fetchAnswers(room.code, game.round);
    const t = rhythmTimes(r);
    const lags = got.map((a) => countInLag((a.answer as RhythmAnswer).taps, t.tapClicks, t.beatMs).lag);
    const room0 = roomLag(lags);
    const scored = got.map((a) => ({
      tag: a.tag,
      name: a.name,
      points: scoreRhythm({ round: r, schedule: ex.schedule, beatUnits: ex.beatUnits, taps: (a.answer as RhythmAnswer).taps, strictness, roomLagMs: room0 }).points,
    }));
    roomScore = scored.length ? Math.round(scored.reduce((s, x) => s + x.points, 0) / scored.length) : null;
    board = addRound(board, scored);
    game = { ...game, phase: "results", board };
    await publishGame(room.code, game);
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // For the end-to-end check (scripts/check-games.ts): the round as the big screen holds it. Development builds only.
  if (import.meta.env.DEV && typeof window !== "undefined")
    (window as any).__rhythmGame = {
      get game() { return game; },
      get exercise() { return exercise; },
      get board() { return board; },
      get solo() { return solo; },
      get round() { return round; },
    };

  async function endGame() {
    stopPoll();
    stopTimeline();
    if (room) await closeRoom(room.code);
    room = null;
    game = null;
    mode = "solo";
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="rhythm">
  <div class="tabs" role="tablist" aria-label="How to play">
    <button role="tab" class="sr-tok" class:sr-on={mode === "solo"} aria-selected={mode === "solo"} on:click={() => (room ? null : (mode = "solo"))} disabled={!!room}>On this device</button>
    <button role="tab" class="sr-tok" class:sr-on={mode === "class"} aria-selected={mode === "class"} on:click={() => (mode = "class")}>With your class</button>
  </div>

  <div class="settings" class:locked={running}>
    <label class="set"><span>Rhythms</span>
      <select bind:value={levelId} disabled={running}>
        {#each RHYTHM_LEVELS as l, i (l.id)}<option value={l.id}>{i + 1}. {l.name}</option>{/each}
      </select>
    </label>
    <label class="set"><span>Bars</span>
      <select bind:value={bars} disabled={running}>{#each GAME_BARS as b}<option value={b}>{b}</option>{/each}</select>
    </label>
    <label class="set"><span>Tempo</span>
      <select bind:value={bpm} disabled={running}>{#each GAME_TEMPOS as b}<option value={b}>♩ = {b}</option>{/each}</select>
    </label>
    <div class="flex gap-1" role="group" aria-label="Strictness">
      {#each Object.entries(STRICTNESS) as [id, s]}
        <button class="sr-tok text-sm" class:sr-on={strictness === id} aria-pressed={strictness === id} on:click={() => setStrictness(id)} disabled={running}>{s.label}</button>
      {/each}
    </div>
  </div>

  {#if mode === "class" && !room}
    <div class="sr-panel p-6 flex flex-col items-center gap-3 text-center">
      <p class="font-display text-2xl font-bold">Play it with your class</p>
      <p class="text-sr-ink-2 max-w-md">The big screen shows the rhythm and plays the click. Everyone taps it on their own phone, tablet or laptop at your live code; each device's delay is measured in the count-in and taken off.</p>
      <button class="sr-btn px-6" on:click={host} disabled={opening}>{opening ? "Opening your room…" : "Open my room"}</button>
      {#if hostProblem}
        <p class="text-sm text-sr-danger" role="alert">{hostProblem}</p>
        {#if upgrade}<a class="sr-btn-quiet" href="/pricing">See Pro</a>{/if}
        {#if signIn}<a class="sr-btn-quiet" href="/login?next={encodeURIComponent('/games/rhythm?host=1')}">Sign in</a>{/if}
      {/if}
    </div>
  {:else}
    {#if room}
      <GameHost {room} {board} showBoard={!running && game?.phase !== "answering"} onEnd={endGame}>
        <div class="flex flex-wrap items-center justify-center gap-3">
          {#if game?.phase === "answering"}
            <p class="font-bold text-sr-ink-2">Scoring… <span data-answered={answerCount}>{answerCount}</span> sent</p>
          {:else if !running}
            <button class="sr-btn px-8 py-3 text-lg" on:click={hostRound} disabled={loading} data-game-start>{game?.number ? "Next round" : "Start a round"}</button>
            {#if roomScore !== null}<p class="font-display text-xl font-bold" data-room-score={roomScore}>The class: {roomScore}%</p>{/if}
          {/if}
        </div>
      </GameHost>
    {:else}
      <div class="flex flex-wrap items-center justify-center gap-3">
        {#if !exercise}
          <button class="sr-btn px-8 py-3 text-lg" on:click={soloNew} disabled={loading}>{loading ? "Writing…" : "New rhythm"}</button>
        {:else if !running}
          <button class="sr-btn px-8 py-3 text-lg" on:click={soloPlay} data-game-play>{solo ? "Try again" : "Play"}</button>
          <button class="sr-btn-quiet" on:click={soloNew} disabled={loading}>New rhythm</button>
        {/if}
        {#if rounds}<span class="score-pill" aria-label="Average">{Math.round(total / rounds)}% over {rounds}</span>{/if}
      </div>
    {/if}

    {#if problem}<p class="text-center text-sm text-sr-danger" role="alert">{problem}</p>{/if}
    {#if exercise}<p class="how">Tap along with the count-in (1, 2, Ready, Go), then tap the rhythm.</p>{/if}

    <div class="stage" class:hidden={!exercise}>
      {#if word}<div class="word" aria-live="assertive"><span class:go={word === "Go"}>{word}</span></div>{/if}
      <div class="paper" bind:this={paper}></div>
      <div class="bar" aria-hidden="true"><span style="width: {progress * 100}%"></span></div>
    </div>

    {#if solo}
      <div class="result sr-panel" data-solo-score={solo.points}>
        <span class="font-display text-5xl font-bold tabular-nums">{solo.points}%</span>
        <span class="text-sr-ink-2 font-bold">{solo.result.beatsRight} of {solo.result.beats} beats right</span>
      </div>
    {/if}
  {/if}
</div>

{#if running && mode === "solo"}
  <TapPad onTap={onTap} />
{/if}

<style>
  .rhythm { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
  .tabs { display: flex; gap: 0.5rem; justify-content: center; }
  .settings { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: center; justify-content: center; }
  .set { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.9rem; color: var(--sr-ink-2); }
  .set select { border-radius: 999px; padding: 0.4rem 0.9rem; border: 1px solid var(--sr-hairline); background: var(--sr-raise); color: var(--sr-ink); }
  .stage { position: relative; background: #fff; border-radius: 28px; padding: 1.5rem 1rem 1rem; }
  .stage.hidden { display: none; }
  .word { position: absolute; top: 0.6rem; left: 50%; transform: translateX(-50%); z-index: 2; }
  .word span { display: inline-block; font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.8rem; background: var(--sr-sky); color: var(--sr-sky-ink); border-radius: 999px; padding: 0.2rem 1.2rem; }
  .word span.go { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .how { text-align: center; font-weight: 700; color: var(--sr-ink-2); }
  .bar { height: 6px; border-radius: 999px; background: var(--sr-track); overflow: hidden; margin-top: 0.5rem; }
  .bar span { display: block; height: 100%; background: var(--sr-action); }
  .result { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; padding: 1rem; }
  .score-pill { font-weight: 800; background: var(--sr-mint); color: var(--sr-mint-ink); border-radius: 999px; padding: 0.3rem 0.9rem; }
  .paper :global(.g-right) { fill: #2fb383; }
  .paper :global(.g-close) { fill: #e0a100; }
  .paper :global(.g-miss) { fill: #e5484d; }
</style>
