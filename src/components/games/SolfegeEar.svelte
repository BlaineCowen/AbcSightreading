<script lang="ts">
  /**
   * Solfège ear training (Blaine, 17 November 2026: from learnmusic.fun,
   * "with modes for scale degree, fixed do, minor, etc."). The key plays (its
   * chord, then 1 3 5 3 1 5 1), then ten notes, each after the tonic unless
   * that is switched off; name each one. Levels follow abcStepByStep's order
   * (ear-quiz.ts SOLFEGE_LEVELS), major or minor, or Custom notes; the notes
   * are named in movable do (minor la- or do-based), scale degrees, fixed do
   * or letters. The play itself is EarQuiz's.
   */
  import EarQuiz, { type QuizRound } from "./EarQuiz.svelte";
  import { playEar } from "../../lib/games/game-audio";
  import {
    QUIZ_LENGTH, SOLFEGE_LEVELS, checkSolfegeSetup, keyChord, keyPattern, nameOf, pcOf, solfegeNotes, solfegeRound,
    type NameAs, type SolfegeSetup, type Tonality,
  } from "../../lib/games/ear-quiz";

  const SETUP_KEY = "sr-solfege-ear";
  let setup: SolfegeSetup = (() => {
    try {
      return checkSolfegeSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null"));
    } catch {
      return checkSolfegeSetup(null);
    }
  })();
  $: try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {}

  const NAME_AS: [NameAs, string][] = [["solfege", "Solfège"], ["numbers", "Scale degrees"], ["fixed", "Fixed do"], ["letters", "Letters"]];
  /** Custom's notes to choose from, low to high, as semitones from the tonic. */
  const CUSTOM_NOTES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const inScale = (t: Tonality, n: number) => (t === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11]).includes(pcOf(n));
  let customNotes: number[] = solfegeNotes(setup);

  /** A sample key for names in the setup (C major, A minor). */
  $: sample = { tonicName: setup.tonality === "minor" ? "A" : "C" };
  $: chipName = (n: number) => (n < 0 ? `low ${nameOf(setup, sample, pcOf(n))}` : n === 12 ? `high ${nameOf(setup, sample, 0)}` : nameOf(setup, sample, n));
  $: tonicWord = setup.nameAs === "solfege" ? nameOf(setup, sample, 0) : setup.nameAs === "numbers" ? "1" : "the tonic";
  $: levels = SOLFEGE_LEVELS[setup.tonality];
  $: problem = setup.level === 0 && new Set(customNotes.map(pcOf)).size < 2 ? "Choose at least two different notes." : null;

  function setTonality(t: Tonality) {
    if (t === setup.tonality) return;
    setup = checkSolfegeSetup({ ...setup, tonality: t, level: Math.min(setup.level || 1, SOLFEGE_LEVELS[t].length) });
    customNotes = solfegeNotes(setup);
  }
  function setLevel(v: string) {
    if (v === "custom") setup = checkSolfegeSetup({ ...setup, level: 0, notes: customNotes });
    else {
      setup = checkSolfegeSetup({ ...setup, level: Number(v) });
      customNotes = solfegeNotes(setup);
    }
  }
  function toggleCustom(n: number) {
    customNotes = customNotes.includes(n) ? customNotes.filter((x) => x !== n) : [...customNotes, n].sort((a, b) => a - b);
    // Kept as chosen while fewer than two pitch classes (checkSolfegeSetup would make it level 1).
    setup = { ...setup, level: 0, notes: customNotes };
  }

  function makeRound(raw: SolfegeSetup, seed: number): QuizRound {
    const s = checkSolfegeSetup(raw);
    const r = solfegeRound(s, seed);
    const name = (pc: number) => nameOf(s, r, pc);
    const ask = (i: number) => (s.tonicFirst ? [0, r.questions[i]!] : [r.questions[i]!]);
    return {
      answers: r.questions.map(pcOf),
      choices: r.choices.map((pc) => ({ value: pc, label: name(pc) })),
      intro: {
        tonic: r.tonic, pattern: keyPattern(s.tonality), chord: keyChord(s.tonality),
        names: keyPattern(s.tonality).map((d) => name(pcOf(d))), chordName: keyChord(s.tonality).map((d) => name(pcOf(d))).join(" "),
      },
      play: (i, heard) => {
        const notes = ask(i);
        return playEar({ tonic: r.tonic, pattern: null, chord: [], notes, gap: 1.1, onNote: (k) => k === notes.length - 1 && heard() });
      },
      // The right one, heard from the tonic.
      playAnswer: (i) => playEar({ tonic: r.tonic, pattern: null, chord: [], notes: [0, r.questions[i]!], gap: 0.8 }),
      answerName: (i) => name(pcOf(r.questions[i]!)),
    };
  }
  const nextLevel = (raw: SolfegeSetup) => {
    const s = checkSolfegeSetup(raw);
    return s.level > 0 && s.level < SOLFEGE_LEVELS[s.tonality].length ? { label: `Level ${s.level + 1}`, setup: { ...s, level: s.level + 1 } } : null;
  };
  const onSetup = (s: SolfegeSetup) => {
    setup = s;
    customNotes = solfegeNotes(s);
  };
  $: hint = `The key plays first, then ${QUIZ_LENGTH} notes. Name each one. Keys 1 to ${new Set(customNotes.map(pcOf)).size} answer; space plays the note again.`;
</script>

<EarQuiz game="solfege" {setup} {makeRound} {nextLevel} {onSetup} {problem} {hint}>
  <div class="setup" slot="setup">
    <div class="row" role="group" aria-label="Key">
      <span>Key</span>
      {#each [["major", "Major"], ["minor", "Minor"]] as [t, label]}
        <button type="button" class="sr-tok chip" class:sr-on={setup.tonality === t} aria-pressed={setup.tonality === t} on:click={() => setTonality(t === "minor" ? "minor" : "major")}>{label}</button>
      {/each}
    </div>
    <div class="row">
      <label for="ear-level">Level</label>
      <select id="ear-level" class="pick" value={setup.level === 0 ? "custom" : String(setup.level)} on:change={(e) => setLevel(e.currentTarget.value)}>
        {#each levels as l, i}<option value={String(i + 1)}>Level {i + 1}: {l.name}</option>{/each}
        <option value="custom">Custom</option>
      </select>
    </div>
    {#if setup.level === 0}
      <div class="row" role="group" aria-label="Notes">
        <span>Notes</span>
        {#each CUSTOM_NOTES as n}
          <button type="button" class="sr-tok chip" class:sr-on={customNotes.includes(n)} class:off-scale={!inScale(setup.tonality, n)} aria-pressed={customNotes.includes(n)} on:click={() => toggleCustom(n)}>{chipName(n)}</button>
        {/each}
      </div>
    {/if}
    <div class="row" role="group" aria-label="Name the notes as">
      <span>Name as</span>
      {#each NAME_AS as [v, label]}
        <button type="button" class="sr-tok chip" class:sr-on={setup.nameAs === v} aria-pressed={setup.nameAs === v} on:click={() => (setup = { ...setup, nameAs: v })}>{label}</button>
      {/each}
    </div>
    {#if setup.tonality === "minor" && setup.nameAs === "solfege"}
      <div class="row" role="group" aria-label="Minor in solfège">
        <span>Minor</span>
        <button type="button" class="sr-tok chip" class:sr-on={setup.minorAs === "la"} aria-pressed={setup.minorAs === "la"} on:click={() => (setup = { ...setup, minorAs: "la" })}>La-based (la ti do)</button>
        <button type="button" class="sr-tok chip" class:sr-on={setup.minorAs === "do"} aria-pressed={setup.minorAs === "do"} on:click={() => (setup = { ...setup, minorAs: "do" })}>Do-based (do re me)</button>
      </div>
    {/if}
    <div class="row" role="group" aria-label="Before each note">
      <span>Before each</span>
      <button type="button" class="sr-tok chip" class:sr-on={setup.tonicFirst} aria-pressed={setup.tonicFirst} on:click={() => (setup = { ...setup, tonicFirst: true })}>Play {tonicWord} first</button>
      <button type="button" class="sr-tok chip" class:sr-on={!setup.tonicFirst} aria-pressed={!setup.tonicFirst} on:click={() => (setup = { ...setup, tonicFirst: false })}>Just the note</button>
    </div>
    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
  </div>
</EarQuiz>

<style>
  .setup { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.9rem 1.1rem; border-radius: 22px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
  .row > span, .row > label { font-weight: 800; font-size: 0.85rem; color: var(--sr-ink-2); min-width: 5.5rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
  .chip.off-scale:not(.sr-on) { opacity: 0.7; font-style: italic; }
  .pick { border-radius: 999px; background: var(--sr-track); color: var(--sr-ink); font-size: 14px; font-weight: 700; padding: 0.4rem 2rem 0.4rem 0.9rem; max-width: 100%; }
</style>
