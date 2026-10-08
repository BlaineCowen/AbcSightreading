/**
 * Every voicing written melody first: SATB, SAB, TTB/TBB and SSA at the
 * levels three-part-treble.ts does not cover, each part doing the job it has
 * in Blaine's pieces (notes/reference-pieces):
 *
 *   SATB, Level 3, "Our Hero": soprano the tune (mi so fa re, by step), alto
 *     holding do (62%) with ti and la, tenor filling the chord (so mi fa),
 *     bass on the roots (do 50%, so 23%, leaping a third of its moves).
 *   SATB, Level 5, "A Demon in My View": the tune around mi, alto and tenor
 *     both moving inner parts (alto do la so, tenor mi do so), bass on roots,
 *     90% of chords complete.
 *   SSA, Level 5, "Give Me More Love": the tune higher (so la ti do), soprano
 *     2 a duet part around mi, the alto moving around do and re.
 *   TB, Level 1, "The Frog": the tenor's tune and a part holding do under it,
 *     which TTB/TBB take with a bass under them.
 *
 * Levels 1-3 take the Level 3 SATB jobs (the mixed and men's voicings have no
 * piece below it yet), Levels 4-5 the Level 5 ones: built from what there is,
 * to be refined as pieces come in (Blaine: "build out the other voicings and
 * levels. We will clean them up later").
 *
 * The method is three-part-treble.ts's, for any number of parts: on each
 * strong beat a chord from the level's own with every part's note at once;
 * the chord held through weak beats, where parts may pass or neighbour by
 * step; the plan's chords kept into each cadence; the cadential suspension
 * in a part that holds do. Hard rules: each part in its range, leaps within
 * maxSkip or the level's listed skips (a step beside an eighth), no crossing,
 * no seconds or sevenths between parts but a suspension, no parallel fifths,
 * octaves or unisons, the leading tone never doubled.
 *
 * Tests: tests/unit/part-writer.test.ts.
 */
import type { Chord, Note, Rhythm, VoiceNote, VoicePart } from "./types";
import { determineAccidental, labelFor } from "./build-chord-notes";
import { keySignatures } from "../resources/key-signatures";
import { listedSkip, type SkipLevel } from "./uil-skips";

/** A part's job: its share of time on each degree (do re mi fa so la ti), the cost of each move in diatonic steps. */
export type Job = { degrees: number[]; move: number[]; bass?: boolean; holdsDo?: boolean };

const TUNE_SA: Job = { degrees: [4, 11, 42, 22, 15, 6, 2], move: [1.2, 0, 2.2, 3] };
const TUNE_SPRING: Job = { degrees: [14, 20, 33, 20, 9, 4, 0], move: [1.2, 0, 2.0, 3] };
const TUNE_HERO: Job = { degrees: [13, 15, 27, 18, 19, 8, 0], move: [1.4, 0, 1.8, 2.4, 3] };
const TUNE_DEMON: Job = { degrees: [13, 14, 39, 16, 13, 4, 1], move: [1.4, 0, 1.8, 2.4, 3] };
const TUNE_LOVE: Job = { degrees: [15, 9, 13, 5, 20, 19, 15], move: [1.4, 0, 1.6, 2.0, 2.4] };
const TUNE_FROG: Job = { degrees: [1, 10, 38, 18, 28, 6, 0], move: [0.8, 0, 2.2, 3] };
const HOLD_HERO: Job = { degrees: [62, 7, 1, 1, 1, 9, 21], move: [0, 0.3, 2.0, 3], holdsDo: true };
const HOLD_SPRING: Job = { degrees: [59, 9, 9, 4, 1, 1, 19], move: [0, 0.3, 2.0, 3], holdsDo: true };
const HOLD_FROG: Job = { degrees: [51, 4, 1, 1, 7, 6, 32], move: [0, 0.3, 2.0, 2.2], holdsDo: true };
const INNER_DEMON: Job = { degrees: [38, 4, 1, 1, 19, 22, 14], move: [0.4, 0, 1.2, 1.6, 2.4] };
const FILL_HERO: Job = { degrees: [9, 5, 30, 21, 33, 1, 1], move: [0.4, 0, 1.0, 1.4, 2.0] };
const FILL_DEMON: Job = { degrees: [24, 4, 38, 14, 16, 1, 4], move: [0.4, 0, 1.0, 1.4, 2.0] };
const DUET_LOVE: Job = { degrees: [18, 15, 33, 11, 17, 1, 2], move: [1.0, 0, 1.8, 3] };
const ALTO_LOVE: Job = { degrees: [42, 18, 9, 1, 2, 13, 14], move: [0.3, 0, 1.6, 3] };
// A bass leaps to the root: a fourth or fifth costs about as much as a third, an octave is fine.
const BASS_HERO: Job = { degrees: [50, 2, 1, 9, 23, 8, 7], move: [0.3, 0.8, 1.2, 0.6, 0.8, 2.5, 4, 0.8], bass: true };
const BASS_DEMON: Job = { degrees: [48, 1, 1, 6, 16, 16, 9], move: [0.3, 0.8, 1.2, 0.6, 0.8, 2.5, 4, 0.8], bass: true };
const BASS_SPRING: Job = { degrees: [43, 1, 1, 1, 41, 11, 5], move: [0.3, 0.6, 1.2, 0.6, 1.4], bass: true };

export type VoicingKind = "SATB" | "SAB" | "TBB" | "SSA";
export type Texture = { name: string; parts: Job[]; arch: number };

/** The jobs for a voicing at a level, top part first. */
export function textureFor(kind: VoicingKind, level: number): Texture {
  const upper = level >= 4;
  switch (kind) {
    case "SATB":
      return upper
        ? { name: "SATB upper", parts: [TUNE_DEMON, INNER_DEMON, FILL_DEMON, BASS_DEMON], arch: 3 }
        : { name: "SATB", parts: [TUNE_HERO, HOLD_HERO, FILL_HERO, BASS_HERO], arch: 2.5 };
    case "SAB":
      return upper
        ? { name: "SAB upper", parts: [TUNE_DEMON, INNER_DEMON, BASS_DEMON], arch: 3 }
        : { name: "SAB", parts: [TUNE_HERO, HOLD_HERO, BASS_HERO], arch: 2.5 };
    case "TBB":
      return upper
        ? { name: "TBB upper", parts: [TUNE_DEMON, INNER_DEMON, BASS_DEMON], arch: 2 }
        : { name: "TBB", parts: [TUNE_FROG, HOLD_FROG, BASS_HERO], arch: 1.5 };
    case "SSA":
      return upper
        ? { name: "SSA upper", parts: [TUNE_LOVE, DUET_LOVE, ALTO_LOVE], arch: 3 }
        : { name: "SSA L1", parts: [level <= 1 ? TUNE_SA : TUNE_SPRING, HOLD_SPRING, BASS_SPRING], arch: 2.5 };
  }
}

/** Which voicing this is, from its parts' names. */
export function voicingKind(voiceParts: { name: string }[]): VoicingKind | null {
  const names = new Set(voiceParts.map((v) => v.name));
  const is = (...n: string[]) => voiceParts.length === n.length && n.every((x) => names.has(x));
  if (is("Soprano", "Alto", "Tenor", "Bass")) return "SATB";
  if (is("Soprano", "Alto", "Baritone")) return "SAB";
  if (is("Tenor", "Baritone", "Bass")) return "TBB";
  if (is("Soprano1", "Soprano2", "Alto")) return "SSA";
  return null;
}

const DEGREE_WEIGHT = 0.9;
const TESSITURA_PULL = 0.25;
const STUCK = 2.5;
const SEESAW = 2;
const FRESH = 0.3;
const NCT_COST = 0.4;
const INCOMPLETE = 1.1;
const CHORD_COST: Record<string, number> = { I: 0, IV: 0.2, V: 1.6, "V⁷": 1.7, ii: 0.8, vi: 0.9, iii: 1.6 };
const RETROGRESSION = 2;
const CHANGE_MID_BAR = 0.4;
const TEMPERATURE = 0.55;
const ATTEMPTS = 40;
const SUSPENSION_RATE = 0.9;
const HALF_CADENCE_SUSPENSION_RATE = 0.9;
const PREPARE = 4;

/** The tune over the part below it: a third, a fourth or a unison now and then (Blaine's pieces). */
const TOP: Record<number, number> = { 2: 0, 3: 1.2, 0: 1.6, 5: 1.0, 4: 1.6, 7: 2.0 };
/** Inner parts: thirds, sixths and fourths, a unison on do. */
const INNER: Record<number, number> = { 2: 0, 0: 1.2, 3: 0.7, 4: 1.0, 5: 0.6, 7: 1.4 };
/** Over a bass: the chord spread up to a twelfth, the fourth avoided (a six-four). */
const OVER_BASS: Record<number, number> = { 2: 0.3, 4: 0.2, 5: 0.4, 7: 0.1, 9: 0.3, 11: 0.4, 0: 1.4, 3: 1.6, 14: 1.0 };

const degreeCost = (shares: number[], degree: number) => -DEGREE_WEIGHT * Math.log((shares[degree] + 1) / 101);
const isPerfect = (apart: number) => apart % 7 === 0 || apart % 7 === 4;
const mod7 = (d: number) => ((d % 7) + 7) % 7;
const toneSet = (c: Chord | undefined) => new Set((c?.triadNotes ?? []).map(mod7));
const dissonant = (apart: number) => mod7(apart) === 1 || mod7(apart) === 6;

function pick<T extends { cost: number }>(scored: T[], rand: () => number): T | null {
  if (!scored.length) return null;
  const best = Math.min(...scored.map((s) => s.cost));
  const weights = scored.map((s) => Math.exp(-(s.cost - best) / TEMPERATURE));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i];
  }
  return scored[scored.length - 1];
}

export type PartWriterOptions = {
  key: string;
  rhythms: Rhythm[];
  progression: Chord[];
  chords: Chord[];
  voiceParts: VoicePart[];
  maxSkip: number;
  tsPerMeasure: number;
  texture: Texture;
  skipLevel?: SkipLevel | null;
  rand?: () => number;
};

type R = Rhythm & { isCadenceEnd?: boolean; isPatternNote?: boolean; isPatternStart?: boolean; isPatternEnd?: boolean };
type Cand = { n: Note; cost: number; nct: boolean };

export function writeParts(o: PartWriterOptions): { voiceNotes: VoiceNote[][]; progression: Chord[] } {
  let last: unknown;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return writeOnce(o);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

function writeOnce(o: PartWriterOptions) {
  const rand = o.rand ?? Math.random;
  const ix = o.voiceParts.map((_, i) => i).sort((a, b) => o.voiceParts[b].order - o.voiceParts[a].order);
  const parts = ix.map((i) => o.voiceParts[i]);
  const N = parts.length;
  const low = N - 1;
  const jobs = o.texture.parts;
  if (jobs.length !== N) throw new Error(`Texture ${o.texture.name} has ${jobs.length} parts, the voicing ${N}.`);
  /** The part that holds do and may suspend it: the first one whose job is to hold, never the lowest. */
  const holder = jobs.findIndex((j, v) => j.holdsDo && v !== low);
  const centres = parts.map((v) => {
    const [lo, hi] = v.currentRange ?? v.range;
    return (lo + hi) / 2 - 0.5;
  });
  const palette = o.chords.filter((c) => c.sharpScaleDegree == null && c.flatScaleDegree == null && c.symbol in CHORD_COST);
  const home = palette.find((c) => c.symbol === "I") ?? o.progression[0];
  /** How the parts above `v` and `v` itself may sit: the table and the widest gap. */
  const pairOf = (v: number): { table: Record<number, number>; widest: number } =>
    jobs[v + 1]?.bass ? { table: OVER_BASS, widest: 14 } : v === 0 ? { table: TOP, widest: 7 } : { table: INNER, widest: 7 };

  const out: VoiceNote[][] = o.voiceParts.map(() => []);
  const sung: Chord[] = [];
  const lines: Note[][] = parts.map(() => []);
  const nct = parts.map(() => false);
  let chordIndex = 0;
  let held: Chord | null = null;
  let lastChord: Chord | null = null;
  let lastSymbol = "";
  const lastStep = o.rhythms.length - 1 - [...o.rhythms].reverse().findIndex((r) => !r.rest);
  const strongEvery = o.tsPerMeasure === 32 ? 16 : o.tsPerMeasure;
  const phraseLength = 4 * o.tsPerMeasure;
  const total = o.rhythms.reduce((n, r) => n + r.totalValue, 0);
  let at = 0;
  let afterCadence = true;
  let suspended = false;

  for (let step = 0; step < o.rhythms.length; step++) {
    const rhythm = o.rhythms[step] as R;
    const onset = at;
    at += rhythm.totalValue;
    if (rhythm.rest) {
      for (const [i, v] of o.voiceParts.entries())
        out[i].push({ name: "z", degree: 0, pitchValue: 0, length: rhythm.totalValue, rest: true, order: v.order, isCadenceEnd: rhythm.isCadenceEnd ?? false });
      continue;
    }
    const planned = o.progression[chordIndex];
    if (!planned) throw new Error("Part writer ran out of chords.");
    const cadence = !!rhythm.isCadenceEnd;
    const final = step === lastStep;
    const first = lines[0].length === 0;
    const intoCadence = cadence || !!(o.rhythms[step + 1] as R | undefined)?.isCadenceEnd;
    const strong = onset % strongEvery === 0 || rhythm.totalValue > 8;
    const continuing = !!rhythm.isPatternNote && !rhythm.isPatternStart;
    const weak = (!strong || continuing) && !cadence;
    const short = rhythm.totalValue < 8 || (step > 0 && o.rhythms[step - 1].totalValue < 8 && !o.rhythms[step - 1].rest);

    const nextR = o.rhythms[step + 1] as R | undefined;
    const afterR = o.rhythms[step + 2] as R | undefined;
    const vNext = o.progression[chordIndex + 1];
    const holderOnDo = holder >= 0 && lines[holder].at(-1)?.degree === 0;
    const suspend =
      holderOnDo && !intoCadence && strong && !short && !rhythm.isPatternNote && rhythm.totalValue <= 8 &&
      !!nextR && !nextR.rest && !nextR.isPatternNote && nextR.totalValue <= 8 && !!afterR?.isCadenceEnd &&
      !!vNext && mod7(vNext.root) === 4 && rand() < SUSPENSION_RATE;
    const prepareHalf = holder >= 0 && !cadence && !!nextR?.isCadenceEnd && nextR.totalValue >= 16 && !!vNext && mod7(vNext.root) === 4;
    const susHalf = holderOnDo && cadence && rhythm.totalValue >= 16 && mod7(planned.root) === 4 && rand() < HALF_CADENCE_SUSPENSION_RATE;

    const choices: { chord: Chord; cost: number }[] = suspend
      ? [{ chord: vNext!, cost: 0 }]
      : intoCadence
        ? [
            { chord: planned, cost: 0 },
            ...(prepareHalf && !toneSet(planned).has(0)
              ? palette.filter((c) => (c.symbol === "I" || c.symbol === "IV") && c !== planned).map((chord) => ({ chord, cost: CHORD_COST[chord.symbol] }))
              : []),
          ]
        : weak && held
          ? [{ chord: held, cost: 0 }]
          : afterCadence && home
            ? [{ chord: home, cost: 0 }]
            : (palette.length ? palette : [planned]).map((chord) => ({
                chord,
                cost:
                  CHORD_COST[chord.symbol] +
                  (held?.symbol.startsWith("V") && (chord.symbol === "IV" || chord.symbol === "ii") ? RETROGRESSION : 0) +
                  (held && chord !== held && onset % o.tsPerMeasure !== 0 ? CHANGE_MID_BAR : 0),
              }));

    const p = (onset % phraseLength) / Math.min(phraseLength, total);
    const rise = p < 0.65 ? Math.sin((Math.PI / 2) * (p / 0.65)) : Math.cos((Math.PI / 2) * ((p - 0.65) / 0.35));

    const options: { chord: Chord; tones: Set<number>; notes: Note[]; nct: boolean[]; cost: number }[] = [];
    for (const { chord, cost: chordCost } of choices) {
      const tones = toneSet(chord);
      const tonic = chord.symbol === "I";
      const root = mod7(chord.root);
      const next = new Set([...toneSet(o.progression[chordIndex + 1] ?? chord), ...tones, ...(weak ? toneSet(home) : [])]);
      const leaves = (n: Note) => [-1, 0, 1].some((d) => next.has(mod7(n.degree + d)));

      const cands: Cand[][] = parts.map((part, v) => {
        const job = jobs[v];
        const line = lines[v];
        const prev = line.at(-1) ?? null;
        const target = centres[v] + (v === 0 ? o.texture.arch * rise - 1 : v === low ? -1 : 0);
        return part.possibleNotes.flatMap((n): Cand[] => {
          let extra = 0;
          if (nct[v] && prev && Math.abs(n.pitchValue - prev.pitchValue) !== 1) return [];
          if (v === holder && suspended && prev && n.pitchValue !== prev.pitchValue - 1) return [];
          if (v === holder && susHalf) {
            if (!prev || n.pitchValue !== prev.pitchValue - 1 || !tones.has(n.degree)) return [];
            return [{ n, cost: 0, nct: false }];
          }
          if (v === holder && suspend) {
            if (!prev || n.pitchValue !== prev.pitchValue) return [];
            return [{ n, cost: 0, nct: !tones.has(n.degree) }];
          }
          if (!tones.has(n.degree)) {
            if (!weak || !prev || Math.abs(n.pitchValue - prev.pitchValue) !== 1 || !leaves(n) || job.bass) return [];
            extra = NCT_COST;
          }
          if (prev) {
            const d = Math.abs(n.pitchValue - prev.pitchValue);
            if (d > (short ? 1 : o.maxSkip) || d === 6) return []; // never a seventh
            if (o.skipLevel && !listedSkip(o.skipLevel, prev, n, [chord, held], v === low)) return [];
          }
          if (first && v === low && n.degree !== 0 && !(job.bass && n.degree === 4)) return [];
          let cost = extra + degreeCost(job.degrees, n.degree) + TESSITURA_PULL * Math.abs(n.pitchValue - target);
          if (v === holder && prepareHalf && n.degree !== 0) cost += PREPARE;
          if (prev) cost += job.move[Math.abs(n.pitchValue - prev.pitchValue)] ?? 4;
          if (prev && line.at(-2)?.pitchValue === prev.pitchValue && n.pitchValue === prev.pitchValue) cost += job.move[0] === 0 ? STUCK / 3 : STUCK;
          if (prev && line.at(-2)?.pitchValue === n.pitchValue && line.at(-3)?.pitchValue === prev.pitchValue && n.pitchValue !== prev.pitchValue) cost += SEESAW;
          if (v === 0) cost += FRESH * line.slice(-6).filter((r) => r.pitchValue === n.pitchValue).length;
          if (job.bass) cost += n.degree === root ? 0 : tonic ? 2.5 : 0.6;
          if (cadence && tonic) {
            if (v === low && n.degree !== 0) cost += 4;
            else if (v > 0 && v < low && n.degree !== 0 && n.degree !== 2 && n.degree !== 4) cost += 2;
            else if (v === 0 && final && n.degree !== 0 && n.degree !== 2) cost += 4;
          }
          if (cadence && !tonic && v === 0 && n.degree !== 1 && n.degree !== 6 && n.degree !== 4) cost += 1.5;
          return [{ n, cost, nct: !tones.has(n.degree) }];
        });
      });

      // Every part at once, top down, checking each new part against those above it.
      const chosen: Cand[] = [];
      const walk = (v: number) => {
        if (v === N) {
          const notes = chosen.map((c) => c.n);
          if (notes.filter((n) => n.degree === 6).length > 1) return;
          const classes = new Set(notes.map((n) => n.degree)).size;
          let cost = chordCost;
          chosen.forEach((c, i) => (cost += c.cost * (i === 0 ? 1 : 0.7)));
          for (let i = 0; i + 1 < N; i++) cost += pairOf(i).table[notes[i].pitchValue - notes[i + 1].pitchValue] ?? 0;
          if (classes < Math.min(3, N) && !cadence && !first && !weak) cost += INCOMPLETE * (N >= 4 ? 1.5 : 1);
          options.push({ chord, tones, notes, nct: chosen.map((c) => c.nct), cost });
          return;
        }
        for (const c of cands[v]) {
          if (v > 0) {
            const above = chosen[v - 1];
            const apart = above.n.pitchValue - c.n.pitchValue;
            const { table, widest } = pairOf(v - 1);
            if (apart < 0 || apart > widest || !(apart in table)) continue;
            if (above.nct && c.nct && apart !== 2 && apart !== 5) continue;
            let ok = true;
            for (let u = 0; u < v && ok; u++) {
              const a = chosen[u].n.pitchValue - c.n.pitchValue;
              const suspension = (u === holder && (suspend || susHalf)) || (v === holder && suspend);
              if (dissonant(a) && !suspension) ok = false;
              const pu = lines[u].at(-1), pv = lines[v].at(-1);
              if (ok && pu && pv) {
                const was = pu.pitchValue - pv.pitchValue;
                if (isPerfect(a) && a === was && (pu.pitchValue !== chosen[u].n.pitchValue || pv.pitchValue !== c.n.pitchValue)) ok = false;
              }
            }
            if (!ok) continue;
          }
          chosen.push(c);
          walk(v + 1);
          chosen.pop();
        }
      };
      walk(0);
    }

    const choice = pick(options, rand);
    if (!choice) throw new Error(`No ${N}-part chord fits here.`);
    const { chord, tones, notes } = choice;
    const placed = notes.map((n, v) => {
      const acc = determineAccidental(n.degree, chord, keySignatures, o.key);
      const note: VoiceNote = {
        ...n,
        name: acc.accidental ? acc.prefix + n.name : n.name,
        length: rhythm.totalValue,
        rest: false,
        order: parts[v].order,
        accidental: acc.accidental,
        wasRaised: acc.accidental === "natural" ? chord.sharpScaleDegree === n.degree : undefined,
        isCadenceEnd: rhythm.isCadenceEnd ?? false,
      };
      if (choice.nct[v]) note.ornament = true;
      return note;
    });
    if (chord !== lastChord) {
      const label = tones.has(placed[low].degree) ? labelFor(chord, placed[low]) : chord.symbol;
      if (label !== lastSymbol) placed[0].chordSymbol = label;
      lastSymbol = label;
      lastChord = chord;
    }
    placed.forEach((note, v) => {
      if (v === holder && susHalf) {
        const prev = lines[v].at(-1)!;
        const heldDo = parts[v].possibleNotes.find((x) => x.pitchValue === prev.pitchValue)!;
        const acc = determineAccidental(heldDo.degree, chord, keySignatures, o.key);
        const firstPart = rhythm.totalValue >= 32 ? 16 : rhythm.totalValue - 8;
        out[ix[v]].push({ ...note, ...heldDo, name: acc.accidental ? acc.prefix + heldDo.name : heldDo.name, accidental: acc.accidental, length: firstPart, ornament: true, isCadenceEnd: false, chordSymbol: undefined });
        out[ix[v]].push({ ...note, length: rhythm.totalValue - firstPart });
        lines[v].push(notes[v]);
        nct[v] = false;
        return;
      }
      out[ix[v]].push(note);
      lines[v].push(notes[v]);
      nct[v] = choice.nct[v];
      if (v === holder) suspended = suspend;
    });
    held = chord;
    afterCadence = cadence;
    if (!rhythm.isPatternNote || rhythm.isPatternEnd) {
      sung[chordIndex] = chord;
      chordIndex++;
    }
  }
  return { voiceNotes: out, progression: sung };
}
