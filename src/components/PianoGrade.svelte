<script lang="ts">
  /**
   * Play and grade on a MIDI keyboard (src/lib/piano/grade-piano.ts, midi.ts):
   * a count-in and a click, the exercise played through in time, then each
   * written note matched to a key. Marks go on the score: green right, orange
   * early or late, red missed; blue the notes sounding now, the page
   * following them line by line. In time only: a pianist reads at a tempo,
   * and Note by note was taken off (Blaine, 9 October 2026). Pro, as grading
   * is on the Unison page.
   *
   * The keys sound through the grand piano the exercise plays on (piano-voice.ts;
   * Piano sound on or off beside the keyboard, for a digital piano that makes
   * its own), every take is kept (keys down and up), and Hear it back plays it
   * with or without the click, the score marking and following as it goes.
   * Stop silences everything: the click, the piano and the run.
   */
  import { onDestroy } from "svelte";
  import { beatsOf, beatUnitOf } from "../lib/meter";
  import { countInMeasures, showCountIn, hideCountIn } from "../lib/count-in";
  import { billingStatus } from "../lib/billing-client";
  import { connectMidi, midiProblem, type MidiConnection, type MidiKey } from "../lib/piano/midi";
  import { createFollower } from "../lib/piano/follow";
  import {
    expectedNotes,
    gradeInTime,
    midiName,
    PIANO_STRICTNESS,
    type ExpectedNote,
    type Hand,
    type PianoResult,
    type PianoStrictness,
    type PlayedNote,
  } from "../lib/piano/grade-piano";
  import type { PianoExercise } from "../lib/piano/generatePiano";
  import { PianoVoice } from "../lib/piano/piano-voice";
  import { noteElements } from "../lib/piano/score-elements";
  import { anchorsFrom, createScroller, noteStarts } from "../lib/piano/scroller";

  export let exercise: PianoExercise | null = null;
  /** The drawn score (abcjs's tune object), to find each note on the page. */
  export let tune: any = null;
  /** The page's tempo. */
  export let bpm = 72;
  /** Stop the page's own playback before a run. */
  export let onStart: () => void = () => {};

  const STRICT_CHOICES = Object.entries(PIANO_STRICTNESS) as [PianoStrictness, { label: string }][];
  let open = false;
  let strictness: PianoStrictness = "easy";
  let click = true;
  let allowed: boolean | null = null;
  let midi: MidiConnection | null = null;
  let keyboards: string[] = [];
  let midiError = "";
  let running: "" | "countin" | "playing" | "replay" = "";
  let status = "";
  let result: PianoResult | null = null;
  let down = new Set<number>();

  let expected: ExpectedNote[] = [];
  let played: PlayedNote[] = [];
  const follower = createFollower();
  const problem = midiProblem();
  let t0 = 0;
  let endAt = 0;
  let raf = 0;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let audio: AudioContext | null = null;
  /** The keys as they are pressed, and the take played back: two voices, so muting the keys leaves the take. */
  let keysVoice: PianoVoice | null = null;
  let takeVoice: PianoVoice | null = null;
  /** Every click scheduled, so Stop can silence the ones still to come. */
  let clicks: OscillatorNode[] = [];
  /** One scrolling line moves continuously with the run or the take (scroller.ts). */
  let scroller: ReturnType<typeof createScroller> | null = null;
  function scrollWith(clock: () => number | null) {
    const box = document.getElementById("paper-box");
    const svg = box?.querySelector("svg");
    if (!exercise || !box || !svg || !box.classList.contains("scroll-line")) return;
    scroller ??= createScroller(box);
    const total = exercise.rh.reduce((s, n) => s + n.length, 0);
    scroller.start(anchorsFrom(noteStarts({ rh: exercise.rh, lh: exercise.lh }), els, svg, total), clock);
  }
  /** The run's keys, down and up, on the performance.now() clock. */
  let take: { midi: number; velocity: number; down: boolean; t: number }[] = [];
  let takeClick = true;
  let countInMs = 0;
  const SOUND_KEY = "piano-key-sound";
  let keySound = true;
  try { keySound = localStorage.getItem(SOUND_KEY) !== "off"; } catch {}
  function setKeySound(on: boolean) {
    keySound = on;
    if (keysVoice) keysVoice.muted = !on;
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch {}
  }

  /** The page's sound: made on a click (a browser starts sound only then), shared by the click, the keys and the take. */
  async function ensureAudio(): Promise<boolean> {
    audio ??= new AudioContext();
    keysVoice ??= new PianoVoice(audio);
    takeVoice ??= new PianoVoice(audio);
    keysVoice.muted = !keySound;
    await Promise.race([audio.resume(), new Promise((r) => setTimeout(r, 1500))]);
    return audio.state === "running";
  }

  // A new exercise clears the marks and any run.
  $: exercise, stopRun(), clearMarks(), (result = null), (take = []);

  // ── The notes on the page ─────────────────────────────────────────────────
  let els: Record<Hand, Element[][]> = { rh: [], lh: [] };
  const MARKS = ["pg-right", "pg-off", "pg-miss", "pg-now"];
  function mark(n: { hand: Hand; index: number }, cls: string) {
    for (const e of els[n.hand][n.index] ?? []) {
      e.classList.remove(...MARKS);
      if (cls) e.classList.add(cls);
    }
  }
  function clearMarks() {
    for (const hand of ["rh", "lh"] as Hand[]) for (const set of els[hand]) for (const e of set) e.classList.remove(...MARKS);
  }

  // ── The keyboard ──────────────────────────────────────────────────────────
  async function connect() {
    midiError = "";
    try {
      midi?.stop();
      midi = await connectMidi(onKey, (names) => (keyboards = names));
      keyboards = midi.inputs();
      if (!keyboards.length) midiError = "No keyboard found. Plug one in by USB or Bluetooth MIDI; it is picked up when it appears.";
    } catch (e) {
      midiError = e instanceof Error ? e.message : String(e);
    }
  }

  function onKey(k: MidiKey) {
    if (k.down) down.add(k.midi);
    else down.delete(k.midi);
    down = down;
    if (keysVoice && audio?.state === "running") {
      if (k.down) keysVoice.noteOn(k.midi, k.velocity);
      else keysVoice.noteOff(k.midi);
    }
    if (running === "countin" || running === "playing") take.push(k);
    if (!k.down) return;
    if (running === "countin" || running === "playing") played.push({ midi: k.midi, t: k.t });
  }

  // ── Opening ───────────────────────────────────────────────────────────────
  async function openGrade() {
    open = true;
    if (allowed === null) {
      // The dev server has no billing: grading is open there, to try it.
      if (import.meta.env.DEV) allowed = true;
      else {
        const s = await billingStatus();
        allowed = !!s && s.plan !== "free";
      }
    }
    if (allowed && !midi && !problem) await connect();
    // Opened with a click: the time to start the page's sound, so the keys play at once.
    if (allowed && (await ensureAudio()) && exercise) void keysVoice?.preload(expectedNotes(exercise).map((n) => n.midi));
  }

  // ── In time ───────────────────────────────────────────────────────────────
  function tick(at: number, accent: boolean) {
    if (!audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g).connect(audio.destination);
    o.start(at);
    o.stop(at + 0.08);
    clicks.push(o);
  }

  async function startInTime() {
    if (!exercise) return;
    const meter = exercise.meter;
    const beatUnits = beatUnitOf(meter);
    const perBar = beatsOf(meter);
    const countIn = countInMeasures(meter) * perBar;
    const beatSec = 60 / bpm;
    const beats = countIn + exercise.measures * perBar;
    // The browser starts sound only after a click on the page; capped, so a refusal is said rather than waited on.
    if (!(await ensureAudio()) || !audio) {
      status = "The browser kept the sound off. Press Start again.";
      return;
    }
    const startAt = audio.currentTime + 0.3;
    for (let k = 0; k < beats; k++) if (k < countIn || click) tick(startAt + k * beatSec, k % perBar === 0);
    // The player plays with the click as heard, so beat 1 is when it reaches the ear.
    const outMs = ((audio.baseLatency ?? 0) + ((audio as any).outputLatency ?? 0)) * 1000;
    t0 = performance.now() + (startAt - audio.currentTime) * 1000 + countIn * beatSec * 1000 + outMs;
    endAt = t0 + exercise.measures * perBar * beatSec * 1000 + beatSec * 1000;
    countInMs = countIn * beatSec * 1000;
    played = [];
    take = [];
    running = "countin";
    status = "";
    const unitMs = (beatSec * 1000) / beatUnits;
    const loop = () => {
      const now = performance.now();
      if (now < t0) {
        const beat = Math.floor((now - (t0 - countIn * beatSec * 1000)) / (beatSec * 1000));
        // Beat 0 is the first click, which says "1" (it said each word a beat early).
        if (beat >= 0) showCountIn(meter, beat);
      } else {
        if (running === "countin") {
          running = "playing";
          hideCountIn();
        }
        // The notes sounding now are shown, so the player can see where the beat is, and the page follows them.
        const u = (now - t0) / unitMs;
        const sounding: Element[] = [];
        for (const n of expected) {
          const on = u >= n.start && u < n.start + n.length;
          mark(n, on ? "pg-now" : "");
          if (on) sounding.push(...(els[n.hand][n.index] ?? []));
        }
        follower.follow(sounding);
      }
      if (now >= endAt) clearInterval(raf);
    };
    // A short timer rather than the frame loop: it keeps marking (and following) when the page is not being drawn.
    raf = setInterval(loop, 30) as unknown as number;
    scrollWith(() => (performance.now() - t0) / unitMs);
    // Ended by a timer, not the frame loop: a browser stops drawing frames for a page out of sight.
    finishTimer = setTimeout(() => finishInTime(beatUnits), endAt - performance.now());
  }

  function finishInTime(beatUnits: number) {
    clearInterval(raf);
    scroller?.stop();
    if (running !== "countin" && running !== "playing") return;
    for (const n of expected) mark(n, "");
    running = "";
    hideCountIn();
    if (!exercise) return;
    result = gradeInTime(expected, played, { t0, bpm, beatUnits, strictness });
    showResultMarks();
  }

  function showResultMarks() {
    if (!result) return;
    for (const n of result.notes) {
      // A chord's notes share one notehead group: missed beats off, off beats right.
      const worst = result.notes.filter((m) => m.hand === n.hand && m.index === n.index).reduce((w, m) => (rank(m.verdict) > rank(w) ? m.verdict : w), n.verdict);
      mark(n, worst === "right" ? "pg-right" : worst === "missed" ? "pg-miss" : "pg-off");
    }
  }

  // ── Hear it back ──────────────────────────────────────────────────────────
  /**
   * The take as it was played, from the count-in: every key down and up on
   * the page's piano at its own time, the click with it if chosen, the score
   * marking the written notes as they come and following them.
   */
  async function hearItBack() {
    if (!exercise || !take.length) return;
    stopRun();
    if (!(await ensureAudio()) || !audio || !takeVoice) {
      status = "The browser kept the sound off. Press Hear it back again.";
      return;
    }
    await takeVoice.preload(take.map((k) => k.midi));
    const meter = exercise.meter;
    const perBar = beatsOf(meter);
    const beatSec = 60 / bpm;
    const countIn = countInMeasures(meter) * perBar;
    const from = t0 - countInMs; // the take's clock at the count-in's first beat
    const startAt = audio.currentTime + 0.25;
    const at = (t: number) => startAt + (t - from) / 1000;
    for (const k of take) {
      if (k.t < from - 500) continue;
      if (k.down) takeVoice.noteOn(k.midi, k.velocity, at(k.t));
      else takeVoice.noteOff(k.midi, at(k.t));
    }
    const beats = countIn + exercise.measures * perBar;
    for (let b = 0; b < beats; b++) if (b < countIn || takeClick) tick(startAt + b * beatSec, b % perBar === 0);
    // The written notes marked as the take reaches them, on the take's own clock.
    const perfStart = performance.now() + (startAt - audio.currentTime) * 1000;
    const unitMs = (beatSec * 1000) / beatUnitOf(meter);
    const end = endAt;
    running = "replay";
    follower.reset();
    scrollWith(() => (from + (performance.now() - perfStart) - t0) / unitMs);
    document.getElementById("paper")?.scrollIntoView({ behavior: "smooth", block: "start" });
    raf = setInterval(() => {
      const now = from + (performance.now() - perfStart);
      const u = (now - t0) / unitMs;
      const sounding: Element[] = [];
      for (const n of expected) {
        const on = u >= n.start && u < n.start + n.length;
        mark(n, on ? "pg-now" : "");
        if (on) sounding.push(...(els[n.hand][n.index] ?? []));
      }
      follower.follow(sounding);
      if (now >= end) stopRun();
    }, 30) as unknown as number;
  }
  const rank = (v: string) => (v === "missed" ? 2 : v === "right" ? 0 : 1);

  // ── Runs ──────────────────────────────────────────────────────────────────
  async function start() {
    if (!exercise || !tune) return;
    onStart();
    stopRun();
    els = noteElements(tune);
    clearMarks();
    result = null;
    expected = expectedNotes(exercise);
    follower.reset();
    // Start with the score's first line in view: the count-in is the time to find it.
    document.getElementById("paper")?.scrollIntoView({ behavior: "smooth", block: "start" });
    await startInTime();
  }

  /** Stop whatever is going: the run or the take, its clicks still to come, and the take's piano. */
  export function stopRun() {
    clearInterval(raf);
    scroller?.stop();
    clearTimeout(finishTimer);
    for (const o of clicks) {
      try { o.stop(); } catch {}
    }
    clicks = [];
    takeVoice?.stopAll();
    if (running) hideCountIn();
    const wasReplay = running === "replay";
    running = "";
    status = "";
    // After hearing it back, the marks go back to the grade.
    if (wasReplay) {
      for (const n of expected) mark(n, "");
      showResultMarks();
    }
  }

  // Dev only: keys from the console or a test, as a keyboard would send them.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as any).__pianoMidi = {
      press: (m: number) => onKey({ midi: m, velocity: 80, down: true, t: performance.now() }),
      release: (m: number) => onKey({ midi: m, velocity: 0, down: false, t: performance.now() }),
      state: () => ({ running, t0, bpm, expected, played: played.length, take: take.length, clicks: clicks.length, result }),
    };
  }

  onDestroy(() => {
    stopRun();
    keysVoice?.stopAll();
    midi?.stop();
    void audio?.close();
  });

  $: mistakes = result
    ? result.notes
        .filter((n) => n.verdict !== "right")
        .slice(0, 8)
        .map((n) => {
          const bar = Math.floor(n.start / barUnits()) + 1;
          const hand = n.hand === "rh" ? "right hand" : "left hand";
          if (n.verdict === "missed") return `Bar ${bar}, ${hand}: ${midiName(n.midi)} missed${n.playedInstead !== undefined ? ` (${midiName(n.playedInstead)} played)` : ""}`;
          return `Bar ${bar}, ${hand}: ${midiName(n.midi)} ${Math.abs(n.offBeats ?? 0).toFixed(2)} beats ${n.verdict}`;
        })
    : [];
  function barUnits(): number {
    if (!exercise) return 32;
    return beatsOf(exercise.meter) * beatUnitOf(exercise.meter);
  }
  $: early = result?.notes.filter((n) => n.verdict === "early").length ?? 0;
  $: late = result?.notes.filter((n) => n.verdict === "late").length ?? 0;
</script>

<div class="flex flex-wrap items-center gap-2">
  <button type="button" class="sr-btn" on:click={open ? () => (open = false) : openGrade} aria-expanded={open}>Play and grade</button>
  {#if keyboards.length}
    <span class="text-sm text-sr-muted">Keyboard: {keyboards.join(", ")}</span>
    <button
      type="button"
      class="sr-tok text-sm {keySound ? 'sr-on' : ''}"
      aria-pressed={keySound}
      title="The page plays your keys on a piano. Turn it off if your keyboard makes its own sound."
      on:click={() => setKeySound(!keySound)}
    >Piano sound {keySound ? "on" : "off"}</button>
  {/if}
  {#if down.size}
    <span class="text-sm font-bold" aria-live="polite">{[...down].sort((a, b) => a - b).map(midiName).join(" ")}</span>
  {/if}
</div>

{#if open}
  <section class="sr-panel p-4 flex flex-col gap-4" aria-label="Play and grade">
    {#if allowed === false}
      <p class="text-sm">Grading is part of Pro. <a class="sr-link" href="/pricing">See plans</a></p>
    {:else}
      {#if problem}
        <p class="text-sm">{problem}</p>
      {:else if !keyboards.length}
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="sr-btn-quiet" on:click={connect}>Connect a MIDI keyboard</button>
          {#if midiError}<span class="text-sm text-sr-muted">{midiError}</span>{/if}
        </div>
      {/if}
      <div class="flex flex-wrap gap-x-8 gap-y-3">
          <div class="flex flex-col gap-2">
            <span class="sr-label">Timing</span>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Timing">
              {#each STRICT_CHOICES as [id, s]}
                <button type="button" class="sr-tok {strictness === id ? 'sr-on' : ''}" aria-pressed={strictness === id} on:click={() => (strictness = id)}>{s.label}</button>
              {/each}
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <span class="sr-label">Click</span>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="Click">
              <button type="button" class="sr-tok {click ? 'sr-on' : ''}" aria-pressed={click} on:click={() => (click = true)}>Throughout</button>
              <button type="button" class="sr-tok {!click ? 'sr-on' : ''}" aria-pressed={!click} on:click={() => (click = false)}>Count-in only</button>
            </div>
          </div>
      </div>
      <p class="text-xs text-sr-faint">
        A count-in, then play the exercise at {bpm}. Each note is graded for the right key and when it came in; the notes in blue are the ones sounding now.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        {#if running}
          <button type="button" class="sr-btn" on:click={stopRun}>Stop</button>
        {:else}
          <button type="button" class="sr-btn" on:click={start} disabled={!exercise}>{result ? "Again" : "Start"}</button>
          {#if result && take.length}
            <button type="button" class="sr-btn-quiet" on:click={hearItBack}>Hear it back</button>
            <button type="button" class="sr-tok text-sm {takeClick ? 'sr-on' : ''}" aria-pressed={takeClick} on:click={() => (takeClick = !takeClick)}>With the click</button>
          {/if}
        {/if}
        {#if status}<span class="text-sm" aria-live="polite">{status}</span>{/if}
      </div>

      {#if result}
        <div class="flex flex-col gap-2" aria-live="polite">
          <p class="text-2xl font-extrabold">{result.overall}%</p>
          <p class="text-sm">
            Notes {result.notesScore}% · timing {result.timingScore}% ·
            right hand {result.byHand.rh.right} of {result.byHand.rh.notes}, left hand {result.byHand.lh.right} of {result.byHand.lh.notes}
            {#if early || late} · {early} early, {late} late{/if}
            {#if result.extras.length} · {result.extras.length} extra {result.extras.length === 1 ? "key" : "keys"}{/if}
          </p>
          {#if mistakes.length}
            <ul class="text-sm text-sr-muted list-disc pl-5">
              {#each mistakes as m}<li>{m}</li>{/each}
            </ul>
          {/if}
          <p class="text-xs text-sr-faint">On the score: green right, orange early or late, red missed.</p>
        </div>
      {/if}

    {/if}
  </section>
{/if}

<style>
  :global(#paper .pg-right) { fill: #16a34a; }
  :global(#paper .pg-off) { fill: #ea8a00; }
  :global(#paper .pg-miss) { fill: #dc2626; }
  :global(#paper .pg-now) { fill: var(--sr-action); }
</style>
