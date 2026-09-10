import { prepareVoiceParts } from "./prep-params";
import { generateRandomRhythm } from "./rhythm-generation";
import { generateChordProgression } from "./chord-generation";
import { buildChordNotes } from "./build-chord-notes";
import { assembleAbcString } from "./abc-assembly";
import { generateNonChordTones } from "./non-chord-tone-gen";
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
  /** MIDI program for playback; see src/lib/instruments.ts. */
  midiProgram?: number;
}

/**
 * Orchestrates the generation of a choral sight-reading exercise.
 *
 * @param params - The parameters for generation.
 * @returns An object containing the final ABC string and the generated chord progression.
 */
export function generateChoralExercise(params: GenerateChoralParams): {
  abcString: string;
  chordProgression: Chord[];
  voiceNotes: VoiceNote[][];
  voiceNames: string[];
} {
  console.log("--- generateChoralExercise START ---");
  console.log("Received params:", JSON.stringify(params, null, 2));

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
  const chords = allowedPool.filter((c) =>
    isMinor ? c.mode === "minor" : c.mode !== "minor"
  );

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
  console.log("1. Preparing Voice Parts...");
  console.log("Preparing voice parts with ranges:", {
    parts: partsObject.parts,
    ranges: Object.fromEntries(
      Object.entries(partsObject.parts).map(([name, part]) => [
        name,
        part.currentRange,
      ])
    ),
  });

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
  console.log(`  Prepared ${voiceParts.length} voice parts.`);
  console.log(voiceParts);

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
  console.log(
    `  Filtered ${params.selectedRhythms.length} input rhythms into ${mainRhythms.length} main rhythms; ${patternRhythms.length} NCT patterns available.`
  );

  // 1.5 Generate Cadence Plan
  console.log("1.5 Generating Cadence Plan...");
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
      console.log(`  Cadence Point ${i + 1} (Last): Forced Perfect Authentic`);
    } else {
      // Select a random compatible cadence for intermediate points
      const pool = intermediaryCadences.length > 0 ? intermediaryCadences : compatibleCadences;
      const randomIndex = Math.floor(Math.random() * pool.length);
      const randomCadence = pool[randomIndex];
      selectedCadences.push(randomCadence);
      console.log(`  Cadence Point ${i + 1}: Selected ${randomCadence.type}`);
    }
  }

  // TODO: Use 'selectedCadences' later in chord generation logic

  // 2. Generate Rhythm using ONLY mainRhythms
  console.log("2. Generating Rhythm (using main rhythms only)...");
  console.log(
    `  Params: timeSig=${timeSig.name}, measures=${measures}, mainRhythms count=${mainRhythms.length}`
  );
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
    { favorLongerNotes: true, weightBias: params.rhythmBias }
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

  console.log(
    `  Generated ${finalRhythms.length} rhythm steps, ${numNotes} chords needed.`
  );
  console.log(
    "  Rhythm array details:",
    finalRhythms.map((r) => ({
      name: r.name,
      totalValue: r.totalValue,
      meterValue: r.meterValue,
      abcValue: r.abcValue,
      rest: r.rest,
      pattern: r.pattern,
      isPatternNote: r.isPatternNote,
      isPatternStart: r.isPatternStart,
      isPatternEnd: r.isPatternEnd,
      patternIndex: r.patternIndex,
    }))
  );

  // 4. Generate Chord Progression & Bass Line
  console.log("3. Generating Chord Progression & Bass Line...");
  const bassRange = voiceParts.find((p) => p.order === 0)?.range;
  if (!bassRange) {
    throw new Error("Bass voice part not found or has no range.");
  }
  console.log(
    `  Params: chords count=${
      chords.length
    }, numNotes=${numNotes}, bassRange=[${bassRange.join(
      ", "
    )}], maxSkip=${maxSkip}, key=${key}`
  );
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
      chromaticFrequency
    );
    chordProgression = result.progression;
    bassLine = result.bassLine;
    console.log(
      `  Attempt ${chordalAttempt + 1}: progression length=${chordProgression.length}, bass line length=${bassLine.length}`
    );

    // 5. Build Chord Notes for All Voices
    console.log("4. Building Chord Notes...");
    try {
      voiceNotes = buildChordNotes(
        key,
        finalRhythms,
        chordProgression,
        voiceParts,
        bassLine,
        maxSkip,
        accidentalsByStep
      );
      console.log(`  Built notes for ${voiceNotes.length} voices.`);
      break; // success
    } catch (e) {
      if (chordalAttempt === maxChordAttempts - 1) throw e;
      console.log(`  Voice assignment failed (attempt ${chordalAttempt + 1}), retrying with new progression...`);
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

  // 5. Apply Non-Chord Tone Generation
  console.log("5. Applying Non-Chord Tone Generation...");
  console.log(`  NCT probability: ${nctProbability}`);
  // Voices are decorated in turn, each seeing the voices already decorated
  // rather than the original chord tones. Passing the undecorated set to every
  // voice let two of them place a decoration at the same instant, each checked
  // against the other's *original* note - so they could clash with each other
  // and nothing noticed.
  const notesWithNCTs: VoiceNote[][] = [...finalVoiceNotes];
  finalVoiceNotes.forEach((partNotes, index) => {
    console.log(`  Processing voice index ${index} for NCTs...`);
    notesWithNCTs[index] = generateNonChordTones(
      partNotes,
      patternRhythms,
      notesWithNCTs,
      index,
      nctProbability,
      key,
      undefined,
      // Decoration has to stay inside the singer's range like everything else.
      voiceParts[index]?.range
    );
  });
  console.log(`  Finished NCT generation.`);

  // 6. Assemble ABC Notation String
  console.log("6. Assembling ABC String...");
  const abcParams = {
    title: params.title || `Sight Reading Exercise - ${key}`,
    composer: params.composer || "Generated by ABCSightreading",
    // meter: timeSig.name, // Removed, passed separately
    // defaultLength: "1/32", // Removed, handled in assembleAbcString
    // key: key, // Removed, passed separately
    tempo: bpm,
    midiProgram: params.midiProgram ?? 0,
  };
  console.log(
    `  Params: voiceNotes count=${notesWithNCTs.length}, voiceParts count=${voiceParts.length}, rhythms count=${finalRhythms.length}, key=${key}, timeSig=${timeSig.name}, metadata=${JSON.stringify(abcParams)}`
  );
  // Adjacent rests inside a measure become one rest, so a silent measure reads
  // as a whole rest rather than four quarter rests. Last, after everything
  // time-based has run.
  const tidied = notesWithNCTs.map((voice) =>
    mergeRestsWithinMeasures(voice, timeSig.tsPerMeasure)
  );

  const abcString = assembleAbcString(
    tidied,
    voiceParts,
    finalRhythms,
    key,
    timeSig,
    abcParams
  );

  console.log(abcString);

  console.log("--- generateChoralExercise END ---");
  return {
    abcString,
    chordProgression: chordProgression,
    voiceNotes: notesWithNCTs,
    voiceNames: voiceParts.map((vp) => vp.name),
  };
}
