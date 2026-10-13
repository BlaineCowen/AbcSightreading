<script lang="ts">
  /**
   * Ensemble sight reading (src/lib/ensemble/): a teacher picks the
   * instruments and voices, and gets a chorale for them, each on its own staff
   * in its own key, clef and sound (Blaine, 13 October 2026).
   *
   * Laid out as the Piano page is, which is laid out as the Unison page: the
   * settings as a row of pills each opening its own popover (a sheet on a
   * phone), New exercise and the month's count at its end, Display above the
   * score, the playback bar below. A staff can be hidden from the bar or
   * Display ("one part": a player reads their own staff), and is still heard:
   * playback reads the whole score (as AbcjsChoral does for hidden voices).
   */
  import { onDestroy, onMount, tick } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { ChevronDown, Eye, Minus, Plus, RefreshCw, X } from "lucide-svelte";
  import { usage, countGeneration, mayGenerate } from "../lib/usage";
  import { createFullscreen } from "../lib/fullscreen";
  import { loadScoreView, saveScoreView, withLineSpacing, withMeasureNumbers, type ScoreView } from "../lib/score-view";
  import PlaybackBar from "./PlaybackBar.svelte";
  import GenerationLimit from "./GenerationLimit.svelte";
  import CountInBadge from "./CountInBadge.svelte";
  import { withCopyright, styleCopyright } from "../lib/copyright";
  import { countInMeasures, showCountIn, hideCountIn } from "../lib/count-in";
  import { drumPatternFor } from "../lib/playback-click";
  import { DEFAULT_CLICK_SOUND } from "../lib/tuner/click-sounds";
  import { beatsOf, beatSymbolOf, timeSignaturesFor } from "../lib/meter";
  import { ENSEMBLE_INSTRUMENTS } from "../lib/ensemble/instruments";
  import { arrangeEnsemble, type EnsembleMember } from "../lib/ensemble/arrange";
  import { ENSEMBLE_KEYS, ensembleAbc, generateEnsembleExercise, type EnsembleExercise } from "../lib/ensemble/generate";
  import {
    DEFAULT_SETTINGS,
    ENSEMBLE_LENGTHS,
    ENSEMBLE_METERS,
    ENSEMBLE_PRESETS,
    MAX_EACH,
    MAX_PLAYERS,
    playerCount,
    settingsFromQuery,
    settingsFromSaved,
    settingsQuery,
    ENSEMBLE_PRESET_STORE,
    type EnsembleSettings,
  } from "../lib/ensemble/settings";
  import { addPreset, listPresets, removePreset } from "../lib/preset-sync";
  import type { SavedPreset } from "../lib/preset-storage";
  import type { EnsembleStyle } from "../lib/ensemble/generate";
  import type { LyricSystem } from "../resources/solfege";

  const FAMILIES = [
    { id: "band", label: "Woodwinds and brass" },
    { id: "voice", label: "Voices" },
    { id: "strings", label: "Strings" },
  ] as const;
  const keyLabel = (k: string) => k.replace("b", "♭").replace("#", "♯");
  const STYLES: { id: EnsembleStyle; label: string; note: string }[] = [
    { id: "chorale", label: "Bach chorale", note: "A quarter-note pulse with every part moving on its own: passing tones and neighbours in eighths, suspensions into the cadences, inversions and seventh chords, a fermata at each phrase's end." },
    { id: "simple", label: "Simple", note: "The parts move together in the textures of the UIL choir levels: one rhythm, small skips, one part often holding do." },
  ];
  const LEVEL_NOTE: Record<number, string> = {
    1: "Quarters and halves, I and V, steps and small skips.",
    2: "Adds eighth pairs and IV.",
    3: "Adds dotted rhythms, ii and vi, wider skips.",
    4: "Adds sixteenths and more chords.",
    5: "Everything, with chromatic chords (fi, si, di, te).",
  };

  let settings: EnsembleSettings = { ...DEFAULT_SETTINGS };
  let exercise: (EnsembleExercise & { key: string; meter: string }) | null = null;
  let error = "";
  let isGenerating = false;
  let isPlaying = false;
  let isPreparing = false;
  let looping = false;
  let clickOn = true;
  let synthControl: any = null;
  let renderedTune: any = null;
  let generatedBpm = DEFAULT_SETTINGS.bpm;
  let narrow = false;
  let hiddenVoices = new Set<string>();
  let mutedVoices = new Set<string>();
  let lyrics: LyricSystem | null = null;

  // ── The settings row (as the Piano and Unison pages') ──────────────────────
  type SettingPop = "ensemble" | "level" | "keys" | "meter";
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

  const short = (xs: string[], n = 3) => (xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} +${xs.length - n}`);
  $: players = playerCount(settings.members);
  $: preset = ENSEMBLE_PRESETS.find((p) => JSON.stringify(p.members) === JSON.stringify(settings.members.filter((m) => m.count > 0)));
  // ── My ensembles: saved settings (preset-sync: the account, or this browser) ──
  let saved: SavedPreset<EnsembleSettings>[] = [];
  let savedName = "";
  let saving = false;
  let saveError = "";
  const sameSettings = (a: EnsembleSettings, b: EnsembleSettings) => settingsQuery(a) === settingsQuery(b);
  $: savedNow = saved.find((p) => sameSettings(settingsFromSaved(p.params), settings)) ?? null;
  async function loadSaved() {
    try {
      saved = (await listPresets<EnsembleSettings>(ENSEMBLE_PRESET_STORE)).presets;
    } catch {
      saved = [];
    }
  }
  async function saveEnsemble() {
    const name = savedName.trim();
    if (!name || saving) return;
    saving = true;
    saveError = "";
    try {
      const p = await addPreset<EnsembleSettings>(name, settings, ENSEMBLE_PRESET_STORE);
      saved = [...saved, p];
      savedName = "";
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }
  function openSaved(p: SavedPreset<EnsembleSettings>) {
    settings = settingsFromSaved(p.params);
  }
  async function forgetSaved(p: SavedPreset<EnsembleSettings>) {
    try {
      await removePreset(p.id, ENSEMBLE_PRESET_STORE);
      saved = saved.filter((x) => x.id !== p.id);
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    }
  }
  $: pillText = {
    ensemble: savedNow ? savedNow.name : preset ? preset.label : `${players} players`,
    level: `${settings.style === "chorale" ? "Chorale" : "Simple"} · Level ${settings.level}`,
    keys: short(settings.keys.map(keyLabel), 3),
    meter: `${short(settings.meters, 2)} · ${settings.measures} bars`,
  };
  const POP_TITLE: Record<SettingPop, string> = { ensemble: "Ensemble", level: "Style and level", keys: "Concert keys", meter: "Meter and length" };
  const PILL_GROUPS: { label: string; tone: string; ids: SettingPop[] }[] = [
    { label: "Ensemble", tone: "action", ids: ["ensemble"] },
    { label: "Level", tone: "mint", ids: ["level"] },
    { label: "Music", tone: "sky", ids: ["keys", "meter"] },
  ];
  const toneOf = (id: SettingPop) => PILL_GROUPS.find((g) => g.ids.includes(id))?.tone ?? "action";

  // The ensemble as it would be arranged now: which parts, who plays what.
  $: preview = (() => {
    try {
      return players >= 2 ? arrangeEnsemble(settings.members) : null;
    } catch {
      return null;
    }
  })();
  const countOf = (id: string) => settings.members.find((m) => m.instrument === id)?.count ?? 0;
  function setCount(id: string, n: number) {
    const count = Math.max(0, Math.min(MAX_EACH, n));
    const others = settings.members.filter((m) => m.instrument !== id);
    if (playerCount(others) + count > MAX_PLAYERS) return;
    // Kept in score order, so a link and a preset compare the same.
    const members: EnsembleMember[] = ENSEMBLE_INSTRUMENTS.map((i) => ({ instrument: i.id, count: i.id === id ? count : countOf(i.id) })).filter((m) => m.count > 0);
    settings = { ...settings, members };
  }
  function choosePreset(id: string) {
    const p = ENSEMBLE_PRESETS.find((x) => x.id === id);
    if (p) settings = { ...settings, members: p.members.map((m) => ({ ...m })), keys: [...p.keys], style: p.style };
  }
  function toggle<T>(items: T[], item: T): T[] {
    if (items.includes(item)) return items.length > 1 ? items.filter((x) => x !== item) : items;
    return [...items, item];
  }

  // ── Display: one part or the full score, solfège, the bar's Layout menu ─────
  let scoreView: ScoreView = loadScoreView("ensemble", { scale: 1, bars: null, spacing: "normal" });
  function changeScoreView(patch: Partial<ScoreView>) {
    scoreView = { ...scoreView, ...patch };
    saveScoreView("ensemble", scoreView);
    pausePlayback();
    void tick().then(render);
  }
  const fullscreenCtl = createFullscreen();
  const fullscreenOn = fullscreenCtl.active;
  onDestroy(fullscreenCtl.destroy);
  $: annotationChoices = [
    { id: "measures", label: "Measure numbers", on: scoreView.measureNumbers !== false },
    { id: "movable", label: "Solfège", on: lyrics === "movable" },
    { id: "names", label: "Note names", on: lyrics === "names" },
  ];
  function pickAnnotation(id: string) {
    if (id === "measures") return changeScoreView({ measureNumbers: scoreView.measureNumbers === false });
    lyrics = lyrics === id ? null : (id as LyricSystem);
    pausePlayback();
    void tick().then(render);
  }
  $: staffNames = exercise ? exercise.arrangement.staves.map((s) => s.name) : [];
  $: onePart = staffNames.length > 1 && staffNames.filter((n) => !hiddenVoices.has(n)).length === 1 ? staffNames.find((n) => !hiddenVoices.has(n)) ?? null : null;
  function showOnly(name: string | null) {
    hiddenVoices = new Set(name ? staffNames.filter((n) => n !== name) : []);
    pausePlayback();
    void tick().then(render);
  }
  function toggleHidden(name: string) {
    const next = new Set(hiddenVoices);
    next.has(name) ? next.delete(name) : next.add(name);
    // Never every staff: there would be nothing to draw.
    if (next.size >= staffNames.length) return;
    hiddenVoices = next;
    pausePlayback();
    void tick().then(render);
  }

  $: bpm = settings.bpm;
  const settingsLink = () => `${location.origin}/ensemble-sightreading?${settingsQuery(settings)}`;
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

  async function generate() {
    if (isGenerating) return;
    if (players < 2) {
      error = "Choose at least two players: an ensemble has parts.";
      return;
    }
    if (!(await mayGenerate())) return;
    isGenerating = true;
    error = "";
    pausePlayback();
    try {
      await tick();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const key = pick(settings.keys);
      const meter = pick(settings.meters);
      const timeSig = timeSignaturesFor([meter])[meter];
      const ex = generateEnsembleExercise({ members: settings.members, key, timeSig, measures: settings.measures, level: settings.level, style: settings.style, bpm: settings.bpm, title: `${preset?.label ?? "Ensemble"}, concert ${keyLabel(key)}` });
      exercise = { ...ex, key, meter };
      // A staff hidden before keeps hidden if it is still there; otherwise the whole score.
      const names = new Set(ex.arrangement.staves.map((s) => s.name));
      hiddenVoices = new Set([...hiddenVoices].filter((n) => names.has(n)));
      if (hiddenVoices.size >= names.size) hiddenVoices = new Set();
      mutedVoices = new Set([...mutedVoices].filter((n) => names.has(n)));
      generatedBpm = settings.bpm;
      history.replaceState(null, "", `${location.pathname}?${settingsQuery(settings)}`);
      await tick();
      await render();
      void countGeneration();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The writer's own words name a chord; a teacher needs what to do.
      error = /fits here|Failed to generate/.test(msg) ? "That one could not be written for these instruments. Press New exercise to try again, or choose fewer bars." : msg;
    } finally {
      isGenerating = false;
    }
  }

  /** The score for these staves, laid out as the page asks. */
  function abcFor(ex: NonNullable<typeof exercise>, names: Set<string> | null): string {
    const staves = ex.arrangement.staves;
    const keep = staves.map((s, i) => i).filter((i) => !names || names.has(staves[i].name));
    const timeSig = timeSignaturesFor([ex.meter])[ex.meter];
    let abc = ensembleAbc(
      keep.map((i) => staves[i]),
      keep.map((i) => ex.staffNotes[i]),
      ex.concert[0],
      { key: ex.key, timeSig, bpm: generatedBpm, title: names && names.size === 1 ? [...names][0] : undefined, display: { lyrics } },
    );
    return withCopyright(withMeasureNumbers(withLineSpacing(abc, scoreView.spacing), scoreView.measureNumbers));
  }

  async function render() {
    if (!exercise) return;
    const abcjs = (await import("abcjs")).default;
    const shown = new Set(staffNames.filter((n) => !hiddenVoices.has(n)));
    const abc = abcFor(exercise, shown);
    document.getElementById("paper")?.removeAttribute("style");
    const box = document.getElementById("paper-box");
    const staffwidth = Math.max(140, Math.floor((box?.clientWidth ?? 760) / scoreView.scale) - 30);
    // Bars a line as the Choral page asks for them: a preference, through abcjs's wrap.
    const bars = scoreView.bars ?? (narrow ? 2 : 4);
    const tunes = abcjs.renderAbc("paper", abc, { add_classes: true, responsive: "resize", staffwidth, wrap: { minSpacing: 1.2, maxSpacing: 2.7, preferredMeasuresPerLine: bars } });
    renderedTune = tunes[0];
    styleCopyright(document.getElementById("paper"));
    await buildSynth();
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  let lit: Element[] = [];
  function light(els: Element[]) {
    for (const e of lit) e.classList.remove("ensemble-now");
    lit = els;
    for (const e of lit) e.classList.add("ensemble-now");
  }

  async function buildSynth() {
    if (!renderedTune || !exercise) return;
    const abcjs = (await import("abcjs")).default;
    // Every staff is heard, hidden or not: playback reads the whole score (as AbcjsChoral does).
    const [full] = abcjs.parseOnly(abcFor(exercise, null));
    renderedTune.setUpAudio = (params: any) => full.setUpAudio(params);
    try { synthControl?.destroy?.(); } catch {}
    synthControl = new abcjs.synth.SynthController();
    const meter = exercise.meter;
    const cursorControl = {
      extraMeasuresAtBeginning: countInMeasures(meter),
      beatSubdivisions: 16,
      onBeat: (beat: number) => showCountIn(meter, beat),
      onEvent: (event: any) => light((event?.elements ?? []).flat()),
      onFinished: () => {
        isPlaying = false;
        light([]);
        hideCountIn();
        if (looping && synthControl) synthControl.play().then(() => (isPlaying = true));
      },
    };
    const voicesOff = staffNames.map((n, i) => (mutedVoices.has(n) ? i : -1)).filter((i) => i >= 0);
    const drum = clickOn ? drumPatternFor({ beats: beatsOf(meter), subdivision: 1, accent: true, sound: DEFAULT_CLICK_SOUND }) : "";
    await synthControl.setTune(renderedTune, false, {
      soundFontUrl: "/api/soundfont/",
      soundFontVolumeMultiplier: 3.0,
      drumIntro: countInMeasures(meter),
      ...(drum ? { drum, drumBars: 1 } : {}),
      ...(voicesOff.length ? { voicesOff } : {}),
    });
    await synthControl.load("#ensemble-audio", cursorControl, { displayWarp: true });
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
    light([]);
    hideCountIn();
  }

  async function toggleMute(name: string) {
    const next = new Set(mutedVoices);
    next.has(name) ? next.delete(name) : next.add(name);
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
    document.querySelectorAll("[data-skeleton]").forEach((el) => el.remove());
    narrow = window.innerWidth <= 640;
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
    settings = settingsFromQuery(location.search);
    void loadSaved();
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
  <section class="setbar sr-panel w-full no-print" aria-label="Exercise settings" bind:this={setbarEl}>
    <div class="setbar-pills">
      {#each PILL_GROUPS as g}
        <div class="set-group" role="group" aria-label={g.label}>
          <span class="set-group-label" aria-hidden="true"><span class="set-group-dot tone-{g.tone}"></span>{g.label}</span>
          <div class="set-group-pills">
            {#each g.ids as id}
              <button
                type="button"
                class="set-pill {id === 'ensemble' ? 'set-pill-level' : ''}"
                aria-expanded={settingPop === id}
                aria-label="{POP_TITLE[id]}: {pillText[id]}"
                on:click={(e) => togglePop(id, e)}
              >
                {pillText[id]}
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
      <div in:popIn out:popOut class="set-pop {settingPop === 'ensemble' ? 'set-pop-wide' : ''}" style="--pop-left: {popLeft}px" role="dialog" aria-label={POP_TITLE[settingPop]}>
        <p class="set-pop-title"><span class="set-group-dot tone-{toneOf(settingPop)}"></span>{POP_TITLE[settingPop]}</p>
        {#if settingPop === "ensemble"}
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <p class="sr-label">My ensembles</p>
              {#if saved.length}
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="My ensembles">
                  {#each saved as p (p.id)}
                    <span class="saved-chip {savedNow?.id === p.id ? 'on' : ''}">
                      <button type="button" class="saved-open" aria-pressed={savedNow?.id === p.id} on:click={() => openSaved(p)}>{p.name}</button>
                      <button type="button" class="saved-x" aria-label="Delete {p.name}" title="Delete" on:click={() => forgetSaved(p)}><X size={13} /></button>
                    </span>
                  {/each}
                </div>
              {/if}
              <form class="flex flex-wrap items-center gap-1.5" on:submit|preventDefault={saveEnsemble}>
                <input class="save-name" type="text" maxlength="80" placeholder={savedNow ? `Saved as ${savedNow.name}` : "Name this ensemble, e.g. 3rd period band"} bind:value={savedName} aria-label="Name to save this ensemble as" />
                <button type="submit" class="sr-tok" disabled={!savedName.trim() || saving || players < 2}>{saving ? "Saving…" : "Save"}</button>
              </form>
              <p class="text-xs text-sr-faint">Keeps the instruments, style, level, keys, meter, length and tempo.{saveError ? ` ${saveError}` : ""}</p>
            </div>
            <p class="sr-label -mb-2">Ready-made</p>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Ready-made ensembles">
              {#each ENSEMBLE_PRESETS as p (p.id)}
                <button type="button" class="sr-tok {preset?.id === p.id ? 'sr-on' : ''}" aria-pressed={preset?.id === p.id} on:click={() => choosePreset(p.id)}>{p.label}</button>
              {/each}
            </div>
            <div class="grid gap-4 sm:grid-cols-3">
              {#each FAMILIES as f}
                <div class="flex flex-col gap-1.5" role="group" aria-label={f.label}>
                  <p class="sr-label">{f.label}</p>
                  {#each ENSEMBLE_INSTRUMENTS.filter((i) => i.family === f.id) as inst (inst.id)}
                    <div class="inst-row {countOf(inst.id) ? 'on' : ''}">
                      <span class="inst-name">{inst.name}</span>
                      <button type="button" class="inst-step" aria-label="One fewer {inst.name}" disabled={!countOf(inst.id)} on:click={() => setCount(inst.id, countOf(inst.id) - 1)}><Minus size={14} /></button>
                      <span class="inst-count" aria-live="polite" aria-label="{countOf(inst.id)} {inst.name}">{countOf(inst.id)}</span>
                      <button type="button" class="inst-step" aria-label="One more {inst.name}" on:click={() => setCount(inst.id, countOf(inst.id) + 1)}><Plus size={14} /></button>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
            {#if players < 2}
              <p class="text-sm text-sr-muted">Choose at least two players.</p>
            {:else if preview}
              <div class="text-sm text-sr-ink-2">
                <p class="sr-label mb-1">{players} players in {preview.parts.length} parts</p>
                <ol class="parts-preview">
                  {#each preview.parts as _, k}
                    <li><span class="part-no">{k + 1}</span>{preview.staves.filter((s) => s.part === k).map((s) => `${s.name}${s.octave ? (s.octave > 0 ? " (8va)" : " (8vb)") : ""}`).join(", ")}</li>
                  {/each}
                </ol>
                <p class="text-xs text-sr-faint mt-2">Parts are shared by register, the way a band chorale doubles its lines. Every player reads their own staff in their own key.</p>
              </div>
            {/if}
          </div>
        {:else if settingPop === "level"}
          <p class="sr-label mb-1.5">Style</p>
          <div class="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Style">
            {#each STYLES as st}
              <button type="button" class="sr-tok {settings.style === st.id ? 'sr-on' : ''}" aria-pressed={settings.style === st.id} on:click={() => (settings = { ...settings, style: st.id })}>{st.label}</button>
            {/each}
          </div>
          <p class="text-sm text-sr-muted mb-4">{STYLES.find((x) => x.id === settings.style)?.note}</p>
          <p class="sr-label mb-1.5">Level</p>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Level">
            {#each [1, 2, 3, 4, 5] as n}
              <button type="button" class="sr-tok {settings.level === n ? 'sr-on' : ''}" aria-pressed={settings.level === n} on:click={() => (settings = { ...settings, level: n })}>{n}</button>
            {/each}
          </div>
          {#if settings.style === "chorale"}
            <p class="text-sm text-sr-muted mt-3">Level {settings.level}: {settings.level <= 2 ? "diatonic chords and their inversions, decorated now and then." : settings.level <= 4 ? "adds secondary dominants (fi, si, di), decorated more often." : "the busiest: every chord tone that can be decorated, is."}</p>
          {:else}
            <p class="text-sm text-sr-muted mt-3">Level {settings.level}: {LEVEL_NOTE[settings.level]}</p>
            <p class="text-xs text-sr-faint mt-2">The rhythms, chords and skips of the UIL sight-reading levels.</p>
          {/if}
        {:else if settingPop === "keys"}
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Concert keys">
            {#each ENSEMBLE_KEYS as k}
              <button type="button" class="sr-tok chip {settings.keys.includes(k) ? 'sr-on' : ''}" aria-pressed={settings.keys.includes(k)} on:click={() => (settings = { ...settings, keys: toggle(settings.keys, k) })}>{keyLabel(k)}</button>
            {/each}
          </div>
          <p class="text-xs text-sr-faint mt-2">Concert pitch. Each exercise draws one; a B♭ trumpet reads it a step higher, an alto sax a sixth higher.</p>
        {:else if settingPop === "meter"}
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Meters">
              {#each ENSEMBLE_METERS as m}
                <button type="button" class="sr-tok chip {settings.meters.includes(m) ? 'sr-on' : ''}" aria-pressed={settings.meters.includes(m)} on:click={() => (settings = { ...settings, meters: toggle(settings.meters, m) })}>{m}</button>
              {/each}
            </div>
            <p class="sr-label">Bars</p>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Bars">
              {#each ENSEMBLE_LENGTHS as n}
                <button type="button" class="sr-tok chip {settings.measures === n ? 'sr-on' : ''}" aria-pressed={settings.measures === n} on:click={() => (settings = { ...settings, measures: n })}>{n}</button>
              {/each}
            </div>
          </div>
        {/if}
        <div class="set-pop-foot">
          <button class="sr-tok" on:click={() => closePops()}>Done</button>
          <button class="sr-btn flex items-center gap-1.5" on:click={() => { closePops(false); generate(); }} disabled={isGenerating || players < 2}><RefreshCw size={16} /><span>New exercise</span></button>
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
        Concert {keyLabel(exercise.key)} · {exercise.meter} · {settings.style === "chorale" ? "chorale" : "simple"}, level {settings.level} · {exercise.arrangement.parts.length} parts{#if onePart} · showing {onePart} only{/if}
      </p>
      <div class="score-tools" bind:this={toolsEl}>
        <div class="focus-hide no-print flex flex-wrap items-center gap-2">
          <button type="button" class="tool-btn" aria-expanded={toolPop === "display"} on:click={(e) => toggleTool("display", e)}><Eye size={16} aria-hidden="true" />Display</button>
        </div>
        {#if toolPop === "display"}
          <button class="set-scrim" aria-label="Close" tabindex="-1" on:click={() => closePops()} transition:fade={{ duration: reduceMotion ? 0 : 140 }}></button>
          <div in:popIn out:popOut class="set-pop set-pop-tools no-print" role="dialog" aria-label="Display">
            <p class="set-pop-title">Display</p>
            <div class="flex flex-col gap-4">
              <div class="space-y-2">
                <p class="sr-label">Show</p>
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                  <button type="button" class="sr-tok {hiddenVoices.size === 0 ? 'sr-on' : ''}" aria-pressed={hiddenVoices.size === 0} on:click={() => showOnly(null)}>Full score</button>
                  {#each staffNames as n}
                    <button type="button" class="sr-tok {onePart === n ? 'sr-on' : ''}" aria-pressed={onePart === n} on:click={() => showOnly(n)}>{n}</button>
                  {/each}
                </div>
                <p class="text-xs text-sr-faint">One part shows a player their own staff, in their own key and clef. Every part is still heard.</p>
              </div>
              <div class="space-y-2">
                <p class="sr-label">Under the notes</p>
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Under the notes">
                  <button type="button" class="sr-tok {lyrics === null ? 'sr-on' : ''}" aria-pressed={lyrics === null} on:click={() => { lyrics = null; render(); }}>Nothing</button>
                  <button type="button" class="sr-tok {lyrics === 'movable' ? 'sr-on' : ''}" aria-pressed={lyrics === "movable"} on:click={() => { lyrics = "movable"; render(); }}>Solfège</button>
                  <button type="button" class="sr-tok {lyrics === 'names' ? 'sr-on' : ''}" aria-pressed={lyrics === "names"} on:click={() => { lyrics = "names"; render(); }}>Note names</button>
                </div>
              </div>
              <div class="space-y-2">
                <p class="sr-label">Annotations</p>
                <button type="button" class="sr-tok {scoreView.measureNumbers !== false ? 'sr-on' : ''}" aria-pressed={scoreView.measureNumbers !== false} on:click={() => changeScoreView({ measureNumbers: scoreView.measureNumbers === false })}>Measure numbers</button>
              </div>
            </div>
            <div class="set-pop-foot"><button class="sr-tok" on:click={() => closePops()}>Done</button></div>
          </div>
        {/if}
      </div>
    {/if}
    <div class="focus-score relative w-full">
      <CountInBadge />
      <div class="sr-sheet w-full" class:hidden={!exercise} id="paper-box">
        <div id="paper"></div>
      </div>
    </div>
  </div>
  <div id="ensemble-audio" class="hidden"></div>
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
  voiceNames={staffNames}
  {mutedVoices}
  {hiddenVoices}
  onToggleHidden={toggleHidden}
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
      class="fs-keep flex-shrink-0 rounded-full px-3 h-11 xl:h-8 text-sm font-bold {clickOn ? 'opacity-100' : 'opacity-50'}"
      aria-pressed={clickOn}
      title={clickOn ? "Click on: turn it off" : "Click off: turn it on"}
      on:click={toggleClick}
    >Click</button>
  </svelte:fragment>
</PlaybackBar>

<style>
  /* The settings row, popovers and score toolbar: the Piano page's, copied (it copies the Unison page's). */
  .setbar { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.625rem; }
  .setbar-pills { display: flex; flex-wrap: wrap; gap: 0.6rem 1.3rem; flex: 1 1 26rem; min-width: 0; overflow-x: clip; padding-left: 3px; }
  .set-group { position: relative; display: flex; flex-direction: column; gap: 0.2rem; }
  .set-group::before { content: ""; position: absolute; left: -0.65rem; top: 0.25rem; bottom: 0.25rem; border-left: 1px solid var(--sr-hairline); }
  .set-group-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .set-group-label { display: inline-flex; align-items: center; gap: 0.35rem; padding-left: 0.4rem; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sr-muted); }
  .set-group-dot { width: 10px; height: 10px; border-radius: 999px; flex: none; display: inline-block; }
  .set-pop-title .set-group-dot { margin-right: 0.5rem; vertical-align: 0.1em; }
  .tone-action { background: var(--sr-action); }
  .tone-sky { background: var(--sr-sky); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-sky-ink) 45%, transparent); }
  .tone-mint { background: var(--sr-mint); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-mint-ink) 45%, transparent); }
  .set-pill-level { background: var(--sr-tint); color: var(--sr-action-fg); }
  .set-pill { display: inline-flex; align-items: center; gap: 0.375rem; min-height: 2.5rem; padding: 0.4rem 0.45rem 0.4rem 0.75rem; border-radius: 999px; background: var(--sr-track); color: var(--sr-ink); font-size: 14px; font-weight: 800; white-space: nowrap; border: 2px solid transparent; transition: background 120ms ease, border-color 120ms ease; }
  .set-pill:hover { border-color: var(--sr-tint); }
  .set-pill[aria-expanded="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  .setbar-count { margin-left: 0.15rem; min-width: 1.25rem; border-radius: 999px; padding: 0 0.4rem; font-size: 11px; line-height: 1.25rem; font-weight: 800; font-variant-numeric: tabular-nums; background: rgba(255, 255, 255, 0.3); }
  .setbar-count.low { background: var(--sr-butter); color: var(--sr-butter-ink); }
  :global(.set-pill-chev) { opacity: 0.7; }
  .setbar-new { margin-left: auto; min-height: 2.75rem; }
  .set-pop { position: absolute; z-index: 40; top: calc(100% + 0.5rem); left: var(--pop-left, 0px); width: min(26.25rem, 100%); max-height: min(70vh, 40rem); overflow: auto; padding: 1rem 1.125rem 1.125rem; border-radius: 24px; background: var(--sr-raise); color: var(--sr-ink); border: 1px solid var(--sr-hairline); box-shadow: 0 2px 6px rgba(21, 33, 58, 0.08), 0 30px 60px -20px rgba(21, 33, 58, 0.45); text-align: left; }
  .set-pop-wide { left: 0; width: 100%; }
  .set-pop-tools { left: auto; right: 0; width: min(40rem, 100%); }
  .set-pop-title { font-family: var(--sr-font-display); font-weight: 600; font-size: 17px; margin-bottom: 0.625rem; }
  .set-pop-foot { position: sticky; bottom: -1.125rem; display: flex; justify-content: flex-end; gap: 0.5rem; margin: 1rem -1.125rem -1.125rem; padding: 0.75rem 1.125rem; background: var(--sr-raise); border-top: 1px solid var(--sr-hairline-2); }
  .set-scrim { display: none; }
  .score-tools { position: relative; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; }
  .tool-btn { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.5rem; padding: 0 0.875rem; border-radius: 999px; background: var(--sr-panel); color: var(--sr-ink-2); font-size: 14px; font-weight: 800; box-shadow: var(--sr-card-shadow); border: 2px solid transparent; }
  .tool-btn:hover { border-color: var(--sr-tint); }
  .tool-btn[aria-expanded="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  @media (max-width: 640px) {
    .setbar-new { flex: 1; justify-content: center; }
    .set-group { width: 100%; }
    .set-pop, .set-pop-wide, .set-pop-tools { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: 100%; max-height: 78vh; border-radius: 28px 28px 0 0; z-index: 60; padding-bottom: calc(1.125rem + env(safe-area-inset-bottom, 0px)); }
    .set-pop-foot { bottom: calc(-1.125rem - env(safe-area-inset-bottom, 0px)); }
    .set-scrim { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(21, 33, 58, 0.35); }
  }
  :global(#paper .ensemble-now) { fill: var(--sr-action); }

  /* The instrument picker: a row an instrument, its count between − and +. */
  .inst-row { display: flex; align-items: center; gap: 0.35rem; padding: 0.15rem 0.25rem 0.15rem 0.6rem; border-radius: 999px; background: var(--sr-track); }
  .inst-row.on { background: var(--sr-tint); }
  .inst-name { flex: 1; font-size: 14px; font-weight: 700; color: var(--sr-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inst-row.on .inst-name { color: var(--sr-action-fg); }
  .inst-count { min-width: 1.4rem; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }
  .inst-step { width: 2rem; height: 2rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: var(--sr-raise); color: var(--sr-ink-2); }
  .inst-step:disabled { opacity: 0.35; }
  .parts-preview { display: flex; flex-direction: column; gap: 0.25rem; }
  .parts-preview li { display: flex; gap: 0.5rem; align-items: baseline; }
  .part-no { min-width: 1.25rem; height: 1.25rem; border-radius: 999px; background: var(--sr-track); font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
  .chip { min-width: 2.75rem; }
  .saved-chip { display: inline-flex; align-items: center; border-radius: 999px; background: var(--sr-track); border: 2px solid transparent; }
  .saved-chip.on { background: var(--sr-tint); border-color: var(--sr-action); }
  .saved-open { padding: 0.35rem 0.25rem 0.35rem 0.8rem; font-size: 14px; font-weight: 700; color: var(--sr-ink); }
  .saved-chip.on .saved-open { color: var(--sr-action-fg); }
  .saved-x { width: 1.75rem; height: 1.75rem; margin-right: 0.15rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; color: var(--sr-muted); }
  .saved-x:hover { background: var(--sr-raise); color: var(--sr-ink); }
  .save-name { flex: 1 1 14rem; min-width: 0; min-height: 2.5rem; padding: 0 0.9rem; border-radius: 999px; background: var(--sr-track); color: var(--sr-ink); border: 2px solid transparent; font-size: 14px; }
  .save-name:focus { outline: none; border-color: var(--sr-action); }
</style>
