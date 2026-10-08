/**
 * "First measure will be all quarter notes, unless 6/8 [will be all eighth
 * notes]" - TMEA's All-State sight-reading levels (tmea-presets.ts). The
 * rhythm is drawn as usual and its first bar replaced by one note a beat (a
 * quarter; in 6/8 three eighths a beat), so the rest of the line, and the
 * cadences, are untouched. Tests: tests/unit/tmea-presets.test.ts.
 */
import { rhythms as catalogue } from "../resources/rhythms";
import { expand } from "./compound-rhythm";
import type { RhythmWithPattern } from "./types";

export function beatsFirstBar(rhythm: RhythmWithPattern[], tsPerMeasure: number, compound: boolean): RhythmWithPattern[] {
  let sum = 0;
  let cut = -1;
  for (let i = 0; i < rhythm.length; i++) {
    sum += rhythm[i].totalValue;
    if (sum === tsPerMeasure) {
      cut = i + 1;
      break;
    }
    if (sum > tsPerMeasure) return rhythm; // a note tied over the barline: leave it
  }
  if (cut < 0 || cut >= rhythm.length) return rhythm; // a one-bar exercise keeps its cadence
  const figure = catalogue.find((r) => r.name === (compound ? "threeEighths" : "quarter"));
  if (!figure) return rhythm;
  const bar = Array.from({ length: Math.round(tsPerMeasure / figure.totalValue) }, () => expand(figure)).flat();
  return [...bar, ...rhythm.slice(cut)];
}
