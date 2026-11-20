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
   *
   * 20 November 2026, the play screen redone (design by Gemini 4 Neon, spec in
   * docs/claude/games.md): the HUD one panel, the sky a soft token gradient with
   * faint staves, a red landing rail, the lowest card ringed blue with a Next
   * tag (Try again after a miss), a named card pops out mint, and the answers
   * are keycaps that sink while locked instead of greying out.
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
  /** The landing rail's height (the .ground below); cards stop on it. */
  const GROUND_H = 14;
  /** A card named right lingers this long, popping out, then goes. */
  const POP_MS = 220;
  let pops: { id: number; step: number; x: number; y: number; at: number; name: string }[] = [];
  /** The letter key just pressed on the keyboard, shown pressed on its button. */
  let pressed: Letter | null = null;
  let pressedTimer = 0;
  const fallY = (p: number) => p * Math.max(0, skyH - CARD_H - GROUND_H - 8);

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
    pops = [];
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
    if (pops.length && pops.some((p) => t - p.at >= POP_MS)) pops = pops.filter((p) => t - p.at < POP_MS);
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
      pops = [...pops, { id: target.id, step: target.step, x: target.x, y: fallY(target.p), at: performance.now(), name: nameOf(l, roundSetup.names) }];
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
    pops = [];
    if (assignment) void reportGameRound(assignment, named).then((p) => p && (assignmentProgress = p));
  }
  function quit() {
    cancelAnimationFrame(raf);
    drops = [];
    pops = [];
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
      pressed = l;
      clearTimeout(pressedTimer);
      pressedTimer = window.setTimeout(() => (pressed = null), 120);
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
    clearTimeout(pressedTimer);
    if (typeof window !== "undefined") window.removeEventListener("keydown", keydown);
  });

  $: locked = now < lockUntil;
  /** The card to name: the lowest. */
  $: targetId = drops.length ? drops.reduce((a, b) => (b.p > a.p ? b : a)).id : 0;
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
        <dl class="stats">
          <div><dt>Wrong</dt><dd>{wrong}</dd></div>
          <div><dt>Right</dt><dd>{accuracy}%</dd></div>
          <div><dt>Best run</dt><dd>{bestStreak}</dd></div>
          <div><dt>Fastest</dt><dd>{(fallMs(topSpeed) / 1000).toFixed(1)} s</dd></div>
        </dl>
        {#if tricky.length}<p class="tricky">Worth another look: <b>{tricky.join(", ")}</b></p>{/if}
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
      <span class="metrics">
        <span class="score" data-rain-named={named}>{named}</span>
        <span class="left">{left}</span>
        <span class="speed" title="How long a note takes to fall"><Zap size={14} /> {secondsANote} s</span>
      </span>
      <button class="sr-btn-quiet stop" on:click={quit}><Square size={14} /> Stop</button>
    </div>
    <div class="sky" bind:this={sky}>
      {#each drops as d (d.id)}
        <div class="card" class:target={d.id === targetId} class:wrong={d.wrong} style="left: {d.x * 100}%; transform: translateY({fallY(d.p)}px) scale(var(--lift, 1))" data-drop={d.step}>
          {#if d.wrong}<span class="tag">Try again</span>{:else if d.id === targetId}<span class="tag">Next</span>{/if}
          <div class="paper">{@html art[d.step] ?? ""}</div>
        </div>
      {/each}
      {#each pops as p (p.id)}
        <div class="card pop" style="left: {p.x * 100}%; transform: translateY({p.y}px)" aria-hidden="true">
          <span class="tag">✓ {p.name}</span>
          <div class="paper">{@html art[p.step] ?? ""}</div>
        </div>
      {/each}
      {#if landed && now - landed.at < 1150}<p class="landed" role="status">That was <b>{landed.name}</b></p>{/if}
      <div class="ground" aria-hidden="true"></div>
    </div>
    <div class="answers" role="group" aria-label="Name the note" style="--n: {letters.length}">
      {#each letters as l, i}
        <button class="ans" class:solfege={roundSetup.names === "solfege"} class:pressed={pressed === l} disabled={locked} on:click={() => answer(l)} data-letter={l}>
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
  /* The play screen (20 November 2026, design by Gemini 4 Neon; every colour a token, the score paper white). */
  .hud { scroll-margin-top: 4.5rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 3.25rem; padding: 0.45rem 0.75rem; border-radius: 22px; background: var(--sr-panel); border: 1px solid var(--sr-hairline); box-shadow: var(--sr-card-shadow); font-weight: 800; color: var(--sr-ink); }
  .strikes { display: inline-flex; gap: 4px; padding: 0.3rem 0.55rem; border-radius: 999px; background: color-mix(in srgb, var(--sr-danger-bg) 55%, var(--sr-panel)); }
  .hud :global(.full) { color: var(--sr-danger); fill: var(--sr-danger); }
  .hud :global(.gone) { color: color-mix(in srgb, var(--sr-danger) 24%, var(--sr-hairline)); fill: none; }
  .metrics { display: inline-flex; align-items: center; gap: 0.45rem; font-variant-numeric: tabular-nums; }
  .score { font-family: var(--sr-font-display); font-size: 1.45rem; font-weight: 700; line-height: 1.2; min-width: 2.75rem; text-align: center; padding: 0.15rem 0.7rem; border-radius: 999px; background: var(--sr-mint); color: var(--sr-mint-ink); }
  .left, .speed { display: inline-flex; align-items: center; gap: 0.2rem; white-space: nowrap; font-size: 0.85rem; padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--sr-track); color: var(--sr-ink-2); }
  .speed :global(svg) { color: var(--sr-action-fg); }
  .stop { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.85rem; }
  @media (max-width: 27.5rem) {
    .hud { padding: 0.38rem 0.5rem; gap: 0.3rem; }
    .strikes { padding: 0.25rem 0.4rem; gap: 2px; }
    .strikes :global(svg) { width: 17px; height: 17px; }
    .metrics { gap: 0.3rem; }
    .score { font-size: 1.25rem; min-width: 2.3rem; padding: 0.1rem 0.5rem; }
    .left, .speed { font-size: 0.78rem; padding: 0.22rem 0.45rem; }
    .stop { font-size: 0.8rem; padding: 0.32rem 0.6rem; }
  }
  /* A tinted sky so the white cards stand out (Blaine, 18 November 2026: "the white notes on the white background don't look good"); faint staves for texture, no scenery. */
  .sky { position: relative; height: clamp(270px, calc(100svh - 13.5rem), 460px); border-radius: var(--sr-r-lg); overflow: hidden; border: 1.5px solid color-mix(in srgb, var(--sr-sky-ink) 18%, var(--sr-hairline)); box-shadow: inset 0 2px 12px color-mix(in srgb, var(--sr-sky-ink) 9%, transparent), var(--sr-card-shadow);
    background: linear-gradient(180deg, color-mix(in srgb, var(--sr-sky) 50%, var(--sr-panel)) 0%, var(--sr-sky) 56%, color-mix(in srgb, var(--sr-sky) 80%, var(--sr-mat)) 84%, color-mix(in srgb, var(--sr-danger-bg) 52%, var(--sr-sky)) 100%); }
  .sky::before { content: ""; position: absolute; inset: 0; pointer-events: none; --st: color-mix(in srgb, var(--sr-sky-ink) 8%, transparent);
    background-image: linear-gradient(180deg, var(--st) 0 1px, transparent 1px 10px, var(--st) 10px 11px, transparent 11px 20px, var(--st) 20px 21px, transparent 21px 30px, var(--st) 30px 31px, transparent 31px 40px, var(--st) 40px 41px, transparent 41px);
    background-size: 100% 148px; background-position: 0 36px; }
  .card { position: absolute; top: 8px; z-index: 1; width: 24%; max-width: 144px; min-width: 108px; height: 112px; padding: 4px; border-radius: var(--sr-r-md); background: var(--sr-panel); border: 2px solid color-mix(in srgb, var(--sr-sky-ink) 22%, var(--sr-hairline)); box-shadow: 0 6px 14px -4px color-mix(in srgb, var(--sr-sky-ink) 18%, transparent); will-change: transform; }
  .paper { width: 100%; height: 100%; border-radius: 12px; background: #fff; padding: 4px 6px; display: flex; align-items: center; justify-content: center; }
  .paper :global(svg) { max-width: 100%; height: auto; }
  .tag { position: absolute; top: -11px; left: 50%; z-index: 1; transform: translateX(-50%); white-space: nowrap; font-size: 10.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; background: var(--sr-action); color: var(--sr-action-ink); box-shadow: 0 2px 6px color-mix(in srgb, var(--sr-action) 35%, transparent); }
  /* The lowest card, the one the answer goes to. */
  .card.target { --lift: 1.04; z-index: 3; background: color-mix(in srgb, var(--sr-tint) 65%, var(--sr-panel)); border: 3px solid var(--sr-action); box-shadow: 0 0 0 4px color-mix(in srgb, var(--sr-action) 20%, transparent), 0 12px 24px -8px color-mix(in srgb, var(--sr-action) 42%, transparent); }
  .card.wrong { z-index: 4; background: var(--sr-peach); border: 3px solid var(--sr-danger); box-shadow: 0 0 0 4px color-mix(in srgb, var(--sr-danger) 20%, transparent), 0 10px 22px -6px color-mix(in srgb, var(--sr-danger) 35%, transparent); }
  .card.wrong .tag { background: var(--sr-danger); }
  .card.wrong .paper { animation: shake 280ms ease-out; }
  .card.pop { z-index: 5; pointer-events: none; background: var(--sr-mint); border: 3px solid var(--sr-mint-ink); box-shadow: 0 0 0 5px color-mix(in srgb, var(--sr-mint) 65%, transparent); animation: fade 220ms ease-out forwards; }
  .card.pop .tag { background: var(--sr-mint-ink); color: var(--sr-mint); text-transform: none; }
  .card.pop .paper { animation: pop 220ms ease-out forwards; }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
  @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.08) translateY(-4px); } 100% { transform: scale(1.16) translateY(-14px); } }
  @keyframes fade { 0%, 40% { opacity: 1; } 100% { opacity: 0; } }
  /* The landing rail, with a faint red blush above it. */
  .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: var(--sr-danger-bg); border-top: 3px solid var(--sr-danger); box-shadow: 0 -2px 10px color-mix(in srgb, var(--sr-danger) 18%, transparent); }
  .ground::before { content: ""; position: absolute; left: 0; right: 0; bottom: 14px; height: 38px; pointer-events: none; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--sr-danger) 14%, transparent)); }
  .landed { position: absolute; bottom: 22px; left: 50%; z-index: 6; pointer-events: none; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; font-size: 0.95rem; font-weight: 800; color: var(--sr-ink-2); background: var(--sr-panel); border: 2px solid var(--sr-danger); border-radius: 999px; padding: 0.3rem 0.45rem 0.3rem 1rem; box-shadow: 0 10px 24px -6px color-mix(in srgb, var(--sr-danger) 35%, transparent); animation: toast 160ms ease-out; }
  .landed b { font-family: var(--sr-font-display); font-size: 1.2rem; font-weight: 700; padding: 0.05rem 0.6rem; border-radius: 999px; background: var(--sr-danger-bg); color: var(--sr-danger); }
  @keyframes toast { from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.94); } }
  /* The answers: keycaps with a blue edge; while locked after a miss they sink and warm, not grey out. */
  .answers { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 0.5rem; padding-bottom: 4px; }
  .ans { position: relative; min-height: 4.1rem; border-radius: var(--sr-r-md); background: var(--sr-panel); color: var(--sr-ink); border: 2px solid color-mix(in srgb, var(--sr-action) 42%, var(--sr-hairline)); box-shadow: 0 4px 0 color-mix(in srgb, var(--sr-action) 52%, var(--sr-sky)), 0 8px 16px -10px color-mix(in srgb, var(--sr-sky-ink) 35%, transparent); font-family: var(--sr-font-display); font-size: clamp(1.15rem, 4.2vw, 1.65rem); font-weight: 600; touch-action: manipulation; transition: transform 60ms ease-out, box-shadow 60ms ease-out; }
  .ans.solfege { font-size: clamp(0.95rem, 3.6vw, 1.35rem); }
  @media (hover: hover) { .ans:not(:disabled):hover { background: color-mix(in srgb, var(--sr-tint) 55%, var(--sr-panel)); border-color: var(--sr-action); color: var(--sr-action-fg); } }
  .ans:focus-visible { outline: 2.5px solid var(--sr-action-fg); outline-offset: 2px; }
  .ans:not(:disabled):active, .ans.pressed:not(:disabled) { transform: translateY(3px); background: var(--sr-tint); border-color: var(--sr-action); color: var(--sr-action-fg); box-shadow: 0 1px 0 color-mix(in srgb, var(--sr-action) 65%, var(--sr-sky)); }
  .ans:disabled { cursor: not-allowed; transform: translateY(3px); background: color-mix(in srgb, var(--sr-peach) 28%, var(--sr-track)); border-color: color-mix(in srgb, var(--sr-danger) 28%, var(--sr-hairline)); color: var(--sr-faint); box-shadow: 0 1px 0 color-mix(in srgb, var(--sr-danger) 20%, var(--sr-hairline)); }
  .k { position: absolute; top: 6px; left: 7px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 6px; background: var(--sr-track); border: 1px solid var(--sr-hairline); color: var(--sr-muted); font-family: var(--sr-font-body); font-size: 0.68rem; font-weight: 800; line-height: 16px; text-transform: uppercase; }
  @media (max-width: 27.5rem) { .answers { gap: 0.35rem; } .k { display: none; } }
  @media (hover: none) and (pointer: coarse) { .k { display: none; } }
  @media (prefers-reduced-motion: reduce) {
    .card.target { --lift: 1; }
    .card, .paper, .ans, .landed { animation: none !important; transition: none !important; }
    .card.pop { display: none; }
  }
  .result { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.4rem 1.25rem; border-radius: var(--sr-r-lg); background: var(--sr-mint); color: var(--sr-mint-ink); text-align: center; }
  .result :global(button) { display: inline-flex; gap: 0.4rem; align-items: center; }
  .big { font-family: var(--sr-font-display); font-size: 2.5rem; font-weight: 700; line-height: 1.1; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; width: 100%; max-width: 30rem; }
  .stats div { border-radius: var(--sr-r-sm); padding: 0.55rem 0.7rem; background: var(--sr-panel); color: var(--sr-ink); }
  .stats dt { font-size: 0.75rem; font-weight: 800; color: var(--sr-muted); }
  .stats dd { font-family: var(--sr-font-display); font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  @media (max-width: 27.5rem) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .tricky { font-size: 0.9rem; }
  .tricky b { padding: 0.1rem 0.6rem; border-radius: 999px; background: var(--sr-butter); color: var(--sr-butter-ink); }
</style>
