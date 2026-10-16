<script lang="ts">
  /**
   * A teacher's own piece (src/lib/pieces/): drawn by abcjs from ABC written
   * out of the model (write-abc.ts), and played through SectionPlayer (the
   * chosen bars rendered to sound, started on the audio clock, with the
   * count-in and click scheduled on the same clock, and the cursor following
   * it). Hidden parts are still heard.
   *
   * The director's view (the owner's, also when they open one of their
   * assignments, with a Student view switch to see what students get): each
   * part's instrument, volume, mute, solo and show or hide, saved to the
   * piece; starting pitches, count-in, click, tempo, the key it is played and
   * shown in (saved), a loop, bars chosen by tapping the music, practice mixes
   * (one part loud, offered to class libraries when the teacher says so), and
   * full screen for a projector. The bars in play are marked by fading the
   * rest, never by boxes over the music (Blaine).
   *
   * Laid out as the practice pages are (Blaine, 14 October 2026): a row of
   * settings pills, a toolbar over the score (Starting pitches, Listen and
   * grade) and the shared playback bar. A note tapped is where playback
   * starts (and jumps to, if it is playing), Pause holds the place, and the
   * tempo changes without losing it. Listen and grade is Grade's own panel on
   * one part of the whole piece, Note by note or Pitch & rhythm, with the
   * other parts, every part (theirs quietly) or a cappella; practice only,
   * nothing is kept. Repeats are followed (timeline.ts) by the cursor, a
   * start from a note and the grading alike.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import X from "lucide-svelte/icons/x";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import VolumeX from "lucide-svelte/icons/volume-x";
  import Eye from "lucide-svelte/icons/eye";
  import EyeOff from "lucide-svelte/icons/eye-off";
  import Pencil from "lucide-svelte/icons/pencil";
  import Minus from "lucide-svelte/icons/minus";
  import Plus from "lucide-svelte/icons/plus";
  import { INSTRUMENTS } from "../../lib/instruments";
  import { abcForPiece, type PieceAbc } from "../../lib/pieces/write-abc";
  import { loadPiece, updatePiece } from "../../lib/pieces/client";
  import type { PieceScore } from "../../lib/pieces/model";
  import { DEFAULT_PIECE_SETTINGS, MAX_TRANSPOSE, mixLevel, partSettingsFor, type PartSettings, type PieceSettings, type PieceSummary } from "../../lib/pieces/rules";
  import { keyName } from "../../lib/pieces/read-musicxml";
  import { transposeScore } from "../../lib/pieces/transpose";
  import { createFullscreen } from "../../lib/fullscreen";
  import { HEARING_LABEL, levelFor, partsFor, type Hearing, type PieceAssignment } from "../../lib/pieces/assign";
  import { drawnElements } from "../../lib/pieces/write-abc";
  import { playPiano, preloadPiano } from "../../lib/tools/tone";
  import { countInMeasures } from "../../lib/count-in";
  import Ear from "lucide-svelte/icons/ear";
  import Mic from "lucide-svelte/icons/mic";
  import { GradeRunner, type GradeTrace } from "../../lib/grade-runner";
  import { STRICTNESS, type GradeNote } from "../../lib/grade";
  import { drawGradeFeedback, clearGradeFeedback, headOf, revealTo } from "../../lib/grade-feedback";
  import { PitchGuide } from "../../lib/pitch-guide";
  import { playedBars, Timeline } from "../../lib/pieces/timeline";
  import PlaybackBar from "../PlaybackBar.svelte";
  import GradePanel from "../GradePanel.svelte";
  import { startGradeRecording, type GradeRecording } from "../../lib/grade-recording";
  import { TakePlayer, noteAt as spanAt } from "../../lib/grade-playback";
  import { initTuner, startTuner, stopTuner } from "../../lib/tuner/controller";
  import { tuner } from "../../lib/tuner/store";
  import { scheduleForPiece, beatsInBar, beatUnitsOf } from "../../lib/pieces/schedule";
  import { barBoxes, barFromEvent, barHits, clearBarHits, cursorLine, fadeOutside, noteElements, soundingAt, type NoteEl } from "../../lib/pieces/score-dom";
  import { SectionPlayer } from "../../lib/pieces/section-player";
  import { TICKS } from "../../lib/pieces/model";
  import { attemptsLeft, attemptsLine, bestOf, marksOf, type Mark } from "../../lib/pieces/attempts";
  import { addToLibrary, finishAttempt, listAttempts, loadAttempt, myClasses, sendTake, startAttempt, type AttemptRow } from "../../lib/pieces/client";
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
  /**
   * A song from a class's library (a student, not the owner): the whole
   * piece, any part, ungraded. Part settings change here only, never the
   * teacher's copy.
   */
  export let library = false;
  /** The owner has Educator: Assign to a class. */
  export let canAssign = false;
  /** ?attempt=<id>: an attempt shown with its marks and take (the student's own, or the teacher's class). */
  export let attemptId: string | null = null;

  /** Assignment mode: where playback starts (bars that lead in, heard and not graded). */
  let leadIn = 0;
  /** The drawn notes, each with its model note (score-dom.ts). */
  let items: NoteEl[] = [];
  const player = new SectionPlayer();
  let cursorFrame = 0;
  let lit: Element[] = [];
  let shadedOnce = false;

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

  /** A teacher looking at their own assignment: the director's view, or what students see. */
  let preview = false;
  $: studentView = !!assignment && (assignment.role === "student" || preview);
  /** The assignment as it plays in the student's view; null in the director's. */
  $: asg = studentView ? assignment : null;
  /** The piece's own settings (rules.ts): the key it is played in, practice mixes offered. */
  let settings: PieceSettings = { ...DEFAULT_PIECE_SETTINGS };
  /** Semitones from the written key; an assignment is always as written (it is graded so). */
  let transpose = 0;
  $: tr = asg ? 0 : transpose;
  /** The music as it is drawn and played: the score, moved into the chosen key (transpose.ts). */
  let moved: { semis: number; score: PieceScore } | null = null;
  function music(): PieceScore {
    if (!tr) return score!;
    if (moved?.semis !== tr) moved = { semis: tr, score: transposeScore(score!, tr) };
    return moved.score;
  }
  /** The key it is heard in (rules.ts `sound`): null sounds as drawn. */
  let soundKey: number | null = null;
  $: sr = asg ? 0 : soundKey ?? transpose;
  let heardScore: { semis: number; score: PieceScore } | null = null;
  /** The music as it sounds: playback, starting pitches, tapped notes, and what Grade listens for. */
  function heard(): PieceScore {
    if (sr === tr) return music();
    if (heardScore?.semis !== sr) heardScore = { semis: sr, score: transposeScore(score!, sr) };
    return heardScore.score;
  }
  /** The director's count-in before the music (an assignment always counts in). */
  let countInOn = true;
  /** A practice mix: this part loud and the rest soft; null for the teacher's own mix. */
  let loud: string | null = null;
  /** Choosing bars by tapping the music: the first bar tapped, waiting for the last. */
  let choosing = false;
  let anchor: number | null = null;
  /** The director's bars, kept while the Student view shows the assignment's. */
  let directorRange = { from: 0, to: 0 };
  let classes: { id: string; name: string }[] | null = null;
  let fs: ReturnType<typeof createFullscreen> | null = null;
  let fsOn = false;
  $: owner = !library && (!assignment || assignment.role === "teacher");

  /** A tapped note: where Play starts, until another is tapped or Back to start. */
  let startAt: { tick: number; bar: number } | null = null;
  let startEls: Element[] = [];
  /** Paused here (ms into the sound): Play carries on from it. */
  let pausedMs: number | null = null;
  /** The bars as heard at the tempo the sound was made at (repeats followed). */
  let timeline: Timeline | null = null;

  // ── The settings row (as the practice pages'): a pill each, opening its own popover ──
  type SettingPop = "key" | "parts" | "bars" | "share";
  let settingPop: SettingPop | null = null;
  let popLeft = 0;
  let setbarEl: HTMLElement;
  let popOpener: HTMLElement | null = null;
  const POP_WIDTH = 420;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const asSheet = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const popIn = (node: Element) => fly(node, { y: asSheet() ? 40 : -8, duration: reduceMotion ? 0 : 160, easing: cubicOut });
  const popOut = (node: Element) => fly(node, { y: asSheet() ? 40 : -8, duration: reduceMotion ? 0 : 120 });
  $: if (typeof document !== "undefined") document.documentElement.classList.toggle("sr-pop-open", !!settingPop);
  function closePops(returnFocus = true) {
    settingPop = null;
    if (returnFocus) popOpener?.focus();
  }
  function togglePop(which: SettingPop, e: MouseEvent) {
    if (settingPop === which) return closePops();
    const pill = e.currentTarget as HTMLElement;
    const room = setbarEl?.clientWidth ?? POP_WIDTH;
    const fromLeft = setbarEl ? pill.getBoundingClientRect().left - setbarEl.getBoundingClientRect().left : 0;
    popLeft = Math.max(0, Math.min(fromLeft, room - POP_WIDTH));
    popOpener = pill;
    settingPop = which;
    void tick().then(() => {
      const pop = document.querySelector(".set-pop");
      (pop?.querySelector(".sr-on, [aria-pressed='true']") ?? pop?.querySelector("button, input, select") as HTMLElement | null)?.focus?.();
    });
  }
  const POP_TITLE: Record<SettingPop, string> = { key: "Key", parts: "Parts", bars: "Bars", share: "Class libraries" };

  // ── Listen and grade, practice on the whole piece (not an assignment's attempts) ──
  let gradeOpen = false;
  /** A practice run is under way (the microphone held). */
  let practicing = false;
  const HEAR_KEY = "abc-piece-hearing";
  /** What plays while singing: the other parts, every part (theirs quietly), or nothing. */
  let practiceHearing: Extract<Hearing, "others" | "quiet" | "acappella"> = "others";
  const PRACTICE_HEARING: { id: typeof practiceHearing; label: string; sub: string }[] = [
    { id: "others", label: "The other parts", sub: "Yours is silent" },
    { id: "quiet", label: "Everyone", sub: "Yours quietly, to lean on" },
    { id: "acappella", label: "A cappella", sub: "Nothing but the click" },
  ];

  onMount(() => {
    // A tap outside the row, or Escape, closes a popover.
    const away = (e: PointerEvent) => {
      if (settingPop && !setbarEl?.contains(e.target as Node)) closePops(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && settingPop) closePops();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    try {
      const h = localStorage.getItem(HEAR_KEY);
      if (h === "others" || h === "quiet" || h === "acappella") practiceHearing = h;
    } catch {}
    void load();
    // For scripts/check-piece-viewer.ts: where the music is, and where Pause left it.
    if (import.meta.env.DEV) {
      (window as unknown as { __pieceDebug: unknown }).__pieceDebug = {
        position: () => {
          const t = sectionTick();
          const m = t === null || !score ? -1 : score.measures.findIndex((x) => t >= x.start && t < x.start + x.length);
          return m < 0 ? null : { bar: Number(score!.measures[m].label), tick: t };
        },
        paused: () => pausedMs,
        /** Loop on or off and the count-in, as the playback bar sets them. */
        setLoop: (on: boolean, countIn: boolean) => ((looping = on), (countInOn = countIn)),
        /** Each pass's music start on the audio clock, and how long its music is. */
        passes: () => passLog,
        play: () => play(),
        stop: () => stopHere(),
        /** The key lines of the music as drawn and as heard. */
        keys: () => {
          const ks = (abc = "") => [...new Set(abc.match(/K:[^\]\n]*/g) ?? [])].join(" ");
          return { drawn: ks(drawn?.abc), heard: score ? ks(sectionSound().abc) : "" };
        },
      };
    }
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
      document.documentElement.classList.remove("sr-pop-open");
    };
  });

  async function load() {
    narrow = window.innerWidth <= 640;
    try {
      const loaded = await loadPiece(id);
      piece = loaded.piece;
      score = loaded.score;
      parts = partSettingsFor(loaded.score, loaded.parts);
      settings = loaded.settings;
      transpose = settings.transpose;
      soundKey = settings.sound;
      const firstTempo = score.measures.find((m) => m.tempo)?.tempo;
      scoreBpm = bpm = firstTempo ?? 100;
      to = score.measures.length - 1;
      if (assignment) {
        ({ from, to, leadIn } = assignment.settings);
        // The whole piece shows; the bars outside the assignment fade.
        excerpt = !(from === 0 && to === score.measures.length - 1);
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
      } else if (library) startPractice({ page: "piece", assignmentId: null, isBusy: () => isPlaying });
      directorRange = { from, to };
      fs = createFullscreen();
      fs.active.subscribe((v) => (fsOn = v));
      await tick();
      await render();
      if (attemptId) await showAttempt(attemptId);
    } catch (e) {
      error = (e as Error).message;
    }
  }

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
    moveTo: (i) => gradeCursorTo(i),
    countIn: () => {},
    click: () => {},
    marked: (scores) => markNotes(scores),
    startTimeline: () => startTimeline(),
    stopTimeline: () => pause(),
    traced: (trace) => {
      lastTrace = trace;
      drawTrace(trace);
    },
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
  /** A sounding pitch named as the music shows it (the written key may differ from the heard one). */
  $: letterOf = (midi: number) => LETTERS[((Math.round(midi + tr - sr) % 12) + 12) % 12];

  function drawTrace(trace: GradeTrace) {
    const svg = document.querySelector("#piece-paper svg") as SVGSVGElement | null;
    if (!svg || !myPart || (!assignment && !gradeOpen)) return;
    const strictness = asg ? asg.settings.strictness : $tuner.gradeStrictness;
    const at = drawnFor(myPart);
    drawGradeFeedback({
      svg,
      notes: gradeNotes,
      drawn: gradeNotes.map((n) => at.get(n.cursor)),
      drawnAt: (cursor) => at.get(cursor),
      trace,
      perf: $gradeRunner.perf,
      doPc,
      nameOf: letterOf,
      onsetBeats: STRICTNESS[strictness].onsetBeats,
      bpm: gradeBpm(),
    });
  }

  let gradeNotes: GradeNote[] = [];

  /**
   * The section plays from the lead-in, with the count-in and a click, and
   * what the teacher chose to hear; the first graded downbeat (t0) is when the
   * music is heard plus the lead-in's length.
   */
  function startTimeline(): number {
    if (!score || !player.ready) return performance.now();
    makeTimeline();
    const heardAt = player.play(() => {
      isPlaying = false;
      stopCursor();
      markStart();
    }, sectionClicks(true));
    soundHeardAt = heardAt;
    isPlaying = true;
    markStart();
    if (!(practicing && $tuner.gradeCursor === "off")) followCursor();
    const leadInMs = ((score.measures[from].start - score.measures[leadIn].start) / TICKS) * (60_000 / bpm);
    return heardAt + leadInMs;
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
    // Rendered before the microphone starts: nothing may await after it.
    await player.prepare(sectionSound());
    const schedule = scheduleForPiece(score, myPart, from, to, playedBars(score.measures, from, to));
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

  // ── Listen and grade on the whole piece (practice: nothing is kept) ──────
  /** Parts one microphone can follow over the bars in play: one line, no chords. */
  $: practiceParts = score && !asg ? partOrder.filter((x) => partsFor(score!, from, to, false).includes(x.p.id)) : [];
  $: practiceBlocked = !score || asg ? null : practiceParts.length ? null : "No part here is one line to sing: each plays chords or two voices at once.";
  /** Do's and the tonic's pitch class as the music sounds (the key moved by the transposition). */
  $: doPc = writtenKey ? ((((writtenKey.fifths * 7 + sr) % 12) + 12) % 12) : 0;
  $: tonicPc = writtenKey?.mode === "minor" ? (doPc + 9) % 12 : doPc;
  const PART_KEY = () => `abc-piece-grade-part-${id}`;

  async function openGrade() {
    pauseAll();
    if (choosing) stopChoosing();
    gradeOpen = true;
    const ids = practiceParts.map((x) => x.p.id);
    if (!myPart || !ids.includes(myPart)) {
      let kept: string | null = null;
      try { kept = localStorage.getItem(PART_KEY()); } catch {}
      myPart = kept && ids.includes(kept) ? kept : ids[0] ?? null;
    }
    // Your part always shows while grading, even if it is hidden.
    if (myPart && parts[myPart]?.hidden) await render();
  }

  async function choosePracticePart(pid: string) {
    myPart = pid;
    try { localStorage.setItem(PART_KEY(), pid); } catch {}
    clearMarks();
    if (parts[pid]?.hidden) await render();
  }

  function chooseHearing(h: typeof practiceHearing) {
    practiceHearing = h;
    try { localStorage.setItem(HEAR_KEY, h); } catch {}
  }

  function closeGrade() {
    disposeTake();
    takeAudio = null;
    gradeRunner.stop();
    clearMarks();
    gradeCursorTo(-1);
    gradeOpen = false;
    if (myPart && parts[myPart]?.hidden) void render();
  }

  /** After a run: the tapped note (an index into gradeNotes), and what the panel says about it. */
  let gradeDetailIndex: number | null = null;
  $: if ($gradeRunner.phase !== "results") gradeDetailIndex = null;
  $: gradeDetail = (() => {
    const i = gradeDetailIndex;
    const v = $gradeRunner;
    const n = i === null ? null : gradeNotes[i];
    if (!n || v.phase !== "results") return null;
    const want = letterOf(n.midi);
    if (v.perf) {
      const r = v.perf.notes[i!];
      if (!r) return null;
      if (r.missed) return `Note ${i! + 1} (${want}): not heard`;
      const bits = [r.pitchOk ? `${want}, ${r.cents === 0 ? "in tune" : `${Math.abs(r.cents ?? 0)} cents ${(r.cents ?? 0) > 0 ? "sharp" : "flat"}`}` : `you sang ${letterOf(r.sung ?? n.midi)}, the note is ${want}`];
      if (r.onsetBeats !== null && Math.abs(r.onsetBeats) > STRICTNESS[$tuner.gradeStrictness].onsetBeats) bits.push(`${Math.abs(r.onsetBeats).toFixed(2)} beats ${r.onsetBeats > 0 ? "late" : "early"}`);
      else if (r.onsetBeats !== null) bits.push("on time");
      if (r.cutShort) bits.push("cut short");
      return `Note ${i! + 1}: ${bits.join(" · ")}`;
    }
    const r = v.result?.notes[i!];
    if (!r) return null;
    const first = r.firstTry !== null ? `, you first sang ${letterOf(r.firstTry)}` : "";
    if (r.outcome === "skipped") return `Note ${i! + 1} (${want}): skipped${first}`;
    const how = r.outcome === "first" ? "right first time" : r.outcome === "corrected" ? `corrected${first}` : "after hearing it";
    return `Note ${i! + 1} (${want}): ${how}`;
  })();

  /** The tonic chord at or under a note: what "the key" plays before the run, and the Stuck menu's chord. */
  function tonicTriad(near: number): number[] {
    const root = near - ((((near - tonicPc) % 12) + 12) % 12);
    return [root, root + (writtenKey?.mode === "minor" ? 3 : 4), root + 7];
  }

  /** Note by note or Pitch & rhythm on my part of the whole piece; the sound is made before the microphone starts. */
  async function startPracticeRun() {
    if (!score || !myPart || practicing) return;
    pauseAll();
    disposeTake();
    takeAudio = null;
    lastTrace = null;
    clearMarks();
    gradeCursorTo(-1);
    const inTime = $tuner.gradeMode === "performance";
    const order = playedBars(score.measures, from, to);
    const schedule = scheduleForPiece(heard(), myPart, from, to, order);
    gradeNotes = schedule.notes;
    if (!gradeNotes.length) return;
    if (inTime) {
      isPreparing = true;
      try {
        await player.prepare(sectionSound(true));
      } finally {
        isPreparing = false;
      }
    }
    // Recorded for Hear your take (kept in this browser only). Nothing may await once the tuner starts.
    recording = await startGradeRecording();
    initTuner();
    if (tuner.get().engineStatus !== "running") await startTuner();
    if (tuner.get().engineStatus !== "running") {
      status = "The microphone did not start. Allow it in your browser, then try again.";
      void recording?.stop();
      recording = null;
      return;
    }
    tuner.setMicHeld(true);
    const time = score.measures[from].time;
    // Set just before the run starts, so the idle and results watchers below see a run.
    practicing = true;
    gradeRunner.start({
      notes: gradeNotes,
      rests: schedule.rests,
      bpm: gradeBpm(),
      beatsPerBar: beatsInBar(time),
      beatUnits: schedule.beatUnits,
      countInBeats: countInMeasures(`${time.beats}/${time.beatType}`) * beatsInBar(time),
      reference: $tuner.gradeReference,
      mode: inTime ? "performance" : "pitch",
      strictness: $tuner.gradeStrictness,
      cursor: $tuner.gradeCursor,
      click: $tuner.gradeClick,
      tonicTriad: tonicTriad(gradeNotes[0].midi),
    });
  }

  $: if (practicing && ($gradeRunner.phase === "results" || $gradeRunner.phase === "idle")) endPractice();
  function endPractice() {
    const ended = $gradeRunner.phase === "results";
    practicing = false;
    pause();
    releaseMic();
    const rec = recording;
    recording = null;
    // The sound as heard in the run, kept: Play may render another before the take is heard.
    takeSound = $tuner.gradeMode === "performance" ? player.audio : null;
    void rec?.stop().then((a) => {
      if (ended) takeAudio = a;
    });
  }

  // ── Hear your take (grade-playback.ts): the practice run's recording, the music as heard under it ──
  /** The last practice run's recording, in this browser only; gone with a new run or Close. */
  let takeAudio: { blob: Blob; startedAt: number } | null = null;
  let lastTrace: GradeTrace | null = null;
  let takeSound: AudioBuffer | null = null;
  /** When the run's sound was first heard (page time), for the music under the take. */
  let soundHeardAt = 0;
  let takePlayer: TakePlayer | null = null;
  let take = { open: false, loading: false, playing: false, progress: 0, music: false, hasMusic: false, error: null as string | null };
  let takeNote = -1;
  let takeFrom = 0;
  const takeProgress = (t: number) =>
    takePlayer ? Math.min(1, Math.max(0, (t - takeFrom) / Math.max(1, takePlayer.end - takeFrom))) : 0;
  $: canHearTake = !!takeAudio && !!lastTrace && $gradeRunner.phase === "results" && gradeOpen && !asg;
  const paperOf = () => document.querySelector("#piece-paper svg");
  function disposeTake() {
    takePlayer?.dispose();
    takePlayer = null;
    takeNote = -1;
    take = { ...take, open: false, loading: false, playing: false, progress: 0 };
  }
  async function hearTake() {
    if (takePlayer) {
      take = { ...take, open: true };
      if (takePlayer.playing) return takePlayer.pause();
      return takePlayer.play(takePlayer.position <= takePlayer.start ? takeFrom : takePlayer.position);
    }
    if (!takeAudio || !lastTrace || !score) return;
    pauseAll();
    const trace = lastTrace;
    // Note by note is untimed: no music lines up with it.
    const timed = trace.mode !== "pitch" && trace.t0 !== undefined && !!takeSound;
    const time = score.measures[playFrom].time;
    const beatMs = 60_000 / gradeBpm();
    const player2 = new TakePlayer(takeAudio, timed
      ? {
          abc: "",
          bpm: bpm,
          transpose: 0,
          volumeMultiplier: 1,
          t0: trace.t0!,
          beatMs,
          beatsPerBar: beatsInBar(time),
          countInBeats: countInMeasures(`${time.beats}/${time.beatType}`) * beatsInBar(time),
          beats: Math.ceil((timeline?.totalMs ?? 0) / beatMs),
          clickSound: $tuner.clickSound,
          buffer: takeSound!,
          bufferAt: soundHeardAt,
        }
      : null);
    takePlayer = player2;
    take = { ...take, open: true, loading: true, error: null, hasMusic: timed };
    try {
      await player2.load();
    } catch (e) {
      console.error("The take could not be played:", e);
      take = { ...take, loading: false, error: "Your take could not be played back in this browser." };
      return;
    }
    if (takePlayer !== player2) return;
    player2.setMusic(take.music);
    player2.onFrame((t) => {
      const i = spanAt(trace.spans, t);
      if (i !== takeNote) {
        takeNote = i;
        gradeCursorTo(i);
        revealTo(paperOf(), i);
        gradeDetailIndex = i >= 0 ? i : null;
      }
      take = { ...take, playing: player2.playing, progress: takeProgress(t) };
    });
    player2.onEnd(() => {
      takeNote = -1;
      gradeCursorTo(-1);
      revealTo(paperOf(), null);
      take = { ...take, playing: false, progress: 0 };
    });
    take = { ...take, loading: false };
    takeFrom = Math.max(player2.start, (trace.spans[0]?.from ?? player2.start) - 1200);
    await player2.play(takeFrom);
    take = { ...take, playing: true };
  }
  function takeMusic(on: boolean) {
    take = { ...take, music: on };
    takePlayer?.setMusic(on);
  }
  function takeSeek(frac: number) {
    if (!takePlayer) return;
    takePlayer.seek(takeFrom + frac * (takePlayer.end - takeFrom));
    take = { ...take, progress: frac };
  }
  function closeTake() {
    takePlayer?.pause();
    gradeCursorTo(-1);
    revealTo(paperOf(), null);
    take = { ...take, open: false, playing: false };
  }

  /** Note by note: the note waited on, lit and in view, Pip on it, and the other parts' notes under it. */
  let gradeLit: Element[] = [];
  function gradeCursorTo(i: number) {
    for (const e of gradeLit) e.classList.remove("piece-now");
    gradeLit = [];
    const n = i >= 0 && (practicing || take.open) ? gradeNotes[i] : null;
    guideTo(practicing ? n : null);
    if (!n || !myPart) return;
    gradeLit = (drawnFor(myPart).get(n.cursor)?.absEl?.elemset ?? []) as Element[];
    for (const e of gradeLit) e.classList.add("piece-now");
    const head = gradeLit[0] as HTMLElement | undefined;
    if (head) {
      const r = head.getBoundingClientRect();
      if (r.top < 100 || r.bottom > window.innerHeight - 220) head.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (get(gradeRunner).phase === "sing") playOthersUnder(n);
  }

  /**
   * The other parts' notes sounding with this one, played as it comes up
   * (unless a cappella), without its own pitch in any octave: the harmony
   * to find it in, never the answer, which the microphone would also hear.
   */
  function playOthersUnder(n: GradeNote) {
    if (practiceHearing === "acappella" || !score || !myPart) return;
    const mine = heard().parts.find((p) => p.id === myPart);
    const at = mine?.notes[n.cursor]?.start;
    if (at === undefined) return;
    const pc = ((n.midi % 12) + 12) % 12;
    const chord = new Set<number>();
    heard().parts.forEach((p) => {
      if (p.id === myPart || levelOf(p.id) === 0) return;
      for (const x of p.notes) {
        if (!x.rest && x.midi !== undefined && x.start <= at && at < x.start + x.length && ((x.midi % 12) + 12) % 12 !== pc) chord.add(x.midi);
      }
    });
    if (chord.size) playPiano([...chord], 1.6, tuner.get().a4, 0.3);
  }

  /** Note by note's pitch guide (pitch-guide.ts): Pip on the note being waited on. */
  let pitchGuide: PitchGuide | null = null;
  function guideTo(n: GradeNote | null) {
    if (!n || !myPart || $tuner.gradeMode !== "pitch" || !$tuner.gradeGuide) {
      pitchGuide?.destroy();
      pitchGuide = null;
      return;
    }
    pitchGuide ??= new PitchGuide({ doPc, nameOf: letterOf, tolerance: STRICTNESS[$tuner.gradeStrictness].cents, reduceMotion });
    const pid = myPart;
    pitchGuide.setNote(() => {
      const svg = document.querySelector("#piece-paper svg") as SVGSVGElement | null;
      const head = headOf(drawnFor(pid).get(n.cursor));
      return svg && head ? { svg, head } : null;
    }, n.midi);
  }
  $: pitchGuide?.feed($gradeRunner);
  $: if (pitchGuide && ($gradeRunner.phase === "idle" || $gradeRunner.phase === "results")) {
    pitchGuide.destroy();
    pitchGuide = null;
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
  }

  async function finishRun() {
    grading = false;
    pause();
    releaseMic();
    const audio = (await recording?.stop()) ?? null;
    recording = null;
    const result = $gradeRunner.perf;
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
    takePlayer?.dispose();
    gradeRunner.stop();
    player.destroy();
    pitchGuide?.destroy();
    cancelAnimationFrame(cursorFrame);
    if (grading || practicing) releaseMic();
    fs?.destroy();
  });

  $: partOrder = score ? score.parts.map((p, i) => ({ p, i, s: parts[p.id] })).filter((x) => x.s) : [];
  $: shownParts = partOrder.filter((x) => !hiddenPart(x.p.id)).map((x) => x.i);
  $: mine = assignment && myPart ? partOrder.find((x) => x.p.id === myPart) : null;
  /** Where playback starts: an assignment's lead-in, or the director's first bar. */
  $: playFrom = asg ? leadIn : from;
  $: choosable = assignment && score ? partOrder.filter((x) => partsFor(score!, from, to).includes(x.p.id)) : [];

  /** What shows: the piece's settings, and in an assignment always the student's own part. */
  function hiddenPart(pid: string): boolean {
    if ((asg || gradeOpen) && pid === myPart) return false;
    return !!parts[pid]?.hidden;
  }
  /**
   * How loud a part plays, 0 to 1: in an assignment the teacher's choice of
   * what students hear decides; otherwise mute and the practice mix, and
   * under a graded run what was chosen to hear with it.
   */
  function levelOf(pid: string, forGrade = false): number {
    if (asg) return levelFor(asg.settings, pid, myPart);
    const base = parts[pid]?.muted ? 0 : mixLevel(pid, loud);
    return forGrade ? base * levelFor({ hearing: practiceHearing, playing: [] }, pid, myPart) : base;
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
      const notes = heard().parts[v.part].notes;
      (els.get(v.id) ?? []).forEach((el, k) => {
        const i = v.elements[k];
        if (i === undefined || i < 0 || notes[i].rest) return;
        const head = notes[i];
        const chord = notes.filter((n) => !n.rest && n.start === head.start && n.staff === head.staff && n.voice === head.voice).map((n) => n.midi!);
        noteAt.set(el, chord);
      });
    }
  }
  /**
   * A tapped note: in an assignment, its pitch; otherwise where playback
   * starts (heard as it is chosen), and if the music is playing, it jumps
   * there at once. Nothing while a graded run is under way.
   */
  async function onNoteClick(abcElem: unknown) {
    if (choosing || practicing || grading) return;
    const midis = noteAt.get(abcElem);
    if (asg) {
      if (midis?.length) playPiano(midis, 1);
      return;
    }
    const it = items.find((x) => x.el === abcElem);
    if (!it || !score) return;
    // After a graded run, a tap on one of my part's notes says what it did.
    if (gradeOpen && $gradeRunner.phase === "results" && myPart && score.parts[it.part]?.id === myPart) {
      const k = gradeNotes.findIndex((n) => n.cursor === it.index);
      if (k >= 0) {
        gradeDetailIndex = k;
        return;
      }
    }
    const wasPlaying = isPlaying;
    if (it.note.measure < from || it.note.measure > to) setRange(0, score.measures.length - 1);
    setStart({ tick: it.note.start, bar: it.note.measure });
    pausedMs = null;
    if (wasPlaying) await playSection(startOffset(), false);
    else if (midis?.length) playPiano(midis, 0.8, tuner.get().a4, 0.4);
  }

  function setStart(at: { tick: number; bar: number } | null) {
    startAt = at;
    markStart();
  }
  const paperSvg = () => document.querySelector("#piece-paper svg") as SVGSVGElement | null;

  /**
   * Where Play starts, marked on the music: a line the height of the system
   * at the paused place, the tapped note (its notes orange too), or the first
   * note of the bars in play. Hidden while playing, when the cursor moves.
   */
  function markStart() {
    for (const e of startEls) e.classList.remove("piece-start");
    startEls = [];
    if (!score || !items.length) return;
    if (isPlaying) {
      cursorLine(paperSvg(), [], "piece-start-line");
      return;
    }
    let at: Element[] = [];
    let label = "Start";
    const pausedTick = pausedMs !== null && timeline ? timeline.tickAt(pausedMs) : null;
    if (pausedTick !== null) {
      at = soundingAt(items, pausedTick);
      label = "Paused";
    } else if (startAt) {
      const t = startAt.tick;
      startEls = items.filter((x) => x.note.start === t && x.note.measure === startAt!.bar && !x.note.rest).flatMap((x) => x.svg);
      if (!startEls.length) startEls = items.filter((x) => x.note.start === t).flatMap((x) => x.svg);
      for (const e of startEls) e.classList.add("piece-start");
      at = startEls;
    } else {
      const bar = asg ? leadIn : from;
      const inBar = items.filter((x) => x.note.measure === bar);
      const first = Math.min(...inBar.map((x) => x.note.start));
      at = inBar.filter((x) => x.note.start === first).flatMap((x) => x.svg);
    }
    cursorLine(paperSvg(), at, "piece-start-line", label);
  }
  $: barChoices = score ? score.measures.map((m, i) => ({ i, label: m.label })) : [];

  function abcOptions(partIdx: number[]) {
    const programs = Object.fromEntries(partOrder.map((x) => [x.i, x.s.program]));
    const names = Object.fromEntries(
      partOrder.map((x) => [x.i, asg && myPart === x.p.id ? `${x.s.name} (you)` : x.s.name]),
    );
    // The whole piece always shows; the bars in play are marked by fading the rest.
    const perLine = narrow ? 2 : score && score.parts.length > 6 ? 3 : 4;
    return { parts: partIdx, programs, names, barsPerLine: perLine, tempo: scoreBpm };
  }

  async function render() {
    if (!score) return;
    pause();
    const abcjs = (await import("abcjs")).default;
    const shown = shownParts.length ? shownParts : [0];
    drawn = abcForPiece(music(), abcOptions(shown));
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
    items = noteElements(tune, drawn, music());
    choosing = false;
    anchor = null;
    markBars();
    markStart();
  }

  /** The bars in play: the rest fade (an assignment's lead-in less); scrolled to the first time. */
  function markBars() {
    if (!score) return;
    fadeOutside(items, from, to, asg ? leadIn : from);
    markStart();
    if (!shadedOnce && (asg || excerpt)) {
      shadedOnce = true;
      const first = items.find((it) => it.note.measure === playFrom)?.svg[0];
      (first as HTMLElement | undefined)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
  }

  // ── Assignment playback: the lead-in to the last graded bar, on the audio clock ──
  function sectionSound(forGrade = false) {
    const all = abcForPiece(heard(), {
      ...abcOptions(score!.parts.map((_, i) => i)),
      from: playFrom,
      to,
      tempo: bpm,
      tempoChanges: false,
      barNumbers: false,
    });
    const levels = all.voices.map((v) => {
      const pid = score!.parts[v.part].id;
      const s = parts[pid];
      return s ? levelOf(pid, forGrade) * (s.volume / 80) : 0;
    });
    return { abc: all.abc, levels };
  }

  /**
   * The count-in and click. A graded run always counts in; an assignment's
   * always clicks, a practice run as Grade's setup says. `countIn` false is a
   * jump to a tapped note while playing: straight on, no count-in.
   */
  function sectionClicks(countIn = true) {
    const bar = score!.measures[playFrom];
    const time = bar.time;
    const beatMs = 60_000 / gradeBpm();
    const perBar = beatsInBar(time);
    const fullBar = Math.round((time.beats * 4 * TICKS) / time.beatType);
    // A pickup starts late in its bar.
    const firstBeat = bar.length < fullBar ? Math.round(((fullBar - bar.length) / fullBar) * perBar) : 0;
    const sectionMs = timeline?.totalMs ?? 0;
    const through = practicing ? $tuner.gradeClick !== "off" : clickOn || grading;
    return {
      beatMs,
      beatsPerBar: perBar,
      countIn: countIn && (asg || grading || practicing || countInOn) ? countInMeasures(`${time.beats}/${time.beatType}`) * perBar : 0,
      throughMs: through ? sectionMs : 0,
      firstBeat,
      sub: practicing && $tuner.gradeClick === "sub" ? (scheduleBeatUnits() === 12 ? 3 : 2) : 1,
    };
  }

  /** The bars as heard now, at this tempo. */
  let timelineBpm = 100;
  function makeTimeline() {
    if (!score) return;
    timeline = new Timeline(score.measures, playedBars(score.measures, playFrom, to), bpm);
    timelineBpm = bpm;
  }

  /** The tick the music has reached, from the audio clock (repeats followed). */
  function sectionTick(): number | null {
    const ms = player.elapsedMs();
    if (ms === null || !timeline) return null;
    return timeline.tickAt(ms);
  }

  /** Where Play starts in the sound (ms): where it was paused, else the tapped note, else the top. */
  function startOffset(): number {
    if (pausedMs !== null) return pausedMs;
    if (startAt && timeline) return timeline.msOf(startAt.tick) ?? 0;
    return 0;
  }

  function followCursor() {
    cancelAnimationFrame(cursorFrame);
    const step = () => {
      const t = sectionTick();
      const was = lit[0];
      for (const e of lit) e.classList.remove("piece-now");
      lit = t === null ? [] : soundingAt(items, t);
      for (const e of lit) e.classList.add("piece-now");
      if (lit[0] !== was) cursorLine(paperSvg(), lit, "piece-play-line");
      const head = lit[0] as HTMLElement | undefined;
      if (head) {
        const r = head.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 140) head.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      if (player.startedAt) cursorFrame = requestAnimationFrame(step);
    };
    cursorFrame = requestAnimationFrame(step);
  }

  function stopCursor() {
    cancelAnimationFrame(cursorFrame);
    for (const e of lit) e.classList.remove("piece-now");
    lit = [];
    cursorLine(paperSvg(), [], "piece-play-line");
  }

  /**
   * Plays the section from `offsetMs` into it (null: where Play starts);
   * returns when the music is heard (performance.now ms).
   */
  /** Dev only: each pass's start on the audio clock (check-piece-viewer.ts LOOP=1). */
  let passLog: { audio: number; offsetMs: number; totalMs: number; countInMs: number }[] = [];

  /** The loop's next pass, booked just before this one's music ends (pause cancels it). */
  let loopTimer: ReturnType<typeof setTimeout> | undefined;
  let passId = 0;
  /** How long before the music's end the next pass is booked (ms): room for the sound to be found. */
  const LOOP_LEAD_MS = 400;

  /**
   * Books the loop's next pass on the beat the last bar ends (`endAudio` on the
   * audio clock): its count-in, or its first note with the count-in off,
   * lands on the next beat, and this pass rings out under it.
   */
  function bookLoop() {
    clearTimeout(loopTimer);
    const pass = ++passId;
    const s = player.startedAt;
    if (!s || !timeline) return;
    const endAudio = s.audio + (timeline.totalMs - s.offsetMs) / 1000;
    const wait = (endAudio - player.context().currentTime) * 1000 - LOOP_LEAD_MS;
    loopTimer = setTimeout(() => {
      if (pass === passId && looping && isPlaying && !grading && !practicing) void playSection(0, true, endAudio);
    }, Math.max(0, wait));
  }

  async function playSection(offsetMs: number | null = null, countIn = true, atAudio?: number): Promise<number | null> {
    if (!score) return null;
    if (take.open) closeTake();
    isPreparing = true;
    try {
      await player.prepare(sectionSound());
    } finally {
      isPreparing = false;
    }
    makeTimeline();
    const offset = Math.max(0, Math.min(offsetMs ?? startOffset(), (timeline?.totalMs ?? 0) - 1));
    pausedMs = null;
    const heardAt = player.play(() => {
      isPlaying = false;
      stopCursor();
      markStart();
      // Looping goes back to the top of the bars in play, even from a tapped
      // note: normally booked on the beat ahead of time (bookLoop); this is
      // for a Loop switched on too late for that.
      if (looping && !grading && !practicing) void playSection(0);
    }, sectionClicks(countIn), offset, atAudio);
    if (import.meta.env.DEV && player.startedAt) {
      const c = sectionClicks(countIn);
      passLog = [...passLog, { audio: player.startedAt.audio, offsetMs: offset, totalMs: timeline?.totalMs ?? 0, countInMs: c.countIn * c.beatMs }];
    }
    isPlaying = true;
    bookLoop();
    markStart();
    followCursor();
    return heardAt;
  }

  /**
   * A new tempo: the sound is made again at it. Playing, it carries on from
   * the same place in the music; paused, it keeps the place.
   */
  async function setTempo(b: number) {
    const was = timelineBpm;
    const here = isPlaying ? player.elapsedMs() : pausedMs;
    const playing = isPlaying;
    bpm = b;
    pause();
    const at = here === null ? null : Math.max(0, here) * (was / b);
    if (playing) await playSection(at, false);
    else {
      pausedMs = at;
      makeTimeline();
    }
  }

  async function play() {
    if (choosing) stopChoosing();
    if (practicing) return;
    await playSection();
  }

  /** Stops the sound and the cursor (the place is not kept). */
  function pause() {
    clearTimeout(loopTimer);
    passId++;
    player.stop();
    stopCursor();
    isPlaying = false;
    markStart();
  }
  /** The playback bar's Pause: Play carries on from here. */
  function pauseHere() {
    const ms = player.elapsedMs();
    pause();
    pausedMs = ms !== null && ms > 0 ? ms : pausedMs;
    markStart();
  }
  /** Stop: back to where Play starts (the tapped note, or the top). */
  function stopHere() {
    pause();
    pausedMs = null;
    markStart();
  }
  /** Back to start: the top, the tapped note let go. */
  function rewind() {
    pause();
    pausedMs = null;
    setStart(null);
  }
  /** Anything that changes what plays forgets the paused place. */
  function pauseAll() {
    pause();
    pausedMs = null;
    markStart();
  }

  // ── Parts ───────────────────────────────────────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function saveParts() {
    if (library) return;
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
    pause();
    if (redraw) await render();
  }

  function solo(partId: string) {
    const only = Object.entries(parts).every(([pid, s]) => (pid === partId ? !s.muted : s.muted));
    parts = Object.fromEntries(Object.entries(parts).map(([pid, s]) => [pid, { ...s, muted: only ? false : pid !== partId }]));
    saveParts();
    pause();
  }

  // ── Bars ────────────────────────────────────────────────────────────────
  function setRange(f: number, t: number) {
    pauseAll();
    timeline = null;
    from = Math.min(f, t);
    to = Math.max(f, t);
    excerpt = !!score && !(from === 0 && to === score.measures.length - 1);
    if (!asg) directorRange = { from, to };
    markBars();
  }

  function wholePiece() {
    if (score) setRange(0, score.measures.length - 1);
  }

  function toggleClick() {
    clickOn = !clickOn;
    pause();
  }

  // ── Choosing bars by tapping the music ───────────────────────────────────
  function startChoosing() {
    pause();
    const svg = document.querySelector("#piece-paper svg") as SVGSVGElement | null;
    barHits(svg, barBoxes(svg, items));
    choosing = true;
    anchor = null;
  }
  function stopChoosing() {
    clearBarHits(document.querySelector("#piece-paper svg"));
    choosing = false;
    anchor = null;
  }
  function onScoreClick(e: MouseEvent) {
    if (!choosing) return;
    const bar = barFromEvent(e);
    if (bar === null) return;
    if (anchor === null) {
      anchor = bar;
      setRange(bar, bar);
    } else {
      setRange(anchor, bar);
      stopChoosing();
    }
  }

  // ── Rehearsal ────────────────────────────────────────────────────────────
  /** Each part's first note in the bars in play, low to high, then all together. */
  let pitchTimers: ReturnType<typeof setTimeout>[] = [];
  function startingPitches() {
    if (!score) return;
    pitchTimers.forEach(clearTimeout);
    // From where Play starts: the tapped note, or the first bar in play.
    const at = startAt?.tick ?? score.measures[playFrom].start;
    const firsts: number[] = [];
    for (const { p, i } of partOrder) {
      if (levelOf(p.id) === 0) continue;
      let first: { start: number; midi?: number } | null = null;
      for (const n of heard().parts[i].notes) {
        if (n.rest || n.measure < playFrom || n.measure > to || n.start + n.length <= at) continue;
        if (!first || n.start < first.start) first = n;
      }
      if (first?.midi !== undefined) firsts.push(first.midi);
    }
    const order = [...new Set(firsts)].sort((a, b) => a - b);
    void preloadPiano(order);
    order.forEach((m, k) => pitchTimers.push(setTimeout(() => playPiano([m], 1), k * 650)));
    if (order.length > 1) pitchTimers.push(setTimeout(() => playPiano(order, 2.2), order.length * 650 + 200));
  }

  /** The key the music sounds in: a concert-pitch part's, or the first part's moved by its transposition. */
  $: writtenKey = (() => {
    const part = score?.parts.find((p) => !p.transpose) ?? score?.parts[0];
    const k = part?.keys?.[0];
    return k ? { fifths: k.fifths + 7 * (part!.transpose || 0), mode: k.mode } : null;
  })();
  /** The key a transposition gives, short: "F major", or "Up 2" without a key. */
  function keyShort(semis: number): string {
    if (!writtenKey) return semis === 0 ? "As written" : `${semis > 0 ? "Up" : "Down"} ${Math.abs(semis)}`;
    const fifths = ((((writtenKey.fifths + 7 * semis) % 12) + 12) % 12);
    const short = keyName(fifths > 6 ? fifths - 12 : fifths, writtenKey.mode);
    return writtenKey.mode === "minor" ? `${short.replace(/m$/, "")} minor` : `${short} major`;
  }
  $: partsSummary = score ? `${partOrder.length} part${partOrder.length === 1 ? "" : "s"}${loud ? `, ${parts[loud]?.name ?? ""} loud` : ""}` : "";
  $: mixChanged = !!loud || partOrder.some((x) => x.s.muted || x.s.hidden);
  /** ", beat 3" for a tapped note past the downbeat. */
  function beatLabel(at: { tick: number; bar: number }): string {
    const m = score?.measures[at.bar];
    if (!m || at.tick === m.start) return "";
    const beatTicks = (beatUnitsOf(m.time) * TICKS) / 8;
    const beat = (at.tick - m.start) / beatTicks + 1;
    return Number.isInteger(beat) ? `, beat ${beat}` : `, beat ${Math.floor(beat)}+`;
  }
  async function setTranspose(semis: number) {
    transpose = semis;
    pause();
    await render();
    if (!owner) return;
    settings = { ...settings, transpose: semis };
    saveSettings();
  }
  /** The key it is heard in, apart from the one drawn; null sounds as drawn. Nothing is drawn again. */
  function setSound(semis: number | null) {
    soundKey = semis;
    pause();
    if (!owner) return;
    settings = { ...settings, sound: semis };
    saveSettings();
  }
  $: soundApart = soundKey !== null && soundKey !== transpose;

  function saveSettings() {
    void updatePiece(id, { settings }).then(() => (status = "")).catch((e) => (status = (e as Error).message));
  }

  function setLoud(pid: string | null) {
    loud = pid;
    pause();
  }

  $: if (settingPop === "share" && classes === null) void myClasses().then((c) => (classes = c)).catch(() => (classes = []));
  async function shelve(c: { id: string; name: string }) {
    try {
      await addToLibrary(c.id, id);
      status = `In ${c.name}'s library: its students can open it any time.`;
      closePops(false);
    } catch (e) {
      status = (e as Error).message;
    }
  }

  /** The teacher's switch between their own view and what students see. */
  async function setPreview(on: boolean) {
    if (on === preview || !assignment) return;
    pause();
    preview = on;
    if (on) ({ from, to, leadIn } = assignment.settings);
    else ({ from, to } = directorRange);
    excerpt = !!score && !(from === 0 && to === score.measures.length - 1);
    if (on && !myPart && score) {
      const allowed = partsFor(score, from, to);
      if (allowed.length === 1) myPart = allowed[0];
      choosingPart = !myPart;
    }
    shadedOnce = false;
    await tick();
    await render();
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

<div class="focus-main w-full max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4" style="padding-bottom: calc(var(--bottom-bar-h, 96px) + env(safe-area-inset-bottom, 0px) + {gradeOpen ? '6rem' : '1.5rem'})">
  {#if error}
    <div class="sr-panel p-6 flex flex-col gap-3">
      <p class="text-sr-ink">{error}</p>
      <a class="sr-btn self-start" href={library ? "/library" : "/pieces"}>Back to {library ? "My library" : "My music"}</a>
    </div>
  {:else if !piece || !score}
    <p class="text-sr-muted">Loading the music…</p>
  {:else}
    {#if assignment?.role === "teacher"}
      <!-- A teacher's own assignment: their full view, or what students get. -->
      <div class="view-switch" role="radiogroup" aria-label="View">
        <button type="button" role="radio" aria-checked={!preview} class:on={!preview} on:click={() => setPreview(false)}>Director view</button>
        <button type="button" role="radio" aria-checked={preview} class:on={preview} on:click={() => setPreview(true)}>Student view</button>
      </div>
    {/if}
    {#if asg}
      <header class="assign-card flex flex-col gap-2">
        <a class="sr-link text-sm self-start" href={assignment.role === "teacher" ? "/account" : "/"}>{assignment.role === "teacher" ? "Classes" : "Home"}</a>
        <span class="kind"><Music size={12} aria-hidden="true" /> Assignment · a piece</span>
        <h1 class="text-2xl sm:text-3xl font-bold">{piece.title}</h1>
        <p class="font-bold">
          Graded: bars {score.measures[from].label} to {score.measures[to].label}{leadIn < from ? `, after a lead-in from bar ${score.measures[leadIn].label}` : ""}{mine ? `. Your part: ${mine.s.name}` : ""}. You hear: {HEARING_LABEL[assignment.settings.hearing].title.toLowerCase()}.
        </p>
        {#if assignment.note}<p class="text-sm">{assignment.note}</p>{/if}
        <p class="text-sm">
          {[
            assignment.dueAt ? `Due ${new Date(assignment.dueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : null,
            assignment.minutes ? `${assignment.minutes} minutes of practice` : null,
            assignment.settings.maxAttempts ? `${assignment.settings.maxAttempts} graded attempt${assignment.settings.maxAttempts === 1 ? "" : "s"}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
        {#if assignment.role === "teacher"}<p class="text-xs">You are seeing what your students see, and their graded attempts.</p>{/if}
      </header>
    {:else}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <a class="sr-link text-sm" href={library ? "/library" : assignment ? "/account" : "/pieces"}>{library ? "My library" : assignment ? "Classes" : "My music"}</a>
        {#if library}
          <h1 class="text-2xl sm:text-3xl font-bold text-sr-ink truncate">{piece.title}</h1>
        {:else if renaming}
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
        {#if assignment}
          <p class="text-sm text-sr-muted">From your assignment: bars {score.measures[assignment.settings.from].label} to {score.measures[assignment.settings.to].label}, ready to rehearse.</p>
        {/if}
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

    {#if piece.warnings.length && !library}
      <p class="text-sm text-sr-muted">{piece.warnings.join(". ")}.</p>
    {/if}
    {/if}

    {#if asg && choosingPart}
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

    {#if asg}
      <section class="sr-panel p-4 flex flex-wrap items-end gap-4" aria-label="Practice">
        {#if myPart}
          <button type="button" class="sr-btn inline-flex items-center gap-2" on:click={startingNote}><Ear size={16} aria-hidden="true" /> Starting note</button>
          <button type="button" class="sr-tok" on:click={() => (choosingPart = true)}>Part: {mine?.s.name}</button>
        {/if}
        <p class="w-full text-xs text-sr-muted">Tap any note in the music to hear it. Tempo, loop and the click are in the playback bar.</p>
      </section>

      <!-- Graded attempts: counted on the server when they start; the take goes to the teacher. -->
      <section class="sr-panel p-4 flex flex-col gap-3" aria-labelledby="graded-h">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="graded-h" class="font-bold text-sr-ink">Graded attempts</h2>
            {#if asg.role === "student"}
              <p class="text-sm text-sr-muted">{attemptsLine(maxAttempts, used)}{best ? ` · best ${best.overall}` : ""}</p>
            {:else}
              <p class="text-sm text-sr-muted">Try the grading yourself; nothing is kept. Your students' attempts are listed below.</p>
            {/if}
          </div>
          {#if gradeStage === "idle" || gradeStage === "done"}
            <button
              type="button"
              class="sr-btn inline-flex items-center gap-2"
              disabled={!myPart || (asg.role === "student" && left === 0)}
              on:click={openSetup}
            >
              <Mic size={16} aria-hidden="true" />
              {asg.role === "student" ? (left === 0 ? "No attempts left" : gradeStage === "done" ? "Another attempt" : "Graded attempt") : "Try the grading"}
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
    <!-- The settings, as the practice pages': a pill each, opening its own popover. -->
    <section class="setbar sr-panel w-full no-print focus-hide" aria-label="Piece settings" bind:this={setbarEl}>
      <div class="setbar-pills">
        <div class="set-group" role="group" aria-label="Music">
          <span class="set-group-label" aria-hidden="true"><span class="set-group-dot tone-sky"></span>Music</span>
          <div class="set-group-pills">
            <button type="button" class="set-pill" aria-expanded={settingPop === "key"} on:click={(e) => togglePop("key", e)}>
              <span class="set-pill-k">Key</span>{keyShort(transpose)}{#if soundApart}, sounds in {keyShort(soundKey ?? 0)}{/if}
              {#if transpose || soundApart}<span class="set-pill-dot" title="Moved from the written key"></span>{/if}
              <ChevronDown size={14} class="set-pill-chev" aria-hidden="true" />
            </button>
            <button type="button" class="set-pill" aria-expanded={settingPop === "parts"} on:click={(e) => togglePop("parts", e)}>
              <span class="set-pill-k">Parts</span>{partsSummary}
              {#if mixChanged}<span class="set-pill-dot" title="Some parts muted, hidden or loud"></span>{/if}
              <ChevronDown size={14} class="set-pill-chev" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="set-group" role="group" aria-label="Practice">
          <span class="set-group-label" aria-hidden="true"><span class="set-group-dot tone-mint"></span>Practice</span>
          <div class="set-group-pills">
            <button type="button" class="set-pill" aria-expanded={settingPop === "bars"} on:click={(e) => togglePop("bars", e)}>
              <span class="set-pill-k">Bars</span>{excerpt ? `${score.measures[from].label} to ${score.measures[to].label}` : "Whole piece"}
              {#if excerpt}<span class="set-pill-dot" title="Not the whole piece"></span>{/if}
              <ChevronDown size={14} class="set-pill-chev" aria-hidden="true" />
            </button>
          </div>
        </div>
        {#if owner}
          <div class="set-group" role="group" aria-label="Share">
            <span class="set-group-label" aria-hidden="true"><span class="set-group-dot tone-peach"></span>Share</span>
            <div class="set-group-pills">
              <button type="button" class="set-pill" aria-expanded={settingPop === "share"} on:click={(e) => togglePop("share", e)}>
                Class libraries
                {#if settings.practiceMixes}<span class="set-pill-dot" title="Practice mixes offered"></span>{/if}
                <ChevronDown size={14} class="set-pill-chev" aria-hidden="true" />
              </button>
            </div>
          </div>
        {/if}
      </div>

      {#if settingPop}
        <button class="set-scrim" aria-label="Close" tabindex="-1" on:click={() => closePops()} transition:fade={{ duration: reduceMotion ? 0 : 140 }}></button>
        <div in:popIn out:popOut class="set-pop {settingPop === 'parts' ? 'set-pop-wide' : ''}" style="--pop-left: {popLeft}px" role="dialog" aria-label={POP_TITLE[settingPop]}>
          <p class="set-pop-title">{POP_TITLE[settingPop]}</p>
          {#if settingPop === "key"}
            <p class="key-row-label" id="key-written">The music</p>
            <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="key-written">
              {#each Array.from({ length: MAX_TRANSPOSE * 2 + 1 }, (_, k) => MAX_TRANSPOSE - k) as semis}
                <button type="button" class="sr-tok text-sm" class:sr-on={transpose === semis} aria-pressed={transpose === semis} on:click={() => setTranspose(semis)}>
                  {keyShort(semis)}<span class="tok-sub">{semis === 0 ? "as written" : `${semis > 0 ? "up" : "down"} ${Math.abs(semis)}`}</span>
                </button>
              {/each}
            </div>
            <p class="key-row-label" id="key-sound">The sound</p>
            <div class="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby="key-sound">
              <button type="button" class="sr-tok text-sm" class:sr-on={!soundApart} aria-pressed={!soundApart} on:click={() => setSound(null)}>
                Same as the music
              </button>
              {#if soundApart && soundKey !== null}
                <span class="key-step">
                  <button type="button" class="icon-btn" aria-label="Sound a semitone lower" disabled={soundKey <= -MAX_TRANSPOSE} on:click={() => setSound(soundKey === transpose + 1 ? transpose - 1 : (soundKey ?? 0) - 1)}><Minus size={16} aria-hidden="true" /></button>
                  <span class="key-step-name" aria-live="polite">{keyShort(soundKey)}<span class="tok-sub">{soundKey === 0 ? "as written" : `${soundKey > 0 ? "up" : "down"} ${Math.abs(soundKey)}`}</span></span>
                  <button type="button" class="icon-btn" aria-label="Sound a semitone higher" disabled={soundKey >= MAX_TRANSPOSE} on:click={() => setSound(soundKey === transpose - 1 ? transpose + 1 : (soundKey ?? 0) + 1)}><Plus size={16} aria-hidden="true" /></button>
                </span>
              {:else}
                <button type="button" class="sr-tok text-sm" on:click={() => setSound(transpose >= MAX_TRANSPOSE ? transpose - 1 : transpose + 1)}>Another key</button>
              {/if}
            </div>
            <p class="text-xs text-sr-faint mt-3">The music is drawn in one key and can be heard in another: read it in the original and sing it lower, say. Grade listens for the key you hear{owner ? ". The piece keeps both" : ""}. Assignments are always as written.</p>
          {:else if settingPop === "parts"}
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
            {#if owner || settings.practiceMixes}
              <!-- Practice mixes: one part loud, the rest soft (rules.ts mixLevel). -->
              <div class="flex flex-wrap items-center gap-2 pt-3" role="group" aria-label="Practice mix">
                <span class="sr-label w-full">Practice mix</span>
                <button type="button" class="sr-tok text-xs" class:sr-on={loud === null} aria-pressed={loud === null} on:click={() => setLoud(null)}>Everyone</button>
                {#each partOrder as { p, s } (p.id)}
                  <button type="button" class="sr-tok text-xs" class:sr-on={loud === p.id} aria-pressed={loud === p.id} on:click={() => setLoud(p.id)}>{s.name} loud</button>
                {/each}
              </div>
            {/if}
          {:else if settingPop === "bars"}
            <div class="flex flex-col gap-3">
              <p class="text-sm font-bold text-sr-ink">{excerpt ? `Bars ${score.measures[from].label} to ${score.measures[to].label}` : "The whole piece"}</p>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="sr-tok" on:click={() => { closePops(false); startChoosing(); }}>Choose bars on the music</button>
                {#if excerpt}<button type="button" class="sr-tok" on:click={wholePiece}>Whole piece</button>{/if}
              </div>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <label class="field"><span>From bar</span>
                  <select value={from} on:change={(e) => setRange(Number(e.currentTarget.value), to)}>
                    {#each barChoices as b}<option value={b.i}>{b.label}</option>{/each}
                  </select>
                </label>
                <label class="field"><span>To bar</span>
                  <select value={to} on:change={(e) => setRange(from, Number(e.currentTarget.value))}>
                    {#each barChoices as b}<option value={b.i}>{b.label}</option>{/each}
                  </select>
                </label>
              </div>
              <p class="text-xs text-sr-faint">Play, the loop and Listen and grade use these bars. To start from a note, tap it in the music.</p>
            </div>
          {:else if settingPop === "share"}
            <div class="flex flex-col gap-3">
              <button type="button" class="sr-tok self-start" class:sr-on={settings.practiceMixes} aria-pressed={settings.practiceMixes}
                on:click={() => ((settings = { ...settings, practiceMixes: !settings.practiceMixes }), saveSettings())}>Offer practice mixes in class libraries</button>
              <p class="sr-label">Add to a class library</p>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                {#if classes === null}
                  <span class="text-sr-muted">Loading your classes…</span>
                {:else if !classes.length}
                  <span class="text-sr-muted">No classes yet. Make one on your account page.</span>
                {:else}
                  {#each classes as c (c.id)}<button type="button" class="sr-tok text-xs" on:click={() => shelve(c)}>{c.name}</button>{/each}
                {/if}
              </div>
              <p class="text-xs text-sr-faint">Students of a class open its library songs whole, any part, ungraded.</p>
            </div>
          {/if}
          <div class="set-pop-foot"><button class="sr-tok" on:click={() => closePops()}>Done</button></div>
        </div>
      {/if}
    </section>
    {#if status}<p class="text-sm text-sr-brass focus-hide" role="status">{status}</p>{/if}

    <!-- The score's toolbar, as the practice pages': where Play starts, Starting pitches, Listen and grade. -->
    <div class="score-tools no-print focus-hide">
      {#if choosing}
        <span class="choose-hint mr-auto" role="status">{anchor === null ? "Tap the first bar in the music" : "Now tap the last bar"}</span>
        <button type="button" class="sr-tok text-xs" on:click={stopChoosing}>Cancel</button>
      {:else if startAt}
        <span class="start-chip mr-auto">
          Plays from bar {score.measures[startAt.bar].label}{beatLabel(startAt)}
          <button type="button" aria-label="Play from the top instead" title="Play from the top instead" on:click={rewind}><X size={14} aria-hidden="true" /></button>
        </span>
      {:else}
        <span class="mr-auto text-xs text-sr-muted px-1">Tap a note to play from there.</span>
      {/if}
      <button type="button" class="tool-btn" on:click={startingPitches}><Ear size={16} aria-hidden="true" />Starting pitches</button>
      <button type="button" class="tool-btn" class:tool-btn-live={gradeOpen} aria-pressed={gradeOpen} on:click={() => (gradeOpen ? closeGrade() : openGrade())}><Mic size={16} aria-hidden="true" />Listen and grade</button>
    </div>
    {/if}

    {#if gradeStage === "setup" && asg}
      <AudioCheck
        student={assignment.role === "student"}
        maxAttempts={maxAttempts}
        summary={`${mine?.s.name ?? "Your part"}, bars ${score.measures[from].label} to ${score.measures[to].label}, at ${bpm} bpm.`}
        onStart={() => void startRun()}
        onClose={() => (gradeStage = "idle")}
      />
    {/if}

    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div id="piece-box" class="score-paper focus-score" class:choosing on:click={onScoreClick}>
      <div id="piece-paper"></div>
    </div>
    <div id="piece-audio" class="hidden"></div>

    <PlaybackBar
      {isPlaying}
      {bpm}
      beatSymbol="♩"
      {looping}
      {isPreparing}
      hasExercise={true}
      status={asg ? `Bars ${score.measures[leadIn].label} to ${score.measures[to].label}` : null}
      voiceNames={asg ? [] : partOrder.map((x) => x.s.name)}
      mutedVoices={new Set(partOrder.filter((x) => x.s.muted).map((x) => x.s.name))}
      hiddenVoices={new Set(partOrder.filter((x) => x.s.hidden).map((x) => x.s.name))}
      onToggleMute={(name) => { const x = partOrder.find((y) => y.s.name === name); if (x) void changePart(x.p.id, { muted: !x.s.muted }, false); }}
      onToggleHidden={asg ? null : (name) => { const x = partOrder.find((y) => y.s.name === name); if (x) void changePart(x.p.id, { hidden: !x.s.hidden }, true); }}
      fullscreen={fsOn}
      onToggleFullscreen={() => fs?.toggle()}
      onPlay={play}
      onPause={pauseHere}
      onStop={stopHere}
      onRestart={rewind}
      onBpmChange={(b) => (bpm = b)}
      onBpmCommit={(b) => void setTempo(b)}
      onToggleLoop={() => (looping = !looping)}
      settingsLink={() => location.href}
      onPrint={() => window.print()}
    >
      <svelte:fragment slot="extra">
        {#if !asg}
          <button type="button" class="fs-keep flex-shrink-0 rounded-full px-3 h-11 xl:h-8 text-sm font-bold {countInOn ? 'opacity-100' : 'opacity-50'}"
            aria-pressed={countInOn} title={countInOn ? "Count-in on: turn it off" : "Count-in off: turn it on"} on:click={() => (countInOn = !countInOn)}>Count-in</button>
        {/if}
        <button type="button" class="fs-keep flex-shrink-0 rounded-full px-3 h-11 xl:h-8 text-sm font-bold {clickOn ? 'opacity-100' : 'opacity-50'}"
          aria-pressed={clickOn} title={clickOn ? "Click on: turn it off" : "Click off: turn it on"} on:click={toggleClick}>Click</button>
      </svelte:fragment>
    </PlaybackBar>

    {#if gradeOpen && !asg}
      <GradePanel
        runner={gradeRunner}
        allowed={true}
        signedIn={true}
        onStart={() => void startPracticeRun()}
        onClose={closeGrade}
        onNewExercise={null}
        blocked={practiceBlocked}
        {doPc}
        nameOf={letterOf}
        detail={gradeDetail}
        onHearTake={canHearTake ? hearTake : null}
        {take}
        onTakeMusic={takeMusic}
        onTakeSeek={takeSeek}
        onTakeClose={closeTake}
      >
        <div slot="setup" class="flex flex-col gap-3 border-t border-sr-hairline pt-3">
          <div class="flex flex-col gap-1.5" role="radiogroup" aria-label="Your part">
            <span class="text-xs font-bold text-sr-muted uppercase tracking-wide">Your part</span>
            <div class="flex flex-wrap gap-1.5">
              {#each practiceParts as { p, s } (p.id)}
                <button type="button" role="radio" aria-checked={myPart === p.id} class="sr-tok text-xs px-2.5 py-1" class:sr-on={myPart === p.id} on:click={() => choosePracticePart(p.id)}>{s.name}</button>
              {/each}
            </div>
          </div>
          <div class="flex flex-col gap-1.5" role="radiogroup" aria-label="While you sing">
            <span class="text-xs font-bold text-sr-muted uppercase tracking-wide">While you sing, hear</span>
            <div class="grid grid-cols-3 gap-1.5">
              {#each PRACTICE_HEARING as h (h.id)}
                <button type="button" role="radio" aria-checked={practiceHearing === h.id} class="hear" class:on={practiceHearing === h.id} on:click={() => chooseHearing(h.id)}>
                  <span class="font-bold text-sm">{h.label}</span><span class="text-[11px] opacity-80">{h.sub}</span>
                </button>
              {/each}
            </div>
            <p class="text-xs text-sr-muted">
              {#if $tuner.gradeMode === "pitch"}
                {practiceHearing === "acappella" ? "Each note on its own: nothing plays but what you ask for." : "As each note comes up, the other parts' notes under it play, never your own note."}
              {:else}
                The whole piece{excerpt ? ` (bars ${score.measures[from].label} to ${score.measures[to].label})` : ""} at {bpm} bpm, from a count-in.
              {/if}
              {#if practiceHearing !== "acappella"}Headphones help: the microphone hears the speakers too.{/if}
              Practice: nothing is kept.
            </p>
          </div>
        </div>
      </GradePanel>
    {/if}
  {/if}
</div>

<style>
  /* The bars in play: the rest fade (score-dom fadeOutside), nothing drawn over the music. */
  :global(#piece-paper .piece-out) { opacity: 0.22; }
  :global(#piece-paper .piece-lead) { opacity: 0.55; }
  :global(#piece-paper .bar-hit) { fill: transparent; cursor: pointer; }
  :global(#piece-paper .bar-hit:hover) { fill: var(--sr-action); fill-opacity: 0.08; }
  .choosing { outline: 3px dashed var(--sr-action); outline-offset: -3px; }
  .choose-hint {
    background: var(--sr-sky);
    color: var(--sr-sky-ink);
    font-weight: 800;
    border-radius: 999px;
    padding: 0.2rem 0.75rem;
  }
  .view-switch {
    align-self: flex-start;
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--sr-track);
  }
  .view-switch button {
    padding: 0.45rem 1rem;
    border-radius: 999px;
    font-weight: 800;
    font-size: 0.9rem;
    color: var(--sr-muted);
  }
  .view-switch button.on {
    background: var(--sr-action);
    color: var(--sr-action-ink);
  }
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
  .key-row-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--sr-faint);
    margin: 0 0 0.375rem;
  }
  .key-row-label + div + .key-row-label { margin-top: 0.875rem; }
  .key-step { display: inline-flex; align-items: center; gap: 0.25rem; }
  .key-step-name { min-width: 8.5rem; text-align: center; font-weight: 700; font-size: 14px; }
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

  /* A tapped note: where Play starts. */
  :global(#piece-paper .piece-start), :global(#piece-paper .piece-start path) { fill: #e07a1f; }
  /* Where Play starts, and the playing cursor: a line the height of the system. */
  :global(#piece-paper .piece-start-line rect) { fill: #e07a1f; }
  :global(#piece-paper .piece-start-line text) { fill: #e07a1f; font: 700 11px Nunito, sans-serif; }
  :global(#piece-paper .piece-play-line rect) { fill: var(--sr-action); opacity: 0.45; }
  .start-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.25rem;
    padding: 0 0.4rem 0 0.85rem;
    border-radius: 999px;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
    font-size: 13px;
    font-weight: 800;
  }
  .start-chip button {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
  }
  .start-chip button:hover { background: rgb(0 0 0 / 0.08); }
  .tok-sub { margin-left: 0.35rem; font-size: 11px; font-weight: 600; opacity: 0.65; }
  .hear {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    padding: 8px 10px;
    border-radius: 14px;
    border: 2px solid var(--sr-hairline);
    background: var(--sr-track);
    color: var(--sr-ink);
  }
  .hear.on { border-color: var(--sr-action); background: color-mix(in srgb, var(--sr-action) 16%, var(--sr-track)); }
</style>
