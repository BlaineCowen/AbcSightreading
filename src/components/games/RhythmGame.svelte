<script lang="ts">
  /**
   * The rhythm game (Games, 2 November 2026): a few bars of rhythm drawn big,
   * the count-in ("1, 2, Ready, Go", tapped along with), then tap the rhythm
   * on the spacebar or the pad while the metronome keeps the beat. The
   * rhythms are an abcStepByStep step's, or the teacher's own (RhythmSetup:
   * meters, figures, ties, syllables).
   * Graded by Clap and grade's rules (grade-rhythm.ts, beat by beat), the
   * lag taken off from the count-in's taps (game-lag.ts).
   *
   * On this device, or with your class (Pro to host): the big screen draws
   * the rhythm and plays the clicks; every student taps on their own device
   * at /live/<code> (LiveGame.svelte), stamped on the server clock, and the
   * big screen scores everyone and shows the board.
   */
  import { onDestroy, tick } from "svelte";
  import abcjs from "abcjs";
  import TapPad from "../TapPad.svelte";
  import GameHost from "./GameHost.svelte";
  import RhythmSetup from "./RhythmSetup.svelte";
  import GameLevels from "./GameLevels.svelte";
  import AssignGame from "./AssignGame.svelte";
  import GameAssignmentBanner from "./GameAssignmentBanner.svelte";
  import { onMount } from "svelte";
  import { loadGameAssignment, reportGameRound, type OpenGameAssignment } from "../../lib/game-assignment-client";
  import type { GameProgress } from "../../lib/game-assignments";
  import RhythmLane from "./RhythmLane.svelte";
  import RhythmLaneStill from "./RhythmLaneStill.svelte";
  import { GAME_BARS, GAME_TEMPOS, RHYTHM_LEVELS, customLevel, levelNews, roundParams, rhythmLevel } from "../../lib/games/rhythm-levels";
  import { bookClicks, gameAudio, loadClicks } from "../../lib/games/game-audio";
  import { scoreRhythm, type Press, type RhythmScore } from "../../lib/games/game-score";
  import { afterRound, blockName, teamsForStart } from "../../lib/games/host-game";
  import { drawnLines, markNotes, markShares, noteShares, roundLayout } from "../../lib/games/rhythm-marks";
  import { createFullscreen } from "../../lib/fullscreen";
  import { Maximize, Minimize } from "lucide-svelte";
  import { roomLag, countInLag } from "../../lib/games/game-lag";
  import { countInBarsFor, isFinal, rhythmTimes, type BoardRow, type LiveGame, type RhythmAnswer, type RhythmRound } from "../../lib/games/live-game";
  import { answers as fetchAnswers, closeRoom, measureOffset, newRound, openRoom, players as fetchPlayers, publishGame, type HostRoom } from "../../lib/games/host-room";
  import { gradeSchedule } from "../../lib/grade-schedule";
  import { beatUnitOf } from "../../lib/meter";
  import { audioToPage } from "../../lib/clap-listener";
  import { STRICTNESS, type Strictness } from "../../lib/grade";
  import { tuner } from "../../lib/tuner/store";
  import { countInWordsFor } from "../../lib/count-in";

  let mode: "solo" | "class" = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("host") === "1" ? "class" : "solo";
  /** An abcStepByStep step, or "custom" for the teacher's own (remembered in this browser). */
  let levelId = RHYTHM_LEVELS[0].id;
  let bars = 2;
  let bpm = 84;
  let strictness: Strictness = "standard";
  const OWN_KEY = "sr-rhythm-game-own";
  let own = (() => {
    try {
      const o = JSON.parse(localStorage.getItem(OWN_KEY) ?? "null");
      if (Array.isArray(o?.meters) && o.meters.length && Array.isArray(o?.rhythms)) return o as { meters: string[]; rhythms: string[]; ties: boolean; syllables: string };
    } catch {}
    return { meters: ["4/4"], rhythms: [...RHYTHM_LEVELS[Math.min(5, RHYTHM_LEVELS.length - 1)].rhythms], ties: false, syllables: "off" };
  })();
  const saveOwn = (o: typeof own) => {
    try { localStorage.setItem(OWN_KEY, JSON.stringify(o)); } catch {}
  };
  $: if (!assignment) saveOwn(own);
  /** Opened from a game assignment (?ga=): the teacher's rhythms, bars, tempo and strictness, locked. */
  let assignment: OpenGameAssignment | null = null;
  let assignmentProgress: GameProgress | null = null;
  onMount(async () => {
    const a = await loadGameAssignment("rhythm");
    if (!a) return;
    const st = a.setup as { levelId?: string; bars?: number; bpm?: number; strictness?: string; own?: typeof own };
    if (st.levelId === "custom" && Array.isArray(st.own?.meters) && Array.isArray(st.own?.rhythms)) own = { ties: false, syllables: "off", ...st.own };
    if (st.levelId === "custom" || RHYTHM_LEVELS.some((l) => l.id === st.levelId)) levelId = st.levelId!;
    if (typeof st.bars === "number" && (GAME_BARS as readonly number[]).includes(st.bars)) bars = st.bars;
    if (typeof st.bpm === "number" && (GAME_TEMPOS as readonly number[]).includes(st.bpm)) bpm = st.bpm;
    if (typeof st.strictness === "string" && st.strictness in STRICTNESS) strictness = st.strictness as Strictness;
    assignment = a;
    assignmentProgress = a.progress;
  });
  /** Each level's card: the figures and meters it brings in, as the symbols the Unison page's picker uses. */
  const figureSvgs = import.meta.glob("../../assets/svgs/*.svg", { as: "raw", eager: true }) as Record<string, string>;
  const svgOf = (name: string) => figureSvgs[`../../assets/svgs/${name}.svg`] ?? "";
  const levelCards = levelNews().map((n, i) => ({
    name: RHYTHM_LEVELS[i]!.name,
    icons: n.figures.map(svgOf).filter(Boolean),
    meters: n.all ? RHYTHM_LEVELS[i]!.meters : n.meters,
    detail: n.all ? "Everything, in every meter" : n.meters.length && i > 0 ? `New: ${n.meters.map((m) => `${m.split("/")[0]} beats a bar`).join(", ")}` : undefined,
  }));
  $: level = levelId === "custom" ? customLevel(own.meters, own.rhythms) : rhythmLevel(levelId);
  /**
   * The lane under the music (RhythmLane.svelte), remembered in this browser:
   * "still" (Blaine, 19 November 2026: "have the bars always underneath the
   * notes, statically, the distance you would hold that note"; a line moves
   * along it as the music goes), "scroll" (the Guitar Hero lane), or "off".
   * Still unless chosen otherwise ("on" was the scrolling lane's word).
   */
  type LaneMode = "still" | "scroll" | "off";
  const LANE_KEY = "sr-rhythm-lane";
  let laneMode: LaneMode = (() => {
    try {
      const v = localStorage.getItem(LANE_KEY);
      return v === "off" || v === "scroll" ? v : "still";
    } catch { return "still"; }
  })();
  const LANE_MODES: [LaneMode, string][] = [["still", "Under the notes"], ["scroll", "Scrolling"], ["off", "Off"]];
  let lane: RhythmLane | RhythmLaneStill | null = null;
  function setLane(mode: LaneMode) {
    laneMode = mode;
    try { localStorage.setItem(LANE_KEY, mode); } catch {}
  }
  /** The exercise's notes and rests in beats, for the lane. */
  $: laneNotes = exercise ? exercise.schedule.notes.map((n) => ({ start: n.startUnits / exercise!.beatUnits, len: n.lengthUnits / exercise!.beatUnits, cursor: n.cursor })) : [];
  $: laneRests = exercise ? exercise.schedule.rests.map((r) => ({ start: r.startUnits / exercise!.beatUnits, len: r.lengthUnits / exercise!.beatUnits, cursor: r.cursor })) : [];
  /** A finished solo round's marks on the lane, by note. */
  $: laneMarks = solo ? new Map(solo.result.notes.map((n) => [n.cursor, n.missed ? "miss" : n.rhythm >= 90 ? "right" : "close"] as const)) : null;

  type Exercise = { abc: string; bars: number; meter: string; beatsPerBar: number; beatUnits: number; schedule: ReturnType<typeof gradeSchedule> };
  let exercise: Exercise | null = null;
  let loading = false;
  let problem = "";
  let paper: HTMLDivElement;

  async function write(): Promise<Exercise | null> {
    loading = true;
    problem = "";
    try {
      if (!level.rhythms.length) throw new Error("Choose at least one rhythm.");
      const r = roundParams(level, levelId === "custom" ? { bars, bpm, ties: own.ties, syllables: own.syllables } : { bars, bpm });
      const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r.params) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Could not write a rhythm.");
      const abc: string = data.data[0];
      return { abc, bars, meter: r.meter, beatsPerBar: r.beatsPerBar, beatUnits: beatUnitOf(r.meter), schedule: gradeSchedule(abc) };
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not write a rhythm.";
      return null;
    } finally {
      loading = false;
    }
  }

  async function draw() {
    await tick();
    if (!paper || !exercise) return;
    // The still lane sits under each line of music: room for it under every line.
    const still = laneMode === "still";
    // Every line as wide as the first, so a last line of two bars is not drawn half width.
    const head = `%%stretchlast 1${still ? `\n%%staffsep ${STILL_STAFFSEP}` : ""}`;
    const abc = exercise.abc.replace(/^(X:.*)$/m, `$1\n${head}`);
    // A phone held upright: one bar to a line, drawn narrower so it is scaled
    // up about twice as big (two bars to a line left sixteenths too small to
    // read or to tap). Not with the scrolling lane, which lines up under one line.
    narrow = laneMode !== "scroll" && paper.clientWidth < NARROW_PX;
    const layout = narrow ? { staffwidth: 300, wrap: { minSpacing: 1.2, maxSpacing: 2.7, preferredMeasuresPerLine: 1 } } : { staffwidth: 520, ...roundLayout(exercise.bars) };
    abcjs.renderAbc(paper, abc, { responsive: "resize", scale: 1.6, paddingtop: 10, paddingbottom: still ? STILL_PAD : 10, add_classes: true, ...layout });
    drawnCount++;
  }
  const NARROW_PX = 500;
  let narrow = false;
  /** Turned (a phone on its side, a window resized): draw again when it crosses the narrow line, not mid-round. */
  function onResize() {
    if (!paper || !exercise || running) return;
    if ((laneMode !== "scroll" && paper.clientWidth < NARROW_PX) !== narrow) void draw().then(() => solo && mark(solo.result));
  }
  /** Room for the still lane (RhythmLaneStill.svelte) under each line, in abcjs's units. */
  const STILL_STAFFSEP = 85;
  const STILL_PAD = 34;
  $: laneMode, void draw();
  /** Bumped each time the music is drawn, so the still lane measures it again. */
  let drawnCount = 0;

  /** Each note's mark on the music (rhythm-marks.ts): green right, butter close, red missed. */
  const mark = (result: RhythmScore["result"] | null) => markNotes(paper, result?.notes ?? null);

  // ── Running a round (both modes) ───────────────────────────────────────
  let running = false;
  let word = "";
  let wordTimers: ReturnType<typeof setTimeout>[] = [];
  let clicks: { stop(): void } | null = null;
  let progress = 0;
  let raf = 0;

  /**
   * The count-in's words and the clicks, from `startSec` on the audio clock:
   * "1, 2, Ready, Go" (tapped along with), then the music with the click
   * going on.
   */
  async function runTimeline(ex: Exercise, startSec: number) {
    await loadClicks();
    const beatSec = 60 / bpm;
    const countBeats = countInBarsFor(ex.beatsPerBar) * ex.beatsPerBar;
    const words = countInWordsFor(countBeats);
    const musicBeats = bars * ex.beatsPerBar;
    clicks = bookClicks({ start: startSec, beats: countBeats + musicBeats, beatSec, beatsPerBar: ex.beatsPerBar });
    const ctx = gameAudio();
    const msUntil = (sec: number) => Math.max(0, (sec - ctx.currentTime) * 1000);
    for (let k = 0; k < countBeats; k++) wordTimers.push(setTimeout(() => (word = words[k]), msUntil(startSec + k * beatSec)));
    const musicSec = startSec + countBeats * beatSec;
    const endSec = musicSec + musicBeats * beatSec;
    wordTimers.push(setTimeout(() => (word = ""), msUntil(musicSec)));
    // The lane on the clock the taps are scored by: when a click booked on the
    // audio clock is heard, in page time (audioToPage, as scoring uses).
    const musicPageMs = audioToPage(ctx)(musicSec);
    const step = () => {
      progress = Math.max(0, Math.min(1, (ctx.currentTime - musicSec) / (endSec - musicSec)));
      // The lane, in beats from the first note (negative through the count-in), on the clicks' own clock.
      const beatNow = (performance.now() - musicPageMs) / (beatSec * 1000);
      lane?.set(beatNow);
      follow(beatNow);
      if (ctx.currentTime < endSec + beatSec && running) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    void followStart();
    return endSec;
  }
  function stopTimeline() {
    running = false;
    clicks?.stop();
    clicks = null;
    wordTimers.forEach(clearTimeout);
    wordTimers = [];
    cancelAnimationFrame(raf);
    lane?.set(null);
    word = "";
  }
  onDestroy(() => {
    stopTimeline();
    stopPoll();
  });

  // ── On this device ─────────────────────────────────────────────────────
  let taps: number[] = [];
  /** Each tap's press and release, to grade holding the long notes (game-score.ts gradeHolds). */
  let presses: Press[] = [];
  let solo: RhythmScore | null = null;
  let round: RhythmRound | null = null;
  let soloTotal = 0;
  let rounds = 0;

  async function soloNew() {
    stopTimeline();
    solo = null;
    exercise = await write();
    await draw();
    mark(null);
  }

  async function soloPlay() {
    if (!exercise || running) return;
    solo = null;
    mark(null);
    taps = [];
    presses = [];
    const ex = exercise;
    const ctx = gameAudio();
    const startSec = ctx.currentTime + 0.4;
    running = true;
    const endSec = await runTimeline(ex, startSec);
    // Everything on this page's clock (performance.now), the taps' own.
    const toPage = audioToPage(ctx);
    round = { bpm, meter: ex.meter, beatsPerBar: ex.beatsPerBar, bars, at: toPage(startSec) };
    setTimeout(() => {
      if (!running || !round) return;
      stopTimeline();
      solo = scoreRhythm({ round, schedule: ex.schedule, beatUnits: ex.beatUnits, taps, presses, strictness, deviceLagMs: $tuner.tapLatencyMs });
      soloTotal += solo.points;
      if (assignment) void reportGameRound(assignment, solo.points).then((p) => p && (assignmentProgress = p));
      rounds++;
      mark(solo.result);
      void showResult();
    }, (endSec - ctx.currentTime) * 1000 + 500);
  }

  function onTap(t: number) {
    if (!running || mode !== "solo") return;
    taps = [...taps, t];
    presses = [...presses, { t, up: null }];
  }
  /** The tap let go: the last press still down comes up. */
  function onRelease(t: number) {
    const open = presses.findLast((p) => p.up === null);
    if (open && t >= open.t) open.up = t;
  }
  function onKeyUp(e: KeyboardEvent) {
    if ((e.code === "Space" || e.key === " ") && mode === "solo") onRelease(e.timeStamp);
  }

  /**
   * The Tap pad (TapPad.svelte), remembered in this browser (Blaine, 19
   * November 2026: "add a way to hide it or make it smaller if people just
   * want to use their spacebar"): big, small, or hidden (the spacebar only).
   */
  type PadSize = "big" | "small" | "hidden";
  const PAD_KEY = "sr-tap-pad";
  let padSize: PadSize = (() => {
    try {
      const v = localStorage.getItem(PAD_KEY);
      return v === "small" || v === "hidden" ? v : "big";
    } catch { return "big"; }
  })();
  function setPad(size: PadSize) {
    padSize = size;
    try { localStorage.setItem(PAD_KEY, size); } catch {}
  }
  /** Each note's length in beats on its bar in the lane (Blaine: "a way to show beat values on the bars"), remembered. */
  const BEATS_KEY = "sr-rhythm-beats";
  let showBeats = (() => { try { return localStorage.getItem(BEATS_KEY) === "1"; } catch { return false; } })();
  function toggleBeats() {
    showBeats = !showBeats;
    try { localStorage.setItem(BEATS_KEY, showBeats ? "1" : "0"); } catch {}
  }
  const PAD_SIZES: [PadSize, string][] = [["big", "Big"], ["small", "Small"], ["hidden", "Hidden"]];

  /**
   * The page follows the music a line at a time, as the practice pages do
   * (Blaine, 20 November 2026: "like our regular rhythm reading where it auto
   * scrolls on line"): as a round starts, the first line (with the count-in's
   * word over it) comes up clear of the Tap pad ("scroll so the tap bar is out
   * of the way of the rhythm", 19 November); a beat before a line ends the
   * next one is brought on screen if it fits beside it, and as it starts it
   * is brought fully on. The lines and their beats are read from the drawing
   * (`drawnLines`), as the still lane's rows are. The page has room below
   * while a round runs (`.rhythm.playing`), so the last line can rise.
   */
  let lines: { line: number; from: number; to: number }[] = [];
  let lineNow = -1;
  let lineAhead = -1;
  type Box = { top: number; bottom: number };
  const boxOf = (rects: DOMRect[]): Box | null => (rects.length ? { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) } : null);
  /** Line i on screen: the line and the lane under it, and with what is nice to show too (the count-in's word over the first line). */
  function lineBox(i: number): { core: Box; all: Box } | null {
    const l = lines[i];
    if (!paper || !l) return null;
    const rects = [...paper.querySelectorAll(`.abcjs-l${l.line}`)].map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
    // The still lane's row under the line, or the scrolling lane under the music.
    const row = document.querySelectorAll(".stage [data-still-lane] .row")[i];
    if (row) rects.push(row.getBoundingClientRect());
    const strip = document.querySelector(".stage [data-rhythm-lane]:not([data-still-lane])");
    if (strip) rects.push(strip.getBoundingClientRect());
    const core = boxOf(rects);
    if (!core) return null;
    const stage = i === 0 ? document.querySelector(".rhythm .stage") : null;
    const all = stage ? boxOf([...rects, stage.getBoundingClientRect()])! : core;
    return { core, all };
  }
  /** How far to scroll to show line i between the top and the pad: with its extras if they fit, the line alone if not, its top first when even that cannot fit; `keepTop` is not scrolled off the top. */
  function scrollFor(i: number, keepTop: number | null = null) {
    const b = lineBox(i);
    if (!b) return 0;
    const pad = document.querySelector(".tap-pad");
    const top = 8;
    const bottom = (pad ? pad.getBoundingClientRect().top : window.innerHeight) - 12;
    const fits = (x: Box) => x.bottom - x.top <= bottom - top;
    const box = fits(b.all) ? b.all : b.core;
    let by = 0;
    if (!fits(box) || box.top < top) by = box.top - top;
    else if (box.bottom > bottom) by = box.bottom - bottom;
    if (keepTop !== null && by > keepTop - top) by = Math.max(0, keepTop - top);
    return by;
  }
  function scrollPage(by: number) {
    if (Math.abs(by) < 4) return;
    window.scrollBy({ top: by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  async function followStart() {
    await tick();
    lines = drawnLines(paper, exercise ? exercise.bars * exercise.beatsPerBar : 0, exercise?.beatsPerBar ?? 4);
    lineNow = 0;
    lineAhead = -1;
    requestAnimationFrame(() => scrollPage(scrollFor(0)));
  }
  /** Each frame of a round, from the beat (negative in the count-in). */
  function follow(beat: number) {
    if (lines.length < 2 || beat < 0) return;
    const i = lines.findIndex((l) => beat >= l.from && beat < l.to);
    if (i < 0) return;
    if (i !== lineNow) {
      lineNow = i;
      scrollPage(scrollFor(i));
    } else if (i + 1 < lines.length && lineAhead !== i + 1 && beat >= lines[i]!.to - 1) {
      lineAhead = i + 1;
      scrollPage(scrollFor(i + 1, lineBox(i)?.core.top ?? null));
    }
  }
  /** After a round: the marked music and the score both on screen, as far as they fit. */
  async function showResult() {
    await tick();
    const stage = document.querySelector(".rhythm .stage");
    const result = document.querySelector(".rhythm .result");
    if (!stage || !result) return;
    const s = stage.getBoundingClientRect();
    const r = result.getBoundingClientRect();
    const by = r.bottom - s.top > window.innerHeight - 16 ? r.bottom - window.innerHeight + 8 : r.bottom > window.innerHeight - 8 ? r.bottom - window.innerHeight + 8 : s.top < 8 ? s.top - 8 : 0;
    scrollPage(by);
  }

  // ── Full screen ────────────────────────────────────────────────────────
  /**
   * Full screen, as on the practice pages (src/lib/fullscreen.ts; F, Esc):
   * the music alone, as wide as the screen and drawn bigger, the setup and the
   * site around it hidden (`.focus-hide`), for a TV or a projector.
   */
  let full = false;
  let fs: ReturnType<typeof createFullscreen> | null = null;
  onMount(() => {
    fs = createFullscreen();
    // F before there is a rhythm would hide everything with no Exit button to press: not yet.
    const off = fs.active.subscribe((v) => {
      full = v;
      if (v && !exercise) fs?.exit();
    });
    return () => {
      off();
      fs?.destroy();
    };
  });

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
    if ((e.code === "Space" || e.key === " ") && !e.repeat && running && mode === "solo") {
      e.preventDefault();
      onTap(e.timeStamp);
    }
  }

  // ── With the class ─────────────────────────────────────────────────────
  let room: HostRoom | null = null;
  let hostProblem = "";
  let upgrade = false;
  let signIn = false;
  let opening = false;
  let offset = 0;
  let game: LiveGame | null = null;
  let board: BoardRow[] = [];
  let answerCount = 0;
  let roomScore: number | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Setup (GameHost): rounds in the game, null endless; teams, 0 off; who is in the room. */
  let total: number | null = 10;
  let teamCount = 0;
  let joined: string[] = [];
  /** Each device's made-up name by tag, from the answers: where a removed name goes. */
  const fallbacks = new Map<string, string>();
  const serverNow = () => Date.now() + offset;

  async function host() {
    opening = true;
    hostProblem = "";
    const r = await openRoom();
    opening = false;
    if ("problem" in r) {
      hostProblem = r.problem;
      upgrade = !!r.upgrade;
      signIn = !!r.signIn;
      return;
    }
    room = r.room;
    strictness = "easy";
    offset = await measureOffset();
    await newGame();
  }

  /** A new game in the room: the board cleared, setup open again (the room's answers are cleared too). */
  async function newGame() {
    if (!room) return;
    stopPoll();
    board = [];
    roomScore = null;
    game = { kind: "rhythm", round: newRound(), number: 0, phase: "lobby", board, total, blocked: game?.blocked };
    await publishGame(room.code, game);
  }

  async function block(name: string) {
    if (!room || !game) return;
    const out = blockName(game, board, name, fallbacks);
    board = out.board;
    game = { ...game, blocked: out.blocked, teams: out.teams ?? game.teams, board };
    await publishGame(room.code, game);
  }

  /** The lead every device gets to hear of a round before its count-in starts. */
  const LEAD_MS = 4000;

  async function hostRound() {
    if (!room || !game) return;
    stopPoll();
    roomScore = null;
    answerCount = 0;
    const ex = await write();
    if (!ex) return;
    exercise = ex;
    await draw();
    mark(null);
    const at = serverNow() + LEAD_MS;
    const r: RhythmRound = { bpm, meter: ex.meter, beatsPerBar: ex.beatsPerBar, bars, at };
    const teams = game.number === 0 ? teamsForStart(game, joined, teamCount) : game.teams;
    game = {
      kind: "rhythm",
      round: newRound(),
      number: game.number + 1,
      phase: "playing",
      rhythm: r,
      board,
      total: game.number === 0 ? total : game.total,
      blocked: game.blocked,
      teams,
    };
    if (!(await publishGame(room.code, game))) {
      problem = "Could not start the round. Check the connection and try again.";
      return;
    }
    // The server's moment on this page's audio clock.
    const ctx = gameAudio();
    const startSec = ctx.currentTime + (at - serverNow()) / 1000;
    running = true;
    await runTimeline(ex, startSec);
    const t = rhythmTimes(r);
    setTimeout(async () => {
      if (!running || !game || !room) return;
      stopTimeline();
      game = { ...game, phase: "answering" };
      await publishGame(room.code, game);
      const until = Date.now() + 5000;
      pollTimer = setInterval(async () => {
        if (!room || !game) return;
        const [got, joined] = await Promise.all([fetchAnswers(room.code, game.round), fetchPlayers(room.code)]);
        answerCount = got.length;
        if (Date.now() > until || (got.length > 0 && got.length >= joined.length)) await scoreRound();
      }, 1000);
    }, t.endAt - serverNow() + 600);
  }

  async function scoreRound() {
    if (!room || !game?.rhythm || !exercise || game.phase !== "answering") return;
    stopPoll();
    const r = game.rhythm;
    const ex = exercise;
    const got = await fetchAnswers(room.code, game.round);
    const t = rhythmTimes(r);
    const lags = got.map((a) => countInLag((a.answer as RhythmAnswer).taps, t.tapClicks, t.beatMs).lag);
    const room0 = roomLag(lags);
    const scored = got.map((a) => {
      fallbacks.set(a.tag, a.fallback);
      const score = scoreRhythm({ round: r, schedule: ex.schedule, beatUnits: ex.beatUnits, taps: (a.answer as RhythmAnswer).taps, strictness, roomLagMs: room0 });
      return { tag: a.tag, name: a.name, fallback: a.fallback, points: score.points, notes: score.result.notes };
    });
    roomScore = scored.length ? Math.round(scored.reduce((s, x) => s + x.points, 0) / scored.length) : null;
    // The class's share right on each note, on the big screen's music.
    markShares(paper, noteShares(scored.map((x) => x.notes)));
    const out = afterRound(game, board, scored);
    board = out.board;
    // The rhythm goes back to every device with how it was scored, so each
    // marks its own taps on it (LiveGame), with nothing more sent in.
    game = {
      ...game,
      phase: "results",
      board,
      teams: out.teams ?? game.teams,
      rhythm: { ...r, review: { abc: ex.abc, strictness, roomLag: room0, beatUnits: ex.beatUnits } },
    };
    await publishGame(room.code, game);
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // For the end-to-end check (scripts/check-games.ts): the round as the big screen holds it. Development builds only.
  if (import.meta.env.DEV && typeof window !== "undefined")
    (window as any).__rhythmGame = {
      get game() { return game; },
      get exercise() { return exercise; },
      get board() { return board; },
      get solo() { return solo; },
      get round() { return round; },
    };

  async function endGame() {
    stopPoll();
    stopTimeline();
    if (room) await closeRoom(room.code);
    room = null;
    game = null;
    mode = "solo";
  }
</script>

<svelte:window on:keydown={onKey} on:keyup={onKeyUp} on:resize={onResize} />

<div class="rhythm" class:playing={running} class:full>
  <div class="tabs focus-hide" role="tablist" aria-label="How to play">
    <button role="tab" class="sr-tok" class:sr-on={mode === "solo"} aria-selected={mode === "solo"} on:click={() => (room ? null : (mode = "solo"))} disabled={!!room}>On this device</button>
    <button role="tab" class="sr-tok" class:sr-on={mode === "class"} aria-selected={mode === "class"} on:click={() => (mode = "class")}>With your class</button>
  </div>

  <div class="setup focus-hide">
  {#if assignment}
    <GameAssignmentBanner {assignment} progress={assignmentProgress ?? assignment.progress} />
  {:else}
  <GameLevels
    game="rhythm"
    levels={levelCards}
    selected={levelId === "custom" ? -1 : RHYTHM_LEVELS.findIndex((l) => l.id === levelId)}
    disabled={running}
    on:select={(e) => (levelId = e.detail < 0 ? "custom" : RHYTHM_LEVELS[e.detail].id)}
  >
    <div slot="custom">
      {#if running}<p class="text-sm text-sr-muted">Your own rhythms: {own.meters.join(", ")}.</p>
      {:else}<RhythmSetup bind:meters={own.meters} bind:rhythms={own.rhythms} bind:ties={own.ties} bind:syllables={own.syllables} />{/if}
    </div>
  <div class="opts" class:locked={running}>
    <fieldset class="grp" disabled={running}>
      <legend>The round</legend>
      <div class="opt">
        <span class="opt-l" id="opt-bars">Bars</span>
        <div class="seg" role="radiogroup" aria-labelledby="opt-bars">
          {#each GAME_BARS as b}<label><input type="radio" name="rg-bars" value={b} bind:group={bars} data-bars={b} /><span>{b}</span></label>{/each}
        </div>
      </div>
      <div class="opt">
        <label class="opt-l" for="opt-tempo">Tempo</label>
        <select id="opt-tempo" class="sel" bind:value={bpm}>{#each GAME_TEMPOS as b}<option value={b}>♩ = {b}</option>{/each}</select>
      </div>
      <div class="opt">
        <span class="opt-l" id="opt-grading">Grading</span>
        <div class="seg" role="radiogroup" aria-labelledby="opt-grading">
          {#each Object.entries(STRICTNESS) as [id, s]}<label><input type="radio" name="rg-strict" value={id} bind:group={strictness} data-strictness={id} /><span>{s.label}</span></label>{/each}
        </div>
      </div>
    </fieldset>
    <fieldset class="grp" disabled={running}>
      <legend>On screen</legend>
      <div class="opt">
        <span class="opt-l" id="opt-lane">Lane</span>
        <div class="seg" role="radiogroup" aria-labelledby="opt-lane">
          {#each LANE_MODES as [m, label]}<label><input type="radio" name="rg-lane" value={m} checked={laneMode === m} on:change={() => setLane(m)} data-lane-mode={m} /><span>{label}</span></label>{/each}
        </div>
      </div>
      <div class="opt">
        <span class="opt-l" id="opt-pad">Tap pad</span>
        <div class="seg" role="radiogroup" aria-labelledby="opt-pad">
          {#each PAD_SIZES as [size, label]}<label><input type="radio" name="rg-pad" value={size} checked={padSize === size} on:change={() => setPad(size)} data-pad-size={size} /><span>{label}</span></label>{/each}
        </div>
      </div>
      <label class="chk"><input type="checkbox" checked={showBeats} on:change={toggleBeats} disabled={laneMode === "off"} data-show-beats /> Write the beats on each bar</label>
    </fieldset>
  </div>
  </GameLevels>
  {#if mode === "solo"}<AssignGame game="rhythm" setup={{ levelId, levelName: level.name, bars, bpm, strictness, ...(levelId === "custom" ? { own } : {}) }} problem={level.rhythms.length ? null : "Choose at least one rhythm."} />{/if}
  {/if}
  </div>

  {#if mode === "class" && !room}
    <div class="sr-panel p-6 flex flex-col items-center gap-3 text-center">
      <p class="font-display text-2xl font-bold">Play it with your class</p>
      <p class="text-sr-ink-2 max-w-md">The big screen shows the rhythm and plays the click. Everyone taps it on their own phone, tablet or laptop at your live code; each device's delay is measured in the count-in and taken off.</p>
      <button class="sr-btn px-6" on:click={host} disabled={opening}>{opening ? "Opening your room…" : "Open my room"}</button>
      {#if hostProblem}
        <p class="text-sm text-sr-danger" role="alert">{hostProblem}</p>
        {#if upgrade}<a class="sr-btn-quiet" href="/pricing">See Pro</a>{/if}
        {#if signIn}<a class="sr-btn-quiet" href="/login?next={encodeURIComponent('/games/rhythm?host=1')}">Sign in</a>{/if}
      {/if}
    </div>
  {:else}
    {#if room}
      <GameHost {room} {game} {board} showBoard={!running && game?.phase !== "answering"} onEnd={endGame} onBlock={block} bind:total bind:teamCount bind:joined>
        <div class="flex flex-wrap items-center justify-center gap-3">
          {#if game?.phase === "answering"}
            <p class="font-bold text-sr-ink-2">Scoring… <span data-answered={answerCount}>{answerCount}</span> sent</p>
          {:else if !running}
            {#if game && isFinal(game)}
              <button class="sr-btn px-8 py-3 text-lg" on:click={newGame} data-game-new>Play again</button>
            {:else}
              <button class="sr-btn px-8 py-3 text-lg" on:click={hostRound} disabled={loading} data-game-start>{game?.number ? "Next round" : "Start a round"}</button>
            {/if}
            {#if roomScore !== null}<p class="font-display text-xl font-bold" data-room-score={roomScore}>The class: {roomScore}%</p>{/if}
          {/if}
        </div>
        {#if game?.phase === "results"}<p class="text-center text-sm text-sr-muted">On the music: green, most of the class had it; yellow, about half; red, most missed it.</p>{/if}
      </GameHost>
    {:else}
      <div class="flex flex-wrap items-center justify-center gap-3">
        {#if !exercise}
          <button class="sr-btn px-8 py-3 text-lg" on:click={soloNew} disabled={loading}>{loading ? "Writing…" : "New rhythm"}</button>
        {:else if !running}
          <button class="sr-btn px-8 py-3 text-lg" on:click={soloPlay} data-game-play>{solo ? "Try again" : "Play"}</button>
          <button class="sr-btn-quiet" on:click={soloNew} disabled={loading}>New rhythm</button>
        {/if}
        {#if rounds}<span class="score-pill" aria-label="Average">{Math.round(soloTotal / rounds)}% over {rounds}</span>{/if}
      </div>
    {/if}

    {#if problem}<p class="text-center text-sm text-sr-danger" role="alert">{problem}</p>{/if}
    {#if exercise}<p class="how focus-hide">Tap along with the count-in (1, 2, Ready, Go), then tap the rhythm. Hold each long note down{padSize === "hidden" ? " (the spacebar)" : ""}.</p>{/if}

    <div class="stage" class:hidden={!exercise}>
      <button type="button" class="fs-btn" on:click={() => fs?.toggle()} aria-pressed={full} title={full ? "Leave full screen (Esc)" : "Full screen (F)"} aria-label={full ? "Leave full screen" : "Full screen"} data-full-screen>
        {#if full}<Minimize size={18} aria-hidden="true" /><span class="fs-txt">Exit</span>{:else}<Maximize size={18} aria-hidden="true" /><span class="fs-txt">Full screen</span>{/if}
      </button>
      {#if word}<div class="word" aria-live="assertive"><span class:go={word === "Go"}>{word}</span></div>{/if}
      <div class="music">
        <div class="paper" bind:this={paper}></div>
        {#if laneMode === "still" && exercise}
          <RhythmLaneStill bind:this={lane} notes={laneNotes} rests={laneRests} totalBeats={exercise.bars * exercise.beatsPerBar} beatsPerBar={exercise.beatsPerBar} marks={laneMarks} {paper} drawn={drawnCount} beats={showBeats} />
        {/if}
      </div>
      {#if laneMode === "scroll" && exercise}
        <RhythmLane bind:this={lane} notes={laneNotes} rests={laneRests} totalBeats={exercise.bars * exercise.beatsPerBar} beatsPerBar={exercise.beatsPerBar} countBeats={countInBarsFor(exercise.beatsPerBar) * exercise.beatsPerBar} marks={laneMarks} fit={!running} {paper} drawn={drawnCount} beats={showBeats} />
      {:else if laneMode === "off"}
        <div class="bar" aria-hidden="true"><span style="width: {progress * 100}%"></span></div>
      {/if}
    </div>

    {#if solo}
      <div class="result sr-panel" data-solo-score={solo.points}>
        <span class="font-display text-5xl font-bold tabular-nums">{solo.points}%</span>
        <span class="text-sr-ink-2 font-bold">{solo.result.beatsRight} of {solo.result.beats} beats right</span>
        {#if solo.short?.length}
          <span class="short-note" data-held-short={solo.short.length}>{solo.short.length === 1 ? "1 long note was" : `${solo.short.length} long notes were`} let go too soon. Hold a half note at least a beat, a dotted half two.</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#if running && mode === "solo" && padSize !== "hidden"}
  <TapPad {onTap} {onRelease} size={padSize === "small" ? "small" : "big"} low />
{/if}

<style>
  .rhythm { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
  .tabs { display: flex; gap: 0.5rem; justify-content: center; }
  /* The options (Blaine, 20 November 2026: "fix the interface to pick the
     options"): two labelled groups, the round's (what an assignment sets) and
     this screen's, each choice a row of native radios drawn as one pill. */
  .opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 0.75rem; }
  .grp { container: grp / inline-size; display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; margin: 0; padding: 0.75rem 0.9rem 0.85rem; border: 1px solid var(--sr-hairline); border-radius: 18px; background: var(--sr-paper, var(--sr-bg)); }
  .grp legend { float: left; width: 100%; margin-bottom: 0.1rem; font-family: var(--sr-font-display); font-weight: 800; font-size: 0.95rem; color: var(--sr-ink); }
  .grp legend + * { clear: both; }
  .grp:disabled { opacity: 0.6; }
  .opt { display: grid; grid-template-columns: 4.5rem 1fr; align-items: center; gap: 0.6rem; }
  .opt-l { font-weight: 700; font-size: 0.9rem; color: var(--sr-ink-2); }
  .seg { display: flex; gap: 0.2rem; max-width: 100%; padding: 0.2rem; border-radius: 999px; background: var(--sr-track); justify-self: start; }
  .seg label { position: relative; display: inline-flex; }
  .seg input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
  .seg span { display: inline-flex; align-items: center; justify-content: center; min-height: 2.25rem; min-width: 2.75rem; padding: 0 0.85rem; border-radius: 999px; font-weight: 700; font-size: 0.9rem; color: var(--sr-ink-2); white-space: nowrap; }
  .seg label:hover span { color: var(--sr-ink); }
  .seg input:checked + span { background: var(--sr-action); color: var(--sr-action-ink); box-shadow: 0 1px 2px color-mix(in srgb, var(--sr-ink) 25%, transparent); }
  .seg input:focus-visible + span { outline: 3px solid var(--sr-action); outline-offset: 2px; }
  .sel { justify-self: start; min-height: 2.5rem; border-radius: 999px; padding: 0.3rem 0.9rem; border: 1px solid var(--sr-hairline-2, var(--sr-hairline)); background: var(--sr-raise); color: var(--sr-ink); font: inherit; font-weight: 700; }
  .chk { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.25rem; font-weight: 700; font-size: 0.9rem; color: var(--sr-ink-2); cursor: pointer; }
  .chk input { width: 1.15rem; height: 1.15rem; accent-color: var(--sr-action); }
  .chk:has(input:disabled) { opacity: 0.5; cursor: default; }
  @media (pointer: coarse) {
    .seg span, .chk, .sel { min-height: 44px; }
  }
  /* Narrow (a phone): each label over its choices, the choices sharing the width in one row. */
  @container grp (width < 24rem) {
    .opt { grid-template-columns: 1fr; gap: 0.3rem; }
    .seg { justify-self: stretch; }
    .seg label { flex: 1 1 auto; }
    .seg span { width: 100%; min-width: 0; padding: 0 0.5rem; font-size: 0.85rem; }
  }
  /* The smallest phones: the choices may take a second row rather than run out of the box. */
  @container grp (width < 17rem) {
    .seg { flex-wrap: wrap; border-radius: 18px; }
  }
  /* Room at the top for Full screen and the count-in's word, clear of the music. */
  .stage { position: relative; background: #fff; border-radius: 28px; padding: 3.25rem 1rem 1rem; }
  .stage.hidden { display: none; }
  .music { position: relative; }
  .word { position: absolute; top: 0.6rem; left: 50%; transform: translateX(-50%); z-index: 2; }
  .word span { display: inline-block; font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.8rem; background: var(--sr-sky); color: var(--sr-sky-ink); border-radius: 999px; padding: 0.2rem 1.2rem; }
  .word span.go { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .setup { display: flex; flex-direction: column; gap: 1rem; }
  /* Room below while a round runs, so the last line can rise above the pad. */
  .rhythm.playing { padding-bottom: 70vh; }
  .fs-btn { position: absolute; top: 0.6rem; right: 0.75rem; z-index: 3; display: inline-flex; align-items: center; gap: 0.35rem; min-height: 2.25rem; padding: 0 0.8rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; color: var(--sr-ink-2); background: var(--sr-track); }
  .fs-btn:hover { color: var(--sr-ink); }
  @media (pointer: coarse) { .fs-btn { min-height: 44px; min-width: 44px; justify-content: center; } }
  /* A phone: the icon alone, clear of the count-in's word in the middle. */
  @media (max-width: 30rem) { .fs-txt { display: none; } .fs-btn { padding: 0 0.6rem; } }
  /* Full screen: the music as wide as the screen (abcjs draws it to its box). */
  .rhythm.full { max-width: none; }
  .rhythm.full .stage { padding: 3rem 2rem 1.5rem; }
  .rhythm.full { padding-bottom: 1.5rem; }
  .rhythm.full.playing { padding-bottom: 70vh; }
  .short-note { max-width: 28rem; text-align: center; font-weight: 700; color: var(--sr-butter-ink); background: var(--sr-butter); border-radius: 14px; padding: 0.4rem 0.8rem; }
  .how { text-align: center; font-weight: 700; color: var(--sr-ink-2); }
  .bar { height: 6px; border-radius: 999px; background: var(--sr-track); overflow: hidden; margin-top: 0.5rem; }
  .bar span { display: block; height: 100%; background: var(--sr-action); }
  .result { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; padding: 1rem; }
  .score-pill { font-weight: 800; background: var(--sr-mint); color: var(--sr-mint-ink); border-radius: 999px; padding: 0.3rem 0.9rem; }
  .paper :global(.g-right) { fill: #2fb383; }
  .paper :global(.g-close) { fill: #e0a100; }
  .paper :global(.g-miss) { fill: #e5484d; }
</style>
