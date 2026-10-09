<script lang="ts">
  /**
   * Play and grade on a MIDI keyboard (src/lib/piano/grade-piano.ts, midi.ts):
   * a count-in and a click, the exercise played through in time, then each
   * written note matched to a key. Marks go on the score: green right, orange
   * early or late, red missed; blue the notes sounding now, the page
   * following them line by line. In time only: a pianist reads at a tempo,
   * and Note by note was taken off (Blaine, 9 October 2026). Pro, as grading
   * is on the Unison page.
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
  let running: "" | "countin" | "playing" = "";
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

  // A new exercise clears the marks and any run.
  $: exercise, stopRun(), clearMarks(), (result = null);

  // ── The notes on the page ─────────────────────────────────────────────────
  /** Each hand's notes as abcjs drew them, in order: staff 0 the right hand, staff 1 the left. */
  function noteElements(): Record<Hand, Element[][]> {
    const map: Record<Hand, Element[][]> = { rh: [], lh: [] };
    for (const line of tune?.lines ?? []) {
      (line.staff ?? []).forEach((staff: any, s: number) => {
        const hand: Hand = s === 0 ? "rh" : "lh";
        for (const voice of staff.voices ?? []) for (const el of voice) if (el.el_type === "note") map[hand].push(el.abselem?.elemset ?? []);
      });
    }
    return map;
  }
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
  }

  async function startInTime() {
    if (!exercise) return;
    const meter = exercise.meter;
    const beatUnits = beatUnitOf(meter);
    const perBar = beatsOf(meter);
    const countIn = countInMeasures(meter) * perBar;
    const beatSec = 60 / bpm;
    const beats = countIn + exercise.measures * perBar;
    audio ??= new AudioContext();
    // The browser starts sound only after a click on the page; capped, so a refusal is said rather than waited on.
    await Promise.race([audio.resume(), new Promise((r) => setTimeout(r, 1500))]);
    if (audio.state !== "running") {
      status = "The browser kept the sound off. Press Start again.";
      return;
    }
    const startAt = audio.currentTime + 0.3;
    for (let k = 0; k < beats; k++) if (k < countIn || click) tick(startAt + k * beatSec, k % perBar === 0);
    // The player plays with the click as heard, so beat 1 is when it reaches the ear.
    const outMs = ((audio.baseLatency ?? 0) + ((audio as any).outputLatency ?? 0)) * 1000;
    t0 = performance.now() + (startAt - audio.currentTime) * 1000 + countIn * beatSec * 1000 + outMs;
    endAt = t0 + exercise.measures * perBar * beatSec * 1000 + beatSec * 1000;
    played = [];
    running = "countin";
    status = "";
    const unitMs = (beatSec * 1000) / beatUnits;
    const loop = () => {
      const now = performance.now();
      if (now < t0) {
        const beat = Math.floor((now - (t0 - countIn * beatSec * 1000)) / (beatSec * 1000));
        if (beat >= 0) showCountIn(meter, beat + 1);
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
    // Ended by a timer, not the frame loop: a browser stops drawing frames for a page out of sight.
    finishTimer = setTimeout(() => finishInTime(beatUnits), endAt - performance.now());
  }

  function finishInTime(beatUnits: number) {
    clearInterval(raf);
    if (running !== "countin" && running !== "playing") return;
    for (const n of expected) mark(n, "");
    running = "";
    hideCountIn();
    if (!exercise) return;
    result = gradeInTime(expected, played, { t0, bpm, beatUnits, strictness });
    for (const n of result.notes) {
      // A chord's notes share one notehead group: missed beats off, off beats right.
      const worst = result.notes.filter((m) => m.hand === n.hand && m.index === n.index).reduce((w, m) => (rank(m.verdict) > rank(w) ? m.verdict : w), n.verdict);
      mark(n, worst === "right" ? "pg-right" : worst === "missed" ? "pg-miss" : "pg-off");
    }
  }
  const rank = (v: string) => (v === "missed" ? 2 : v === "right" ? 0 : 1);

  // ── Runs ──────────────────────────────────────────────────────────────────
  async function start() {
    if (!exercise || !tune) return;
    onStart();
    stopRun();
    els = noteElements();
    clearMarks();
    result = null;
    expected = expectedNotes(exercise);
    follower.reset();
    // Start with the score's first line in view: the count-in is the time to find it.
    document.getElementById("paper")?.scrollIntoView({ behavior: "smooth", block: "start" });
    await startInTime();
  }

  function stopRun() {
    clearInterval(raf);
    clearTimeout(finishTimer);
    if (running) hideCountIn();
    running = "";
    status = "";
  }

  // Dev only: keys from the console or a test, as a keyboard would send them.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as any).__pianoMidi = {
      press: (m: number) => onKey({ midi: m, velocity: 80, down: true, t: performance.now() }),
      release: (m: number) => onKey({ midi: m, velocity: 0, down: false, t: performance.now() }),
      state: () => ({ running, t0, bpm, expected, played: played.length, result }),
    };
  }

  onDestroy(() => {
    stopRun();
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
