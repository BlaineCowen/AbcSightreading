<script lang="ts">
  import { X, ChevronUp, Check, Ban, ArrowLeftRight, Hash, Scissors, Music2, Sparkles, Play, Pause, Headphones } from "lucide-svelte";
  import { tuner } from "../lib/tuner/store";
  import type { GradeRunner } from "../lib/grade-runner";
  import { guidance, STRICTNESS, type Strictness } from "../lib/grade";
  import { togetherLabel } from "../lib/grade-rhythm";

  /**
   * Grade's strip on the Unison page (rules in grade.ts, the run in
   * grade-runner.ts), docked just above the playback bar. It was a tall card
   * over the bottom-left of the page and covered the music; now it is one line
   * while singing, and the page leaves room below the score for it. The Stuck
   * options and the results' note chips open upward, on demand.
   */
  export let runner: GradeRunner;
  /** Pro or better; null while that is being checked. */
  export let allowed: boolean | null;
  export let signedIn: boolean;
  export let onStart: () => void;
  export let onClose: () => void;
  export let onNewExercise: () => void;
  /** Why it cannot start now (no exercise, rhythm only), or null. */
  export let blocked: string | null = null;
  /** Do's pitch class in the exercise's key, for naming notes in solfege. */
  export let doPc = 0;
  /** After a run: what the tapped note on the score did. */
  export let detail: string | null = null;
  /** Saving a run for review (the recording and the grading's data); null hides it. */
  export let onSave: (() => void) | null = null;
  /** A rhythm-only exercise: clapped or tapped, rhythm alone (grade-rhythm.ts). */
  export let rhythmOnly = false;
  /** Clap along with the click to measure the microphone's delay; null hides it. */
  export let onCheckTiming: (() => void) | null = null;
  /** What Check timing found, or is doing. */
  export let timingNote: string | null = null;
  /** Send this run to us, with a note (anyone with Grade but students); null hides it. Resolves to what happened. */
  export let onSend: ((note: string) => Promise<string>) | null = null;
  /** Hear your take (grade-playback.ts): start, or play/pause; null when there is no recording. */
  export let onHearTake: (() => void) | null = null;
  export let take: { open: boolean; loading: boolean; playing: boolean; progress: number; music: boolean; hasMusic: boolean; error: string | null } = {
    open: false, loading: false, playing: false, progress: 0, music: false, hasMusic: false, error: null,
  };
  export let onTakeMusic: (on: boolean) => void = () => {};
  export let onTakeSeek: (frac: number) => void = () => {};
  export let onTakeClose: () => void = () => {};
  const hear = () => {
    resultsOpen = false;
    onHearTake?.();
  };
  let sendOpen = false;
  let sendNote = "";
  let sending = false;
  let sentLine: string | null = null;
  $: if ($runner.phase !== "results") {
    sendOpen = false;
    sentLine = null;
  }
  async function send() {
    if (!onSend || sending) return;
    sending = true;
    sentLine = await onSend(sendNote);
    sending = false;
    sendOpen = false;
    sendNote = "";
  }

  const STRICT_LEVELS = Object.entries(STRICTNESS) as [Strictness, (typeof STRICTNESS)[Strictness]][];
  const CURSORS = [["off", "Off"], ["smooth", "Smooth"], ["beat", "Beat"], ["note", "Note"]] as const;
  const CLICKS = [["off", "Off"], ["beat", "Beats"], ["sub", "Subdivided"]] as const;
  const CLAP_CLICKS = [["off", "Count-in only"], ["beat", "Beats"], ["sub", "Subdivided"]] as const;
  /**
   * The setup and the results are centred cards over the page (the setup when
   * Grade opens or is back at the start, the results when a run ends); while it
   * runs, only the slim strip shows, so the music is in view. "See it on the
   * music" puts the results away to the strip, which can bring them back.
   */
  let setupOpen = true;
  let resultsOpen = false;
  let lastPhase = "idle";
  $: if (v.phase !== lastPhase) {
    if (v.phase === "idle") setupOpen = true;
    if (v.phase === "results") {
      resultsOpen = true;
      setupOpen = false;
    }
    else resultsOpen = false;
    lastPhase = v.phase;
  }
  // The setup also opens over the results (Change settings): another run, set differently, without leaving Grade.
  $: setupShown = setupOpen && (v.phase === "idle" || v.phase === "results") && !blocked && allowed !== false;
  $: resultsShown = resultsOpen && v.phase === "results" && !setupShown;
  /** Leaving the setup: over the results it goes back to them; at the start it closes Grade. */
  const leaveSetup = () => {
    if (v.phase === "results") {
      setupOpen = false;
      resultsOpen = true;
    } else onClose();
  };
  const changeSettings = () => {
    onTakeClose();
    resultsOpen = false;
    setupOpen = true;
  };
  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (resultsShown) resultsOpen = false;
    else if (setupShown) leaveSetup();
  }
  const start = () => {
    setupOpen = false;
    onStart();
  };
  /** Another strictness, on the same performance: graded again at once (the run keeps what it heard). */
  const regrade = (id: Strictness) => {
    tuner.setGrade({ gradeStrictness: id });
    runner.regrade(id);
  };
  $: graded = v.mode !== "pitch" && v.phase === "results";
  $: s = STRICTNESS[$tuner.gradeStrictness];
  // Pitch & rhythm, note by note: what each note was.
  $: perfCounts = v.perf
    ? {
        right: perfNotes.filter((n) => !n.missed && n.pitchOk && n.rhythm >= 90 && !n.cutShort).length,
        wrong: perfNotes.filter((n) => !n.missed && !n.pitchOk).length,
        missed: perfNotes.filter((n) => n.missed).length,
        timing: perfNotes.filter((n) => !n.missed && n.onsetBeats !== null && Math.abs(n.onsetBeats) > s.onsetBeats).length,
        tune: perfNotes.filter((n) => !n.missed && n.pitchOk && n.cents !== null && Math.abs(n.cents) > s.freeCents).length,
        short: perfNotes.filter((n) => !n.missed && n.cutShort).length,
        rests: v.perf.rests.filter((r) => r.sung).length,
      }
    : null;
  $: clapCounts = claps
    ? {
        right: claps.notes.filter((n) => !n.missed && n.rhythm >= 90).length,
        timing: clapOff,
        missed: clapMissed,
        strays: strayCount,
      }
    : null;

  $: v = $runner;
  $: sung = v.result?.notes ?? [];
  // Note by note is practice, not graded: getting through it is the point.
  $: skipped = sung.filter((n) => n.outcome === "skipped").length;
  $: doneLine = skipped === 0 ? `Done: all ${sung.length} notes sung` : `${sung.length - skipped} of ${sung.length} sung, ${skipped} skipped`;
  const OUTCOME = { first: "right first time", corrected: "corrected", helped: "heard it first", skipped: "skipped" } as const;
  $: perfNotes = v.perf?.notes ?? [];
  $: pitchToWork = perfNotes.filter((n) => n.pitch < 90).length;
  $: rhythmToWork = perfNotes.filter((n) => n.rhythm < 90).length + (v.perf?.rests.filter((r) => r.sung).length ?? 0);
  $: performance = $tuner.gradeMode === "performance";
  $: claps = v.claps;
  $: clapMissed = claps?.notes.filter((n) => n.missed).length ?? 0;
  $: clapOff = claps?.notes.filter((n) => !n.missed && n.rhythm < 90).length ?? 0;
  $: strayCount = claps ? Math.round(claps.strays.reduce((a, s) => a + s.weight, 0) * 10) / 10 : 0;
  $: clapLine = !claps
    ? ""
    : [
        clapMissed + clapOff === 0 ? "Every note in time" : [clapOff && `${clapOff} early or late`, clapMissed && `${clapMissed} missed`].filter(Boolean).join(", "),
        strayCount ? `${strayCount === 1 ? "1 stray clap" : `${strayCount} stray claps`}` : "",
        claps.together !== undefined ? `together: ${togetherLabel(claps.together).toLowerCase()}` : "",
        claps.soundedLikeClass ? "sounded like a whole class: try Who, The class" : "",
      ].filter(Boolean).join(" · ");
  $: viaMic = $tuner.gradeClapInput === "mic";
  $: clapSummary = `${viaMic ? "Microphone" : "Spacebar & pad"}${$tuner.gradeWho === "class" ? " · the class" : ""} · ${STRICTNESS[$tuner.gradeStrictness].label} · cursor ${$tuner.gradeCursor} · ${$tuner.gradeClapClick === "off" ? "count-in only" : `click ${$tuner.gradeClapClick === "sub" ? "subdivided" : "beats"}`}`;
  let stuckOpen = false;
  let detailsOpen = false;
  $: if (v.phase !== "sing") stuckOpen = false;
  $: if (v.phase !== "results") detailsOpen = false;

  const tone = (score: number) =>
    score >= 90 ? "bg-sr-mint text-sr-mint-ink" : score >= 70 ? "bg-sr-butter text-sr-butter-ink" : "bg-sr-peach text-sr-peach-ink";
  const RING = 2 * Math.PI * 12;
  const help = (kind: "note" | "tonic" | "triad") => {
    stuckOpen = false;
    runner.helpWith(kind);
  };
  const skip = () => {
    stuckOpen = false;
    runner.skip();
  };
  $: line = v.helping
    ? "Listen…"
    : v.credited
      ? "Got it"
      : v.target === null
        ? ""
        : guidance({ sung: v.sung, target: v.target, doPc, onTarget: v.onTarget });
  $: lineTone = v.credited || v.onTarget
    ? "text-sr-action-fg"
    : v.sung !== null && Math.abs(v.cents ?? 0) >= 100
      ? "text-sr-danger"
      : "text-sr-ink-2";
</script>

<svelte:window on:keydown={onKey} />

<!-- The setup, centred over the page. -->
{#if setupShown}
  <div class="grade-veil fixed inset-0 z-[60] flex items-center justify-center p-3 no-print" on:click|self={leaveSetup} role="presentation">
    <div class="grade-card w-full max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-sr-raise border border-sr-hairline rounded-[28px] shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-sm" role="dialog" aria-modal="true" aria-labelledby="grade-title">
      <div class="flex items-start gap-3">
        <div class="flex-1">
          <h2 id="grade-title" class="font-display text-2xl font-bold text-sr-ink">{rhythmOnly ? "Clap and grade" : "Listen and grade"}</h2>
          <p class="text-xs text-sr-muted mt-1">
            <span class="rounded-full bg-sr-butter text-sr-butter-ink px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide mr-1">Beta</span>
            Grading is new and still being tuned, so a score can be off. Tell us with Send this run.
          </p>
        </div>
        <button class="w-9 h-9 rounded-full flex items-center justify-center text-sr-muted hover:text-sr-ink hover:bg-sr-track shrink-0" on:click={leaveSetup} aria-label={v.phase === "results" ? "Back to the results" : "Close Grade"}><X size={18} /></button>
      </div>

      {#if rhythmOnly}
        <div class="flex flex-col gap-2" role="radiogroup" aria-label="Who claps">
          <span class="text-xs font-bold text-sr-muted uppercase tracking-wide">Who's clapping?</span>
          <div class="grid grid-cols-2 gap-2">
            {#each [["solo", "Just me", "One person, on this device."], ["class", "The class", "The whole room, heard by one microphone."]] as [id, label, sub]}
              <button class="choice {$tuner.gradeWho === id ? 'on' : ''}" role="radio" aria-checked={$tuner.gradeWho === id}
                on:click={() => tuner.setGrade(id === "class" ? { gradeWho: "class", gradeClapInput: "mic" } : { gradeWho: "solo" })}>
                <span class="font-display text-base font-bold">{label}</span><span class="text-xs opacity-80">{sub}</span>
              </button>
            {/each}
          </div>
          <p class="note" aria-live="polite">
            {#if $tuner.gradeWho === "class"}
              <b>Grading the class as one.</b> Everyone claps together; each clap is the room's. Chanting along is fine, and a few children a little late count as the same clap. Claps well off the beat or in a rest cost points.
            {:else if viaMic}
              <b>Grading one person.</b> Clap each note as it starts; rests are silent. Chanting is fine. A clap that matches no note costs a point. For a whole room, choose The class.
            {:else}
              <b>Grading one person.</b> Tap the spacebar or the pad at the side as each note starts. A tap that matches no note costs a point.
            {/if}
          </p>
        </div>
        {#if $tuner.gradeWho === "solo"}
          <div class="row" role="group" aria-label="Clap with">
            <span>Clap with</span>
            <button class="sr-tok text-xs px-2.5 py-1 {viaMic ? 'sr-on' : ''}" aria-pressed={viaMic} on:click={() => tuner.setGrade({ gradeClapInput: "mic" })}>Microphone</button>
            <button class="sr-tok text-xs px-2.5 py-1 {!viaMic ? 'sr-on' : ''}" aria-pressed={!viaMic} on:click={() => tuner.setGrade({ gradeClapInput: "keys", gradeWho: "solo" })}>Spacebar & pad</button>
          </div>
        {/if}
      {:else}
        <div class="flex flex-col gap-2" role="radiogroup" aria-label="What to grade">
          <span class="text-xs font-bold text-sr-muted uppercase tracking-wide">How?</span>
          <div class="grid grid-cols-2 gap-2">
            {#each [["performance", "Pitch & rhythm", "In time with a click, graded."], ["pitch", "Note by note", "The cursor waits. Practice, no grade."]] as [id, label, sub]}
              <button class="choice {$tuner.gradeMode === id ? 'on' : ''}" role="radio" aria-checked={$tuner.gradeMode === id}
                on:click={() => tuner.setGrade({ gradeMode: id === "pitch" ? "pitch" : "performance" })}>
                <span class="font-display text-base font-bold">{label}</span><span class="text-xs opacity-80">{sub}</span>
              </button>
            {/each}
          </div>
          <p class="note" aria-live="polite">
            {performance ? "The music runs in time; a note missed stays missed. Pitch and rhythm are scored apart, and you can switch how strict at the end." : "Sing each note and hold it; the cursor moves on when you've got it. Stuck? Hear help, or skip."}
          </p>
        </div>
      {/if}

      <div class="flex flex-col gap-2 border-t border-sr-hairline pt-3">
        <div class="row" role="group" aria-label="Strictness">
          <span>Strictness</span>
          {#each STRICT_LEVELS as [id, lv]}
            <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeStrictness === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeStrictness === id} on:click={() => tuner.setGrade({ gradeStrictness: id })}
              title={rhythmOnly ? `In time within ${lv.onsetBeats} of a beat` : `In tune within ${lv.cents} cents${performance ? `; in time within ${lv.onsetBeats} of a beat` : ""}`}>{lv.label}</button>
          {/each}
        </div>
        {#if performance || rhythmOnly}
          <div class="row" role="group" aria-label="Cursor">
            <span>Cursor</span>
            {#each CURSORS as [id, label]}
              <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeCursor === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeCursor === id} on:click={() => tuner.setGrade({ gradeCursor: id })}>{label}</button>
            {/each}
          </div>
          <div class="row" role="group" aria-label="Click">
            <span>Click</span>
            {#if rhythmOnly}
              {#each CLAP_CLICKS as [id, label]}
                <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeClapClick === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeClapClick === id} on:click={() => tuner.setGrade({ gradeClapClick: id })}
                  title={id !== "off" && viaMic ? "The microphone may hear the click; headphones help" : ""}>{label}</button>
              {/each}
            {:else}
              {#each CLICKS as [id, label]}
                <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeClick === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeClick === id} on:click={() => tuner.setGrade({ gradeClick: id })}>{label}</button>
              {/each}
            {/if}
          </div>
        {/if}
        {#if rhythmOnly && viaMic && onCheckTiming}
          <div class="row">
            <span>Timing</span>
            <button class="sr-tok text-xs px-2.5 py-1" on:click={onCheckTiming} title="Clap along with eight clicks, so claps are timed for this microphone">Check timing</button>
            <span class="text-xs text-sr-muted basis-full sm:basis-auto">{timingNote ?? ($tuner.clapLatencyMs === null ? "Not checked yet: clap along once for the fairest timing." : `Checked: this microphone hears claps ${$tuner.clapLatencyMs} ms late.`)}</span>
          </div>
        {/if}
        {#if !rhythmOnly}
          <div class="row" role="group" aria-label="Before the count-in, play">
            <span>First, play</span>
            <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeReference === 'note' ? 'sr-on' : ''}" aria-pressed={$tuner.gradeReference === "note"} on:click={() => tuner.setGradeReference("note")}>the first note</button>
            <button class="sr-tok text-xs px-2.5 py-1 {$tuner.gradeReference === 'triad' ? 'sr-on' : ''}" aria-pressed={$tuner.gradeReference === "triad"} on:click={() => tuner.setGradeReference("triad")} title="Do mi so mi do so do, then the first note">the key, then the first note</button>
          </div>
        {/if}
      </div>

      <div class="flex gap-2 justify-end pt-1">
        <button class="sr-btn-quiet text-sm" on:click={leaveSetup}>{v.phase === "results" ? "Back to results" : "Cancel"}</button>
        <button class="sr-btn text-sm px-6 py-2" on:click={start} disabled={allowed === null}>{allowed === null ? "…" : "Start"}</button>
      </div>
    </div>
  </div>
{/if}

<!-- The results, centred over the page. -->
{#if resultsShown}
  <div class="grade-veil fixed inset-0 z-[60] flex items-center justify-center p-3 no-print" on:click|self={() => (resultsOpen = false)} role="presentation">
    <div class="grade-card w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-sr-raise border border-sr-hairline rounded-[28px] shadow-2xl p-5 sm:p-6 flex flex-col gap-4" role="dialog" aria-modal="true" aria-labelledby="grade-result-title">
      <div class="flex items-center gap-3">
        <h2 id="grade-result-title" class="flex-1 font-display text-xl font-bold text-sr-ink">{v.mode === "pitch" ? "Note by note" : "Your score"}</h2>
        <button class="w-9 h-9 rounded-full flex items-center justify-center text-sr-muted hover:text-sr-ink hover:bg-sr-track shrink-0" on:click={() => (resultsOpen = false)} aria-label="Close the results"><X size={18} /></button>
      </div>

      {#if v.perf || claps}
        {@const score = v.perf ? v.perf.overall : claps?.rhythm ?? 0}
        {@const letter = v.perf ? v.perf.letter : claps?.letter ?? ""}
        <div class="flex items-center justify-center gap-4">
          <span class="score-ring {score >= 90 ? 'good' : score >= 70 ? 'ok' : 'low'}" aria-hidden="true">{letter}</span>
          <div class="flex flex-col">
            <span class="font-display text-6xl font-bold tabular-nums leading-none text-sr-ink">{score}<span class="text-3xl">%</span></span>
            {#if v.perf}
              <span class="text-sm font-bold text-sr-muted mt-1">Pitch {v.perf.pitch}% · Rhythm {v.perf.rhythm}%</span>
            {:else}
              <span class="text-sm font-bold text-sr-muted mt-1">Rhythm{claps?.together !== undefined ? ` · together: ${togetherLabel(claps.together).toLowerCase()}` : ""}</span>
            {/if}
          </div>
        </div>
        <div class="flex items-center justify-center gap-1.5" role="group" aria-label="Grade it again as">
          <span class="text-xs text-sr-muted mr-1">Graded</span>
          {#each STRICT_LEVELS as [id, lv]}
            <button class="sr-tok text-xs px-3 py-1 {$tuner.gradeStrictness === id ? 'sr-on' : ''}" aria-pressed={$tuner.gradeStrictness === id} on:click={() => regrade(id)}>{lv.label}</button>
          {/each}
        </div>
        <ul class="flex flex-col gap-1.5 text-sm">
          {#if perfCounts}
            <li class="tally"><Check size={16} class="text-sr-action-fg" /><span>Right, in tune and in time</span><b class="good">{perfCounts.right}</b></li>
            <li class="tally"><Music2 size={16} /><span>Wrong note</span><b class={perfCounts.wrong ? "bad" : "zero"}>{perfCounts.wrong}</b></li>
            <li class="tally"><Ban size={16} /><span>Not heard</span><b class={perfCounts.missed ? "bad" : "zero"}>{perfCounts.missed}</b></li>
            <li class="tally"><ArrowLeftRight size={16} /><span>Early or late</span><b class={perfCounts.timing ? "warn" : "zero"}>{perfCounts.timing}</b></li>
            <li class="tally"><Hash size={16} /><span>Sharp or flat</span><b class={perfCounts.tune ? "warn" : "zero"}>{perfCounts.tune}</b></li>
            {#if perfCounts.short || perfCounts.rests}
              <li class="tally"><Scissors size={16} /><span>Let go early{perfCounts.rests ? ", or sang through a rest" : ""}</span><b class="warn">{perfCounts.short + perfCounts.rests}</b></li>
            {/if}
          {:else if clapCounts}
            <li class="tally"><Check size={16} class="text-sr-action-fg" /><span>Clapped in time</span><b class="good">{clapCounts.right}</b></li>
            <li class="tally"><ArrowLeftRight size={16} /><span>Early or late</span><b class={clapCounts.timing ? "warn" : "zero"}>{clapCounts.timing}</b></li>
            <li class="tally"><Ban size={16} /><span>Missed</span><b class={clapCounts.missed ? "bad" : "zero"}>{clapCounts.missed}</b></li>
            <li class="tally"><X size={16} /><span>Stray claps</span><b class={clapCounts.strays ? "bad" : "zero"}>{clapCounts.strays}</b></li>
          {/if}
        </ul>
        {#if v.perf?.drift !== undefined && Math.abs(v.perf.drift) >= 15}
          <p class="note">Your tuning drifted {Math.abs(v.perf.drift)} cents {v.perf.drift > 0 ? "sharp" : "flat"} by the end{$tuner.gradeStrictness === "strict" ? "." : "; each note was judged in tune with where you were."}</p>
        {/if}
        {#if claps?.soundedLikeClass}
          <p class="note"><Sparkles size={14} class="inline -mt-0.5" /> This sounded like a whole class. For a room, choose <b>The class</b> before you start.</p>
        {/if}
        {#if claps?.ignored && claps.ignored.voiced + claps.ignored.merged > 0}
          <p class="text-xs text-sr-muted">Not counted against you: {[claps.ignored.voiced && `${claps.ignored.voiced} chanted syllable${claps.ignored.voiced === 1 ? "" : "s"}`, claps.ignored.merged && `${claps.ignored.merged} late claps folded into the class's clap`].filter(Boolean).join(" and ")}.</p>
        {/if}
        <p class="text-xs text-sr-muted">
          {#if v.perf}On the music: a wrong note shows the note you sang beside it, and the line is your pitch, blue on the note, red off it. An arrow means early or late. Tap a note for details.{:else}On the music: an arrow means a clap came early or late; a cross, a stray clap. Tap a note for details.{/if}
        </p>
      {:else if v.result}
        <p class="font-display text-2xl font-bold text-sr-ink text-center">{skipped === 0 ? "✓ " : ""}{doneLine}</p>
        <div class="flex flex-wrap gap-1 justify-center" aria-label="Each note">
          {#each sung as n, i}
            <span class="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold tabular-nums {tone(n.outcome === 'skipped' ? 0 : 100)}" title="Note {i + 1}: {OUTCOME[n.outcome]}">{i + 1}</span>
          {/each}
        </div>
      {/if}

      <div class="flex flex-col gap-2">
        {#if onHearTake}
          <button class="sr-btn text-sm py-2.5 inline-flex items-center justify-center gap-2" on:click={hear}><Headphones size={16} /> Hear your take</button>
          <button class="sr-btn-quiet text-sm py-2 border border-sr-hairline rounded-full" on:click={() => (resultsOpen = false)}>See it on the music</button>
        {:else}
          <button class="sr-btn text-sm py-2.5" on:click={() => (resultsOpen = false)}>See it on the music</button>
        {/if}
        <div class="grid grid-cols-2 gap-2">
          <button class="sr-btn-quiet text-sm py-2 border border-sr-hairline rounded-full" on:click={onStart}>Try again</button>
          <button class="sr-btn-quiet text-sm py-2 border border-sr-hairline rounded-full" on:click={onNewExercise}>New exercise</button>
        </div>
        <button class="sr-btn-quiet text-sm py-2 border border-sr-hairline rounded-full" on:click={changeSettings}>Change settings and try again</button>
        {#if onSend || onSave}
          <div class="flex justify-center gap-3">
            {#if onSend}<button class="text-xs text-sr-action-fg font-bold" on:click={() => { resultsOpen = false; sendOpen = true; sentLine = null; }}>Graded wrong? Send this run</button>{/if}
            {#if onSave}<button class="text-xs text-sr-action-fg font-bold" on:click={onSave}>Save this run</button>{/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- The strip: while it runs, and after the results are put away. -->
{#if !setupShown && !resultsShown}
<div class="grade-dock fixed z-50 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(720px,calc(100vw-2rem))] no-print" role="region" aria-label="Grade">
  {#if (sendOpen || sentLine) && onSend}
    <div class="mb-2 ml-auto w-fit max-w-full bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl p-3 flex flex-col gap-2 text-sm">
      {#if sendOpen}
        <p class="text-xs text-sr-ink-2 max-w-sm">
          Think this was graded wrong? Send us the run and we'll listen to it to make grading better. It sends your results,
          the exercise and a recording of your microphone during this run, nothing else. Nothing is sent unless you press Send.
        </p>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-sr-muted">What seemed wrong? (optional)</span>
          <input class="text-sm px-3 py-1.5 rounded-lg border border-sr-hairline bg-sr-track text-sr-ink w-80 max-w-full" bind:value={sendNote}
            placeholder="I sang note 5 right but it was marked off" maxlength="120" on:keydown={(e) => e.key === "Enter" && send()} />
        </label>
        <div class="flex gap-2 justify-end">
          <button class="sr-btn-quiet text-xs" on:click={() => (sendOpen = false)}>Cancel</button>
          <button class="sr-btn text-xs px-3 py-1.5" on:click={send} disabled={sending}>{sending ? "Sending…" : "Send"}</button>
        </div>
      {:else}
        <p class="text-xs font-bold text-sr-ink-2" aria-live="polite">{sentLine}</p>
      {/if}
    </div>
  {/if}
  {#if stuckOpen}
    <div class="mb-2 ml-auto w-fit bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl p-2 flex flex-col gap-1">
      <button class="sr-tok text-sm text-left" on:click={() => help("note")} title="The note then scores at most 50">Play this note</button>
      <button class="sr-tok text-sm text-left" on:click={() => help("tonic")}>Play the tonic</button>
      <button class="sr-tok text-sm text-left" on:click={() => help("triad")}>Play the tonic chord</button>
      <button class="sr-tok text-sm text-left" on:click={skip}>Skip this note</button>
    </div>
  {/if}

  <div class="bg-sr-raise border border-sr-hairline rounded-2xl shadow-xl px-3 py-2 flex items-center gap-2 sm:gap-3 min-h-[56px]">
    {#if allowed === false}
      <p class="flex-1 text-sm text-sr-ink-2">{rhythmOnly ? "Grade scores your clapping, note by note, for you or a whole class." : "Grade scores your singing, note by note."} It's part of Pro, $19.99 a year.</p>
      <a class="sr-btn text-sm px-4 py-2 shrink-0" href={signedIn ? "/account#plan" : `/login?mode=signup&next=${encodeURIComponent("/account#plan")}`}>Get Pro</a>
    {:else if v.phase === "idle"}
      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        <p class="text-sm font-bold text-sr-ink">{blocked ?? (rhythmOnly ? "Clap and grade" : "Listen and grade")}</p>
        {#if !blocked}<button class="text-xs text-sr-action-fg font-bold text-left" on:click={() => (setupOpen = true)}>{rhythmOnly ? clapSummary : `${performance ? "Pitch & rhythm" : "Note by note"} · ${STRICTNESS[$tuner.gradeStrictness].label}`} · change</button>{/if}
      </div>
      <button class="sr-btn text-sm px-5 py-2 shrink-0" on:click={start} disabled={!!blocked || allowed === null}>{allowed === null ? "…" : "Start"}</button>
    {:else if v.phase === "reference" || v.phase === "countIn"}
      <p class="flex-1 text-sm font-bold">{v.phase === "reference" ? "Listen…" : "Get ready…"}</p>
      <button class="sr-btn-quiet text-sm shrink-0" on:click={() => runner.stop()}>Stop</button>
    {:else if v.phase === "sing" && v.mode === "claps"}
      <div class="flex-1 min-w-0 flex flex-col leading-tight">
        <span class="text-xs font-bold text-sr-muted tabular-nums">Note {v.index + 1} of {v.total}</span>
        <span class="text-sm font-semibold text-sr-ink-2" aria-live="off">{viaMic ? ($tuner.gradeWho === "class" ? "Everyone: clap each note as it starts" : "Clap each note as it starts") : `Tap each note as it starts${v.tapped ? ` · ${v.tapped} tapped` : ""}`}</span>
      </div>
      <button class="sr-btn-quiet text-sm shrink-0" on:click={() => runner.stop()}>Stop</button>
    {:else if v.phase === "sing"}
      <svg width="32" height="32" viewBox="0 0 32 32" class="shrink-0" aria-hidden="true">
        <circle cx="16" cy="16" r="12" fill="none" stroke="var(--sr-track)" stroke-width="5" />
        <circle cx="16" cy="16" r="12" fill="none" stroke={v.onTarget || v.credited ? "var(--sr-action)" : "var(--sr-faint)"} stroke-width="5"
          stroke-dasharray={RING} stroke-dashoffset={RING * (1 - v.hold)} transform="rotate(-90 16 16)" stroke-linecap="round" />
      </svg>
      <div class="flex-1 min-w-0 flex flex-col leading-tight">
        <span class="text-xs font-bold text-sr-muted tabular-nums">Note {v.index + 1} of {v.total}</span>
        <span class="text-sm font-semibold truncate {lineTone}" aria-live="polite">{line}</span>
      </div>
      <button class="sr-btn-quiet text-sm shrink-0 inline-flex items-center gap-1" on:click={() => (stuckOpen = !stuckOpen)} aria-expanded={stuckOpen}>Stuck? <ChevronUp size={14} class={stuckOpen ? "" : "rotate-180"} /></button>
      <button class="sr-btn-quiet text-sm shrink-0" on:click={() => runner.stop()}>Stop</button>
    {:else if v.phase === "results" && take.open}
      <button class="w-11 h-11 rounded-full bg-sr-action text-white flex items-center justify-center shrink-0 disabled:opacity-50" on:click={() => onHearTake?.()} disabled={take.loading || !!take.error}
        aria-label={take.playing ? "Pause" : "Play your take"}>
        {#if take.playing}<Pause size={18} />{:else}<Play size={18} class="ml-0.5" />{/if}
      </button>
      <div class="flex-1 min-w-0 flex flex-col gap-1">
        <p class="text-sm text-sr-ink-2 truncate" aria-live="polite">{take.error ?? (take.loading ? "Getting your take ready…" : detail ?? "Your take")}</p>
        <input type="range" min="0" max="1" step="0.001" value={take.progress} class="w-full accent-sr-action" aria-label="Where in your take"
          on:input={(e) => onTakeSeek(Number(e.currentTarget.value))} disabled={take.loading || !!take.error} />
      </div>
      {#if take.hasMusic}
        <button class="sr-tok text-xs px-2.5 py-1 shrink-0 {take.music ? 'sr-on' : ''}" aria-pressed={take.music} on:click={() => onTakeMusic(!take.music)}
          title="The written notes and the click, quietly under your take">With the music</button>
      {/if}
      <button class="sr-btn-quiet text-sm shrink-0 max-sm:hidden" on:click={() => { onTakeClose(); resultsOpen = true; }}>Results</button>
      <button class="w-8 h-8 rounded-lg flex items-center justify-center text-sr-muted hover:text-sr-ink shrink-0" on:click={onTakeClose} aria-label="Stop playing your take"><X size={14} /></button>
    {:else if v.phase === "results"}
      {#if onHearTake}
        <button class="w-10 h-10 rounded-full bg-sr-action text-white flex items-center justify-center shrink-0" on:click={() => onHearTake?.()} aria-label="Hear your take" title="Hear your take"><Headphones size={16} /></button>
      {/if}
      {#if v.perf || claps}
        <span class="text-xl font-extrabold tabular-nums shrink-0">{v.perf ? v.perf.overall : claps?.rhythm}%</span>
        <span class="text-xl font-extrabold text-sr-action-fg shrink-0">{v.perf ? v.perf.letter : claps?.letter}</span>
      {:else}
        <span class="text-2xl shrink-0" aria-hidden="true">{skipped === 0 ? "✓" : "•"}</span>
      {/if}
      <p class="flex-1 min-w-0 text-sm text-sr-ink-2 truncate">{detail ?? (v.perf ? (pitchToWork + rhythmToWork === 0 ? "In tune and in time" : `${pitchToWork} pitch, ${rhythmToWork} rhythm to work on`) : claps ? clapLine : doneLine)}</p>
      <button class="sr-btn-quiet text-sm shrink-0" on:click={() => (resultsOpen = true)}>Results</button>
      <button class="sr-btn-quiet text-sm shrink-0 max-sm:hidden" on:click={changeSettings}>Settings</button>
      <button class="sr-btn text-sm px-4 py-2 shrink-0" on:click={onStart}>Try again</button>
    {/if}
    {#if !(v.phase === "results" && take.open)}
      <button class="w-8 h-8 rounded-lg flex items-center justify-center text-sr-muted hover:text-sr-ink shrink-0" on:click={onClose} aria-label="Close Grade">
        <X size={16} />
      </button>
    {/if}
  </div>
</div>
{/if}

<style>
  /* Just above the playback bar, whose height the page publishes. */
  .grade-dock { bottom: calc(var(--bottom-bar-h, 96px) + 10px); }
  .grade-veil { background: color-mix(in srgb, var(--sr-ink) 28%, transparent); }
  .choice { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 12px 14px; border-radius: 18px;
    border: 2px solid var(--sr-hairline); background: var(--sr-track); color: var(--sr-ink); }
  /* Not --sr-paper: the score's paper stays white in the dark theme, and the text on it did not. */
  .choice.on { border-color: var(--sr-action); background: color-mix(in srgb, var(--sr-action) 16%, var(--sr-track)); }
  .note { font-size: 0.8rem; line-height: 1.35; color: var(--sr-ink-2); background: color-mix(in srgb, var(--sr-sky) 55%, transparent); border-radius: 14px; padding: 8px 12px; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .row > span:first-child { font-size: 0.75rem; color: var(--sr-muted); width: 5.2rem; }
  .tally { display: flex; align-items: center; gap: 10px; color: var(--sr-ink-2); }
  .tally > span { flex: 1; }
  .tally b { min-width: 2rem; height: 2rem; padding: 0 8px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-variant-numeric: tabular-nums; }
  .tally b.good { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .tally b.warn { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .tally b.bad { background: var(--sr-peach); color: var(--sr-peach-ink); }
  .tally b.zero { background: var(--sr-track); color: var(--sr-muted); }
  .score-ring { width: 72px; height: 72px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
    font-family: "Fredoka", sans-serif; font-weight: 700; font-size: 2.2rem; }
  .score-ring.good { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .score-ring.ok { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .score-ring.low { background: var(--sr-peach); color: var(--sr-peach-ink); }
</style>
