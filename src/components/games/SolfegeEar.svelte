<script lang="ts">
  /**
   * Solfège ear training (Blaine, 17 November 2026: from learnmusic.fun,
   * "with modes for scale degree, fixed do, minor, etc."). The key plays (its
   * chord, then 1 3 5 3 1 5 1), then ten notes, each after a reference note
   * (do, mi, so or la) unless that is switched off; name each one. Levels
   * follow abcStepByStep's order (ear-quiz.ts SOLFEGE_LEVELS), major or minor,
   * or Customize: any notes, chosen on a keyboard. The notes are named in
   * movable do (minor la- or do-based), scale degrees, fixed do or letters.
   * The play itself is EarQuiz's; the answers are a keyboard too.
   *
   * 18 November 2026 (Blaine): the notes laid out as a keyboard, as on
   * learnmusic.fun; Levels and Customize as tabs (GameLevels), not Custom at
   * the bottom of a menu; which note sounds before each one (was "Play do
   * first", unclear); a key of your own; notes in any octave.
   */
  import EarQuiz, { type QuizRound } from "./EarQuiz.svelte";
  import GameLevels from "./GameLevels.svelte";
  import NoteKeyboard from "./NoteKeyboard.svelte";
  import { playEar } from "../../lib/games/game-audio";
  import {
    KEY_NAMES, QUIZ_LENGTH, REFERENCE_NOTES, SOLFEGE_LEVELS, checkSolfegeSetup, keyChord, keyPattern, nameOf, pcOf, solfegeNotes, solfegeRound,
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
  /** Customize's notes to choose from, low to high, as semitones from the tonic (low so to high do). */
  const CUSTOM_NOTES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  /** The white keys: the major scale, or natural minor (si, the raised 7th, is a black key, as G♯ in A minor). */
  const white = (t: Tonality, n: number) => (t === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).includes(pcOf(n));
  let customNotes: number[] = solfegeNotes(setup);

  /** A sample key for names in the setup (C major, A minor). */
  $: sample = { tonicName: setup.tonality === "minor" ? "A" : "C" };
  $: chipName = (n: number) => (n < 0 ? `low ${nameOf(setup, sample, pcOf(n))}` : n === 12 ? `high ${nameOf(setup, sample, 0)}` : nameOf(setup, sample, n));
  $: levels = SOLFEGE_LEVELS[setup.tonality];
  $: levelCards = levels.map((l) => ({ name: l.name, detail: l.notes.length > 9 ? `${new Set(l.notes.map(pcOf)).size} notes` : l.notes.map((n) => chipName(n)).join(" ") }));
  $: problem = setup.level === 0 && new Set(customNotes.map(pcOf)).size < 2 ? "Choose at least two different notes." : null;
  $: refName = setup.ref === null ? "" : nameOf(setup, sample, setup.ref);
  const keyLabel = (k: string) => k.replace("b", "♭");

  function setTonality(t: Tonality) {
    if (t === setup.tonality) return;
    setup = checkSolfegeSetup({ ...setup, tonality: t, level: Math.min(setup.level || 1, SOLFEGE_LEVELS[t].length), ref: REFERENCE_NOTES[t].includes(setup.ref ?? -1) ? setup.ref : setup.ref === null ? null : 0 });
    customNotes = solfegeNotes(setup);
  }
  function setLevel(i: number) {
    if (i < 0) setup = checkSolfegeSetup({ ...setup, level: 0, notes: customNotes });
    else {
      setup = checkSolfegeSetup({ ...setup, level: i + 1 });
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
    const ask = (i: number) => (s.ref !== null ? [s.ref, r.questions[i]!] : [r.questions[i]!]);
    return {
      answers: r.questions.map(pcOf),
      choices: r.choices.map((pc) => ({ value: pc, label: name(pc), black: !white(s.tonality, pc) })),
      keyboard: true,
      intro: {
        tonic: r.tonic, pattern: keyPattern(s.tonality), chord: keyChord(s.tonality),
        names: keyPattern(s.tonality).map((d) => name(pcOf(d))), chordName: keyChord(s.tonality).map((d) => name(pcOf(d))).join(" "),
      },
      play: (i, heard) => {
        const notes = ask(i);
        return playEar({ tonic: r.tonic, pattern: null, chord: [], notes, gap: 1.1, onNote: (k) => k === notes.length - 1 && heard() });
      },
      // The right one, heard from the reference note (or do).
      playAnswer: (i) => playEar({ tonic: r.tonic, pattern: null, chord: [], notes: [s.ref ?? 0, r.questions[i]!], gap: 0.8 }),
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
  $: hint = `The key plays first, then ${QUIZ_LENGTH} notes. Name each one on the keyboard. Keys 1 to ${new Set((setup.level === 0 ? customNotes : solfegeNotes(setup)).map(pcOf)).size} answer; space plays the note again.`;
</script>

<EarQuiz game="solfege" {setup} {makeRound} {nextLevel} {onSetup} {problem} {hint}>
  <div slot="setup">
    <GameLevels game="solfege" levels={levelCards} selected={setup.level - 1} on:select={(e) => setLevel(e.detail)}>
      <div slot="custom">
        <p class="lead">Tap the notes to practice. The white keys are the {setup.tonality} scale; the black keys are the notes between.</p>
        <NoteKeyboard
          label="Notes"
          keys={CUSTOM_NOTES.map((n) => ({ value: n, label: chipName(n), black: !white(setup.tonality, n) }))}
          chosen={customNotes}
          on:press={(e) => toggleCustom(e.detail)}
        />
        {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      </div>
      <div class="shared">
        <div class="row" role="group" aria-label="Major or minor">
          <span>Mode</span>
          {#each [["major", "Major"], ["minor", "Minor"]] as [t, label]}
            <button type="button" class="sr-tok chip" class:sr-on={setup.tonality === t} aria-pressed={setup.tonality === t} on:click={() => setTonality(t === "minor" ? "minor" : "major")}>{label}</button>
          {/each}
        </div>
        <div class="row" role="group" aria-label="Key">
          <span>Key</span>
          <button type="button" class="sr-tok chip" class:sr-on={setup.key === null} aria-pressed={setup.key === null} on:click={() => (setup = { ...setup, key: null })}>New each round</button>
          {#each KEY_NAMES as k}
            <button type="button" class="sr-tok chip" class:sr-on={setup.key === k} aria-pressed={setup.key === k} on:click={() => (setup = { ...setup, key: k })}>{keyLabel(k)}</button>
          {/each}
        </div>
        <div class="row" role="group" aria-label="Before each note, play">
          <span>Before each note</span>
          <button type="button" class="sr-tok chip" class:sr-on={setup.ref === null} aria-pressed={setup.ref === null} on:click={() => (setup = { ...setup, ref: null })}>Nothing</button>
          {#each REFERENCE_NOTES[setup.tonality] as n}
            <button type="button" class="sr-tok chip" class:sr-on={setup.ref === n} aria-pressed={setup.ref === n} on:click={() => (setup = { ...setup, ref: n })}>Play {nameOf(setup, sample, n)}</button>
          {/each}
        </div>
        <p class="help" data-ref-help>
          {#if setup.ref === null}Each note plays on its own, with nothing to measure it from. The hardest way.
          {:else}Every note comes right after <b>{refName}</b>, so you hear how far it is from {refName}.{/if}
        </p>
        <div class="row" role="group" aria-label="Octave">
          <span>Octave</span>
          <button type="button" class="sr-tok chip" class:sr-on={!setup.anyOctave} aria-pressed={!setup.anyOctave} on:click={() => (setup = { ...setup, anyOctave: false })}>Where the level puts them</button>
          <button type="button" class="sr-tok chip" class:sr-on={setup.anyOctave} aria-pressed={setup.anyOctave} on:click={() => (setup = { ...setup, anyOctave: true })}>Any octave</button>
        </div>
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
      </div>
    </GameLevels>
  </div>
</EarQuiz>

<style>
  .shared { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.6rem; border-top: 1px solid var(--sr-hairline); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
  .row > span { font-weight: 800; font-size: 0.85rem; color: var(--sr-ink-2); min-width: 7.5rem; }
  .chip { font-size: 0.8rem; padding: 0.25rem 0.65rem; }
  .lead, .help { font-size: 0.82rem; color: var(--sr-ink-2); }
  .help { margin-top: -0.25rem; padding-left: 7.85rem; }
  @media (max-width: 36rem) { .help { padding-left: 0; } .row > span { min-width: 100%; } }
</style>
