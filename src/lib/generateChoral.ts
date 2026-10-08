import { listedSkip, type SkipLevel } from "./uil-skips";
import { isThreePartTreble, ssaTexture, writeThreePartTreble, type SsaLevel } from "./three-part-treble";
import { barShapeWeight, twoPartKind, writeTwoPartTreble, type TwoPartKind } from "./two-part-treble";
import { prepareVoiceParts } from "./prep-params";
import { generateRandomRhythm } from "./rhythm-generation";
import { generateChordProgression } from "./chord-generation";
import { buildChordNotes } from "./build-chord-notes";
import { assembleAbcString, type AbcDisplayOptions, type AbcMetadata } from "./abc-assembly";
import { applyUnisonSpans } from "./unison-spans";
import { applyRhymingPhrases, decorateRestatement } from "./rhyming-phrases";
import { bassChromaticFaults } from "./bass-chromatic-check";
import { generateNonChordTones } from "./non-chord-tone-gen";
import { chordOnsets, varyVoiceRhythms } from "./voice-rhythm";

/**
 * How often a place where one part could sing a dotted quarter and eighth
 * against quarters in the others gets it, when the level allows the figure.
 */
const DOTTED_IN_ONE_PART = 0.3;
import { nctPatternsFor } from "./nct-patterns";
import { canAppearInChoral } from "./selectable-rhythms";
import {
  applyVoiceTexture,
  mergeRestsWithinMeasures,
  type VoiceTexture,
} from "./voice-texture";
// Separate imports for types and values
import type {
  Chord,
  Note,
  Rhythm,
  VoicePart,
  VoiceNote,
  TimeSignature,
  PartsObject,
  Cadence,
} from "./types";
import { allCadences } from "./types"; // Import the value separately

// Interface for the main function parameters
export interface GenerateChoralParams {
  /** Whether parts may enter late or drop out; see voice-texture.ts. */
  voiceTexture?: VoiceTexture;
  /** Per-rhythm frequency multipliers, by rhythm name. 1 leaves one alone. */
  rhythmBias?: Record<string, number>;
  key: string;
  timeSig: TimeSignature;
  partsObject: PartsObject; // Contains info about voices, ranges, clefs

  measures: number;
  maxSkip: number;
  bpm: number;
  selectedRhythms: Rhythm[];
  chords: Chord[];
  title?: string;
  composer?: string;
  accidentalsByStep: boolean;
  /** Probability (0–1) that a given chord tone will be subdivided into an NCT. */
  nctProbability?: number;
  /** Optional allowlist of chord names; if provided, only these chords are used. */
  allowedChordNames?: string[];
  /** Weight multiplier for chromatic chords (secondary dominants, etc.). Default 1. */
  chromaticFrequency?: number;
  /**
   * A chromatic chord to drill, by name ("5/5" for V/V). The exercise leaves
   * out every other chromatic chord, reaches for this one harder, and is
   * regenerated if it does not appear. Its inversions come with it. Major keys
   * only - the chromatic chords it names are major-mode ones - so a minor key
   * drawn from a mixed selection ignores it.
   */
  focusChord?: string;
  /** MIDI program for playback; see src/lib/instruments.ts. */
  midiProgram?: number;
  /** Which annotations to print. Also changeable afterwards via `render`. */
  display?: AbcDisplayOptions;
  /**
   * How likely a two-part exercise is to open in unison before the parts split.
   * See unisonProbabilityFor in unison-spans.ts; 0 disables it entirely.
   */
  unisonProbability?: number;
  /**
   * How likely the exercise is to be built as parallel periods - the consequent
   * phrase opening with the antecedent's material and departing only at the
   * cadence. See rhymeProbabilityFor in rhyming-phrases.ts; 0 disables it.
   */
  rhymeProbability?: number;
  /**
   * The pairs of parts written melody first: the upper as a tune, the lower
   * as a harmony part under it in thirds and sixths (two-part-treble.ts).
   * Takes effect only when the voicing is one of them. See melodyFirstFor.
   */
  melodyFirst?: TwoPartKind[];
  /** Written melody first, leap only as UIL lists for this level (uil-skips.ts). See skipLevelFor. */
  skipLevel?: SkipLevel | null;
  /**
   * Three treble parts (SSA) written melody first, in the texture of that
   * level's pieces (three-part-treble.ts). See ssaLevelFor.
   */
  ssaLevel?: SsaLevel | null;
  /** False: no rest as an inner phrase's breath (the level avoids rests). See rhythm-generation. */
  breathRests?: boolean;
  /**
   * Restrict decoration to particular non-chord-tone types by name - the names
   * in the library in non-chord-tone-gen: "Suspension", "Passing Tone",
   * "Neighbor Tone", "Anticipation", "Appoggiatura". Undefined means all of
   * them, which is the normal case.
   *
   * The generator has always taken this; it was simply never reachable from
   * here, so there was no way to ask which decoration a given fault came from.
   */
  enabledNctTypes?: string[];
  /**
   * Eighth notes (and anything shorter) are approached and left by step or by
   * a repeated pitch - never by skip. That is how choral sight-reading writes
   * them: the skips go on the longer notes. Unset leaves the old behaviour, in
   * which a pattern's eighths arpeggiated its chord.
   *
   * Applies to the voice-leading search (upper voices and bass) and to
   * decoration, where it refuses any figure that leaps next to a short note -
   * an appoggiatura or escape tone on eighths, not on quarters.
   */
  stepwiseEighths?: boolean;
}

/** What generateChoralExercise returns. */
export type ChoralExercise = {
  abcString: string;
  chordProgression: Chord[];
  voiceNotes: VoiceNote[][];
  voiceNames: string[];
  /**
   * The rhythm as generated, before decoration subdivided any of it.
   *
   * Exposed so analysis can line `chordProgression` up with the notes. Every
   * voice shares this rhythm, but decoration then splits notes per voice, so
   * the chord boundaries cannot be recovered from `voiceNotes` alone - the
   * onsets common to all voices are a superset of them. Nothing in generation
   * reads this back; it is the rhythm the exercise was built from.
   */
  rhythmSteps: Rhythm[];
  /** Re-write the same exercise with different annotations. See below. */
  render: (display?: AbcDisplayOptions & { midiProgram?: number }) => string;
  /** The same, as plain data - see ChoralRenderInput. */
  renderInput: ChoralRenderInput;
  /**
   * How many finished exercises were thrown away for a chromatic bass note
   * that broke its rule before this one was accepted. 0 nearly always; see
   * generateChoralExercise.
   */
  regenerated: number;
};

/**
 * How many times an exercise is generated over for a chromatic bass note that
 * breaks its rule, before the best attempt is accepted anyway.
 *
 * The generator enforces the rule while it writes and gets it right on all but
 * about one exercise in several hundred - a genuine dead end each time, which
 * the deadlock escape writes its way out of with a leap rather than failing.
 * More retries inside the search cannot reach those, because nothing there
 * reports a failure. A check on the finished exercise can. At that fault rate
 * three draws cost under 1% extra time and the chance of three faulty ones in
 * a row is negligible; the cap is there so a cell where the rule genuinely
 * cannot be kept still produces an exercise.
 */
const BASS_RULE_ATTEMPTS = 3;

/**
 * How many more times a failed exercise is drawn again, same settings, before
 * the reader is told it could not be written.
 *
 * The rhythm is drawn once per attempt, and every progression the attempt
 * tries is fitted to that one rhythm. Some rhythms cannot be harmonised under
 * the level's rules - eighths where a two-bar cadence has to go, say - and then
 * all ten progressions fail together, whatever they are. A new attempt draws a
 * new rhythm. Measured 29 September at the worst cells: UIL 5, 4 Part Mixed,
 * C minor, 3/4, two bars, 24 in 100 failed on one draw and none in 100 on up
 * to three; 3 Part Treble, C minor, 16 bars, 4 in 40 and none. Nothing is
 * relaxed - the exercise is the one asked for - and a failed draw costs 7 ms
 * at two bars and about a second at sixteen.
 */
const FAILED_DRAW_RETRIES = 3;

/**
 * Orchestrates the generation of a choral sight-reading exercise.
 *
 * Generates, checks the bass against the chromatic-note rule, and generates
 * again on a fault - see BASS_RULE_ATTEMPTS. Only when accidentalsByStep is
 * on, since that is the option the rule belongs to.
 *
 * @param params - The parameters for generation.
 * @returns An object containing the final ABC string and the generated chord progression.
 */
export function generateChoralExercise(params: GenerateChoralParams): ChoralExercise {
  let best: ChoralExercise | undefined;
  let bestFaults = Infinity;
  let failedDraws = 0;
  const attempts = params.accidentalsByStep ? BASS_RULE_ATTEMPTS : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let out: ChoralExercise;
    try {
      out = generateChoralExerciseOnce(params);
    } catch (e) {
      // A failed draw after a successful one is not a failed exercise.
      if (best) break;
      // Before any success: draw again, with a new rhythm - see FAILED_DRAW_RETRIES.
      if (failedDraws++ < FAILED_DRAW_RETRIES) {
        attempt--;
        continue;
      }
      throw e;
    }
    const faults = params.accidentalsByStep ? bassChromaticFaults(out.voiceNotes) : 0;
    if (faults < bestFaults) {
      best = { ...out, regenerated: attempt };
      bestFaults = faults;
    }
    if (faults === 0) break;
  }
  return best!;
}

/** How often a melody-first exercise's inner cadences pair as question and answer (half, then authentic). */
const PHRASE_PAIR_RATE = 0.85;

function generateChoralExerciseOnce(params: GenerateChoralParams): ChoralExercise {

  const {
    key,
    timeSig,
    partsObject,

    measures,
    maxSkip,
    bpm,
    selectedRhythms,
    accidentalsByStep,
    nctProbability = 0.1,
    allowedChordNames,
    chromaticFrequency = 1,
  } = params;

  const isMinor = key.endsWith('m');

  // Filter chord list if allowedChordNames is specified (UIL presets etc.)
  const allowedPool = allowedChordNames && allowedChordNames.length > 0
    ? params.chords.filter((c) => allowedChordNames.includes(c.name))
    : params.chords;

  // Further restrict to the correct mode so major and minor chords never mix.
  const inMode = allowedPool.filter((c) =>
    isMinor ? c.mode === "minor" : c.mode !== "minor"
  );

  // Drilling one chromatic chord: it is added if the allowlist left it out, and
  // every OTHER chromatic chord goes, so the exercise is about that one.
  const focus =
    params.focusChord && !isMinor
      ? params.chords.find((c) => c.name === params.focusChord && c.mode !== "minor")
      : undefined;
  const isChromatic = (c: Chord) =>
    (c.sharpScaleDegree !== undefined && c.sharpScaleDegree !== null) ||
    (c.flatScaleDegree !== undefined && c.flatScaleDegree !== null);
  const chords = focus
    ? [
        ...inMode.filter((c) => !isChromatic(c) || c.chordFamily === focus.chordFamily),
        ...params.chords.filter(
          (c) =>
            c.chordFamily === focus.chordFamily &&
            c.mode !== "minor" &&
            !inMode.some((d) => d.name === c.name)
        ),
      ]
    : inMode;
  const hasFocus = (progression: Chord[]) =>
    !focus || progression.some((c) => c.chordFamily === focus.chordFamily);

  // --- Input Validation ---
  if (!selectedRhythms || selectedRhythms.length === 0) {
    throw new Error("No rhythms selected for generation.");
  }
  if (!chords || chords.length === 0) {
    throw new Error("No chords provided for generation.");
  }
  // Add more validation as needed...

  // --- Generation Pipeline ---

  // 1. Prepare Voice Parts

  const partRanges = Object.fromEntries(
    Object.entries(partsObject.parts).map(([name, part]) => [
      name,
      part.currentRange,
    ])
  );
  const voiceParts: VoicePart[] = prepareVoiceParts(
    key,
    partRanges,
    partsObject
  );

  const pairKind = twoPartKind(voiceParts);
  const melodyFirst = !!pairKind && !!params.melodyFirst?.includes(pairKind);
  const ssa = params.ssaLevel && isThreePartTreble(voiceParts) ? params.ssaLevel : null;
  const ssaTextureHere = ssa ? ssaTexture(ssa) : null;

  // Separate the input rhythms into main generation rhythms and potential NCT patterns
  const mainRhythms = params.selectedRhythms.filter((r) => {
    // A figure shorter than a quarter is excluded as a *standalone* rhythm,
    // because every standalone note takes its own chord - a bare eighth would
    // mean the harmony changing twice a beat. Longer than a measure has nowhere
    // to fit. Shared with the picker so it can show what will be ignored rather
    // than dropping it silently.
    if (!canAppearInChoral(r, timeSig.tsPerMeasure)) {
      return false;
    }
    // A *pattern* used to be excluded too if it contained anything shorter than
    // a quarter, which is every eighth-bearing rhythm there is. The effect was
    // that a choral exercise could never contain an eighth note at any level:
    // dotQuarterEighth, eighthEighth, eighthQuarterEighth and the rest were all
    // silently dropped, so UIL 2 listed a dotted quarter-eighth that could not
    // appear. Unison never had this restriction - it passes
    // disableRhythmFilter, with the comment "disable the quarter note or longer
    // filter".
    //
    // Patterns are safe where standalone short notes are not: a pattern takes
    // one chord for the whole figure (build-chord-notes only advances the chord
    // index at isPatternEnd), so a dotted quarter plus an eighth is sung over a
    // single harmony rather than changing chord on the eighth.
    return true;
  });

  // The decoration vocabulary is its own library, not the user's rhythm menu -
  // see nct-patterns.ts. The menu still sets the difficulty ceiling.
  const patternRhythms = nctPatternsFor(params.selectedRhythms);

  if (mainRhythms.length === 0) {
    throw new Error(
      "No suitable main rhythms found after filtering params.selectedRhythms."
    );
  }

  // 1.5 Generate Cadence Plan
  const numCadencePoints = Math.floor(measures / 4);
  const selectedCadences: Cadence[] = [];

  // Ensure we have a mode-appropriate Perfect Authentic cadence
  const perfectAuthenticCadence = allCadences.find(
    (c) => c.type === "Perfect Authentic" &&
      (!c.mode || c.mode === (isMinor ? "minor" : "major"))
  );
  if (!perfectAuthenticCadence) {
    throw new Error(
      "Cannot find 'Perfect Authentic' cadence definition in allCadences."
    );
  }

  // Only allow cadences that match the current mode AND whose required chords
  // exist in the filtered chord list.
  const chordSymbols = new Set(chords.map((c) => c.symbol));
  const compatibleCadences = allCadences.filter((cadence) => {
    if (cadence.mode && cadence.mode !== (isMinor ? "minor" : "major")) return false;
    if (!cadence.mode && isMinor) return false; // exclude legacy major-only cadences in minor
    return cadence.progression.every(
      (step) => !step.requiredChord || chordSymbols.has(step.requiredChord)
    );
  });
  const intermediaryCadences = compatibleCadences.filter((c) => !c.isFinal || c.type === "Half");

  for (let i = 0; i < numCadencePoints; i++) {
    const isLastCadence = i === numCadencePoints - 1;

    if (isLastCadence) {
      selectedCadences.push(perfectAuthenticCadence);
    } else {
      // Select a random compatible cadence for intermediate points
      const pool = intermediaryCadences.length > 0 ? intermediaryCadences : compatibleCadences;
      const randomIndex = Math.floor(Math.random() * pool.length);
      const randomCadence = pool[randomIndex];
      // Written melody first, the phrases pair as Blaine's pieces do: every
      // one asks at bar 4 (a half cadence) and answers at bar 8 (authentic),
      // where drawing from the pool made bar 4 a half cadence only now and
      // then - and the suspension that half cadence carries with it.
      const half = pool.find((c) => c.type === "Half");
      const planned =
        (melodyFirst || ssa) && Math.random() < PHRASE_PAIR_RATE
          ? i % 2 === 0 ? half ?? randomCadence : perfectAuthenticCadence
          : randomCadence;
      selectedCadences.push(planned);
    }
  }

  // TODO: Use 'selectedCadences' later in chord generation logic

  // 2. Generate Rhythm using ONLY mainRhythms
  const generatedRhythms = generateRandomRhythm(
    timeSig,
    measures,
    mainRhythms,
    selectedCadences,
    // The filtering above has already been done, and generateRandomRhythm's own
    // copy of it would re-apply the pattern restriction just removed.
    true,
    false,
    // A choral exercise is sung, not drilled: quarters and halves carry it and
    // the fast figures are punctuation. A unison rhythm exercise is the
    // opposite, so this is not the generator's default.
    {
      favorLongerNotes: true,
      weightBias: params.rhythmBias,
      // Melody first, the bars take the shapes of the beginning repertoire: a half on the downbeat.
      breathRests: params.breathRests,
      positionWeight: melodyFirst ? (r, pos) => barShapeWeight(r, pos, timeSig.tsPerMeasure, pairKind ?? "SA") : undefined,
    }
  );
  const finalRhythms: Rhythm[] = generatedRhythms as Rhythm[];

  // Count chords needed - patterns count as one chord
  const numNotes = finalRhythms.reduce((count, rhythm) => {
    if (rhythm.rest) return count;
    if (rhythm.isPatternNote) {
      // Only count the start of a pattern
      return rhythm.isPatternStart ? count + 1 : count;
    }
    return count + 1;
  }, 0);


  // 4. Generate Chord Progression & Bass Line
  const bassRange = voiceParts.find((p) => p.order === 0)?.range;
  if (!bassRange) {
    throw new Error("Bass voice part not found or has no range.");
  }
  // Steps 3+4 share a retry loop: if voice assignment fails (e.g., no voice can approach
  // an accidental by step), regenerate the chord progression and try again.
  let chordProgression: Chord[] = [];
  let bassLine: Note[] = [];
  let voiceNotes: VoiceNote[][] | null = null;
  const maxChordAttempts = 10;

  for (let chordalAttempt = 0; chordalAttempt < maxChordAttempts; chordalAttempt++) {
    const result = generateChordProgression(
      chords,
      numNotes,
      bassRange,
      maxSkip,
      key,
      finalRhythms,
      selectedCadences,
      accidentalsByStep,
      chromaticFrequency,
      params.stepwiseEighths ?? false,
      focus?.chordFamily
    );
    chordProgression = result.progression;
    bassLine = result.bassLine;
    // An exercise drilling a chord that never sounds it is not the exercise
    // asked for. Try again - but not with the last attempts, so a progression
    // that cannot reach the chord still produces an exercise rather than none.
    if (!hasFocus(chordProgression) && chordalAttempt < maxChordAttempts - 3) {
      continue;
    }

    // 5. Build Chord Notes for All Voices
    try {
      if (melodyFirst || ssaTextureHere) {
        if (ssaTextureHere) {
          const written = writeThreePartTreble({ key, rhythms: finalRhythms, progression: chordProgression, chords, voiceParts, maxSkip, tsPerMeasure: timeSig.tsPerMeasure, texture: ssaTextureHere, skipLevel: params.skipLevel });
          voiceNotes = written.voiceNotes;
          chordProgression = written.progression;
          break;
        }
        // The tune chooses its chords; the planned ones are kept into each cadence.
        const written = writeTwoPartTreble({ key, rhythms: finalRhythms, progression: chordProgression, chords, voiceParts, kind: pairKind!, skipLevel: params.skipLevel, maxSkip, tsPerMeasure: timeSig.tsPerMeasure });
        voiceNotes = written.voiceNotes;
        chordProgression = written.progression;
        break;
      }
      voiceNotes = buildChordNotes(
        key,
        finalRhythms,
        chordProgression,
        voiceParts,
        bassLine,
        maxSkip,
        accidentalsByStep,
        undefined,
        params.stepwiseEighths ?? false,
        // The last progressions only: a skip beside an eighth rather than no
        // exercise. See STEPWISE_YIELD_AFTER in build-chord-notes.
        chordalAttempt >= maxChordAttempts - 3
      );
      break; // success
    } catch (e) {
      if (chordalAttempt === maxChordAttempts - 1) throw e;
    }
  }
  // 4.5 Voice texture - silence individual parts so they can enter one at a
  // time or drop out. Runs before decoration on purpose: the NCT pass skips
  // rests, so a silenced note is never decorated, and its cross-voice guards
  // then see the texture that will actually sound.
  const finalVoiceNotes = applyVoiceTexture(voiceNotes!, {
    texture: params.voiceTexture ?? "full",
    measures,
    tsPerMeasure: timeSig.tsPerMeasure,
  });

  // At a level that lists its skips (1-2), decoration keeps to the figures
  // that move by step: an escape tone or appoggiatura leaps, and slipped an
  // unlisted skip past the writers (1 in 744 at Level 2, do up to sol).
  const nctTypes =
    params.enabledNctTypes ??
    (params.skipLevel ? ["Suspension", "Passing Tone", "Neighbor Tone", "Rearticulation", "Anticipation"] : undefined);

  // 5. Apply Non-Chord Tone Generation
  // Voices are decorated in turn, each seeing the voices already decorated
  // rather than the original chord tones. Passing the undecorated set to every
  // voice let two of them place a decoration at the same instant, each checked
  // against the other's *original* note - so they could clash with each other
  // and nothing noticed.
  const notesWithNCTs: VoiceNote[][] = [...finalVoiceNotes];
  finalVoiceNotes.forEach((partNotes, index) => {
    notesWithNCTs[index] = generateNonChordTones(
      partNotes,
      patternRhythms,
      notesWithNCTs,
      index,
      nctProbability,
      key,
      nctTypes,
      // Decoration has to stay inside the singer's range like everything else.
      voiceParts[index]?.range,
      // ...and needs to know where in the bar it is, for the suspension rule.
      timeSig.tsPerMeasure,
      params.stepwiseEighths ?? false
    );
  });

  // 6. Assemble ABC Notation String
  const abcParams = {
    title: params.title || `Sight Reading Exercise in ${key}`,
    // On every score, and so on every printed copy handed round a choir room.
    composer: params.composer || "abc-sightreading.com",
    // meter: timeSig.name, // Removed, passed separately
    // defaultLength: "1/32", // Removed, handled in assembleAbcString
    // key: key, // Removed, passed separately
    tempo: bpm,
    midiProgram: params.midiProgram ?? 0,
  };
  // Two parts singing together for a stretch, then splitting - the way beginner
  // two-part music opens. After decoration deliberately: run before it and each
  // voice gets its own passing tones, which breaks the unison a note at a time.
  // Splicing here means both parts share the same decorated line.
  const withUnison = applyUnisonSpans(notesWithNCTs, {
    measures,
    tsPerMeasure: timeSig.tsPerMeasure,
    ranges: voiceParts.map((vp) => vp.range as [number, number]),
    maxSkip,
    // Written melody first, the parts sing in harmony from the start (Blaine's
    // Level 1 SA piece does), meeting in unison only where a phrase ends.
    probability: melodyFirst ? 0 : params.unisonProbability ?? 0,
  });

  // The consequent phrase rhymes the antecedent, making the exercise a parallel
  // period rather than two unrelated four-measure halves. After the unison
  // splice, for the same reason that one runs after decoration: it copies the
  // material as actually sung. Declines rather than fails - see the module.
  const restatements: { start: number; length: number }[] = [];
  const rhymed = applyRhymingPhrases(withUnison, {
    measures,
    tsPerMeasure: timeSig.tsPerMeasure,
    maxSkip,
    ranges: voiceParts.map((vp) => vp.range as [number, number]),
    probability: params.rhymeProbability ?? 0,
    // Every join and swapped note keeps the exercise's own leap rules: an
    // eighth reached and left by step (it checked maxSkip alone, and 6% of
    // short notes in SSA restatements were leapt to - "too much skip in 8th
    // notes", Blaine, 7 October 2026), and Level 1's list of skips.
    leapOk: (from, to) =>
      (!(params.stepwiseEighths ?? false) || (from.length >= 8 && to.length >= 8) || Math.abs(to.pitchValue - from.pitchValue) <= 1) &&
      (!((melodyFirst || ssa) && params.skipLevel) || listedSkip(params.skipLevel!, from, to)),
    onRestatement: (start, length) => restatements.push({ start, length }),
  });

  // ...and the answer gets a decoration the statement does not have. Only when
  // decoration is on at all: a director who turned it to zero asked for plain
  // chord tones, in the answer as much as anywhere.
  const withRhyme =
    nctProbability > 0
      ? restatements.reduce(
          (voices, { start, length }) =>
            decorateRestatement(voices, start, length, (vs, topIndex, noteIndex) =>
              generateNonChordTones(
                vs[topIndex],
                patternRhythms,
                vs,
                topIndex,
                1,
                key,
                nctTypes,
                voiceParts[topIndex]?.range,
                timeSig.tsPerMeasure,
                params.stepwiseEighths ?? false,
                new Set([noteIndex])
              )
            ),
          rhymed
        )
      : rhymed;

  // One voice's rhythm, adjusted after everything else is written: a dotted
  // quarter and eighth whose eighth leaps is sung as two quarters, and where
  // the level allows the dotted figure, one part now and then takes it against
  // quarters in the others. See voice-rhythm.ts.
  const voiced = varyVoiceRhythms(withRhyme, {
    onsets: chordOnsets(finalRhythms),
    tsPerMeasure: timeSig.tsPerMeasure,
    stepwiseEighths: params.stepwiseEighths ?? false,
    dottedAllowed: selectedRhythms.some((r) => r.name === "dotQuarterEighth"),
    probability: DOTTED_IN_ONE_PART,
  });

  // Adjacent rests inside a measure become one rest, so a silent measure reads
  // as a whole rest rather than four quarter rests. Last, after everything
  // time-based has run.
  const tidied = voiced.map((voice) =>
    mergeRestsWithinMeasures(voice, timeSig.tsPerMeasure)
  );

  /**
   * Re-write the score with different annotations, without regenerating it.
   *
   * Solfège and chord symbols change nothing about the music, so turning them on
   * or off should not cost the singer the exercise on screen. Everything the
   * assembler needs is captured here rather than handed back to the caller:
   * `voiceParts` carries a possibleNotes list per part and a chordNotes array
   * the builder mutates, and that is not something a UI component should be
   * holding.
   *
   * `midiProgram` is threaded through because the instrument can be changed
   * after generation. Re-assembling from the captured metadata alone would quietly
   * reset playback to whatever instrument was chosen when the exercise was made.
   */
  const renderInput: ChoralRenderInput = {
    voices: tidied,
    voiceParts,
    rhythms: finalRhythms,
    key,
    timeSig,
    metadata: abcParams,
  };
  const render = (
    display: AbcDisplayOptions & { midiProgram?: number } = {}
  ): string => renderChoral(renderInput, display);

  const abcString = render(params.display ?? {});


  return {
    abcString,
    chordProgression: chordProgression,
    // The notes as actually rendered - after the unison splice and the rest
    // merge. Returning the pre-splice array made a two-part unison invisible to
    // every caller that inspects voiceNotes, while the score showed it.
    voiceNotes: tidied,
    voiceNames: voiceParts.map((vp) => vp.name),
    rhythmSteps: finalRhythms,
    render,
    renderInput,
    regenerated: 0,
  };
}

/**
 * Everything `render` needs, as plain data.
 *
 * `render` is a closure, and a closure cannot leave the thread it was made on.
 * Generation runs in a worker (see choral-jobs.ts) so a hard exercise cannot
 * freeze the page, and what comes back is this - from which the page rebuilds
 * `render` with renderChoral, so the annotation toggles still re-write the
 * exercise on screen instead of replacing it.
 */
export type ChoralRenderInput = {
  voices: VoiceNote[][];
  voiceParts: VoicePart[];
  rhythms: Rhythm[];
  key: string;
  timeSig: TimeSignature;
  metadata: AbcMetadata;
};

/** Write a generated exercise as ABC with the annotations asked for. */
export function renderChoral(
  input: ChoralRenderInput,
  display: AbcDisplayOptions & { midiProgram?: number } = {}
): string {
  return assembleAbcString(
    input.voices,
    input.voiceParts,
    input.rhythms,
    input.key,
    input.timeSig,
    { ...input.metadata, midiProgram: display.midiProgram ?? input.metadata.midiProgram },
    display
  );
}
