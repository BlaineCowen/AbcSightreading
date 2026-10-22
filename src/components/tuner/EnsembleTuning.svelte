<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { tuner } from "../../lib/tuner/store";
  import { centsColor, CLOSE, IN_TUNE, OFF } from "../../lib/tuner/canvas-colors";
  import { playPiano, preloadPiano } from "../../lib/tools/tone";
  import { analyseTake, MAX_SECONDS, toMono, type Progress, type Take } from "../../lib/ensemble-tuning/analyse";
  import { compilePolyPitch } from "../../lib/ensemble-tuning/polypitch";
  import { TakeRecorder, wavBlob } from "../../lib/ensemble-tuning/recorder";
  import { TakePlayback, mixNotes } from "../../lib/ensemble-tuning/player";
  import { ensembleRecording, ensembleSession as session } from "../../lib/ensemble-tuning/state";
  import {
    assignParts, IN_TUNE_CENTS, leanWords, OFF_CENTS, partNames, summarise, tuningOf, type EnsembleKind,
  } from "../../lib/ensemble-tuning/tuning";
  import EnsembleRoll from "./EnsembleRoll.svelte";

  /**
   * Ensemble: record a choir, band or orchestra (or open a recording of one),
   * and see every note it played or sang against equal temperament at the
   * tuner's A, part by part, then play it back, a part alone, or one note.
   * OmniPitch's detector (src/lib/ensemble-tuning, notes/omnipitch.md) does
   * the listening, after the take: nothing is heard live, and nothing leaves
   * the browser.
   */

  const SETTINGS_KEY = "abc-ensemble-settings";
  let kind: EnsembleKind = "voices";
  let partCount = 4;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    if (s.kind === "voices" || s.kind === "instruments") kind = s.kind;
    if (Number.isInteger(s.parts) && s.parts >= 1 && s.parts <= 6) partCount = s.parts;
  } catch {}
  $: try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ kind, parts: partCount })); } catch {}

  type Phase = "idle" | "recording" | "analysing" | "results" | "error";
  let phase: Phase = session.recorder ? "recording" : session.analysis ? "results" : "idle";
  let error = "";
  let progress: Progress | null = null;
  let seconds = 0;
  let level = 0;
  let fileInput: HTMLInputElement;
  let roll: EnsembleRoll;
  let runId = 0;

  // Results.
  let player: TakePlayback | null = null;
  let time = 0;
  let playing = false;
  let focus = -1;
  let soloPart = false;
  let selected = -1;
  let raf = 0;

  $: analysis = phase === "results" ? session.analysis : null;
  $: notes = analysis?.notes ?? [];
  $: names = partNames(partCount, kind);
  $: parts = assignParts(notes, partCount);
  $: summary = summarise(notes, parts, names, $tuner.a4);
  $: unsureCount = notes.filter((n) => !n.sure).length;
  $: take = phase === "results" ? session.take : null;
  $: duration = take ? take.samples.length / take.sampleRate : 0;
  $: peaks = take ? peaksOf(take) : { peaks: new Float32Array(0), rate: 1 };
  $: if (focus >= partCount) focus = -1;
  $: stale = analysis !== null && session.kind !== null && session.kind !== kind;

  const PEAK_BLOCK = 512;
  function peaksOf(t: Take) {
    const out = new Float32Array(Math.ceil(t.samples.length / PEAK_BLOCK));
    for (let i = 0; i < t.samples.length; i++) {
      const b = (i / PEAK_BLOCK) | 0, v = Math.abs(t.samples[i]);
      if (v > out[b]) out[b] = v;
    }
    let top = 1e-9;
    for (const v of out) top = Math.max(top, v);
    // Decibels, -45 to 0: a recording with real dynamics looks flat on a linear scale.
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, 1 + (20 * Math.log10(out[i] / top + 1e-9)) / 45);
    return { peaks: out, rate: t.sampleRate / PEAK_BLOCK };
  }

  onMount(() => {
    // Fetch and compile the detector (11 MB, cached after the first time) while the take is set up.
    void compilePolyPitch().catch(() => {});
    if (phase === "recording") tick();
    if (phase === "results") makePlayer();
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    player?.dispose();
    player = null;
  });

  // ---- recording

  async function record() {
    error = "";
    stopPlayback();
    const rec = new TakeRecorder();
    try {
      await rec.start();
    } catch (e) {
      rec.release();
      error = e instanceof Error && e.name === "NotAllowedError"
        ? "The microphone was not allowed. Allow it in the browser's address bar, then try again."
        : "The microphone could not be opened.";
      phase = "error";
      return;
    }
    session.recorder = rec;
    rec.onFull = () => void stopRecording();
    ensembleRecording.set(true);
    phase = "recording";
    tick();
  }

  function tick() {
    cancelAnimationFrame(raf);
    const loop = () => {
      const rec = session.recorder;
      if (!rec) return;
      seconds = rec.seconds;
      level = level * 0.8 + rec.level * 0.2;
      raf = requestAnimationFrame(loop);
    };
    loop();
  }

  async function stopRecording() {
    const rec = session.recorder;
    if (!rec) return;
    session.recorder = null;
    cancelAnimationFrame(raf);
    ensembleRecording.set(false);
    const t = await rec.stop();
    if (!t || t.samples.length < t.sampleRate * 0.5) {
      error = "That take was too short to listen to.";
      phase = "error";
      return;
    }
    await listen(t, null);
  }

  function cancelRecording() {
    session.recorder?.release();
    session.recorder = null;
    cancelAnimationFrame(raf);
    ensembleRecording.set(false);
    phase = session.analysis ? "results" : "idle";
  }

  // ---- a file

  async function openFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (!file) return;
    error = "";
    stopPlayback();
    phase = "analysing";
    progress = { stage: "loading" };
    let decoded: AudioBuffer;
    const ctx = new AudioContext();
    try {
      decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      error = "That file could not be read as audio. Try a WAV, MP3, M4A or similar.";
      phase = "error";
      return;
    } finally {
      void ctx.close();
    }
    await listen(toMono(decoded), file.name, decoded.duration > MAX_SECONDS);
  }

  // ---- listening

  let cut = false;
  async function listen(t: Take, name: string | null, wasCut = false) {
    const id = ++runId;
    phase = "analysing";
    progress = { stage: "loading" };
    player?.dispose();
    player = null;
    selected = -1;
    focus = -1;
    try {
      const result = await analyseTake(t, kind, (p) => id === runId && (progress = p), () => id !== runId);
      if (id !== runId || !result) return;
      session.take = t;
      session.name = name;
      session.analysis = result;
      session.kind = kind;
      cut = wasCut;
      phase = "results";
      makePlayer();
    } catch (e) {
      if (id !== runId) return;
      console.error("[ensemble]", e);
      error = "Listening went wrong. Try again, or try a shorter take.";
      phase = "error";
    }
  }

  function listenAgain() {
    if (session.take) void listen(session.take, session.name, cut);
  }

  function cancelListening() {
    runId++;
    phase = session.analysis ? "results" : "idle";
    if (phase === "results") makePlayer();
  }

  // ---- playback

  function makePlayer() {
    player?.dispose();
    if (!session.take) return;
    player = new TakePlayback(session.take);
    player.onEnd = () => {
      playing = false;
      time = 0;
    };
    time = 0;
  }

  const partMix = (p: number) => () =>
    mixNotes(
      session.take!.samples.length,
      session.take!.sampleRate,
      notes.flatMap((_, j) => (parts[j] === p ? [session.analysis!.solos.get(j)].filter((s): s is NonNullable<typeof s> => !!s) : []))
    );
  const mixKey = () => (soloPart && focus >= 0 ? `part:${focus}:${partCount}` : "all");
  const mixFn = () => (soloPart && focus >= 0 ? partMix(focus) : undefined);

  function follow() {
    cancelAnimationFrame(raf);
    const loop = () => {
      if (!player?.playing) {
        playing = false;
        return;
      }
      time = player.time();
      raf = requestAnimationFrame(loop);
    };
    loop();
  }

  function togglePlay() {
    if (!player) return;
    if (player.playing) {
      player.pause();
      playing = false;
      time = player.time();
      return;
    }
    player.play(time >= duration - 0.05 ? 0 : time, mixKey(), mixFn());
    playing = true;
    follow();
  }

  function stopPlayback() {
    player?.pause();
    playing = false;
  }

  function seek(t: number) {
    time = t;
    player?.seek(t, mixFn());
  }

  function chooseFocus(p: number) {
    focus = focus === p ? -1 : p;
    if (focus < 0) soloPart = false;
    restartMix();
  }
  function setSolo(on: boolean) {
    soloPart = on;
    restartMix();
  }
  function restartMix() {
    if (player?.playing) {
      player.play(player.time(), mixKey(), mixFn());
      follow();
    }
  }

  // ---- the chosen note

  $: chosen = selected >= 0 && selected < notes.length ? notes[selected] : null;
  $: chosenTuning = chosen ? tuningOf(chosen, $tuner.a4) : null;
  $: if (chosenTuning) void preloadPiano([chosenTuning.midi]);
  const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

  function hearNote() {
    const s = selected >= 0 ? session.analysis?.solos.get(selected) : undefined;
    if (s && player) player.playClip(s.signal);
  }
  function hearInTune() {
    if (chosenTuning) playPiano([chosenTuning.midi], Math.min(2, Math.max(0.8, chosen!.end - chosen!.start)), $tuner.a4);
  }

  function save() {
    if (!session.take) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(wavBlob(session.take));
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ".");
    a.download = `${session.name?.replace(/\.[^.]+$/, "") ?? "Ensemble take"} ${stamp}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  function newTake() {
    stopPlayback();
    player?.dispose();
    player = null;
    session.take = null;
    session.analysis = null;
    session.name = null;
    session.kind = null;
    selected = -1;
    focus = -1;
    phase = "idle";
  }

  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  $: progressLabel = !progress
    ? ""
    : progress.stage === "loading"
      ? "Getting the listener ready (the first time takes a moment)"
      : progress.stage === "notes"
        ? "Finding every note"
        : `Measuring each note's pitch: ${progress.done} of ${progress.total}`;
  $: progressShare = progress?.stage === "measuring" ? progress.done / Math.max(1, progress.total) : progress?.stage === "notes" ? 0.05 : 0;
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-1">
    <h2 class="text-lg font-bold text-sr-ink">Ensemble tuning</h2>
    <p class="text-sm text-sr-muted">
      Record your choir, band or orchestra, or open a recording, and see every note against
      A{$tuner.a4 === 440 ? " = 440" : ` = ${$tuner.a4}`}: which parts lean flat or sharp, and where.
      Play it back, hear one part alone, or tap a note. Nothing leaves this browser.
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
    <div class="flex items-center gap-1.5" role="group" aria-label="Who is playing">
      <button class="sr-tok" class:sr-on={kind === "voices"} on:click={() => (kind = "voices")}>Choir</button>
      <button class="sr-tok" class:sr-on={kind === "instruments"} on:click={() => (kind = "instruments")}>Band or orchestra</button>
    </div>
    <label class="flex items-center gap-2">
      <span class="text-sr-muted">Parts</span>
      <select class="rounded-full border border-sr-hairline bg-sr-raise px-3 py-1.5 font-bold text-sr-ink" bind:value={partCount}>
        {#each [1, 2, 3, 4, 5, 6] as n}
          <option value={n}>{n}{n === 4 && kind === "voices" ? " (SATB)" : ""}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if phase === "idle" || phase === "error"}
    <div class="flex flex-col items-center gap-3 rounded-[22px] bg-sr-raise p-6 text-center">
      {#if phase === "error"}
        <p class="text-sm font-bold text-sr-ink" role="alert">{error}</p>
      {/if}
      <div class="flex flex-wrap justify-center gap-2">
        <button class="sr-btn flex items-center gap-2 !bg-sr-danger !text-white" on:click={record}>
          <span class="inline-block h-2.5 w-2.5 rounded-full bg-white"></span> Record
        </button>
        <button class="sr-btn-quiet" on:click={() => fileInput.click()}>Open a recording</button>
      </div>
      <p class="max-w-md text-xs text-sr-faint">
        Put the device where you would stand to listen, and record up to three minutes. Small groups
        (one or two on a part) are heard best.
      </p>
    </div>
  {:else if phase === "recording"}
    <div class="flex flex-col items-center gap-3 rounded-[22px] bg-sr-raise p-6">
      <div class="flex items-center gap-3">
        <span class="inline-block h-3 w-3 animate-pulse rounded-full bg-sr-danger"></span>
        <span class="font-mono text-2xl font-bold text-sr-ink">{clock(seconds)}</span>
        <span class="text-xs text-sr-faint">of {clock(MAX_SECONDS)}</span>
      </div>
      <div class="h-2 w-64 max-w-full overflow-hidden rounded-full bg-sr-track" aria-hidden="true">
        <div class="h-full rounded-full transition-[width] duration-75" style="width:{Math.min(100, level * 140)}%; background:{level > 0.9 ? OFF : IN_TUNE}"></div>
      </div>
      {#if level > 0.95}<p class="text-xs font-bold text-sr-danger">Too loud: move the device back a little.</p>{/if}
      <div class="flex gap-2">
        <button class="sr-btn" on:click={stopRecording}>Stop and listen</button>
        <button class="sr-btn-quiet" on:click={cancelRecording}>Cancel</button>
      </div>
    </div>
  {:else if phase === "analysing"}
    <div class="flex flex-col items-center gap-3 rounded-[22px] bg-sr-raise p-6" aria-live="polite">
      <p class="text-sm font-bold text-sr-ink">{progressLabel}</p>
      <div class="h-2 w-64 max-w-full overflow-hidden rounded-full bg-sr-track">
        <div class="h-full rounded-full bg-sr-action transition-[width]" style="width:{Math.round(progressShare * 100)}%"></div>
      </div>
      <button class="sr-btn-quiet" on:click={cancelListening}>Cancel</button>
    </div>
  {/if}

  {#if phase === "results" && analysis && take}
    {#if stale}
      <div class="flex flex-wrap items-center gap-2 rounded-2xl bg-sr-butter px-4 py-2 text-sm text-sr-butter-ink">
        This take was heard as {session.kind === "voices" ? "a choir" : "instruments"}.
        <button class="sr-btn-quiet" on:click={listenAgain}>Listen again as {kind === "voices" ? "a choir" : "instruments"}</button>
      </div>
    {/if}
    {#if !notes.length}
      <p class="rounded-2xl bg-sr-raise p-4 text-sm text-sr-ink">No notes were heard in this take. Try recording closer, or a little louder.</p>
    {:else}
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-sr-muted">
        <span>
          Everyone: <b style="color:{centsColor(summary.all.meanCents)}">{leanWords(summary.all.meanCents)}</b>
          on average, within {IN_TUNE_CENTS}¢ {pct(summary.all.inTune)} of the time
        </span>
        <span class="text-xs text-sr-faint">
          {summary.all.notes} notes{unsureCount ? `, ${unsureCount} unsure` : ""}{session.name ? ` · ${session.name}` : ""}{cut ? ` · the first ${MAX_SECONDS / 60} minutes` : ""}
        </span>
      </div>

      {#if partCount > 1}
        <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr))">
          {#each summary.parts as s}
            <button
              class="flex flex-col items-start gap-0.5 rounded-2xl border-2 px-3 py-2 text-left transition-colors {focus === s.part ? 'border-sr-action bg-sr-raise' : 'border-sr-hairline bg-sr-raise hover:border-sr-tint'}"
              aria-pressed={focus === s.part}
              on:click={() => chooseFocus(s.part)}
            >
              <span class="text-xs font-bold uppercase tracking-wide text-sr-muted">{s.name}</span>
              {#if s.notes}
                <span class="text-lg font-bold leading-tight" style="color:{centsColor(s.meanCents)}">{leanWords(s.meanCents)}</span>
                <span class="text-xs text-sr-faint">within {IN_TUNE_CENTS}¢ {pct(s.inTune)} of the time{s.offNotes ? `; ${s.offNotes} ${s.offNotes === 1 ? "note" : "notes"} off` : ""}</span>
              {:else}
                <span class="text-sm text-sr-faint">nothing heard</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      <EnsembleRoll
        bind:this={roll}
        {notes}
        {parts}
        a4={$tuner.a4}
        peaks={peaks.peaks}
        peakRate={peaks.rate}
        {duration}
        {time}
        {playing}
        {focus}
        {selected}
        height={typeof window !== "undefined" && window.innerWidth < 640 ? 300 : 400}
        on:seek={(e) => seek(e.detail)}
        on:select={(e) => (selected = e.detail)}
      />

      <div class="flex flex-wrap items-center gap-2">
        <button class="sr-btn min-w-[5.5rem]" on:click={togglePlay}>{playing ? "Pause" : "Play"}</button>
        <span class="font-mono text-sm text-sr-muted">{clock(time)} / {clock(duration)}</span>
        {#if focus >= 0}
          <div class="flex items-center gap-1" role="group" aria-label="What plays">
            <button class="sr-tok" class:sr-on={!soloPart} on:click={() => setSolo(false)}>Everyone</button>
            <button class="sr-tok" class:sr-on={soloPart} on:click={() => setSolo(true)}>{names[focus]} alone</button>
          </div>
        {/if}
        <span class="flex-1"></span>
        <button class="sr-btn-quiet !px-3" aria-label="Zoom out" on:click={() => roll.zoom(1.5)}>−</button>
        <button class="sr-btn-quiet !px-3" aria-label="Zoom in" on:click={() => roll.zoom(1 / 1.5)}>+</button>
        <button class="sr-btn-quiet" on:click={() => roll.fitAll()}>Whole take</button>
      </div>

      {#if chosen && chosenTuning}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-sr-hairline bg-sr-raise px-4 py-3 text-sm">
          <b class="text-sr-ink">{noteName(chosenTuning.midi)}</b>
          {#if partCount > 1}<span class="text-sr-muted">{names[parts[selected]]}</span>{/if}
          {#if chosen.sure}
            <b style="color:{centsColor(chosenTuning.cents)}">{leanWords(chosenTuning.cents)}</b>
          {:else}
            <span class="text-sr-muted">about {leanWords(chosenTuning.cents)}, unsure: the two ways of measuring it disagree</span>
          {/if}
          <span class="text-sr-faint">at {clock(chosen.start)}, {(chosen.end - chosen.start).toFixed(1)} s</span>
          <span class="flex-1"></span>
          <button class="sr-btn-quiet" on:click={hearNote}>Hear it alone</button>
          <button class="sr-btn-quiet" on:click={hearInTune}>Hear it in tune</button>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-sr-muted">
        <span class="flex items-center gap-1.5"><i class="inline-block h-2.5 w-4 rounded-full" style="background:{IN_TUNE}"></i>within {IN_TUNE_CENTS}¢</span>
        <span class="flex items-center gap-1.5"><i class="inline-block h-2.5 w-4 rounded-full" style="background:{CLOSE}"></i>within {OFF_CENTS}¢</span>
        <span class="flex items-center gap-1.5"><i class="inline-block h-2.5 w-4 rounded-full" style="background:{OFF}"></i>further</span>
        <span class="flex items-center gap-1.5"><i class="inline-block h-2.5 w-4 rounded-full border-[1.5px] border-dashed border-sr-muted"></i>unsure</span>
        <span class="flex-1"></span>
        <button class="sr-btn-quiet" on:click={save}>Save recording</button>
        <button class="sr-btn-quiet" on:click={newTake}>New take</button>
      </div>
      <p class="text-xs text-sr-faint">
        Parts are worked out from where the notes sit, so a part that crosses another may be mixed up
        with it. A note an octave above another part, or doubled, is the hardest to measure.
      </p>
    {/if}
  {/if}

  <input bind:this={fileInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.webm" class="hidden" on:change={openFile} />
</div>
