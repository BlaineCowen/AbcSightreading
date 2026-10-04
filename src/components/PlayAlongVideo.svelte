<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { BACKING_TRACKS, barsFor, countInBarsFor, maxBarsIn, type BackingTrack } from "../lib/play-along/backing-tracks";
  import { frameAt, tempoChoices } from "../lib/play-along/timeline";
  import { renderBars, type BarImage } from "../lib/play-along/bar-images";
  import { FADE_SECONDS, PlayAlongAudio } from "../lib/play-along/audio";
  import { drawScene, H, W } from "../lib/play-along/scene";
  import { startRecording, videoFileName, videoType, type Recording } from "../lib/play-along/recorder";
  import { beatsOf, meterKindOf } from "../lib/meter";
  import { downloadFile } from "../lib/download";
  import { RHYTHM_SOUNDS, rhythmSoundFor, volumeMultiplierFor, withRhythmSound } from "../lib/rhythm-sounds";
  import { CLICK_SOUNDS, DEFAULT_CLICK_SOUND, isClickSound, type ClickSound } from "../lib/tuner/click-sounds";
  import type { UnisonScore } from "../lib/generateUnison";

  /**
   * Play-along video (Pro): a backing track plays while two bars show, one
   * above the other, a ball bouncing through the top bar then the bottom, the
   * top turning over to the next bar as soon as the ball leaves it
   * (src/lib/play-along/timeline.ts). About a minute and a half, then a
   * finish card.
   *
   * One exercise per meter, long enough for every track in it (maxBarsIn):
   * swapping between tracks in a meter is instant and free, each using its
   * first barsFor bars; only a track in another meter writes a new one. The
   * tempo can move ±15% with the backing warped, pitch kept (stretch.ts), and
   * the rhythm syllables change here without a new exercise (the page writes
   * the exercise out again in the system asked for).
   *
   * Everything is drawn on one 1920x1080 canvas (src/lib/play-along/scene.ts),
   * so full screen and the exported video are the same picture; the controls
   * live outside it and never reach the file.
   */

  /** The meters picked on the page: tracks in the same kind of meter are offered, these first. */
  export let meters: string[];
  /** Writes a rhythm-only exercise (counted against the allowance) and returns it as data. */
  export let generate: (o: { measures: number; bpm: number; meter: string }) => Promise<UnisonScore>;
  /** Writes an exercise out as ABC to draw: syllables in a system or "off", the page's rhythm sound. */
  export let write: (score: UnisonScore, o: { syllables: string; bpm: number; meter: string }) => string;
  /** The syllable systems on offer (the page's, and the teacher's own once loaded). */
  export let syllableChoices: { id: string; label: string }[] = [];
  /** The syllables the page shows, which the video starts on. */
  export let initialSyllables = "off";
  /** The page's rhythm sound: the guide starts on it unless this browser has chosen another for videos. */
  export let rhythmSoundId = "claves";
  export let onClose: () => void;

  /** How long the finish card stays after the last bar. */
  const FINISH_SECONDS = 3.5;

  const kinds = new Set(meters.map((m) => meterKindOf(m)));
  const tracks: BackingTrack[] = BACKING_TRACKS.filter((t) => kinds.has(meterKindOf(t.meter))).sort(
    (a, b) => Number(meters.includes(b.meter)) - Number(meters.includes(a.meter)),
  );

  let trackId = tracks[0]?.id ?? "";
  $: track = tracks.find((t) => t.id === trackId) ?? null;

  /**
   * The sound panel: each level 0 to 1, 0 being off. The guide and the click
   * start off, so the class performs the rhythm over the loop. Remembered in
   * this browser (a convenience; private windows start fresh).
   */
  const SOUND_KEY = "abcsr_playalong_sound";
  type SoundPrefs = { loop: number; guide: number; click: number; guideSound: string; clickSound: ClickSound };
  function savedSound(): SoundPrefs {
    const fallback: SoundPrefs = { loop: 1, guide: 0, click: 0, guideSound: rhythmSoundId, clickSound: DEFAULT_CLICK_SOUND };
    try {
      const v = JSON.parse(localStorage.getItem(SOUND_KEY) ?? "null");
      if (!v || typeof v !== "object") return fallback;
      const level = (x: unknown, d: number) => (typeof x === "number" && x >= 0 && x <= 1 ? x : d);
      return {
        loop: level(v.loop, 1),
        guide: level(v.guide, 0),
        click: level(v.click, 0),
        guideSound: RHYTHM_SOUNDS.some((r) => r.id === v.guideSound) ? v.guideSound : rhythmSoundId,
        clickSound: isClickSound(v.clickSound) ? v.clickSound : DEFAULT_CLICK_SOUND,
      };
    } catch {
      return fallback;
    }
  }
  let sound = savedSound();
  let soundOpen = false;
  $: try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(sound));
  } catch {
    // Storage blocked: the choices last until the overlay closes.
  }

  /** The exercise, the meter it is in and how many bars it has (the most any track in that meter needs). */
  let score: UnisonScore | null = null;
  let scoreMeter = "";
  let scoreBars = 0;
  /** Rhythm syllables: a system id, or "off". */
  let syllables = initialSyllables;
  $: syllableOptions = [{ id: "off", label: "Off" }, ...syllableChoices];
  /** The exercise as drawn, in the chosen syllables; the guide is rendered from it. */
  let abc = "";

  /** The tempo the video plays at: the track's own, or half speed to 150% of it (tempoChoices). */
  let tempo = 0;
  $: choices = track ? tempoChoices(track.bpm) : [];
  /** The tempo the backing has been warped to (it lags `tempo` while a change is pending). */
  let tunedTo = 0;
  let retuneTimer: ReturnType<typeof setTimeout> | null = null;
  let tuning = false;

  let guideFor = "";
  let guideLoading = false;
  let guideJob: Promise<void> | null = null;
  /**
   * abcjs cannot render the guide while the browser holds audio suspended
   * (its prime() never settles), which it does until a click allows sound.
   * So the guide is rendered once audio runs - at the latest on Play.
   */
  let audioRunning = false;
  let status: "preparing" | "ready" | "playing" | "recording" | "error" = "preparing";
  let error = "";
  let progress = 0;
  let drawing = false;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctx2d: CanvasRenderingContext2D | null = null;
  let audio: PlayAlongAudio | null = null;
  let barImages: BarImage[] = [];
  let bars = 0;
  let countInBars = 1;
  let preparedFor = "";
  let raf = 0;
  let recording: Recording | null = null;
  let isFullscreen = false;
  /** The count-in's first downbeat and the end of the finish, in audio time, while playing. */
  let run: { t0: number; musicEnd: number; end: number } | null = null;

  $: audio?.setMix(sound);
  /** What the guide was rendered for: the instrument, the tempo and the exercise as written. */
  $: guideKey = `${sound.guideSound}|${tempo}|${abc.length}|${syllables}|${scoreBars}`;
  $: if (abc && audioRunning && status === "ready" && guideKey !== guideFor) void renderGuide();

  /** Renders the guide track: the exercise on the chosen instrument at the video's tempo. */
  function renderGuide(): Promise<void> {
    if (!audio || !abc || !tempo) return Promise.resolve();
    guideFor = guideKey;
    guideLoading = true;
    const instrument = rhythmSoundFor(sound.guideSound);
    guideJob = audio
      .renderGuide(withRhythmSound(abc, instrument), tempo, volumeMultiplierFor(instrument))
      .catch(() => {
        error = "That sound could not be loaded. Try another, or play without the guide.";
      })
      .finally(() => {
        guideLoading = false;
        guideJob = null;
      });
    return guideJob;
  }

  /** Lets sound start (Play is a click, so the browser allows it), giving up after a few seconds. */
  async function resumeAudio(): Promise<boolean> {
    if (!audio) return false;
    if (audio.ctx.state !== "running") {
      await Promise.race([audio.ctx.resume(), new Promise((r) => setTimeout(r, 3000))]);
    }
    audioRunning = audio.ctx.state === "running";
    return audioRunning;
  }

  /** Draws the exercise's bars as written in the chosen syllables. */
  async function redraw() {
    if (!score || !track) return;
    drawing = true;
    try {
      abc = write(score, { syllables, bpm: tempo || track.bpm, meter: scoreMeter });
      barImages = (await renderBars(abc, tempo || track.bpm, scoreBars)).bars;
    } finally {
      drawing = false;
    }
  }

  /** Writes a new exercise in `meter`, as long as the longest track in it. Counts against the allowance. */
  async function writeExercise(meter: string) {
    if (!track) return;
    const measures = maxBarsIn(meter);
    score = await generate({ measures, bpm: track.bpm, meter });
    scoreMeter = meter;
    scoreBars = measures;
    await redraw();
  }

  $: if (track && audio && track.id !== preparedFor && (status === "ready" || status === "error")) void useTrack(track);

  /** Switches to a track: the exercise stays if the meter does, and the tempo goes back to the track's own. */
  async function useTrack(t: BackingTrack, newExercise = false) {
    if (!audio) return;
    // Marked at the start, so a failure is not retried by the reactive line
    // above: a new exercise costs one from the monthly allowance.
    preparedFor = t.id;
    status = "preparing";
    error = "";
    try {
      if (retuneTimer) clearTimeout(retuneTimer);
      retuneTimer = null;
      tempo = t.bpm;
      tunedTo = t.bpm;
      if (newExercise || !score || scoreMeter !== t.meter) await writeExercise(t.meter);
      await audio.loadBacking(t);
      countInBars = countInBarsFor(t);
      bars = barsFor(t);
      status = "ready";
    } catch (err) {
      error = err instanceof Error ? err.message : "The play-along could not be made.";
      status = "error";
    }
  }

  /** Sets the tempo; the backing is warped to it a moment after the last change. */
  function setTempo(bpm: number) {
    if (!track || !choices.includes(bpm)) return;
    tempo = bpm;
    if (retuneTimer) clearTimeout(retuneTimer);
    retuneTimer = setTimeout(() => void retune(), 350);
  }

  /** One step slower or faster: 5% of the track's own tempo. */
  function step(dir: 1 | -1) {
    const i = choices.indexOf(tempo);
    const next = choices[i + dir];
    if (next !== undefined) setTempo(next);
  }

  /** Warps the backing to the chosen tempo (about a second the first time at a tempo; kept after). */
  async function retune() {
    retuneTimer = null;
    if (!audio || !track || tunedTo === tempo) return;
    tuning = true;
    // Let "Adjusting tempo…" paint before the work blocks the page.
    await tick();
    await new Promise((r) => setTimeout(r, 30));
    try {
      audio.backingAt(track, tempo);
      tunedTo = tempo;
    } finally {
      tuning = false;
    }
  }

  async function play(record = false) {
    if (!audio || !track || status !== "ready") return;
    if (!(await resumeAudio())) {
      error = "Your browser is blocking sound. Click anywhere on the page, then press Play again.";
      return;
    }
    if (retuneTimer || tunedTo !== tempo) {
      if (retuneTimer) clearTimeout(retuneTimer);
      await retune();
    }
    if (guideJob) await guideJob;
    if (guideFor !== guideKey) await renderGuide();
    await audio.ready();
    if (record) {
      try {
        recording = startRecording(canvas, audio.stream);
      } catch (err) {
        error = err instanceof Error ? err.message : "Recording could not start.";
        return;
      }
    }
    // A moment's lead so the first frame of a recording is the opening screen.
    const t0 = audio.ctx.currentTime + (record ? 0.8 : 0.2);
    const soundEnd = audio.start(t0, { track, bpm: tempo, bars, countInBars, meter: track.meter, clickSound: sound.clickSound });
    const musicEnd = soundEnd - FADE_SECONDS;
    run = { t0, musicEnd, end: musicEnd + FINISH_SECONDS };
    status = record ? "recording" : "playing";
  }

  async function finish() {
    run = null;
    audio?.stop();
    const rec = recording;
    recording = null;
    if (rec && track) {
      const file = await rec.stop();
      downloadFile(file, videoFileName(track.meter, tempo, rec.type), file.type);
    }
    status = "ready";
    progress = 0;
  }

  async function stop() {
    // Stopping a recording part way throws the recording away.
    if (recording) {
      void recording.stop();
      recording = null;
    }
    await finish();
  }

  /** One loop for the life of the overlay: the decoration drifts while idle, and the music drives it while playing. */
  function render() {
    raf = requestAnimationFrame(render);
    if (!ctx2d || !track) return;
    const clock = performance.now() / 1000;
    const bpm = tempo || track.bpm;
    const beats = beatsOf(track.meter);
    const timing = { bars, bpm, meter: track.meter, countInBars };
    const scene = { bars: barImages, total: bars, meter: track.meter, bpm, beats, beatSec: 60 / bpm, countInBars, clock };
    if (run && audio) {
      const now = audio.ctx.currentTime;
      const t = now - run.t0;
      progress = Math.min(1, Math.max(0, t / (run.end - run.t0)));
      drawScene(ctx2d, { ...scene, frame: frameAt(t, timing), t, sinceEnd: Math.max(0, now - run.musicEnd), playing: true });
      if (now >= run.end) void finish();
      return;
    }
    drawScene(ctx2d, { ...scene, frame: { ...frameAt(-1, timing), word: null }, t: -1, sinceEnd: 0, playing: false });
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.requestFullscreen();
    } catch {
      // Refused (no gesture, or an iPhone): the overlay already fills the window.
    }
  }

  async function close() {
    await stop();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && !document.fullscreenElement && status !== "recording") void close();
    if (e.key === " " && (status === "ready" || status === "playing")) {
      e.preventDefault();
      if (status === "playing") void stop();
      else void play();
    }
  }

  const onFullscreenChange = () => (isFullscreen = !!document.fullscreenElement);

  /**
   * A hidden tab gets no animation frames, so the canvas stops changing and
   * the recording would carry on frozen: give up and say why.
   */
  function onVisibility() {
    if (document.visibilityState === "hidden" && status === "recording") {
      void stop();
      error = "The export stopped because this tab was hidden. Keep it showing until the video downloads.";
    }
  }

  onMount(() => {
    ctx2d = canvas.getContext("2d");
    audio = new PlayAlongAudio();
    audioRunning = audio.ctx.state === "running";
    audio.ctx.onstatechange = () => (audioRunning = audio?.ctx.state === "running");
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    void toggleFullscreen();
    // Canvas text only uses a web font once it has loaded.
    void document.fonts?.load(`700 40px Fredoka`);
    raf = requestAnimationFrame(render);
    if (track) void useTrack(track);
    else {
      status = "error";
      error = "There is no backing track for these meters yet.";
    }
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (retuneTimer) clearTimeout(retuneTimer);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    document.removeEventListener("visibilitychange", onVisibility);
    void audio?.close();
  });

  $: busy = status === "playing" || status === "recording";
  $: waiting = status !== "ready" || guideLoading || tuning || drawing;
  const exportable = !!videoType();
</script>

<svelte:window on:keydown={onKey} />

<div
  bind:this={container}
  class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-sr-bar p-4"
  role="dialog"
  aria-modal="true"
  aria-label="Play-along video"
>
  <canvas
    bind:this={canvas}
    width={W}
    height={H}
    class="block max-h-[calc(100vh-6rem)] w-full max-w-[calc((100vh-6rem)*16/9)] rounded-[28px] bg-white"
    aria-label="The play-along: two bars of rhythm with a moving cursor"
  ></canvas>

  {#if status === "recording"}
    <div class="h-1.5 w-full max-w-xl overflow-hidden rounded-full bg-sr-bar-line">
      <div class="h-full bg-sr-action" style="width:{progress * 100}%"></div>
    </div>
  {/if}

  <div class="relative flex w-full justify-center">
    {#if soundOpen}
      <div class="sound-panel sr-panel absolute bottom-full left-1/2 z-10 mb-3 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 p-4 grid gap-3 shadow-xl" role="group" aria-label="Sound">
        <div class="sound-row">
          <span class="sr-label">Backing loop</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={sound.loop} aria-label="Backing loop volume" />
          <span class="level">{Math.round(sound.loop * 100)}%</span>
        </div>
        <div class="sound-row">
          <span class="sr-label">Guide rhythm</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={sound.guide} aria-label="Guide rhythm volume" />
          <span class="level">{sound.guide === 0 ? "Off" : `${Math.round(sound.guide * 100)}%`}</span>
          <select class="sr-tok" bind:value={sound.guideSound} disabled={busy || guideLoading} aria-label="Guide instrument">
            {#each RHYTHM_SOUNDS as r}
              <option value={r.id}>{r.label}</option>
            {/each}
          </select>
        </div>
        <div class="sound-row">
          <span class="sr-label">Click</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={sound.click} aria-label="Click volume" />
          <span class="level">{sound.click === 0 ? "Off" : `${Math.round(sound.click * 100)}%`}</span>
          <select class="sr-tok" bind:value={sound.clickSound} disabled={busy} aria-label="Click sound">
            {#each CLICK_SOUNDS as c}
              <option value={c.id}>{c.label}</option>
            {/each}
          </select>
        </div>
        <p class="text-xs text-sr-muted">Levels change as it plays and go into the exported video. Turn the guide up to hear the rhythm played over the loop.</p>
      </div>
    {/if}

    <div class="controls flex flex-wrap items-center justify-center gap-2" class:dim={busy}>
      <select
        class="sr-tok"
        bind:value={trackId}
        disabled={busy || status === "preparing"}
        aria-label="Backing track"
      >
        {#each tracks as t}
          <option value={t.id}>{t.name}{scoreMeter && t.meter !== scoreMeter ? " · new exercise" : ""}</option>
        {/each}
      </select>
      <div class="tempo flex items-center gap-1" role="group" aria-label="Tempo">
        <button class="sr-tok" disabled={busy || !choices.length || tempo <= choices[0]} on:click={() => step(-1)} aria-label="Slower">−</button>
        <button
          class="sr-tok tempo-value"
          class:sr-on={track && tempo !== track.bpm}
          disabled={busy || !track || tempo === track.bpm}
          title={track && tempo !== track.bpm ? `Back to the track's own ${track.bpm}` : "The track's own tempo"}
          on:click={() => track && setTempo(track.bpm)}
        >
          {#if tuning}Adjusting…{:else}{tempo} BPM <span class="pct">{track ? Math.round((tempo / track.bpm) * 100) : 100}%</span>{/if}
        </button>
        <button class="sr-tok" disabled={busy || !choices.length || tempo >= choices[choices.length - 1]} on:click={() => step(1)} aria-label="Faster">+</button>
      </div>
      <select
        class="sr-tok"
        bind:value={syllables}
        on:change={redraw}
        disabled={busy || status === "preparing" || drawing}
        aria-label="Rhythm syllables"
      >
        {#each syllableOptions as o}
          <option value={o.id}>{o.id === "off" ? "Syllables off" : o.label}</option>
        {/each}
      </select>
      <button class="sr-tok" class:sr-on={soundOpen} aria-expanded={soundOpen} on:click={() => (soundOpen = !soundOpen)}>
        Sound
      </button>
      {#if busy}
        <button class="sr-btn" on:click={stop}>{status === "recording" ? "Cancel export" : "Stop"}</button>
      {:else}
        <button class="sr-btn" disabled={waiting} on:click={() => play()}>
          {status === "preparing" ? "Writing…" : tuning ? "Adjusting tempo…" : guideLoading ? "Loading sound…" : drawing ? "Drawing…" : "Play"}
        </button>
      {/if}
      <button class="sr-tok" disabled={busy || status === "preparing" || !track} on:click={() => track && useTrack(track, true)}>New exercise</button>
      {#if exportable}
        <button
          class="sr-tok"
          disabled={busy || waiting}
          title="Records one full play-along to a video file, in real time"
          on:click={() => play(true)}
        >
          Export video
        </button>
      {/if}
      <button class="sr-tok" on:click={toggleFullscreen}>{isFullscreen ? "Exit full screen" : "Full screen"}</button>
      <button class="sr-tok" disabled={status === "recording"} on:click={close}>Close</button>
    </div>
  </div>

  {#if error}
    <p class="text-sm text-sr-bar-ink" role="alert">{error}</p>
  {:else if status === "recording"}
    <p class="text-sm text-sr-bar-muted">Recording in real time. Keep this tab showing; the video downloads when it ends.</p>
  {/if}
</div>

<style>
  .sound-row {
    display: grid;
    grid-template-columns: 8.5rem 1fr 3.5rem 9.5rem;
    align-items: center;
    gap: 0.75rem;
  }
  .sound-row input[type="range"] {
    accent-color: var(--sr-action);
  }
  .level {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--sr-muted);
  }
  @media (max-width: 640px) {
    .sound-row {
      grid-template-columns: 1fr 3rem;
    }
    .sound-row .sr-label,
    .sound-row select {
      grid-column: 1 / -1;
    }
  }
  .controls {
    transition: opacity 0.4s;
  }
  /* A fixed size, so "Adjusting…" and every tempo take the same room and
     the buttons either side never move. */
  .tempo-value {
    width: 9.5rem;
    justify-content: center;
    white-space: nowrap;
    overflow: hidden;
    font-variant-numeric: tabular-nums;
  }
  .pct {
    margin-left: 0.35rem;
    opacity: 0.65;
    font-weight: 600;
  }
  .controls.dim {
    opacity: 0.2;
  }
  .controls.dim:hover,
  .controls.dim:focus-within {
    opacity: 1;
  }
</style>
