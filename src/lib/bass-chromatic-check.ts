import type { VoiceNote } from "./types";

/**
 * The rule for a chromatic note in the bass, checked on a finished exercise.
 *
 * A bass note whose accidental differs from the key is approached by step from
 * the last note the bass sang and left by step in its own direction - up from a
 * raised note, down from a lowered one. Repeats of the same note (same pitch,
 * same accidental) are the note continuing, not a move, and are skipped over
 * on both sides; a rest is skipped too, since a singer's reference pitch is the
 * last one sung.
 *
 * The generator enforces this while it writes (see notes/bass-chromatic-notes.md
 * for where), and gets it right on all but about one exercise in several
 * hundred, each a genuine dead end the deadlock escape wrote its way out of.
 * generateChoralExercise runs this check over the result and generates again
 * when it finds a fault, so the rule holds on the page rather than nearly.
 *
 * This is the same walk scripts/analysis/bass_accidentals.ts measures with.
 */
export function bassChromaticFaults(voiceNotes: VoiceNote[][]): number {
  const bass = lowestVoice(voiceNotes);
  if (!bass) return 0;
  const sounding = bass.filter((n) => !n.rest);
  let faults = 0;
  for (let k = 0; k < sounding.length; k++) {
    const note = sounding[k];
    if (!note.accidental) continue;
    const isRepeat = (p: VoiceNote) =>
      p.pitchValue === note.pitchValue && p.accidental === note.accidental;
    let prev: VoiceNote | undefined;
    for (let j = k - 1; j >= 0 && !prev; j--) if (!isRepeat(sounding[j])) prev = sounding[j];
    let next: VoiceNote | undefined;
    for (let j = k + 1; j < sounding.length && !next; j++) if (!isRepeat(sounding[j])) next = sounding[j];
    if (prev && Math.abs(note.pitchValue - prev.pitchValue) > 1) faults++;
    if (next) {
      const dir = resolutionDirection(note);
      if (dir !== 0 && next.pitchValue !== note.pitchValue + dir) faults++;
    }
  }
  return faults;
}

/** Up for a raised note, down for a lowered one, 0 for a diatonic note. */
export function resolutionDirection(n: VoiceNote): 1 | -1 | 0 {
  if (n.accidental === "sharp" || n.accidental === "double-sharp") return 1;
  if (n.accidental === "flat" || n.accidental === "double-flat") return -1;
  if (n.accidental === "natural") {
    // A natural is raised or lowered depending on what it altered - B natural
    // in F major is raised, F natural in G major is lowered. wasRaised carries
    // that, and without it the note is not chromatic in a way this can judge.
    if (n.wasRaised === true) return 1;
    if (n.wasRaised === false) return -1;
  }
  return 0;
}

/** The voice with the lowest `order` - the bass of whatever voicing this is. */
function lowestVoice(voiceNotes: VoiceNote[][]): VoiceNote[] | undefined {
  let best: VoiceNote[] | undefined;
  let bestOrder = Infinity;
  for (const voice of voiceNotes) {
    const order = voice.find((n) => n.order !== undefined)?.order;
    if (order !== undefined && order < bestOrder) {
      bestOrder = order;
      best = voice;
    }
  }
  return best;
}
