import type { VoiceNote } from "./types";
import { noteArray } from "../resources/noteArray";
import {
  lastSounding,
  firstSounding,
  seamLeapOk,
  seamResolutionOk,
  parallelsAcross,
} from "./splice-seams";

/**
 * The consequent phrase rhymes the antecedent.
 *
 * An eight-measure exercise is two four-measure phrases, and the cadence logic
 * has always known that - m4 and m8 get a cadence every time. What the two
 * phrases never had was any relationship to each other. Measured over 120
 * exercises, the second half repeated the first's rhythm in **0%** of them, and
 * matched it in pitch in 0%. Two phrases of unrelated material is not a period;
 * it is eight bars of correct harmony in a row, which is what these sounded like.
 *
 * This makes a parallel period: the consequent opens with the antecedent's
 * material and departs from it only at the cadence, so the two phrases are the
 * same except for how they end. That is the "one or two changes" - and it is
 * also the single most common shape in the sight-reading repertoire, which is
 * the point of drilling it.
 *
 * Like `unison-spans`, this runs at the very end, after decoration, and splices
 * notes that already exist. **Nothing here can make an exercise fail to
 * generate**: every splice is checked first and simply declined if it does not
 * fit. That is deliberate - constraining the search to produce a period instead
 * would strand steps and cost failure rate, which is the trap that has caught
 * nearly every quality change in this project.
 */

export type RhymingPhraseOptions = {
  measures: number;
  tsPerMeasure: number;
  /** The widest leap any voice may sing, used to vet the two seams. */
  maxSkip: number;
  /** [low, high] per voice, index-aligned with `voiceNotes`. */
  ranges: [number, number][];
  /** How likely the exercise is to be built as periods at all. */
  probability: number;
  /** Injectable for tests. */
  random?: () => number;
};

/** The cadence logic works in four-measure blocks, and so does this. */
export const PHRASE_MEASURES = 4;

/** The notes whose onset falls in [from, to), with the index range they occupy. */
function sliceByTime(
  voice: VoiceNote[],
  from: number,
  to: number
): { notes: VoiceNote[]; startIndex: number; endIndex: number; duration: number } {
  let t = 0;
  let startIndex = -1;
  let endIndex = -1;
  let duration = 0;
  for (let i = 0; i < voice.length; i++) {
    if (t >= from && t < to) {
      if (startIndex === -1) startIndex = i;
      endIndex = i;
      duration += voice[i].length;
    }
    t += voice[i].length;
  }
  return {
    notes: startIndex === -1 ? [] : voice.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    duration,
  };
}





/**
 * Try to make one consequent rhyme its antecedent.
 *
 * `rhymeLength` is how much of the phrase is carried over; the rest is left as
 * generated so the target phrase keeps its own cadence. Returns whether it
 * happened, so a phrase pair that will not join costs nothing.
 *
 * Both seams are vetted in **every** voice before anything is written, because a
 * splice that works for the soprano and strands the bass is worse than no
 * splice at all.
 */
function rhymeOnce(
  voices: VoiceNote[][],
  sourceStart: number,
  targetStart: number,
  rhymeLength: number,
  maxSkip: number
): boolean {
  const sources = voices.map((v) =>
    sliceByTime(v, sourceStart, sourceStart + rhymeLength)
  );
  const targets = voices.map((v) =>
    sliceByTime(v, targetStart, targetStart + rhymeLength)
  );

  for (let i = 0; i < voices.length; i++) {
    const src = sources[i];
    const tgt = targets[i];
    if (src.startIndex === -1 || tgt.startIndex === -1) return false;
    // The two spans cover the same number of measures, so they must fill the
    // same time. If they do not, splicing one into the other shifts every later
    // barline in that voice and the staves stop lining up.
    if (src.duration !== tgt.duration) return false;
    // A span of nothing but rests is silence, not material worth rhyming.
    if (src.notes.every((n) => n.rest)) return false;

    // Seam one: into the borrowed opening. Empty when the target phrase starts
    // the exercise, and then there is no seam to vet at all.
    const beforeTarget = voices[i].slice(0, tgt.startIndex);
    if (!seamLeapOk(beforeTarget, src.notes, maxSkip)) return false;
    if (!seamResolutionOk(beforeTarget, src.notes)) return false;
    // Seam two: out of the borrowed material and into the target phrase's own
    // cadence, which is the part deliberately left alone.
    const afterTarget = voices[i].slice(tgt.endIndex + 1);
    if (!seamLeapOk(src.notes, afterTarget, maxSkip)) return false;
    if (!seamResolutionOk(src.notes, afterTarget)) return false;
  }

  // Both seams again, this time across voices rather than along one. Done after
  // the per-voice loop because a parallel is a relationship between two lines,
  // so every voice's seam notes have to be in hand first.
  const prevsIn = voices.map((v, i) => lastSounding(v.slice(0, targets[i].startIndex)));
  const nextsIn = sources.map((src) => firstSounding(src.notes));
  if (parallelsAcross(prevsIn, nextsIn)) return false;
  const prevsOut = sources.map((src) => lastSounding(src.notes));
  const nextsOut = voices.map((v, i) => firstSounding(v.slice(targets[i].endIndex + 1)));
  if (parallelsAcross(prevsOut, nextsOut)) return false;

  // Vetting is complete, so every voice can be written.
  for (let i = 0; i < voices.length; i++) {
    const src = sources[i];
    const tgt = targets[i];
    const order = voices[i][tgt.startIndex].order;
    voices[i].splice(
      tgt.startIndex,
      tgt.endIndex - tgt.startIndex + 1,
      ...src.notes.map((n) => ({
        ...n,
        order,
        // The cadences live at the phrase ends, which is exactly the material
        // this does not copy. Clearing it anyway keeps a stray flag from
        // reaching mergeRestsWithinMeasures, which reads it to decide where a
        // run of rests may be collapsed.
        isCadenceEnd: false,
      }))
    );
  }
  return true;
}

/**
 * Which pitches the top voice could sing at one instant instead of the one it
 * has.
 *
 * A substitute has to be a tone of the chord sounding there, or the harmony
 * breaks - and the chord is not something this pass is given. It does not need
 * to be: the other voices ARE the chord at that instant. So any scale degree
 * they are sounding is a chord tone by construction, in whatever octave of the
 * top voice's range it lands. That keeps the pass self-contained and cannot
 * disagree with the harmony, because it is reading the harmony rather than
 * re-deriving it.
 *
 * Doubling the note a lower voice already has is exactly what makes this a
 * *different* chord tone rather than a wrong one.
 */
function chordToneAlternatives(
  voices: VoiceNote[][],
  topIndex: number,
  at: number,
  current: VoiceNote,
  [low, high]: [number, number]
): number[] {
  const degrees = new Set<number>();
  for (let v = 0; v < voices.length; v++) {
    if (v === topIndex) continue;
    const sounding = noteAt(voices[v], at);
    if (sounding && !sounding.rest) degrees.add(((sounding.pitchValue % 7) + 7) % 7);
  }
  const out: number[] = [];
  for (let pitch = low; pitch <= high; pitch++) {
    if (pitch === current.pitchValue) continue;
    if (degrees.has(((pitch % 7) + 7) % 7)) out.push(pitch);
  }
  return out;
}

/** The note sounding in a voice at a given time, if any. */
function noteAt(voice: VoiceNote[], at: number): VoiceNote | undefined {
  let t = 0;
  for (const n of voice) {
    if (at >= t && at < t + n.length) return n;
    t += n.length;
  }
  return undefined;
}

/**
 * Give the restatement a different top line at a note or two.
 *
 * A parallel period whose consequent is an exact copy reads as repetition
 * rather than as a rhyme - the only difference is the cadence, which arrives
 * four bars later. Changing one or two notes of the tune is what makes the
 * second phrase answer the first instead of echoing it.
 *
 * Only the top voice, because that is the line anyone follows. Only interior
 * notes: the first note is what makes the phrases recognisably the same, and the
 * last one runs into the cadence the splice deliberately left alone.
 *
 * Every candidate is vetted the way the splice itself is - singable from both
 * neighbours, inside the range, no parallel perfect intervals against the other
 * voices on either side, and no accidental left without its resolution. A note
 * with an accidental is never touched at all: it was written with a resolution
 * that the surrounding notes provide, and swapping it silently voids that.
 */
function varyRestatement(
  voices: VoiceNote[][],
  start: number,
  length: number,
  ranges: [number, number][],
  maxSkip: number,
  random: () => number
): number {
  const topIndex = voices.reduce(
    (best, v, i) => ((v[0]?.order ?? 0) > (voices[best][0]?.order ?? 0) ? i : best),
    0
  );
  const top = voices[topIndex];
  const range = ranges?.[topIndex];
  // No range means no safe way to choose a substitute, so the restatement stays
  // an exact copy. A period that echoes is still a period.
  if (!range) return 0;

  // Interior notes of the span, with the time each begins.
  const slots: { index: number; at: number }[] = [];
  let t = 0;
  for (let i = 0; i < top.length; i++) {
    if (t > start && t < start + length) slots.push({ index: i, at: t });
    t += top[i].length;
  }
  // The last one leads into the cadence; leave it to the seam rules.
  slots.pop();
  if (slots.length === 0) return 0;

  let changed = 0;
  const wanted = slots.length >= 4 ? 2 : 1;
  const offset = Math.floor(random() * slots.length);
  for (let k = 0; k < slots.length && changed < wanted; k++) {
    const { index, at } = slots[(offset + k) % slots.length];
    const note = top[index];
    if (note.rest || note.accidental) continue;
    const prev = lastSounding(top.slice(0, index));
    const next = firstSounding(top.slice(index + 1));
    // Never two in a row - the phrase should still be recognisably the same one.
    if (top[index - 1]?.varied || top[index + 1]?.varied) continue;

    const candidates = chordToneAlternatives(voices, topIndex, at, note, range)
      .filter((pitch) => {
        const trial = { ...note, pitchValue: pitch };
        if (prev && !seamLeapOk([prev], [trial], maxSkip)) return false;
        if (next && !seamLeapOk([trial], [next], maxSkip)) return false;
        if (prev && !seamResolutionOk([prev], [trial])) return false;
        // The note after must still resolve whatever IT owes, unchanged - but a
        // trial note carries no accidental, so only the approach side matters.
        const others = voices.map((v, vi) =>
          vi === topIndex ? undefined : noteAt(v, at)
        );
        const prevOthers = voices.map((v, vi) =>
          vi === topIndex ? undefined : (prev ? noteAt(v, at - 1) : undefined)
        );
        const nextOthers = voices.map((v, vi) =>
          vi === topIndex ? undefined : noteAt(v, at + note.length)
        );
        if (prev) {
          const a = [...prevOthers]; a[topIndex] = prev;
          const b = [...others]; b[topIndex] = trial;
          if (parallelsAcross(a, b)) return false;
        }
        if (next) {
          const a = [...others]; a[topIndex] = trial;
          const b = [...nextOthers]; b[topIndex] = next;
          if (parallelsAcross(a, b)) return false;
        }
        return true;
      });
    if (candidates.length === 0) continue;
    // The nearest alternative, so the line keeps its shape and only its colour
    // changes. A leap to the far side of the chord is a different tune, not a
    // variation on this one.
    const pick = candidates.reduce((best, c) =>
      Math.abs(c - note.pitchValue) < Math.abs(best - note.pitchValue) ? c : best
    );
    // The name is what the assembler prints, so it has to be rebuilt from the
    // new pitch rather than carried over - a substituted note keeping the old
    // one's name renders as the note it replaced.
    top[index] = {
      ...note,
      pitchValue: pick,
      name: noteArray[pick],
      degree: pick % 7,
      accidental: null,
      varied: true,
    } as VoiceNote;
    changed++;
  }
  return changed;
}

/**
 * Build the exercise out of parallel periods.
 *
 * Phrases pair up in order - the second rhymes the first, the fourth rhymes the
 * third - so a sixteen-measure exercise comes out as two periods rather than one
 * long one, which is how music of this length is actually built.
 */
export function applyRhymingPhrases(
  voiceNotes: VoiceNote[][],
  opts: RhymingPhraseOptions
): VoiceNote[][] {
  const { measures, tsPerMeasure, maxSkip, ranges, probability } = opts;
  const random = opts.random ?? Math.random;

  if (probability <= 0 || random() >= probability) return voiceNotes;
  if (voiceNotes.length === 0 || voiceNotes.some((v) => v.length === 0)) {
    return voiceNotes;
  }
  // Two full phrases, or there is no consequent to rhyme.
  if (measures < PHRASE_MEASURES * 2) return voiceNotes;

  const out = voiceNotes.map((v) => v.map((n) => ({ ...n })));
  const phraseTime = PHRASE_MEASURES * tsPerMeasure;
  const phrases = Math.floor(measures / PHRASE_MEASURES);

  for (let p = 0; p + 1 < phrases; p += 2) {
    const antecedentStart = p * phraseTime;
    const consequentStart = (p + 1) * phraseTime;
    // Carry as much of the phrase as will join. Three measures of four is the
    // parallel period proper; two is still a recognisable rhyme and asks less
    // of the seams. Below that it is a coincidence, not a rhyme, so it is left
    // alone rather than forced.
    //
    // Either phrase may be the one that supplies the material, and both are
    // tried, because the two directions do not cost the same. Copying forward
    // has two seams - out of the antecedent's cadence into the borrowed opening,
    // and out of the borrowed material into the consequent's own cadence.
    // Copying *backward* onto the exercise's first phrase has only one, since
    // nothing precedes the opening measure. At the tighter levels that is the
    // difference between a period and no period: with maxSkip 2, the seam into
    // the consequent was refusing half of them on its own.
    //
    // The result is the same parallel period whichever way the material moved.
    const attempts: [number, number][] = [
      [antecedentStart, consequentStart],
      [consequentStart, antecedentStart],
    ];
    let done = false;
    for (const rhymeMeasures of [PHRASE_MEASURES - 1, PHRASE_MEASURES - 2]) {
      for (const [from, to] of attempts) {
        const length = rhymeMeasures * tsPerMeasure;
        if (!rhymeOnce(out, from, to, length, maxSkip)) continue;
        // Vary the phrase that comes second, whichever way the material moved:
        // the ear wants a statement and then an answer to it, and the answer is
        // the later one.
        varyRestatement(out, consequentStart, length, ranges, maxSkip, random);
        done = true;
        break;
      }
      if (done) break;
    }
  }

  return out;
}

/**
 * How often a level should be built as periods.
 *
 * The beginner levels nearly always: repetition is what makes a line learnable,
 * and it is what their repertoire looks like. It thins out as the writing is
 * meant to become continuous rather than sectional, but never to nothing - a
 * period is good writing at any level.
 */
export function rhymeProbabilityFor(uilLevel: string | undefined): number {
  switch (uilLevel) {
    case "UIL 1":
    case "UIL 2":
      return 0.85;
    case "UIL 3":
      return 0.7;
    case "UIL 4":
      return 0.5;
    case "UIL 5":
      return 0.4;
    default:
      return 0.6;
  }
}
