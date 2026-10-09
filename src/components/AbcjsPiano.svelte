<script lang="ts">
  /**
   * Piano sight reading (src/lib/piano/): a grand staff, a tune over an
   * accompaniment. Every option is on the page at every level, each marked
   * with the level that first uses it; a level only fills them in (Blaine:
   * no options appearing as the levels go up).
   *
   * Laid out as the Unison page is (Blaine, 9 October 2026: the layouts
   * should match): the settings as a row of pills, each opening its own
   * popover (a sheet from the bottom on a phone), New exercise and the
   * month's count at its end; above the score a Display button (measure
   * numbers, cursor, layout) beside Play and grade; the playback bar's Layout
   * menu (size, bars a line, spacing, measure numbers: score-view.ts, kept as
   * "piano"), full screen and its annotations. The pill and popover CSS is
   * the Unison page's own, copied, as AbcjsChoral copies it.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { ChevronDown, Eye, RefreshCw } from "lucide-svelte";
  import { usage } from "../lib/usage";
  import { createFullscreen } from "../lib/fullscreen";
  import { loadScoreView, saveScoreView, withLineSpacing, withMeasureNumbers, type ScoreView } from "../lib/score-view";
  import { crossedWholeBeat, newMetronomeBeatState } from "../lib/metronome-beats";
  import PlaybackBar from "./PlaybackBar.svelte";
  import GenerationLimit from "./GenerationLimit.svelte";
  import CountInBadge from "./CountInBadge.svelte";
  import { countGeneration, mayGenerate } from "../lib/usage";
  import { withCopyright, styleCopyright } from "../lib/copyright";
  import { countInMeasures, showCountIn, hideCountIn } from "../lib/count-in";
  import { drumPatternFor } from "../lib/playback-click";
  import { DEFAULT_CLICK_SOUND } from "../lib/tuner/click-sounds";
  import { beatsOf, beatSymbolOf, beatUnitOf } from "../lib/meter";
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
  import { generatePianoExercise, keyName, withBarsPerLine, type PianoExercise } from "../lib/piano/generatePiano";
  import { barsOf } from "../lib/piano/assemble";
  import { settingsFromQuery, settingsQuery } from "../lib/piano/settings-link";
  import PianoGrade from "./PianoGrade.svelte";
  import { createFollower } from "../lib/piano/follow";
  import { noteElements } from "../lib/piano/score-elements";
  import { anchorsFrom, createScroller, noteStarts, type Anchor } from "../lib/piano/scroller";

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
  /** The grade panel: the page's own transport stops its run or its take too. */
  let grade: PianoGrade | null = null;
  /** The score as lines down the page, or one line scrolling sideways (Display). Remembered in this browser. */
  type Layout = "lines" | "scroll";
  const LAYOUT_KEY = "piano-layout";
  let layout: Layout = "lines";

  // ── The settings row (as the Unison page's) ────────────────────────────────
  type SettingPop = "level" | "keys" | "meter" | "rhythm" | "notes" | "hands" | "accomp" | "chords";
  let settingPop: SettingPop | null = null;
  let toolPop: "display" | null = null;
  let popLeft = 0;
  let setbarEl: HTMLElement;
  let toolsEl: HTMLElement;
  let setbarInView = true;
  let popOpener: HTMLElement | null = null;
  const POP_WIDTH = 420;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const asSheet = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const popIn = (node: Element) => fly(node, { y: asSheet() ? 40 : -8, duration: reduceMotion ? 0 : 160, easing: cubicOut });
  const popOut = (node: Element) => fly(node, { y: asSheet() ? 40 : -8, duration: reduceMotion ? 0 : 120 });
  $: if (typeof document !== "undefined") document.documentElement.classList.toggle("sr-pop-open", !!(settingPop || toolPop));
  function closePops(returnFocus = true) {
    settingPop = null;
    toolPop = null;
    if (returnFocus) popOpener?.focus();
  }
  async function focusPop() {
    await tick();
    const pop = document.querySelector(".set-pop");
    (pop?.querySelector(".sr-on, [aria-pressed='true']") ?? pop?.querySelector("button, input, select"))?.focus?.();
  }
  function togglePop(which: SettingPop, e: MouseEvent) {
    toolPop = null;
    if (settingPop === which) return closePops();
    const pill = e.currentTarget as HTMLElement;
    const room = setbarEl?.clientWidth ?? POP_WIDTH;
    // Measured against the row itself: a pill sits inside its group now, so offsetLeft would be from the group.
    const fromLeft = setbarEl ? pill.getBoundingClientRect().left - setbarEl.getBoundingClientRect().left : 0;
    popLeft = Math.max(0, Math.min(fromLeft, room - POP_WIDTH));
    popOpener = pill;
    settingPop = which;
    void focusPop();
  }
  function toggleTool(which: "display", e: MouseEvent) {
    settingPop = null;
    if (toolPop === which) return closePops();
    popOpener = e.currentTarget as HTMLElement;
    toolPop = which;
    void focusPop();
  }

  // What each pill says, and which have changed since the level was chosen.
  const SKIP_WORD: Record<number, string> = { 1: "Steps", 2: "3rd", 3: "4th", 4: "5th", 5: "6th", 7: "octave" };
  const REACH_WORD: Record<number, string> = { 4: "five-finger", 5: "6th reach", 7: "octave reach" };
  const short = (xs: string[], n = 3) => (xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} +${xs.length - n}`);
  $: pillText = {
    level: level.label,
    keys: short(settings.keys.map(keyLabel), 2),
    meter: `${short(settings.meters, 2)} · ${settings.measures} bars`,
    rhythm: `${settings.rhythms.length} rhythms`,
    notes: `${settings.maxSkip === 1 ? "Steps" : `Skips to ${SKIP_WORD[settings.maxSkip] ?? "a skip"}`} · ${REACH_WORD[settings.reach] ?? ""}`,
    hands: !settings.together ? "Taking turns" : settings.tuneHand === "right" ? "Together" : `Together · tune ${settings.tuneHand === "left" ? "left" : "either"}`,
    accomp: !settings.together ? "None" : short(settings.patterns.map((p) => PATTERN_NAMES[p]), 1),
    chords: `${settings.chords.join(" ")}${settings.chromatic ? " · V of V" : ""}`,
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  $: base = level.settings;
  $: pillChanged = {
    level: false,
    keys: !same(settings.keys, base.keys),
    meter: !same(settings.meters, base.meters) || settings.measures !== base.measures || settings.dynamics !== base.dynamics,
    rhythm: !same(settings.rhythms, base.rhythms),
    notes: settings.maxSkip !== base.maxSkip || settings.reach !== base.reach || settings.doubleNotes !== base.doubleNotes,
    hands: settings.together !== base.together || settings.tuneHand !== base.tuneHand,
    accomp: !same(settings.patterns, base.patterns),
    chords: !same(settings.chords, base.chords) || settings.chromatic !== base.chromatic,
  };
  const POP_TITLE: Record<SettingPop, string> = {
    level: "Level", keys: "Keys", meter: "Meter, length and dynamics", rhythm: "Rhythms", notes: "The tune's notes", hands: "Hands", accomp: "Accompaniment", chords: "Chords",
  };
  /**
   * The pills in groups, each under a small label, so the row reads as what
   * it sets: the level, then the music, the tune, the hands and the harmony.
   * Each group has a pastel dot of its own, repeated on its popover's title.
   */
  const PILL_GROUPS: { label: string; tone: string; ids: SettingPop[] }[] = [
    { label: "Level", tone: "action", ids: ["level"] },
    { label: "Music", tone: "sky", ids: ["keys", "meter"] },
    { label: "Tune", tone: "mint", ids: ["rhythm", "notes"] },
    { label: "Hands", tone: "peach", ids: ["hands", "accomp"] },
    { label: "Harmony", tone: "butter", ids: ["chords"] },
  ];
  const toneOf = (id: SettingPop) => PILL_GROUPS.find((g) => g.ids.includes(id))?.tone ?? "action";

  // ── Display (as the Unison page's): measure numbers, cursor, layout; the bar's Layout menu ──
  let scoreView: ScoreView = loadScoreView("piano", { scale: 1.2, bars: null, spacing: "normal" });
  function changeScoreView(patch: Partial<ScoreView>) {
    scoreView = { ...scoreView, ...patch };
    saveScoreView("piano", scoreView);
    pausePlayback();
    void tick().then(render);
  }
  const fullscreenCtl = createFullscreen();
  const fullscreenOn = fullscreenCtl.active;
  onDestroy(fullscreenCtl.destroy);
  $: annotationChoices = [{ id: "measures", label: "Measure numbers", on: scoreView.measureNumbers !== false }];
  function pickAnnotation(id: string) {
    if (id === "measures") changeScoreView({ measureNumbers: scoreView.measureNumbers === false });
  }
  const cursorModes = ["off", "smooth", "beat", "note"] as const;
  type CursorMode = (typeof cursorModes)[number];
  const cursorModeLabels: Record<CursorMode, string> = { off: "Off", smooth: "Smooth", beat: "Beat by beat", note: "Note by note" };
  const CURSOR_KEY = "piano-cursor";
  let cursorMode: CursorMode = "note";
  function chooseCursor(m: CursorMode) {
    cursorMode = m;
    try { localStorage.setItem(CURSOR_KEY, m); } catch {}
    hideCursor();
    if (m !== "note") light([]);
  }

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
      const ex = generatePianoExercise({ settings, levelId: edited ? undefined : levelId });
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

  /**
   * One line's width: each bar as wide as its busier hand needs (a sixteenth
   * run is wider than a whole note), so the music is spaced as it would be
   * in lines, not squeezed or stretched to fit.
   */
  function lineWidth(ex: PianoExercise): number {
    const barUnits = ex.rh.reduce((s, n) => s + n.length, 0) / ex.measures;
    const rh = barsOf(ex.rh, barUnits), lh = barsOf(ex.lh, barUnits);
    let w = 120;
    for (let b = 0; b < ex.measures; b++) w += 50 + 30 * Math.max(rh[b]?.length ?? 1, lh[b]?.length ?? 1);
    return w;
  }

  async function render() {
    if (!exercise) return;
    const abcjs = (await import("abcjs")).default;
    const scroll = layout === "scroll";
    // Its title would sit in the middle of one long line, off screen: the line above the score names the key.
    const bars = scroll ? exercise.measures : scoreView.bars ?? (narrow ? 2 : 4);
    let abc = withBarsPerLine(exercise, bars);
    if (scroll) abc = abc.replace(/^T:.*$/m, "T:");
    abc = withCopyright(withMeasureNumbers(withLineSpacing(abc, scoreView.spacing), scoreView.measureNumbers));
    // abcjs's resize mode leaves its sizing on the box (a padding-bottom for the shape); drawn otherwise it must go.
    document.getElementById("paper")?.removeAttribute("style");
    const box = document.getElementById("paper-box");
    // Size as the Unison page sizes: a narrower staff drawn to the box's width is bigger music. The
    // scrolling line keeps its own width (no resize, which would shrink it to the window), scaled.
    const staffwidth = Math.max(140, Math.floor((box?.clientWidth ?? 760) / scoreView.scale) - 30);
    const tunes = abcjs.renderAbc(
      "paper",
      abc,
      scroll ? { add_classes: true, staffwidth: lineWidth(exercise), scale: scoreView.scale / 1.2 } : { add_classes: true, responsive: "resize", staffwidth },
    );
    renderedTune = tunes[0];
    styleCopyright(document.getElementById("paper"));
    if (box) box.scrollLeft = 0;
    follower.reset();
    cursorLine = null;
    await buildSynth();
  }

  async function chooseLayout(l: Layout) {
    if (l === layout) return;
    layout = l;
    try { localStorage.setItem(LAYOUT_KEY, l); } catch {}
    pausePlayback();
    await tick();
    await render();
  }

  /** Print in lines: one long line would run off the paper. */
  async function printScore() {
    if (layout !== "scroll") return window.print();
    layout = "lines";
    await tick();
    await render();
    window.print();
    layout = "scroll";
    await tick();
    await render();
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  // The cursor (Display): a line over the staves, travelling (smooth), stepping on beats, or on each note.
  let cursorLine: SVGLineElement | null = null;
  let cursorBeats = newMetronomeBeatState();
  function moveCursor(left: number, top: number, height: number) {
    const svg = document.querySelector("#paper svg");
    if (!svg) return;
    if (!cursorLine || !svg.contains(cursorLine)) {
      cursorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      cursorLine.setAttribute("class", "abcjs-cursor");
      svg.appendChild(cursorLine);
    }
    const x = Math.max(0, left - 2);
    const over = height * 0.15;
    cursorLine.setAttribute("x1", String(x));
    cursorLine.setAttribute("x2", String(x));
    cursorLine.setAttribute("y1", String(top - over));
    cursorLine.setAttribute("y2", String(top + height + over));
  }
  function hideCursor() {
    if (!cursorLine) return;
    for (const a of ["x1", "x2", "y1", "y2"]) cursorLine.setAttribute(a, "0");
  }
  let lit: Element[] = [];
  // Playback keeps the line being played on screen (follow.ts).
  const follower = createFollower();
  function light(els: Element[]) {
    for (const e of lit) e.classList.remove("piano-now");
    lit = cursorMode === "off" ? [] : els;
    for (const e of lit) e.classList.add("piano-now");
    follower.follow(els);
    // The scrolling line's clock: resynced at each note abcjs reports, run on between them.
    for (const e of els) {
      const u = startOf.get(e);
      if (u !== undefined) {
        sync = { perf: performance.now(), u };
        break;
      }
    }
  }

  // ── The scrolling line, during playback (scroller.ts) ─────────────────────
  let scroller: ReturnType<typeof createScroller> | null = null;
  /** Each drawn note's start, in 32nds: how a note abcjs reports becomes a time. */
  let startOf = new Map<Element, number>();
  let sync: { perf: number; u: number } | null = null;
  function scrollPlayback() {
    const box = document.getElementById("paper-box");
    const svg = box?.querySelector("svg");
    if (!exercise || !box || !svg || layout !== "scroll") return;
    const els = noteElements(renderedTune);
    const starts = noteStarts({ rh: exercise.rh, lh: exercise.lh });
    startOf = new Map();
    for (const hand of ["rh", "lh"] as const) starts[hand].forEach((u, i) => (els[hand][i] ?? []).forEach((e) => startOf.set(e, u)));
    const total = exercise.rh.reduce((s, n) => s + n.length, 0);
    const anchors: Anchor[] = anchorsFrom(starts, els, svg, total);
    const unitMs = () => 60000 / settings.bpm / beatUnitOf(exercise!.meter);
    sync = null;
    scroller ??= createScroller(box);
    scroller.start(anchors, () => (sync ? sync.u + (performance.now() - sync.perf) / unitMs() : null));
  }

  async function buildSynth() {
    if (!renderedTune || !exercise) return;
    const abcjs = (await import("abcjs")).default;
    try { synthControl?.destroy?.(); } catch {}
    synthControl = new abcjs.synth.SynthController();
    const playedMeter = exercise.meter;
    const cursorControl = {
      extraMeasuresAtBeginning: countInMeasures(playedMeter),
      beatSubdivisions: 16,
      onBeat: (beat: number, _total: number, _time: number, position: any) => {
        showCountIn(playedMeter, beat);
        if (cursorMode !== "smooth" && cursorMode !== "beat") return;
        if (cursorMode === "beat" && !crossedWholeBeat(cursorBeats, beat)) return;
        if (position && typeof position.left === "number") moveCursor(position.left, position.top, position.height);
      },
      onEvent: (event: any) => {
        light((event?.elements ?? []).flat());
        if (cursorMode === "note" && event && typeof event.left === "number") moveCursor(event.left, event.top, event.height);
      },
      onFinished: () => {
        isPlaying = false;
        hideCursor();
        cursorBeats = newMetronomeBeatState();
        scroller?.stop();
        follower.reset();
        light([]);
        hideCountIn();
        if (looping && synthControl) synthControl.play().then(() => ((isPlaying = true), scrollPlayback()));
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
    grade?.stopRun();
    isPreparing = true;
    try {
      const abcjs = (await import("abcjs")).default;
      const ctx = abcjs.synth.activeAudioContext?.();
      if (ctx && ctx.state !== "running") await ctx.resume();
      await synthControl.play();
      isPlaying = true;
      scrollPlayback();
    } finally {
      isPreparing = false;
    }
  }

  /** abcjs's play() toggles isStarted and pause() never resets it; see AbcjsChoral pausePlayback. */
  function pausePlayback() {
    scroller?.stop();
    if (!synthControl) return;
    synthControl.pause();
    synthControl.isStarted = false;
    isPlaying = false;
  }

  function rewind() {
    grade?.stopRun();
    if (!synthControl) return;
    pausePlayback();
    synthControl.seek(0);
    follower.reset();
    hideCursor();
    cursorBeats = newMetronomeBeatState();
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
    try {
      if (localStorage.getItem(LAYOUT_KEY) === "scroll") layout = "scroll";
      const c = localStorage.getItem(CURSOR_KEY);
      if (c && (cursorModes as readonly string[]).includes(c)) cursorMode = c as CursorMode;
    } catch {}
    // A tap outside the row or the toolbar, or Escape, closes a popover; the bar's Generate hides while the row shows.
    const away = (e: PointerEvent) => {
      if (!settingPop && !toolPop) return;
      const t = e.target as Node;
      if (setbarEl?.contains(t) || toolsEl?.contains(t)) return;
      closePops(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (settingPop || toolPop)) closePops();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    const seen = new IntersectionObserver(([entry]) => (setbarInView = entry.intersectionRatio >= 0.6), { threshold: [0, 0.6, 1] });
    if (setbarEl) seen.observe(setbarEl);
    ({ levelId, settings } = settingsFromQuery(location.search));
    void generate();
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
      seen.disconnect();
      document.documentElement.classList.remove("sr-pop-open");
    };
  });
  onDestroy(() => {
    try { synthControl?.destroy?.(); } catch {}
    hideCountIn();
  });
</script>

<div class="focus-main wide w-full max-w-5xl mx-auto flex flex-col gap-4 pb-40">
  <!-- The settings, as the Unison page's: a pill each, opening its own popover. -->
  <section class="setbar sr-panel w-full no-print" aria-label="Exercise settings" bind:this={setbarEl}>
    <div class="setbar-pills">
      {#each PILL_GROUPS as g}
        <div class="set-group" role="group" aria-label={g.label}>
          <span class="set-group-label" aria-hidden="true"><span class="set-group-dot tone-{g.tone}"></span>{g.label}</span>
          <div class="set-group-pills">
            {#each g.ids as id}
              <button
                type="button"
                class="set-pill {id === 'level' ? 'set-pill-level' : ''}"
                aria-expanded={settingPop === id}
                aria-label="{POP_TITLE[id]}: {pillText[id]}"
                on:click={(e) => togglePop(id, e)}
              >
                {pillText[id]}
                {#if id === "level" ? edited : pillChanged[id]}<span class="set-pill-dot" title={id === "level" ? "Changed from the level" : "Changed from the level"}></span>{/if}
                <ChevronDown size={14} class="set-pill-chev" aria-hidden="true" />
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <button class="sr-btn setbar-new flex items-center gap-1.5" aria-label="Generate a new exercise" on:click={generate} disabled={isGenerating}>
      <RefreshCw size={16} class={isGenerating ? "animate-spin" : ""} /><span>New exercise</span>
      {#if $usage && $usage.limit !== null && $usage.remaining !== null}
        <span class="setbar-count {$usage.remaining <= 3 ? 'low' : ''}" title="{$usage.remaining} of {$usage.limit} left this month" aria-label="{$usage.remaining} left this month">{$usage.remaining}</span>
      {/if}
    </button>

    {#if settingPop}
      <button class="set-scrim" aria-label="Close" tabindex="-1" on:click={() => closePops()} transition:fade={{ duration: reduceMotion ? 0 : 140 }}></button>
      <div in:popIn out:popOut class="set-pop {settingPop === 'rhythm' || settingPop === 'accomp' || settingPop === 'keys' ? 'set-pop-wide' : ''}" style="--pop-left: {popLeft}px" role="dialog" aria-label={POP_TITLE[settingPop]}>
        <p class="set-pop-title"><span class="set-group-dot tone-{toneOf(settingPop)}"></span>{POP_TITLE[settingPop]}</p>
        {#if settingPop === "level"}
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Level">
            {#each PIANO_LEVELS as l (l.id)}
              <button type="button" class="sr-tok {l.id === levelId && !edited ? 'sr-on' : ''} {l.id === levelId && edited ? 'sr-was' : ''}" aria-pressed={l.id === levelId} title={l.summary} on:click={() => chooseLevel(l.id)}>{l.number}</button>
            {/each}
          </div>
          <p class="text-sm text-sr-muted mt-3">{level.label}: {level.summary}. <span class="text-sr-faint">About {level.compare}.</span></p>
          <p class="text-xs text-sr-faint mt-2">A level fills in every other setting; each can be changed. The small number on a choice is the level that first uses it.</p>
        {:else if settingPop === "keys"}
          <div class="flex flex-col gap-2">
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
            <p class="text-xs text-sr-faint">Each exercise draws one of the keys chosen.</p>
          </div>
        {:else if settingPop === "meter"}
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Meters">
              {#each ALL_METERS as m}
                <button type="button" class="sr-tok chip {settings.meters.includes(m) ? 'sr-on' : ''}" aria-pressed={settings.meters.includes(m)} on:click={() => (settings = { ...settings, meters: toggle(settings.meters, m) })}>{m}<sup>{at.meter(m) ?? ""}</sup></button>
              {/each}
            </div>
            <p class="sr-label">Bars</p>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Bars">
              {#each ALL_LENGTHS as n}
                <button type="button" class="sr-tok chip {settings.measures === n ? 'sr-on' : ''}" aria-pressed={settings.measures === n} on:click={() => (settings = { ...settings, measures: n })}>{n}<sup>{at.bars(n) ?? ""}</sup></button>
              {/each}
            </div>
            <p class="sr-label">Dynamics</p>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" class="sr-tok chip {settings.dynamics ? 'sr-on' : ''}" aria-pressed={settings.dynamics} on:click={() => (settings = { ...settings, dynamics: !settings.dynamics })}>Dynamics<sup>{at.dynamics ?? ""}</sup></button>
            </div>
          </div>
        {:else if settingPop === "rhythm"}
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
          <p class="text-xs text-sr-faint mt-2">6/8 uses its own figures to match: dotted quarters and three eighths, and sixteenths when sixteenths are chosen.</p>
        {:else if settingPop === "notes"}
          <div class="flex flex-col gap-3">
            <p class="sr-label">Largest skip in the tune</p>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Largest skip">
              {#each SKIPS as k}
                <button type="button" class="sr-tok chip {settings.maxSkip === k.n ? 'sr-on' : ''}" aria-pressed={settings.maxSkip === k.n} on:click={() => (settings = { ...settings, maxSkip: k.n })}>{k.label}<sup>{at.skip(k.n) ?? ""}</sup></button>
              {/each}
            </div>
            <p class="sr-label">The tune's reach</p>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Reach">
              {#each REACHES as r}
                <button type="button" class="sr-tok chip {settings.reach === r.n ? 'sr-on' : ''}" aria-pressed={settings.reach === r.n} on:click={() => (settings = { ...settings, reach: r.n })}>{r.label}<sup>{at.reach(r.n) ?? ""}</sup></button>
              {/each}
            </div>
            <p class="sr-label">Two notes at once</p>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" class="sr-tok chip {settings.doubleNotes ? 'sr-on' : ''}" aria-pressed={settings.doubleNotes} on:click={() => (settings = { ...settings, doubleNotes: !settings.doubleNotes })}>3rds and 6ths at cadences<sup>{at.doubleNotes ?? ""}</sup></button>
            </div>
          </div>
        {:else if settingPop === "hands"}
          <div class="flex flex-col gap-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <p class="sr-label">Hands</p>
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Hands">
                  <button type="button" class="sr-tok chip {!settings.together ? 'sr-on' : ''}" aria-pressed={!settings.together} on:click={() => (settings = { ...settings, together: false })}>Taking turns<sup>1</sup></button>
                  <button type="button" class="sr-tok chip {settings.together ? 'sr-on' : ''}" aria-pressed={settings.together} on:click={() => (settings = { ...settings, together: true })}>Together<sup>{at.together ?? ""}</sup></button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <p class="sr-label">Tune in</p>
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Tune in">
                  {#each TUNE_HANDS as h}
                    <button type="button" class="sr-tok chip {settings.tuneHand === h.id ? 'sr-on' : ''}" aria-pressed={settings.tuneHand === h.id} disabled={!settings.together && h.id !== "right"} on:click={() => (settings = { ...settings, tuneHand: h.id })}>{h.label}<sup>{at.tune(h.id) ?? ""}</sup></button>
                  {/each}
                </div>
              </div>
            </div>
            <p class="text-xs text-sr-faint">
              {#if settings.together}With the tune in the left hand, the right hand holds the chords or plays them on each beat.{:else}Taking turns, one tune passes between the hands and there is no accompaniment.{/if}
            </p>
          </div>
        {:else if settingPop === "accomp"}
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Accompaniment patterns">
              {#each ALL_PATTERNS as p}
                <button type="button" class="sr-tok chip {settings.patterns.includes(p) ? 'sr-on' : ''}" aria-pressed={settings.patterns.includes(p)} disabled={!settings.together} on:click={() => (settings = { ...settings, patterns: toggle(settings.patterns, p) })}>{PATTERN_NAMES[p]}<sup>{at.pattern(p) ?? ""}</sup></button>
              {/each}
            </div>
            <p class="text-xs text-sr-faint">
              {#if settings.together}Each exercise draws one, from those that suit its meter.{:else}The hands are taking turns, so there is no accompaniment. Choose Together under Hands to use these.{/if}
            </p>
          </div>
        {:else if settingPop === "chords"}
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Chords">
              {#each CHORD_CHOICES as c}
                <button type="button" class="sr-tok chip {settings.chords.includes(c) ? 'sr-on' : ''}" aria-pressed={settings.chords.includes(c)} on:click={() => (settings = { ...settings, chords: toggle(settings.chords, c) })}>{c}<sup>{at.chord(c) ?? ""}</sup></button>
              {/each}
              <button type="button" class="sr-tok chip {settings.chromatic ? 'sr-on' : ''}" aria-pressed={settings.chromatic} on:click={() => (settings = { ...settings, chromatic: !settings.chromatic })}>V of V, vi, ii<sup>{at.chromatic ?? ""}</sup></button>
            </div>
          </div>
        {/if}
        <div class="set-pop-foot">
          <button class="sr-tok" on:click={() => closePops()}>Done</button>
          <button class="sr-btn flex items-center gap-1.5" on:click={() => { closePops(false); generate(); }} disabled={isGenerating}><RefreshCw size={16} /><span>New exercise</span></button>
        </div>
      </div>
    {/if}
  </section>

  <GenerationLimit part="alert" />
  {#if error}
    <p class="sr-panel p-4 text-sm" role="alert">{error}</p>
  {/if}

  <div class="focus-keep w-full flex flex-col gap-3">
    {#if exercise}
      <p class="focus-hide text-sm text-sr-muted px-1">
        {keyName(exercise.key)} · {exercise.meter} · {exercise.progression} ·
        {#if exercise.pattern === "tune"}hands taking turns{:else if exercise.tuneHand === "left"}tune in the left hand, right hand: {PATTERN_NAMES[exercise.pattern]}{:else}left hand: {PATTERN_NAMES[exercise.pattern]}{/if}
      </p>
      <!-- The score's toolbar, as the Unison page's: Display, and Play and grade. -->
      <div class="score-tools" bind:this={toolsEl}>
        <div class="focus-hide no-print flex flex-wrap items-center gap-2">
          <button type="button" class="tool-btn" aria-expanded={toolPop === "display"} on:click={(e) => toggleTool("display", e)}><Eye size={16} aria-hidden="true" />Display</button>
        </div>
        <PianoGrade bind:this={grade} {exercise} tune={renderedTune} bpm={settings.bpm} onStart={pausePlayback} />
        {#if toolPop === "display"}
          <button class="set-scrim" aria-label="Close" tabindex="-1" on:click={() => closePops()} transition:fade={{ duration: reduceMotion ? 0 : 140 }}></button>
          <div in:popIn out:popOut class="set-pop set-pop-tools no-print" role="dialog" aria-label="Display">
            <p class="set-pop-title">Display</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div class="space-y-2">
                <p class="sr-label">Layout</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Layout">
                  <button type="button" class="sr-tok {layout === 'lines' ? 'sr-on' : ''}" aria-pressed={layout === "lines"} on:click={() => chooseLayout("lines")}>Lines</button>
                  <button type="button" class="sr-tok {layout === 'scroll' ? 'sr-on' : ''}" aria-pressed={layout === "scroll"} on:click={() => chooseLayout("scroll")}>One scrolling line</button>
                </div>
                <p class="text-xs text-sr-faint">{layout === "scroll" ? "One line that moves along as it plays, the next bars always in view. It prints in lines." : "Lines down the page, the page following the music. Size, bars a line and spacing are in the playback bar's Layout menu."}</p>
              </div>
              <div class="space-y-2">
                <p class="sr-label">Annotations</p>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="sr-tok {scoreView.measureNumbers !== false ? 'sr-on' : ''}" aria-pressed={scoreView.measureNumbers !== false} on:click={() => changeScoreView({ measureNumbers: scoreView.measureNumbers === false })}>Measure numbers</button>
                </div>
              </div>
              <div class="space-y-2">
                <p class="sr-label">Cursor</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Cursor">
                  {#each cursorModes as mode}
                    <button type="button" class="sr-tok {cursorMode === mode ? 'sr-on' : ''}" aria-pressed={cursorMode === mode} on:click={() => chooseCursor(mode)}>{cursorModeLabels[mode]}</button>
                  {/each}
                </div>
                <p class="text-xs text-sr-faint">
                  {cursorMode === "off" ? "No cursor during playback." : cursorMode === "smooth" ? "Travels along with the music." : cursorMode === "beat" ? "Steps on every beat." : "Lands on each note, the notes lit as they sound."}
                </p>
              </div>
            </div>
            <p class="text-xs text-sr-faint mt-4">These change how the exercise looks. The notes stay the same.</p>
            <div class="set-pop-foot"><button class="sr-tok" on:click={() => closePops()}>Done</button></div>
          </div>
        {/if}
      </div>
    {/if}
    <div class="focus-score relative w-full">
      <CountInBadge />
      <!-- The scrolling line scrolls in this box: abcjs sets its own overflow on #paper. -->
      <div class="sr-sheet w-full" class:hidden={!exercise} class:scroll-line={layout === "scroll"} id="paper-box">
        <div id="paper"></div>
      </div>
    </div>
  </div>
  <div id="piano-audio" class="hidden"></div>
</div>

<PlaybackBar
  hideGenerate={setbarInView}
  fullscreen={$fullscreenOn}
  onToggleFullscreen={fullscreenCtl.toggle}
  {annotationChoices}
  onAnnotation={pickAnnotation}
  {scoreView}
  onScoreView={changeScoreView}
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
  onPause={() => { grade?.stopRun(); pausePlayback(); }}
  onStop={rewind}
  onRestart={rewind}
  onBpmChange={(b) => { settings = { ...settings, bpm: b }; setWarp(); }}
  onToggleLoop={() => (looping = !looping)}
  onToggleMute={toggleMute}
  onGenerate={generate}
  {settingsLink}
  onPrint={printScore}
>
  <svelte:fragment slot="extra">
    <button
      type="button"
      class="fs-keep flex-shrink-0 rounded-full px-3 h-11 xl:h-8 text-sm font-bold {clickOn ? 'opacity-100' : 'opacity-50'}"
      aria-pressed={clickOn}
      title={clickOn ? "Click on: turn it off" : "Click off: turn it on"}
      on:click={toggleClick}
    >Click</button>
  </svelte:fragment>
</PlaybackBar>

<style>
  /* From here to the phone block: the Unison page's settings row, popovers and score toolbar, copied (AbcjsSingle). */
  /* The settings row: pills that each open their own popover, then New exercise. */
  .setbar {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem;
  }
  /* Clipped sideways so the hairline before a group that starts a row falls outside and is not drawn. */
  .setbar-pills { display: flex; flex-wrap: wrap; gap: 0.6rem 1.3rem; flex: 1 1 26rem; min-width: 0; overflow-x: clip; padding-left: 3px; }
  /* A group of pills under its label; groups set apart by space and a hairline between them. */
  .set-group { position: relative; display: flex; flex-direction: column; gap: 0.2rem; }
  .set-group::before { content: ""; position: absolute; left: -0.65rem; top: 0.25rem; bottom: 0.25rem; border-left: 1px solid var(--sr-hairline); }
  .set-group-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .set-group-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding-left: 0.4rem;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--sr-muted);
  }
  .set-group-dot { width: 10px; height: 10px; border-radius: 999px; flex: none; display: inline-block; }
  .set-pop-title .set-group-dot { margin-right: 0.5rem; vertical-align: 0.1em; }
  /* The pastel, ringed in its own ink so it shows on white and in the dark theme. */
  .tone-action { background: var(--sr-action); }
  .tone-sky { background: var(--sr-sky); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-sky-ink) 45%, transparent); }
  .tone-mint { background: var(--sr-mint); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-mint-ink) 45%, transparent); }
  .tone-peach { background: var(--sr-peach); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-peach-ink) 45%, transparent); }
  .tone-butter { background: var(--sr-butter); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-butter-ink) 45%, transparent); }
  /* The level leads: it fills in everything after it. */
  .set-pill-level { background: var(--sr-tint); color: var(--sr-action-fg); }
  .set-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 2.5rem;
    padding: 0.4rem 0.45rem 0.4rem 0.75rem;
    border-radius: 999px;
    background: var(--sr-track);
    color: var(--sr-ink);
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
    border: 2px solid transparent;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .set-pill:hover { border-color: var(--sr-tint); }
  .set-pill[aria-expanded="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  .set-pill-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--sr-action); flex: none; }
  .set-pill[aria-expanded="true"] .set-pill-dot { background: var(--sr-action-ink); }
  .setbar-count {
    margin-left: 0.15rem;
    min-width: 1.25rem;
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 11px;
    line-height: 1.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    background: rgba(255, 255, 255, 0.3);
  }
  .setbar-count.low { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .set-pill-k { font-size: 12px; font-weight: 600; opacity: 0.7; }
  :global(.set-pill-chev) { opacity: 0.7; }
  .set-mode {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    background: var(--sr-track);
  }
  .set-mode button {
    min-height: 2.25rem;
    padding: 0 0.7rem;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 800;
    color: var(--sr-ink-2);
  }
  .set-mode button.on { background: var(--sr-action); color: var(--sr-action-ink); }
  .set-pill-more { background: transparent; color: var(--sr-action-fg); padding-inline: 0.6rem; }
  .set-pill-more[aria-expanded="true"] { background: var(--sr-tint); color: var(--sr-action-fg); }
  .setbar-new { margin-left: auto; min-height: 2.75rem; }

  /* One popover at a time: under its pill, or a bottom sheet on a phone. */
  .set-pop {
    position: absolute;
    z-index: 40;
    top: calc(100% + 0.5rem);
    left: var(--pop-left, 0px);
    width: min(26.25rem, 100%);
    max-height: min(70vh, 40rem);
    overflow: auto;
    padding: 1rem 1.125rem 1.125rem;
    border-radius: 24px;
    background: var(--sr-raise);
    color: var(--sr-ink);
    border: 1px solid var(--sr-hairline);
    box-shadow: 0 2px 6px rgba(21, 33, 58, 0.08), 0 30px 60px -20px rgba(21, 33, 58, 0.45);
    text-align: left;
  }
  .set-pop-wide { left: 0; width: 100%; }
  .set-pop-tools { left: auto; right: 0; width: min(40rem, 100%); }
  .set-pop-title {
    font-family: var(--sr-font-display);
    font-weight: 600;
    font-size: 17px;
    margin-bottom: 0.625rem;
  }
  .set-pop-foot {
    position: sticky;
    bottom: -1.125rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin: 1rem -1.125rem -1.125rem;
    padding: 0.75rem 1.125rem;
    background: var(--sr-raise);
    border-top: 1px solid var(--sr-hairline-2);
  }
  .set-scrim { display: none; }
  .sr-link-btn { color: var(--sr-action-fg); font-weight: 800; font-size: 14px; padding-top: 0.25rem; }

  /* The score's toolbar, above the paper. */
  .score-tools {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.5rem;
    padding: 0 0.875rem;
    border-radius: 999px;
    background: var(--sr-panel);
    color: var(--sr-ink-2);
    font-size: 14px;
    font-weight: 800;
    box-shadow: var(--sr-card-shadow);
    border: 2px solid transparent;
  }
  .tool-btn:hover { border-color: var(--sr-tint); }
  .tool-btn[aria-expanded="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  .tool-btn-live { border-color: var(--sr-action); }

  @media (max-width: 640px) {
    .setbar-new { flex: 1; justify-content: center; }
    /* A phone: each group a row of its own, no hairlines. */
    .set-group { width: 100%; }
    .set-pop,
    .set-pop-wide,
    .set-pop-tools {
      position: fixed;
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      width: 100%;
      max-height: 78vh;
      border-radius: 28px 28px 0 0;
      z-index: 60;
      padding-bottom: calc(1.125rem + env(safe-area-inset-bottom, 0px));
    }
    .set-pop-foot { bottom: calc(-1.125rem - env(safe-area-inset-bottom, 0px)); }
    .set-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 55;
      background: rgba(21, 33, 58, 0.35);
    }
  }

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
  /* One scrolling line: the score scrolls sideways in its box, the page does not. */
  .scroll-line {
    overflow-x: auto;
    overflow-y: hidden;
  }
  /* Its full width: the site shrinks a picture to its box otherwise. */
  .scroll-line :global(svg) {
    max-width: none;
  }
  .scroll-line :global(#paper) {
    width: max-content;
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
