<script lang="ts">
  /**
   * A teacher's own piece (src/lib/pieces/): drawn and played by abcjs from
   * ABC written out of the model (write-abc.ts). Each part has its own
   * instrument, volume, mute and show or hide, saved to the piece; the music
   * plays at any tempo, whole or a run of bars.
   *
   * Hidden parts are still heard: the page draws the shown parts and plays a
   * parse of every part (the Choral page's way, through setUpAudio).
   */
  import { onDestroy, onMount, tick } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import Pause from "lucide-svelte/icons/pause";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import VolumeX from "lucide-svelte/icons/volume-x";
  import Eye from "lucide-svelte/icons/eye";
  import EyeOff from "lucide-svelte/icons/eye-off";
  import Pencil from "lucide-svelte/icons/pencil";
  import { INSTRUMENTS } from "../../lib/instruments";
  import { abcForPiece, type PieceAbc } from "../../lib/pieces/write-abc";
  import { loadPiece, updatePiece } from "../../lib/pieces/client";
  import type { PieceScore } from "../../lib/pieces/model";
  import { partSettingsFor, type PartSettings, type PieceSummary } from "../../lib/pieces/rules";
  import { HEARING_LABEL, levelFor, partsFor, type PieceAssignment } from "../../lib/pieces/assign";
  import { drawnElements } from "../../lib/pieces/write-abc";
  import { playPiano, preloadPiano } from "../../lib/tools/tone";
  import { drumPatternFor } from "../../lib/playback-click";
  import { DEFAULT_CLICK_SOUND } from "../../lib/tuner/click-sounds";
  import { countInMeasures } from "../../lib/count-in";
  import Ear from "lucide-svelte/icons/ear";
  import Mic from "lucide-svelte/icons/mic";
  import { GradeRunner, type GradeTrace } from "../../lib/grade-runner";
  import { STRICTNESS } from "../../lib/grade";
  import { drawGradeFeedback, clearGradeFeedback } from "../../lib/grade-feedback";
  import { startGradeRecording, type GradeRecording } from "../../lib/grade-recording";
  import { initTuner, startTuner, stopTuner } from "../../lib/tuner/controller";
  import { tuner } from "../../lib/tuner/store";
  import { scheduleForPiece, beatsInBar } from "../../lib/pieces/schedule";
  import { attemptsLeft, attemptsLine, bestOf, marksOf, type Mark } from "../../lib/pieces/attempts";
  import { finishAttempt, listAttempts, loadAttempt, sendTake, startAttempt, type AttemptRow } from "../../lib/pieces/client";
  import { startPractice } from "../../lib/practice-tracker";
  import AssignPieceForm from "./AssignPieceForm.svelte";
  import AudioCheck from "./AudioCheck.svelte";
  import Music from "lucide-svelte/icons/music";
  import Send from "lucide-svelte/icons/send";

  export let id: string;
  /**
   * Opened from an assignment (?assignment=): the assigned bars only, the
   * student's part marked and the parts the teacher chose playing along;
   * nothing here changes the piece.
   */
  export let assignment: {
    id: string; title: string; note: string; dueAt: number | null; minutes: number;
    role: "teacher" | "student"; settings: PieceAssignment;
  } | null = null;
  /** The owner has Educator: Assign to a class. */
  export let canAssign = false;
  /** ?attempt=<id>: an attempt shown with its marks and take (the student's own, or the teacher's class). */
  export let attemptId: string | null = null;

  /** Assignment mode: the part this student sings or plays, their own choice, kept in this browser. */
  let myPart: string | null = null;
  let choosingPart = false;
  /** A click under the music (always offered; on by itself a cappella). */
  let clickOn = false;
  const partKey = () => `abc-piece-part-${assignment?.id}`;
  let assignOpen = false;
  let assignedTo: { id: string; className: string } | null = null;

  let piece: PieceSummary | null = null;
  let score: PieceScore | null = null;
  let parts: PartSettings = {};
  let error = "";
  let status = "";

  let bpm = 100;
  let scoreBpm = 100;
  let from = 0;
  let to = 0;
  let excerpt = false;
  let isPlaying = false;
  let isPreparing = false;
  let looping = false;
  let narrow = false;

  let renaming = false;
  let titleDraft = "";

  let drawn: PieceAbc | null = null;
  let renderedTune: any = null;
  let synthControl: any = null;

  onMount(async () => {
    narrow = window.innerWidth <= 640;
    try {
      const loaded = await loadPiece(id);
      piece = loaded.piece;
      score = loaded.score;
      parts = partSettingsFor(loaded.score, loaded.parts);
      const firstTempo = score.measures.find((m) => m.tempo)?.tempo;
      scoreBpm = bpm = firstTempo ?? 100;
      to = score.measures.length - 1;
      if (assignment) {
        ({ from, to } = assignment.settings);
        excerpt = true;
        bpm = assignment.settings.tempo;
        clickOn = assignment.settings.hearing === "acappella";
        const allowed = partsFor(score, from, to);
        try {
          const kept = localStorage.getItem(partKey());
          if (kept && allowed.includes(kept)) myPart = kept;
        } catch {}
        if (!myPart && allowed.length === 1) myPart = allowed[0];
        choosingPart = !myPart;
        void refreshAttempts();
        if (assignment.role === "student") startPractice({ page: "piece", assignmentId: assignment.id, isBusy: () => isPlaying });
      }
      await tick();
      await render();
      if (attemptId) await showAttempt(attemptId);
    } catch (e) {
      error = (e as Error).message;
    }
  });

  // ── Graded attempts (pieces/attempts.ts) ────────────────────────────────
  type GradeStage = "idle" | "setup" | "running" | "sending" | "done";
  let gradeStage: GradeStage = "idle";
  let gradeError = "";
  let sendNote = "";
  let attempts: AttemptRow[] = [];
  let maxAttempts: number | null = null;
  let attemptsRole: "teacher" | "student" | null = null;
  let currentAttempt: string | null = null;
  let recording: GradeRecording | null = null;
  let grading = false;
  /** An attempt being looked at (?attempt=): its marks, who, and its take. */
  let shown: (AttemptRow & { marks: Mark[] }) | null = null;
  let marked: Element[] = [];

  const gradeRunner = new GradeRunner({
    moveTo: () => {},
    countIn: () => {},
    click: () => {},
    marked: (scores) => markNotes(scores),
    startTimeline: () => startTimeline(),
    stopTimeline: () => pause(),
    traced: (trace) => drawTrace(trace),
  });

  $: myAttempts = attemptsRole === "student" ? attempts : [];
  $: used = myAttempts.length;
  $: left = attemptsLeft(maxAttempts, used);
  $: best = bestOf(myAttempts);
  $: perf = $gradeRunner.perf;
  $: if (grading && $gradeRunner.phase === "results") void finishRun();

  async function refreshAttempts() {
    if (!assignment) return;
    try {
      const r = await listAttempts(assignment.id);
      attempts = r.attempts;
      maxAttempts = r.max;
      attemptsRole = r.role;
    } catch {
      // the list is a convenience; the attempt itself says what is wrong
    }
  }

  /** The quarter-note tempo as Grade counts it: beats of the bar's own beat. */
  function gradeBpm(): number {
    const units = scheduleBeatUnits();
    return (bpm * 8) / units;
  }
  function scheduleBeatUnits(): number {
    const t = score?.measures[from]?.time ?? { beats: 4, beatType: 4 };
    return t.beatType === 8 && t.beats % 3 === 0 && t.beats > 3 ? 12 : 32 / t.beatType;
  }

  /** The drawn element for each of my part's model notes, for Grade's marks. */
  function drawnFor(pid: string): Map<number, { absEl?: { elemset?: Element[] } }> {
    const out = new Map<number, { absEl?: { elemset?: Element[] } }>();
    if (!drawn || !renderedTune || !score) return out;
    const pi = score.parts.findIndex((p) => p.id === pid);
    const els = drawnElements(renderedTune, drawn.staves);
    for (const v of drawn.voices) {
      if (v.part !== pi) continue;
      (els.get(v.id) ?? []).forEach((el, k) => {
        const i = v.elements[k];
        if (i !== undefined && i >= 0 && !out.has(i)) out.set(i, { absEl: (el as { abselem?: { elemset?: Element[] } }).abselem });
      });
    }
    return out;
  }

  function clearMarks() {
    for (const el of marked) el.classList.remove("grade-good", "grade-ok", "grade-bad");
    marked = [];
    clearGradeFeedback(document.querySelector("#piece-paper svg"));
  }
  /** Colour each graded note by its score (cursor is the model note's index). */
  function markNotes(scores: number[], cursors?: number[]) {
    clearMarks();
    if (!myPart) return;
    const at = drawnFor(myPart);
    const list = cursors ?? gradeNotes.map((n) => n.cursor);
    scores.forEach((sc, k) => {
      const cls = sc >= 90 ? "grade-good" : sc >= 70 ? "grade-ok" : "grade-bad";
      for (const el of at.get(list[k])?.absEl?.elemset ?? []) {
        el.classList.add(cls);
        marked.push(el);
      }
    });
  }

  const LETTERS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const letterOf = (midi: number) => LETTERS[((Math.round(midi) % 12) + 12) % 12];

  function drawTrace(trace: GradeTrace) {
    const svg = document.querySelector("#piece-paper svg") as SVGSVGElement | null;
    if (!svg || !myPart || !assignment) return;
    const at = drawnFor(myPart);
    drawGradeFeedback({
      svg,
      notes: gradeNotes,
      drawn: gradeNotes.map((n) => at.get(n.cursor)),
      drawnAt: (cursor) => at.get(cursor),
      trace,
      perf: $gradeRunner.perf,
      doPc: 0,
      nameOf: letterOf,
      onsetBeats: STRICTNESS[assignment.settings.strictness].onsetBeats,
      bpm: gradeBpm(),
    });
  }

  let gradeNotes: ReturnType<typeof scheduleForPiece>["notes"] = [];

  /** Abcjs plays the excerpt (the click and count-in, what the teacher chose to hear); the downbeat after the count-in is t0. */
  function startTimeline(): number {
    if (!synthControl || !score) return performance.now();
    void synthControl.play();
    isPlaying = true;
    const time = score.measures[from].time;
    const meterName = `${time.beats}/${time.beatType}`;
    const beatMs = 60_000 / gradeBpm();
    const countInMs = countInMeasures(meterName) * beatsInBar(time) * beatMs;
    const ctx = (synthControl as any)?.midiBuffer?.audioContext ?? null;
    const latency = Math.round((((ctx as any)?.baseLatency ?? 0) + ((ctx as any)?.outputLatency ?? 0)) * 1000);
    return performance.now() + countInMs + latency;
  }

  function openSetup() {
    gradeError = "";
    sendNote = "";
    gradeStage = "setup";
  }

  /** Counted on the server first (a student's), then the microphone, then the run. Nothing awaits once the tuner starts. */
  async function startRun() {
    if (!assignment || !myPart || !score) return;
    gradeError = "";
    // The setup dialog closes at once; "Your starting note…" shows while this gets going.
    gradeStage = "running";
    clearMarks();
    shown = null;
    if (assignment.role === "student") {
      try {
        const r = await startAttempt(assignment.id, myPart);
        currentAttempt = r.attempt.id;
        maxAttempts = r.max;
        attempts = [...attempts, r.attempt];
      } catch (e) {
        gradeError = (e as Error).message;
        gradeStage = "idle";
        return;
      }
    } else currentAttempt = null;
    looping = false;
    grading = true;
    pause();
    await buildSynth();
    const schedule = scheduleForPiece(score, myPart, from, to);
    gradeNotes = schedule.notes;
    if (!gradeNotes.length) {
      grading = false;
      gradeError = "Your part has no notes in these bars.";
      gradeStage = "idle";
      return;
    }
    recording = await startGradeRecording();
    // The setup check (AudioCheck) leaves the microphone on.
    initTuner();
    if (tuner.get().engineStatus !== "running") await startTuner();
    if (tuner.get().engineStatus !== "running") {
      grading = false;
      gradeError = "The microphone did not start. Allow it in your browser, then try again.";
      await recording?.stop();
      gradeStage = "idle";
      return;
    }
    tuner.setMicHeld(true);
    const time = score.measures[from].time;
    gradeRunner.start({
      notes: gradeNotes,
      rests: schedule.rests,
      bpm: gradeBpm(),
      beatsPerBar: beatsInBar(time),
      beatUnits: schedule.beatUnits,
      countInBeats: countInMeasures(`${time.beats}/${time.beatType}`) * beatsInBar(time),
      reference: "note",
      mode: "performance",
      strictness: assignment.settings.strictness,
      cursor: "note",
      click: "beat",
      tonicTriad: [],
    });
  }

  function releaseMic() {
    tuner.setMicHeld(false);
    stopTuner();
  }

  function cancelRun() {
    gradeRunner.stop();
    pause();
    grading = false;
    releaseMic();
    void recording?.stop();
    recording = null;
    gradeStage = "idle";
    void buildSynth();
  }

  async function finishRun() {
    grading = false;
    pause();
    releaseMic();
    const audio = (await recording?.stop()) ?? null;
    recording = null;
    const result = $gradeRunner.perf;
    void buildSynth();
    if (!assignment || !result) {
      gradeStage = "done";
      return;
    }
    if (assignment.role !== "student" || !currentAttempt) {
      gradeStage = "done";
      sendNote = "A try only: nothing is kept.";
      return;
    }
    gradeStage = "sending";
    try {
      await finishAttempt(assignment.id, currentAttempt, marksOf(result));
      sendNote = "Your score is with your teacher.";
      if (audio) {
        await sendTake(assignment.id, currentAttempt, audio);
        sendNote = "Your score and recording are with your teacher.";
      }
    } catch (e) {
      sendNote = (e as Error).message;
    }
    gradeStage = "done";
    await refreshAttempts();
  }

  /** An attempt from the list (or ?attempt=): its marks on the music, and its take. */
  async function showAttempt(id: string) {
    try {
      const a = await loadAttempt(id);
      if (assignment && a.assignmentId !== assignment.id) return;
      if (myPart !== a.partId) {
        myPart = a.partId;
        choosingPart = false;
        await render();
      }
      shown = a;
      gradeStage = "idle";
      await tick();
      markNotes(
        a.marks.map((m) => m[1]),
        a.marks.map((m) => m[0]),
      );
    } catch (e) {
      gradeError = (e as Error).message;
    }
  }

  onDestroy(() => {
    gradeRunner.stop();
    if (grading) releaseMic();
    try { synthControl?.destroy?.(); } catch {}
  });

  $: partOrder = score ? score.parts.map((p, i) => ({ p, i, s: parts[p.id] })).filter((x) => x.s) : [];
  $: shownParts = partOrder.filter((x) => !hiddenPart(x.p.id)).map((x) => x.i);
  $: mine = assignment && myPart ? partOrder.find((x) => x.p.id === myPart) : null;
  $: choosable = assignment && score ? partOrder.filter((x) => partsFor(score!, from, to).includes(x.p.id)) : [];

  /** What shows: the piece's settings, and in an assignment always the student's own part. */
  function hiddenPart(pid: string): boolean {
    if (assignment && pid === myPart) return false;
    return !!parts[pid]?.hidden;
  }
  /** How loud a part plays, 0 to 1: in an assignment the teacher's choice of what students hear decides. */
  function levelOf(pid: string): number {
    if (!assignment) return parts[pid]?.muted ? 0 : 1;
    return levelFor(assignment.settings, pid, myPart);
  }

  async function choosePart(pid: string) {
    myPart = pid;
    choosingPart = false;
    try { localStorage.setItem(partKey(), pid); } catch {}
    void preloadPiano(firstNotes(pid));
    await render();
  }

  /** The student's part in the assigned bars, as sounding MIDI. */
  function firstNotes(pid: string): number[] {
    const part = score?.parts.find((p) => p.id === pid);
    return (part?.notes ?? []).filter((n) => !n.rest && n.measure >= from && n.measure <= to).map((n) => n.midi!);
  }
  function startingNote() {
    if (!myPart) return;
    const [first] = firstNotes(myPart);
    if (first !== undefined) playPiano([first], 1.4);
  }

  /** Tap a note to hear it (a chord, all of it): the drawn element's model notes. */
  let noteAt = new Map<unknown, number[]>();
  function mapNotes() {
    noteAt = new Map();
    if (!drawn || !renderedTune || !score) return;
    const els = drawnElements(renderedTune, drawn.staves);
    for (const v of drawn.voices) {
      const notes = score.parts[v.part].notes;
      (els.get(v.id) ?? []).forEach((el, k) => {
        const i = v.elements[k];
        if (i === undefined || i < 0 || notes[i].rest) return;
        const head = notes[i];
        const chord = notes.filter((n) => !n.rest && n.start === head.start && n.staff === head.staff && n.voice === head.voice).map((n) => n.midi!);
        noteAt.set(el, chord);
      });
    }
  }
  function onNoteClick(abcElem: unknown) {
    const midis = noteAt.get(abcElem);
    if (midis?.length) playPiano(midis, 1);
  }
  $: barChoices = score ? score.measures.map((m, i) => ({ i, label: m.label })) : [];

  function abcOptions(partIdx: number[]) {
    const programs = Object.fromEntries(partOrder.map((x) => [x.i, x.s.program]));
    const names = Object.fromEntries(
      partOrder.map((x) => [x.i, assignment && myPart === x.p.id ? `${x.s.name} (you)` : x.s.name]),
    );
    const range = excerpt ? { from, to } : {};
    const perLine = narrow ? 2 : score && score.parts.length > 6 ? 3 : 4;
    return { parts: partIdx, programs, names, barsPerLine: perLine, tempo: scoreBpm, ...range };
  }

  async function render() {
    if (!score) return;
    pause();
    const abcjs = (await import("abcjs")).default;
    const shown = shownParts.length ? shownParts : [0];
    drawn = abcForPiece(score, abcOptions(shown));
    const box = document.getElementById("piece-box");
    const staffwidth = Math.max(300, Math.floor((box?.clientWidth ?? 760) / (narrow ? 1 : 1.25)) - 30);
    document.getElementById("piece-paper")?.removeAttribute("style");
    const [tune] = abcjs.renderAbc("piece-paper", drawn.abc, {
      add_classes: true,
      clickListener: (abcElem: unknown) => onNoteClick(abcElem),
      responsive: "resize",
      staffwidth,
      scale: score.parts.length > 6 ? 0.8 : 1,
    });
    renderedTune = tune;
    mapNotes();
    await buildSynth();
  }

  async function buildSynth() {
    if (!renderedTune || !score) return;
    const abcjs = (await import("abcjs")).default;
    try { synthControl?.destroy?.(); } catch {}
    // Every part plays, shown or not: the audio is a parse of all of them.
    const all = abcForPiece(score, abcOptions(score.parts.map((_, i) => i)));
    const [full] = abcjs.parseOnly(all.abc) as any[];
    renderedTune.setUpAudio = (params: any) => full.setUpAudio(params);
    const levels = all.voices.map((v) => {
      const pid = score!.parts[v.part].id;
      const s = parts[pid];
      return s ? levelOf(pid) * (s.volume / 80) : 0;
    });
    const meter = score.measures[from]?.time ?? { beats: 4, beatType: 4 };
    const meterName = `${meter.beats}/${meter.beatType}`;
    const drum = clickOn || grading
      ? drumPatternFor({ beats: meter.beatType === 8 && meter.beats % 3 === 0 ? meter.beats / 3 : meter.beats, subdivision: 1, accent: true, sound: DEFAULT_CLICK_SOUND })
      : "";
    synthControl = new abcjs.synth.SynthController();
    let lit: Element[] = [];
    const cursorControl = {
      onEvent: (event: any) => {
        for (const e of lit) e.classList.remove("piece-now");
        lit = (event?.elements ?? []).flat();
        for (const e of lit) e.classList.add("piece-now");
        const first = lit[0] as HTMLElement | undefined;
        first?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      },
      onFinished: () => {
        for (const e of lit) e.classList.remove("piece-now");
        lit = [];
        isPlaying = false;
        if (looping && !grading) void play();
      },
    };
    await synthControl.setTune(renderedTune, false, {
      soundFontUrl: "/api/soundfont/",
      soundFontVolumeMultiplier: 3.0,
      ...(drum ? { drum, drumBars: 1, drumIntro: countInMeasures(meterName) } : {}),
      // One track a voice, in the order the ABC lists them.
      sequenceCallback: (tracks: any[]) => {
        tracks.forEach((track, t) => {
          // The click's own track (after the voices) keeps its level.
          if (t >= levels.length) return;
          const level = levels[t];
          for (const note of track) note.volume = Math.max(0, Math.min(127, Math.round(note.volume * level)));
        });
        return tracks;
      },
    });
    await synthControl.load("#piece-audio", cursorControl, { displayWarp: true });
    setWarp();
  }

  function setWarp() {
    try { synthControl?.setWarp(Math.round((bpm / scoreBpm) * 100)); } catch {}
  }

  async function play() {
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

  /** abcjs's play() toggles isStarted and pause() never resets it (see AbcjsChoral pausePlayback). */
  function pause() {
    if (!synthControl) return;
    synthControl.pause();
    synthControl.isStarted = false;
    isPlaying = false;
  }

  function rewind() {
    pause();
    try { synthControl?.seek(0); } catch {}
    document.querySelectorAll("#piece-paper .piece-now").forEach((e) => e.classList.remove("piece-now"));
  }

  // ── Parts ───────────────────────────────────────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function saveParts() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await updatePiece(id, { parts });
        status = "";
      } catch (e) {
        status = (e as Error).message;
      }
    }, 600);
  }

  async function changePart(partId: string, patch: Partial<PartSettings[string]>, redraw: boolean) {
    parts = { ...parts, [partId]: { ...parts[partId], ...patch } };
    saveParts();
    if (redraw) await render();
    else {
      pause();
      await buildSynth();
    }
  }

  function solo(partId: string) {
    const only = Object.entries(parts).every(([pid, s]) => (pid === partId ? !s.muted : s.muted));
    parts = Object.fromEntries(Object.entries(parts).map(([pid, s]) => [pid, { ...s, muted: only ? false : pid !== partId }]));
    saveParts();
    pause();
    void buildSynth();
  }

  // ── Bars ────────────────────────────────────────────────────────────────
  async function setRange(f: number, t: number) {
    from = Math.min(f, t);
    to = Math.max(f, t);
    excerpt = !!score && !(from === 0 && to === score.measures.length - 1);
    await render();
  }

  async function wholePiece() {
    if (!score) return;
    excerpt = false;
    from = 0;
    to = score.measures.length - 1;
    await render();
  }

  /** Shown at once; put back if the server refuses it. (Enter and the blur that follows both land here.) */
  async function toggleClick() {
    clickOn = !clickOn;
    pause();
    await buildSynth();
  }

  async function saveTitle() {
    if (!piece || !renaming) return;
    renaming = false;
    const before = piece.title;
    const title = titleDraft.trim();
    if (!title || title === before) return;
    piece = { ...piece, title };
    document.title = `${title} | My music`;
    try {
      await updatePiece(id, { title });
      status = "";
    } catch (e) {
      piece = { ...piece, title: before };
      document.title = `${before} | My music`;
      status = (e as Error).message;
    }
  }
</script>

<div class="w-full max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4 pb-32">
  {#if error}
    <div class="sr-panel p-6 flex flex-col gap-3">
      <p class="text-sr-ink">{error}</p>
      <a class="sr-btn self-start" href="/pieces">Back to My music</a>
    </div>
  {:else if !piece || !score}
    <p class="text-sr-muted">Loading the music…</p>
  {:else}
    {#if assignment}
      <header class="assign-card flex flex-col gap-2">
        <a class="sr-link text-sm self-start" href={assignment.role === "teacher" ? "/account" : "/"}>{assignment.role === "teacher" ? "Classes" : "Home"}</a>
        <span class="kind"><Music size={12} aria-hidden="true" /> Assignment · a piece</span>
        <h1 class="text-2xl sm:text-3xl font-bold">{piece.title}</h1>
        <p class="font-bold">
          Bars {score.measures[from].label} to {score.measures[to].label}{mine ? `, your part: ${mine.s.name}` : ""}. You hear: {HEARING_LABEL[assignment.settings.hearing].title.toLowerCase()}.
        </p>
        {#if assignment.note}<p class="text-sm">{assignment.note}</p>{/if}
        <p class="text-sm">
          {[
            assignment.dueAt ? `Due ${new Date(assignment.dueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : null,
            assignment.minutes ? `${assignment.minutes} minutes of practice` : null,
            assignment.settings.maxAttempts ? `${assignment.settings.maxAttempts} graded attempt${assignment.settings.maxAttempts === 1 ? "" : "s"}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
        {#if assignment.role === "teacher"}<p class="text-xs">You are seeing what your students see.</p>{/if}
      </header>
    {:else}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <a class="sr-link text-sm" href="/pieces">My music</a>
        {#if renaming}
          <form class="flex gap-2 mt-1" on:submit|preventDefault={saveTitle}>
            <label class="sr-only" for="piece-title">Title</label>
            <!-- svelte-ignore a11y-autofocus -->
            <input id="piece-title" class="title-input" bind:value={titleDraft} maxlength="120" autofocus on:blur={saveTitle} />
          </form>
        {:else}
          <h1 class="text-2xl sm:text-3xl font-bold text-sr-ink flex items-center gap-2">
            <span class="truncate">{piece.title}</span>
            <button type="button" class="icon-btn" aria-label="Rename" on:click={() => ((titleDraft = piece?.title ?? ""), (renaming = true))}>
              <Pencil size={16} aria-hidden="true" />
            </button>
          </h1>
        {/if}
        <p class="text-sm text-sr-muted">{piece.composer ? `${piece.composer} · ` : ""}{score.parts.length} part{score.parts.length === 1 ? "" : "s"} · {score.measures.length} bars</p>
      </div>
      {#if canAssign}
        <button type="button" class="sr-btn inline-flex items-center gap-2" aria-expanded={assignOpen} on:click={() => ((assignOpen = !assignOpen), (assignedTo = null))}>
          <Send size={16} aria-hidden="true" /> Assign to a class
        </button>
      {/if}
    </header>

    {#if assignedTo}
      <p class="rounded-2xl bg-sr-mint text-sr-mint-ink p-4 font-bold" role="status">
        Assigned to {assignedTo.className || "the class"}. <a class="underline" href="/pieces/{id}?assignment={assignedTo.id}">See it as students will</a>
      </p>
    {/if}

    {#if assignOpen}
      <section class="sr-panel p-4 flex flex-col gap-3" aria-label="Assign to a class">
        <h2 class="font-bold text-sr-ink">Assign bars of one part</h2>
        <AssignPieceForm
          pieceId={id}
          initial={{ from, to: excerpt ? to : Math.min(to, from + 7), tempo: bpm }}
          onDone={(r) => ((assignOpen = false), (assignedTo = { id: r.id, className: r.className }))}
          onCancel={() => (assignOpen = false)}
        />
      </section>
    {/if}

    {#if piece.warnings.length}
      <p class="text-sm text-sr-muted">{piece.warnings.join(". ")}.</p>
    {/if}
    {/if}

    {#if assignment && choosingPart}
      <section class="sr-panel p-4 flex flex-col gap-3" aria-labelledby="choose-h">
        <h2 id="choose-h" class="font-bold text-sr-ink">Which part do you sing or play?</h2>
        <div class="flex flex-wrap gap-2">
          {#each choosable as { p, s } (p.id)}
            <button type="button" class="sr-tok" class:sr-on={myPart === p.id} on:click={() => choosePart(p.id)}>{s.name}</button>
          {/each}
        </div>
        {#if myPart}<button type="button" class="text-sm text-sr-muted underline self-start" on:click={() => (choosingPart = false)}>Keep {mine?.s.name}</button>{/if}
      </section>
    {/if}

    {#if assignment}
      <section class="sr-panel p-4 flex flex-wrap items-end gap-4" aria-label="Practice">
        {#if myPart}
          <button type="button" class="sr-btn inline-flex items-center gap-2" on:click={startingNote}><Ear size={16} aria-hidden="true" /> Starting note</button>
          <button type="button" class="sr-tok" on:click={() => (choosingPart = true)}>Part: {mine?.s.name}</button>
        {/if}
        <button type="button" class="sr-tok" class:sr-on={clickOn} aria-pressed={clickOn} on:click={toggleClick}>Click</button>
        <label class="field">
          <span>Tempo</span>
          <span class="flex items-center gap-2">
            <input type="range" min="30" max="220" step="1" bind:value={bpm} on:change={setWarp} aria-label="Tempo" />
            <span class="tabular-nums font-bold text-sr-ink w-16">{bpm} bpm</span>
          </span>
        </label>
        <label class="flex items-center gap-2 text-sm text-sr-ink">
          <input type="checkbox" bind:checked={looping} /> Loop
        </label>
        <p class="w-full text-xs text-sr-muted">Tap any note in the music to hear it.</p>
      </section>

      <!-- Graded attempts: counted on the server when they start; the take goes to the teacher. -->
      <section class="sr-panel p-4 flex flex-col gap-3" aria-labelledby="graded-h">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="graded-h" class="font-bold text-sr-ink">Graded attempts</h2>
            {#if assignment.role === "student"}
              <p class="text-sm text-sr-muted">{attemptsLine(maxAttempts, used)}{best ? ` · best ${best.overall}` : ""}</p>
            {:else}
              <p class="text-sm text-sr-muted">Try the grading yourself; nothing is kept. Your students' attempts are listed below.</p>
            {/if}
          </div>
          {#if gradeStage === "idle" || gradeStage === "done"}
            <button
              type="button"
              class="sr-btn inline-flex items-center gap-2"
              disabled={!myPart || (assignment.role === "student" && left === 0)}
              on:click={openSetup}
            >
              <Mic size={16} aria-hidden="true" />
              {assignment.role === "student" ? (left === 0 ? "No attempts left" : gradeStage === "done" ? "Another attempt" : "Graded attempt") : "Try the grading"}
            </button>
          {/if}
        </div>

        {#if gradeStage === "running"}
          <div class="flex flex-wrap items-center gap-3" role="status">
            <span class="live-dot" aria-hidden="true"></span>
            <span class="font-bold text-sr-ink">
              {$gradeRunner.phase === "reference" ? "Your starting note…" : $gradeRunner.phase === "countIn" ? "Count-in…" : "Listening"}
            </span>
            <button type="button" class="sr-btn-quiet text-sm" on:click={cancelRun}>Stop</button>
          </div>
        {:else if (gradeStage === "sending" || gradeStage === "done") && perf}
          <div class="result flex flex-wrap items-center gap-5">
            <div class="big">{Math.round(perf.overall)}</div>
            <div class="flex flex-col text-sm">
              <span>Pitch <b>{Math.round(perf.pitch)}</b></span>
              <span>Rhythm <b>{Math.round(perf.rhythm)}</b></span>
            </div>
            <p class="text-sm" role="status">{gradeStage === "sending" ? "Sending…" : sendNote}</p>
          </div>
          <p class="text-xs text-sr-muted">Green notes were right, amber close, red missed. The line shows what you sang.</p>
        {/if}
        {#if gradeError}<p class="text-sm text-sr-danger" role="alert">{gradeError}</p>{/if}

        {#if shown}
          <div class="shown flex flex-col gap-2">
            <p class="font-bold text-sr-ink">
              {shown.studentName ? `${shown.studentName}: ` : ""}{shown.partName}, {shown.overall ?? "not finished"}{shown.overall !== null ? ` (pitch ${shown.pitch}, rhythm ${shown.rhythm})` : ""}
            </p>
            <p class="text-xs text-sr-muted">{new Date(shown.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
            {#if shown.hasTake}
              <!-- svelte-ignore a11y-media-has-caption -->
              <audio controls preload="none" src="/api/attempts/{shown.id}/take"></audio>
            {:else}
              <p class="text-sm text-sr-muted">No recording kept for this one.</p>
            {/if}
          </div>
        {/if}

        {#if attempts.length}
          <ul class="attempts">
            {#each attempts as a, k (a.id)}
              <li>
                <button type="button" class="att" class:on={shown?.id === a.id} on:click={() => showAttempt(a.id)}>
                  <span class="truncate">{a.studentName && attemptsRole === "teacher" ? `${a.studentName} · ` : `Attempt ${k + 1} · `}{a.partName}</span>
                  <span class="tabular-nums font-bold">{a.overall ?? "-"}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
    <section class="sr-panel p-4 flex flex-col gap-2" aria-labelledby="parts-h">
      <h2 id="parts-h" class="font-bold text-sr-ink">Parts</h2>
      <ul class="flex flex-col divide-y divide-sr-hairline">
        {#each partOrder as { p, s } (p.id)}
          <li class="part-row">
            <span class="part-name" title={p.name}>{s.name}</span>
            <label class="sr-only" for="inst-{p.id}">Instrument for {s.name}</label>
            <select id="inst-{p.id}" class="part-select" value={s.program} on:change={(e) => changePart(p.id, { program: Number(e.currentTarget.value) }, true)}>
              {#each INSTRUMENTS as inst}<option value={inst.program}>{inst.label}</option>{/each}
            </select>
            <label class="vol">
              <span class="sr-only">Volume for {s.name}</span>
              <input type="range" min="0" max="100" step="5" value={s.volume} on:change={(e) => changePart(p.id, { volume: Number(e.currentTarget.value) }, false)} />
            </label>
            <span class="part-btns">
              <button type="button" class="icon-btn" class:off={s.muted} aria-pressed={s.muted} aria-label="{s.muted ? 'Unmute' : 'Mute'} {s.name}" on:click={() => changePart(p.id, { muted: !s.muted }, false)}>
                {#if s.muted}<VolumeX size={18} aria-hidden="true" />{:else}<Volume2 size={18} aria-hidden="true" />{/if}
              </button>
              <button type="button" class="sr-tok text-xs" on:click={() => solo(p.id)}>Solo</button>
              <button type="button" class="icon-btn" class:off={s.hidden} aria-pressed={s.hidden} aria-label="{s.hidden ? 'Show' : 'Hide'} {s.name}" on:click={() => changePart(p.id, { hidden: !s.hidden }, true)}>
                {#if s.hidden}<EyeOff size={18} aria-hidden="true" />{:else}<Eye size={18} aria-hidden="true" />{/if}
              </button>
            </span>
          </li>
        {/each}
      </ul>
      {#if status}<p class="text-sm text-sr-brass" role="status">{status}</p>{/if}
    </section>

    <section class="sr-panel p-4 flex flex-wrap items-end gap-4" aria-label="Bars and tempo">
      <label class="field">
        <span>From bar</span>
        <select value={from} on:change={(e) => setRange(Number(e.currentTarget.value), Math.max(Number(e.currentTarget.value), to))}>
          {#each barChoices as b}<option value={b.i}>{b.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>To bar</span>
        <select value={to} on:change={(e) => setRange(from, Number(e.currentTarget.value))}>
          {#each barChoices as b}<option value={b.i} disabled={b.i < from}>{b.label}</option>{/each}
        </select>
      </label>
      {#if excerpt}
        <button type="button" class="sr-btn-quiet text-sm" on:click={wholePiece}>Whole piece</button>
      {/if}
      <label class="field">
        <span>Tempo</span>
        <span class="flex items-center gap-2">
          <input type="range" min="30" max="220" step="1" bind:value={bpm} on:change={setWarp} aria-label="Tempo" />
          <span class="tabular-nums font-bold text-sr-ink w-16">{bpm} bpm</span>
        </span>
      </label>
      <label class="flex items-center gap-2 text-sm text-sr-ink">
        <input type="checkbox" bind:checked={looping} /> Loop
      </label>
    </section>
    {/if}

    {#if gradeStage === "setup" && assignment}
      <AudioCheck
        student={assignment.role === "student"}
        maxAttempts={maxAttempts}
        summary={`${mine?.s.name ?? "Your part"}, bars ${score.measures[from].label} to ${score.measures[to].label}, at ${bpm} bpm.`}
        onStart={() => void startRun()}
        onClose={() => (gradeStage = "idle")}
      />
    {/if}

    <div id="piece-box" class="score-paper">
      <div id="piece-paper"></div>
    </div>
    <div id="piece-audio" class="hidden"></div>

    <div class="transport no-print" role="group" aria-label="Playback">
      <button type="button" class="t-btn" aria-label="Back to the start" on:click={rewind}><SkipBack size={20} aria-hidden="true" /></button>
      {#if isPlaying}
        <button type="button" class="t-btn t-main" aria-label="Pause" on:click={pause}><Pause size={24} aria-hidden="true" /></button>
      {:else}
        <button type="button" class="t-btn t-main" aria-label="Play" disabled={isPreparing} on:click={play}><Play size={24} aria-hidden="true" /></button>
      {/if}
      <span class="t-label">{excerpt ? `Bars ${score.measures[from].label} to ${score.measures[to].label}` : "Whole piece"} · {bpm} bpm</span>
    </div>
  {/if}
</div>

<style>
  :global(#piece-paper .grade-good), :global(#piece-paper .grade-good path) { fill: #1f9d6b; color: #1f9d6b; }
  :global(#piece-paper .grade-ok), :global(#piece-paper .grade-ok path) { fill: #c98a00; color: #c98a00; }
  :global(#piece-paper .grade-bad), :global(#piece-paper .grade-bad path) { fill: #d13f2f; color: #d13f2f; }
  .setup, .shown {
    background: var(--sr-tint);
    border-radius: 16px;
    padding: 0.9rem 1rem;
  }
  .live-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 999px;
    background: #d13f2f;
    animation: live 1s ease-in-out infinite alternate;
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot { animation: none; }
  }
  @keyframes live {
    to { opacity: 0.3; }
  }
  .result .big {
    font-family: Fredoka, sans-serif;
    font-size: 2.6rem;
    font-weight: 700;
    color: var(--sr-ink);
    line-height: 1;
  }
  .result {
    color: var(--sr-ink-2);
  }
  .attempts {
    display: grid;
    gap: 0.35rem;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  }
  .att {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 2.75rem;
    padding: 0 0.9rem;
    border-radius: 14px;
    border: 1px solid var(--sr-hairline);
    color: var(--sr-ink);
    align-items: center;
  }
  .att.on {
    border-color: var(--sr-action);
    background: var(--sr-tint);
  }
  .assign-card {
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
    border-radius: 28px;
    padding: 1.25rem 1.5rem;
  }
  .assign-card .kind {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    align-self: flex-start;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .score-paper {
    background: #fff;
    border-radius: 28px;
    padding: 1rem;
    box-shadow: var(--sr-card-shadow);
    overflow-x: auto;
  }
  :global(#piece-paper .piece-now) {
    fill: var(--sr-action);
  }
  .part-row {
    display: grid;
    grid-template-columns: minmax(6rem, 1fr) minmax(8rem, 12rem) minmax(5rem, 9rem) auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0;
  }
  @media (max-width: 640px) {
    .part-row {
      grid-template-columns: 1fr auto;
    }
    .part-row .part-select,
    .part-row .vol {
      grid-column: span 1;
    }
  }
  .part-name {
    font-weight: 700;
    color: var(--sr-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .part-select,
  .field select,
  .title-input {
    min-height: 2.5rem;
    border-radius: 12px;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-panel);
    color: var(--sr-ink);
    padding: 0 0.6rem;
  }
  .title-input {
    font-size: 1.4rem;
    font-weight: 700;
    width: min(32rem, 80vw);
  }
  .vol input {
    width: 100%;
  }
  .part-btns {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    color: var(--sr-ink-2);
  }
  .icon-btn:hover {
    background: var(--sr-hairline);
  }
  .icon-btn.off {
    color: var(--sr-muted);
    opacity: 0.6;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--sr-muted);
  }
  .transport {
    position: fixed;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem 0.5rem 0.5rem;
    border-radius: 999px;
    background: rgb(var(--sr-bar-rgb));
    color: #fff;
    box-shadow: var(--sr-card-shadow);
    max-width: calc(100vw - 2rem);
  }
  .t-btn {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    color: #fff;
  }
  .t-btn:hover {
    background: rgb(255 255 255 / 0.12);
  }
  .t-main {
    width: 3.25rem;
    height: 3.25rem;
    background: var(--sr-action);
  }
  .t-label {
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
