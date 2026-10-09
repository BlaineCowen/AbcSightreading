<script lang="ts">
  /**
   * Piano sight reading (src/lib/piano/): a grand staff, a tune over an
   * accompaniment. Every option is on the page at every level, each marked
   * with the level that first uses it; a level only fills them in (Blaine:
   * no options appearing as the levels go up). Kept small on purpose: the
   * shared playback bar, the monthly allowance and the copyright line.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import PlaybackBar from "./PlaybackBar.svelte";
  import GenerationLimit from "./GenerationLimit.svelte";
  import CountInBadge from "./CountInBadge.svelte";
  import { countGeneration, mayGenerate } from "../lib/usage";
  import { withCopyright, styleCopyright } from "../lib/copyright";
  import { countInMeasures, showCountIn, hideCountIn } from "../lib/count-in";
  import { drumPatternFor } from "../lib/playback-click";
  import { DEFAULT_CLICK_SOUND } from "../lib/tuner/click-sounds";
  import { beatsOf, beatSymbolOf } from "../lib/meter";
  import {
    ALL_KEYS,
    ALL_LENGTHS,
    ALL_METERS,
    ALL_PATTERNS,
    PIANO_LEVELS,
    RHYTHM_CHOICES,
    pianoLevelById,
    settingsFor,
    unlockedAt,
    type Accompaniment,
    type ChordChoice,
    type LeftHandPattern,
    type PianoSettings,
    type TuneHand,
  } from "../lib/piano/levels";
  import { generatePianoExercise, keyName, type PianoExercise } from "../lib/piano/generatePiano";
  import { settingsFromQuery, settingsQuery } from "../lib/piano/settings-link";
  import PianoGrade from "./PianoGrade.svelte";
  import { createFollower } from "../lib/piano/follow";

  const HANDS = ["Right hand", "Left hand"];
  const PATTERN_NAMES: Record<Accompaniment, string> = {
    tune: "Taking turns",
    root: "Held root",
    fifth: "Open fifths",
    rocking: "Rocking fifths",
    block: "Block chords",
    blockBeats: "Chords on each beat",
    oompah: "Oom-pah",
    broken: "Broken chords",
    arpeggio: "Arpeggios",
    waltz: "Waltz bass (3/4)",
    brokenEighths: "Broken chords in eighths",
    alberti: "Alberti bass",
    albertiSixteenths: "Alberti in sixteenths",
  };
  const TUNE_HANDS: { id: TuneHand; label: string }[] = [
    { id: "right", label: "Right hand" },
    { id: "left", label: "Left hand" },
    { id: "either", label: "Either" },
  ];
  const SKIPS = [
    { n: 1, label: "Steps" }, { n: 2, label: "3rd" }, { n: 3, label: "4th" }, { n: 4, label: "5th" }, { n: 5, label: "6th" }, { n: 7, label: "Octave" },
  ];
  const REACHES = [{ n: 4, label: "Five-finger" }, { n: 5, label: "A 6th" }, { n: 7, label: "An octave" }];
  const CHORD_CHOICES: ChordChoice[] = ["I", "V", "IV", "V7", "ii", "vi"];
  /** The figures as the Unison page draws them (src/assets/svgs, one per rhythm name). */
  const rhythmSvgs: Record<string, Promise<{ default: string }>> = Object.fromEntries(
    RHYTHM_CHOICES.map((r) => [r.name, import(`../assets/svgs/${r.name}.svg?raw`)]),
  );
  const keyLabel = (k: string) => k.replace("b", "♭").replace("#", "♯").replace(/m$/, " min");

  // The level each option first appears at, for its mark.
  const at = {
    key: (k: string) => unlockedAt((s) => s.keys.includes(k)),
    meter: (m: string) => unlockedAt((s) => s.meters.includes(m)),
    bars: (n: number) => unlockedAt((s) => s.measures >= n),
    rhythm: (r: string) => unlockedAt((s) => s.rhythms.includes(r)),
    skip: (n: number) => unlockedAt((s) => s.maxSkip >= n),
    reach: (n: number) => unlockedAt((s) => s.reach >= n),
    together: unlockedAt((s) => s.together),
    tune: (t: TuneHand) => (t === "right" ? 1 : unlockedAt((s) => s.tuneHand === "either" || s.tuneHand === t)),
    pattern: (p: LeftHandPattern) => unlockedAt((s) => s.together && s.patterns.includes(p)),
    chord: (c: ChordChoice) => unlockedAt((s) => s.chords.includes(c)),
    chromatic: unlockedAt((s) => s.chromatic),
    doubleNotes: unlockedAt((s) => s.doubleNotes),
    dynamics: unlockedAt((s) => s.dynamics),
  };

  let levelId = PIANO_LEVELS[2].id;
  let settings: PianoSettings = settingsFor(levelId);
  let clickOn = true;
  let looping = false;
  let isPlaying = false;
  let isPreparing = false;
  let isGenerating = false;
  let mutedVoices = new Set<string>();
  let exercise: PianoExercise | null = null;
  let error = "";
  let synthControl: any = null;
  let renderedTune: any = null;
  let generatedBpm = 72;
  let narrow = false;

  $: level = pianoLevelById[levelId] ?? PIANO_LEVELS[0];
  $: edited = JSON.stringify(settings) !== JSON.stringify(level.settings);
  $: bpm = settings.bpm;

  const settingsLink = () => `${location.origin}/piano-sightreading?${settingsQuery(levelId, settings)}`;

  function chooseLevel(id: string) {
    levelId = id;
    settings = settingsFor(id);
  }

  /** A choice in a list turned on or off; the last one cannot be turned off (nothing to draw from). */
  function toggle<T>(items: T[], item: T): T[] {
    if (items.includes(item)) return items.length > 1 ? items.filter((x) => x !== item) : items;
    return [...items, item];
  }

  async function generate() {
    if (isGenerating) return;
    if (!(await mayGenerate())) return;
    isGenerating = true;
    error = "";
    pausePlayback();
    try {
      // Let the page paint "Writing…" before the main thread is busy.
      await tick();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      // A level's own settings title the score with the level; edited ones with the key alone.
      const ex = generatePianoExercise({ settings, levelId: edited ? undefined : levelId, barsPerLine: narrow ? 2 : 4 });
      exercise = ex;
      generatedBpm = settings.bpm;
      history.replaceState(null, "", `${location.pathname}?${settingsQuery(levelId, settings)}`);
      await tick();
      await render();
      void countGeneration();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      isGenerating = false;
    }
  }

  async function render() {
    if (!exercise) return;
    const abcjs = (await import("abcjs")).default;
    const tunes = abcjs.renderAbc("paper", withCopyright(exercise.abc), {
      add_classes: true,
      responsive: "resize",
      staffwidth: 760,
    });
    renderedTune = tunes[0];
    styleCopyright(document.getElementById("paper"));
    await buildSynth();
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  let lit: Element[] = [];
  // Playback keeps the line being played on screen (follow.ts).
  const follower = createFollower();
  function light(els: Element[]) {
    for (const e of lit) e.classList.remove("piano-now");
    lit = els;
    for (const e of lit) e.classList.add("piano-now");
    follower.follow(els);
  }

  async function buildSynth() {
    if (!renderedTune || !exercise) return;
    const abcjs = (await import("abcjs")).default;
    try { synthControl?.destroy?.(); } catch {}
    synthControl = new abcjs.synth.SynthController();
    const playedMeter = exercise.meter;
    const cursorControl = {
      extraMeasuresAtBeginning: countInMeasures(playedMeter),
      beatSubdivisions: 2,
      onBeat: (beat: number) => showCountIn(playedMeter, beat),
      onEvent: (event: any) => light((event?.elements ?? []).flat()),
      onFinished: () => {
        isPlaying = false;
        follower.reset();
        light([]);
        hideCountIn();
        if (looping && synthControl) synthControl.play().then(() => (isPlaying = true));
      },
    };
    const voicesOff = HANDS.map((h, i) => (mutedVoices.has(h) ? i : -1)).filter((i) => i >= 0);
    const drum = clickOn
      ? drumPatternFor({ beats: beatsOf(playedMeter), subdivision: 1, accent: true, sound: DEFAULT_CLICK_SOUND })
      : "";
    await synthControl.setTune(renderedTune, false, {
      soundFontUrl: "/api/soundfont/",
      soundFontVolumeMultiplier: 3.0,
      drumIntro: countInMeasures(playedMeter),
      ...(drum ? { drum, drumBars: 1 } : {}),
      ...(voicesOff.length ? { voicesOff } : {}),
    });
    await synthControl.load("#piano-audio", cursorControl, { displayWarp: true });
    if (settings.bpm !== generatedBpm) setWarp();
  }

  function setWarp() {
    try { synthControl?.setWarp(Math.round((settings.bpm / generatedBpm) * 100)); } catch {}
  }

  async function handlePlay() {
    if (!synthControl || isPreparing) return;
    isPreparing = true;
    try {
      const abcjs = (await import("abcjs")).default;
      const ctx = abcjs.synth.activeAudioContext?.();
      if (ctx && ctx.state !== "running") await ctx.resume();
      await synthControl.play();
      isPlaying = true;
    } finally {
      isPreparing = false;
    }
  }

  /** abcjs's play() toggles isStarted and pause() never resets it; see AbcjsChoral pausePlayback. */
  function pausePlayback() {
    if (!synthControl) return;
    synthControl.pause();
    synthControl.isStarted = false;
    isPlaying = false;
  }

  function rewind() {
    if (!synthControl) return;
    pausePlayback();
    synthControl.seek(0);
    follower.reset();
    light([]);
    hideCountIn();
  }

  async function toggleMute(hand: string) {
    const next = new Set(mutedVoices);
    next.has(hand) ? next.delete(hand) : next.add(hand);
    mutedVoices = next;
    pausePlayback();
    await buildSynth();
  }

  async function toggleClick() {
    clickOn = !clickOn;
    pausePlayback();
    await buildSynth();
  }

  onMount(() => {
    // The page's loading skeleton (AppSkeleton) is ours to take down, as the other practice pages do.
    document.querySelectorAll("[data-skeleton]").forEach((el) => el.remove());
    narrow = window.innerWidth <= 640;
    ({ levelId, settings } = settingsFromQuery(location.search));
    void generate();
  });
  onDestroy(() => {
    try { synthControl?.destroy?.(); } catch {}
    hideCountIn();
  });
</script>

<div class="w-full max-w-5xl flex flex-col gap-4 pb-40">
  <section class="sr-panel p-4 sm:p-5 flex flex-col gap-5" aria-label="Exercise settings">
    <div class="flex flex-col gap-2">
      <span class="sr-label">Level {#if edited}<span class="edited">edited</span>{/if}</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Level">
        {#each PIANO_LEVELS as l (l.id)}
          <button type="button" class="sr-tok {l.id === levelId && !edited ? 'sr-on' : ''} {l.id === levelId && edited ? 'sr-was' : ''}" aria-pressed={l.id === levelId} title={l.summary} on:click={() => chooseLevel(l.id)}>{l.number}</button>
        {/each}
      </div>
      <p class="text-sm text-sr-muted">{level.label}: {level.summary}. <span class="text-sr-faint">About {level.compare}.</span></p>
      <p class="text-xs text-sr-faint">A level fills in the choices below; every one can be changed. The small number on a choice is the level that first uses it.</p>
    </div>

    <div class="grid gap-5 md:grid-cols-2">
      <div class="flex flex-col gap-2">
        <span class="sr-label">Keys</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Major keys">
          {#each ALL_KEYS.major as k}
            <button type="button" class="sr-tok chip {settings.keys.includes(k) ? 'sr-on' : ''}" aria-pressed={settings.keys.includes(k)} on:click={() => (settings = { ...settings, keys: toggle(settings.keys, k) })}>{keyLabel(k)}<sup>{at.key(k) ?? ""}</sup></button>
          {/each}
        </div>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Minor keys">
          {#each ALL_KEYS.minor as k}
            <button type="button" class="sr-tok chip {settings.keys.includes(k) ? 'sr-on' : ''}" aria-pressed={settings.keys.includes(k)} on:click={() => (settings = { ...settings, keys: toggle(settings.keys, k) })}>{keyLabel(k)}<sup>{at.key(k) ?? ""}</sup></button>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <span class="sr-label">Meters</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Meters">
            {#each ALL_METERS as m}
              <button type="button" class="sr-tok chip {settings.meters.includes(m) ? 'sr-on' : ''}" aria-pressed={settings.meters.includes(m)} on:click={() => (settings = { ...settings, meters: toggle(settings.meters, m) })}>{m}<sup>{at.meter(m) ?? ""}</sup></button>
            {/each}
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <span class="sr-label">Bars</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Bars">
            {#each ALL_LENGTHS as n}
              <button type="button" class="sr-tok chip {settings.measures === n ? 'sr-on' : ''}" aria-pressed={settings.measures === n} on:click={() => (settings = { ...settings, measures: n })}>{n}<sup>{at.bars(n) ?? ""}</sup></button>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="sr-label">Rhythms</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Rhythms">
        {#each RHYTHM_CHOICES as r}
          <button
            type="button"
            class="sr-tok-sq rhythm-tile relative px-2 py-1 h-12 min-w-12 flex items-center justify-center {settings.rhythms.includes(r.name) ? 'sr-on' : ''}"
            aria-label={r.label}
            title={r.label}
            aria-pressed={settings.rhythms.includes(r.name)}
            on:click={() => (settings = { ...settings, rhythms: toggle(settings.rhythms, r.name) })}
          >
            {#await rhythmSvgs[r.name]}
              <span class="text-xs">…</span>
            {:then svg}
              <span class="rhythm-icon">{@html svg.default}</span>
            {:catch}
              <span class="text-xs">{r.label}</span>
            {/await}
            <span class="tile-level" aria-hidden="true">{at.rhythm(r.name) ?? ""}</span>
          </button>
        {/each}
      </div>
      <p class="text-xs text-sr-faint">6/8 uses its own figures to match: dotted quarters and three eighths, and sixteenths when sixteenths are chosen.</p>
    </div>

    <div class="grid gap-5 md:grid-cols-2">
      <div class="flex flex-col gap-2">
        <span class="sr-label">Largest skip in the tune</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Largest skip">
          {#each SKIPS as k}
            <button type="button" class="sr-tok chip {settings.maxSkip === k.n ? 'sr-on' : ''}" aria-pressed={settings.maxSkip === k.n} on:click={() => (settings = { ...settings, maxSkip: k.n })}>{k.label}<sup>{at.skip(k.n) ?? ""}</sup></button>
          {/each}
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="sr-label">The tune's reach</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Reach">
          {#each REACHES as r}
            <button type="button" class="sr-tok chip {settings.reach === r.n ? 'sr-on' : ''}" aria-pressed={settings.reach === r.n} on:click={() => (settings = { ...settings, reach: r.n })}>{r.label}<sup>{at.reach(r.n) ?? ""}</sup></button>
          {/each}
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="sr-label">Hands</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Hands">
          <button type="button" class="sr-tok chip {!settings.together ? 'sr-on' : ''}" aria-pressed={!settings.together} on:click={() => (settings = { ...settings, together: false })}>Taking turns<sup>1</sup></button>
          <button type="button" class="sr-tok chip {settings.together ? 'sr-on' : ''}" aria-pressed={settings.together} on:click={() => (settings = { ...settings, together: true })}>Together<sup>{at.together ?? ""}</sup></button>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="sr-label">Tune in</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Tune in">
          {#each TUNE_HANDS as h}
            <button type="button" class="sr-tok chip {settings.tuneHand === h.id ? 'sr-on' : ''}" aria-pressed={settings.tuneHand === h.id} disabled={!settings.together && h.id !== "right"} on:click={() => (settings = { ...settings, tuneHand: h.id })}>{h.label}<sup>{at.tune(h.id) ?? ""}</sup></button>
          {/each}
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="sr-label">Accompaniment</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Accompaniment patterns">
        {#each ALL_PATTERNS as p}
          <button type="button" class="sr-tok chip {settings.patterns.includes(p) ? 'sr-on' : ''}" aria-pressed={settings.patterns.includes(p)} disabled={!settings.together} on:click={() => (settings = { ...settings, patterns: toggle(settings.patterns, p) })}>{PATTERN_NAMES[p]}<sup>{at.pattern(p) ?? ""}</sup></button>
        {/each}
      </div>
      <p class="text-xs text-sr-faint">
        {#if settings.together}Each exercise draws one, from those that suit its meter. With the tune in the left hand, the right hand holds the chords or plays them on each beat.{:else}With the hands taking turns there is no accompaniment: one tune passes between the hands.{/if}
      </p>
    </div>

    <div class="grid gap-5 md:grid-cols-2">
      <div class="flex flex-col gap-2">
        <span class="sr-label">Chords</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Chords">
          {#each CHORD_CHOICES as c}
            <button type="button" class="sr-tok chip {settings.chords.includes(c) ? 'sr-on' : ''}" aria-pressed={settings.chords.includes(c)} on:click={() => (settings = { ...settings, chords: toggle(settings.chords, c) })}>{c}<sup>{at.chord(c) ?? ""}</sup></button>
          {/each}
          <button type="button" class="sr-tok chip {settings.chromatic ? 'sr-on' : ''}" aria-pressed={settings.chromatic} on:click={() => (settings = { ...settings, chromatic: !settings.chromatic })}>V of V, vi, ii<sup>{at.chromatic ?? ""}</sup></button>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="sr-label">Also</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Also">
          <button type="button" class="sr-tok chip {settings.dynamics ? 'sr-on' : ''}" aria-pressed={settings.dynamics} on:click={() => (settings = { ...settings, dynamics: !settings.dynamics })}>Dynamics<sup>{at.dynamics ?? ""}</sup></button>
          <button type="button" class="sr-tok chip {settings.doubleNotes ? 'sr-on' : ''}" aria-pressed={settings.doubleNotes} on:click={() => (settings = { ...settings, doubleNotes: !settings.doubleNotes })}>3rds and 6ths at cadences<sup>{at.doubleNotes ?? ""}</sup></button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="sr-btn" on:click={generate} disabled={isGenerating}>{isGenerating ? "Writing…" : "New exercise"}</button>
      <GenerationLimit part="counter" />
    </div>
  </section>

  <GenerationLimit part="alert" />
  {#if error}
    <p class="sr-panel p-4 text-sm" role="alert">{error}</p>
  {/if}

  {#if exercise}
    <p class="text-sm text-sr-muted px-1">
      {keyName(exercise.key)} · {exercise.meter} · {exercise.progression} ·
      {#if exercise.pattern === "tune"}hands taking turns{:else if exercise.tuneHand === "left"}tune in the left hand, right hand: {PATTERN_NAMES[exercise.pattern]}{:else}left hand: {PATTERN_NAMES[exercise.pattern]}{/if}
    </p>
  {/if}
  {#if exercise}
    <PianoGrade {exercise} tune={renderedTune} bpm={settings.bpm} onStart={pausePlayback} />
  {/if}
  <CountInBadge />
  <div id="paper" class="sr-sheet w-full" class:hidden={!exercise}></div>
  <div id="piano-audio" class="hidden"></div>
</div>

<PlaybackBar
  {isPlaying}
  {bpm}
  beatSymbol={beatSymbolOf(exercise?.meter ?? settings.meters[0])}
  {looping}
  voiceNames={HANDS}
  {mutedVoices}
  hasExercise={!!exercise}
  {isPreparing}
  {isGenerating}
  onPlay={handlePlay}
  onPause={pausePlayback}
  onStop={rewind}
  onRestart={rewind}
  onBpmChange={(b) => { settings = { ...settings, bpm: b }; setWarp(); }}
  onToggleLoop={() => (looping = !looping)}
  onToggleMute={toggleMute}
  onGenerate={generate}
  {settingsLink}
  onPrint={() => window.print()}
>
  <svelte:fragment slot="extra">
    <button
      type="button"
      class="flex-shrink-0 rounded-full px-3 h-11 xl:h-8 text-sm font-bold {clickOn ? 'opacity-100' : 'opacity-50'}"
      aria-pressed={clickOn}
      title={clickOn ? "Click on: turn it off" : "Click off: turn it on"}
      on:click={toggleClick}
    >Click</button>
  </svelte:fragment>
</PlaybackBar>

<style>
  :global(#paper .piano-now) {
    fill: var(--sr-action);
  }
  /* The level a choice first appears at: small, beside its name. */
  .chip sup {
    font-size: 10px;
    font-weight: 700;
    margin-left: 4px;
    opacity: 0.6;
    top: -0.4em;
  }
  /* The level a rhythm is first used at, in the tile's corner. */
  .tile-level {
    position: absolute;
    top: 2px;
    right: 5px;
    font-size: 10px;
    font-weight: 700;
    opacity: 0.6;
  }
  .rhythm-tile {
    padding-right: 14px;
  }
  .edited {
    font-size: 11px;
    font-weight: 700;
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
  }
  /* The level the choices started from, once they have been changed. */
  .sr-was {
    border-color: var(--sr-action);
  }
</style>
