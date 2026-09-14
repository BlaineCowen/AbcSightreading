/**
 * What to tell someone whose exercise could not be written.
 *
 * "Failed to generate" is not actionable. Every one of these names a setting
 * and what to do to it, because the reader's next move is to change something
 * and press Generate again - and the Voice Ranges tab shows six sliders with no
 * indication of which one is in the way.
 *
 * Kept out of the component so the wording can be tested. A hint that names the
 * wrong part is worse than a vague one: it sends someone to widen a voice that
 * was never the problem.
 */

export type PartSpan = {
  name: string;
  /** The part's current range as [low, high] in diatonic steps. */
  range: [number, number];
};

export type FailureContext = {
  parts: PartSpan[];
  measures: number;
  /** How many chords are switched on. */
  chordCount: number;
  maxSkip: number;
  /** Whether eighths are being held to a step - see below. */
  stepwiseEighths?: boolean;
};

/** The part with the least room, which is the one worth widening first. */
export function tightestPart(parts: PartSpan[]): PartSpan | null {
  if (parts.length === 0) return null;
  return parts.reduce((tightest, p) =>
    span(p) < span(tightest) ? p : tightest
  );
}

export function span(p: PartSpan): number {
  return p.range[1] - p.range[0];
}

/**
 * Which voice to give room to, and which end of it.
 *
 * Returned as a clause rather than a sentence, so the hints that already name
 * the part can compose around it without repeating themselves.
 *
 * Both halves are measured rather than guessed. Taking the cells a full sweep
 * still failed in and widening each part by one step in turn: a single step of
 * extra room clears them, the tightest part clears them most reliably, and the
 * TOP of a range is the end that matters - on 3-Part Tenor/Bass at 16 bars,
 * over 120 runs, raising the tenor's or the baritone's ceiling took a 10%
 * failure rate to 0%, while lowering their floor left it at 6-13%. The voices
 * are stacked, so what a part needs is room to move up without crowding the one
 * above it.
 */
export function roomHint(parts: PartSpan[]): string {
  const tightest = tightestPart(parts);
  if (!tightest) return "give a voice more room under Voice Ranges";
  return `give the ${tightest.name} a step or two more room at the top, under Voice Ranges`;
}

export function failureHint(ctx: FailureContext): string {
  const { parts, measures, chordCount, maxSkip, stepwiseEighths } = ctx;
  const tightest = tightestPart(parts);
  const room = roomHint(parts);

  // First, because it is far and away the most effective thing to change and
  // because it is ON by default - so unlike every other hint here, it names a
  // setting the reader did not choose and may not know exists. Across the full
  // sweep it is the difference between 599 failures in 22,068 exercises and 14,
  // and the cells it fails in are exactly the ones the next hint describes:
  // sixteen bars, three or more close parts, minor keys at level 5.
  if (stepwiseEighths && parts.length >= 3 && measures >= 16) {
    return `Holding eighth notes to a step is what usually makes this combination unwritable - sixteen bars in three or more close parts leaves the voices nowhere to step to. Turn off "Eighth notes move by step" under Rhythm, try 8 bars, or ${room}.`;
  }
  if (parts.length >= 3 && measures >= 16) {
    return `Sixteen bars in three or more close parts is the hardest thing to ask for. Try 8 bars instead, or ${room}.`;
  }
  // A tenth or less is where a sweep's remaining failures live: the parts that
  // failed had spans of six to nine.
  if (parts.length >= 3 && tightest !== null && span(tightest) <= 10) {
    // Names the part once. Composing this from `roomHint` said "the Tenor"
    // twice in one breath.
    return `The ${tightest.name} has the least room of any part here, and three or more voices need somewhere to go. Give it a step or two more at the top, under Voice Ranges - that is usually the end that helps.`;
  }
  if (chordCount <= 4) {
    return "With this few chords there may be nowhere left for the bass to go. Switching one more on under Harmony usually does it.";
  }
  if (maxSkip <= 2) {
    return "A largest leap of a third leaves the parts very little room. Raising it by one usually does it.";
  }
  return `The search is random, so pressing Generate again often works. If it keeps failing, ${room}.`;
}
