/**
 * Ten sight-singing play-along lessons for YouTube, following abcStepByStep
 * (src/lib/ladder.ts) from do-re-mi on quarters and halves. Five in C, five
 * in F. Each is a ladder step's settings, with the key set per video and the
 * range placed on that key's do (rangeForSpan), treble clef.
 */
import { ladderById, rangeForSpan } from "../../src/lib/ladder";

export type Lesson = {
  n: number;
  slug: string;
  title: string;
  /** One line for the YouTube description: what this one covers. */
  covers: string;
  key: "C" | "F";
  degrees: number[];
  rhythms: string[];
  meter: string;
  maxSkip: number;
  span: [number, number];
  bpm: number;
};

/** A ladder step's settings in another key. */
const fromStep = (id: string, key: "C" | "F", bpm: number) => {
  const u = ladderById[id].unison!;
  return {
    key,
    degrees: u.selectedScaleDegrees!,
    rhythms: u.selectedRhythms,
    meter: u.selectedTimeSignature,
    maxSkip: u.maxSkip!,
    span: u.span!,
    bpm,
  };
};

export const LESSONS: Lesson[] = [
  {
    n: 1, slug: "01-do-re-mi-quarters-halves-C",
    title: "Sight-Singing Lesson 1: Do, Re, Mi with Quarter and Half Notes (C Major Play-Along)",
    covers: "Three notes, do re mi, moving by step, on quarter notes (ta) and half notes (ta-a) only.",
    key: "C", degrees: [1, 2, 3], rhythms: ["quarter", "half"], meter: "4/4", maxSkip: 1, span: [0, 2], bpm: 80,
  },
  {
    n: 2, slug: "02-do-re-mi-ti-ti-C",
    title: "Sight-Singing Lesson 2: Do, Re, Mi with Eighth Notes (C Major Play-Along)",
    covers: "Do re mi by step, now with eighth-note pairs (ti-ti) added to quarters and halves.",
    ...fromStep("pitch-do-re-mi", "C", 80),
  },
  {
    n: 3, slug: "03-up-to-so-C",
    title: "Sight-Singing Lesson 3: Up to So, Do to So by Step (C Major Play-Along)",
    covers: "Fa and so join in: five notes, do re mi fa so, all by step.",
    ...fromStep("pitch-fa-so", "C", 80),
  },
  {
    n: 4, slug: "04-do-mi-so-skips-C",
    title: "Sight-Singing Lesson 4: Do, Mi, So, Your First Skips (C Major Play-Along)",
    covers: "The first skips: do, mi and so, the notes of the tonic chord.",
    ...fromStep("skips-tonic-triad", "C", 80),
  },
  {
    n: 5, slug: "05-steps-and-skips-C",
    title: "Sight-Singing Lesson 5: Steps and Skips, Do to So (C Major Play-Along)",
    covers: "Steps and skips together from do to so, with quarter rests.",
    ...fromStep("steps-and-skips", "C", 80),
  },
  {
    n: 6, slug: "06-three-beats-F",
    title: "Sight-Singing Lesson 6: 3/4 Time and the Dotted Half Note (F Major Play-Along)",
    covers: "A new key, F major, in three beats a bar, with the dotted half note (ta-a-a).",
    ...fromStep("meter-three", "F", 90),
  },
  {
    n: 7, slug: "07-la-ti-high-do-F",
    title: "Sight-Singing Lesson 7: La, Ti, High Do, the Whole Scale (F Major Play-Along)",
    covers: "The whole major scale from do up to high do, the new notes la and ti by step.",
    ...fromStep("pitch-la-ti-do", "F", 90),
  },
  {
    n: 8, slug: "08-below-do-F",
    title: "Sight-Singing Lesson 8: Below Do, Low So, La and Ti (F Major Play-Along)",
    covers: "Notes below do: low so, la and ti, with skips up to a fifth.",
    ...fromStep("pitch-below-do", "F", 90),
  },
  {
    n: 9, slug: "09-dotted-quarter-F",
    title: "Sight-Singing Lesson 9: The Dotted Quarter and Eighth (F Major Play-Along)",
    covers: "The dotted quarter and eighth (ta-i ti), over low so to so.",
    ...fromStep("rhythm-dotted-quarter", "F", 90),
  },
  {
    n: 10, slug: "10-low-so-to-high-do-F",
    title: "Sight-Singing Lesson 10: Low So to High Do, Putting It Together (F Major Play-Along)",
    covers: "Everything so far over the widest range yet, low so to high do.",
    ...fromStep("rhythm-dotted-quarter", "F", 90),
    span: [-3, 7],
  },
];

/** Treble clef: the range's anchor, the bottom of the page's default treble range (middle C). */
export const TREBLE_ANCHOR = 14;

/** Every skip (a third up to maxSkip steps) between selected degrees, up and down, as the page's link writes them. */
function skipsFor(l: Lesson): string[] {
  const out: string[] = [];
  for (const a of l.degrees)
    for (const b of l.degrees) {
      if (a === b) continue;
      const up = (b - a + 7) % 7;
      if (up >= 2 && up <= l.maxSkip) out.push(`${a}u${b}`);
      const down = (a - b + 7) % 7;
      if (down >= 2 && down <= l.maxSkip) out.push(`${a}d${b}`);
    }
  return out;
}

/** The Unison page's query for a lesson. */
export function queryFor(l: Lesson): string {
  const range = rangeForSpan(l.span, l.key, TREBLE_ANCHOR)!;
  const p = new URLSearchParams({
    clef: "treble",
    range: `${range.min}-${range.max}`,
    span: l.span.join(","),
    anchor: String(TREBLE_ANCHOR),
    key: l.key,
    scaleDegrees: l.degrees.join(","),
    selectedSharpDegrees: "",
    selectedFlatDegrees: "",
    rhythms: l.rhythms.join(","),
    timeSignature: l.meter,
    measures: "8",
    maxSkip: String(l.maxSkip),
    // Exact skips: every skip Max skip would allow between the selected notes,
    // listed, so the generator caps eighths at four in a row (capEighthRuns).
    exactSkips: "1",
    skips: skipsFor(l).join(","),
    bpm: String(l.bpm),
    pairsOnePitch: "true",
    rhythmOnly: "false",
    progressions: "true",
    lyrics: "movable",
    sound: "71",
    transpose: "0",
  });
  return p.toString();
}
