<script lang="ts" context="module">
  import type { playEar } from "../../lib/games/game-audio";
  export type Player = ReturnType<typeof playEar>;
  /** One round of an ear-training quiz, as a game deals it from a setup and a seed. */
  export type QuizRound = {
    /** The right answer to each question. */
    answers: number[];
    /** The answer tiles, in order (low to high, for a keyboard). */
    choices: { value: number; label: string; black?: boolean }[];
    /** The tiles as a piano keyboard (Solfège): notes out of the scale are black keys. */
    keyboard?: boolean;
    /** The key at the start (and Hear the key), or null for a game without one. */
    intro: { tonic: number; pattern: number[]; chord: number[]; names: string[]; chordName: string } | null;
    /** Plays question i; `heard` when its last note sounds (the tiles open then); `onStep(k)` as each of its notes sounds. */
    play: (i: number, heard: () => void, onStep?: (k: number) => void) => Player;
    /** After a miss: the right answer, played so it is heard. */
    playAnswer: (i: number, onStep?: (k: number) => void) => Player;
    /**
     * What each note of question i is, shown as it sounds (Solfège: "do",
     * then "?"; Blaine, 18 November 2026: "make it work like learnmusic.fun,
     * where it says this note is Do, what's the ? note"). Null shows nothing.
     */
    steps?: (i: number, answered: boolean) => { labels: string[]; say: string } | null;
    /** "That was ___." */
    answerName: (i: number) => string;
  };
</script>

<script lang="ts">
  /**
   * The ear-training quizzes' shared play (Solfège, Interval): the key if the
   * game has one, then QUIZ_LENGTH questions, each answered on big tiles (or
   * the number keys); the first answer counts, a wrong one shows and plays the
   * right one; then the result, stars and points. The setup is the game's own
   * (the `setup` slot, shown between rounds).
   *
   * Signed in, the round is dealt by the server (/api/games/round) and marked
   * there (/api/games/finish), so it can earn points when the student's
   * teacher lets games earn (ear-games.ts); signed out, it plays from a seed
   * of its own and earns nothing.
   */
  import { onDestroy, onMount } from "svelte";
  import { Ear, Music, Play, RotateCcw, SkipForward, Sparkles, Square } from "lucide-svelte";
  import KeyStrip from "./KeyStrip.svelte";
  import NoteKeyboard from "./NoteKeyboard.svelte";
  import PointsToast from "../PointsToast.svelte";
  import { pointsNews } from "../../lib/practice-tracker";
  import { playEar as play } from "../../lib/games/game-audio";
  import { GAME_PASS } from "../../lib/points";
  import { NEXT_AFTER_RIGHT, QUIZ_LENGTH, newSeed } from "../../lib/games/ear-quiz";

  /** The game, as /api/games knows it. */
  export let game: string;
  /** The setup chosen (the game's own shape). */
  export let setup: unknown;
  /** A round from a setup (the one the server returned, when it dealt it) and a seed. */
  export let makeRound: (setup: any, seed: number) => QuizRound;
  /** The next level after this setup, for the result card's button; null at the top or on Custom. */
  export let nextLevel: (setup: any) => { label: string; setup: unknown } | null = () => null;
  /** Called with a new setup (the next level). */
  export let onSetup: (setup: any) => void = () => {};
  /** Why the setup can't be played, if it can't. */
  export let problem: string | null = null;
  /** Under Start: what a round is. */
  export let hint = "";
  /** A game assignment this round is played on (game-assignments.ts): the server deals from its setup and records the round. */
  export let assignmentId: string | null = null;
  /** The student's progress on that assignment after a round. */
  export let onProgress: (p: import("../../lib/game-assignments").GameProgress) => void = () => {};

  type Phase = "idle" | "key" | "ask" | "answered" | "done";
  let phase: Phase = "idle";
  let round: QuizRound | null = null;
  let roundSetup: unknown = setup;
  let token: string | null = null;
  let canEarn = false;
  let q = 0;
  let answers: number[] = [];
  let keyAt: number | null = null;
  let heard = false;
  let player: Player | null = null;
  /** The notes of the question as they are named on screen, and which is sounding. */
  let prompt: { labels: string[]; say: string } | null = null;
  let sounding: number | null = null;
  const onStep = (k: number) => (sounding = k);
  function track(p: Player) {
    void p.done.then(() => {
      if (player === p) sounding = null;
    });
    return p;
  }
  let result: { correct: number; points: number | null; note?: string; problem?: string } | null = null;
  let finishing = false;

  $: right = round ? answers.map((a, i) => a === round!.answers[i]) : [];
  $: score = right.filter(Boolean).length;

  const localDay = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  function stopSound() {
    player?.stop();
    player = null;
  }

  /** A new round: from the server when signed in (it can earn), else from a seed of our own. */
  export async function start() {
    stopSound();
    result = null;
    answers = [];
    q = 0;
    token = null;
    canEarn = false;
    let seed = newSeed();
    roundSetup = setup;
    try {
      const res = await fetch("/api/games/round", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, setup, day: localDay(), ...(assignmentId ? { assignment: assignmentId } : {}) }) });
      if (res.ok) {
        const body = await res.json();
        token = body.token;
        seed = body.seed;
        // The setup as the server checked it: the round must be dealt from the same one.
        roundSetup = body.setup;
        canEarn = !!body.points;
      }
    } catch {}
    round = makeRound(roundSetup, seed);
    if (round.intro) {
      phase = "key";
      await hearKey();
      if (phase === "key") ask();
    } else ask();
  }

  function ask() {
    if (!round) return;
    heard = false;
    phase = "ask";
    playQuestion();
  }
  function playQuestion() {
    if (!round) return;
    stopSound();
    prompt = round.steps?.(q, false) ?? null;
    sounding = null;
    player = track(round.play(q, () => (heard = true), onStep));
  }
  async function hearKey() {
    if (!round?.intro) return;
    stopSound();
    const k = round.intro;
    player = play({ tonic: k.tonic, pattern: k.pattern, chord: k.chord, notes: [], gap: 1, onKey: (at) => (keyAt = at) });
    await player.done;
  }

  /** Hear the key mid-question: then the question again (its tiles open as it sounds). */
  async function keyThenQuestion() {
    const at = q;
    await hearKey();
    if (phase === "ask" && q === at && !heard) playQuestion();
  }

  let nextTimer: ReturnType<typeof setTimeout> | null = null;
  function answer(v: number) {
    if (phase !== "ask" || !heard || !round) return;
    answers = [...answers, v];
    phase = "answered";
    if (v === round.answers[q]) nextTimer = setTimeout(next, NEXT_AFTER_RIGHT * 1000);
    else {
      stopSound();
      prompt = round.steps?.(q, true) ?? null;
      sounding = null;
      player = track(round.playAnswer(q, onStep));
    }
  }
  function next() {
    if (nextTimer) clearTimeout(nextTimer);
    nextTimer = null;
    if (phase !== "answered") return;
    if (q + 1 >= QUIZ_LENGTH) return void finish();
    q += 1;
    ask();
  }
  /** Back to the setup, the round dropped. */
  function quit() {
    stopSound();
    if (nextTimer) clearTimeout(nextTimer);
    keyAt = null;
    phase = "idle";
    round = null;
  }

  async function finish() {
    phase = "done";
    stopSound();
    result = { correct: score, points: null };
    if (!token) return;
    finishing = true;
    try {
      const res = await fetch("/api/games/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, answers }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        result = {
          correct: body.correct,
          points: body.award ? body.award.total : null,
          note: body.award?.earned?.find((e: { note?: string }) => e.note)?.note,
          problem: body.problem,
        };
        if (body.award && (body.award.earned?.length || body.award.badges?.length)) pointsNews.set(body.award);
        if (body.assignment) onProgress(body.assignment);
      }
    } catch {}
    finishing = false;
  }

  $: stars = !result ? 0 : result.correct >= 10 ? 3 : result.correct >= 8 ? 2 : result.correct >= 6 ? 1 : 0;
  $: up = phase === "done" && result && result.correct >= 9 ? nextLevel(roundSetup) : null;

  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input, select, textarea")) return;
    if (phase === "ask" && round) {
      const n = Number(e.key);
      if (n >= 1 && n <= round.choices.length) {
        e.preventDefault();
        answer(round.choices[n - 1]!.value);
      } else if (e.key === " " || e.key === "r") {
        e.preventDefault();
        playQuestion();
      }
    } else if (phase === "answered" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      next();
    }
  }
  onMount(() => window.addEventListener("keydown", keydown));
  onDestroy(() => {
    stopSound();
    if (nextTimer) clearTimeout(nextTimer);
    if (typeof window !== "undefined") window.removeEventListener("keydown", keydown);
  });
</script>

<div class="ear" data-ear-quiz={game} data-phase={phase}>
  {#if phase === "idle" || phase === "done"}
    <slot name="setup" />
  {/if}

  {#if phase === "done" && result}
    <div class="result" role="status" data-result>
      <div class="stars" aria-label="{stars} of 3 stars">{#each [0, 1, 2] as i}<Sparkles size={26} class={i < stars ? "lit" : "dim"} />{/each}</div>
      <p class="big">{result.correct} of {QUIZ_LENGTH} right</p>
      {#if finishing}<p class="text-sm">Counting your points…</p>
      {:else if result.problem}<p class="text-sm">{result.problem}</p>
      {:else if result.points !== null}<p class="text-sm font-extrabold" data-points>+{result.points} points</p>{#if result.note}<p class="text-sm">{result.note}</p>{/if}{/if}
      <div class="flex flex-wrap gap-2 justify-center">
        <button class="sr-btn" on:click={start} disabled={!!problem}><RotateCcw size={16} /> Play again</button>
        {#if up}
          <button class="sr-btn-quiet bg-sr-raise" on:click={() => { onSetup(up?.setup); setup = up?.setup; start(); }}><SkipForward size={16} /> {up.label}</button>
        {/if}
      </div>
    </div>
  {:else if phase === "idle"}
    <button class="sr-btn start" on:click={start} disabled={!!problem}><Play size={18} /> Start</button>
    {#if hint}<p class="text-xs text-sr-muted text-center">{hint}</p>{/if}
  {:else if round}
    <div class="play">
      <div class="dots" aria-label="Question {q + 1} of {QUIZ_LENGTH}">
        {#each Array(QUIZ_LENGTH) as _, i}
          <span class="dot" class:now={i === q} class:ok={right[i] === true} class:no={right[i] === false}></span>
        {/each}
      </div>
      {#if prompt}
        <div class="prompt" data-ear-prompt>
          <div class="cards" aria-hidden="true">
            {#each prompt.labels as l, k}
              {#if k}<span class="arrow">→</span>{/if}
              <span class="pc" class:now={sounding === k} class:ask={l === "?"}>{l}</span>
            {/each}
          </div>
          <p class="say" aria-live="polite">{prompt.say}</p>
        </div>
      {/if}
      <div class="board">
        {#if round.intro}<KeyStrip at={keyAt} names={round.intro.names} chordName={round.intro.chordName} then="Now the notes" />{/if}
        {#if round.keyboard}
          <NoteKeyboard
            answer
            label="Answers"
            keys={round.choices.map((c) => ({ value: c.value, label: c.label, black: !!c.black }))}
            disabled={phase !== "ask" || !heard}
            right={phase === "answered" ? round.answers[q] ?? null : null}
            wrong={phase === "answered" && answers[q] !== round.answers[q] ? answers[q] ?? null : null}
            on:press={(e) => answer(e.detail)}
          />
        {:else}
        <div class="tiles" style="--cols: {Math.min(round.choices.length, 7)}">
          {#each round.choices as c, i (c.value)}
            {@const isRight = phase === "answered" && c.value === round.answers[q]}
            {@const isWrong = phase === "answered" && c.value === answers[q] && !isRight}
            <button class="tile" class:right={isRight} class:wrong={isWrong} class:long={c.label.length > 5} disabled={phase !== "ask" || !heard} on:click={() => answer(c.value)} data-answer={c.value}>
              <span class="num" aria-hidden="true">{i + 1}</span>{c.label}
            </button>
          {/each}
        </div>
        {/if}
      </div>
      <div class="controls">
        {#if phase === "answered" && answers[q] !== round.answers[q]}
          <p class="miss" role="status">That was <b>{round.answerName(q)}</b>.</p>
          <button class="sr-btn" on:click={next}><SkipForward size={16} /> {q + 1 >= QUIZ_LENGTH ? "Finish" : "Next"}</button>
        {:else}
          <button class="sr-btn-quiet" disabled={phase === "key"} on:click={playQuestion}><Ear size={16} /> Hear it again</button>
          {#if round.intro}<button class="sr-btn-quiet" disabled={phase === "key"} on:click={keyThenQuestion}><Music size={16} /> Hear the key</button>{/if}
          <button class="sr-btn-quiet" on:click={quit} aria-label="Stop the round"><Square size={14} /> Stop</button>
        {/if}
      </div>
      {#if canEarn}<p class="earn">This round can earn points: {GAME_PASS} or more right.</p>{/if}
    </div>
  {/if}
</div>

<PointsToast />

<style>
  .ear { width: 100%; max-width: 46rem; display: flex; flex-direction: column; gap: 1rem; align-items: stretch; }
  .start { align-self: center; font-size: 1.15rem; padding: 0.8rem 2.2rem; display: inline-flex; gap: 0.5rem; align-items: center; }
  .play { display: flex; flex-direction: column; gap: 1rem; }
  .dots { display: flex; gap: 6px; justify-content: center; }
  .dot { width: 14px; height: 14px; border-radius: 999px; background: var(--sr-track); border: 2px solid transparent; }
  .dot.now { border-color: var(--sr-action); }
  .dot.ok { background: var(--sr-mint-ink); }
  .dot.no { background: var(--sr-danger); }
  .prompt { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; }
  .cards { display: flex; align-items: center; gap: 0.6rem; }
  .pc { display: grid; place-items: center; min-width: 5.2rem; height: 4.2rem; padding: 0 0.9rem; border-radius: 20px; background: var(--sr-raise); border: 3px solid var(--sr-hairline); font-family: var(--font-display, inherit); font-size: 2rem; font-weight: 800; color: var(--sr-ink); transition: transform 120ms ease, background 120ms ease; }
  .pc.ask { color: var(--sr-ink-2); }
  .pc.now { background: var(--sr-butter); color: var(--sr-butter-ink); border-color: var(--sr-butter-ink); transform: scale(1.08); }
  .arrow { font-size: 1.5rem; color: var(--sr-ink-2); }
  .say { font-weight: 800; color: var(--sr-ink-2); }
  .board { position: relative; min-height: 12rem; display: flex; align-items: center; }
  .tiles { width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(max(5.5rem, calc(100% / var(--cols) - 0.6rem)), 1fr)); gap: 0.6rem; }
  .tile { position: relative; min-height: 5.5rem; padding: 0.5rem; border-radius: 22px; background: var(--sr-sky); color: var(--sr-sky-ink); font-family: var(--font-display, inherit); font-size: 1.9rem; font-weight: 800; line-height: 1.1; border: 3px solid transparent; transition: transform 80ms ease; }
  .tile.long { font-size: 1.15rem; }
  .tile:not(:disabled):hover { transform: translateY(-2px); }
  .tile:not(:disabled):active { transform: scale(0.97); }
  .tile:disabled { cursor: default; }
  .tile.right { background: var(--sr-mint); color: var(--sr-mint-ink); border-color: var(--sr-mint-ink); }
  .tile.wrong { background: var(--sr-peach); color: var(--sr-peach-ink); border-color: var(--sr-danger); }
  .num { position: absolute; top: 6px; left: 10px; font-size: 0.75rem; font-family: inherit; opacity: 0.6; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; align-items: center; min-height: 3rem; }
  .controls :global(button) { display: inline-flex; gap: 0.4rem; align-items: center; }
  .miss { font-size: 1.05rem; color: var(--sr-ink); }
  .earn { text-align: center; font-size: 0.8rem; color: var(--sr-mint-ink); font-weight: 700; }
  .result { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.25rem; border-radius: 28px; background: var(--sr-mint); color: var(--sr-mint-ink); text-align: center; }
  .result :global(button) { display: inline-flex; gap: 0.4rem; align-items: center; }
  .big { font-family: var(--font-display, inherit); font-size: 2rem; font-weight: 800; }
  .stars { display: flex; gap: 0.3rem; }
  .stars :global(.lit) { color: var(--sr-butter-ink); fill: var(--sr-butter); }
  .stars :global(.dim) { opacity: 0.3; }
</style>
