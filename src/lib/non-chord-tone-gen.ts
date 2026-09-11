// Non-chord tone generation: subdivides chord tones into passing tones,
// neighbor tones, anticipations, and appoggiaturas. Key-aware accidentals
// and parallel-motion checking are applied before committing each NCT.

import { isSingableInterval } from "./leap-recovery";
import type { VoiceNote, Rhythm } from "./types";
import { noteArray } from "../resources/noteArray";
import { keySignatures } from "../resources/key-signatures";
import { getDiatonicDegree } from "./prep-params";

// --- NCT Definition Types ---
interface NctFunctionParams {
  currentNote: VoiceNote;
  nextNote: VoiceNote | null;
  /** Nearest sounding note before this one; a suspension is built from it. */
  prevNote: VoiceNote | null;
  patternRhythm: Rhythm;
  allNotes: VoiceNote[][];
  currentPartIndex: number;
  noteIndex: number; // index in allNotes[currentPartIndex] (== notesToProcess[i])
  key: string;
}

type NctFunction = (params: NctFunctionParams) => VoiceNote[] | null;

interface NctDefinition {
  name: string;
  check: (
    currentNote: VoiceNote,
    nextNote: VoiceNote | null,
    prevNote: VoiceNote | null,
    patternRhythm: Rhythm
  ) => boolean;
  generator: NctFunction;
  /**
   * Relative likelihood when more than one type fits. Without this the pick was
   * uniform over whatever was eligible, which is not how the style behaves:
   * passing and neighbour motion is the ordinary currency, an accented
   * appoggiatura is a colour.
   */
  weight: number;
}
// ---------------------------

/**
 * Create a VoiceNote at newPitchValue.
 *
 * In ABC notation the K: header already declares all key-signature sharps/flats,
 * so we must NOT add explicit ^ or _ prefixes for in-key notes - they are already
 * implied by the key signature.  `^C` in key of A is redundant (C already means
 * C# in that key) and causes many ABC renderers to display a spurious sharp.
 *
 * All Phase-1 NCTs are diatonic, so no explicit accidental is ever required.
 * If chromatic NCTs are added later they can be flagged individually here.
 */
function createNewNote(
  originalNote: VoiceNote,
  newPitchValue: number,
  newLength: number,
  key: string
): VoiceNote | null {
  const baseName = noteArray[newPitchValue];
  if (!baseName) {
    console.warn(`NCT_GEN Helper: Pitch value ${newPitchValue} not found in noteArray.`);
    return null;
  }

  const keyInfo = keySignatures[key];
  const degree = keyInfo ? getDiatonicDegree(newPitchValue, keyInfo) : 0;

  // Staying on the same pitch means staying on the same *note*. If the note
  // being decorated carries an accidental - a chromatic chord tone - then a
  // decoration that holds that pitch has to carry it too, or the exercise reads
  // Bb then B natural on two consecutive eighths and the singer is being asked
  // to correct a note that was never wrong.
  //
  // Moving to a different pitch stays diatonic: a decoration ornaments the
  // harmony, it does not introduce chromaticism of its own.
  const holdsSamePitch = newPitchValue === originalNote.pitchValue;

  return {
    name: holdsSamePitch ? originalNote.name : baseName,
    degree,
    pitchValue: newPitchValue,
    length: newLength,
    rest: false,
    order: originalNote.order,
    accidental: holdsSamePitch ? originalNote.accidental ?? null : null,
    wasRaised: holdsSamePitch ? originalNote.wasRaised : undefined,
    isCadenceEnd: false,
  };
}

// --- Parallel-motion check ---

/**
 * Look up the pitch sounding in `voice` at absolute time `t`. Returns null
 * for rests or when t is past the voice's end. Time-aligned access means
 * this works correctly even when voice arrays have different lengths from
 * uneven NCT subdivisions across voices.
 */
function pitchAtTimeLocal(voice: VoiceNote[], t: number): number | null {
  let cumT = 0;
  let last: VoiceNote | null = null;
  for (const note of voice) {
    if (cumT > t) break;
    last = note.rest ? null : note;
    cumT += note.length;
  }
  return last ? last.pitchValue : null;
}

/**
 * Cumulative time of the FIRST n entries in a voice - i.e., the absolute
 * start time of voice[n].
 */
function timeAtIndex(voice: VoiceNote[], n: number): number {
  let t = 0;
  for (let i = 0; i < n && i < voice.length; i++) {
    t += voice[i].length;
  }
  return t;
}

/**
 * Returns true if the proposed nctNotes introduce a parallel P5 or P8 against
 * any other voice. Uses TIME-ALIGNED lookup so it works correctly when other
 * voices have been subdivided unevenly by an earlier NCT pass (e.g., coord-NCT
 * suspensions). The previous index-based variant assumed array indices aligned
 * with chord positions, which broke after uneven subdivision.
 *
 * Pitch values are diatonic (7 per octave), so:
 *   |a – b| % 7 === 4  →  perfect fifth
 *   |a – b| % 7 === 0 and |a – b| > 0  →  octave
 */
/**
 * Returns true if a proposed NCT would sound a diatonic SECOND against another
 * voice - two parts a step apart, which is the harshest vertical clash in this
 * style and reads as a changed harmony rather than as decoration.
 *
 * Only a true step counts, not its compound. A ninth between soprano and bass
 * is ordinary wide spacing; a second between neighbouring voices, especially
 * low in the texture, is the sound being complained about.
 *
 * Time-aligned like checkParallelMotion, since other voices may already have
 * been subdivided unevenly by an earlier NCT pass, so array indices do not line
 * up with chord positions.
 *
 * Each decoration is checked across its whole duration, not just at its own
 * onset: another voice can move *while* this note is still sounding, and that
 * sonority is just as audible. Checking onsets alone left a residue of clashes
 * that only appeared once decoration density went up.
 */
function checkClashesWithOtherVoices(
  nctNotes: VoiceNote[],
  noteIndex: number,
  allNotes: VoiceNote[][],
  currentPartIndex: number
): boolean {
  const currentVoice = allNotes[currentPartIndex];
  let t = timeAtIndex(currentVoice, noteIndex);

  for (const nct of nctNotes) {
    if (!nct.rest) {
      const end = t + nct.length;
      for (let v = 0; v < allNotes.length; v++) {
        if (v === currentPartIndex) continue;
        // Every moment this note could meet a new pitch in that voice: its own
        // onset, plus each onset in the other voice before this note ends.
        for (const at of onsetsWithin(allNotes[v], t, end)) {
          const other = pitchAtTimeLocal(allNotes[v], at);
          if (other === null) continue;
          if (Math.abs(other - nct.pitchValue) === 1) return true;
        }
      }
    }
    t += nct.length;
  }
  return false;
}

/**
 * `start`, then every note onset in `voice` strictly inside (start, end).
 * Sorted, so the caller walks the sonority changes in order.
 */
function onsetsWithin(voice: VoiceNote[], start: number, end: number): number[] {
  const times = [start];
  let t = 0;
  for (const note of voice) {
    if (t >= end) break;
    if (t > start) times.push(t);
    t += note.length;
  }
  return times;
}

/**
 * What a note actually sounds, in semitones.
 *
 * `pitchValue` is a DIATONIC index - one step per letter name - so two notes a
 * diatonic step apart may be a whole tone or a half tone, and nothing that
 * compares pitchValues can tell which. Every vertical rule until now has been
 * about diatonic intervals (parallel fifths, octaves), where that does not
 * matter. A half-step clash is exactly where it does.
 *
 * The value is only ever used in differences, so the absolute origin is
 * arbitrary. The accidental on the note wins; failing that the key signature
 * decides, which is why this needs the key.
 */
const LETTER_SEMITONE = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B

const ACCIDENTAL_SEMITONE: Record<string, number> = {
  sharp: 1,
  flat: -1,
  natural: 0,
  "double-sharp": 2,
  "double-flat": -2,
};

export function semitoneOf(note: VoiceNote, keyInfo: { sharps: number[]; flats: number[] }): number {
  const letter = ((note.pitchValue % 7) + 7) % 7;
  const octave = Math.floor(note.pitchValue / 7);
  let alter: number;
  if (note.accidental && note.accidental in ACCIDENTAL_SEMITONE) {
    alter = ACCIDENTAL_SEMITONE[note.accidental];
  } else {
    const degree = getDiatonicDegree(note.pitchValue, keyInfo as any);
    alter = keyInfo.sharps.includes(degree) ? 1 : keyInfo.flats.includes(degree) ? -1 : 0;
  }
  return octave * 12 + LETTER_SEMITONE[letter] + alter;
}

/**
 * Every sounding note in a voice that overlaps the window [from, to).
 *
 * Every note that overlaps, not the one at the onset: a decoration is short and
 * the other voice can change underneath it, so sampling only where the
 * decoration begins misses exactly the clashes that start a beat later.
 */
function notesOverlapping(voice: VoiceNote[], from: number, to: number): VoiceNote[] {
  const out: VoiceNote[] = [];
  let t = 0;
  for (const note of voice) {
    const end = t + note.length;
    if (end > from && t < to && !note.rest) out.push(note);
    t = end;
    if (t >= to) break;
  }
  return out;
}

/**
 * Does any note of this figure sound a half step or a minor ninth against
 * another voice *without being treated as a dissonance*?
 *
 * The first version of this refused every one outright, which turned out to be
 * stricter than Bach. Measured over the 371 four-part chorales the same way we
 * measure ourselves - counting each overlapping pair of notes once - Bach writes
 * a minor 2nd or minor 9th in **0.82%** of sounding pairs, and this generator
 * before any of these guards wrote **0.83%**. The rate was already right.
 *
 * What differs is the handling, and there the corpus is emphatic. Of Bach's
 * clashing pairs, the dissonant voice is approached AND left by step in
 * **98.3%** of them, one side only in 1.7%, and neither side in **none at all**.
 * So the rule is not "never" - it is "only as a passing motion".
 *
 * That is exactly what a passing tone, a neighbour and a suspension already are,
 * and exactly what an appoggiatura is not: it is defined by leaping into the
 * dissonance. So this refuses the leap and permits the step, which lands us back
 * at the corpus rate rather than an octave below it.
 *
 * A major 7th is not counted at all: it inverts to a half step but does not
 * sound like one, and it is ordinary in this writing.
 *
 * Reads `allNotes`, which is mid-flight: voices decorated before this one show
 * their decorations, voices after it still show chord tones. So it cannot catch
 * two decorations in different voices that clash only with each other - it
 * catches a decoration against whatever is committed when it is considered.
 */
export function clashesBySemitone(
  nctNotes: VoiceNote[],
  noteIndex: number,
  allNotes: VoiceNote[][],
  currentPartIndex: number,
  key: string,
  prevNote: VoiceNote | null,
  nextNote: VoiceNote | null
): boolean {
  const keyInfo = keySignatures[key];
  if (!keyInfo) return false;

  // The figure in its melodic context, so each note's approach and departure
  // can be read off. A suspension is approached by the same pitch, which is a
  // gap of zero and counts as stepwise - it is held, not leapt to.
  const chain: (VoiceNote | null)[] = [
    prevNote && !prevNote.rest ? prevNote : null,
    ...nctNotes,
    nextNote && !nextNote.rest ? nextNote : null,
  ];
  const stepFrom = (a: VoiceNote | null, b: VoiceNote | null): boolean => {
    if (!a || !b || a.rest || b.rest) return false;
    return Math.abs(semitoneOf(a, keyInfo) - semitoneOf(b, keyInfo)) <= 2;
  };

  const currentVoice = allNotes[currentPartIndex];
  let t = timeAtIndex(currentVoice, noteIndex);

  for (let k = 0; k < nctNotes.length; k++) {
    const nct = nctNotes[k];
    if (!nct.rest) {
      const mine = semitoneOf(nct, keyInfo);
      let clashes = false;
      for (let v = 0; v < allNotes.length && !clashes; v++) {
        if (v === currentPartIndex) continue;
        for (const other of notesOverlapping(allNotes[v], t, t + nct.length)) {
          const gap = Math.abs(mine - semitoneOf(other, keyInfo));
          if (gap === 1 || gap === 13) {
            clashes = true;
            break;
          }
        }
      }
      if (clashes) {
        // Allowed, but only as a passing motion - a step in and a step out.
        const into = stepFrom(chain[k], nct);
        const outOf = stepFrom(nct, chain[k + 2]);
        if (!into || !outOf) return true;
      }
    }
    t += nct.length;
  }
  return false;
}

function checkParallelMotion(
  nctNotes: VoiceNote[],
  noteIndex: number,
  allNotes: VoiceNote[][],
  currentPartIndex: number
): boolean {
  if (nctNotes.length < 2) return false;

  const firstNct = nctNotes[0];
  const lastNct = nctNotes[nctNotes.length - 1];
  if (firstNct.rest || lastNct.rest) return false;

  const currentDir = Math.sign(lastNct.pitchValue - firstNct.pitchValue);
  if (currentDir === 0) return false; // stationary - no parallel motion possible

  // Compute the time of the NCT motion in absolute (piece) time. The current
  // voice has its OWN cumulative time; the NCT replaces the note at noteIndex
  // (whose start = sum of lengths up to noteIndex). The motion runs from that
  // start to the end of the original note.
  const currentVoice = allNotes[currentPartIndex];
  const tStart = timeAtIndex(currentVoice, noteIndex);
  const originalLength = currentVoice[noteIndex]?.length ?? firstNct.length + lastNct.length;
  const tEnd = tStart + originalLength;

  for (let v = 0; v < allNotes.length; v++) {
    if (v === currentPartIndex) continue;

    const prevOtherPitch = pitchAtTimeLocal(allNotes[v], tStart);
    const nextOtherPitch = pitchAtTimeLocal(allNotes[v], tEnd);
    if (prevOtherPitch === null || nextOtherPitch === null) continue;

    const otherDir = Math.sign(nextOtherPitch - prevOtherPitch);
    if (otherDir === 0) continue; // other voice is stationary - no parallel motion
    if (currentDir !== otherDir) continue; // contrary/oblique - fine

    // Both voices moving the same direction: check intervals
    const rawIntervalBefore = Math.abs(firstNct.pitchValue - prevOtherPitch);
    const rawIntervalAfter = Math.abs(lastNct.pitchValue - nextOtherPitch);
    const intervalBefore = rawIntervalBefore % 7;
    const intervalAfter = rawIntervalAfter % 7;

    const isParallelFifth = intervalBefore === 4 && intervalAfter === 4;
    const isParallelOctave =
      intervalBefore === 0 &&
      intervalAfter === 0 &&
      rawIntervalBefore > 0 &&
      rawIntervalAfter > 0;

    if (isParallelFifth || isParallelOctave) {
      console.warn(
        `NCT_GEN: Parallel ${isParallelFifth ? "5th" : "octave"} detected ` +
          `between voice ${currentPartIndex} and ${v} at t=${tStart}. Rejecting NCT.`
      );
      return true;
    }
  }

  return false;
}
// ----------------------------

/**
 * Takes an array of voice notes and introduces non-chord tone patterns by
 * subdividing existing notes based on probability.
 *
 * @param notesToProcess - VoiceNote objects for the current part.
 * @param nctRhythms - Rhythm patterns allowed for substitutions.
 * @param allNotes - All voice notes (original chord tones, for parallel-motion checks).
 * @param currentPartIndex - Index of the current voice in allNotes.
 * @param probability - Chance (0–1) of attempting to subdivide a note.
 * @param key - Active key signature string (e.g. "C", "G", "Bb").
 * @param enabledNctTypes - Optional. Filter the NCT type pool to only these
 *   names (e.g. ["Passing Tone", "Neighbor Tone"]). Default: all four types.
 *   Used by Bach SR to disable Anticipation and Appoggiatura (which need
 *   strong/weak-beat awareness and leap-into-dissonance approach respectively
 *   - features the current implementation doesn't honor; see Phase 4).
 */
/** Does every pitch in a decoration sit inside the singer's range? */
function figureInRange(
  figure: VoiceNote[] | null,
  voiceRange: [number, number] | undefined
): boolean {
  if (!figure) return false;
  if (!voiceRange) return true;
  const [low, high] = voiceRange;
  return figure.every((n) => n.rest || (n.pitchValue >= low && n.pitchValue <= high));
}

/**
 * Is every join inside a decoration, and at its two ends, actually singable?
 *
 * Decoration replaces one note with several, which creates melodic intervals the
 * search never saw: the one into the figure, the ones inside it, and the one out
 * of it onto the next chord tone. Range was checked here and interval was not,
 * so a figure could hand back a melodic seventh - measured at 49 in the bass
 * against 0 from the search itself once the bass line was fixed.
 *
 * Only sevenths and wider are refused, not maxSkip: a decoration is by nature a
 * step or two away from the note it decorates, and the figures that leap are
 * leaping to chord tones the search already approved.
 */
function figureIsSingable(
  figure: VoiceNote[] | null,
  prevNote: VoiceNote | null | undefined,
  nextNote: VoiceNote | null | undefined
): boolean {
  if (!figure || figure.length === 0) return false;
  const sung = figure.filter((n) => !n.rest);
  if (sung.length === 0) return true;
  const chain: VoiceNote[] = [];
  if (prevNote && !prevNote.rest) chain.push(prevNote);
  chain.push(...sung);
  if (nextNote && !nextNote.rest) chain.push(nextNote);
  for (let i = 1; i < chain.length; i++) {
    if (!isSingableInterval(chain[i].pitchValue, chain[i - 1].pitchValue)) {
      return false;
    }
  }
  return true;
}

/**
 * Every rule a decoration has to pass, in one place.
 *
 * There are two ways a figure reaches the score - the generators below, and
 * `tryParallelDecoration`, which mirrors a decoration another voice already has
 * - and they had different rules. The mirrored path checked parallel motion and
 * diatonic seconds and then committed, so it never saw the range check, the
 * singability check, or the semitone check: measured, it was the *only*
 * remaining source of minor ninths once the others were closed, 0.05 per
 * exercise against 0.00 from every generator.
 *
 * Two entry points with two rule sets is the bug. One gate is the fix.
 *
 * Returns null when the figure is acceptable, or the reason it is not.
 */
function figureRejection(
  figure: VoiceNote[] | null,
  noteIndex: number,
  allNotes: VoiceNote[][],
  currentPartIndex: number,
  key: string,
  voiceRange: [number, number] | undefined,
  prevNote: VoiceNote | null,
  nextNote: VoiceNote | null
): string | null {
  if (!figure || figure.length === 0) return "empty figure";
  if (!figureInRange(figure, voiceRange)) return "out of range";
  if (!figureIsSingable(figure, prevNote, nextNote)) return "unsingable interval";
  if (
    clashesBySemitone(figure, noteIndex, allNotes, currentPartIndex, key, prevNote, nextNote)
  ) {
    return "semitone clash, not approached and left by step";
  }
  if (checkParallelMotion(figure, noteIndex, allNotes, currentPartIndex)) {
    return "parallel motion violation";
  }
  if (checkClashesWithOtherVoices(figure, noteIndex, allNotes, currentPartIndex)) {
    return "second against another voice";
  }
  return null;
}

export function generateNonChordTones(
  notesToProcess: VoiceNote[],
  nctRhythms: Rhythm[],
  allNotes: VoiceNote[][],
  currentPartIndex: number,
  probability: number = 0.1,
  key: string = "C",
  enabledNctTypes?: string[],
  /**
   * The singer's range, as [low, high] pitch values.
   *
   * Decoration never checked it. A neighbour tone a step below the bass's lowest
   * note is out of range and nothing noticed: measured against the UIL ranges,
   * every voice sat exactly inside its range with decoration off and every voice
   * broke out of it with decoration on - the bass by a third.
   *
   * Optional so existing callers keep working; unset means no check, which is
   * the old behaviour.
   */
  voiceRange?: [number, number],
  /**
   * The measure length in 32nd-note units, so a note's position in the bar can
   * be known. Without it the suspension rule below stands down - the pass has
   * never had any idea where in the bar it was working.
   */
  tsPerMeasure?: number
): VoiceNote[] {
  const outputNotes: VoiceNote[] = [];

  if (!nctRhythms || nctRhythms.length === 0) {
    console.warn("NCT_GEN: No NCT rhythms provided. Returning original notes.");
    return [...notesToProcess];
  }

  const patternNctRhythms = nctRhythms.filter((r) => r.pattern);
  if (patternNctRhythms.length === 0) {
    console.warn("NCT_GEN: No *pattern* NCT rhythms provided. Returning original notes.");
    return [...notesToProcess];
  }

  // Passing and neighbour tones are the ordinary currency of this writing and
  // should dominate; a suspension is a deliberate gesture; an anticipation is
  // rare. These are round numbers in that order rather than any corpus's exact
  // proportions - the aim is well-shaped harmony, not a pastiche of one style.
  const fullNctLibrary: NctDefinition[] = [
    { name: "Suspension", check: checkSuspension, generator: generateSuspension, weight: 20 },
    { name: "Passing Tone", check: checkPassingTone, generator: generatePassingTone, weight: 30 },
    { name: "Neighbor Tone", check: checkNeighborTone, generator: generateNeighborTone, weight: 18 },
    { name: "Anticipation", check: checkAnticipation, generator: generateAnticipation, weight: 1 },
    { name: "Appoggiatura", check: checkAppoggiatura, generator: generateAppoggiatura, weight: 5 },
  ];
  const nctLibrary = enabledNctTypes
    ? fullNctLibrary.filter((d) => enabledNctTypes.includes(d.name))
    : fullNctLibrary;

  for (let i = 0; i < notesToProcess.length; i++) {
    const originalNote = notesToProcess[i];

    // Find next non-rest note
    let nextNote: VoiceNote | null = null;
    for (let j = i + 1; j < notesToProcess.length; j++) {
      if (!notesToProcess[j].rest) {
        nextNote = notesToProcess[j];
        break;
      }
    }

    // Nearest sounding note behind this one. An appoggiatura is defined by
    // being *approached by leap*, so the checks need to see backwards as well.
    let prevNote: VoiceNote | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (!notesToProcess[j].rest) {
        prevNote = notesToProcess[j];
        break;
      }
    }

    // Determine the next note (for pre-cadence check)
    const nextChordNote = notesToProcess[i + 1] ?? null;

    // Skip:
    //  - rests
    //  - the first chord (i === 0) - phrase openings must be pure chord tones
    //  - cadence-end notes (already on the long note itself)
    //  - the note immediately before a cadence end (allows only suspension-style treatment)
    //  - random chance
    if (
      originalNote.rest ||
      i === 0 ||
      originalNote.isCadenceEnd ||
      nextChordNote?.isCadenceEnd ||
      Math.random() >= probability
    ) {
      outputNotes.push(originalNote);
      continue;
    }

    console.log(
      `NCT_GEN: Triggered for note ${i}: ${originalNote.name} (${originalNote.length}), nextNote: ${nextNote?.name ?? "None"}`
    );

    // Prefer moving with a voice that has already been decorated, when the two
    // are a 3rd or a 6th apart. Falls through to an independent decoration if
    // there is nothing to mirror or the result would break a rule.
    const mirrored = tryParallelDecoration(
      originalNote,
      i,
      allNotes,
      currentPartIndex,
      key
    );
    if (mirrored) {
      const why = figureRejection(
        mirrored, i, allNotes, currentPartIndex, key, voiceRange, prevNote, nextNote
      );
      if (!why) {
        if (originalNote.chordSymbol) mirrored[0].chordSymbol = originalNote.chordSymbol;
        console.log(`NCT_GEN: Generated ${mirrored.length} notes for Parallel Motion.`);
        outputNotes.push(...mirrored);
        continue;
      }
      console.log(`NCT_GEN: mirrored decoration rejected (${why}) at ${i}.`);
    }

    const originalDuration = originalNote.length;

    const possibleRhythmicReplacements = patternNctRhythms.filter(
      (r) => r.totalValue === originalDuration
    );

    if (possibleRhythmicReplacements.length === 0) {
      outputNotes.push(originalNote);
      continue;
    }

    // Type and rhythm are chosen together. Picking the rhythm first and then
    // asking which types fit wastes the attempt whenever the two do not match -
    // and they often will not, now that a type can require a particular number
    // of notes (a passing tone across a 4th needs a three-note pattern).
    // A suspension belongs on a strong beat - see onStrongBeat. Everything else
    // is free to fall where the rhythm puts it.
    const strongBeat =
      tsPerMeasure === undefined
        ? true
        : onStrongBeat(timeAtIndex(notesToProcess, i), tsPerMeasure);

    const candidates: { def: NctDefinition; pattern: Rhythm }[] = [];
    for (const def of nctLibrary) {
      if (def.name === "Suspension" && !strongBeat) continue;
      for (const pattern of possibleRhythmicReplacements) {
        if (def.check(originalNote, nextNote, prevNote, pattern)) {
          candidates.push({ def, pattern });
        }
      }
    }

    if (candidates.length === 0) {
      console.log(
        `NCT_GEN: No suitable NCT type for note ${i} (${originalNote.name} -> ${nextNote?.name ?? "None"}). Keeping original.`
      );
      outputNotes.push(originalNote);
      continue;
    }

    let chosen: ReturnType<typeof pickAcrossLibrary> = null;
    for (let draw = 0; draw < DRAWS && !chosen; draw++) {
      chosen = pickAcrossLibrary(nctLibrary, candidates);
    }
    if (!chosen) {
      console.log(`NCT_GEN: nothing drawn fits note ${i}. Keeping original.`);
      outputNotes.push(originalNote);
      continue;
    }
    const selectedNctDefinition = chosen.def;
    const selectedPatternRhythm = chosen.pattern;

    console.log(
      `NCT_GEN: Attempting ${selectedNctDefinition.name} with rhythm: ${selectedPatternRhythm.name}`
    );

    const generatedNctNotes = selectedNctDefinition.generator({
      currentNote: originalNote,
      nextNote,
      prevNote,
      patternRhythm: selectedPatternRhythm,
      allNotes,
      currentPartIndex,
      noteIndex: i,
      key,
    });

    const why = figureRejection(
      generatedNctNotes, i, allNotes, currentPartIndex, key, voiceRange, prevNote, nextNote
    );
    if (why) {
      console.log(`NCT_GEN: ${why} - keeping original note at ${i}.`);
      outputNotes.push(originalNote);
      continue;
    }

    if (generatedNctNotes && generatedNctNotes.length > 0) {
      // The chord symbol belongs to the moment, not to the note, so it moves to
      // whatever now sounds first at that moment.
      //
      // This used to be hand-rolled inside each generator, and two of the six -
      // anticipation and appoggiatura - simply forgot. Their combined weight is
      // 7 of 35, so about a fifth of the decorations on a labelled note deleted
      // that chord's symbol outright, with nothing to show for it. Doing it once
      // here cannot be forgotten by a generator added later.
      //
      // Element 0 always starts at the same instant as the note it replaced:
      // every decoration preserves total duration, which notesSpanning already
      // depends on.
      if (originalNote.chordSymbol) {
        generatedNctNotes[0].chordSymbol = originalNote.chordSymbol;
      }

      console.log(`NCT_GEN: Generated ${generatedNctNotes.length} notes for ${selectedNctDefinition.name}.`);
      outputNotes.push(...generatedNctNotes);
    } else {
      console.log(
        `NCT_GEN: Generation failed for ${selectedNctDefinition.name}. Keeping original.`
      );
      outputNotes.push(originalNote);
    }
  }

  return outputNotes;
}

// ======== NCT Check Functions ==========

/**
 * `pitchValue` indexes `noteArray`, which is **diatonic** - one entry per letter
 * name. So a difference of 1 is a 2nd, 2 is a 3rd, 3 a 4th, 4 a 5th. These
 * checks used to read like semitone tests (the old comment here said "2-4
 * semitones"), which is what let a passing tone fire on a leap it could not
 * fill.
 */
function diatonicGap(a: VoiceNote, b: VoiceNote | null): number | null {
  if (!b || a.pitchValue === undefined || b.pitchValue === undefined) return null;
  return Math.abs(a.pitchValue - b.pitchValue);
}

/**
 * A suspension holds a pitch over from the previous chord into this one, where
 * it is now dissonant, and resolves it **down** by step onto the chord tone.
 *
 * So it fits wherever the previous note sits exactly one diatonic step *above*
 * this one: holding that pitch and falling a step lands precisely on this chord
 * tone, which is the note being decorated.
 *
 * The held pitch is reliably a genuine dissonance, without needing to consult
 * the chord: a triad's members are a 3rd apart, so the note one step above any
 * member is never another member.
 *
 * This is the one common non-chord tone the generator never had, and it is the
 * idiomatic answer to stepwise descent - which is a large share of this music.
 * Without it, a descending step could only ever be decorated as an anticipation.
 */
function checkSuspension(
  currentNote: VoiceNote,
  _nextNote: VoiceNote | null,
  prevNote: VoiceNote | null,
  patternRhythm: Rhythm
): boolean {
  if (patternRhythm.abcValue.length !== 2) return false;
  if (!prevNote || prevNote.pitchValue === undefined) return false;
  if (currentNote.pitchValue === undefined) return false;
  return prevNote.pitchValue === currentNote.pitchValue + 1;
}

/**
 * A passing tone fills the space between two chord tones a **3rd** apart, with
 * the one step that lies between them.
 *
 * The figure needs one note per step of the journey: a 3rd is two notes (the
 * chord tone and one passing note), a 4th is three, a 5th is four. So the gap
 * has to equal the number of notes in the pattern - which is why the pattern is
 * now chosen together with the type rather than before it.
 *
 * This previously admitted 3rds, 4ths and 5ths while the generator inserted
 * exactly one step, so on a 4th it stepped once and left the rest of the gap,
 * reading as an arbitrary leap. Nearly half of what it admitted was that case.
 * With three- and four-note patterns available those leaps are filled properly
 * instead of declined.
 */
function checkPassingTone(
  currentNote: VoiceNote,
  nextNote: VoiceNote | null,
  _prevNote: VoiceNote | null,
  patternRhythm: Rhythm
): boolean {
  const gap = diatonicGap(currentNote, nextNote);
  return gap !== null && gap >= 2 && gap === patternRhythm.abcValue.length;
}

/**
 * A neighbour tone steps away and **comes back**, so it belongs where the next
 * chord tone is the same pitch we started on.
 *
 * Was `<= 2`, identical to the anticipation test, so the two always fired
 * together and split the same ground arbitrarily. Where the next note is a step
 * away and the neighbour moves toward it, the figure is not a neighbour at all -
 * it is an anticipation, and is now generated as one.
 *
 * Two notes give a single neighbour; three give a double neighbour, stepping to
 * one side and then the other before the chord tone returns.
 */
function checkNeighborTone(
  currentNote: VoiceNote,
  nextNote: VoiceNote | null,
  _prevNote: VoiceNote | null,
  patternRhythm: Rhythm
): boolean {
  const n = patternRhythm.abcValue.length;
  return diatonicGap(currentNote, nextNote) === 0 && (n === 2 || n === 3);
}

/**
 * An anticipation sounds the *next* chord's pitch early, so there has to be a
 * next pitch to sound: on a repeated note it produced the same pitch twice - not
 * a non-chord tone at all, just a note chopped in half. That was about a third
 * of all decorations. Requiring a real step or 3rd of movement removes it.
 */
/**
 * Is this note on a strong beat of its measure?
 *
 * A suspension is the one decoration whose whole effect depends on where it
 * falls: the held dissonance lands on the strong beat and resolves onto the weak
 * one. Written the other way round it is not a suspension, it is an accented
 * passing tone that never quite arrives.
 *
 * The downbeat always counts. The midpoint counts too, but only in a measure of
 * four beats or more - in 2/4 that would make every beat strong, and in 3/4 the
 * midpoint is not a beat at all.
 */
function onStrongBeat(startsAt: number, tsPerMeasure: number): boolean {
  const BEAT = 8; // a quarter, in 32nd-note units
  const pos = ((startsAt % tsPerMeasure) + tsPerMeasure) % tsPerMeasure;
  if (pos === 0) return true;
  const beats = tsPerMeasure / BEAT;
  return beats >= 4 && pos === tsPerMeasure / 2;
}

/**
 * An anticipation sounds the NEXT note's pitch early - the tail of this note is
 * given over to where the line is going, arriving before its harmony does.
 *
 * The old test was `gap >= 1 && gap <= 2` looking only forwards, which is not a
 * definition of an anticipation: it is a description of nearly every melodic
 * move. It accepted anticipating by a THIRD, which is not the figure, and never
 * looked at how the note was approached at all.
 *
 * A step ahead, and stepped into. Both halves matter - the point of the figure
 * is a line arriving somewhere slightly early, and a line that leapt in is not
 * doing that.
 */
function checkAnticipation(
  currentNote: VoiceNote,
  nextNote: VoiceNote | null,
  prevNote: VoiceNote | null,
  patternRhythm: Rhythm
): boolean {
  if (patternRhythm.abcValue.length !== 2) return false;
  if (diatonicGap(currentNote, nextNote) !== 1) return false;
  const behind = diatonicGap(currentNote, prevNote);
  return behind !== null && behind <= 1;
}

/**
 * An appoggiatura is an accented dissonance **approached by leap** and resolved
 * by step - the leap is what distinguishes it from a passing tone or a
 * suspension, and it is the only thing that makes the accent sound intentional.
 *
 * `generateAppoggiatura` always resolves to the current chord tone by step, so
 * the resolution half is guaranteed; what was never checked is the approach. The
 * old test looked at the *next* note instead, which has no bearing on the figure.
 */
function checkAppoggiatura(
  currentNote: VoiceNote,
  _nextNote: VoiceNote | null,
  prevNote: VoiceNote | null,
  patternRhythm: Rhythm
): boolean {
  if (patternRhythm.abcValue.length !== 2) return false;
  const approach = diatonicGap(currentNote, prevNote);
  return approach !== null && approach >= 2;
}

/**
 * Weighted pick over (type, pattern) pairs, so the type is chosen by how
 * ordinary it is in the style. A type that fits several patterns is not thereby
 * made more likely: its weight is shared across its own pairs.
 */
/**
 * Pick a decoration by weight across the WHOLE library, not just the types that
 * happen to fit this note - so a weight means "how often this appears", not
 * "how often it wins when it is in the running".
 *
 * The difference is not academic. Every decoration but one needs something
 * specific: a passing tone a 3rd to fill, a suspension a step above, a neighbour
 * a repeated pitch. An anticipation needs only stepwise motion, which is most of
 * this music - so on a rising stepwise line it was the ONLY candidate and won
 * however low its weight. It ran at 34% of all decorations, and cutting it from
 * 4 to 1 against a passing tone at 30 still left it at 25%. It was not winning
 * the draw; it was the only name in it.
 *
 * Drawing from the whole library and declining when the draw does not fit leaves
 * the awkward notes plain, which is the right answer for them.
 */
export function pickAcrossLibrary(
  library: NctDefinition[],
  candidates: { def: NctDefinition; pattern: Rhythm }[]
): { def: NctDefinition; pattern: Rhythm } | null {
  const total = library.reduce((sum, d) => sum + d.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  let chosen: NctDefinition | null = null;
  for (const d of library) {
    roll -= d.weight;
    if (roll < 0) {
      chosen = d;
      break;
    }
  }
  if (!chosen) return null;
  const fits = candidates.filter((c) => c.def.name === chosen!.name);
  if (fits.length === 0) return null;
  return fits[Math.floor(Math.random() * fits.length)];
}

/**
 * How many times to draw before leaving a note plain.
 *
 * One draw is the honest form of the rule and costs three quarters of the
 * decoration - most draws name something that does not fit the note in front of
 * them. A few draws restore the density without restoring the old problem: a
 * type that fits everywhere still only gets its weight's share of each draw, so
 * it cannot go back to winning uncontested.
 */
const DRAWS = 5;

// ======== NCT Generator Functions ==========

function generateSuspension(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, prevNote, patternRhythm, key } = params;
  if (!prevNote || patternRhythm.abcValue.length !== 2) return null;

  const heldPitch = prevNote.pitchValue;
  const resolutionPitch = currentNote.pitchValue;
  if (heldPitch === undefined || resolutionPitch === undefined) return null;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;
  // The dissonance must be the accented half, so it cannot be the shorter note.
  // No pattern in the library is short-then-long today, but item 5 adds an
  // eighth + dotted quarter, and a suspension on that shape would put the
  // dissonance on the offbeat and the resolution on the accent - backwards.
  if (len1 < len2) return null;

  // The held note is the previous chord's note, so any accidental it carries is
  // the one to keep.
  const suspended = createNewNote(prevNote, heldPitch, len1, key);
  const resolution = createNewNote(currentNote, resolutionPitch, len2, key);

  return suspended && resolution ? [suspended, resolution] : null;
}

/**
 * The notes of `voice` that exactly tile [start, end), or null if they do not.
 *
 * Used to spot a decoration another voice has already been given: it will be
 * several notes filling precisely the span of the single chord tone this voice
 * is still deciding about, because every decoration preserves its duration.
 */
function notesSpanning(
  voice: VoiceNote[],
  start: number,
  end: number
): VoiceNote[] | null {
  let t = 0;
  const inside: VoiceNote[] = [];
  for (const note of voice) {
    if (t >= end) break;
    if (t >= start) inside.push(note);
    else if (t + note.length > start) return null; // a note straddles the start
    t += note.length;
  }
  if (inside.length === 0) return null;
  const covered = inside.reduce((sum, n) => sum + n.length, 0);
  return covered === end - start ? inside : null;
}

/**
 * Mirror a decoration another voice has already been given, moving with it in
 * parallel 3rds or 6ths.
 *
 * Two voices decorating together is the most idiomatic thing this generator was
 * missing, and it was impossible until voices were decorated **in turn**: while
 * every voice was handed the others' undecorated lines, there was nothing to
 * mirror. The figure is copied by contour - the same rhythm and the same
 * sequence of steps - starting from this voice's own chord tone, so the two
 * parts stay a consistent distance apart.
 *
 * Only 3rds and 6ths qualify. Mirroring at a 5th or an octave would be parallel
 * 5ths and octaves by construction, which is the one thing the style forbids
 * outright; the compound forms count, so a 10th is as good as a 3rd.
 *
 * A **pair** of voices moving together is the idiom. Left unchecked this
 * cascades - the third voice mirrors the first, the fourth mirrors it too - and
 * the whole texture ends up in lockstep, which is not decoration any more, just
 * a faster surface. So a figure is joined by one voice and no more.
 */
function tryParallelDecoration(
  originalNote: VoiceNote,
  noteIndex: number,
  allNotes: VoiceNote[][],
  currentPartIndex: number,
  key: string
): VoiceNote[] | null {
  const myPitch = originalNote.pitchValue;
  if (myPitch === undefined || originalNote.rest) return null;

  const start = timeAtIndex(allNotes[currentPartIndex], noteIndex);
  const end = start + originalNote.length;

  // How many voices are already subdivided across exactly this span.
  let alreadyMoving = 0;
  for (let v = 0; v < allNotes.length; v++) {
    if (v === currentPartIndex) continue;
    const group = notesSpanning(allNotes[v], start, end);
    if (group && group.length >= 2) alreadyMoving++;
  }
  if (alreadyMoving !== 1) return null;

  for (let v = 0; v < allNotes.length; v++) {
    if (v === currentPartIndex) continue;
    const theirs = notesSpanning(allNotes[v], start, end);
    if (!theirs || theirs.length < 2) continue;
    if (theirs.some((n) => n.rest || n.pitchValue === undefined)) continue;

    const theirFirst = theirs[0].pitchValue;
    const apart = Math.abs(myPitch - theirFirst) % 7;
    if (apart !== 2 && apart !== 5) continue; // not a 3rd or a 6th

    const notes: VoiceNote[] = [];
    let ok = true;
    for (let k = 0; k < theirs.length; k++) {
      const delta = theirs[k].pitchValue - theirFirst;
      const note = createNewNote(originalNote, myPitch + delta, theirs[k].length, key);
      if (!note) {
        ok = false;
        break;
      }
      notes.push(note);
    }
    if (ok && notes.length === theirs.length) return notes;
  }
  return null;
}

/** Each note's length in 32nd units, or null if the pattern is malformed. */
function patternLengths(patternRhythm: Rhythm): number[] | null {
  const lengths = patternRhythm.abcValue.map((v) => parseInt(v));
  if (lengths.some((l) => isNaN(l) || l <= 0)) return null;
  return lengths;
}

/**
 * Walks stepwise from the chord tone toward the next one, one note per step.
 * Two notes cross a 3rd, three cross a 4th, four cross a 5th - the check has
 * already matched the gap to the pattern's note count.
 */
function generatePassingTone(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, nextNote, patternRhythm, key } = params;
  if (!nextNote) return null;

  const pitch1 = currentNote.pitchValue;
  const pitch2 = nextNote.pitchValue;
  if (pitch1 === undefined || pitch2 === undefined) return null;

  const lengths = patternLengths(patternRhythm);
  if (!lengths || lengths.length < 2) return null;

  const direction = pitch1 < pitch2 ? 1 : -1;
  const notes: VoiceNote[] = [];
  for (let k = 0; k < lengths.length; k++) {
    const note = createNewNote(currentNote, pitch1 + direction * k, lengths[k], key);
    if (!note) return null;
    // The first sub-note inherits the chord-start tag; the rest are mid-chord.
    notes.push(note);
  }
  return notes;
}

/**
 * Two notes: chord tone, then a step to one side, and the chord tone returns as
 * the next note. Three notes: a double neighbour - chord tone, one side, the
 * other side - which then resolves back to the chord tone. That figure only
 * makes sense when the note returns, which is what the check guarantees.
 */
function generateNeighborTone(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, patternRhythm, key } = params;

  const pitch1 = currentNote.pitchValue;
  if (pitch1 === undefined) return null;

  const lengths = patternLengths(patternRhythm);
  if (!lengths || lengths.length < 2 || lengths.length > 3) return null;

  const direction = Math.random() < 0.5 ? 1 : -1;
  const pitches =
    lengths.length === 2
      ? [pitch1, pitch1 + direction]
      : [pitch1, pitch1 + direction, pitch1 - direction];

  const notes: VoiceNote[] = [];
  for (let k = 0; k < lengths.length; k++) {
    const note = createNewNote(currentNote, pitches[k], lengths[k], key);
    if (!note) return null;
    notes.push(note);
  }
  return notes;
}

function generateAnticipation(params: NctFunctionParams): VoiceNote[] | null {
  const { currentNote, nextNote, patternRhythm, key } = params;
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null;

  const pitch1 = currentNote.pitchValue;
  const pitch2 = nextNote.pitchValue;
  if (pitch1 === undefined || pitch2 === undefined) return null;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, pitch1, len1, key);
  const note2 = createNewNote(nextNote, pitch2, len2, key);

  return note1 && note2 ? [note1, note2] : null;
}

function generateAppoggiatura(params: NctFunctionParams): VoiceNote[] | null {
  // Accented NCT approached by leap, resolved by step
  const { currentNote, nextNote, patternRhythm, key } = params;
  if (!nextNote || patternRhythm.abcValue.length !== 2) return null;

  const resolutionPitch = currentNote.pitchValue;
  if (resolutionPitch === undefined) return null;

  // Place the appoggiatura a diatonic step above or below the resolution
  const direction = Math.random() < 0.5 ? 1 : -1;
  const appoggiaturaPitch = resolutionPitch + direction;

  const len1 = parseInt(patternRhythm.abcValue[0]);
  const len2 = parseInt(patternRhythm.abcValue[1]);
  if (isNaN(len1) || isNaN(len2) || len1 <= 0 || len2 <= 0) return null;

  const note1 = createNewNote(currentNote, appoggiaturaPitch, len1, key);
  const note2 = createNewNote(currentNote, resolutionPitch, len2, key);

  return note1 && note2 ? [note1, note2] : null;
}
