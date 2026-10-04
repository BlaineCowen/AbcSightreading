<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { BACKING_TRACKS, DRUM_LOOPS, barsFor, countInBarsFor, drumLoopId, maxBarsIn, type BackingTrack } from "../lib/play-along/backing-tracks";
  import { barsForLength, frameAt, tempoChoices } from "../lib/play-along/timeline";
  import { barChords, bassAbc, harmonyNotes, progressionChords } from "../lib/play-along/bass";
  import { INSTRUMENTS, isInstrumentProgram, withInstrument } from "../lib/instruments";
  import { renderBars, type BarImage } from "../lib/play-along/bar-images";
  import { PlayAlongAudio } from "../lib/play-along/audio";
  import { drawScene, H, W } from "../lib/play-along/scene";
  import { startRecording, videoFileName, videoType, type Recording } from "../lib/play-along/recorder";
  import { beatUnitOf, beatsOf, meterKindOf } from "../lib/meter";
  import { countInMeasures } from "../lib/count-in";
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
   * Pitched mode (the Unison page with pitches): the exercise is the page's,
   * written about a minute and a half long at the page's tempo; the backing is
   * a drum style in its meter (the loop nearest that tempo, warped to it); the
   * melody can play on any of the page's instruments, and a bass line holds
   * one root a bar under it (bass.ts). The labels are solfège, not syllables.
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
  /** Rhythm (rhythm only, over backing tracks) or pitched (the page's melody, over drums and a bass line). */
  export let mode: "rhythm" | "pitched" = "rhythm";
  /** Pitched: the page's tempo, which the video starts at and its length is set by. */
  export let pageTempo = 90;
  /** Pitched: the page's instrument (a MIDI program), which the melody starts on. */
  export let instrumentProgram = 0;
  /** What the label picker is called: rhythm syllables, or solfège. */
  export let labelNoun = "Syllables";
  export let onClose: () => void;

  /** How long the finish card stays after the last bar. */
  const FINISH_SECONDS = 3.5;

  const pitched = mode === "pitched";
  const kinds = new Set(meters.map((m) => meterKindOf(m)));
  /**
   * Pitched: one drum style per meter, the loop nearest the page's tempo
   * (warped to the exact tempo when it plays). Rhythm: every backing track.
   */
  function drumStyles(): BackingTrack[] {
    const byStyle = new Map<string, (typeof DRUM_LOOPS)[number][]>();
    for (const d of DRUM_LOOPS) {
      if (!meters.includes(d.meter)) continue;
      const k = `${d.style}|${d.meter}`;
      byStyle.set(k, [...(byStyle.get(k) ?? []), d]);
    }
    return [...byStyle.values()].map((variants) => {
      const d = variants.reduce((a, b) => (Math.abs(Math.log(b.bpm / pageTempo)) < Math.abs(Math.log(a.bpm / pageTempo)) ? b : a));
      const t = BACKING_TRACKS.find((x) => x.id === drumLoopId(d))!;
      return { ...t, name: `Drums: ${d.label} (${d.meter})` };
    });
  }
  const tracks: BackingTrack[] = pitched
    ? drumStyles()
    : BACKING_TRACKS.filter((t) => kinds.has(meterKindOf(t.meter))).sort(
        (a, b) => Number(meters.includes(b.meter)) - Number(meters.includes(a.meter)),
      );
  /** Pitched: bars for about a minute and a half at the page's tempo, an even number, in fours. */
  const pitchedBars = (meter: string) =>
    barsForLength({ bpm: pageTempo, meter, loopBars: 4, countInBars: countInMeasures(meter) });

  let trackId = tracks[0]?.id ?? "";
  $: track = tracks.find((t) => t.id === trackId) ?? null;

  /**
   * The sound panel: each level 0 to 1, 0 being off. The guide and the click
   * start off, so the class performs the rhythm over the loop. Remembered in
   * this browser (a convenience; private windows start fresh).
   */
  const SOUND_KEY = "abcsr_playalong_sound";
  type SoundPrefs = {
    loop: number; guide: number; click: number; bass: number;
    guideSound: string; clickSound: ClickSound; melodyProgram: number;
    /** The bouncing ball (and the glow under the note it lands on); off, the reader keeps their own place. */
    ball: boolean;
  };
  function savedSound(): SoundPrefs {
    const fallback: SoundPrefs = {
      loop: 1, guide: 0, click: 0, bass: 0.8,
      guideSound: rhythmSoundId, clickSound: DEFAULT_CLICK_SOUND, melodyProgram: instrumentProgram, ball: true,
    };
    try {
      const v = JSON.parse(localStorage.getItem(SOUND_KEY) ?? "null");
      if (!v || typeof v !== "object") return fallback;
      const level = (x: unknown, d: number) => (typeof x === "number" && x >= 0 && x <= 1 ? x : d);
      return {
        loop: level(v.loop, 1),
        guide: level(v.guide, 0),
        click: level(v.click, 0),
        bass: level(v.bass, 0.8),
        guideSound: RHYTHM_SOUNDS.some((r) => r.id === v.guideSound) ? v.guideSound : rhythmSoundId,
        clickSound: isClickSound(v.clickSound) ? v.clickSound : DEFAULT_CLICK_SOUND,
        // The page's instrument, unless this browser chose another for videos.
        melodyProgram: isInstrumentProgram(v.melodyProgram) ? Number(v.melodyProgram) : instrumentProgram,
        ball: v.ball !== false,
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
  /** The tempo the steps are a share of: the track's own, or (pitched) the page's. */
  $: baseTempo = pitched ? pageTempo : track?.bpm ?? 0;
  $: choices = baseTempo ? tempoChoices(baseTempo) : [];
  /** The tempo the backing has been warped to (it lags `tempo` while a change is pending). */
  let tunedTo = 0;
  let retuneTimer: ReturnType<typeof setTimeout> | null = null;
  let tuning = false;

  /** The guide key the latest render was started for, and the one whose buffer the player holds. */
  let guideFor = "";
  let guideReady = "";
  let guideSeq = 0;
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

  $: audio?.setMix({ ...sound, bass: pitched ? sound.bass : 0 });
  /**
   * Pitched: the bass line for the exercise, as ABC (bass.ts): the progression
   * it was written over, or one root a bar read from the melody where the
   * older walk wrote it.
   */
  $: bassText =
    pitched && score?.key
      ? bassAbc(
          score.harmony
            ? progressionChords(score.harmony)
            : barChords(
                harmonyNotes((score.partsObject as any).parts.Unison.chordNoteObject),
                score.timeSig.tsPerMeasure,
                beatUnitOf(scoreMeter),
                /m$/.test(score.key),
              ),
          { key: score.key, meter: scoreMeter, barUnits: score.timeSig.tsPerMeasure },
        )
      : "";
  /** What the guide (and bass) was rendered for: the instrument, the tempo and the exercise as written. */
  $: guideKey = `${pitched ? sound.melodyProgram : sound.guideSound}|${tempo}|${abc.length}|${syllables}|${scoreBars}|${bassText.length}`;
  $: if (abc && audioRunning && status === "ready" && guideKey !== guideFor) void renderGuide();

  /**
   * Renders the guide track: the exercise on the chosen instrument at the
   * video's tempo. Renders can overlap - a track changed while the last
   * guide was still rendering - so each is numbered and only the newest is
   * kept: the older one finishing last once left the guide at the previous
   * track's tempo, further behind every bar.
   */
  function renderGuide(): Promise<void> {
    if (!audio || !abc || !tempo) return Promise.resolve();
    const seq = ++guideSeq;
    const key = guideKey;
    guideFor = key;
    guideLoading = true;
    const a = audio;
    const melody = pitched
      ? a.renderGuide(withInstrument(abc, sound.melodyProgram), tempo, 3)
      : a.renderGuide(withRhythmSound(abc, rhythmSoundFor(sound.guideSound)), tempo, volumeMultiplierFor(rhythmSoundFor(sound.guideSound)));
    const bassLine = pitched && bassText ? a.renderGuide(bassText, tempo, 3) : Promise.resolve(null);
    const job: Promise<void> = Promise.all([melody, bassLine])
      .then(([buffer, bassBuffer]) => {
        if (seq !== guideSeq) return;
        a.setGuide(buffer);
        a.setBass(bassBuffer);
        guideReady = key;
      })
      .catch(() => {
        if (seq === guideSeq) error = "That sound could not be loaded. Try another, or play without the guide.";
      })
      .finally(() => {
        if (seq !== guideSeq) return;
        guideLoading = false;
        guideJob = null;
      });
    guideJob = job;
    return job;
  }

  /** Waits until the guide the player holds is the one for what is about to play. */
  async function guideUpToDate() {
    for (let tries = 0; tries < 3 && guideReady !== guideKey; tries++) {
      if (guideJob && guideFor === guideKey) await guideJob;
      else await renderGuide();
    }
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
    const measures = pitched ? pitchedBars(meter) : maxBarsIn(meter);
    score = await generate({ measures, bpm: pitched ? pageTempo : track.bpm, meter });
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
      // Rhythm: each track at its own tempo. Pitched: the tempo is the exercise's,
      // kept when the drum style changes (the new loop is warped to it).
      if (!pitched || !tempo) tempo = pitched ? pageTempo : t.bpm;
      tunedTo = t.bpm;
      // The guide held is for the last track's tempo; nothing plays it until the
      // new one is in, and the reactive render above must start again even if
      // the last render was started for the same key.
      guideReady = "";
      guideFor = "";
      audio.setGuide(null);
      audio.setBass(null);
      if (newExercise || !score || scoreMeter !== t.meter) await writeExercise(t.meter);
      await audio.loadBacking(t);
      countInBars = countInBarsFor(t);
      bars = pitched ? scoreBars : barsFor(t);
      // A loop at another tempo than the video's is warped now, before Play.
      if (tempo !== t.bpm) {
        tunedTo = 0;
        retuneTimer = setTimeout(() => void retune(), 50);
      }
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
    await guideUpToDate();
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
    const { musicEnd, soundEnd } = audio.start(t0, { track, bpm: tempo, bars, countInBars, meter: track.meter, clickSound: sound.clickSound });
    // The finish card stays at least until the last hit has rung out.
    run = { t0, musicEnd, end: Math.max(musicEnd + FINISH_SECONDS, soundEnd) };
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
    const scene = { bars: barImages, total: bars, meter: track.meter, bpm, beats, beatSec: 60 / bpm, countInBars, clock, showBall: sound.ball };
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
          <span class="sr-label">{pitched ? "Drums" : "Backing loop"}</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={sound.loop} aria-label="Backing loop volume" />
          <span class="level">{Math.round(sound.loop * 100)}%</span>
        </div>
        <div class="sound-row">
          <span class="sr-label">{pitched ? "Melody" : "Guide rhythm"}</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={sound.guide} aria-label={pitched ? "Melody volume" : "Guide rhythm volume"} />
          <span class="level">{sound.guide === 0 ? "Off" : `${Math.round(sound.guide * 100)}%`}</span>
          {#if pitched}
            <select class="sr-tok" bind:value={sound.melodyProgram} disabled={busy || guideLoading} aria-label="Melody instrument">
              {#each INSTRUMENTS as inst}
                <option value={inst.program}>{inst.label}</option>
              {/each}
            </select>
          {:else}
            <select class="sr-tok" bind:value={sound.guideSound} disabled={busy || guideLoading} aria-label="Guide instrument">
              {#each RHYTHM_SOUNDS as r}
                <option value={r.id}>{r.label}</option>
              {/each}
            </select>
          {/if}
        </div>
        {#if pitched}
          <div class="sound-row">
            <span class="sr-label">Bass</span>
            <input type="range" min="0" max="1" step="0.05" bind:value={sound.bass} aria-label="Bass volume" />
            <span class="level">{sound.bass === 0 ? "Off" : `${Math.round(sound.bass * 100)}%`}</span>
          </div>
        {/if}
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
        <p class="text-xs text-sr-muted">Levels change as it plays and go into the exported video. {pitched ? "Turn the melody up to hear the line played; the bass holds one root a bar." : "Turn the guide up to hear the rhythm played over the loop."}</p>
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
          class:sr-on={!!baseTempo && tempo !== baseTempo}
          disabled={busy || !baseTempo || tempo === baseTempo}
          title={baseTempo && tempo !== baseTempo ? `Back to ${baseTempo}` : pitched ? "The exercise's tempo" : "The track's own tempo"}
          on:click={() => baseTempo && setTempo(baseTempo)}
        >
          {#if tuning}Adjusting…{:else}{tempo} BPM <span class="pct">{baseTempo ? Math.round((tempo / baseTempo) * 100) : 100}%</span>{/if}
        </button>
        <button class="sr-tok" disabled={busy || !choices.length || tempo >= choices[choices.length - 1]} on:click={() => step(1)} aria-label="Faster">+</button>
      </div>
      <select
        class="sr-tok"
        bind:value={syllables}
        on:change={redraw}
        disabled={busy || status === "preparing" || drawing}
        aria-label={labelNoun}
      >
        {#each syllableOptions as o}
          <option value={o.id}>{o.id === "off" ? `${labelNoun} off` : o.label}</option>
        {/each}
      </select>
      <button
        class="sr-tok"
        class:sr-on={sound.ball}
        aria-pressed={sound.ball}
        title={sound.ball ? "Hide the bouncing ball" : "Show the bouncing ball"}
        on:click={() => (sound = { ...sound, ball: !sound.ball })}
      >Ball {sound.ball ? "on" : "off"}</button>
      <button class="sr-tok" class:sr-on={soundOpen} aria-expanded={soundOpen} on:click={() => (soundOpen = !soundOpen)}>
        Sound
      </button>
      {#if busy}
        <button class="sr-btn main-btn" on:click={stop}>{status === "recording" ? "Cancel export" : "Stop"}</button>
      {:else}
        <button class="sr-btn main-btn" disabled={waiting} on:click={() => play()}>
          {status === "preparing" ? "Writing…" : tuning ? "Adjusting…" : guideLoading ? "Loading…" : drawing ? "Drawing…" : "Play"}
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
  /* Play / Stop / Cancel export and the waiting labels all take the same
     room: the row is centred, so a wider label ("Adjusting tempo…") used to
     shift every control left mid-click, and a second press on + missed. */
  .main-btn {
    width: 8.75rem;
    justify-content: center;
    white-space: nowrap;
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
