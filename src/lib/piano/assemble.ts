/**
 * A piano exercise as ABC: a grand staff, the right hand on the treble staff
 * and the left on the bass, braced (`%%score {RH | LH}`), a chord written as
 * its notes in brackets. L:1/32, as the rest of the site writes.
 */
import { noteArray } from "../../resources/noteArray";
import { tempoField } from "../meter";
import type { PianoNote } from "./left-hand";

export interface PianoAbcInput {
  key: string;
  meter: string;
  barUnits: number;
  bpm: number;
  title: string;
  rh: PianoNote[];
  lh: PianoNote[];
  /** Bars on each line of the score. */
  barsPerLine?: number;
}

function token(n: PianoNote): string {
  if (n.rest || !n.pitches.length) return `z${n.length}`;
  const names = [...n.pitches].sort((a, b) => a - b).map((p) => noteArray[p]);
  return names.length === 1 ? `${names[0]}${n.length}` : `[${names.join("")}]${n.length}`;
}

/**
 * How far a beam may reach: a half bar in 4/4 and 2/4 (four eighths under one
 * beam, as an Alberti or broken-chord bass is printed), a beat in 3/4.
 */
export function beamGroup(meter: string, barUnits: number): number {
  return meter === "3/4" ? barUnits / 3 : barUnits >= 32 ? barUnits / 2 : barUnits;
}

/**
 * A bar's notes as ABC, beamed: ABC beams notes written with no space between
 * them, so two notes shorter than a quarter, side by side in one beam group,
 * are joined. A rest, or anything a quarter or longer, breaks the beam. It
 * used to join every note with a space, and every eighth printed with its
 * own flag.
 */
export function beamed(bar: PianoNote[], group: number): string {
  let out = "";
  let t = 0;
  bar.forEach((n, i) => {
    const prev = bar[i - 1];
    const prevStart = t - (prev?.length ?? 0);
    const join =
      prev &&
      !prev.rest &&
      !n.rest &&
      prev.length < 8 &&
      n.length < 8 &&
      Math.floor(prevStart / group) === Math.floor(t / group);
    out += (i === 0 || join ? "" : " ") + token(n);
    t += n.length;
  });
  return out;
}

/** A hand's notes, bar by bar. A note never crosses a barline (the writers keep ties off). */
export function barsOf(notes: PianoNote[], barUnits: number): PianoNote[][] {
  const bars: PianoNote[][] = [];
  let t = 0;
  for (const n of notes) {
    const b = Math.floor(t / barUnits);
    (bars[b] ??= []).push(n);
    t += n.length;
  }
  return bars;
}

export function assemblePianoAbc(input: PianoAbcInput): string {
  const { barUnits } = input;
  const per = Math.max(1, input.barsPerLine ?? 4);
  const rh = barsOf(input.rh, barUnits);
  const lh = barsOf(input.lh, barUnits);
  const count = Math.max(rh.length, lh.length);
  const lines: string[] = [
    "X:1",
    `T:${input.title}`,
    "C:abc-sightreading.com",
    `M:${input.meter}`,
    "L:1/32",
    tempoField(input.meter, input.bpm),
    "%%MIDI program 0",
    "%%score {RH | LH}",
    "V:RH clef=treble",
    "V:LH clef=bass",
    `K:${input.key}`,
  ];
  for (let start = 0; start < count; start += per) {
    const end = Math.min(count, start + per);
    const row = (bars: PianoNote[][]) =>
      bars
        .slice(start, end)
        .map((b) => beamed(b, beamGroup(input.meter, barUnits)))
        .join(" | ") + (end === count ? " |]" : " |");
    lines.push(`[V:RH] ${row(rh)}`);
    lines.push(`[V:LH] ${row(lh)}`);
  }
  return lines.join("\n") + "\n";
}
