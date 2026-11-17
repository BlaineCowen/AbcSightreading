<script lang="ts">
  /**
   * Interval ear training (Blaine, 17 November 2026, after Solfège): two
   * notes, up, down, either, or together; name the distance. The first levels
   * are sizes from a major scale (step or skip, 2nds to 5ths, to the octave),
   * then major, minor and perfect (ear-quiz.ts INTERVAL_LEVELS), or Custom.
   * The play itself is EarQuiz's.
   */
  import EarQuiz, { type QuizRound } from "./EarQuiz.svelte";
  import { playEar } from "../../lib/games/game-audio";
  import {
    INTERVAL_LEVELS, INTERVAL_NAMES, QUIZ_LENGTH, checkIntervalSetup, intervalChoices, intervalName, intervalRound,
    type Direction, type IntervalSetup,
  } from "../../lib/games/ear-quiz";

  const SETUP_KEY = "sr-interval-ear";
  let setup: IntervalSetup = (() => {
    try {
      return checkIntervalSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null"));
    } catch {
      return checkIntervalSetup(null);
    }
  })();
  $: try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {}

  const DIRECTIONS: [Direction, string][] = [["up", "Up"], ["down", "Down"], ["both", "Up or down"], ["together", "Together"]];
  let customSemis: number[] = setup.level === 0 ? [...(setup.semis ?? [])] : [3, 4, 5, 7];
  $: problem = setup.level === 0 && customSemis.length < 2 ? "Choose at least two intervals." : null;

  function setLevel(v: string) {
    setup = v === "custom" ? { ...setup, level: 0, semis: customSemis } : checkIntervalSetup({ ...setup, level: Number(v) });
  }
  function toggle(n: number) {
    customSemis = customSemis.includes(n) ? customSemis.filter((x) => x !== n) : [...customSemis, n].sort((a, b) => a - b);
    setup = { ...setup, level: 0, semis: customSemis };
  }

  function makeRound(raw: IntervalSetup, seed: number): QuizRound {
    const s = checkIntervalSetup(raw);
    const r = intervalRound(s, seed);
    const sound = (i: number, heard?: () => void) => {
      const qn = r.questions[i]!;
      return playEar({ tonic: 0, pattern: null, chord: [], notes: [qn.from, qn.to], gap: 1, together: r.together, onNote: (k) => k === 1 && heard?.() });
    };
    return {
      answers: r.questions.map((q) => q.answer),
      choices: intervalChoices(s).values.map((v) => ({ value: v, label: intervalName(s, v) })),
      intro: null,
      play: (i, heard) => sound(i, heard),
      playAnswer: (i) => sound(i),
      answerName: (i) => intervalName(s, r.questions[i]!.answer),
    };
  }
  const nextLevel = (raw: IntervalSetup) => {
    const s = checkIntervalSetup(raw);
    return s.level > 0 && s.level < INTERVAL_LEVELS.length ? { label: `Level ${s.level + 1}`, setup: { ...s, level: s.level + 1 } } : null;
  };
  const onSetup = (s: IntervalSetup) => (setup = s);
  $: hint = `${QUIZ_LENGTH} intervals. Name each one. The number keys answer; space plays it again.`;
</script>

<EarQuiz game="interval" {setup} {makeRound} {nextLevel} {onSetup} {problem} {hint}>
  <div class="setup" slot="setup">
    <div class="row">
      <label for="int-level">Level</label>
      <select id="int-level" class="pick" value={setup.level === 0 ? "custom" : String(setup.level)} on:change={(e) => setLevel(e.currentTarget.value)}>
        {#each INTERVAL_LEVELS as l, i}<option value={String(i + 1)}>Level {i + 1}: {l.name}</option>{/each}
        <option value="custom">Custom</option>
      </select>
    </div>
    {#if setup.level === 0}
      <div class="row" role="group" aria-label="Intervals">
        <span>Intervals</span>
        {#each Object.entries(INTERVAL_NAMES) as [n, label]}
          <button type="button" class="sr-tok chip" class:sr-on={customSemis.includes(Number(n))} aria-pressed={customSemis.includes(Number(n))} on:click={() => toggle(Number(n))}>{label}</button>
        {/each}
      </div>
    {/if}
    <div class="row" role="group" aria-label="Direction">
      <span>Notes</span>
      {#each DIRECTIONS as [d, label]}
        <button type="button" class="sr-tok chip" class:sr-on={setup.direction === d} aria-pressed={setup.direction === d} on:click={() => (setup = { ...setup, direction: d })}>{label}</button>
      {/each}
    </div>
    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
  </div>
</EarQuiz>

<style>
  .setup { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.9rem 1.1rem; border-radius: 22px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
  .row > span, .row > label { font-weight: 800; font-size: 0.85rem; color: var(--sr-ink-2); min-width: 5.5rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
  .pick { border-radius: 999px; background: var(--sr-track); color: var(--sr-ink); font-size: 14px; font-weight: 700; padding: 0.4rem 2rem 0.4rem 0.9rem; max-width: 100%; }
</style>
