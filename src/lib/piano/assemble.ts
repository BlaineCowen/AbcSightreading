/**
 * A piano exercise as ABC: a grand staff, the right hand on the treble staff
 * and the left on the bass, braced (`%%score {RH | LH}`), a chord written as
 * its notes in brackets. L:1/32, as the rest of the site writes.
 *
 * Accidentals are written as the score needs them, bar by bar: a note's
 * alteration is against the key signature (PianoNote `alters`), and ABC
 * carries an accidental to the end of the bar for that pitch, so a raised
 * note followed by the plain one in the same bar writes the natural back.
 */
import { noteArray } from "../../resources/noteArray";
import { keySignatures } from "../../resources/key-signatures";
import { tempoField } from "../meter";
import type { PianoNote } from "./left-hand";
import { degreeOf } from "./voicing";

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

const ACCIDENTAL: Record<number, string> = { [-2]: "__", [-1]: "_", 0: "=", 1: "^", 2: "^^" };

/** What the key signature does to a pitch: +1 sharp, -1 flat, 0. */
export function keyAlter(key: string, pitch: number): number {
  const ks = keySignatures[key];
  if (!ks) return 0;
  const d = degreeOf(key, pitch);
  return ks.sharps.includes(d) ? 1 : ks.flats.includes(d) ? -1 : 0;
}

/** A note's sounding alteration (key signature and its own), and what the bar has written so far, by pitch. */
function token(n: PianoNote, key: string, written: Map<number, number>): string {
  const dyn = n.dynamic ? `!${n.dynamic}!` : "";
  if (n.rest || !n.pitches.length) return `${dyn}z${n.length}`;
  const order = n.pitches.map((p, i) => ({ p, alter: n.alters?.[i] ?? 0 })).sort((a, b) => a.p - b.p);
  const names = order.map(({ p, alter }) => {
    const sounding = keyAlter(key, p) + alter;
    const now = written.get(p) ?? keyAlter(key, p);
    written.set(p, sounding);
    return (sounding !== now ? ACCIDENTAL[sounding] : "") + noteArray[p];
  });
  return dyn + (names.length === 1 ? `${names[0]}${n.length}` : `[${names.join("")}]${n.length}`);
}

/**
 * How far a beam may reach: a half bar in 4/4 and 2/4 (four eighths under one
 * beam, as an Alberti or broken-chord bass is printed), a beat in 3/4 and 6/8.
 */
export function beamGroup(meter: string, barUnits: number): number {
  if (meter === "6/8") return 12;
  return meter === "3/4" ? barUnits / 3 : barUnits >= 32 ? barUnits / 2 : barUnits;
}

/**
 * A bar's notes as ABC, beamed: ABC beams notes written with no space between
 * them, so two notes shorter than a quarter, side by side in one beam group,
 * are joined. A rest, or anything a quarter or longer, breaks the beam. It
 * used to join every note with a space, and every eighth printed with its
 * own flag.
 */
export function beamed(bar: PianoNote[], group: number, key = "C"): string {
  const written = new Map<number, number>();
  let out = "";
  let t = 0;
  bar.forEach((n, i) => {
    const prev = bar[i - 1];
    const prevStart = t - (prev?.length ?? 0);
    const join =
      prev &&
      !prev.rest &&
      !n.rest &&
      !n.dynamic &&
      prev.length < 8 &&
      n.length < 8 &&
      Math.floor(prevStart / group) === Math.floor(t / group);
    out += (i === 0 || join ? "" : " ") + token(n, key, written);
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
  const group = beamGroup(input.meter, barUnits);
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
        .map((b) => beamed(b, group, input.key))
        .join(" | ") + (end === count ? " |]" : " |");
    lines.push(`[V:RH] ${row(rh)}`);
    lines.push(`[V:LH] ${row(lh)}`);
  }
  return lines.join("\n") + "\n";
}
