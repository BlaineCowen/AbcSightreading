import { prepareVoiceParts } from "./prep-params";
import { generateRandomRhythm } from "./rhythm-generation";
import { generateChordProgression } from "./chord-generation";
import { buildChordNotes } from "./build-chord-notes";
import { assembleAbcString } from "./abc-assembly";
import { generateNonChordTones } from "./non-chord-tone-gen";
// Separate imports for types and values
import type {
  Chord,
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
  } = params;

  // Filter chord list if allowedChordNames is specified (UIL presets etc.)
  const chords = allowedChordNames && allowedChordNames.length > 0
    ? params.chords.filter((c) => allowedChordNames.includes(c.name))
    : params.chords;

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
    if (r.totalValue < 8 || r.totalValue > timeSig.tsPerMeasure) {
      return false; // Exclude shorter than quarter or longer than measure
    }
    if (r.pattern && r.abcValue.some((abcVal) => parseInt(abcVal) < 8)) {
      return false; // Exclude patterns containing notes shorter than quarter
    }
    return true;
  });

  const patternRhythms = params.selectedRhythms.filter(
    (r) => r.pattern === true
  );

  if (mainRhythms.length === 0) {
    throw new Error(
      "No suitable main rhythms found after filtering params.selectedRhythms."
    );
  }
  console.log(
    `  Filtered ${params.selectedRhythms.length} input rhythms into ${mainRhythms.length} main rhythms and ${patternRhythms.length} pattern rhythms for NCT.`
  );

  // 1.5 Generate Cadence Plan
  console.log("1.5 Generating Cadence Plan...");
  const numCadencePoints = Math.floor(measures / 4);
  const selectedCadences: Cadence[] = [];

  // Ensure we have Perfect Authentic defined
  const perfectAuthenticCadence = allCadences.find(
    (c) => c.type === "Perfect Authentic"
  );
  if (!perfectAuthenticCadence) {
    throw new Error(
      "Cannot find 'Perfect Authentic' cadence definition in allCadences."
    );
  }

  // Only allow cadences whose required chords exist in the filtered chord list.
  // (e.g. Deceptive cadence requires vi, but UIL 1-4 don't allow it.)
  const chordSymbols = new Set(chords.map((c) => c.symbol));
  const compatibleCadences = allCadences.filter((cadence) =>
    cadence.progression.every(
      (step) => !step.requiredChord || chordSymbols.has(step.requiredChord)
    )
  );
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
    selectedCadences
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
  const result = generateChordProgression(
    chords,
    numNotes,
    bassRange,
    maxSkip,
    key,
    finalRhythms,
    selectedCadences
  );
  const chordProgression = result.progression;
  const bassLine = result.bassLine;
  console.log(
    `  Generated progression length=${chordProgression.length}, bass line length=${bassLine.length}`
  );

  // 5. Build Chord Notes for All Voices
  console.log("4. Building Chord Notes...");
  console.log(
    `  Params: key=${key}, rhythms count=${finalRhythms.length}, progression count=${chordProgression.length}, voiceParts count=${voiceParts.length}, bassLine count=${bassLine.length}`
  );
  const voiceNotes: VoiceNote[][] = buildChordNotes(
    key,
    finalRhythms,
    chordProgression,
    voiceParts,
    bassLine,
    maxSkip,
    accidentalsByStep
  );
  console.log(`  Built notes for ${voiceNotes.length} voices.`);

  // 5. Apply Non-Chord Tone Generation
  console.log("5. Applying Non-Chord Tone Generation...");
  console.log(`  NCT probability: ${nctProbability}`);
  const notesWithNCTs: VoiceNote[][] = voiceNotes.map((partNotes, index) => {
    console.log(`  Processing voice index ${index} for NCTs...`);
    return generateNonChordTones(
      partNotes,
      patternRhythms,
      voiceNotes,
      index,
      nctProbability,
      key
    );
  });
  console.log(`  Finished NCT generation.`);

  // 6. Assemble ABC Notation String
  console.log("6. Assembling ABC String...");
  const abcParams = {
    title: params.title || `Sight Reading Exercise - ${key}`,
    composer: params.composer || "Generated by SightReadingApp",
    // meter: timeSig.name, // Removed, passed separately
    // defaultLength: "1/32", // Removed, handled in assembleAbcString
    // key: key, // Removed, passed separately
    tempo: bpm,
  };
  console.log(
    `  Params: voiceNotes count=${notesWithNCTs.length}, voiceParts count=${
      voiceParts.length
    }, rhythms count=${finalRhythms.length}, key=${key}, timeSig=${
      timeSig.name
    }, metadata=${JSON.stringify(abcParams)}`
  );
  const abcString = assembleAbcString(
    notesWithNCTs,
    voiceParts,
    finalRhythms,
    key,
    timeSig,
    abcParams
  );

  console.log(abcString);

  console.log("--- generateChoralExercise END ---");
  // Return results
  return {
    abcString,
    chordProgression: chordProgression,
  };
}
