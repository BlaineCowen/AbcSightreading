import type { Span } from "../unison-pools";
import type { Track, TrackPart, TrackStep } from "./types";

/**
 * Beginner band: one sequence for every band instrument, so a whole band
 * reads the same step together, in the concert keys the method books use
 * (B♭, then E♭, then F, then C). Each instrument reads it in its own written
 * key and register.
 *
 * Two threads. The RHYTHM thread brings in one new figure a step, as a rhythm
 * drill (rhythm only: clap and count it). The NOTES thread brings in new
 * notes a step, always on rhythms from at least RHYTHM_LEAD steps before, so
 * a rhythm has been clapped and counted twice before any new note is put on
 * it. When the rhythms are done (step 15) the notes catch up.
 */

/** How many steps the rhythm thread runs ahead of the notes. */
export const RHYTHM_LEAD = 2;

type Concert = "Bb" | "Eb" | "F" | "C";

interface RhythmStepDef {
  title: string;
  newRhythm: string;
  /** Figures this step adds. */
  add: string[];
  /** A meter this step brings in, if any. */
  meter?: string;
  /** Ties across the barline from this step. */
  ties?: boolean;
  unit: string;
}

/** The rhythm thread, one figure (or meter) a step, in the picker's order. */
export const RHYTHM_THREAD: RhythmStepDef[] = [
  { unit: "First rhythms", title: "Quarter notes", newRhythm: "Quarter notes and quarter rests", add: ["quarter", "quarterRest"], meter: "4/4" },
  { unit: "First rhythms", title: "Half notes", newRhythm: "Half notes and half rests", add: ["half", "halfRest"] },
  { unit: "First rhythms", title: "Whole notes", newRhythm: "Whole notes and whole rests", add: ["whole", "wholeRest"] },
  { unit: "First rhythms", title: "Eighth notes", newRhythm: "Eighth notes in pairs", add: ["eighthEighth"] },
  { unit: "New meters", title: "Three beats", newRhythm: "Dotted half notes, and 3/4", add: ["dotHalf"], meter: "3/4" },
  { unit: "New meters", title: "Two beats", newRhythm: "2/4", add: [], meter: "2/4" },
  { unit: "New meters", title: "Ties", newRhythm: "Notes tied across the barline", add: [], ties: true },
  { unit: "Dotted and off the beat", title: "Dotted quarters", newRhythm: "Dotted quarter and eighth", add: ["dotQuarterEighth"] },
  { unit: "Dotted and off the beat", title: "Eighth rests", newRhythm: "Eighth rest and eighth", add: ["eighthRestEighth"] },
  { unit: "Dotted and off the beat", title: "Syncopation", newRhythm: "Eighth, quarter, eighth", add: ["eighthQuarterEighth"] },
  { unit: "Sixteenths", title: "Four sixteenths", newRhythm: "Four sixteenths", add: ["fourSixteenths"] },
  {
    unit: "Sixteenths",
    title: "Eighths and sixteenths",
    newRhythm: "Eighth and two sixteenths, two sixteenths and eighth",
    add: ["eighthSixteenthSixteenth", "sixteenthSixteenthEighth"],
  },
  { unit: "Sixteenths", title: "Dotted eighths", newRhythm: "Dotted eighth and sixteenth", add: ["dotEighthSixteenth"] },
  { unit: "Six-eight", title: "6/8", newRhythm: "6/8: dotted quarters, three eighths, quarter and eighth", add: ["dotQuarter", "threeEighths", "quarterEighth"], meter: "6/8" },
  { unit: "Six-eight", title: "6/8 rests and long notes", newRhythm: "6/8: dotted quarter rests and dotted halves", add: ["dotQuarterRest", "dotHalfCompound"] },
  { unit: "Putting it together", title: "Review", newRhythm: "All the rhythms so far", add: [] },
  { unit: "Putting it together", title: "Everything", newRhythm: "All the rhythms, every meter", add: [] },
];

const COMPOUND = new Set(["dotQuarter", "threeEighths", "quarterEighth", "eighthQuarter", "dotQuarterRest", "dotHalfCompound", "quarterEighthRest"]);
const isCompoundMeter = (m: string) => m === "6/8" || m === "9/8" || m === "12/8";

interface NoteStepDef {
  newNotes: string;
  keys: Concert[];
  degrees: number[];
  sharps?: number[];
  flats?: number[];
  span: Span;
  maxSkip: number;
  /** Use the compound meter (when its rhythms are RHYTHM_LEAD steps old). */
  compound?: boolean;
}

const D7 = [1, 2, 3, 4, 5, 6, 7];

/**
 * The notes thread, by step number (it starts at RHYTHM_LEAD + 1). Degrees
 * are the concert key's; every instrument sings them in its written key.
 */
export const NOTES_THREAD: Record<number, NoteStepDef> = {
  3: { newNotes: "do, re, mi: the first three notes, by step", keys: ["Bb"], degrees: [1, 2, 3], span: [0, 2], maxSkip: 1 },
  4: { newNotes: "fa and so: the first five notes", keys: ["Bb"], degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 1 },
  5: { newNotes: "Skips: do, mi, so", keys: ["Bb"], degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 2 },
  6: { newNotes: "A new key: concert E♭", keys: ["Eb"], degrees: [1, 2, 3, 4, 5], span: [0, 4], maxSkip: 2 },
  7: { newNotes: "la", keys: ["Bb", "Eb"], degrees: [1, 2, 3, 4, 5, 6], span: [0, 5], maxSkip: 2 },
  8: { newNotes: "ti and high do: the whole scale", keys: ["Bb"], degrees: D7, span: [0, 7], maxSkip: 2 },
  9: { newNotes: "A third key: concert F", keys: ["F"], degrees: [1, 2, 3, 4, 5, 6], span: [0, 5], maxSkip: 2 },
  10: { newNotes: "Below do: low so, la, ti", keys: ["Bb", "Eb"], degrees: D7, span: [-3, 5], maxSkip: 2 },
  11: { newNotes: "Wider skips: fourths and fifths", keys: ["Bb", "Eb", "F"], degrees: D7, span: [-3, 5], maxSkip: 4 },
  12: { newNotes: "All three keys, the whole range", keys: ["Bb", "Eb", "F"], degrees: D7, span: [-3, 7], maxSkip: 4 },
  13: { newNotes: "Accidentals: te and fi, by step", keys: ["Bb"], degrees: D7, sharps: [4], flats: [7], span: [-3, 7], maxSkip: 2 },
  14: { newNotes: "Higher: up to re and mi above high do", keys: ["Bb"], degrees: D7, span: [-3, 9], maxSkip: 4 },
  15: { newNotes: "A fourth key: concert C", keys: ["C"], degrees: D7, span: [-3, 5], maxSkip: 2 },
  16: { newNotes: "6/8 on the notes you know", keys: ["Bb", "Eb", "F"], degrees: D7, span: [-3, 7], maxSkip: 2, compound: true },
  17: { newNotes: "Everything: four keys, every meter, accidentals", keys: ["Bb", "Eb", "F", "C"], degrees: D7, sharps: [4], flats: [7], span: [-3, 7], maxSkip: 4 },
};

/** Written key for a concert key, by how the instrument transposes. */
const WRITTEN: Record<"Bb" | "C", Record<Concert, string>> = {
  Bb: { Bb: "C", Eb: "F", F: "G", C: "D" },
  C: { Bb: "Bb", Eb: "Eb", F: "F", C: "C" },
};

interface InstrumentDef {
  id: string;
  name: string;
  blurb: string;
  clef: Track["clef"];
  pitch: "Bb" | "C";
  instrumentProgram: number;
  transposeSemitones: number;
  anchor: number;
  range: { min: number; max: number };
  color: Track["color"];
  /** This instrument's own version of a step's notes (its register needs another new idea there). */
  notes?: Record<number, Partial<NoteStepDef>>;
}

/**
 * The instruments. Ranges are written noteArray indices (C2 = 0, seven to the
 * octave): a first-year range each, which the page keeps every key inside.
 * The anchor places do: the first tonic at or above it, for each key.
 */
export const BAND_INSTRUMENTS: InstrumentDef[] = [
  {
    id: "trumpet",
    name: "Trumpet",
    blurb: "B♭ trumpet, from written C up the staff to E, in the keys the band plays.",
    clef: "treble",
    pitch: "Bb",
    instrumentProgram: 56,
    transposeSemitones: -2,
    // G3: written C, F and D sit above it on their middle-staff tonic, G on low G.
    anchor: 11,
    range: { min: 11, max: 23 }, // G3 to E5
    color: "butter",
  },
  {
    id: "clarinet",
    name: "Clarinet",
    blurb: "B♭ clarinet in the low register, below the break, from low E to A.",
    clef: "treble",
    pitch: "Bb",
    instrumentProgram: 71,
    transposeSemitones: -2,
    anchor: 9, // E3: written F and G sit low, C and D on the staff
    range: { min: 9, max: 19 }, // E3 to A4, below the break
    color: "sky",
    notes: {
      // Above A the clarinet crosses the break (a later track): its new range goes down instead.
      14: { newNotes: "Lower: down to low E and F", span: [-5, 4] },
    },
  },
  {
    id: "tuba",
    name: "Tuba",
    blurb: "Tuba in bass clef at concert pitch, from low F to middle C.",
    clef: "bass",
    pitch: "C",
    instrumentProgram: 58,
    transposeSemitones: 0,
    anchor: 5, // A2: B♭ on B♭2, E♭ and F in the octave above, C on C3
    range: { min: 3, max: 14 }, // F2 to C4
    color: "mint",
    notes: {
      14: { newNotes: "Higher: up to middle C", span: [-3, 8] },
    },
  },
];

/** The rhythms known by the end of step `n` (1-based), split by meter kind. */
function knownRhythms(n: number) {
  const all = RHYTHM_THREAD.slice(0, Math.max(0, n)).flatMap((s) => s.add);
  return { simple: all.filter((r) => !COMPOUND.has(r)), compound: all.filter((r) => COMPOUND.has(r)) };
}
function knownMeters(n: number) {
  return RHYTHM_THREAD.slice(0, Math.max(0, n)).flatMap((s) => (s.meter ? [s.meter] : []));
}
const tiesBy = (n: number) => RHYTHM_THREAD.slice(0, Math.max(0, n)).some((s) => s.ties);

/** The rhythm drill for step `n`: everything so far, in the step's own meter when it brings one. */
function rhythmPart(n: number): TrackPart {
  const step = RHYTHM_THREAD[n - 1];
  const known = knownRhythms(n);
  const simpleMeters = knownMeters(n).filter((m) => !isCompoundMeter(m));
  const compound = (!!step.meter && isCompoundMeter(step.meter)) || step.add.some((r) => COMPOUND.has(r));
  const meters = compound ? ["6/8"] : step.meter ? [step.meter] : n >= 16 ? simpleMeters : ["4/4"];
  return {
    rhythmOnly: true,
    rhythms: compound ? known.compound : known.simple,
    meters,
    measures: n <= 2 ? 4 : 8,
    bpm: Math.min(80, 60 + Math.floor((n - 1) / 4) * 5),
    ties: tiesBy(n),
  };
}

/** The note exercise for step `n`: its new notes, on rhythms from RHYTHM_LEAD steps before. */
function notesPart(n: number, inst: InstrumentDef): TrackPart | undefined {
  const base = NOTES_THREAD[n];
  if (!base) return undefined;
  const def = { ...base, ...(inst.notes?.[n] ?? {}) };
  const from = n - RHYTHM_LEAD;
  const known = knownRhythms(from);
  const simpleMeters = knownMeters(from).filter((m) => !isCompoundMeter(m));
  return {
    rhythmOnly: false,
    rhythms: def.compound ? known.compound : known.simple,
    // The meter its rhythms were drilled in RHYTHM_LEAD steps before; at the end, every simple meter.
    meters: def.compound ? ["6/8"] : n >= 17 ? simpleMeters : rhythmPart(from).meters,
    // A stepwise line over a progression's chords got stuck on two notes, and
    // four bars of do-re-mi now and then never reached mi (scripts/check-tracks.ts):
    // eight bars, and progressions only once skips are allowed.
    measures: 8,
    bpm: Math.min(80, 60 + Math.floor((n - 1) / 4) * 5),
    ties: tiesBy(from),
    progressions: def.maxSkip > 1,
    keys: def.keys.map((k) => WRITTEN[inst.pitch][k]),
    scaleDegrees: def.degrees,
    sharps: def.sharps ?? [],
    flats: def.flats ?? [],
    span: def.span,
    maxSkip: def.maxSkip,
  };
}

/** The new-notes line as the instrument reads it: concert keys named with their written key. */
function notesLine(n: number, inst: InstrumentDef): string | undefined {
  const def = { ...NOTES_THREAD[n], ...(inst.notes?.[n] ?? {}) };
  if (!def?.newNotes) return undefined;
  if (inst.pitch === "Bb") {
    return def.newNotes.replace(/concert ([A-G]♭?)/, (_, k) => {
      const concert = k.replace("♭", "b") as Concert;
      return `concert ${k} (written ${WRITTEN.Bb[concert].replace("b", "♭")})`;
    });
  }
  return def.newNotes.replace(/concert /, "");
}

export function bandTrack(inst: InstrumentDef): Track {
  const steps: TrackStep[] = RHYTHM_THREAD.map((r, i) => {
    const n = i + 1;
    return {
      id: `band-${inst.id}-${String(n).padStart(2, "0")}`,
      number: n,
      unit: r.unit,
      title: r.title,
      newRhythm: r.newRhythm,
      newNotes: notesLine(n, inst),
      rhythm: rhythmPart(n),
      notes: notesPart(n, inst),
    };
  });
  return {
    id: `band-${inst.id}`,
    family: "band",
    name: inst.name,
    level: "Beginner band",
    blurb: inst.blurb,
    clef: inst.clef,
    instrumentProgram: inst.instrumentProgram,
    transposeSemitones: inst.transposeSemitones,
    anchor: inst.anchor,
    range: inst.range,
    color: inst.color,
    steps,
  };
}

export const BAND_TRACKS: Track[] = BAND_INSTRUMENTS.map(bandTrack);
