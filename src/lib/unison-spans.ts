import type { VoiceNote } from "./types";
import { seamLeapOk, seamResolutionOk } from "./splice-seams";

/**
 * Putting two parts in unison for a stretch.
 *
 * Beginner two-part writing normally opens with both parts together and splits
 * once the ear is settled - one voice goes do re mi fa mi while the other goes
 * do re mi re do. The generator could not do this at all: measured over 80
 * two-part exercises, **zero** of 2461 note pairs were a unison. Two separate
 * rules saw to that, and both are correct for independent four-part counterpoint:
 * the doubling filter stops two voices taking the same chord degree, and the
 * parallel-unison rule rejects two voices moving together on one pitch - which
 * is precisely what a unison passage is.
 *
 * So this does not touch the search. It runs right at the end - after decoration
 * - and splices one voice's line into the other across a chosen span. Nothing
 * here can make an exercise fail to generate.
 *
 * Only ever applied to a two-voice texture. Two of four parts singing in unison
 * for a phrase is a different (and much rarer) device, and it would leave the
 * harmony a note short.
 */

export type UnisonSpanOptions = {
  measures: number;
  tsPerMeasure: number;
  /** [low, high] per voice, index-aligned with `voiceNotes`. */
  ranges: [number, number][];
  /** The widest leap either voice may sing, used to vet the two seams. */
  maxSkip: number;
  /**
   * How likely the exercise is to use unison at all. Beginner levels want it
   * every time; it thins out as the parts are meant to become independent.
   */
  probability: number;
  /** Injectable for tests. */
  random?: () => number;
};

/** A unison needs to sit inside BOTH singers' ranges, or one of them cannot sing it. */
function fitsRange(notes: VoiceNote[], [low, high]: [number, number]): boolean {
  return notes.every(
    (n) => n.rest || (n.pitchValue >= low && n.pitchValue <= high)
  );
}

/** The notes of a voice whose onset falls in [from, to), and their total length. */
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
 * Make one span unison, if either voice's line is singable by the other.
 *
 * Spliced by *time*, not by index, because this runs after decoration - by then
 * each voice has been subdivided independently and the two arrays no longer line
 * up. Splicing by time also means the two parts share the decoration, which is
 * the point: run before decoration instead and the two lines get different
 * passing tones, which breaks the unison a note at a time. Measured that way,
 * runs collapsed from seven notes to mostly one or two.
 *
 * The upper line is tried first, because in a two-part texture that is the tune
 * and the one worth hearing doubled. Where the lower voice cannot reach it - and
 * with the documented ranges the parts overlap by only a few notes - the lower
 * line is tried instead, which is still a unison and still correct. Returns
 * whether it happened, so a span that fits neither costs nothing.
 */
function unifySpan(
  voices: VoiceNote[][],
  from: number,
  to: number,
  ranges: [number, number][],
  maxSkip: number
): boolean {
  const upper = sliceByTime(voices[0], from, to);
  const lower = sliceByTime(voices[1], from, to);
  if (upper.startIndex === -1 || lower.startIndex === -1) return false;
  // Both cover the same measures, so they must fill the same time. If they do
  // not, splicing one into the other would shift every later barline.
  if (upper.duration !== lower.duration) return false;
  // A span that is all rests is a silence, not a unison passage.
  if (upper.notes.every((n) => n.rest)) return false;

  let source: 0 | 1;
  if (fitsRange(upper.notes, ranges[1])) source = 0;
  else if (fitsRange(lower.notes, ranges[0])) source = 1;
  else return false;

  const target = source === 0 ? 1 : 0;
  const slice = source === 0 ? upper : lower;
  const into = source === 0 ? lower : upper;

  // The two seams, where the borrowed line meets what the target voice sang
  // before and after it. Checking only that the notes were in range let this
  // hand the singer a leap the search would never have written: measured on a
  // two-part tenor/bass texture, intervals wider than maxSkip went from 93 to
  // 332 and melodic sevenths from 1 to 19, purely from these joins.
  //
  // The parallel check the rhyme splice also applies is deliberately NOT used
  // here - two parts moving together on one pitch is what a unison passage IS,
  // so the rule that forbids it is the wrong rule for this pass.
  const before = voices[target].slice(0, into.startIndex);
  const after = voices[target].slice(into.endIndex + 1);
  if (!seamLeapOk(before, slice.notes, maxSkip)) return false;
  if (!seamLeapOk(slice.notes, after, maxSkip)) return false;
  if (!seamResolutionOk(before, slice.notes)) return false;
  if (!seamResolutionOk(slice.notes, after)) return false;

  const order = voices[target][into.startIndex].order;
  voices[target].splice(
    into.startIndex,
    into.endIndex - into.startIndex + 1,
    ...slice.notes.map((n) => ({ ...n, order }))
  );
  return true;
}

/**
 * Both parts sing together for the opening, and sometimes rejoin later.
 *
 * The opening span is the point of the feature; the rejoins are what stop it
 * reading as "the composer forgot to write the second part for four bars".
 */
export function applyUnisonSpans(
  voiceNotes: VoiceNote[][],
  opts: UnisonSpanOptions
): VoiceNote[][] {
  const { measures, tsPerMeasure, ranges, maxSkip, probability } = opts;
  const random = opts.random ?? Math.random;

  if (voiceNotes.length !== 2) return voiceNotes;
  if (probability <= 0 || random() >= probability) return voiceNotes;
  if (voiceNotes.some((v) => v.length === 0)) return voiceNotes;
  if (measures < 4) return voiceNotes; // nothing to split back apart

  const out = voiceNotes.map((v) => v.map((n) => ({ ...n })));

  // The opening: two measures together, or one on a short exercise. Never more
  // than a quarter of the piece, or the split never gets heard.
  //
  // Both lengths are tried. A span is now vetted at its seams rather than only
  // for range, so one that will not join is refused - and refusing the only
  // candidate meant refusing the feature. Measured on 2-Part Treble at UIL 2,
  // taking the first length and giving up dropped the exercises with any unison
  // in them from 54% to 21%.
  const openingLength = Math.max(1, Math.min(2, Math.floor(measures / 4)));
  for (let len = openingLength; len >= 1; len--) {
    if (unifySpan(out, 0, len * tsPerMeasure, ranges, maxSkip)) break;
  }

  // A later rejoin, on a longer exercise. Kept clear of the opening and of the
  // final measure, so the exercise still ends in two parts.
  //
  // Every legal position is tried, starting from a random one and wrapping, so
  // the placement stays as varied as it was while a stretch where the parts
  // happen to be close enough to join can actually be found. Joining a unison
  // means one voice leaping onto the other's line, and at UIL 1 - maxSkip a
  // third - only a few places in a line are near enough for that to be singable.
  if (measures >= 8) {
    const span = Math.max(1, Math.min(2, Math.floor(measures / 8)));
    const earliest = openingLength + 1;
    const latest = measures - 1 - span;
    if (latest >= earliest) {
      const slots = latest - earliest + 1;
      const first = Math.floor(random() * slots);
      for (let k = 0; k < slots; k++) {
        const from = earliest + ((first + k) % slots);
        if (unifySpan(out, from * tsPerMeasure, (from + span) * tsPerMeasure, ranges, maxSkip)) {
          break;
        }
      }
    }
  }

  return out;
}

/**
 * How often a level should open in unison.
 *
 * Beginner levels every time - it is how two-part music at that level is
 * written. Level 3 occasionally, since the parts are meant to be growing
 * independent. Above that, never.
 */
export function unisonProbabilityFor(uilLevel: string | undefined): number {
  switch (uilLevel) {
    case "UIL 1":
    case "UIL 2":
      return 1;
    case "UIL 3":
      return 0.35;
    default:
      return 0;
  }
}
