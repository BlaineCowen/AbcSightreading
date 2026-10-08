/**
 * Three treble parts (SSA) at Levels 2 and 3, written melody first.
 *
 * Blaine's SSA pieces (notes/reference-pieces) give each part a job, and the
 * jobs change with the level:
 *
 *   Level 2, "Oh Lovely Spring": soprano 1 the tune (mi fa re), soprano 2
 *     holding do (59% of its time) with ti, the alto a bass on do and the sol
 *     below (43% and 41%) with la under IV.
 *   Level 3, "The Rainbird": the same three jobs, the tune a little higher.
 *   Level 3, "By the Cradle": the tune higher still (so la fa, leaping inside
 *     the chord), soprano 2 a duet a third under it (mi fa re), the alto
 *     holding do (57%) with ti, la and re.
 *
 * The general writer gave every part the same job - a bass line, then chord
 * tones above it - and at Level 2 its soprano 1 sat on so 78% of the time and
 * repeated a note 59% of its moves (his: 9% and 22%), soprano 2 on mi and re
 * a fourth under it, and the alto in thirds under soprano 2, nothing like a
 * bass.
 *
 * So, as in two-part-treble.ts: on each strong beat a chord is chosen from the
 * level's own together with all three notes; the chord holds through the weak
 * beats, where the parts may pass or neighbour by step; the planned
 * progression is kept into each cadence. Each part is scored by its job (the
 * degree shares and moves of its part in the piece), the pairs by the
 * intervals his pieces sing between them, and the chord by being complete.
 * Hard rules: each part inside its range, no leap past maxSkip (a step beside
 * an eighth), no crossing, no seconds or sevenths between any two parts, no
 * parallel fifths, octaves or unisons, the leading tone never doubled.
 *
 * Tests: tests/unit/three-part-treble.test.ts.
 */
import type { Chord, Note, Rhythm, VoiceNote, VoicePart } from "./types";
import { determineAccidental, labelFor } from "./build-chord-notes";
import { keySignatures } from "../resources/key-signatures";
import { listedSkip, type SkipLevel } from "./uil-skips";
import { alteredOf, isChromatic, pickByChord } from "./part-writer";

/** What a part does: its share of time on each degree (do re mi fa so la ti) and the cost of each move, in diatonic steps. */
type Job = { degrees: number[]; move: number[]; bass?: boolean };

const TUNE_L2: Job = { degrees: [14, 20, 33, 20, 9, 4, 0], move: [1.2, 0, 2.0, 3] };
const TUNE_RAINBIRD: Job = { degrees: [16, 13, 21, 22, 21, 8, 1], move: [1.2, 0, 2.0, 2.6] };
// "By the Cradle" leaps inside the chord (23% of its moves): do so do, la do.
const TUNE_CRADLE: Job = { degrees: [11, 4, 12, 17, 33, 19, 3], move: [1.6, 0, 1.4, 1.8, 2.2] };
const HOLD_SPRING: Job = { degrees: [59, 9, 9, 4, 1, 1, 19], move: [0, 0.3, 2.0, 3] };
const HOLD_RAINBIRD: Job = { degrees: [50, 8, 14, 9, 1, 1, 18], move: [0, 0.3, 2.0, 3] };
const HOLD_CRADLE: Job = { degrees: [57, 9, 5, 1, 1, 10, 17], move: [0.2, 0, 2.0, 3] };
const DUET_CRADLE: Job = { degrees: [16, 22, 33, 23, 5, 1, 1], move: [1.0, 0, 1.8, 3] };
// A bass leaps to the root: do down to so is as easy as a step.
const BASS_SPRING: Job = { degrees: [43, 1, 1, 1, 41, 11, 5], move: [0.3, 0.6, 1.2, 0.6, 1.4], bass: true };
const BASS_RAINBIRD: Job = { degrees: [56, 2, 1, 1, 29, 12, 1], move: [0.3, 0.6, 1.2, 0.6, 1.4], bass: true };

/**
 * Between neighbouring parts, by diatonic steps apart. Soprano 1 over 2: a
 * third (70% in his pieces), a fourth or a unison now and then. Over a bass,
 * soprano 2 sits a third, a unison or a fourth above it (Spring: 42%, 25%,
 * 23%); over a held do, soprano 2 a third, a fourth, a unison (Cradle).
 */
const UPPER: Record<number, number> = { 2: 0, 3: 1.2, 0: 1.6, 5: 1.4, 4: 2.2 };
const LOWER: Record<number, number> = { 2: 0, 0: 1.3, 3: 0.7, 4: 2.4, 5: 2.0 };
/** The outer parts: anything consonant within a tenth. */
const OUTER_MAX = 9;

export type SsaTexture = { name: string; parts: [Job, Job, Job]; arch: number };
/** Level 2: "Oh Lovely Spring". */
const SPRING: SsaTexture = { name: "Spring", parts: [TUNE_L2, HOLD_SPRING, BASS_SPRING], arch: 2.5 };
/** Level 3, half the time each: "The Rainbird" (a bass) or "By the Cradle" (a duet over a held do). */
const RAINBIRD: SsaTexture = { name: "Rainbird", parts: [TUNE_RAINBIRD, HOLD_RAINBIRD, BASS_RAINBIRD], arch: 3 };
const CRADLE: SsaTexture = { name: "Cradle", parts: [TUNE_CRADLE, DUET_CRADLE, HOLD_CRADLE], arch: 3 };

export type SsaLevel = 2 | 3;
/** The texture an exercise is written in at a level. */
export function ssaTexture(level: SsaLevel, rand: () => number = Math.random): SsaTexture {
  if (level === 2) return SPRING;
  return rand() < 0.5 ? RAINBIRD : CRADLE;
}

const DEGREE_WEIGHT = 0.9;
const TESSITURA_PULL = 0.25;
const STUCK = 2.5;
const SEESAW = 2;
const FRESH = 0.3;
const NCT_COST = 0.4;
/** A chord with only two pitch classes, away from a cadence or the opening. */
const INCOMPLETE = 1.1;
// IV favoured and V7 held back, as in part-writer.ts: the parts' degree shares
// lean to V. Level 2 against Spring: the tune on re 25% (his 20, before 29),
// the alto on sol 43% (41, before 46).
const CHORD_COST: Record<string, number> = { I: 0, IV: 0, V: 1.4, "V⁷": 2.0, ii: 0.9, vi: 0.8 };
const RETROGRESSION = 2;
const CHANGE_MID_BAR = 0.4;
const TEMPERATURE = 0.55;
/**
 * The cadential suspension: soprano 2 holds do into the V before a cadence
 * (a fourth over the bass's sol), falls to ti on the next beat, and goes
 * home to do. Spring and The Rainbird sing it at nearly every cadence (bars
 * 8, 16, 24 of Spring); By the Cradle, whose soprano 2 is a duet part, never.
 * How often a cadence takes it, where the rhythm and the line allow.
 */
const SUSPENSION_RATE = 0.9;
/**
 * The same suspension inside a half cadence's long V (The Rainbird, bars 4
 * and 20): soprano 2 brings do into the V and holds it over the bass's sol
 * for the first half of the note, then falls to ti.
 */
const HALF_CADENCE_SUSPENSION_RATE = 0.9;
/** The pull to do for soprano 2 on the beat before such a cadence, so there is a do to hold. */
const PREPARE = 4;
const ATTEMPTS = 40;

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

/** Soprano 1, Soprano 2 and Alto: the 3 Part Treble voicing. */
export const isThreePartTreble = (voiceParts: { name: string }[]) =>
  voiceParts.length === 3 && ["Soprano1", "Soprano2", "Alto"].every((n) => voiceParts.some((v) => v.name === n));

/** The levels SSA is written melody first at: where Blaine has written one to measure against. */
export function ssaLevelFor(uilLevel: string | undefined): SsaLevel | null {
  if (uilLevel === "UIL 2") return 2;
  if (uilLevel === "UIL 3") return 3;
  return null;
}

export type ThreePartOptions = {
  key: string;
  rhythms: Rhythm[];
  progression: Chord[];
  chords: Chord[];
  voiceParts: VoicePart[];
  maxSkip: number;
  tsPerMeasure: number;
  texture: SsaTexture;
  /** Skips only as UIL lists them for this level (uil-skips.ts), every part; else up to maxSkip. */
  skipLevel?: SkipLevel | null;
  rand?: () => number;
};

type R = Rhythm & { isCadenceEnd?: boolean; isPatternNote?: boolean; isPatternStart?: boolean; isPatternEnd?: boolean };

export function writeThreePartTreble(o: ThreePartOptions): { voiceNotes: VoiceNote[][]; progression: Chord[] } {
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

function writeOnce(o: ThreePartOptions) {
  const rand = o.rand ?? Math.random;
  // Top to bottom by order: soprano 1, soprano 2, alto.
  const ix = o.voiceParts.map((_, i) => i).sort((a, b) => o.voiceParts[b].order - o.voiceParts[a].order);
  const parts = ix.map((i) => o.voiceParts[i]);
  const jobs = o.texture.parts;
  const centres = parts.map((v) => {
    const [lo, hi] = v.currentRange ?? v.range;
    return (lo + hi) / 2 - 0.5;
  });
  const palette = o.chords.filter((c) => c.sharpScaleDegree == null && c.flatScaleDegree == null && c.symbol in CHORD_COST);
  const home = palette.find((c) => c.symbol === "I") ?? o.progression[0];

  const out: VoiceNote[][] = o.voiceParts.map(() => []);
  const sung: Chord[] = [];
  const lines: Note[][] = [[], [], []];
  const nct = [false, false, false];
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
  /** Soprano 2 is in a suspension and must fall a step next. */
  let suspended = false;
  /** A part owes its altered note's resolution: the direction it must step next. */
  const owed = [0, 0, 0];
  const holdsDo = jobs[1] !== DUET_CRADLE;

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
    if (!planned) throw new Error("Three-part writer ran out of chords.");
    const cadence = !!rhythm.isCadenceEnd;
    const final = step === lastStep;
    const first = lines[0].length === 0;
    const intoCadence = cadence || !!(o.rhythms[step + 1] as R | undefined)?.isCadenceEnd;
    const strong = onset % strongEvery === 0 || rhythm.totalValue > 8;
    const continuing = !!rhythm.isPatternNote && !rhythm.isPatternStart;
    const weak = (!strong || continuing) && !cadence;
    const short = rhythm.totalValue < 8 || (step > 0 && o.rhythms[step - 1].totalValue < 8 && !o.rhythms[step - 1].rest);

    // A suspension slot: this beat strong, the next a weak beat leading into
    // the cadence on V. The V comes a beat early, so soprano 2's do is held
    // over it and falls to ti while the V sounds.
    const nextR = o.rhythms[step + 1] as R | undefined;
    const afterR = o.rhythms[step + 2] as R | undefined;
    const vNext = o.progression[chordIndex + 1];
    const suspend =
      holdsDo && !intoCadence && strong && !short && !rhythm.isPatternNote && rhythm.totalValue <= 8 &&
      !!nextR && !nextR.rest && !nextR.isPatternNote && nextR.totalValue <= 8 && !!afterR?.isCadenceEnd &&
      !!vNext && mod7(vNext.root) === 4 && lines[1].at(-1)?.degree === 0 && rand() < SUSPENSION_RATE;

    // A half cadence's long V, soprano 2 coming from do: its note is split,
    // do held over the V, then ti. Everything is checked against the ti, the
    // note the held do decorates (in The Rainbird it rubs a second against
    // the tune's re, as a suspension may).
    const prepareHalf =
      holdsDo && !cadence && !!nextR?.isCadenceEnd && nextR.totalValue >= 16 && !!vNext && mod7(vNext.root) === 4;
    const susHalf =
      holdsDo && cadence && rhythm.totalValue >= 16 && mod7(planned.root) === 4 &&
      lines[1].at(-1)?.degree === 0 && rand() < HALF_CADENCE_SUSPENSION_RATE;

    // The plan's chromatic chords, and what they resolve to, are kept (part-writer.ts).
    const keepPlan = isChromatic(planned) || (isChromatic(held) && planned !== held);
    const choices: { chord: Chord; cost: number }[] = keepPlan
      ? [{ chord: planned, cost: 0 }]
      : suspend
      ? [{ chord: vNext!, cost: 0 }]
      : intoCadence
      ? [
          { chord: planned, cost: 0 },
          // Before a half cadence, a chord with do in it, so soprano 2 has one to hold into the V.
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

    const options = choices.flatMap(({ chord, cost: chordCost }) => {
      const tones = toneSet(chord);
      const tonic = chord.symbol === "I";
      const root = mod7(chord.root);
      const next = new Set([...toneSet(o.progression[chordIndex + 1] ?? chord), ...tones, ...(weak ? toneSet(home) : [])]);
      const leaves = (n: Note) => [-1, 0, 1].some((d) => next.has(mod7(n.degree + d)));

      const altered = alteredOf(chord);
      // Each part's candidates on their own, scored by its job.
      const cands = parts.map((part, v) => {
        const job = jobs[v];
        const line = lines[v];
        const prev = line.at(-1) ?? null;
        const target = centres[v] - (v === 0 ? 1 - o.texture.arch * rise : v === 2 ? 1 : 0);
        return part.possibleNotes.flatMap((n) => {
          let extra = 0;
          // An altered note: reached by step, resolved by step the way it leans, never doubled.
          if (owed[v] && prev && !(chord === held && n.pitchValue === prev.pitchValue) && n.pitchValue !== prev.pitchValue + owed[v]) return [];
          if (altered && n.degree === altered.degree && prev && Math.abs(n.pitchValue - prev.pitchValue) > 1) return [];
          if (nct[v] && prev && Math.abs(n.pitchValue - prev.pitchValue) !== 1) return []; // a passing or neighbour note leaves by step
          if (v === 1 && suspended && prev && n.pitchValue !== prev.pitchValue - 1) return []; // a suspension falls a step
          if (v === 1 && susHalf) {
            if (!prev || n.pitchValue !== prev.pitchValue - 1 || !tones.has(n.degree)) return [];
            return [{ n, cost: 0, nct: false }];
          }
          if (v === 1 && suspend) {
            // Held from the beat before, over the V: do, falling to ti next.
            if (!prev || n.pitchValue !== prev.pitchValue) return [];
            return [{ n, cost: 0, nct: !tones.has(n.degree) }];
          }
          if (!tones.has(n.degree)) {
            if (!weak || !prev || Math.abs(n.pitchValue - prev.pitchValue) !== 1 || !leaves(n) || job.bass) return [];
            extra = NCT_COST;
          }
          if (prev) {
            const d = Math.abs(n.pitchValue - prev.pitchValue);
            if (d > (short ? 1 : o.maxSkip)) return [];
            if (o.skipLevel && !listedSkip(o.skipLevel, prev, n, [chord, held], v === 2)) return [];
          }
          if (first && v === 2 && n.degree !== 0 && n.degree !== 4) return []; // begin on do (or the sol below, a bass)
          let cost = extra + degreeCost(job.degrees, n.degree) + TESSITURA_PULL * Math.abs(n.pitchValue - target);
          if (v === 1 && prepareHalf && n.degree !== 0) cost += PREPARE;
          if (prev) cost += job.move[Math.abs(n.pitchValue - prev.pitchValue)] ?? 4;
          if (prev && line.at(-2)?.pitchValue === prev.pitchValue && n.pitchValue === prev.pitchValue) cost += job.move[0] === 0 ? STUCK / 3 : STUCK;
          if (prev && line.at(-2)?.pitchValue === n.pitchValue && line.at(-3)?.pitchValue === prev.pitchValue && n.pitchValue !== prev.pitchValue) cost += SEESAW;
          if (v === 0) cost += FRESH * line.slice(-6).filter((r) => r.pitchValue === n.pitchValue).length;
          // A bass sings the root - do under I without fail (so there is a six-four),
          // elsewhere gently, since its range may not reach it: an alto's lowest
          // note is above fa, and Spring sings la under IV.
          if (job.bass) cost += n.degree === root ? 0 : tonic ? 2.5 : 0.5;
          if (cadence && tonic && (v > 0 ? n.degree !== 0 && !(v === 1 && n.degree === 2) : final ? n.degree !== 0 && n.degree !== 2 : false)) cost += 3;
          if (cadence && !tonic && v === 0 && n.degree !== 1 && n.degree !== 6) cost += 1.5; // re or ti over a half cadence
          return [{ n, cost, nct: !tones.has(n.degree) }];
        });
      });

      // The three together.
      const combos: { chord: Chord; tones: Set<number>; notes: Note[]; nct: boolean[]; cost: number }[] = [];
      for (const a of cands[0])
        for (const b of cands[1]) {
          const ab = a.n.pitchValue - b.n.pitchValue;
          if (ab < 0 || ab > 7 || !(ab in UPPER) || dissonant(ab)) continue;
          if (a.nct && b.nct && ab !== 2 && ab !== 5) continue;
          for (const c of cands[2]) {
            const bc = b.n.pitchValue - c.n.pitchValue;
            const ac = a.n.pitchValue - c.n.pitchValue;
            if (bc < 0 || bc > 7 || !(bc in LOWER) || dissonant(bc) || dissonant(ac) || ac > OUTER_MAX) continue;
            if ((a.nct || b.nct) && c.nct) continue;
            const notes = [a.n, b.n, c.n];
            // No doubled leading tone; no parallel fifths, octaves or unisons between any pair.
            if (notes.filter((n) => n.degree === 6).length > 1) continue;
            if (altered && notes.filter((n) => n.degree === altered.degree).length > 1) continue;
            let parallel = false;
            for (const [x, y] of [[0, 1], [1, 2], [0, 2]]) {
              const px = lines[x].at(-1), py = lines[y].at(-1);
              if (!px || !py) continue;
              const was = px.pitchValue - py.pitchValue, now = notes[x].pitchValue - notes[y].pitchValue;
              if (isPerfect(now) && now === was && (px.pitchValue !== notes[x].pitchValue || py.pitchValue !== notes[y].pitchValue)) parallel = true;
            }
            if (parallel) continue;
            const classes = new Set(notes.map((n) => n.degree)).size;
            let cost = chordCost + a.cost + b.cost * 0.7 + c.cost * 0.7 + UPPER[ab] + LOWER[bc];
            if (classes < 3 && !cadence && !first && !weak) cost += INCOMPLETE;
            if (altered && !notes.some((n) => n.degree === altered.degree)) cost += 6; // a chromatic chord without its altered note is not one
            combos.push({ chord, tones, notes, nct: [a.nct, b.nct, c.nct], cost });
          }
        }
      return combos;
    });

    // The chord first, then its voicing: drawn from every voicing at once, a
    // chord won by how many it had (part-writer pickByChord).
    const choice = pickByChord(options, rand);
    if (!choice) throw new Error("No three-part chord fits here.");
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
      const label = tones.has(placed[2].degree) ? labelFor(chord, placed[2]) : chord.symbol;
      if (label !== lastSymbol) placed[0].chordSymbol = label;
      lastSymbol = label;
      lastChord = chord;
    }
    placed.forEach((note, v) => {
      if (v === 1 && susHalf) {
        const prev = lines[1].at(-1)!;
        const heldDo = parts[1].possibleNotes.find((x) => x.pitchValue === prev.pitchValue)!;
        const acc = determineAccidental(heldDo.degree, chord, keySignatures, o.key);
        const first = rhythm.totalValue >= 32 ? 16 : rhythm.totalValue - 8;
        out[ix[v]].push({ ...note, ...heldDo, name: acc.accidental ? acc.prefix + heldDo.name : heldDo.name, accidental: acc.accidental, length: first, ornament: true, isCadenceEnd: false, chordSymbol: undefined });
        out[ix[v]].push({ ...note, length: rhythm.totalValue - first });
        lines[v].push(notes[v]);
        nct[v] = false;
        return;
      }
      out[ix[v]].push(note);
      lines[v].push(notes[v]);
      nct[v] = choice.nct[v];
      if (v === 1) suspended = suspend;
      const alt = alteredOf(chord);
      owed[v] = alt && notes[v].degree === alt.degree ? alt.lean : owed[v] && chord === held && notes[v].pitchValue === lines[v].at(-2)?.pitchValue ? owed[v] : 0;
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
