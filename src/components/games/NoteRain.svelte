<script lang="ts">
  /**
   * Note Rain (note-rain.ts has the rules and the why): notes fall on little
   * staff cards; name the lowest before it lands. Three strikes. A storm is a
   * minute, or twenty notes, or Endless, which keeps getting faster until the
   * strikes run out. Levels from three notes to ledger lines, or Customize on
   * a staff (StaffPicker). Played on this device; nothing is sent anywhere.
   *
   * The look is the site's (Blaine, 18 November 2026: learnmusic.fun's "still
   * looks too AI-generated. The backgrounds are corny"): a plain tinted sky
   * (the site's sky pastel, so the white cards stand out), white note cards,
   * a ground line; no clouds, hills or rain streaks.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import abcjs from "abcjs";
  import { Heart, Play, RotateCcw, Square, Zap } from "lucide-svelte";
  import GameLevels from "./GameLevels.svelte";
  import StaffPicker from "./StaffPicker.svelte";
  import AssignGame from "./AssignGame.svelte";
  import GameAssignmentBanner from "./GameAssignmentBanner.svelte";
  import { loadGameAssignment, reportGameRound, type OpenGameAssignment } from "../../lib/game-assignment-client";
  import type { GameProgress } from "../../lib/game-assignments";
  import {
    LETTERS, RAIN_LEVELS, START_SPEED, STORM_MS, STRIKES, TWENTY, WRONG_LOCK_MS, abcOf, bumpWeight, checkRainSetup, fallMs, letterOf, lettersOf, maxDrops,
    nameOf, noteLabel, pickStep, poolOf, spawnMs, speedAt, type Letter, type RainSetup,
  } from "../../lib/games/note-rain";

  const SETUP_KEY = "sr-note-rain";
  let setup: RainSetup = (() => {
    try {
      return checkRainSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null"));
    } catch {
      return checkRainSetup(null);
    }
  })();
  $: if (!assignment) try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {}
  /** Opened from a game assignment (?ga=): the teacher's setup, locked; each round's notes named are reported. */
  let assignment: OpenGameAssignment | null = null;
  let assignmentProgress: GameProgress | null = null;
  let customNotes: number[] = setup.level === 0 ? setup.notes ?? [] : RAIN_LEVELS[2]!.steps[setup.clef];

  $: levelCards = RAIN_LEVELS.map((l) => ({ name: l.name, detail: l.steps[setup.clef].length <= 5 ? l.steps[setup.clef].map((s) => letterOf(s)).join(" ") : `${l.steps[setup.clef].length} notes` }));
  $: problem = setup.level === 0 && new Set(customNotes.map(letterOf)).size < 2 ? "Choose at least two notes with different letter names." : null;
  function setLevel(i: number) {
    setup = i < 0 ? { ...setup, level: 0, notes: customNotes } : checkRainSetup({ ...setup, level: i + 1 });
  }
  function setCustom(notes: number[]) {
    customNotes = notes;
    setup = { ...setup, level: 0, notes };
  }
  function setClef(clef: "treble" | "bass") {
    if (clef === setup.clef) return;
    customNotes = RAIN_LEVELS[2]!.steps[clef];
    setup = checkRainSetup({ ...setup, clef, notes: setup.level === 0 ? customNotes : undefined });
  }
  const SPEEDS: [RainSetup["speed"], string][] = [["relaxed", "Relaxed"], ["medium", "Medium"], ["fast", "Fast"], ["extreme", "Extreme"]];
  const ROUNDS: [RainSetup["round"], string, string][] = [
    ["storm", "60-second storm", "Name as many as you can in a minute."],
    ["twenty", "20 notes", "Twenty notes, as fast as they come."],
    ["endless", "Endless", "It keeps getting faster until you run out of strikes."],
  ];

  // ── The round ─────────────────────────────────────────────────────────
  type Drop = { id: number; step: number; born: number; fall: number; x: number; wrong: boolean; p: number };
  let phase: "setup" | "play" | "done" = "setup";
  let drops: Drop[] = [];
  let pool: number[] = [];
  let letters: Letter[] = [];
  let art: Record<number, string> = {};
  let artBox: HTMLDivElement;
  let sky: HTMLDivElement;
  let hud: HTMLDivElement;
  let skyH = 420;
  let startAt = 0;
  let lastSpawn = 0;
  let spawned = 0;
  let named = 0;
  let wrong = 0;
  let strikes = 0;
  let streak = 0;
  let bestStreak = 0;
  let speed = 1;
  let topSpeed = 1;
  let lockUntil = 0;
  let nextId = 1;
  let raf = 0;
  let now = 0;
  let weights: Record<number, number> = {};
  let stats: Record<number, { seen: number; clean: number }> = {};
  let landed: { name: string; at: number } | null = null;
  let lastStep: number | null = null;
  let roundSetup: RainSetup = setup;
  const CARD_H = 112;

  /** Each note of the round drawn once by abcjs, then reused on every card. */
  async function drawArt(s: RainSetup) {
    art = {};
    await tick();
    for (const step of poolOf(s)) {
      const div = document.createElement("div");
      artBox.append(div);
      abcjs.renderAbc(div, `X:1\nM:none\nL:1/1\nK:C clef=${s.clef}\n${abcOf(step)}`, { staffwidth: 40, scale: 1.5, paddingtop: 0, paddingbottom: 0, paddingleft: 0, paddingright: 0 });
      art[step] = div.innerHTML;
      div.remove();
    }
  }

  async function start() {
    if (problem) return;
    roundSetup = setup;
    pool = poolOf(setup);
    letters = lettersOf(setup);
    await drawArt(setup);
    drops = [];
    named = wrong = strikes = streak = bestStreak = spawned = 0;
    weights = {};
    stats = {};
    landed = null;
    lastStep = null;
    phase = "play";
    await tick();
    // The whole game on screen: the strikes, the sky and the answers.
    hud?.scrollIntoView({ block: "start", behavior: "smooth" });
    skyH = sky?.clientHeight ?? 420;
    startAt = performance.now();
    lastSpawn = startAt - 1e9;
    speed = topSpeed = START_SPEED[setup.speed];
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function spawn(t: number) {
    const step = pickStep(pool, weights, lastStep);
    lastStep = step;
    // A lane away from the last card's, so two never sit on top of each other.
    const prev = drops[drops.length - 1]?.x;
    let x = Math.random() * 0.78;
    if (prev !== undefined && Math.abs(x - prev) < 0.22) x = (prev + 0.3 + Math.random() * 0.26) % 0.78;
    drops = [...drops, { id: nextId++, step, born: t, fall: fallMs(speed), x, wrong: false, p: 0 }];
    spawned++;
  }

  function frame(t: number) {
    now = t;
    const elapsed = t - startAt;
    speed = speedAt(elapsed, START_SPEED[roundSetup.speed]);
    topSpeed = Math.max(topSpeed, speed);
    const want = roundSetup.round !== "twenty" || spawned < TWENTY;
    if (want && t - lastSpawn >= spawnMs(speed) && drops.length < maxDrops(speed)) {
      spawn(t);
      lastSpawn = t;
    }
    let lost = 0;
    const kept: Drop[] = [];
    for (const d of drops) {
      d.p = (t - d.born) / d.fall;
      if (d.p >= 1) {
        lost++;
        note(d.step, false);
        weights[d.step] = bumpWeight(weights[d.step] ?? 1, false);
        landed = { name: nameOf(letterOf(d.step), roundSetup.names), at: t };
      } else kept.push(d);
    }
    drops = kept;
    if (lost) {
      strikes += lost;
      streak = 0;
    }
    const over =
      strikes >= STRIKES ||
      (roundSetup.round === "storm" && elapsed >= STORM_MS) ||
      (roundSetup.round === "twenty" && spawned >= TWENTY && !drops.length);
    if (over) return finish();
    raf = requestAnimationFrame(frame);
  }

  function note(step: number, clean: boolean) {
    const s = (stats[step] ??= { seen: 0, clean: 0 });
    s.seen++;
    if (clean) s.clean++;
  }

  /** An answer for the lowest card. */
  function answer(l: Letter) {
    if (phase !== "play" || performance.now() < lockUntil || !drops.length) return;
    const target = drops.reduce((a, b) => (b.p > a.p ? b : a));
    if (letterOf(target.step) === l) {
      note(target.step, !target.wrong);
      weights[target.step] = bumpWeight(weights[target.step] ?? 1, !target.wrong);
      drops = drops.filter((d) => d !== target);
      named++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      wrong++;
      streak = 0;
      target.wrong = true;
      drops = drops;
      // The frame loop moves `now` on, which opens the buttons again.
      lockUntil = performance.now() + WRONG_LOCK_MS;
    }
  }

  function finish() {
    cancelAnimationFrame(raf);
    phase = "done";
    drops = [];
    if (assignment) void reportGameRound(assignment, named).then((p) => p && (assignmentProgress = p));
  }
  function quit() {
    cancelAnimationFrame(raf);
    drops = [];
    phase = "setup";
  }

  /** Solfège keys: each syllable's first letter (s is sol). */
  const SOLFEGE_KEYS: Record<string, Letter> = { d: "C", r: "D", m: "E", f: "F", s: "G", l: "A", t: "B" };
  function keydown(e: KeyboardEvent) {
    if (phase !== "play" || (e.target as HTMLElement)?.closest("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    const l = roundSetup.names === "solfege" ? SOLFEGE_KEYS[k] : (LETTERS as readonly string[]).includes(k.toUpperCase()) ? (k.toUpperCase() as Letter) : undefined;
    if (l && letters.includes(l)) {
      e.preventDefault();
      answer(l);
    } else if (e.key === "Escape") quit();
  }
  onMount(async () => {
    window.addEventListener("keydown", keydown);
    const a = await loadGameAssignment("note-rain");
    if (!a) return;
    assignment = a;
    assignmentProgress = a.progress;
    setup = checkRainSetup(a.setup);
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (typeof window !== "undefined") window.removeEventListener("keydown", keydown);
  });

  $: locked = now < lockUntil;
  $: elapsedNow = Math.max(0, now - startAt);
  $: left = roundSetup.round === "storm" ? `${Math.max(0, Math.ceil((STORM_MS - elapsedNow) / 1000))} s` : roundSetup.round === "twenty" ? `${Math.max(0, TWENTY - spawned + drops.length)} to come` : `${Math.floor(elapsedNow / 1000)} s`;
  $: secondsANote = (fallMs(speed) / 1000).toFixed(1);
  $: tricky = Object.entries(stats)
    .filter(([, s]) => s.seen >= 2 && s.clean / s.seen < 0.8)
    .sort((a, b) => a[1].clean / a[1].seen - b[1].clean / b[1].seen)
    .slice(0, 3)
    .map(([step]) => noteLabel(Number(step)));
  $: accuracy = named + wrong ? Math.round((100 * named) / (named + wrong)) : 0;
</script>

<div class="rain" data-note-rain data-phase={phase}>
  <div class="artbox" bind:this={artBox} aria-hidden="true"></div>

  {#if phase === "setup" || phase === "done"}
    {#if phase === "done"}
      <div class="result" role="status" data-rain-result>
        <p class="big">{named} named</p>
        <p class="text-sm">{wrong} wrong · {accuracy}% right · best run {bestStreak} · fastest {(fallMs(topSpeed) / 1000).toFixed(1)} s a note</p>
        {#if tricky.length}<p class="text-sm">Worth another look: <b>{tricky.join(", ")}</b></p>{/if}
        <button class="sr-btn" on:click={start} disabled={!!problem}><RotateCcw size={16} /> Play again</button>
      </div>
    {/if}
    {#if assignment}
      <GameAssignmentBanner {assignment} progress={assignmentProgress ?? assignment.progress} />
    {:else}
    <GameLevels game="note-rain" levels={levelCards} selected={setup.level - 1} on:select={(e) => setLevel(e.detail)}>
      <div slot="custom">
        <StaffPicker clef={setup.clef} chosen={customNotes} on:change={(e) => setCustom(e.detail)} />
        {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      </div>
      <div class="shared">
        <div class="row" role="group" aria-label="Clef">
          <span>Clef</span>
          <button type="button" class="sr-tok chip" class:sr-on={setup.clef === "treble"} aria-pressed={setup.clef === "treble"} on:click={() => setClef("treble")}>Treble</button>
          <button type="button" class="sr-tok chip" class:sr-on={setup.clef === "bass"} aria-pressed={setup.clef === "bass"} on:click={() => setClef("bass")}>Bass</button>
        </div>
        <div class="row" role="group" aria-label="Starting speed">
          <span>Speed</span>
          {#each SPEEDS as [v, label]}
            <button type="button" class="sr-tok chip" class:sr-on={setup.speed === v} aria-pressed={setup.speed === v} on:click={() => (setup = { ...setup, speed: v })} data-speed={v}>{label}</button>
          {/each}
        </div>
        <p class="help">Every round gets faster as it goes: about twice as fast every 40 seconds.</p>
        <div class="row" role="group" aria-label="Round">
          <span>Round</span>
          {#each ROUNDS as [v, label]}
            <button type="button" class="sr-tok chip" class:sr-on={setup.round === v} aria-pressed={setup.round === v} on:click={() => (setup = { ...setup, round: v })} data-round={v}>{label}</button>
          {/each}
        </div>
        <p class="help">{ROUNDS.find((r) => r[0] === setup.round)?.[2]}</p>
        <div class="row" role="group" aria-label="Answer with">
          <span>Answer with</span>
          <button type="button" class="sr-tok chip" class:sr-on={setup.names === "letters"} aria-pressed={setup.names === "letters"} on:click={() => (setup = { ...setup, names: "letters" })}>Letters</button>
          <button type="button" class="sr-tok chip" class:sr-on={setup.names === "solfege"} aria-pressed={setup.names === "solfege"} on:click={() => (setup = { ...setup, names: "solfege" })}>Solfège (C is do)</button>
        </div>
      </div>
    </GameLevels>
    <AssignGame game="note-rain" {setup} {problem} />
    {/if}
    {#if phase === "setup"}
      <button class="sr-btn start" on:click={start} disabled={!!problem} data-rain-start><Play size={18} /> Start</button>
      <p class="text-xs text-sr-muted text-center">Name the lowest note before it lands. Three strikes. The letter keys answer{setup.names === "solfege" ? " (d r m f s l t)" : ""}.</p>
    {/if}
  {:else}
    <div class="hud" bind:this={hud}>
      <span class="strikes" aria-label="{STRIKES - strikes} of {STRIKES} strikes left">
        {#each Array(STRIKES) as _, i}<Heart size={20} class={i < STRIKES - strikes ? "full" : "gone"} />{/each}
      </span>
      <span class="score" data-rain-named={named}>{named}</span>
      <span class="left">{left}</span>
      <span class="speed" title="How long a note takes to fall"><Zap size={16} /> {secondsANote} s</span>
      <button class="sr-btn-quiet stop" on:click={quit}><Square size={14} /> Stop</button>
    </div>
    <div class="sky" bind:this={sky}>
      {#each drops as d (d.id)}
        <div class="card" class:wrong={d.wrong} style="left: {d.x * 100}%; transform: translateY({d.p * Math.max(0, skyH - CARD_H - 8)}px)" data-drop={d.step}>
          {@html art[d.step] ?? ""}
        </div>
      {/each}
      {#if landed && now - landed.at < 900}<p class="landed" role="status">That was {landed.name}</p>{/if}
      <div class="ground" aria-hidden="true"></div>
    </div>
    <div class="answers" role="group" aria-label="Name the note" style="--n: {letters.length}">
      {#each letters as l, i}
        <button class="ans" disabled={locked} on:click={() => answer(l)} data-letter={l}>
          <span class="k" aria-hidden="true">{roundSetup.names === "solfege" ? nameOf(l, "solfege")[0] : l.toLowerCase()}</span>{nameOf(l, roundSetup.names)}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rain { width: 100%; max-width: 46rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .artbox { position: absolute; left: -9999px; top: 0; width: 120px; }
  .shared { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.6rem; border-top: 1px solid var(--sr-hairline); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
  .row > span { font-weight: 800; font-size: 0.85rem; color: var(--sr-ink-2); min-width: 6.5rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
  .help { font-size: 0.82rem; color: var(--sr-ink-2); margin-top: -0.25rem; padding-left: 6.85rem; }
  @media (max-width: 36rem) { .help { padding-left: 0; } .row > span { min-width: 100%; } }
  .start { align-self: center; font-size: 1.15rem; padding: 0.8rem 2.2rem; display: inline-flex; gap: 0.5rem; align-items: center; }
  .hud { scroll-margin-top: 4.5rem; display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; justify-content: center; font-weight: 800; color: var(--sr-ink); }
  .hud :global(.full) { color: var(--sr-danger); fill: var(--sr-danger); }
  .hud :global(.gone) { color: var(--sr-hairline-2); }
  .strikes { display: inline-flex; gap: 2px; }
  .score { font-family: var(--sr-font-display); font-size: 1.8rem; min-width: 2.5rem; text-align: center; }
  .left, .speed { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.9rem; color: var(--sr-ink-2); }
  .stop { display: inline-flex; gap: 0.35rem; align-items: center; }
  /* A tinted sky so the white cards stand out (Blaine, 18 November 2026: "the white notes on the white background don't look good"). */
  .sky { position: relative; height: clamp(260px, calc(100svh - 13rem), 480px); border-radius: 28px; background: var(--sr-sky); border: 1px solid var(--sr-hairline); overflow: hidden; }
  .card { position: absolute; top: 4px; width: 24%; max-width: 140px; min-width: 100px; height: 112px; padding: 6px 8px; border-radius: 18px; background: #fff; border: 2px solid color-mix(in srgb, var(--sr-sky-ink) 35%, transparent); box-shadow: 0 6px 14px color-mix(in srgb, var(--sr-sky-ink) 22%, transparent); display: flex; align-items: center; justify-content: center; will-change: transform; }
  .card :global(svg) { max-width: 100%; height: auto; }
  .card.wrong { border-color: var(--sr-danger); background: var(--sr-peach); }
  .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: var(--sr-danger-bg); border-top: 2px solid var(--sr-danger); }
  .landed { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); font-weight: 800; color: var(--sr-danger); background: var(--sr-paper); border-radius: 999px; padding: 0.1rem 0.8rem; }
  .answers { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 0.45rem; }
  .ans { position: relative; min-height: 4rem; border-radius: 18px; background: var(--sr-panel); color: var(--sr-ink); border: 2px solid color-mix(in srgb, var(--sr-sky-ink) 35%, transparent); font-family: var(--sr-font-display); font-size: 1.6rem; font-weight: 800; }
  .ans:disabled { opacity: 0.45; }
  .ans:not(:disabled):active { transform: scale(0.97); }
  .k { position: absolute; top: 4px; left: 8px; font-size: 0.7rem; opacity: 0.6; font-family: var(--sr-font-body); }
  .result { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1.1rem; border-radius: 28px; background: var(--sr-mint); color: var(--sr-mint-ink); text-align: center; }
  .result :global(button) { display: inline-flex; gap: 0.4rem; align-items: center; }
  .big { font-family: var(--sr-font-display); font-size: 2rem; font-weight: 800; }
</style>
