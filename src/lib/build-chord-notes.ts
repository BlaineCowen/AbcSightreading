import {
  type VoicePart,
  type VoiceNote,
  type Note,
  type Chord,
  type Rhythm,
} from "./types";
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";
import { generatePossibleNotes } from "./prep-params";

/** Find the index of the highest-order voice in a voiceParts array (the
 *  "soprano" or top voice). Returns -1 if voiceParts is empty. */
function findHighestOrderVoiceIndex(voiceParts: VoicePart[]): number {
  let bestIdx = -1;
  let bestOrder = -Infinity;
  for (let i = 0; i < voiceParts.length; i++) {
    if (voiceParts[i].order > bestOrder) {
      bestOrder = voiceParts[i].order;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Function to check voice leading (Ensure this is defined or imported)
function isVoiceOrderValid(pitches: number[]): boolean {
  for (let i = 0; i < pitches.length - 1; i++) {
    if (pitches[i] > pitches[i + 1]) {
      return false;
    }
  }
  return true;
}

function isDiatonicStep(a: Note, b: Note): boolean {
  return Math.abs(a.pitchValue - b.pitchValue) === 1;
}

// Helper function to shuffle an array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function determineAccidental(
  degree: number,
  chord: Chord,
  keySignatures: any,
  key: string
): {
  accidental:
    | "sharp"
    | "flat"
    | "natural"
    | "double-sharp"
    | "double-flat"
    | null;
  prefix: string;
} {
  const keyInfo = keySignatures[key];
  if (!keyInfo) {
    throw new Error(`Key signature not found for key: ${key}`);
  }

  // Check if this degree is already flat in the key signature
  const isFlattedInKey = keyInfo.flats?.includes(degree);
  // Check if this degree is already sharp in the key signature
  const isSharpenedInKey = keyInfo.sharps?.includes(degree);

  console.log(
    `\nAccidental check for degree ${degree} in ${key} with chord ${chord.name}:`
  );
  console.log(
    `  Key signature: ${
      isFlattedInKey ? "flat" : isSharpenedInKey ? "sharp" : "natural"
    }`
  );
  console.log(
    `  Chord wants: ${
      chord.sharpScaleDegree === degree
        ? "sharp"
        : chord.flatScaleDegree === degree
        ? "flat"
        : "natural"
    }`
  );
  console.log(
    `  Chord scale degrees: flat=${chord.flatScaleDegree}, sharp=${chord.sharpScaleDegree}`
  );

  let result: {
    accidental:
      | "sharp"
      | "flat"
      | "natural"
      | "double-sharp"
      | "double-flat"
      | null;
    prefix: string;
  };

  if (chord.sharpScaleDegree === degree) {
    if (isFlattedInKey) {
      // If the note is flat in the key and needs to be raised, make it natural
      result = { accidental: "natural", prefix: "=" };
    } else if (isSharpenedInKey) {
      // If already sharp in key and needs to be raised, make it double sharp
      result = { accidental: "double-sharp", prefix: "^^" };
    } else {
      // If natural in key and needs to be raised, make it sharp
      result = { accidental: "sharp", prefix: "^" };
    }
  } else if (chord.flatScaleDegree === degree) {
    if (isFlattedInKey) {
      // If already flat in key and needs to be lowered, make it double flat
      result = { accidental: "double-flat", prefix: "__" };
    } else if (isSharpenedInKey) {
      // If sharp in key and needs to be lowered, make it natural
      result = { accidental: "natural", prefix: "=" };
    } else {
      // If natural in key and needs to be lowered, make it flat
      result = { accidental: "flat", prefix: "_" };
    }
  } else {
    result = { accidental: null, prefix: "" };
  }

  console.log(
    `  Result: ${result.accidental || "none"} (prefix: ${
      result.prefix || "none"
    })\n`
  );
  return result;
}

function getMaxSkip(defaultValue: number = 4, minValue: number = 2): number {
  return defaultValue;
}

/**
 * Builds chord notes for all voices based on rhythms and chord progression.
 *
 * @param presetSoprano  Optional. When provided (length must equal the number
 *   of chord positions), the highest-order voice is filled directly from this
 *   array rather than computed by the chord-tone search. Used by the Bach SR
 *   pipeline to inject a pre-sketched soprano melody. Pattern-continuation
 *   steps still use the existing logic — only chord-start steps use the preset.
 */
export function buildChordNotes(
  key: string,
  rhythms: Rhythm[],
  progression: Chord[],
  voiceParts: VoicePart[],
  bassLine: Note[],
  maxSkip: number,
  accidentalsByStep: boolean,
  presetSoprano?: VoiceNote[]
): VoiceNote[][] {
  const keyInfo = keySignatures[key];
  if (!keyInfo) throw new Error(`Key signature not found for key: ${key}`);

  // Count chords needed - patterns count as one chord
  const chordPositions = rhythms.reduce((count, rhythm) => {
    if (rhythm.rest) return count;
    if (rhythm.isPatternNote) {
      // Only count the start of a pattern
      return rhythm.isPatternStart ? count + 1 : count;
    }
    return count + 1;
  }, 0);

  // Validate inputs
  if (progression.length !== chordPositions) {
    throw new Error(
      `Chord progression length (${
        progression.length
      }) does not match number of chord positions needed (${chordPositions}). Rhythms: ${rhythms
        .map((r) => r.name)
        .join(", ")}`
    );
  }

  if (bassLine.length !== chordPositions) {
    throw new Error(
      `Bass line length (${bassLine.length}) does not match number of chord positions needed (${chordPositions})`
    );
  }

  let totalLoopFails = 0;
  const maxTotalLoopFails = 30;

  const maxVoiceOrder = voiceParts.reduce(
    (m, vp) => (vp.order > m ? vp.order : m),
    -Infinity
  );

  function findPreviousGeneratedPitch(voiceNotes: VoiceNote[]): number | null {
    for (let i = voiceNotes.length - 1; i >= 0; i--) {
      if (!voiceNotes[i].rest) {
        return voiceNotes[i].pitchValue;
      }
    }
    return null;
  }

  function findValidVoiceNote(
    voicePart: VoicePart,
    chord: Chord,
    usedTriadDegrees: number[],
    otherVoiceNotes: VoiceNote[],
    maxSkip: number,
    previousNote?: VoiceNote,
    useAccidentalsByStep?: boolean,
    /** Parallel arrays to otherVoiceNotes — each entry is the PREVIOUS note
     *  of the corresponding other voice. Used for parallel 5/8ve detection.
     *  When undefined or empty, parallel checking is skipped. */
    otherVoicesPrev?: (VoiceNote | undefined)[],
    /** The CHORD that was active for `previousNote`. Used to detect diatonic
     *  leading-tone resolution (LT in V/V7/vii° → must step up to tonic) and
     *  chordal-7th resolution (7th of V7 → must step down). */
    previousChord?: Chord
  ): Note | null {
    // Get all notes in range
    let validNotes = voicePart.possibleNotes.filter(
      (note) =>
        note.pitchValue >= voicePart.range[0] &&
        note.pitchValue <= voicePart.range[1]
    );

    // Outer voices = soprano (top order) and bass (order 0). Inner voices are
    // the rest. The LT-resolution rule is strict for outer voices but relaxed
    // for inner voices, which may drop the LT to keep the chord complete.
    const isOuterVoice =
      voicePart.order === 0 || voicePart.order === maxVoiceOrder;

    // Detect the LT-resolution case (V/vii°→I, where the previous voice held
    // the LT and the current chord contains tonic). In minor mode the LT is
    // chromatically raised (G→G# in Am), so the previous note carries a sharp
    // accidental — that's the path that fires the chromatic block below.
    const isLeadingToneResolution =
      previousNote &&
      !previousNote.rest &&
      previousNote.degree === 6 &&
      previousChord &&
      (previousChord.type === "dominant" ||
        previousChord.type === "dominant-inversion" ||
        previousChord.type === "leading-tone") &&
      chord.triadNotes.includes(0);

    // Pre-compute forced resolution pitch before chord-tone filtering so we can
    // open up all chord tones (not just unused ones) when a resolution is forced.
    let forcedPitch: number | undefined;
    if (
      useAccidentalsByStep &&
      previousNote &&
      !previousNote.rest &&
      // Skip the chromatic resolution force ONLY for the LT case in inner voices.
      // Other chromatic notes (raised 4 in V/V, etc.) still resolve in any voice.
      !(isLeadingToneResolution && !isOuterVoice)
    ) {
      if (
        previousNote.accidental === "sharp" ||
        previousNote.accidental === "double-sharp" ||
        (previousNote.accidental === "natural" && previousNote.wasRaised === true)
      ) {
        forcedPitch = previousNote.pitchValue + 1;
      } else if (
        previousNote.accidental === "flat" ||
        previousNote.accidental === "double-flat" ||
        (previousNote.accidental === "natural" && previousNote.wasRaised === false)
      ) {
        forcedPitch = previousNote.pitchValue - 1;
      }
    }

    // Diatonic leading-tone resolution (Phase 3.2): the LT in OUTER voices
    // (soprano or bass) must resolve up to tonic. Inner voices may drop the
    // LT to the 5th of I to keep the chord complete (otherwise the chord
    // ends without a 3rd because the LT-holder steals the doubling target).
    if (
      isOuterVoice &&
      forcedPitch === undefined &&
      previousNote &&
      !previousNote.rest &&
      !previousNote.accidental &&
      previousNote.degree === 6 &&
      previousChord &&
      (previousChord.type === "dominant" ||
        previousChord.type === "dominant-inversion" ||
        previousChord.type === "leading-tone") &&
      previousChord.sharpScaleDegree !== 6 &&
      chord.triadNotes.includes(0)
    ) {
      forcedPitch = previousNote.pitchValue + 1;
    }

    // Chordal-7th resolution (Phase 3.3): if the previous note was the 7th of
    // a V7-style chord, force step down by one diatonic step. We detect a
    // "7th-style" chord by looking at the previous chord having 4 triad tones
    // (root + 3 + 5 + 7) — the last element is the 7th degree.
    if (
      forcedPitch === undefined &&
      previousNote &&
      !previousNote.rest &&
      previousChord &&
      previousChord.triadNotes.length >= 4
    ) {
      const seventhDegree =
        previousChord.triadNotes[previousChord.triadNotes.length - 1];
      if (previousNote.degree === seventhDegree) {
        // The 7th resolves DOWN by step. The resolved pitch should be a
        // chord tone of the new chord; if not, fall through (no force) so
        // the voice is free to find another note.
        const candidatePitch = previousNote.pitchValue - 1;
        forcedPitch = candidatePitch;
      }
    }

    // Chord-tone filter — when a resolution is forced, open to all triad degrees
    // so the resolution note is reachable even if its degree was already "used".
    const availableTriadDegrees = chord.triadNotes.filter(
      (deg) => !usedTriadDegrees.includes(deg)
    );
    // Fallback when every chord tone has already been assigned (4 voices on
    // a 3-tone triad must double something). Use [root, 5th] as the safe
    // generic preference; the "no double LT/7th" filter further down
    // tightens this when the chord is a dominant or seventh.
    const degreesToUse =
      forcedPitch !== undefined
        ? chord.triadNotes
        : availableTriadDegrees.length > 0
        ? availableTriadDegrees
        : [chord.triadNotes[0], chord.triadNotes[2]];

    validNotes = validNotes.filter((note) => degreesToUse.includes(note.degree));

    // Soft doubling preference: avoid doubling the LT or chordal 7th (only
    // applied when the resulting filter still has options). The "available
    // triad degrees" filter handles the common case automatically.
    const isDominantFn =
      chord.type === "dominant" ||
      chord.type === "dominant-inversion" ||
      chord.type === "leading-tone";
    const ltDegree = isDominantFn && chord.triadNotes.includes(6) ? 6 : undefined;
    const seventhDegree =
      chord.triadNotes.length >= 4
        ? chord.triadNotes[chord.triadNotes.length - 1]
        : undefined;
    const forbidDoubling = new Set<number>();
    for (const used of usedTriadDegrees) {
      if (ltDegree !== undefined && used === ltDegree) forbidDoubling.add(used);
      if (seventhDegree !== undefined && used === seventhDegree) forbidDoubling.add(used);
    }
    if (forbidDoubling.size > 0) {
      const noDouble = validNotes.filter((n) => !forbidDoubling.has(n.degree));
      if (noDouble.length > 0) validNotes = noDouble;
      // else: fall through (chord-tone constraints didn't permit avoiding
      // the doubling — the validator's soft `doubled-lt` warning will note it).
    }

    // Max-skip voice leading
    if (previousNote && !previousNote.rest) {
      validNotes = validNotes.filter(
        (note) => Math.abs(note.pitchValue - previousNote.pitchValue) <= maxSkip
      );
    }

    // Resolution-range guard: a chromatic note whose resolution pitch (pv±1) falls
    // outside this voice's range must be excluded — even on the first note of a phrase
    // — otherwise forcedPitch silently fails on the next chord.
    if (useAccidentalsByStep) {
      const willBeSharpGlobal = chord.sharpScaleDegree !== undefined && chord.sharpScaleDegree !== null;
      const willBeFlatGlobal  = chord.flatScaleDegree  !== undefined && chord.flatScaleDegree  !== null;
      if (willBeSharpGlobal || willBeFlatGlobal) {
        const isAccidentalGlobal = (note: Note) =>
          (willBeSharpGlobal && note.degree === chord.sharpScaleDegree) ||
          (willBeFlatGlobal  && note.degree === chord.flatScaleDegree);
        const resInRange = validNotes.filter((note) => {
          if (isAccidentalGlobal(note)) {
            const resPitch = willBeSharpGlobal ? note.pitchValue + 1 : note.pitchValue - 1;
            return resPitch >= voicePart.range[0] && resPitch <= voicePart.range[1];
          }
          return true;
        });
        if (resInRange.length > 0) validNotes = resInRange;
      }
    }

    // Accidental approach & resolution constraints (best-effort: skip if they'd empty the list)
    if (useAccidentalsByStep && previousNote && !previousNote.rest) {
      if (forcedPitch !== undefined) {
        // Resolution: direct the voice to the specific pitch; fall back if impossible.
        const resolved = validNotes.filter((note) => note.pitchValue === forcedPitch);
        if (resolved.length > 0) validNotes = resolved;
      } else {
        // Natural accidental: require a diatonic step (best-effort).
        if (previousNote.accidental === "natural") {
          const stepped = validNotes.filter((note) => isDiatonicStep(note, previousNote));
          if (stepped.length > 0) validNotes = stepped;
        }

        // Approach: a note that will carry an accidental must be approached by step.
        const willBeSharp = chord.sharpScaleDegree !== undefined && chord.sharpScaleDegree !== null;
        const willBeFlat = chord.flatScaleDegree !== undefined && chord.flatScaleDegree !== null;
        if (willBeSharp || willBeFlat) {
          const isAccidentalNote = (note: Note) =>
            (willBeSharp && note.degree === chord.sharpScaleDegree) ||
            (willBeFlat && note.degree === chord.flatScaleDegree);

          const approached = validNotes.filter((note) => {
            if (isAccidentalNote(note)) {
              // Must be approached by step from the previous note.
              if (!isDiatonicStep(note, previousNote)) return false;
              // The resolution pitch (pv+1 for sharps, pv-1 for flats) must land
              // within this voice's range — otherwise forcedPitch silently fails on
              // the next chord (e.g. soprano F# at pv=31 top of [21,31] → G at pv=32
              // is out of range, so soprano then incorrectly picks D).
              const resPitch = willBeSharp
                ? note.pitchValue + 1
                : note.pitchValue - 1;
              return resPitch >= voicePart.range[0] && resPitch <= voicePart.range[1];
            }
            return true;
          });

          if (approached.length > 0) {
            validNotes = approached;
          } else {
            // Can't approach any note by step — use non-accidental chord tones.
            // If none exist (all available tones are chromatic), fail this step so the
            // retry loop can try a different voice ordering or chord progression.
            const nonAccidental = validNotes.filter((note) => !isAccidentalNote(note));
            validNotes = nonAccidental; // empty → returns null → triggers step retry
          }
        }
      }
    }

    // Voice OVERLAP between ADJACENT voice pairs only (e.g. bass-tenor,
    // tenor-alto, alto-soprano). When an already-assigned adjacent voice
    // has CURRENT pitch that crosses past THIS voice's PREVIOUS pitch,
    // strict counterpoint forbids it. The overlap is between fixed
    // pitches (other-curr and this-prev), independent of candidate choice —
    // detection means returning null to force step retry with a different
    // bass alternate or shuffle order. Non-adjacent overlap (e.g. bass
    // above alto's prev) is far less audible and rarely flagged in Bach.
    if (
      previousNote &&
      !previousNote.rest &&
      otherVoicesPrev &&
      otherVoiceNotes.length > 0 &&
      voicePart.order !== undefined
    ) {
      for (let i = 0; i < otherVoiceNotes.length; i++) {
        const otherCurr = otherVoiceNotes[i];
        if (!otherCurr || otherCurr.rest) continue;
        if (otherCurr.order === undefined) continue;
        // Adjacent only: difference of exactly 1 voice-order.
        if (Math.abs(otherCurr.order - voicePart.order) !== 1) continue;
        if (otherCurr.order < voicePart.order) {
          // Other (lower) — its curr shouldn't reach OR exceed our prev.
          if (otherCurr.pitchValue >= previousNote.pitchValue) return null;
        } else {
          // Other (upper) — its curr shouldn't drop to OR below our prev.
          if (otherCurr.pitchValue <= previousNote.pitchValue) return null;
        }
      }
    }

    // Parallel 5ths/8ves: filter out candidates whose motion against any
    // already-assigned voice creates a parallel perfect fifth or octave.
    // Pitch values are diatonic indices (7 per octave), so:
    //   |a - b| % 7 === 4 → fifth
    //   |a - b| % 7 === 0 (and > 0) → octave/unison
    const _PARALLEL_DEBUG =
      typeof process !== "undefined" && process.env?.BACH_PARALLEL_DEBUG === "1";
    if (
      previousNote &&
      !previousNote.rest &&
      otherVoicesPrev &&
      otherVoicesPrev.length === otherVoiceNotes.length
    ) {
      if (_PARALLEL_DEBUG) {
        console.error(
          `[PFilter] voice ${voicePart.smallName} prev=${previousNote.pitchValue} ` +
          `candidates=${validNotes.map((n) => n.pitchValue).join(",")} ` +
          `others=${otherVoiceNotes.map((n, i) => `${n.pitchValue}(prev=${otherVoicesPrev[i]?.pitchValue})`).join(", ")}`
        );
      }
      const noParallels = validNotes.filter((candidate) => {
        for (let i = 0; i < otherVoiceNotes.length; i++) {
          const otherCurr = otherVoiceNotes[i];
          const otherPrev = otherVoicesPrev[i];
          if (!otherPrev || otherPrev.rest || otherCurr.rest) continue;
          // Both voices must be moving for parallel motion to apply.
          if (candidate.pitchValue === previousNote.pitchValue) continue;
          if (otherCurr.pitchValue === otherPrev.pitchValue) continue;
          // Same direction?
          const thisDir = Math.sign(candidate.pitchValue - previousNote.pitchValue);
          const otherDir = Math.sign(otherCurr.pitchValue - otherPrev.pitchValue);
          if (thisDir !== otherDir) continue;
          // Compute interval mods
          const intvBefore = Math.abs(previousNote.pitchValue - otherPrev.pitchValue);
          const intvAfter = Math.abs(candidate.pitchValue - otherCurr.pitchValue);
          const modBefore = intvBefore % 7;
          const modAfter = intvAfter % 7;
          // Parallel fifth (both intervals are perfect 5ths)
          if (modBefore === 4 && modAfter === 4) {
            if (_PARALLEL_DEBUG) console.error(`[PFilter] reject ${voicePart.smallName}=${candidate.pitchValue} (P5 vs voice-${i}: ${otherPrev.pitchValue}→${otherCurr.pitchValue}, prev=${previousNote.pitchValue})`);
            return false;
          }
          // Parallel octave or unison (both intervals are 0 mod 7, both > 0
          // for octave; OR both 0 = unisons which are also forbidden)
          if (modBefore === 0 && modAfter === 0 && intvBefore > 0 && intvAfter > 0) {
            if (_PARALLEL_DEBUG) console.error(`[PFilter] reject ${voicePart.smallName}=${candidate.pitchValue} (P8 vs voice-${i}: ${otherPrev.pitchValue}→${otherCurr.pitchValue}, prev=${previousNote.pitchValue})`);
            return false;
          }
          // Parallel unison: both at zero distance (both voices on same pitch
          // moving to same pitch) — also forbidden.
          if (intvBefore === 0 && intvAfter === 0) {
            if (_PARALLEL_DEBUG) console.error(`[PFilter] reject ${voicePart.smallName}=${candidate.pitchValue} (unison vs voice-${i})`);
            return false;
          }
        }
        return true;
      });
      // Strict-when-possible: if every candidate creates a parallel, fail
      // this step (return null below) so the outer retry mechanism can pick
      // a different bass alternate or voice-shuffle order. After many
      // failed retries, the bass-fallback (root → 3rd) usually finds a
      // direction that opens up new tenor/alto candidates.
      if (_PARALLEL_DEBUG) {
        console.error(
          `[PFilter] result: ${noParallels.length}/${validNotes.length} survive — ` +
          (noParallels.length > 0 ? `using [${noParallels.map(n => n.pitchValue).join(",")}]` : `STRICT-FAIL`)
        );
      }
      validNotes = noParallels;
    }

    // Voice-crossing: enforce ordering between voices, but allow momentary
    // unisons (baroque counterpoint permits two voices sharing a pitch as
    // long as it's not approached/left in parallel motion — the parallel-
    // unison filter above already catches that case).
    validNotes = validNotes.filter((note) => {
      return otherVoiceNotes.every((otherNote) => {
        if (otherNote.order === undefined || voicePart.order === undefined)
          return true;
        if (voicePart.order > otherNote.order) {
          return note.pitchValue >= otherNote.pitchValue;
        } else {
          return note.pitchValue <= otherNote.pitchValue;
        }
      });
    });

    // Adjacent voices a diatonic step apart is the harshest vertical interval
    // this texture can produce, and it is what started the whole clash
    // investigation. Measured, it is rare and it is always the same chord: a V7
    // whose 7th lands in the alto directly beneath the root in the soprano
    // (B, d f g), 4 times in 2867 sonorities.
    //
    // Strict-when-possible, the same shape as the parallel filter above: when
    // no candidate survives, fail the step and let the retry re-pick a bass
    // alternate or a different voice-shuffle order. Left as a mere preference
    // it still let the clash through, because the cases that produce it are
    // exactly the ones where spacing has boxed the alto in - the only way out
    // is to go back and place a different note somewhere else.
    //
    // Adjacent voices only, which is sufficient: two non-adjacent voices a step
    // apart would need the voice between them to be crossing, and the filter
    // above has already ruled that out.
    const withoutAdjacentSeconds = validNotes.filter((note) =>
      otherVoiceNotes.every((otherNote) => {
        if (!otherNote || otherNote.rest) return true;
        if (otherNote.order === undefined || voicePart.order === undefined) {
          return true;
        }
        if (Math.abs(otherNote.order - voicePart.order) !== 1) return true;
        return Math.abs(note.pitchValue - otherNote.pitchValue) !== 1;
      })
    );
    validNotes = withoutAdjacentSeconds;

    if (validNotes.length === 0) {
      return null;
    }

    // Select note based on position in voice's range
    let selectedNote: Note;
    if (previousNote && !previousNote.rest) {
      // If we have a previous note, find the closest valid note
      selectedNote = validNotes.reduce((closest, current) => {
        const currentDiff = Math.abs(
          current.pitchValue - previousNote.pitchValue
        );
        const closestDiff = Math.abs(
          closest.pitchValue - previousNote.pitchValue
        );
        return currentDiff < closestDiff ? current : closest;
      });
    } else {
      // If no previous note, select from the lower third for lower voices,
      // middle third for middle voices, and upper third for higher voices
      const rangePosition = voicePart.order / (voiceParts.length - 1); // 0 to 1
      const index = Math.floor(validNotes.length * rangePosition);
      selectedNote = validNotes[Math.min(index, validNotes.length - 1)];
    }

    return selectedNote;
  }

  function processRhythms(
    rhythms: Rhythm[],
    chordProgression: Chord[],
    voiceParts: VoicePart[],
    bassLine: Note[],
    maxSkip: number
  ): boolean {
    let chordIndex = 0;

    // Clear existing chord notes
    voiceParts.forEach((part) => {
      part.chordNotes = [];
    });

    // Identify the soprano-equivalent (highest-order non-bass voice) when a
    // preset soprano is provided. Used to inject pre-sketched melody pitches.
    const sopranoVoiceIndex = presetSoprano
      ? findHighestOrderVoiceIndex(voiceParts)
      : -1;

    /**
     * Where the bass owes a resolution.
     *
     * An accidental in the bass has to move on by step - up if raised, down if
     * lowered. Upper voices already do this through forcedPitch in
     * findValidVoiceNote, and they manage it 100% of the time; the bass had no
     * equivalent, so a chromatic bass note went wherever the chord tones
     * allowed. G# walked to C rather than up to A.
     *
     * Kept as a preference rather than a rule: if the next chord simply has no
     * tone at the resolution pitch, forcing it would fail the whole generation,
     * and a generation that fails is worse than a resolution that does not
     * happen.
     */
    let owedBassResolution: number | undefined;

    for (let stepIndex = 0; stepIndex < rhythms.length; stepIndex++) {
      const rhythm = rhythms[stepIndex];

      if (rhythm.rest) {
        // For rests, add rest notes to all parts with proper length
        voiceParts.forEach((part) => {
          part.chordNotes.push({
            name: "z",
            degree: 0,
            pitchValue: 0,
            length: rhythm.totalValue,
            rest: true,
            order: part.order,
            isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
          });
        });
        continue;
      }

      // Get current chord - only increment after processing
      const currentChord = chordProgression[chordIndex];
      if (!currentChord) {
        console.error(
          `Error: Chord undefined at chordIndex ${chordIndex} for step ${
            stepIndex + 1
          }`
        );
        return false;
      }

      const maxStepRetries = 20;
      let stepRetryCount = 0;
      let stepSuccess = false;

      while (stepRetryCount < maxStepRetries && !stepSuccess) {
        stepRetryCount++;

        const stepNotesAttempt: (VoiceNote | null)[] = new Array(
          voiceParts.length
        ).fill(null);
        const pitchCheckArray: number[] = new Array(voiceParts.length).fill(0);
        let stepGenerationFailed = false;

        // Process Bass First
        const bassPartInfo = voiceParts.find((vp) => vp.order === 0);
        // When a soprano preset is provided AND this step is a chord-start,
        // the highest-order voice is pre-filled and excluded from the search.
        const isChordStartStep =
          !rhythm.isPatternNote || rhythm.isPatternStart;
        const useSopranoPreset =
          presetSoprano !== undefined &&
          sopranoVoiceIndex >= 0 &&
          isChordStartStep &&
          chordIndex < presetSoprano.length;
        const otherPartsInfo = voiceParts.filter(
          (vp) =>
            vp.order !== 0 &&
            !(useSopranoPreset && vp === voiceParts[sopranoVoiceIndex])
        );
        const shuffledOtherParts = shuffleArray([...otherPartsInfo]);

        if (useSopranoPreset) {
          const sopNote = presetSoprano![chordIndex];
          // Apply chord-driven accidental display: the preset stores only
          // pitch + base name (no prefix). When the current chord raises or
          // lowers the soprano's degree (e.g. raised LT in minor V), the
          // chromatic prefix and accidental field must be set so abcjs renders
          // the right pitch and the resolution rule for the next chord fires.
          const baseName = noteArray[sopNote.pitchValue];
          const accidentalInfo = determineAccidental(
            sopNote.degree,
            currentChord,
            keySignatures,
            key
          );
          const finalName = accidentalInfo.accidental
            ? accidentalInfo.prefix + baseName
            : baseName;
          const adjusted: VoiceNote = {
            ...sopNote,
            name: finalName,
            length: rhythm.totalValue,
            order: voiceParts[sopranoVoiceIndex].order,
            accidental: accidentalInfo.accidental,
            wasRaised:
              accidentalInfo.accidental === "natural"
                ? currentChord.sharpScaleDegree === sopNote.degree
                : undefined,
            isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
          };
          stepNotesAttempt[sopranoVoiceIndex] = adjusted;
          pitchCheckArray[sopranoVoiceIndex] = adjusted.pitchValue;
        }

        if (!bassPartInfo) {
          console.error("Bass part definition not found!");
          stepGenerationFailed = true;
        } else {
          const bassVoiceIndex = voiceParts.findIndex((vp) => vp.order === 0);
          const bassNote = bassLine[chordIndex];

          if (!bassNote) {
            console.error(`Bass note missing for chord index ${chordIndex}`);
            stepGenerationFailed = true;
          } else {
            // First attempt: use the pre-generated bass note.
            // On retries: pick a different chord-root note from the bass part's
            // range to escape ordering deadlocks caused by a bass note that
            // sits too high for the tenor to fit above it.
            let chosenNote: Note = bassNote;
            let applyAccidental = false;

            // Once any bass note has been substituted, the rest of bassLine is
            // no longer measured from the note actually used - generateChordProgression
            // built that chain against its own choices. So a pre-generated note
            // can be an unreachable leap from where the bass really is, and it
            // has to be re-picked exactly like a retry.
            const prevBassNote =
              bassPartInfo.chordNotes[bassPartInfo.chordNotes.length - 1];
            const unreachableFromPrev =
              prevBassNote !== undefined &&
              !prevBassNote.rest &&
              Math.abs(bassNote.pitchValue - prevBassNote.pitchValue) > maxSkip;

            const missesOwedResolution =
              owedBassResolution !== undefined &&
              bassNote.pitchValue !== owedBassResolution;

            if (stepRetryCount > 1 || unreachableFromPrev || missesOwedResolution) {
              // Include both root (root position) and 3rd (first inversion) as fallbacks,
              // mirroring the same inversion logic used in findValidBassNote.
              const invertibleDegrees = new Set([currentChord.root, currentChord.triadNotes[1]]);
              let altNotes = bassPartInfo.possibleNotes.filter(
                (n) =>
                  invertibleDegrees.has(n.degree) &&
                  n.pitchValue >= bassPartInfo.range[0] &&
                  n.pitchValue <= bassPartInfo.range[1]
              );
              // When accidentalsByStep is on, keep the chromatic degree out of the
              // bass at every retry, not just the early ones.
              //
              // This is a deadlock escape: it swaps in a different chord tone when
              // the planned bass cannot be reached. Nothing here arms a resolution
              // for what it picks - forcedNextBassPitch was computed back in
              // chord-generation for the bass it *planned*. So a chromatic note
              // substituted in at this point is under no obligation to resolve,
              // and it did not: with V/vi reachable, G# entered the bass and went
              // to C rather than up to A in 49 of 60 exercises.
              //
              // A chromatic bass note should be deliberate - that is what the
              // explicit chromatic-bass chords are for (V⁶/V, where
              // chord.root === chromDeg), and those carry their own approach and
              // resolution rules. They are exempted below, as before.
              // Retries 9+ may still fall back to the accidental: it is the escape
              // of last resort, and refusing it outright costs whole generations
              // on a restrictive chord list. With the 5th now available above, it
              // is reached far less often than it was.
              if (accidentalsByStep && stepRetryCount <= 8) {
                const chromDeg = currentChord.sharpScaleDegree ?? currentChord.flatScaleDegree;
                if (chromDeg !== undefined && chromDeg !== null && currentChord.root !== chromDeg) {
                  // Give the escape the 5th to work with instead of the accidental.
                  // findValidBassNote already does exactly this when it drops the
                  // chromatic degree, and a second inversion is a far smaller price
                  // than an unresolved accidental in the bass. Without it, refusing
                  // the chromatic note here costs real generations - 5 in 60 at the
                  // top of the chromatic slider.
                  const fifth = currentChord.triadNotes[2];
                  if (fifth !== undefined) {
                    const withFifth = bassPartInfo.possibleNotes.filter(
                      (n) =>
                        n.degree === fifth &&
                        n.pitchValue >= bassPartInfo.range[0] &&
                        n.pitchValue <= bassPartInfo.range[1]
                    );
                    altNotes = [...altNotes, ...withFifth];
                  }
                  const nonChromatic = altNotes.filter((n) => n.degree !== chromDeg);
                  if (nonChromatic.length > 0) altNotes = nonChromatic;
                  // else: only chromatic available, fall through to allow it
                }
              }
              if (altNotes.length > 0) {
                // This substitution exists to escape ordering deadlocks, but it
                // was picking at random with no regard for how far the bass had
                // to leap to get there - which is how a bass line that left
                // generateChordProgression inside maxSkip came back out with a
                // ninth in it. Prefer candidates within maxSkip; if the deadlock
                // leaves none, take the nearest, so the escape still happens but
                // with the smallest leap available.
                let pool = altNotes;
                if (prevBassNote && !prevBassNote.rest) {
                  const distance = (n: Note) =>
                    Math.abs(n.pitchValue - prevBassNote.pitchValue);
                  const within = altNotes.filter((n) => distance(n) <= maxSkip);
                  pool =
                    within.length > 0
                      ? within
                      : [
                          altNotes.reduce((best, n) =>
                            distance(n) < distance(best) ? n : best
                          ),
                        ];
                }
                if (owedBassResolution !== undefined) {
                  const resolving = pool.filter(
                    (n) => n.pitchValue === owedBassResolution
                  );
                  if (resolving.length > 0) pool = resolving;
                }
                chosenNote = pool[Math.floor(Math.random() * pool.length)];
                applyAccidental = true;
              }
            }

            let finalName = chosenNote.name;
            let finalAccidental = chosenNote.accidental ?? null;
            if (applyAccidental) {
              // Retry: chosenNote.name has no prefix; build name and accidental fresh.
              const acc = determineAccidental(chosenNote.degree, currentChord, keySignatures, key);
              finalName = acc.accidental ? acc.prefix + chosenNote.name : chosenNote.name;
              finalAccidental = acc.accidental;
            } else {
              // First attempt: chosenNote.name already has the accidental prefix
              // (applied by findValidBassNote). Determine the accidental type only,
              // without re-applying the prefix, so the VoiceNote.accidental field is set.
              const acc = determineAccidental(chosenNote.degree, currentChord, keySignatures, key);
              finalAccidental = acc.accidental;
            }

            const generatedBassNote: VoiceNote = {
              ...chosenNote,
              name: finalName,
              length: rhythm.totalValue,
              rest: false,
              order: 0,
              accidental: finalAccidental,
              wasRaised: finalAccidental === "natural"
                ? currentChord.sharpScaleDegree === chosenNote.degree
                : undefined,
              isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
            };
            owedBassResolution =
              finalAccidental === "sharp"
                ? generatedBassNote.pitchValue + 1
                : finalAccidental === "flat"
                  ? generatedBassNote.pitchValue - 1
                  : undefined;

            stepNotesAttempt[bassVoiceIndex] = generatedBassNote;
            pitchCheckArray[bassVoiceIndex] = generatedBassNote.pitchValue;
          }
        }

        // Process other voices
        if (!stepGenerationFailed) {
          for (const voicePart of shuffledOtherParts) {
            const actualPartName = voicePart.name;
            const originalVoiceIndex = voiceParts.findIndex(
              (vp) => vp.name === actualPartName
            );
            let generatedVoiceNote: VoiceNote | null = null;

            try {
              // Get used triad degrees from all parts that have been processed in this step
              const usedTriadDegrees: number[] = stepNotesAttempt
                .filter((note): note is VoiceNote => note !== null)
                .map((note) => note.degree);

              // Get other voice notes from this step (current step's pitches)
              const otherVoiceNotes = stepNotesAttempt.filter(
                (note, idx) => note !== null && idx !== originalVoiceIndex
              ) as VoiceNote[];

              // Parallel array: each other voice's PREVIOUS chord-tone note,
              // used by the parallel-5/8ve filter inside findValidVoiceNote.
              const otherVoicesPrev: (VoiceNote | undefined)[] = [];
              for (let idx = 0; idx < stepNotesAttempt.length; idx++) {
                if (stepNotesAttempt[idx] === null) continue;
                if (idx === originalVoiceIndex) continue;
                const prevForOther = voiceParts[idx].chordNotes.at(-1) as
                  | VoiceNote
                  | undefined;
                otherVoicesPrev.push(prevForOther);
              }

              // The previous chord (one position back) drives diatonic LT and
              // chordal-7th resolution rules.
              const previousChord =
                chordIndex > 0 ? chordProgression[chordIndex - 1] : undefined;

              const selectedNote = findValidVoiceNote(
                voicePart,
                currentChord,
                usedTriadDegrees,
                otherVoiceNotes,
                maxSkip,
                voiceParts[originalVoiceIndex].chordNotes.at(-1) as VoiceNote | undefined,
                accidentalsByStep,
                otherVoicesPrev,
                previousChord
              );

              if (!selectedNote) {
                throw new Error(
                  `No valid notes for ${actualPartName} after filtering`
                );
              }

              let finalNoteName = selectedNote.name;
              const noteDegree = selectedNote.degree;
              const accidentalInfo = determineAccidental(
                noteDegree,
                currentChord,
                keySignatures,
                key
              );

              if (accidentalInfo.accidental) {
                finalNoteName = accidentalInfo.prefix + selectedNote.name;
              }

              generatedVoiceNote = {
                ...selectedNote,
                name: finalNoteName,
                length: rhythm.totalValue,
                rest: false,
                order: voicePart.order,
                accidental: accidentalInfo.accidental,
                isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
                wasRaised:
                  accidentalInfo.accidental === "natural"
                    ? currentChord.sharpScaleDegree === noteDegree
                    : undefined,
              };
            } catch (e: any) {
              console.error(
                `Error finding note for ${actualPartName}: ${e.message}`
              );
              stepGenerationFailed = true;
              break;
            }

            // Store results in the *original* order
            stepNotesAttempt[originalVoiceIndex] = generatedVoiceNote;
            if (generatedVoiceNote) {
              pitchCheckArray[originalVoiceIndex] =
                generatedVoiceNote.pitchValue;
            } else if (!stepGenerationFailed) {
              console.error(
                `Generated note is unexpectedly null for ${actualPartName}`
              );
              stepGenerationFailed = true;
              break;
            }
          }
        }

        // Post-Attempt Checks
        if (stepGenerationFailed) {
          continue; // Try step again
        }

        // Create array of [order, pitch] pairs and sort by order
        const voiceOrderPitches = voiceParts.map((part, index) => ({
          order: part.order,
          pitch: pitchCheckArray[index],
        }));
        voiceOrderPitches.sort((a, b) => a.order - b.order);
        const orderedPitches = voiceOrderPitches.map((v) => v.pitch);

        // Check voice order using the correctly ordered pitchCheckArray
        if (isVoiceOrderValid(orderedPitches)) {
          stepNotesAttempt.forEach((note, voiceIndex) => {
            // Ensure we push to the correct original index in allVoiceNotes
            if (note) voiceParts[voiceIndex].chordNotes.push(note);
          });
          stepSuccess = true;
        }
      }

      if (!stepSuccess) {
        console.error(
          `Failed to generate valid notes for step ${stepIndex + 1} (Rhythm: ${
            rhythm.name
          }, Chord: ${currentChord.symbol}) after ${maxStepRetries} attempts.`
        );
        return false; // Fail entire process
      }

      // Increment chord index after successfully processing the step
      if (rhythm.isPatternNote) {
        // Only increment at the end of a pattern
        if (rhythm.isPatternEnd) {
          chordIndex++;
        }
      } else {
        // For non-pattern notes, increment after processing
        chordIndex++;
      }
    }

    return true;
  }

  while (totalLoopFails < maxTotalLoopFails) {
    if (processRhythms(rhythms, progression, voiceParts, bassLine, maxSkip)) {
      // Sort each voice's chordNotes by their position in the rhythm list to
      // ensure consistent ordering with the input. (No-op for current usage —
      // chordNotes are pushed in order already — but defensive for callers
      // that pass voiceParts with pre-existing state.)
      return voiceParts.map((part) => part.chordNotes);
    }
    totalLoopFails++;
  }

  throw new Error("Failed to build valid notes after max attempts");
}

/**
 * Helper to get octave markers for a pitch value
 */
function getOctaveMarkers(pitch: number): string {
  const octave = Math.floor(pitch / 7);
  return octave <= 0 ? ",".repeat(-octave) : "'".repeat(octave);
}

function generateBassNote(
  chord: Chord,
  rhythm: Rhythm,
  key: string,
  range: [number, number],
  previousNote?: VoiceNote,
  maxSkip?: number
): VoiceNote {
  if (rhythm.rest) {
    return {
      name: "z",
      degree: -1,
      pitchValue: -1,
      length: rhythm.totalValue,
      rest: true,
      isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
    };
  }

  const possibleNotes = generatePossibleNotes(range, key).filter(
    (note: Note) => note.degree === chord.root
  );

  if (!possibleNotes.length) {
    throw new Error(
      `No possible bass notes found for chord ${chord.name} in range [${range[0]}, ${range[1]}]`
    );
  }

  let selectedNote: Note;
  if (!previousNote || previousNote.rest) {
    selectedNote =
      possibleNotes[Math.floor(Math.random() * possibleNotes.length)];
  } else {
    const effectiveMaxSkip = maxSkip || getMaxSkip();
    const validNotes = possibleNotes.filter(
      (note: Note) =>
        Math.abs(note.pitchValue - previousNote.pitchValue) <= effectiveMaxSkip
    );
    if (!validNotes.length) {
      throw new Error(
        `No valid bass notes within max skip of ${effectiveMaxSkip} from previous note ${previousNote.name}`
      );
    }
    selectedNote = validNotes[Math.floor(Math.random() * validNotes.length)];
  }

  const accidentalInfo = determineAccidental(
    selectedNote.degree,
    chord,
    keySignatures,
    key
  );
  const generatedBassNote: VoiceNote = {
    ...selectedNote,
    name: accidentalInfo.prefix + selectedNote.name,
    length: rhythm.totalValue,
    rest: false,
    accidental: accidentalInfo.accidental,
    isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
  };

  return generatedBassNote;
}

function generateVoiceNote(
  chord: Chord,
  rhythm: Rhythm,
  key: string,
  range: [number, number],
  previousNote?: VoiceNote,
  otherNotes: VoiceNote[] = [],
  maxSkip?: number
): VoiceNote {
  if (rhythm.rest) {
    return {
      name: "z",
      degree: -1,
      pitchValue: -1,
      length: rhythm.totalValue,
      rest: true,
      isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
    };
  }

  // Get all possible notes for this voice part in the given range
  const possibleNotes = generatePossibleNotes(range, key).filter((note: Note) =>
    chord.triadNotes.includes(note.degree)
  );

  if (!possibleNotes.length) {
    throw new Error(
      `No possible notes found for chord ${chord.name} in range [${range[0]}, ${range[1]}]`
    );
  }

  // Filter notes based on voice leading rules
  let validNotes = possibleNotes;
  if (previousNote && !previousNote.rest) {
    const effectiveMaxSkip = maxSkip || getMaxSkip();
    validNotes = validNotes.filter(
      (note: Note) =>
        Math.abs(note.pitchValue - previousNote.pitchValue) <= effectiveMaxSkip
    );
  }

  // Filter out notes that would create parallel fifths
  if (previousNote && !previousNote.rest && otherNotes.length > 0) {
    validNotes = validNotes.filter((note: Note) => {
      // Check for parallel fifths with each other voice
      return !otherNotes.some((otherNote) => {
        if (otherNote.rest) return false;
        const prevInterval =
          Math.abs(previousNote.pitchValue - otherNote.pitchValue) % 7;
        const newInterval =
          Math.abs(note.pitchValue - otherNote.pitchValue) % 7;
        return prevInterval === 4 && newInterval === 4;
      });
    });
  }

  if (!validNotes.length) {
    throw new Error(
      `No valid notes found for chord ${chord.name} after applying voice leading rules`
    );
  }

  const selectedNote =
    validNotes[Math.floor(Math.random() * validNotes.length)];
  const accidentalInfo = determineAccidental(
    selectedNote.degree,
    chord,
    keySignatures,
    key
  );
  const generatedVoiceNote: VoiceNote = {
    ...selectedNote,
    name: accidentalInfo.prefix + selectedNote.name,
    length: rhythm.totalValue,
    rest: false,
    accidental: accidentalInfo.accidental,
    isCadenceEnd: (rhythm as any).isCadenceEnd ?? false,
  };

  return generatedVoiceNote;
}
