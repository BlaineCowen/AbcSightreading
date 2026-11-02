import type { Note, VoiceNote, VoicePart } from "./types";
import { generatePossibleNotes } from "./prep-params";
import { octaveFrom, TENOR_REACH } from "./octave-opening";

/**
 * A pickup: one beat before the first bar, the last bar a beat short to make
 * up for it (Blaine, 23 October 2026: an option, "usually starting on scale
 * degree 5"). His pieces open this way: "The Rainbird" on so in unison into
 * do, "Our Hero" on do in octaves, "The Frog" and "A Demon in My View" on the
 * tonic chord.
 *
 * Added to the finished parts, so nothing else in the writer moves: the tune
 * takes so most of the time (do or mi otherwise), the other parts a note of
 * the chord under it - I, or V when the tune is on so in a major key - each
 * reaching its own first note within the exercise's leaps, the lowest part on
 * the chord's root, nothing crossing, no seconds between parts, no parallels
 * into the downbeat. A score that opens in octaves (octave-opening.ts) takes
 * the pickup in octaves too, as Our Hero does. When no pickup fits, or the
 * last note is too short to give up a beat, the exercise is left as it was.
 */

export type PickupOptions = {
  voiceParts: VoicePart[];
  key: string;
  /** One beat, in 32nds. */
  beat: number;
  maxSkip: number;
  /** The exercise's own rule for a move (stepwise eighths, a level's listed skips). */
  leapOk?: (from: VoiceNote, to: VoiceNote) => boolean;
  random?: () => number;
};

/** The tune's pickup: so most of the time, as Blaine asked, else do or mi. */
const TUNE_DEGREES: [number, number][] = [
  [4, 0.75],
  [0, 0.15],
  [2, 0.1],
];
const mod7 = (d: number) => ((d % 7) + 7) % 7;
const isPerfect = (apart: number) => mod7(apart) === 0 || mod7(apart) === 4;
const dissonant = (apart: number) => mod7(apart) === 1 || mod7(apart) === 6;

/** The degrees in a weighted random order. */
function degreeOrder(random: () => number): number[] {
  const left = [...TUNE_DEGREES];
  const out: number[] = [];
  while (left.length) {
    let r = random() * left.reduce((s, [, w]) => s + w, 0);
    const i = left.findIndex(([, w]) => (r -= w) <= 0);
    out.push(left.splice(i < 0 ? left.length - 1 : i, 1)[0][0]);
  }
  return out;
}

export function addPickup(voices: VoiceNote[][], o: PickupOptions): { voices: VoiceNote[][]; pickup: number } | null {
  const random = o.random ?? Math.random;
  const N = voices.length;
  if (!N || voices.length !== o.voiceParts.length) return null;
  // Every part sings the first note and holds the last one longer than a beat.
  if (voices.some((v) => !v.length || v[0].rest || v.at(-1)!.rest || v.at(-1)!.length <= o.beat)) return null;

  const byHeight = o.voiceParts.map((_, i) => i).sort((x, y) => o.voiceParts[y].order - o.voiceParts[x].order);
  const top = byHeight[0];
  const low = byHeight[N - 1];
  const minor = o.key.endsWith("m");
  const first = voices.map((v) => v[0]);
  const reaches = (from: Note, i: number) => {
    const to = first[i];
    const d = Math.abs(to.pitchValue - from.pitchValue);
    if (d > o.maxSkip || d === 6) return false;
    return !o.leapOk || o.leapOk({ ...from, length: o.beat, rest: false } as VoiceNote, to);
  };
  const pickNote = (n: Note, i: number, extra: Partial<VoiceNote> = {}): VoiceNote => ({
    ...n,
    length: o.beat,
    rest: false,
    order: voices[i][0].order,
    accidental: undefined,
    ...extra,
  });

  const doubledOpening = first.every((n) => n.doubled);
  const notesOf = (i: number, reach = 0) => {
    const [lo, hi] = o.voiceParts[i].range;
    return generatePossibleNotes([lo - reach, hi], o.key);
  };
  const tuneNotes = notesOf(top);

  for (const degree of degreeOrder(random)) {
    const tuneOptions = tuneNotes
      .filter((n) => n.degree === degree && reaches(n, top))
      .sort((x, y) => Math.abs(x.pitchValue - first[top].pitchValue) - Math.abs(y.pitchValue - first[top].pitchValue));
    for (const tune of tuneOptions) {
      let pickup: VoiceNote[] | null = null;
      let symbol: string = minor ? "i" : "I";
      if (doubledOpening) {
        // Everyone on it, as in the opening that follows: each part the
        // octave its first note is in from the tune's.
        pickup = [];
        for (let i = 0; i < N; i++) {
          const steps = first[i].pitchValue - first[top].pitchValue;
          const n = octaveFrom(pickNote(tune, top), steps);
          const [lo, hi] = o.voiceParts[i].range;
          const reach = o.voiceParts[i].name === "Tenor" ? TENOR_REACH : 0;
          if (!n || n.pitchValue < lo - reach || n.pitchValue > hi || !reaches(n, i)) {
            pickup = null;
            break;
          }
          pickup.push({ ...n, order: voices[i][0].order, doubled: true });
        }
      } else {
        const chords: { symbol: string; tones: number[]; root: number }[] =
          degree === 4 && !minor
            ? random() < 0.5
              ? [{ symbol: "V", tones: [4, 6, 1], root: 4 }, { symbol: "I", tones: [0, 2, 4], root: 0 }]
              : [{ symbol: "I", tones: [0, 2, 4], root: 0 }, { symbol: "V", tones: [4, 6, 1], root: 4 }]
            : [{ symbol, tones: [0, 2, 4], root: 0 }];
        for (const chord of chords) {
          const cands = voices.map((_, i) =>
            i === top
              ? [tune]
              : notesOf(i).filter((n) => chord.tones.includes(n.degree) && (i !== low || n.degree === chord.root) && reaches(n, i)),
          );
          let best: { notes: Note[]; cost: number } | null = null;
          const chosen: Note[] = [];
          const walk = (k: number) => {
            if (k === N) {
              const notes = byHeight.map((_, j) => chosen[j]);
              if (notes.filter((n) => n.degree === 6).length > 1) return;
              const classes = new Set(notes.map((n) => n.degree));
              let cost = 0;
              byHeight.forEach((i, j) => (cost += Math.abs(first[i].pitchValue - notes[j].pitchValue)));
              if (N >= 3 && !classes.has(mod7(chord.root + 2))) cost += 3;
              cost += random() * 0.5;
              if (!best || cost < best.cost) best = { notes: [...notes], cost };
              return;
            }
            const i = byHeight[k];
            for (const c of cands[i]) {
              let ok = true;
              for (let j = 0; j < k && ok; j++) {
                const u = byHeight[j];
                const apart = chosen[j].pitchValue - c.pitchValue;
                if (apart < 0 || dissonant(apart)) ok = false;
                // Neighbours within an octave, the lowest part within a twelfth of the one above it.
                if (j === k - 1 && apart > (k === N - 1 ? 11 : 7)) ok = false;
                // No parallels into the downbeat: both parts moving the same way onto the same perfect interval.
                const into = first[u].pitchValue - first[i].pitchValue;
                const du = first[u].pitchValue - chosen[j].pitchValue, di = first[i].pitchValue - c.pitchValue;
                if (ok && isPerfect(apart) && mod7(apart) === mod7(into) && du !== 0 && di !== 0 && Math.sign(du) === Math.sign(di)) ok = false;
              }
              if (!ok) continue;
              chosen[k] = c;
              walk(k + 1);
            }
          };
          walk(0);
          if (best) {
            const found = best as { notes: Note[] };
            pickup = voices.map((_, i) => pickNote(found.notes[byHeight.indexOf(i)], i));
            symbol = chord.symbol;
            break;
          }
        }
      }
      if (!pickup) continue;

      pickup[top].chordSymbol = symbol;
      const out = voices.map((v, i) => {
        const rest = v.map((n) => ({ ...n }));
        // The downbeat's chord is named again only when it is a new one.
        if (i === top && rest[0].chordSymbol === symbol) rest[0].chordSymbol = undefined;
        const last = rest.at(-1)!;
        rest[rest.length - 1] = { ...last, length: last.length - o.beat };
        return [pickup![i], ...rest];
      });
      return { voices: out, pickup: o.beat };
    }
  }
  return null;
}
