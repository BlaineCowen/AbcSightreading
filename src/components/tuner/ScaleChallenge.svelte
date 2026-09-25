<script lang="ts">
  import { onDestroy } from "svelte";
  import { CHALLENGE_OCTAVE_MAX, CHALLENGE_OCTAVE_MIN, tuner } from "../../lib/tuner/store";
  import { NOTES, solfegeFor } from "../../lib/tuner/pitch";
  import type { NoteName } from "../../lib/tuner/types";
  import { ScaleChallengeRunner } from "../../lib/tuner/scale-challenge-runner";
  import { FREE_FIND_MS, TOLERANCE_CENTS, buildTargets } from "../../lib/tuner/scale-challenge";
  import type { Difficulty, Direction } from "../../lib/tuner/scale-challenge";
  import RadialTuner from "./RadialTuner.svelte";

  export let onStartMic: () => void;

  const nameOf = (midi: number): NoteName => NOTES[((midi % 12) + 12) % 12];
  const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  const errColor = (cents: number) =>
    Math.abs(cents) <= 10 ? "#22c55e" : Math.abs(cents) <= 25 ? "#f59e0b" : "#ef4444";

  const gradeColor = (letter: string) =>
    letter.startsWith("A")
      ? "text-green-500"
      : letter === "B"
        ? "text-lime-500"
        : letter === "C"
          ? "text-amber-500"
          : "text-red-500";

  /** Time-to-find colour: quiet while free, amber then red as it costs. */
  const findColor = (ms: number, freeMs: number) =>
    ms <= freeMs ? "var(--sr-faint)" : ms <= freeMs * 2 ? "#f59e0b" : "#ef4444";

  const DIRECTIONS: [Direction, string][] = [
    ["up", "Up"],
    ["updown", "Up + down"],
  ];
  const DIFFICULTIES: [Difficulty, string][] = [
    ["easy", "Easy"],
    ["normal", "Normal"],
    ["strict", "Strict"],
  ];

  const runner = new ScaleChallengeRunner();
  onDestroy(runner.destroy);

  $: key = $tuner.key;
  $: displayMode = $tuner.displayMode;
  $: engineStatus = $tuner.engineStatus;
  $: direction = $tuner.challengeDirection;
  $: octave = $tuner.challengeOctave;
  $: showTuner = $tuner.challengeShowTuner;
  $: difficulty = $tuner.challengeDifficulty;
  $: guideTone = $tuner.challengeGuideTone;

  $: phase = $runner.phase;
  $: state = $runner.state;
  $: result = $runner.result;

  $: targets = buildTargets(key, octave, direction);

  // Passing displayMode/key makes the markup re-render when either changes.
  const labelFor = (midi: number, mode: typeof displayMode, k: NoteName) =>
    mode === "solfege" ? solfegeFor(nameOf(midi), k) : `${nameOf(midi)}${octaveOf(midi)}`;
  $: label = (midi: number) => labelFor(midi, displayMode, key);

  $: rootLabel = targets.length ? label(targets[0]) : "";
  $: startLabel = targets.length
    ? displayMode === "solfege"
      ? `${rootLabel}${octaveOf(targets[0])} (${nameOf(targets[0])}${octaveOf(targets[0])})`
      : rootLabel
    : "";

  function hearStart() {
    const root = targets[0];
    tuner.setPlaying({ name: nameOf(root), octave: octaveOf(root) });
    window.setTimeout(() => tuner.setPlaying(null), 1200);
  }

  const start = () => runner.start(direction, octave, difficulty);

  // guide / listen / cleared
  $: target = targets[state.index] ?? targets[0];
  $: cleared = phase === "cleared";
  $: nudge =
    state.cents === null
      ? "listen…"
      : state.onTarget
        ? "hold it"
        : state.cents > 0
          ? "a little lower"
          : "a little higher";

  // HoldRing: fills as the one-second hold accumulates.
  const R = 54;
  const C = 2 * Math.PI * R;
  $: ringProgress = cleared ? 1 : state.hold;
  $: ringOnTarget = cleared || state.onTarget;

  $: freeMs = FREE_FIND_MS[difficulty];
</script>

{#if phase === "results" && result}
  <div class="flex flex-col gap-4 bg-sr-panel border border-sr-hairline rounded-lg p-4">
    <div class="flex items-end justify-center gap-4">
      <div class="text-7xl font-bold leading-none {gradeColor(result.letter)}">
        {result.letter}
      </div>
      <div class="text-sm text-sr-muted pb-1">
        <div>
          <span class="text-sr-ink font-mono">{result.meanCents.toFixed(1)}</span>
          pitch{#if result.meanFindPenalty > 0}{" + "}<span class="text-amber-500 font-mono"
              >{result.meanFindPenalty.toFixed(1)}</span
            > slow to find{/if}{" = "}<span class="text-sr-ink font-mono">{result.score.toFixed(1)}</span>
        </div>
        <div>
          <span class="text-sr-ink font-mono">{seconds(result.totalMs)}</span>
          total{#if result.meanFindMs !== null}{" "}· {seconds(result.meanFindMs)} avg to find{/if}
        </div>
        {#if result.missedCount > 0}
          <div class="text-amber-500">{result.missedCount} skipped</div>
        {/if}
      </div>
    </div>

    <!-- ResultChart: signed cents per note, bars above/below a centre line. -->
    <div class="flex items-stretch gap-1 h-40">
      {#each result.notes as n (n.index)}
        {@const cents = n.cents ?? 0}
        {@const frac = Math.min(1, Math.abs(cents) / 50)}
        <div class="flex-1 flex flex-col items-center">
          <div class="relative flex-1 w-full">
            <div class="absolute inset-x-0 top-1/2 h-px bg-sr-hairline" />
            {#if !n.missed}
              <div
                class="absolute left-1/2 -translate-x-1/2 w-2/3 rounded-sm"
                style="background-color: {errColor(cents)}; height: {Math.max(2, frac * 50)}%; {cents >= 0
                  ? 'bottom: 50%'
                  : 'top: 50%'};"
              />
            {:else}
              <div
                class="absolute inset-x-1/4 top-[40%] h-[20%] rounded-sm border border-dashed border-sr-faint"
              />
            {/if}
          </div>
          <div class="text-[10px] leading-tight text-center mt-1">
            <div class="text-sr-ink-2">{label(n.target)}</div>
            <div style="color: {n.missed ? 'var(--sr-muted)' : errColor(cents)}">
              {n.missed ? "—" : `${cents > 0 ? "+" : ""}${cents}`}
            </div>
            <div
              style="color: {n.timeToFindMs === null
                ? 'var(--sr-faint)'
                : findColor(n.timeToFindMs, freeMs)}"
            >
              {n.timeToFindMs === null ? "" : seconds(n.timeToFindMs)}
            </div>
          </div>
        </div>
      {/each}
    </div>
    <p class="text-[10px] text-center text-sr-faint">
      sharp above the line · flat below · dashed = skipped · seconds = time to find, free up to {seconds(
        freeMs
      )}
    </p>

    <div class="flex gap-2">
      <button on:click={runner.reset} class="sr-btn-quiet flex-1 py-3">Change settings</button>
      <button on:click={start} class="sr-btn flex-1 py-3">Try again</button>
    </div>
  </div>
{:else if phase === "setup"}
  <div class="flex flex-col gap-4 bg-sr-panel border border-sr-hairline rounded-lg p-4">
    <div>
      <h2 class="text-lg font-medium text-sr-ink">Scale challenge</h2>
      <p class="text-sm text-sr-muted">
        Sing the major scale one note at a time. Hold each note in tune for a second and it moves
        on. You can take as long as you need to find a note, but hunting for it costs you on the
        grade.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
      <div class="flex items-center gap-2">
        <span class="text-sr-muted">Start on</span>
        <button
          on:click={() => tuner.setChallengeOctave(octave - 1)}
          disabled={octave <= CHALLENGE_OCTAVE_MIN}
          class="sr-btn-quiet w-8 h-8 !p-0"
          aria-label="Lower octave"
        >
          −
        </button>
        <span class="min-w-[6.5rem] text-center font-mono text-sr-ink">{startLabel}</span>
        <button
          on:click={() => tuner.setChallengeOctave(octave + 1)}
          disabled={octave >= CHALLENGE_OCTAVE_MAX}
          class="sr-btn-quiet w-8 h-8 !p-0"
          aria-label="Raise octave"
        >
          +
        </button>
        <button on:click={hearStart} class="sr-btn-quiet">♪ Hear it</button>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sr-muted">Scale</span>
        <div class="flex gap-1">
          {#each DIRECTIONS as [id, text] (id)}
            <button
              on:click={() => tuner.setChallengeDirection(id)}
              class="sr-tok"
              class:sr-on={direction === id}
            >
              {text}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sr-muted">Difficulty</span>
        <div class="flex gap-1">
          {#each DIFFICULTIES as [id, text] (id)}
            <button
              on:click={() => tuner.setChallengeDifficulty(id)}
              class="sr-tok"
              class:sr-on={difficulty === id}
              title={`Within ±${TOLERANCE_CENTS[id]} cents`}
            >
              {text}
            </button>
          {/each}
        </div>
      </div>

      <button on:click={tuner.toggleChallengeGuideTone} class="sr-tok" class:sr-on={guideTone}>
        ♪ Guide tone
      </button>
      <button on:click={tuner.toggleChallengeShowTuner} class="sr-tok" class:sr-on={showTuner}>
        Show tuner
      </button>
    </div>

    <p class="text-xs text-sr-faint">
      {targets.length} notes · key of {key} · within ±{TOLERANCE_CENTS[difficulty]}¢{guideTone
        ? " · each note played first"
        : " · no guide tone"}{` · ${seconds(FREE_FIND_MS[difficulty])} to find it free`}{showTuner
        ? " · tuner visible"
        : " · sing it blind"}
    </p>

    {#if engineStatus === "running"}
      <button on:click={start} class="sr-btn w-full py-3 text-lg">Start</button>
    {:else}
      <button on:click={onStartMic} class="sr-btn-quiet w-full py-3">Start microphone first</button>
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 bg-sr-panel border border-sr-hairline rounded-lg p-4">
      <p class="text-center text-xs text-sr-faint">
        Note {state.index + 1} of {targets.length}
      </p>

      <!-- HoldRing -->
      <div class="relative w-36 h-36 mx-auto">
        <svg viewBox="0 0 128 128" class="w-full h-full -rotate-90">
          <circle cx="64" cy="64" r={R} fill="none" stroke="var(--sr-track)" stroke-width="8" />
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke={ringOnTarget ? "#22c55e" : "var(--sr-faint)"}
            stroke-width="8"
            stroke-linecap="round"
            stroke-dasharray={C}
            stroke-dashoffset={C * (1 - ringProgress)}
            class="transition-[stroke-dashoffset] duration-75"
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-4xl font-bold text-sr-ink">{label(target)}</span>
        </div>
      </div>

      <div class="text-center h-6">
        {#if cleared}
          <span class="text-green-500 text-sm">✓ got it</span>
        {:else if phase === "guide"}
          <span class="text-sr-action text-sm">listen…</span>
        {:else}
          <span class="text-sm" style="color: {state.onTarget ? '#22c55e' : 'var(--sr-muted)'}">
            {nudge}
            {#if state.cents !== null}
              <span class="ml-2 font-mono text-sr-faint"
                >{state.cents > 0 ? "+" : ""}{Math.round(state.cents)}¢</span
              >
            {/if}
          </span>
        {/if}
      </div>

      <!-- Whole scale, cleared notes ticked -->
      <div class="flex gap-1">
        {#each targets as m, i}
          <div
            class="flex-1 text-center text-[10px] py-1 rounded {i === state.index
              ? 'bg-sr-action text-white font-medium'
              : i < state.index
                ? 'bg-sr-track text-sr-muted'
                : 'border border-sr-hairline text-sr-faint'}"
          >
            {label(m)}
          </div>
        {/each}
      </div>

      <div class="flex justify-center gap-2">
        <button on:click={runner.skip} class="sr-btn-quiet px-4">Skip note</button>
        <button on:click={runner.stop} class="sr-btn-quiet px-4">Stop</button>
      </div>
    </div>

    {#if showTuner}
      <RadialTuner interactive={false} showControls={false} />
    {/if}
  </div>
{/if}
