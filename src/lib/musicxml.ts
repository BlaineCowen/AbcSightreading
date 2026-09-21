import abcjs from "abcjs";

/**
 * MusicXML from the ABC on screen, for MuseScore, Finale, Sibelius, Dorico and
 * Noteflight.
 *
 * abcjs has no MusicXML export and no converter on npm was trustworthy, but the
 * ABC this app writes is a narrow dialect - L:1/32, no tuplets, every duration
 * a whole number of 32nds, one voice per staff - so this reads abcjs's own
 * parse of it rather than parsing ABC again. Two steps: `scoreFromAbc` builds a
 * plain model (parts, measures, notes with pitches spelled out), which is what
 * the tests check; `musicXmlFor` writes it out in the element order the
 * MusicXML 4.0 schema requires.
 *
 * Pitch is the parsed staff position plus the clef's transposition, so the
 * tenor - written `treble transpose=-12` - comes out as a treble-8 clef at
 * sounding pitch, the way notation programs expect a tenor part. Alterations
 * follow ABC's rules: the key signature, then any accidental earlier in the bar
 * on that same pitch, reset at every barline, and carried through a tie.
 */

/** Divisions per quarter note: one ABC unit (a 32nd) is one division. */
const DIVISIONS = 8;

export type XmlPitch = { step: string; alter: number; octave: number };

export type XmlNote = {
  /** In divisions (32nds). */
  length: number;
  rest: boolean;
  /** A rest filling its whole bar, written without a note type. */
  wholeMeasure?: boolean;
  /** Absent for rests. On a percussion part this is only where the note sits. */
  pitch?: XmlPitch;
  /** The accidental the ABC wrote, as MusicXML names it. */
  accidental?: string;
  tieStart?: boolean;
  tieStop?: boolean;
  /** One entry per beam level: begin, continue, end, forward hook, backward hook. */
  beams?: string[];
  lyric?: { text: string; syllabic: "single" | "begin" | "middle" | "end" };
  words?: { text: string; placement: "above" | "below" }[];
};

export type XmlPart = {
  name: string;
  abbreviation?: string;
  clef: { sign: "G" | "F" | "C" | "percussion"; line?: number; octaveChange?: number };
  staffLines?: number;
  key: { fifths: number; mode: "major" | "minor" };
  percussion: boolean;
  measures: { notes: XmlNote[]; finalBar: boolean }[];
};

export type ScoreModel = {
  title?: string;
  composer?: string;
  tempo?: number;
  /** 0-based General MIDI program for pitched parts. */
  program: number;
  /** 0-based GM percussion key for a percussion part. */
  percussionSound?: number;
  time: { beats: number; beatType: number };
  parts: XmlPart[];
};

export type MusicXmlOptions = {
  title?: string;
  composer?: string;
  tempo?: number;
  /** Used when the ABC does not name a voice - unison's single part. */
  defaultPartName?: string;
  /** YYYY-MM-DD; today's date when left out. */
  encodingDate?: string;
};

export function abcToMusicXml(abc: string, options: MusicXmlOptions = {}): string {
  return musicXmlFor(scoreFromAbc(abc, options), options);
}

// ── Reading the parse ───────────────────────────────────────────────────────

const STEPS = "CDEFGAB";

const ACCIDENTALS: Record<string, { alter: number; name: string }> = {
  sharp: { alter: 1, name: "sharp" },
  flat: { alter: -1, name: "flat" },
  natural: { alter: 0, name: "natural" },
  dblsharp: { alter: 2, name: "double-sharp" },
  dblflat: { alter: -2, name: "flat-flat" },
};

/** Written lengths a single note can have, longest first: plain, dotted, double-dotted. */
const NOTE_TYPES: [number, string, number][] = [
  [56, "whole", 2], [48, "whole", 1], [32, "whole", 0],
  [28, "half", 2], [24, "half", 1], [16, "half", 0],
  [14, "quarter", 2], [12, "quarter", 1], [8, "quarter", 0],
  [7, "eighth", 2], [6, "eighth", 1], [4, "eighth", 0],
  [3, "16th", 1], [2, "16th", 0], [1, "32nd", 0],
];
const noteType = (length: number) => NOTE_TYPES.find(([l]) => l === length);

export function scoreFromAbc(abc: string, options: MusicXmlOptions = {}): ScoreModel {
  const [tune] = abcjs.parseOnly(abc) as any[];
  if (!tune) throw new Error("The score could not be read.");
  const lines = (tune.lines ?? []).filter((line: any) => line.staff);
  if (lines.length === 0) throw new Error("The score has no music in it.");

  const first = lines[0].staff;
  const meter = meterOf(first[0]?.meter);
  const measureLength = (meter.beats * 32) / meter.beatType;
  const names = voiceNamesFrom(abc);

  const parts: XmlPart[] = first.map((staff: any, index: number) => {
    const percussion = staff.clef?.type === "perc";
    return {
      name: staff.title?.[0] || names[index]?.name || options.defaultPartName || `Part ${index + 1}`,
      abbreviation: names[index]?.abbreviation,
      clef: clefOf(staff.clef),
      ...(staff.clef?.stafflines && staff.clef.stafflines !== 5 ? { staffLines: staff.clef.stafflines } : {}),
      key: keyOf(staff.key),
      percussion,
      measures: [],
    };
  });

  parts.forEach((part, index) => {
    const staffs = lines.map((line: any) => line.staff[index]).filter(Boolean);
    const clef = staffs[0].clef ?? {};
    const shift = octaveShift(clef);
    const keyAlters = keyAltersOf(staffs[0].key);
    const elements = staffs.flatMap((staff: any) => staff.voices?.[0] ?? []);
    part.measures = readMeasures(elements, { shift, keyAlters, measureLength, percussion: part.percussion });
  });

  const program = tune.formatting?.midi?.program?.[0];
  const percmap = tune.formatting?.percmap ?? {};
  const percussionSound = Object.values(percmap as Record<string, { sound: number }>)[0]?.sound;
  const tempo = tune.metaText?.tempo;
  return {
    title: options.title ?? tune.metaText?.title,
    composer: options.composer ?? tune.metaText?.composer,
    tempo:
      options.tempo ??
      (tempo?.bpm && (tempo.duration?.[0] ?? 0.25) === 0.25 ? tempo.bpm : undefined),
    program: typeof program === "number" ? program : 0,
    ...(typeof percussionSound === "number" ? { percussionSound } : {}),
    time: meter,
    parts,
  };
}

function readMeasures(
  elements: any[],
  ctx: { shift: number; keyAlters: Record<string, number>; measureLength: number; percussion: boolean }
): { notes: XmlNote[]; finalBar: boolean }[] {
  const measures: { notes: XmlNote[]; finalBar: boolean }[] = [];
  let notes: XmlNote[] = [];
  let beamGroup: XmlNote[] | null = null;
  /** Alterations written earlier in the bar, by staff position. */
  let barAlters = new Map<number, number>();
  /** The alteration a tie started with, by staff position, for its continuation. */
  const tiedAlters = new Map<number, number>();
  /** Whether the last lyric syllable was hyphenated onto the next. */
  let inWord = false;

  const closeMeasure = (finalBar: boolean) => {
    if (notes.length) measures.push({ notes, finalBar });
    notes = [];
    barAlters = new Map();
    beamGroup = null;
  };

  for (const el of elements) {
    if (el.el_type === "bar") {
      closeMeasure(el.type === "bar_thin_thick" || el.type === "bar_dbl_repeat" || el.type === "bar_right_repeat");
      continue;
    }
    if (el.el_type !== "note") continue;

    const length = Math.round((el.duration ?? 0) * 32);
    if (length <= 0) continue;
    const note: XmlNote = { length, rest: !!el.rest || !el.pitches?.length };

    if (!note.rest) {
      const p = el.pitches[0];
      const staffPos: number = p.pitch;
      let alter: number;
      const written = p.accidental ? ACCIDENTALS[p.accidental] : undefined;
      if (p.endTie && tiedAlters.has(staffPos)) {
        alter = tiedAlters.get(staffPos)!;
      } else if (written) {
        alter = written.alter;
        barAlters.set(staffPos, alter);
        note.accidental = written.name;
      } else {
        alter = barAlters.get(staffPos) ?? ctx.keyAlters[STEPS[mod(staffPos, 7)]] ?? 0;
      }
      if (ctx.percussion) alter = 0;
      note.pitch = {
        step: STEPS[mod(staffPos, 7)],
        alter,
        octave: 4 + Math.floor(staffPos / 7) + (ctx.percussion ? 0 : ctx.shift),
      };
      if (p.startTie) {
        note.tieStart = true;
        tiedAlters.set(staffPos, alter);
      }
      if (p.endTie) {
        note.tieStop = true;
        if (!p.startTie) tiedAlters.delete(staffPos);
      }
    }

    const syllable = el.lyric?.[0];
    if (syllable && syllable.syllable) {
      const continues = syllable.divider === "-";
      note.lyric = {
        text: syllable.syllable,
        syllabic: inWord ? (continues ? "middle" : "end") : continues ? "begin" : "single",
      };
      inWord = continues;
    }
    if (el.chord?.length) {
      note.words = el.chord.map((c: any) => ({
        text: String(c.name),
        placement: c.position === "below" ? "below" : "above",
      }));
    }

    // abcjs marks a beamed group's first and last notes; everything between is in it.
    if (!note.rest && el.startBeam) {
      if (beamGroup) setBeams(beamGroup);
      beamGroup = [];
    }
    if (beamGroup && !note.rest) beamGroup.push(note);
    if (beamGroup && (el.endBeam || note.rest)) {
      setBeams(beamGroup);
      beamGroup = null;
    }

    notes.push(...splitToWritable(note));
  }
  closeMeasure(false);

  for (const measure of measures) {
    const only = measure.notes[0];
    if (measure.notes.length === 1 && only.rest && only.length === ctx.measureLength) {
      only.wholeMeasure = true;
    }
  }
  return measures;
}

/** How many beams a note of this length carries: eighths one, 16ths two, 32nds three. */
const beamLevels = (length: number) => (length >= 8 ? 0 : length >= 4 ? 1 : length >= 2 ? 2 : 3);

function setBeams(group: XmlNote[]) {
  if (group.length < 2) return;
  const levels = group.map((n) => beamLevels(n.length));
  if (levels.some((l) => l === 0)) return;
  group.forEach((note, i) => {
    const beams: string[] = [];
    for (let level = 1; level <= levels[i]; level++) {
      const prev = i > 0 && levels[i - 1] >= level;
      const next = i < group.length - 1 && levels[i + 1] >= level;
      beams.push(
        prev && next ? "continue" : prev ? "end" : next ? "begin" : i === 0 ? "forward hook" : "backward hook"
      );
    }
    note.beams = beams;
  });
}

/**
 * A length no single note can be written as - 20 32nds, a half and an eighth -
 * becomes tied notes, or separate rests. The words and lyric go on the first.
 */
function splitToWritable(note: XmlNote): XmlNote[] {
  if (noteType(note.length)) return [note];
  const pieces: number[] = [];
  let left = note.length;
  while (left > 0) {
    const [fits] = NOTE_TYPES.find(([l]) => l <= left)!;
    pieces.push(fits);
    left -= fits;
  }
  return pieces.map((length, i) => {
    const firstPiece = i === 0;
    const lastPiece = i === pieces.length - 1;
    const piece: XmlNote = { length, rest: note.rest };
    if (note.pitch) piece.pitch = note.pitch;
    if (firstPiece) {
      if (note.accidental) piece.accidental = note.accidental;
      if (note.lyric) piece.lyric = note.lyric;
      if (note.words) piece.words = note.words;
    }
    if (!note.rest) {
      if (!lastPiece || note.tieStart) piece.tieStart = true;
      if (!firstPiece || note.tieStop) piece.tieStop = true;
    }
    return piece;
  });
}

function meterOf(meter: any): { beats: number; beatType: number } {
  if (meter?.type === "common_time") return { beats: 4, beatType: 4 };
  if (meter?.type === "cut_time") return { beats: 2, beatType: 2 };
  const value = meter?.value?.[0];
  const beats = Number(value?.num);
  const beatType = Number(value?.den);
  return beats > 0 && beatType > 0 ? { beats, beatType } : { beats: 4, beatType: 4 };
}

function clefOf(clef: any): XmlPart["clef"] {
  const change = octaveShift(clef);
  switch (String(clef?.type ?? "").replace(/[+-]8$/, "")) {
    case "bass":
      return { sign: "F", line: 4, ...(change ? { octaveChange: change } : {}) };
    case "alto":
      return { sign: "C", line: 3, ...(change ? { octaveChange: change } : {}) };
    case "tenor":
      return { sign: "C", line: 4, ...(change ? { octaveChange: change } : {}) };
    case "perc":
    case "none":
      return { sign: "percussion" };
    default:
      return { sign: "G", line: 2, ...(change ? { octaveChange: change } : {}) };
  }
}

/**
 * Octaves between where a note sits on the staff and where it sounds: a clef's
 * `transpose=` (the tenor's -12) or an `-8`/`+8` clef. `octave=` is not here -
 * abcjs has already moved the parsed pitch.
 */
function octaveShift(clef: any): number {
  const fromTranspose = Math.round((clef?.transpose ?? 0) / 12);
  const name = String(clef?.type ?? "");
  const fromName = name.endsWith("-8") ? -1 : name.endsWith("+8") ? 1 : 0;
  return fromTranspose + fromName;
}

function keyOf(key: any): XmlPart["key"] {
  const accidentals: any[] = key?.accidentals ?? [];
  const sharps = accidentals.filter((a) => a.acc === "sharp").length;
  const flats = accidentals.filter((a) => a.acc === "flat").length;
  return { fifths: sharps - flats, mode: key?.mode === "m" ? "minor" : "major" };
}

function keyAltersOf(key: any): Record<string, number> {
  const alters: Record<string, number> = {};
  for (const a of key?.accidentals ?? []) {
    const step = String(a.note ?? "").toUpperCase();
    if (a.acc === "sharp") alters[step] = 1;
    else if (a.acc === "flat") alters[step] = -1;
  }
  return alters;
}

/** `name=` and `snm=` from each V: line, in order. */
function voiceNamesFrom(abc: string): { name?: string; abbreviation?: string }[] {
  return [...abc.matchAll(/^V:\s*\S+(.*)$/gm)].map(([, rest]) => ({
    name: rest.match(/\bname="([^"]*)"/)?.[1],
    abbreviation: rest.match(/\bsnm="([^"]*)"/)?.[1],
  }));
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

// ── Writing it out ──────────────────────────────────────────────────────────

export function musicXmlFor(score: ScoreModel, options: MusicXmlOptions = {}): string {
  const out: string[] = [];
  const line = (depth: number, text: string) => out.push("  ".repeat(depth) + text);
  const date = options.encodingDate ?? new Date().toISOString().slice(0, 10);

  out.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  out.push(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
  );
  out.push('<score-partwise version="4.0">');
  if (score.title) {
    line(1, "<work>");
    line(2, `<work-title>${esc(score.title)}</work-title>`);
    line(1, "</work>");
  }
  line(1, "<identification>");
  if (score.composer) line(2, `<creator type="composer">${esc(score.composer)}</creator>`);
  line(2, "<encoding>");
  line(3, "<software>ABC Sight Reading</software>");
  line(3, `<encoding-date>${esc(date)}</encoding-date>`);
  line(3, '<supports element="accidental" type="yes"/>');
  line(3, '<supports element="beam" type="yes"/>');
  line(2, "</encoding>");
  line(1, "</identification>");

  line(1, "<part-list>");
  const grouped = score.parts.length > 1;
  if (grouped) {
    line(2, '<part-group type="start" number="1">');
    line(3, "<group-symbol>bracket</group-symbol>");
    line(2, "</part-group>");
  }
  let channel = 0;
  score.parts.forEach((part, index) => {
    const id = `P${index + 1}`;
    line(2, `<score-part id="${id}">`);
    line(3, `<part-name>${esc(part.name)}</part-name>`);
    if (part.abbreviation) line(3, `<part-abbreviation>${esc(part.abbreviation)}</part-abbreviation>`);
    line(3, `<score-instrument id="${id}-I1">`);
    line(4, `<instrument-name>${esc(part.name)}</instrument-name>`);
    line(3, "</score-instrument>");
    line(3, `<midi-instrument id="${id}-I1">`);
    if (part.percussion) {
      line(4, "<midi-channel>10</midi-channel>");
      line(4, `<midi-unpitched>${(score.percussionSound ?? 75) + 1}</midi-unpitched>`);
    } else {
      // Channel 10 is General MIDI's drum kit.
      channel = channel + 1 === 10 ? 11 : channel + 1;
      line(4, `<midi-channel>${((channel - 1) % 16) + 1}</midi-channel>`);
      line(4, `<midi-program>${score.program + 1}</midi-program>`);
    }
    line(3, "</midi-instrument>");
    line(2, "</score-part>");
  });
  if (grouped) line(2, '<part-group type="stop" number="1"/>');
  line(1, "</part-list>");

  score.parts.forEach((part, index) => {
    const id = `P${index + 1}`;
    line(1, `<part id="${id}">`);
    part.measures.forEach((measure, m) => {
      line(2, `<measure number="${m + 1}">`);
      if (m === 0) {
        line(3, "<attributes>");
        line(4, `<divisions>${DIVISIONS}</divisions>`);
        line(4, part.percussion ? '<key print-object="no">' : "<key>");
        line(5, `<fifths>${part.percussion ? 0 : part.key.fifths}</fifths>`);
        line(5, `<mode>${part.key.mode}</mode>`);
        line(4, "</key>");
        line(4, "<time>");
        line(5, `<beats>${score.time.beats}</beats>`);
        line(5, `<beat-type>${score.time.beatType}</beat-type>`);
        line(4, "</time>");
        line(4, "<clef>");
        line(5, `<sign>${part.clef.sign}</sign>`);
        if (part.clef.line !== undefined) line(5, `<line>${part.clef.line}</line>`);
        if (part.clef.octaveChange) line(5, `<clef-octave-change>${part.clef.octaveChange}</clef-octave-change>`);
        line(4, "</clef>");
        if (part.staffLines !== undefined) {
          line(4, "<staff-details>");
          line(5, `<staff-lines>${part.staffLines}</staff-lines>`);
          line(4, "</staff-details>");
        }
        line(3, "</attributes>");
        if (index === 0 && score.tempo) {
          line(3, '<direction placement="above">');
          line(4, "<direction-type>");
          line(5, "<metronome>");
          line(6, "<beat-unit>quarter</beat-unit>");
          line(6, `<per-minute>${score.tempo}</per-minute>`);
          line(5, "</metronome>");
          line(4, "</direction-type>");
          line(4, `<sound tempo="${score.tempo}"/>`);
          line(3, "</direction>");
        }
      }
      for (const note of measure.notes) writeNote(note, id, part.percussion, line);
      if (measure.finalBar) {
        line(3, '<barline location="right">');
        line(4, "<bar-style>light-heavy</bar-style>");
        line(3, "</barline>");
      }
      line(2, "</measure>");
    });
    line(1, "</part>");
  });
  out.push("</score-partwise>");
  return out.join("\n") + "\n";
}

function writeNote(
  note: XmlNote,
  partId: string,
  percussion: boolean,
  line: (depth: number, text: string) => void
) {
  for (const w of note.words ?? []) {
    line(3, `<direction placement="${w.placement}">`);
    line(4, "<direction-type>");
    line(5, `<words>${esc(w.text)}</words>`);
    line(4, "</direction-type>");
    line(3, "</direction>");
  }
  line(3, "<note>");
  if (note.rest) {
    line(4, note.wholeMeasure ? '<rest measure="yes"/>' : "<rest/>");
  } else if (percussion) {
    line(4, "<unpitched>");
    line(5, `<display-step>${note.pitch!.step}</display-step>`);
    line(5, `<display-octave>${note.pitch!.octave}</display-octave>`);
    line(4, "</unpitched>");
  } else {
    line(4, "<pitch>");
    line(5, `<step>${note.pitch!.step}</step>`);
    if (note.pitch!.alter) line(5, `<alter>${note.pitch!.alter}</alter>`);
    line(5, `<octave>${note.pitch!.octave}</octave>`);
    line(4, "</pitch>");
  }
  line(4, `<duration>${note.length}</duration>`);
  if (note.tieStop) line(4, '<tie type="stop"/>');
  if (note.tieStart) line(4, '<tie type="start"/>');
  if (percussion && !note.rest) line(4, `<instrument id="${partId}-I1"/>`);
  line(4, "<voice>1</voice>");
  const type = noteType(note.length);
  if (type && !note.wholeMeasure) {
    line(4, `<type>${type[1]}</type>`);
    for (let d = 0; d < type[2]; d++) line(4, "<dot/>");
  }
  if (note.accidental && !percussion) line(4, `<accidental>${note.accidental}</accidental>`);
  (note.beams ?? []).forEach((beam, i) => line(4, `<beam number="${i + 1}">${beam}</beam>`));
  if (note.tieStart || note.tieStop) {
    line(4, "<notations>");
    if (note.tieStop) line(5, '<tied type="stop"/>');
    if (note.tieStart) line(5, '<tied type="start"/>');
    line(4, "</notations>");
  }
  if (note.lyric) {
    line(4, '<lyric number="1">');
    line(5, `<syllabic>${note.lyric.syllabic}</syllabic>`);
    line(5, `<text>${esc(note.lyric.text)}</text>`);
    line(4, "</lyric>");
  }
  line(3, "</note>");
}

const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
