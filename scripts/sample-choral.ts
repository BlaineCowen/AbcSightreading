/**
 * Writes N choral exercises the way the Choral page asks for them at a UIL
 * level and voicing, and saves their notes as JSON (start and length in
 * quarters, MIDI pitch, per voice) - the shape scratchpad analyses read, so a
 * hand-written example and the generator can be measured the same way.
 *
 *   LEVEL="UIL 1" VOICING="2 Part Treble" KEY=F METER=4/4 BARS=16 N=40 bun run scripts/sample-choral.ts out.json
 */
import { writeFileSync } from "fs";
import { generateChoralExercise } from "../src/lib/generateChoral";
import { uilPresets } from "../src/lib/uil-presets";
import { chords as fullChordSet } from "../src/resources/chords";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import { noteArray } from "../src/resources/noteArray";
import { keySignatures } from "../src/resources/key-signatures";
import { unisonProbabilityFor } from "../src/lib/unison-spans";
import { rhymeProbabilityFor } from "../src/lib/rhyming-phrases";
import { melodyFirstFor } from "../src/lib/two-part-treble";
import { skipLevelFor } from "../src/lib/uil-skips";
import { ssaLevelFor } from "../src/lib/three-part-treble";
import { TIME_SIGS, choralSelectable, presetVoicing } from "./generation-fixtures";

const LEVEL = process.env.LEVEL ?? "UIL 1";
const VOICING = process.env.VOICING ?? "2 Part Treble";
const KEY = process.env.KEY ?? "F";
const METER = process.env.METER ?? "4/4";
const BARS = Number(process.env.BARS ?? 16);
const N = Number(process.env.N ?? 40);
const out = process.argv[2] ?? "sample.json";

const preset = (uilPresets as any)[LEVEL];
const partsObject = presetVoicing(VOICING, preset)!;
const timeSig = TIME_SIGS[METER];
const rhythms = allRhythms.filter((r) => preset.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest && r.totalValue <= timeSig.tsPerMeasure);

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** ABC pitch (middle C is "C") to MIDI, the key's signature applied unless the note carries its own accidental. */
function midiOf(pv: number, accidental: unknown): number {
  const s = noteArray[pv];
  const letter = s[0].toUpperCase();
  let octave = s[0] === s[0].toLowerCase() ? 5 : 4;
  for (const ch of s.slice(1)) octave += ch === "'" ? 1 : ch === "," ? -1 : 0;
  let m = 12 * (octave + 1) + LETTER[letter];
  // The table lists the key's altered scale degrees, counted from its tonic (F's flat is degree 3, B).
  const sig = keySignatures[KEY] as any;
  const degree = ("CDEFGAB".indexOf(letter) - (sig?.rootOffset ?? 0) + 7) % 7;
  const inSig = (list: unknown) => Array.isArray(list) && list.includes(degree);
  const a = String(accidental ?? "");
  if (/sharp|\^/.test(a)) m += 1;
  else if (/flat|_/.test(a)) m -= 1;
  else if (/natural|=/.test(a)) m += 0;
  else if (inSig(sig?.sharps)) m += 1;
  else if (inSig(sig?.flats)) m -= 1;
  return m;
}

const quiet = () => {};
const samples: { voices: string[]; parts: [number, number, number][][] }[] = [];
let failed = 0;
for (let i = 0; i < N; i++) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const ex = generateChoralExercise({
      key: KEY, timeSig, partsObject, measures: BARS, maxSkip: preset.maxSkip, bpm: 72,
      selectedRhythms: rhythms, chords: fullChordSet, accidentalsByStep: true, nctProbability: Number(process.env.NCT ?? 0.1),
      chromaticFrequency: 1, allowedChordNames: preset.allowedChordNames, voiceTexture: "full", stepwiseEighths: true,
      unisonProbability: unisonProbabilityFor(LEVEL), rhymeProbability: process.env.RHYME ? Number(process.env.RHYME) : rhymeProbabilityFor(LEVEL), melodyFirst: process.env.MELODY_FIRST === "0" ? [] : melodyFirstFor(LEVEL), skipLevel: skipLevelFor(LEVEL), breathRests: !preset.noRests, ssaLevel: process.env.MELODY_FIRST === "0" ? null : ssaLevelFor(LEVEL),
    } as any);
    samples.push({
      voices: ex.voiceNames,
      parts: ex.voiceNotes.map((voice: any[], v: number) => {
        // A voice's clef may sound an octave from where it is written ("treble octave=-1", "treble transpose=-12").
        const clef = String((partsObject.parts as any)[ex.voiceNames[v]]?.clef ?? "");
        const shift = 12 * Number(/octave=(-?\d+)/.exec(clef)?.[1] ?? 0) + Number(/transpose=(-?\d+)/.exec(clef)?.[1] ?? 0);
        let t = 0;
        const notes: [number, number, number][] = [];
        for (const n of voice) {
          const q = n.length / 8;
          if (!n.rest) notes.push([t, q, midiOf(n.pitchValue, n.accidental) + shift]);
          t += q;
        }
        return notes;
      }),
    });
  } catch {
    failed++;
  } finally {
    Object.assign(console, saved);
  }
}
writeFileSync(out, JSON.stringify({ level: LEVEL, voicing: VOICING, key: KEY, meter: METER, bars: BARS, samples }));
console.log(`${samples.length} written, ${failed} failed -> ${out}`);
