import type { VoiceNote } from "./types";
import { isSingableInterval } from "./leap-recovery";

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

const lastSounding = (notes: VoiceNote[]): VoiceNote | undefined => {
  for (let i = notes.length - 1; i >= 0; i--) if (!notes[i].rest) return notes[i];
  return undefined;
};
const firstSounding = (notes: VoiceNote[]): VoiceNote | undefined => {
  for (const n of notes) if (!n.rest) return n;
  return undefined;
};

/**
 * Whether one voice can be joined at a seam without an unsingable jump.
 *
 * A rest on either side is not a seam at all - the singer breathes there and
 * the interval is not sung - so it passes.
 */
function seamOk(
  before: VoiceNote[],
  after: VoiceNote[],
  maxSkip: number
): boolean {
  const a = lastSounding(before);
  const b = firstSounding(after);
  if (!a || !b) return true;
  const gap = Math.abs(b.pitchValue - a.pitchValue);
  if (!isSingableInterval(a.pitchValue, b.pitchValue)) return false;
  // A rest between the two notes means this is not a leap at all - the phrase
  // has ended, the singer breathes, and the next entry is found rather than
  // slurred into. maxSkip governs how far a line may move while it is being
  // sung, which is a different question, so a rested seam is held only to being
  // singable and to a fifth. Without this the tightest level, whose maxSkip is a
  // third, refuses most periods on an interval nobody actually sings.
  const rested =
    before.some((n) => n.rest && n.length > 0 && before.indexOf(n) > before.indexOf(a)) ||
    after.slice(0, after.indexOf(b)).some((n) => n.rest);
  const allowed = rested ? Math.max(maxSkip, 4) : maxSkip;
  return gap <= allowed;
}

/**
 * Whether an accidental sitting on a seam still gets the resolution it is owed.
 *
 * A chromatic note is written together with the note that resolves it - the
 * search arms `forcedNextBassPitch` and the leading-tone rules at the moment it
 * places the accidental. Splicing replaces whatever came next, so an accidental
 * immediately before a seam loses the resolution it was written with, and
 * nothing downstream notices. Measured: without this, the lowest voice's
 * accidentals resolved by step 95% -> 89% in major, and raised ones rose 92% ->
 * 88%. It is the same class of mistake as the parallels - a fault the search
 * would never allow, introduced at the join.
 *
 * A raised note rises and a lowered note falls; `wasRaised` is what tells the
 * two apart in flat keys, where every chromatic note is spelled as a natural.
 * A repeat of the same pitch is fine: the note is simply held and the
 * resolution comes after, which the splice has not touched.
 */
function resolutionOk(before: VoiceNote[], after: VoiceNote[]): boolean {
  const a = lastSounding(before);
  const b = firstSounding(after);
  if (!a || !b || !a.accidental) return true;
  const delta = b.pitchValue - a.pitchValue;
  if (delta === 0) return true;
  const raised =
    a.accidental === "sharp" ||
    a.accidental === "double-sharp" ||
    (a.accidental === "natural" && a.wasRaised === true);
  return raised ? delta === 1 : delta === -1;
}

/**
 * Whether any pair of voices crosses a seam in parallel perfect intervals.
 *
 * The same rule the search itself applies in `findValidVoiceNote`: both voices
 * moving, in the same direction, into the same perfect interval - a fifth
 * (4 mod 7), an octave (0 mod 7), or a unison. Vetting melodic leaps alone was
 * not enough. Copying a phrase's opening onto another phrase joins two lines
 * that were never written against each other, and measured over 200 exercises
 * that roughly doubled the parallels at UIL 3 and 5 (74 -> 140) - faults the
 * search would never have allowed inside a phrase, appearing at the join.
 */
function parallelsAcross(
  prevs: (VoiceNote | undefined)[],
  nexts: (VoiceNote | undefined)[]
): boolean {
  for (let a = 0; a < prevs.length; a++) {
    for (let b = a + 1; b < prevs.length; b++) {
      const a0 = prevs[a], a1 = nexts[a], b0 = prevs[b], b1 = nexts[b];
      if (!a0 || !a1 || !b0 || !b1) continue;
      // Belt and braces: a held voice is not in parallel motion with anything.
      // Strictly redundant, since Math.sign of no movement is 0 and the
      // direction test below then always differs - kept because the search's own
      // filter is written this way and the two should read alike.
      if (a0.pitchValue === a1.pitchValue) continue;
      if (b0.pitchValue === b1.pitchValue) continue;
      const dirA = Math.sign(a1.pitchValue - a0.pitchValue);
      const dirB = Math.sign(b1.pitchValue - b0.pitchValue);
      if (dirA !== dirB) continue; // contrary or oblique motion is fine
      const before = Math.abs(a0.pitchValue - b0.pitchValue);
      const after = Math.abs(a1.pitchValue - b1.pitchValue);
      if (before % 7 === 4 && after % 7 === 4) return true; // fifths
      if (before % 7 === 0 && after % 7 === 0) return true; // octaves and unisons
    }
  }
  return false;
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
    if (!seamOk(beforeTarget, src.notes, maxSkip)) return false;
    if (!resolutionOk(beforeTarget, src.notes)) return false;
    // Seam two: out of the borrowed material and into the target phrase's own
    // cadence, which is the part deliberately left alone.
    const afterTarget = voices[i].slice(tgt.endIndex + 1);
    if (!seamOk(src.notes, afterTarget, maxSkip)) return false;
    if (!resolutionOk(src.notes, afterTarget)) return false;
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
  const { measures, tsPerMeasure, maxSkip, probability } = opts;
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
        if (rhymeOnce(out, from, to, rhymeMeasures * tsPerMeasure, maxSkip)) {
          done = true;
          break;
        }
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
