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

export interface NoteStepDef {
  newNotes: string;
  /** Concert keys (band), or the keys read (orchestra, at pitch). */
  keys: string[];
  degrees: number[];
  sharps?: number[];
  flats?: number[];
  span: Span;
  maxSkip: number;
  /** Use the compound meter (when its rhythms are RHYTHM_LEAD steps old). */
  compound?: boolean;
}

export const D7 = [1, 2, 3, 4, 5, 6, 7];

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

/** Major keys by pitch class, spelled as the Unison page names them. */
const KEY_BY_PC = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const PC: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };

/**
 * The key an instrument reads for a concert key: written sounds
 * `transposeSemitones` away, so written = concert − transpose (B♭ trumpet −2:
 * concert B♭ is written C; alto sax −9: written G; horn −7: written F).
 */
export function writtenKey(concert: string, transposeSemitones: number): string {
  return KEY_BY_PC[(((PC[concert] - transposeSemitones) % 12) + 12) % 12];
}

export interface InstrumentDef {
  id: string;
  name: string;
  blurb: string;
  clef: Track["clef"];
  instrumentProgram: number;
  /** Written to sounding (B♭ trumpet −2, alto sax −9, string bass −12). */
  transposeSemitones: number;
  anchor: number;
  range: { min: number; max: number };
  color: Track["color"];
  /** This instrument's own version of a step's notes (its register needs another new idea there). */
  notes?: Record<number, Partial<NoteStepDef>>;
}

/** What makes a family's sequence: its note thread and how its tracks are named. */
export interface FamilyDef {
  family: Track["family"];
  /** Track ids are `${prefix}-${instrument}` and step ids add the step: band-trumpet-03. */
  prefix: string;
  level: string;
  thread: Record<number, NoteStepDef>;
  /** Whether key names in the thread are concert keys a transposing instrument reads differently. */
  concertKeys: boolean;
}

export const BAND: FamilyDef = { family: "band", prefix: "band", level: "Beginner band", thread: NOTES_THREAD, concertKeys: true };

/**
 * The instruments. Ranges are written noteArray indices (C2 = 0, C4 = 14,
 * seven to the octave): a first-year range each, which the page keeps every
 * key inside. The anchor places do: the first tonic at or above it, for each
 * key (tests/unit/curriculum.test.ts holds every key's do inside the range).
 * Order is the band's score order, as the catalogue shows it.
 */
export const BAND_INSTRUMENTS: InstrumentDef[] = [
  {
    id: "flute",
    name: "Flute",
    blurb: "Flute at concert pitch, from D above middle C to the A at the top of the staff.",
    clef: "treble",
    instrumentProgram: 73,
    transposeSemitones: 0,
    anchor: 17, // F4: B♭ and C on the staff, E♭ high in it, F low
    range: { min: 15, max: 26 }, // D4 to A5
    color: "sky",
  },
  {
    id: "oboe",
    name: "Oboe",
    blurb: "Oboe at concert pitch, from D above middle C to A at the top of the staff.",
    clef: "treble",
    instrumentProgram: 68,
    transposeSemitones: 0,
    anchor: 17,
    range: { min: 15, max: 26 }, // D4 to A5
    color: "peach",
  },
  {
    id: "clarinet",
    name: "Clarinet",
    blurb: "B♭ clarinet in the low register, below the break, from low E to A.",
    clef: "treble",
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
    id: "bassoon",
    name: "Bassoon",
    blurb: "Bassoon in bass clef at concert pitch, from low F to the D above middle C.",
    clef: "bass",
    instrumentProgram: 70,
    transposeSemitones: 0,
    anchor: 5, // A2: B♭ on B♭2, E♭ and F above, C on C3
    range: { min: 3, max: 15 }, // F2 to D4
    color: "butter",
  },
  {
    id: "alto-sax",
    name: "Alto saxophone",
    blurb: "E♭ alto sax, reading G, C, D and A, from middle C to the A at the top of the staff.",
    clef: "treble",
    instrumentProgram: 65,
    transposeSemitones: -9,
    anchor: 14, // C4: written C low, D, G and A on the staff
    range: { min: 14, max: 26 }, // C4 to A5
    color: "mint",
  },
  {
    id: "tenor-sax",
    name: "Tenor saxophone",
    blurb: "B♭ tenor sax, reading C, F, G and D like the clarinet and trumpet, sounding an octave and a step lower.",
    clef: "treble",
    instrumentProgram: 66,
    transposeSemitones: -14,
    anchor: 14,
    range: { min: 14, max: 26 },
    color: "peach",
  },
  {
    id: "bari-sax",
    name: "Baritone saxophone",
    blurb: "E♭ bari sax, reading what the alto reads, sounding an octave below it.",
    clef: "treble",
    instrumentProgram: 67,
    transposeSemitones: -21,
    anchor: 14,
    range: { min: 14, max: 26 },
    color: "butter",
  },
  {
    id: "trumpet",
    name: "Trumpet",
    blurb: "B♭ trumpet, from written C up the staff to E, in the keys the band plays.",
    clef: "treble",
    instrumentProgram: 56,
    transposeSemitones: -2,
    // G3: written C, F and D sit above it on their middle-staff tonic, G on low G.
    anchor: 11,
    range: { min: 11, max: 23 }, // G3 to E5
    color: "butter",
  },
  {
    id: "horn",
    name: "French horn",
    blurb: "Horn in F, reading F, B♭, C and G, from G below middle C to E at the top of the staff.",
    clef: "treble",
    instrumentProgram: 60,
    transposeSemitones: -7,
    anchor: 14, // C4: written C on middle C, F and G on the staff, B♭ in its middle
    range: { min: 11, max: 23 }, // G3 to E5
    color: "mint",
  },
  {
    id: "trombone",
    name: "Trombone",
    blurb: "Trombone in bass clef, from low G to the F above middle C, first position B♭ first.",
    clef: "bass",
    instrumentProgram: 57,
    transposeSemitones: 0,
    anchor: 5, // A2: B♭2 in first position
    range: { min: 4, max: 17 }, // G2 to F4
    color: "sky",
  },
  {
    id: "euphonium",
    name: "Euphonium",
    blurb: "Euphonium or baritone in bass clef, the trombone's notes and keys.",
    clef: "bass",
    // No euphonium in the soundfont: the trombone is the nearer sound.
    instrumentProgram: 57,
    transposeSemitones: 0,
    anchor: 5,
    range: { min: 4, max: 17 },
    color: "peach",
  },
  {
    id: "tuba",
    name: "Tuba",
    blurb: "Tuba in bass clef at concert pitch, from low F to middle C.",
    clef: "bass",
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
function notesPart(n: number, inst: InstrumentDef, fam: FamilyDef): TrackPart | undefined {
  const base = fam.thread[n];
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
    keys: def.keys.map((k) => writtenKey(k, inst.transposeSemitones)),
    scaleDegrees: def.degrees,
    sharps: def.sharps ?? [],
    flats: def.flats ?? [],
    span: def.span,
    maxSkip: def.maxSkip,
  };
}

const flat = (k: string) => k.replace("b", "♭");

/** The new-notes line as the instrument reads it: a concert key named with its written key. */
function notesLine(n: number, inst: InstrumentDef, fam: FamilyDef): string | undefined {
  const def = { ...fam.thread[n], ...(inst.notes?.[n] ?? {}) };
  if (!def?.newNotes) return undefined;
  if (!fam.concertKeys) return def.newNotes;
  if (inst.transposeSemitones % 12 === 0) return def.newNotes.replace(/concert /, "");
  return def.newNotes.replace(/concert ([A-G]♭?)/, (_, k) => `concert ${k} (written ${flat(writtenKey(k.replace("♭", "b"), inst.transposeSemitones))})`);
}

export function instrumentTrack(inst: InstrumentDef, fam: FamilyDef): Track {
  const steps: TrackStep[] = RHYTHM_THREAD.map((r, i) => {
    const n = i + 1;
    return {
      id: `${fam.prefix}-${inst.id}-${String(n).padStart(2, "0")}`,
      number: n,
      unit: r.unit,
      title: r.title,
      newRhythm: r.newRhythm,
      newNotes: notesLine(n, inst, fam),
      rhythm: rhythmPart(n),
      notes: notesPart(n, inst, fam),
    };
  });
  return {
    id: `${fam.prefix}-${inst.id}`,
    family: fam.family,
    name: inst.name,
    level: fam.level,
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

export const BAND_TRACKS: Track[] = BAND_INSTRUMENTS.map((i) => instrumentTrack(i, BAND));
