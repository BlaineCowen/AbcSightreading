<script lang="ts">
  /**
   * Piano sight reading (src/lib/piano/): a grand staff, the right hand's tune
   * over the left hand's accompaniment, at eight levels in method-book order.
   * Kept small on purpose: the shared playback bar, the monthly allowance and
   * the copyright line, but none of the singing pages' tools yet.
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
  import { PIANO_LEVELS, pianoLevelById, patternsFor, type LeftHandPattern } from "../lib/piano/levels";
  import { generatePianoExercise, type PianoExercise } from "../lib/piano/generatePiano";

  const HANDS = ["Right hand", "Left hand"];
  const PATTERN_NAMES: Record<LeftHandPattern, string> = {
    tune: "Taking turns",
    root: "Held root",
    fifth: "Open fifths",
    block: "Block chords",
    blockBeats: "Chords on each beat",
    broken: "Broken chords",
    waltz: "Waltz bass",
    alberti: "Alberti bass",
  };

  let levelId = PIANO_LEVELS[2].id;
  let key = "any";
  let meter = "4/4";
  let measures = 8;
  let pattern: LeftHandPattern | "any" = "any";
  let bpm = 72;
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
  $: patterns = level.together ? patternsFor(level, meter) : [];
  // A choice the level does not offer goes back to Any, rather than sticking.
  $: if (key !== "any" && !level.keys.includes(key)) key = "any";
  $: if (!level.meters.includes(meter)) meter = level.meters[0];
  $: if (pattern !== "any" && !patterns.includes(pattern)) pattern = "any";

  function settingsQuery(): string {
    const p = new URLSearchParams({ level: levelId, meter, measures: String(measures), bpm: String(bpm) });
    if (key !== "any") p.set("key", key);
    if (pattern !== "any") p.set("lh", pattern);
    return p.toString();
  }
  const settingsLink = () => `${location.origin}/piano-sightreading?${settingsQuery()}`;

  function loadParams() {
    const p = new URLSearchParams(location.search);
    const l = p.get("level");
    if (l && pianoLevelById[l]) {
      levelId = l;
      bpm = pianoLevelById[l].bpm;
    }
    const lv = pianoLevelById[levelId];
    const k = p.get("key");
    if (k && lv.keys.includes(k)) key = k;
    const m = p.get("meter");
    if (m && lv.meters.includes(m)) meter = m;
    const n = Number(p.get("measures"));
    if ([4, 8, 16].includes(n)) measures = n;
    const b = Number(p.get("bpm"));
    if (b >= 30 && b <= 200) bpm = b;
    const lh = p.get("lh") as LeftHandPattern | null;
    if (lh && patternsFor(lv, meter).includes(lh)) pattern = lh;
  }

  function chooseLevel(id: string) {
    levelId = id;
    bpm = pianoLevelById[id].bpm;
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
      exercise = generatePianoExercise({
        levelId,
        key: key === "any" ? undefined : key,
        meter,
        measures,
        pattern: pattern === "any" ? undefined : pattern,
        bpm,
        barsPerLine: narrow ? 2 : 4,
      });
      generatedBpm = bpm;
      history.replaceState(null, "", `${location.pathname}?${settingsQuery()}`);
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
  function light(els: Element[]) {
    for (const e of lit) e.classList.remove("piano-now");
    lit = els;
    for (const e of lit) e.classList.add("piano-now");
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
    if (bpm !== generatedBpm) setWarp();
  }

  function setWarp() {
    try { synthControl?.setWarp(Math.round((bpm / generatedBpm) * 100)); } catch {}
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
    loadParams();
    void generate();
  });
  onDestroy(() => {
    try { synthControl?.destroy?.(); } catch {}
    hideCountIn();
  });
</script>

<div class="w-full max-w-5xl flex flex-col gap-4 pb-40">
  <section class="sr-panel p-4 sm:p-5 flex flex-col gap-4" aria-label="Exercise settings">
    <div class="flex flex-col gap-2">
      <span class="sr-label">Level</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Level">
        {#each PIANO_LEVELS as l (l.id)}
          <button type="button" class="sr-tok {l.id === levelId ? 'sr-on' : ''}" aria-pressed={l.id === levelId} title={l.summary} on:click={() => chooseLevel(l.id)}>{l.number}</button>
        {/each}
      </div>
      <p class="text-sm text-sr-muted">{level.label}: {level.summary}.</p>
    </div>

    <div class="flex flex-wrap gap-x-8 gap-y-4">
      <div class="flex flex-col gap-2">
        <span class="sr-label">Key</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Key">
          <button type="button" class="sr-tok {key === 'any' ? 'sr-on' : ''}" aria-pressed={key === "any"} on:click={() => (key = "any")}>Any</button>
          {#each level.keys as k}
            <button type="button" class="sr-tok {key === k ? 'sr-on' : ''}" aria-pressed={key === k} on:click={() => (key = k)}>{k.replace("b", "♭")}</button>
          {/each}
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="sr-label">Meter</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Meter">
          {#each level.meters as m}
            <button type="button" class="sr-tok {meter === m ? 'sr-on' : ''}" aria-pressed={meter === m} on:click={() => (meter = m)}>{m}</button>
          {/each}
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="sr-label">Bars</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Bars">
          {#each [4, 8, 16] as n}
            <button type="button" class="sr-tok {measures === n ? 'sr-on' : ''}" aria-pressed={measures === n} on:click={() => (measures = n)}>{n}</button>
          {/each}
        </div>
      </div>
    </div>

    {#if level.together}
      <div class="flex flex-col gap-2">
        <span class="sr-label">Left hand</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Left hand">
          <button type="button" class="sr-tok {pattern === 'any' ? 'sr-on' : ''}" aria-pressed={pattern === "any"} on:click={() => (pattern = "any")}>Any of the level's</button>
          {#each patterns as p}
            <button type="button" class="sr-tok {pattern === p ? 'sr-on' : ''}" aria-pressed={pattern === p} on:click={() => (pattern = p)}>{PATTERN_NAMES[p]}</button>
          {/each}
        </div>
      </div>
    {:else}
      <p class="text-sm text-sr-muted">The hands take turns, two bars each: the right hand plays a phrase and the left hand answers it, each in its own five-finger position.</p>
    {/if}

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
      {exercise.key.replace("b", "♭")} major · {exercise.meter} · {exercise.progression} · left hand: {PATTERN_NAMES[exercise.pattern]}
    </p>
  {/if}
  <CountInBadge />
  <div id="paper" class="sr-sheet w-full" class:hidden={!exercise}></div>
  <div id="piano-audio" class="hidden"></div>
</div>

<PlaybackBar
  {isPlaying}
  {bpm}
  beatSymbol={beatSymbolOf(meter)}
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
  onBpmChange={(b) => { bpm = b; setWarp(); }}
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
</style>
