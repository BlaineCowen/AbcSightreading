<script lang="ts">
  /**
   * A student's device in a class game (Games, 2 November 2026), shown by
   * LiveStudent while the room is playing one. The music and the tune are
   * on the big screen; this is the player's own part of it.
   *
   * Rhythm: a big pad (or the spacebar). Tap along with the big screen's
   * count-in, "1, 2, Ready, Go" (that is how this device's delay is
   * measured, game-lag.ts), then the rhythm. Every tap is stamped on the
   * server's clock (Live's clock offset) and the taps go to the big screen
   * when the round ends.
   * Catch the tune: the board to fill in (TuneGrid), sent with Send.
   * Then this player's points and place, and for a rhythm the rhythm itself
   * with their own taps marked (what they missed), scored here by the same
   * rules as the big screen from what it sends back after the round.
   *
   * Names: a made-up one from the device (game-names.ts), or one the student
   * types before the game starts, checked here and again on the server; the
   * teacher can remove it from the big screen, which puts the made-up one
   * back. Nothing else about the student is sent.
   */
  import { onDestroy, tick } from "svelte";
  import abcjs from "abcjs";
  import TuneGrid from "./TuneGrid.svelte";
  import PipFace from "../PipFace.svelte";
  import { cleanName, nameKey, nameProblem, NAME_MAX, playerName, playerTag } from "../../lib/games/game-names";
  import { isFinal, rhythmTimes, type LiveGame } from "../../lib/games/live-game";
  import { countInWordsFor } from "../../lib/count-in";
  import { scoreRhythm, scoreTune, teamStandings, type RhythmScore } from "../../lib/games/game-score";
  import { gradeSchedule } from "../../lib/grade-schedule";
  import { markNotes, roundLayout } from "../../lib/games/rhythm-marks";
  import { playStep } from "../../lib/games/game-audio";
  import { sylOf } from "../../lib/games/tune-path";

  export let game: LiveGame;
  export let code: string;
  export let device: string;
  /** How far the server's clock is ahead of this one, ms (LiveStudent's measureClock). */
  export let offset = 0;
  /** The name this device plays under: LiveStudent reports it as the device's part, so the big screen lists it. */
  export let name = "";

  // ── The player's name ──────────────────────────────────────────────────
  const NAME_KEY = "sr-game-name";
  let typed = (() => {
    try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; }
  })();
  let draft = typed;
  let nameNote = "";
  $: made = playerName(device);
  /** The teacher removed this device's name: back to the made-up one (a function, so `typed` is only read here). */
  function checkRemoved(blocked: string[] | undefined) {
    if (!typed || !(blocked ?? []).includes(nameKey(typed))) return;
    nameNote = "Your teacher asked for a different name.";
    typed = "";
    draft = "";
    try { localStorage.removeItem(NAME_KEY); } catch {}
  }
  $: checkRemoved(game.blocked);
  $: me = typed || made;
  $: name = me;
  $: canRename = game.phase === "lobby" || game.number === 0;
  $: draftProblem = draft.trim() ? nameProblem(draft) : null;
  function saveName() {
    const n = cleanName(draft);
    if (!n) {
      typed = "";
    } else if (nameProblem(n)) {
      return;
    } else typed = n;
    nameNote = "";
    try { typed ? localStorage.setItem(NAME_KEY, typed) : localStorage.removeItem(NAME_KEY); } catch {}
  }


  $: tag = playerTag(device);
  $: place = (game.board ?? []).findIndex((r) => r.tag === tag);
  $: mine = place >= 0 ? game.board![place] : null;
  $: final = isFinal(game);
  $: myTeam = game.teams?.find((t) => t.members.includes(me));
  $: standings = game.teams?.length ? teamStandings(game.board ?? [], game.teams) : [];
  const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

  // A new round starts clean.
  let roundSeen = "";
  $: if (game.round !== roundSeen) reset(game.round);

  let taps: number[] = [];
  let sent: "no" | "sending" | "yes" | "failed" = "no";
  let word = "";
  let timers: ReturnType<typeof setTimeout>[] = [];
  let pressed = false;
  let chosen: (number | null)[] = [];
  let answeringSince = 0;

  function reset(round: string) {
    roundSeen = round;
    timers.forEach(clearTimeout);
    timers = [];
    taps = [];
    sent = "no";
    word = "";
    chosen = [];
    answeringSince = 0;
    if (game.kind === "rhythm" && game.phase === "playing" && game.rhythm) scheduleRhythm();
  }
  onDestroy(() => timers.forEach(clearTimeout));

  /** Server milliseconds now, and for an event's own timestamp. */
  const serverNow = () => Date.now() + offset;
  const serverAt = (eventStamp: number) => Date.now() - (performance.now() - eventStamp) + offset;

  function scheduleRhythm() {
    const r = game.rhythm!;
    const t = rhythmTimes(r);
    const inMs = (serverMs: number) => Math.max(0, serverMs - serverNow());
    const words = countInWordsFor(t.countBeats);
    timers.push(setTimeout(() => (word = ""), 0));
    for (let k = 0; k < t.countBeats; k++) timers.push(setTimeout(() => (word = words[k]), inMs(r.at + k * t.beatMs)));
    timers.push(setTimeout(() => (word = "Tap the rhythm"), inMs(t.musicAt)));
    timers.push(setTimeout(() => {
      word = "";
      void sendTaps();
    }, inMs(t.endAt + 400)));
  }

  function tap(stamp: number) {
    if (game.kind !== "rhythm" || game.phase !== "playing" || sent !== "no") return;
    const r = game.rhythm;
    if (!r) return;
    const at = serverAt(stamp);
    if (at < r.at - 1000 || at > rhythmTimes(r).endAt + 1000) return;
    taps = [...taps, at];
  }
  function down(e: PointerEvent) {
    e.preventDefault();
    pressed = true;
    tap(e.timeStamp);
  }
  function onKey(e: KeyboardEvent) {
    // A space typed into the name box is a space, not a tap.
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
    if ((e.code === "Space" || e.key === " ") && !e.repeat && game.kind === "rhythm") {
      e.preventDefault();
      pressed = true;
      tap(e.timeStamp);
    }
  }

  async function post(answer: unknown) {
    sent = "sending";
    try {
      const res = await fetch(`/api/live/${code}/game/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, round: game.round, answer, name: typed || undefined }),
      });
      sent = res.ok ? "yes" : "failed";
    } catch {
      sent = "failed";
    }
  }
  const sendTaps = () => post({ taps: taps.map(Math.round) });

  // ── Catch the tune ─────────────────────────────────────────────────────
  $: if (game.kind === "tune" && game.phase === "answering" && !answeringSince) answeringSince = Date.now();
  $: tune = game.tune;
  $: if (tune && chosen.length !== tune.length) chosen = Array.from({ length: tune.length }, (_, i) => (i === 0 ? tune!.first : null));
  $: filled = chosen.length > 0 && chosen.every((x) => x !== null);
  $: at = chosen.findIndex((x) => x === null);
  $: canAnswer = game.kind === "tune" && game.phase === "answering" && sent !== "yes" && sent !== "sending";
  function pick(col: number, step: number) {
    if (!canAnswer || col === 0) return;
    playStep(step, 60);
    chosen = chosen.map((x, i) => (i === col ? step : x));
  }
  const sendTune = () => post({ notes: chosen.map((x) => x ?? 0), ms: Date.now() - (answeringSince || Date.now()) });
  $: result = game.kind === "tune" && game.phase === "results" && tune?.tune && sent === "yes" ? scoreTune(chosen.map((x) => x ?? 0), tune.tune, 0, 0) : null;
  // ── A rhythm's review: this player's own taps on the rhythm ─────────────
  let reviewPaper: HTMLDivElement;
  let review: RhythmScore | null = null;
  let reviewed = "";
  $: if (game.kind === "rhythm" && game.phase === "results" && game.rhythm?.review && sent === "yes" && reviewed !== game.round) void showReview();
  async function showReview() {
    const r = game.rhythm!;
    const v = r.review!;
    reviewed = game.round;
    try {
      const schedule = gradeSchedule(v.abc);
      review = scoreRhythm({ round: r, schedule, beatUnits: v.beatUnits, taps, strictness: v.strictness, roomLagMs: v.roomLag });
      await tick();
      if (!reviewPaper) return;
      abcjs.renderAbc(reviewPaper, v.abc, { responsive: "resize", staffwidth: 360, scale: 1.2, paddingtop: 4, paddingbottom: 4, add_classes: true, ...roundLayout(r.bars) });
      markNotes(reviewPaper, review.result.notes);
    } catch {
      review = null;
    }
  }

  $: secondsLeft = tune?.answerBy ? Math.max(0, Math.ceil((tune.answerBy - serverNow()) / 1000)) : null;
  let ticker: ReturnType<typeof setInterval> | null = setInterval(() => (secondsLeft = tune?.answerBy ? Math.max(0, Math.ceil((tune.answerBy - serverNow()) / 1000)) : null), 500);
  onDestroy(() => ticker && clearInterval(ticker));
</script>

<svelte:window on:keydown={onKey} on:keyup={() => (pressed = false)} />

<div class="game">
  <p class="me">
    You are <b data-player-name={me}>{me}</b>{#if mine}{` · ${mine.points} points · ${ordinal(place + 1)}`}{/if}
    {#if myTeam}<span class="team team-{myTeam.id}" data-my-team={myTeam.id}>{myTeam.name} team</span>{/if}
  </p>
  {#if game.number > 0}<p class="round">Round {game.number}{game.total ? ` of ${game.total}` : ""}</p>{/if}

  {#if game.phase === "lobby"}
    <div class="wait sr-panel">
      <PipFace class="w-14 h-14" />
      <p class="font-display text-2xl font-bold">{game.kind === "rhythm" ? "Rhythm game" : "Catch the tune"}</p>
      <p class="text-sr-ink-2">Watch the big screen. The game starts from there.</p>
    </div>
  {/if}
  {#if canRename}
    <form class="name sr-panel" on:submit|preventDefault={saveName}>
      <label for="game-name" class="text-sm font-bold text-sr-ink-2">Your name on the board</label>
      <div class="flex gap-2">
        <input id="game-name" class="name-input" bind:value={draft} maxlength={NAME_MAX} placeholder={made} autocomplete="off" autocapitalize="words" data-game-name />
        <button class="sr-btn px-4" type="submit" disabled={!!draftProblem || cleanName(draft) === typed} data-game-name-save>Use</button>
      </div>
      {#if draftProblem}<p class="text-sm text-sr-danger" role="alert">{draftProblem}</p>
      {:else if nameNote}<p class="text-sm text-sr-danger" role="status">{nameNote}</p>
      {:else}<p class="text-xs text-sr-muted">Leave it empty to be {made}. Your teacher can see and remove names.</p>{/if}
    </form>
  {/if}

  {#if final && mine}
    <div class="wait sr-panel final">
      <p class="font-display text-3xl font-bold">Final: {ordinal(place + 1)}</p>
      <p class="text-sr-ink-2 font-bold">{mine.points} points{#if myTeam && standings.length}{` · the ${myTeam.name} team came ${ordinal(standings.findIndex((t) => t.id === myTeam?.id) + 1)}`}{/if}</p>
    </div>
  {/if}

  {#if game.phase === "lobby"}
    <!-- the name form above -->
  {:else if game.kind === "rhythm"}
    {#if game.phase === "playing" && sent === "no"}
      <p class="word" aria-live="assertive">{word || "Tap along with the count-in, then the rhythm"}</p>
      <button
        type="button"
        class="pad"
        class:pressed
        on:pointerdown={down}
        on:pointerup={() => (pressed = false)}
        on:pointercancel={() => (pressed = false)}
        on:pointerleave={() => (pressed = false)}
        on:contextmenu|preventDefault
        aria-label="Tap"
        data-game-pad
      >
        <span class="text-4xl">Tap</span>
        <span class="text-sm opacity-70">{taps.length} taps · or Space</span>
      </button>
      <p class="hint">Read the rhythm on the big screen.</p>
    {:else if game.phase === "results" && mine}
      <div class="wait sr-panel">
        <p class="font-display text-5xl font-bold tabular-nums" data-my-points={mine.last}>+{mine.last}</p>
        <p class="text-sr-ink-2 font-bold">{mine.points} points in all</p>
      </div>
      {#if game.rhythm?.review}
        <div class="review sr-panel" data-review>
          <p class="text-sm font-bold text-sr-ink-2" data-review-beats={review?.result.beatsRight ?? ""}>{review ? `Your taps: ${review.result.beatsRight} of ${review.result.beats} beats right` : "Your taps"}</p>
          <div class="review-paper" bind:this={reviewPaper}></div>
          <p class="text-xs text-sr-muted">Green: in time. Yellow: a little early or late. Red: missed.</p>
        </div>
      {/if}
    {:else}
      <div class="wait sr-panel">
        <p class="font-display text-xl font-bold">{sent === "yes" ? "Sent. Watch the big screen." : sent === "sending" ? "Sending…" : sent === "failed" ? "That did not send." : "Watch the big screen."}</p>
        {#if sent === "failed"}<button class="sr-btn" on:click={sendTaps}>Send again</button>{/if}
      </div>
    {/if}
  {:else if tune}
    {#if game.phase === "playing"}
      <p class="word">Listen to the big screen. It starts on <b>{sylOf(tune.first)}</b>.</p>
    {:else if game.phase === "answering"}
      <p class="word">{sent === "yes" ? "Sent. Watch the big screen." : `Fill in the tune${secondsLeft !== null ? ` · ${secondsLeft}s` : ""}`}</p>
    {:else if result}
      <p class="word" data-my-points={mine?.last ?? result.points}>{result.right} of {result.total} right{mine ? ` · +${mine.last}` : ""}</p>
    {/if}
    <TuneGrid
      steps={tune.steps}
      length={tune.length}
      first={tune.first}
      {chosen}
      marks={result ? result.marks : null}
      answer={game.phase === "results" ? tune.tune ?? null : null}
      at={canAnswer ? at : -1}
      disabled={!canAnswer}
      ontap={pick}
    />
    {#if game.phase === "answering" && sent !== "yes"}
      <button class="sr-btn px-8 py-3 text-lg self-center" on:click={sendTune} disabled={!filled || sent === "sending"} data-game-send>{sent === "sending" ? "Sending…" : sent === "failed" ? "Send again" : "Send"}</button>
    {/if}
  {/if}
</div>

<style>
  .game { display: flex; flex-direction: column; gap: 1rem; width: 100%; max-width: 40rem; margin: 0 auto; padding: 0 0.5rem 2rem; }
  .me { text-align: center; color: var(--sr-ink-2); display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 0.4rem; }
  .round { text-align: center; font-size: 0.85rem; font-weight: 800; color: var(--sr-muted); margin-top: -0.6rem; }
  .team { font-size: 0.8rem; font-weight: 800; border-radius: 999px; padding: 0.1rem 0.6rem; }
  .team-mint { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .team-peach { background: var(--sr-peach); color: var(--sr-peach-ink); }
  .team-butter { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .team-sky { background: var(--sr-sky); color: var(--sr-sky-ink); }
  .name { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.9rem 1rem; }
  .name-input { flex: 1; min-width: 0; border: 1px solid var(--sr-hairline); background: var(--sr-raise); color: var(--sr-ink); border-radius: 14px; padding: 0.55rem 0.8rem; font-size: 1.1rem; font-weight: 700; }
  .final { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .review { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.9rem 1rem; }
  .review-paper { background: #fff; border-radius: 14px; }
  .review-paper :global(.g-right) { fill: #2fb383; }
  .review-paper :global(.g-close) { fill: #e0a100; }
  .review-paper :global(.g-miss) { fill: #e5484d; }
  .wait { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 2rem 1rem; text-align: center; }
  .word { text-align: center; font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.5rem; color: var(--sr-ink); min-height: 2.2rem; }
  .hint { text-align: center; font-size: 0.9rem; color: var(--sr-muted); }
  .pad {
    width: 100%;
    height: min(55vh, 22rem);
    border-radius: 32px;
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
    font-weight: 800;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    box-shadow: 0 8px 0 color-mix(in srgb, var(--sr-peach-ink) 35%, var(--sr-peach));
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
    transition: transform 50ms ease-out, box-shadow 50ms ease-out;
  }
  .pad.pressed { transform: translateY(6px); box-shadow: 0 2px 0 color-mix(in srgb, var(--sr-peach-ink) 35%, var(--sr-peach)); }
</style>
