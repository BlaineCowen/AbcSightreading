/**
 * Two-part treble at the beginning levels, written melody first.
 *
 * The general writer (build-chord-notes) places the lowest voice as a bass
 * line - root or third of each chord - and gives the voice above it whatever
 * chord tone moves least, over a progression that changes chord on every
 * note. In two treble parts that is not how the music goes. Measured against
 * Blaine's Level 1 SA piece (7 October 2026, F major, 24 bars), the
 * generator's soprano sat on so 42% of the time (his: 15%) and repeated a
 * note 37% of its moves (17%), the parts sounded a bare fifth 23% of the time
 * (10%) and a minor sixth, so over ti, 33% (11%), and the alto spent a third
 * of its time on ti. In his piece the harmony changes once a bar or half
 * bar; the alto holds do (59% of its time) with ti, re, la and low so around
 * it; the soprano carries the tune around mi and fa (42% and 22%), by step
 * (79%), above it in thirds (53%) and sixths (25%); and on the weak beats
 * both parts move by step together (mi fa mi over do re do).
 *
 * So here the tune comes first. On each strong beat the writer chooses a
 * chord from the level's own (I, IV, V; V7 at Level 2) together with the
 * soprano note it harmonizes and the alto under it; through the weak beats
 * the chord holds, and the parts may pass or neighbour by step. Only the
 * chords leading into a cadence are taken from the planned progression, so
 * the phrase plan - half cadence, authentic cadence, the rhyme of the
 * answering phrase - is the one generateChoral made. Each choice is scored
 * toward that piece's shape and drawn with a little chance among the best,
 * so no two exercises come out alike. Hard rules, which the rest of the
 * pipeline counts on: inside each part's range, no leap past maxSkip, no
 * crossing, no parallel fifths, octaves or unisons, no seconds or sevenths
 * between the parts, unisons only where a phrase ends.
 *
 * Measured with scripts/sample-choral.ts against the piece (numbers in
 * CLAUDE.md). Tests: tests/unit/two-part-treble.test.ts.
 */
import type { Chord, Note, Rhythm, VoiceNote, VoicePart } from "./types";
import { determineAccidental, labelFor } from "./build-chord-notes";
import { keySignatures } from "../resources/key-signatures";
import { listedSkip, type SkipLevel } from "./uil-skips";

/**
 * What each voicing's pair of parts is like, from Blaine's pieces
 * (notes/reference-pieces): SA from "Silence and Tears", TB from "The Frog"
 * (G, Level 1) - the same texture an octave down, the tune a little higher
 * in its range (so 28% of the tenor's time), the bass more often on ti (32%),
 * so over ti a sixth 26% of the time, and mostly four quarters to a bar.
 */
type Profile = {
  /** Share of the upper part's time on each degree (do re mi fa so la ti). */
  upper: number[];
  /** The lower part's: do held, its neighbours around it. */
  lower: number[];
  /** Cost of the upper part's move, in diatonic steps: repeat, step, third. */
  upperMove: number[];
  /** Between the parts, in diatonic steps apart. */
  vertical: Record<number, number>;
  /** How far the tune rises over each phrase, in diatonic steps above its centre. */
  arch: number;
};
const PROFILES: Record<TwoPartKind, Profile> = {
  SA: {
    upper: [4, 11, 42, 22, 15, 6, 2],
    lower: [59, 8, 2, 1, 10, 7, 15],
    upperMove: [1.2, 0, 2.2],
    // Thirds first, sixths next, fifths sometimes, fourths rarely.
    vertical: { 2: 0, 5: 0.3, 4: 1.3, 3: 2.8, 7: 3, 0: 3.5 },
    arch: 3.5,
  },
  TB: {
    upper: [0, 10, 38, 18, 28, 6, 0],
    lower: [51, 4, 0, 0, 7, 6, 32],
    // The tenor repeats more (28% of its moves, against 17%).
    upperMove: [0.8, 0, 2.2],
    // Sixths nearly as often as thirds, fifths more than in SA.
    vertical: { 2: 0, 5: 0.15, 4: 0.9, 3: 2.8, 7: 3, 0: 3.5 },
    // Its tune spans only a fifth (the Level 1 tenor range).
    arch: 1.5,
  },
};
export type TwoPartKind = "SA" | "TB";
/** How strongly the degree shares steer each choice. */
const DEGREE_WEIGHT = 0.9;

/** The lower part holds more than the tune does; a third is rarer, and do down to low so (a fourth) costs about as much. */
const LOWER_MOVE = [0, 0.3, 2.0, 2.2];
/** Pull toward each part's centre, per diatonic step away. */
const TESSITURA_PULL = 0.25;
/** A third note on one pitch in a row: the line has stopped. */
const STUCK = 2.5;
/** Back and forth between two notes, A B A B: a tune going nowhere. */
const SEESAW = 2;
/*
 * The tune's shape: each four-bar phrase rises toward a high point about
 * two-thirds through and falls to its cadence (his SA rises to la in bar 6);
 * how far is the profile's `arch`.
 */
/** Each time a pitch was sung in the soprano's last six notes: spread the tune over its range. */
const FRESH = 0.35;
/** A third move in a row with both parts going the same way: let the alto hold instead. */
const SAME_WAY_RUN = 1.2;
/** A passing or neighbour note on a weak beat. */
const NCT_COST = 0.3;
/**
 * The chord on a strong beat: tonic home, the others colour. V straight to
 * IV goes backward, and a change on the bar line is preferred to one in the
 * middle of it.
 */
const CHORD_COST: Record<string, number> = { I: 0, IV: 0.4, V: 0.8, "V⁷": 1.0 };
const RETROGRESSION = 2;
const CHANGE_MID_BAR = 0.4;
/** How freely the draw strays from the cheapest choice. */
const TEMPERATURE = 0.55;
/** Whole-exercise attempts before handing the progression back to the caller. */
const ATTEMPTS = 40;

const degreeCost = (shares: number[], degree: number) => -DEGREE_WEIGHT * Math.log((shares[degree] + 1) / 101);
const isPerfect = (apart: number) => apart % 7 === 0 || apart % 7 === 4;
const mod7 = (d: number) => ((d % 7) + 7) % 7;
const toneSet = (c: Chord | undefined) => new Set((c?.triadNotes ?? []).map(mod7));

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

/** Which pair of parts this is: soprano and alto (2 Part Treble), tenor and bass (2 Part Tenor/Bass), or neither. */
export function twoPartKind(voiceParts: { name: string }[]): TwoPartKind | null {
  if (voiceParts.length !== 2) return null;
  if (voiceParts.every((v) => /^(Soprano|Alto)/.test(v.name))) return "SA";
  if (voiceParts.some((v) => v.name === "Tenor") && voiceParts.some((v) => v.name === "Bass")) return "TB";
  return null;
}
export const isTwoPartTreble = (voiceParts: { name: string }[]) => twoPartKind(voiceParts) === "SA";

/**
 * The pairs written melody first at a level: the beginning ones, where the
 * lower part is a harmony part, not a bass - each only where Blaine has
 * written a piece to measure it against (SA at Levels 1-2, TB at Level 1).
 */
export function melodyFirstFor(uilLevel: string | undefined): TwoPartKind[] {
  if (uilLevel === "UIL 1") return ["SA", "TB"];
  if (uilLevel === "UIL 2") return ["SA"];
  return [];
}

export type TwoPartOptions = {
  key: string;
  rhythms: Rhythm[];
  /** The planned progression, one chord per chord position: its cadences are kept. */
  progression: Chord[];
  /** The level's chords, to harmonize the tune from. */
  chords: Chord[];
  voiceParts: VoicePart[];
  /** Skips only as UIL lists them for this level (uil-skips.ts); else up to maxSkip. */
  skipLevel?: SkipLevel | null;
  /** Which pair; SA when left out. */
  kind?: TwoPartKind;
  maxSkip: number;
  /** One bar, in 32nds: which notes fall on a strong beat. */
  tsPerMeasure: number;
  rand?: () => number;
};

export type TwoPartResult = {
  /** One note per voice per rhythm step, index-aligned with `voiceParts`, as buildChordNotes returns. */
  voiceNotes: VoiceNote[][];
  /** The chords sung, one per chord position, in place of the planned progression. */
  progression: Chord[];
};

type R = Rhythm & { isCadenceEnd?: boolean; isPatternNote?: boolean; isPatternStart?: boolean; isPatternEnd?: boolean };

/** Throws when no legal pair is found in ATTEMPTS tries, so the caller draws a new progression. */
export function writeTwoPartTreble(o: TwoPartOptions): TwoPartResult {
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

function writeOnce(o: TwoPartOptions): TwoPartResult {
  const rand = o.rand ?? Math.random;
  const pf = PROFILES[o.kind ?? "SA"];
  const sopIx = o.voiceParts.reduce((best, v, i) => (v.order > o.voiceParts[best].order ? i : best), 0);
  const altIx = sopIx === 0 ? 1 : 0;
  const sop = o.voiceParts[sopIx];
  const alt = o.voiceParts[altIx];
  const centre = (v: VoicePart) => {
    const [lo, hi] = v.currentRange ?? v.range;
    return (lo + hi) / 2 - 0.5;
  };
  const sopCentre = centre(sop);
  const altCentre = centre(alt) - 1;
  // The level's diatonic chords to harmonize from; the plan's own where it has none.
  const palette = o.chords.filter((c) => c.sharpScaleDegree == null && c.flatScaleDegree == null && c.symbol in CHORD_COST);
  const home = palette.find((c) => c.symbol === "I") ?? o.progression[0];

  const out: VoiceNote[][] = o.voiceParts.map(() => []);
  const sung: Chord[] = [];
  const S: Note[] = [];
  const A: Note[] = [];
  let sNct = false;
  let aNct = false;
  let chordIndex = 0;
  let held: Chord | null = null;
  let lastChord: Chord | null = null;
  let lastSymbol = "";
  const lastStep = o.rhythms.length - 1 - [...o.rhythms].reverse().findIndex((r) => !r.rest);
  // A strong beat is the downbeat, and the middle of a 4/4 bar.
  const strongEvery = o.tsPerMeasure === 32 ? 16 : o.tsPerMeasure;
  let at = 0;
  let afterCadence = true;
  const phraseLength = 4 * o.tsPerMeasure;
  const total = o.rhythms.reduce((n, r) => n + r.totalValue, 0);
  const way = (from: Note | undefined, to: Note) => (from ? Math.sign(to.pitchValue - from.pitchValue) : 0);

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
    if (!planned) throw new Error("Two-part writer ran out of chords.");
    const cadence = !!rhythm.isCadenceEnd;
    const final = step === lastStep;
    const intoCadence = cadence || !!(o.rhythms[step + 1] as R | undefined)?.isCadenceEnd;
    const strong = onset % strongEvery === 0 || rhythm.totalValue > 8;
    const continuing = !!rhythm.isPatternNote && !rhythm.isPatternStart;
    // Weak: off the strong beats, a quarter or shorter, not where a phrase
    // ends; the second of an eighth pair always is.
    const weak = (!strong || continuing) && !cadence;
    // An eighth is reached and left by step, in both parts (stepwise eighths).
    const short = rhythm.totalValue < 8 || (step > 0 && o.rhythms[step - 1].totalValue < 8 && !o.rhythms[step - 1].rest);

    // Which chords this note may carry: the plan's into a cadence, the one
    // held through a weak beat or a pattern, the tonic to open a phrase, else
    // any the level has - chosen with the tune.
    const choices: { chord: Chord; cost: number }[] = intoCadence
      ? [{ chord: planned, cost: 0 }]
      : weak && held
        ? [{ chord: held, cost: 0 }]
        : afterCadence && home
          ? [{ chord: home, cost: 0 }]
          : (palette.length ? palette : [planned]).map((chord) => ({
              chord,
              cost:
                CHORD_COST[chord.symbol] +
                (held?.symbol.startsWith("V") && chord.symbol === "IV" ? RETROGRESSION : 0) +
                (held && chord !== held && onset % o.tsPerMeasure !== 0 ? CHANGE_MID_BAR : 0),
            }));

    // Where the tune is headed: up through the phrase, down to its cadence.
    const p = (onset % phraseLength) / Math.min(phraseLength, total);
    const rise = p < 0.65 ? Math.sin((Math.PI / 2) * (p / 0.65)) : Math.cos((Math.PI / 2) * ((p - 0.65) / 0.35));
    const target = sopCentre - 1 + pf.arch * rise;
    const recent = S.slice(-6);
    const sameWay = S.length >= 3 && [1, 2].every((k) => {
      const ws = way(S.at(-k - 1), S.at(-k)!);
      return ws !== 0 && ws === way(A.at(-k - 1), A.at(-k)!);
    });
    const pS = S.at(-1) ?? null;
    const pA = A.at(-1) ?? null;
    const options = choices.flatMap(({ chord, cost: chordCost }) => {
      const tones = toneSet(chord);
      const tonic = chord.symbol === "I";
      // What follows may be this chord held or the plan's next: leave by step into either.
      const next = new Set([...toneSet(o.progression[chordIndex + 1] ?? chord), ...tones, ...(weak ? toneSet(home) : [])]);
      const leaves = (n: Note) => [-1, 0, 1].some((d) => next.has(mod7(n.degree + d)));
      /** Extra cost of singing `n` here: 0 a chord tone, NCT_COST a passing or neighbour note, null not at all. */
      const allowed = (n: Note, prev: Note | null, prevNct: boolean) => {
        if (prevNct && prev && Math.abs(n.pitchValue - prev.pitchValue) !== 1) return null; // a passing or neighbour note leaves by step
        if (tones.has(n.degree)) return 0;
        if (!weak || !prev || Math.abs(n.pitchValue - prev.pitchValue) !== 1 || !leaves(n)) return null;
        return NCT_COST;
      };
      /**
       * A leap this part may take into `n`. Never beside an eighth. At Levels
       * 1-2, only the skips UIL lists for the chord sounding or the one just
       * left (uil-skips.ts). Otherwise anything up to maxSkip, and do down to
       * the sol below in I.
       */
      const leapOk = (prev: Note | null, n: Note) => {
        if (!prev) return true;
        const d = Math.abs(n.pitchValue - prev.pitchValue);
        if (d <= 1) return true;
        if (short) return false;
        const doSol =
          d === 3 && tones.has(0) && tones.has(4) &&
          ((n.degree === 4 && prev.degree === 0 && n.pitchValue < prev.pitchValue) ||
            (n.degree === 0 && prev.degree === 4 && n.pitchValue > prev.pitchValue));
        if (o.skipLevel) return listedSkip(o.skipLevel, prev, n, [chord, held], prev === pA);
        return d <= o.maxSkip || doSol;
      };
      const altScored = (s: Note, sExtra: number) =>
        alt.possibleNotes.flatMap((a) => {
          const extra = allowed(a, pA, aNct);
          if (extra === null) return [];
          const apart = s.pitchValue - a.pitchValue;
          if (apart < 0 || !(apart in pf.vertical)) return []; // no crossing, no 2nds or 7ths, nothing past an octave
          if (apart === 0 && !cadence && pS) return []; // unison only where a phrase ends, or to begin
          if (!pA && a.degree !== 0) return []; // begin on do (UIL: "voices on do-mi-sol, do-mi, or unison do")
          if (extra && sExtra && apart !== 2 && apart !== 5) return []; // two passing notes at once move in thirds or sixths
          if (!leapOk(pA, a)) return [];
          if (pA && pS && isPerfect(apart) && apart === pS.pitchValue - pA.pitchValue && (a.pitchValue !== pA.pitchValue || s.pitchValue !== pS.pitchValue)) return []; // parallel 5ths, 8ves, unisons
          let cost = extra + pf.vertical[apart] + degreeCost(pf.lower, a.degree) + TESSITURA_PULL * Math.abs(a.pitchValue - altCentre);
          if (pA) cost += LOWER_MOVE[Math.abs(a.pitchValue - pA.pitchValue)] ?? 3;
          if (sameWay && pA && pS && Math.sign(a.pitchValue - pA.pitchValue) !== 0 && Math.sign(a.pitchValue - pA.pitchValue) === Math.sign(s.pitchValue - pS.pitchValue)) cost += SAME_WAY_RUN;
          if (pA && A.at(-2)?.pitchValue === pA.pitchValue && a.pitchValue === pA.pitchValue) cost += STUCK / 2; // the alto may hold do longer
          if (cadence && tonic && a.degree !== 0) cost += 4; // home on do
          if (cadence && !tonic && a.degree !== 6 && a.degree !== 4) cost += 2; // ti or so under a half cadence
          return [{ a, aExtra: extra, cost }];
        });
      return sop.possibleNotes.flatMap((s) => {
        const sExtra = allowed(s, pS, sNct);
        if (sExtra === null) return [];
        if (!leapOk(pS, s)) return [];
        if (!pS && s.degree !== 2 && s.degree !== 0) return []; // over do: mi, or a unison do
        let cost = chordCost + sExtra + degreeCost(pf.upper, s.degree) + TESSITURA_PULL * Math.abs(s.pitchValue - target);
        cost += FRESH * recent.filter((r) => r.pitchValue === s.pitchValue).length;
        if (pS) cost += pf.upperMove[Math.abs(s.pitchValue - pS.pitchValue)] ?? 4;
        if (pS && S.at(-2)?.pitchValue === pS.pitchValue && s.pitchValue === pS.pitchValue) cost += STUCK;
        if (pS && S.at(-2)?.pitchValue === s.pitchValue && S.at(-3)?.pitchValue === pS.pitchValue && s.pitchValue !== pS.pitchValue) cost += SEESAW;
        if (cadence && tonic) cost += final ? (s.degree === 0 ? 0 : s.degree === 2 ? 0.8 : 5) : s.degree === 2 || s.degree === 0 ? 0 : 3;
        if (cadence && !tonic) cost += s.degree === 1 ? 0 : 2; // re over the half cadence
        return altScored(s, sExtra).map((p) => ({ chord, tones, s, a: p.a, cost: cost + p.cost * 0.6 }));
      });
    });

    const choice = pick(options, rand);
    if (!choice) throw new Error("No two-part chord tones fit here.");
    const { chord, tones, s, a } = choice;

    const place = (n: Note, v: VoicePart): VoiceNote => {
      const acc = determineAccidental(n.degree, chord, keySignatures, o.key);
      return {
        ...n,
        name: acc.accidental ? acc.prefix + n.name : n.name,
        length: rhythm.totalValue,
        rest: false,
        order: v.order,
        accidental: acc.accidental,
        wasRaised: acc.accidental === "natural" ? chord.sharpScaleDegree === n.degree : undefined,
        isCadenceEnd: rhythm.isCadenceEnd ?? false,
      };
    };
    const sNote = place(s, sop);
    const aNote = place(a, alt);
    // The chord symbol, once per change of harmony, on the top voice (as
    // buildChordNotes does), figured from the alto when it sings the chord.
    if (chord !== lastChord) {
      const label = tones.has(a.degree) ? labelFor(chord, aNote) : chord.symbol;
      if (label !== lastSymbol) sNote.chordSymbol = label;
      lastSymbol = label;
      lastChord = chord;
    }
    sNct = !tones.has(s.degree);
    aNct = !tones.has(a.degree);
    // Marked as decoration, so the restatement pass does not stack another figure on it.
    if (sNct) sNote.ornament = true;
    if (aNct) aNote.ornament = true;
    out[sopIx].push(sNote);
    out[altIx].push(aNote);
    S.push(s);
    A.push(a);
    held = chord;
    afterCadence = cadence;
    if (!rhythm.isPatternNote || rhythm.isPatternEnd) {
      sung[chordIndex] = chord;
      chordIndex++;
    }
  }
  return { voiceNotes: out, progression: sung };
}

/**
 * The bar shapes of Blaine's Level 1 piece, as a weight on where a figure
 * starts (rhythm-generation's positionWeight): a half on the downbeat (half
 * quarter quarter is 58% of his bars, against 15% drawn without this), no
 * half across the middle of a 4/4 bar (quarter half quarter: none of his,
 * 15% drawn), half half rarely (4%), and an eighth pair now and then
 * off the downbeat, mostly on beat 4 (8% of his bars), never on it. 1 elsewhere; never 0, so any bar can still be filled.
 */
export function barShapeWeight(r: Rhythm, pos: number, tsPerMeasure: number, kind: TwoPartKind = "SA"): number {
  if (r.rest) return 1;
  const strong = tsPerMeasure === 32 ? 16 : tsPerMeasure;
  const eighths = r.pattern && r.abcValue.every((v) => v === "4");
  // "The Frog" (TB): four quarters in 54% of bars, a long note only where a
  // phrase ends, and an eighth pair in one bar in five, on beat 3 or 4.
  if (kind === "TB") {
    if (eighths) return pos === 0 ? 0.01 : pos >= strong ? 1.2 : 0.3;
    if (pos % strong !== 0 && r.totalValue >= 16) return 0.05;
    if (r.totalValue >= 16) return 0.35;
    return 1;
  }
  // His pair is on beat 4, leading into the next bar.
  if (eighths) return pos === 0 ? 0.01 : pos === tsPerMeasure - 8 ? 0.5 : 0.15;
  if (pos === 0) return r.totalValue === 16 ? 4 : r.totalValue === 8 ? 0.6 : 1;
  if (pos % strong !== 0 && r.totalValue >= 16) return 0.05;
  // Half half is one bar in twenty-four of his: the middle of the bar moves.
  if (pos === strong && tsPerMeasure === 32 && r.totalValue === 16) return 0.2;
  return 1;
}
