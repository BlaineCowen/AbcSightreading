import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
import { INSTRUMENTS } from "../instruments";
import {
  PIECE_VERSION,
  TICKS,
  midiOfPitch,
  type Clef,
  type ClefChange,
  type KeyChange,
  type Lyric,
  type PieceMeasure,
  type PieceNote,
  type PiecePart,
  type PieceScore,
  type Pitch,
} from "./model";

/**
 * MusicXML in, a PieceScore out: what MuseScore, Sibelius, Finale, Dorico and
 * Noteflight export, as `.musicxml`, `.xml` or compressed `.mxl`.
 *
 * Read: notes, rests and chords; several voices and staves in a part
 * (`backup` / `forward`); ties; tuplets; key, meter and clef changes; a
 * transposing part's `<transpose>`; tempo; the first verse of lyrics; repeat
 * barlines and volta brackets (kept as written, abcjs plays them). Left out,
 * and each counted into `warnings` so the teacher is told: grace notes, cue
 * notes, unpitched percussion, and D.S. / D.C. / coda jumps, which play
 * straight through.
 *
 * Never throws on a file it can open; a file that is not MusicXML at all
 * gives a `PieceReadError` with words a teacher can act on.
 */

export class PieceReadError extends Error {}

type X = { name: string; attrs: Record<string, string>; children: X[]; text: string };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

function toTree(nodes: unknown[]): X[] {
  const out: X[] = [];
  for (const node of nodes as Record<string, unknown>[]) {
    for (const name of Object.keys(node)) {
      if (name === ":@" || name === "#text") continue;
      const kids = (node[name] as unknown[]) ?? [];
      const attrs = (node[":@"] as Record<string, unknown>) ?? {};
      out.push({
        name,
        attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])),
        children: toTree(kids),
        text: (kids as Record<string, unknown>[])
          .filter((k) => "#text" in k)
          .map((k) => String(k["#text"]))
          .join(""),
      });
    }
  }
  return out;
}

const kid = (x: X | undefined, name: string) => x?.children.find((c) => c.name === name);
const kids = (x: X | undefined, name: string) => x?.children.filter((c) => c.name === name) ?? [];
const textOf = (x: X | undefined, name: string) => kid(x, name)?.text.trim() || undefined;
const numOf = (x: X | undefined, name: string) => {
  const t = textOf(x, name);
  const n = t === undefined ? NaN : Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** The XML text of a file: plain, UTF-16 with a byte-order mark, or zipped (.mxl). */
export function musicXmlText(bytes: Uint8Array): string {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new PieceReadError("This .mxl file could not be opened. Try exporting it again, or as uncompressed MusicXML.");
    }
    const container = files["META-INF/container.xml"];
    let path: string | undefined;
    if (container) path = /full-path="([^"]+)"/.exec(strFromU8(container))?.[1];
    if (!path || !files[path]) {
      path = Object.keys(files).find((f) => !f.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(f));
    }
    if (!path) throw new PieceReadError("There is no MusicXML inside this .mxl file.");
    return musicXmlText(files[path]);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

const MAJOR = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"];

function clefOf(c: X): Clef {
  const sign = textOf(c, "sign");
  const line = numOf(c, "line");
  const octave = numOf(c, "clef-octave-change") ?? 0;
  if (sign === "F") return "bass";
  if (sign === "C") return line === 4 ? "tenor" : "alto";
  if (sign === "percussion") return "perc";
  return octave === -1 ? "treble-8" : "treble";
}

/** Quarter notes a minute from a metronome mark (a half = 80 is 160 quarters). */
function quarterBpm(metronome: X): number | undefined {
  const per = numOf(metronome, "per-minute");
  if (!per) return undefined;
  const unit = textOf(metronome, "beat-unit") ?? "quarter";
  const base = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25 }[unit] ?? 1;
  const dotted = kid(metronome, "beat-unit-dot") ? 1.5 : 1;
  return Math.round(per * base * dotted);
}

const PROGRAM_NAMES: [RegExp, number][] = [
  [/piccolo|flute|fife|recorder/, 73],
  [/oboe|english horn|cor anglais/, 68],
  [/clarinet/, 71],
  [/bassoon/, 70],
  [/bari(tone)? sax/, 67],
  [/tenor sax/, 66],
  [/sax/, 65],
  [/trumpet|cornet|flugel/, 56],
  [/horn/, 60],
  [/trombone|euphonium|baritone horn/, 57],
  [/tuba|sousaphone/, 58],
  [/violin|fiddle/, 40],
  [/viola/, 41],
  [/cello/, 42],
  [/contrabass|double bass|string bass|upright bass/, 43],
  [/organ/, 19],
  [/choir|chorus|voice|vocal|soprano|alto|tenor|bass|baritone|mezzo|treble|melody/, 53],
  [/piano|keyboard|klavier/, 0],
];

/**
 * The nearest instrument we can play: the file's own program if we have it,
 * then the part's name, then the program's General MIDI family.
 */
export function nearestProgram(sourceProgram: number | undefined, name: string): number {
  if (sourceProgram !== undefined && INSTRUMENTS.some((i) => i.program === sourceProgram)) return sourceProgram;
  const lower = name.toLowerCase();
  for (const [re, program] of PROGRAM_NAMES) if (re.test(lower)) return program;
  if (sourceProgram !== undefined) {
    const p = sourceProgram;
    if (p >= 16 && p <= 23) return 19;
    if (p >= 40 && p <= 47) return 48;
    if (p >= 48 && p <= 51) return 48;
    if (p >= 52 && p <= 55) return 53;
    if (p >= 56 && p <= 63) return 56;
    if (p >= 64 && p <= 67) return 65;
    if (p >= 68 && p <= 71) return 71;
    if (p >= 72 && p <= 79) return 73;
  }
  return 0;
}

type Pending = Omit<PieceNote, "start"> & { offset: number };

export function readMusicXml(bytes: Uint8Array, fileName = "Untitled"): PieceScore {
  const text = musicXmlText(bytes);
  let tree: X[];
  try {
    tree = toTree(parser.parse(text) as unknown[]);
  } catch {
    throw new PieceReadError("This file is not readable MusicXML. Export it again from your notation program as MusicXML.");
  }
  const root = tree.find((x) => x.name === "score-partwise" || x.name === "score-timewise");
  if (!root) {
    throw new PieceReadError("This file is not MusicXML. In MuseScore, Sibelius, Finale or Dorico, choose Export, then MusicXML.");
  }
  if (root.name === "score-timewise") {
    throw new PieceReadError("This MusicXML is laid out bar by bar (timewise). Export it again as ordinary (partwise) MusicXML.");
  }

  const counts = new Map<string, number>();
  const count = (what: string, n = 1) => counts.set(what, (counts.get(what) ?? 0) + n);

  // ── Part list ──
  const partList = kid(root, "part-list");
  const info = new Map<string, { name: string; abbreviation?: string; program?: number; unpitched: boolean }>();
  for (const sp of kids(partList, "score-part")) {
    const name = textOf(sp, "part-name") || textOf(kid(sp, "score-instrument"), "instrument-name") || "Part";
    const midi = kid(sp, "midi-instrument");
    const program = numOf(midi, "midi-program");
    info.set(sp.attrs.id, {
      name: /^MusicXML Part$/i.test(name) ? "Part" : name,
      abbreviation: textOf(sp, "part-abbreviation"),
      program: program !== undefined ? Math.max(0, Math.min(127, program - 1)) : undefined,
      unpitched: numOf(midi, "midi-channel") === 10,
    });
  }

  const xmlParts = kids(root, "part");
  if (xmlParts.length === 0) throw new PieceReadError("This MusicXML has no parts in it.");
  const barCount = Math.max(...xmlParts.map((p) => kids(p, "measure").length));
  if (barCount === 0) throw new PieceReadError("This MusicXML has no bars in it.");

  // Bar facts come from the first part; lengths from whichever part fills most.
  const measures: PieceMeasure[] = [];
  const contentLength: number[] = new Array(barCount).fill(0);
  let time = { beats: 4, beatType: 4 };
  const firstBars = kids(xmlParts[0], "measure");
  for (let i = 0; i < barCount; i++) {
    const m = firstBars[i];
    const t = kid(kid(m, "attributes"), "time");
    if (t) {
      const beats = (textOf(t, "beats") ?? "4").split("+").reduce((s, b) => s + (Number(b) || 0), 0);
      const beatType = numOf(t, "beat-type") ?? 4;
      if (beats > 0 && beatType > 0) time = { beats, beatType };
    }
    const bar: PieceMeasure = { label: m?.attrs.number ?? String(i + 1), start: 0, length: 0, time };
    if (m?.attrs.implicit === "yes") bar.implicit = true;
    for (const b of kids(m, "barline")) {
      const repeat = kid(b, "repeat");
      if (repeat?.attrs.direction === "forward") bar.repeatStart = true;
      if (repeat?.attrs.direction === "backward") bar.repeatEnd = true;
      const ending = kid(b, "ending");
      if (ending?.attrs.type === "start") bar.endingStart = ending.attrs.number ?? "1";
      if (ending?.attrs.type === "stop" || ending?.attrs.type === "discontinue") bar.endingStop = ending.attrs.type;
    }
    measures.push(bar);
  }

  const parts: PiecePart[] = [];
  const pendingByPart: Pending[][] = [];
  for (const xp of xmlParts) {
    const meta = info.get(xp.attrs.id) ?? { name: "Part", unpitched: false };
    let divisions = 1;
    let transpose = 0;
    let staves = 1;
    const clefs: ClefChange[] = [];
    const keys: KeyChange[] = [];
    const pending: Pending[] = [];
    let unpitched = 0;
    let pitched = 0;

    kids(xp, "measure").forEach((m, mi) => {
      let cursor = 0;
      let maxCursor = 0;
      let lastStart = 0;
      for (const el of m.children) {
        if (el.name === "attributes") {
          divisions = numOf(el, "divisions") ?? divisions;
          staves = Math.max(staves, numOf(el, "staves") ?? 1);
          const key = kid(el, "key");
          if (key && numOf(key, "fifths") !== undefined) {
            const fifths = Math.max(-7, Math.min(7, numOf(key, "fifths")!));
            keys.push({ measure: mi, fifths, mode: textOf(key, "mode") === "minor" ? "minor" : "major" });
          }
          for (const c of kids(el, "clef")) clefs.push({ measure: mi, staff: Number(c.attrs.number ?? 1), clef: clefOf(c) });
          const tr = kid(el, "transpose");
          if (tr) transpose = (numOf(tr, "chromatic") ?? 0) + 12 * (numOf(tr, "octave-change") ?? 0);
        } else if (el.name === "backup") {
          cursor = Math.max(0, cursor - (numOf(el, "duration") ?? 0) * (TICKS / divisions));
        } else if (el.name === "forward") {
          cursor += (numOf(el, "duration") ?? 0) * (TICKS / divisions);
          maxCursor = Math.max(maxCursor, cursor);
        } else if (el.name === "direction" || el.name === "sound") {
          const sound = el.name === "sound" ? el : kid(el, "sound");
          const metronome = kids(el, "direction-type").map((d) => kid(d, "metronome")).find(Boolean);
          const tempo = sound?.attrs.tempo ? Number(sound.attrs.tempo) : metronome ? quarterBpm(metronome) : undefined;
          if (tempo && tempo > 0 && measures[mi] && measures[mi].tempo === undefined && parts.length === 0) {
            measures[mi].tempo = Math.round(tempo);
          }
          if (sound && (sound.attrs.dacapo || sound.attrs.dalsegno || sound.attrs.tocoda)) count("D.S., D.C. or coda jump");
        } else if (el.name === "note") {
          if (kid(el, "grace")) { count("grace note"); continue; }
          const ticksExact = (numOf(el, "duration") ?? 0) * (TICKS / divisions);
          const length = Math.round(ticksExact);
          if (length !== ticksExact) count("note length rounded");
          if (kid(el, "cue")) { count("cue note"); cursor += length; maxCursor = Math.max(maxCursor, cursor); continue; }
          const chord = !!kid(el, "chord");
          const offset = chord ? lastStart : cursor;
          if (!chord) {
            lastStart = cursor;
            cursor += length;
            maxCursor = Math.max(maxCursor, cursor);
          }
          if (kid(el, "unpitched")) { unpitched++; continue; }
          const rest = kid(el, "rest");
          const note: Pending = {
            measure: mi,
            staff: numOf(el, "staff") ?? 1,
            voice: textOf(el, "voice") ?? "1",
            offset,
            length,
            rest: !!rest,
          };
          if (chord) note.chord = true;
          if (rest?.attrs.measure === "yes") note.wholeBar = true;
          if (el.attrs["print-object"] === "no") note.hidden = true;
          const p = kid(el, "pitch");
          if (!rest && p) {
            const step = textOf(p, "step") as Pitch["step"];
            const written: Pitch = { step, alter: Math.round(numOf(p, "alter") ?? 0), octave: numOf(p, "octave") ?? 4 };
            note.written = written;
            note.midi = midiOfPitch(written) + transpose;
            pitched++;
          } else if (!rest) {
            note.rest = true;
          }
          const ties = [...kids(el, "tie"), ...kids(kid(el, "notations"), "tied")].map((t) => t.attrs.type);
          if (ties.includes("start")) note.tieStart = true;
          if (ties.includes("stop")) note.tieStop = true;
          const tm = kid(el, "time-modification");
          if (tm) {
            const tuplet = kid(kid(el, "notations"), "tuplet");
            note.tuplet = { actual: numOf(tm, "actual-notes") ?? 3, normal: numOf(tm, "normal-notes") ?? 2 };
            if (tuplet?.attrs.type === "start") note.tuplet.start = true;
            if (tuplet?.attrs.type === "stop") note.tuplet.stop = true;
          }
          const lyrics = kids(el, "lyric");
          const verse = lyrics.find((l) => (l.attrs.number ?? "1") === "1") ?? lyrics[0];
          const words = verse ? kids(verse, "text").map((t) => t.text).join("") : "";
          if (verse && words) {
            const syllabic = (textOf(verse, "syllabic") ?? "single") as Lyric["syllabic"];
            note.lyric = { text: words, syllabic };
            if (kid(verse, "extend")) note.lyric.extend = true;
          }
          pending.push(note);
        }
      }
      contentLength[mi] = Math.max(contentLength[mi], maxCursor);
    });

    if (unpitched > 0 && pitched === 0) {
      count("drum part");
      continue;
    }
    if (unpitched > 0) count("unpitched note", unpitched);
    if (keys.length === 0 || keys[0].measure !== 0) keys.unshift({ measure: 0, fifths: 0, mode: "major" });
    for (let s = 1; s <= staves; s++) {
      if (!clefs.some((c) => c.staff === s && c.measure === 0)) clefs.unshift({ measure: 0, staff: s, clef: s === 1 ? "treble" : "bass" });
    }
    const name = meta.name;
    parts.push({
      id: xp.attrs.id ?? `P${parts.length + 1}`,
      name,
      abbreviation: meta.abbreviation,
      sourceProgram: meta.program,
      program: nearestProgram(meta.program, name),
      transpose,
      staves,
      clefs,
      keys,
      notes: [],
    });
    pendingByPart.push(pending);
  }
  if (parts.length === 0) throw new PieceReadError("This piece has no parts with notes we can read (drum parts are left out).");

  // Bar lengths and starts, then every note's absolute start.
  let at = 0;
  measures.forEach((m, i) => {
    const full = Math.round((m.time.beats * 4 * TICKS) / m.time.beatType);
    const content = contentLength[i];
    const pickup = m.implicit || (i === 0 && content > 0 && content < full);
    m.length = pickup ? content || full : Math.max(full, content);
    m.start = at;
    at += m.length;
  });
  parts.forEach((part, pi) => {
    part.notes = pendingByPart[pi].map(({ offset, ...n }) => {
      const note: PieceNote = { ...n, start: measures[n.measure].start + offset };
      if (note.wholeBar) note.length = measures[n.measure].length;
      return note;
    });
  });

  for (const part of parts) keepRealTies(part.notes);

  const work = kid(root, "work");
  const creditWords = kids(root, "credit").flatMap((c) => kids(c, "credit-words").map((w) => w.text.trim())).filter(Boolean);
  // The file's name first (Blaine: teachers name their files; a score's own
  // title is often "Untitled score" or "Title"), then what the score says.
  const title = titleFromFileName(fileName) || textOf(work, "work-title") || textOf(root, "movement-title") || creditWords[0] || "Untitled";
  const composer = kids(kid(root, "identification"), "creator").find((c) => c.attrs.type === "composer")?.text.trim();

  const warnings = [...counts].map(([what, n]) => {
    if (what === "D.S., D.C. or coda jump") return "D.S., D.C. and coda jumps are not followed: the piece plays straight through";
    if (what === "drum part") return `${n} drum part${n === 1 ? "" : "s"} left out`;
    if (what === "note length rounded") return `${n} note length${n === 1 ? "" : "s"} rounded to the nearest we can play`;
    return `${n} ${what}${n === 1 ? "" : "s"} left out`;
  });

  return { version: PIECE_VERSION, title, composer: composer || undefined, parts, measures, warnings };
}

/** "Shenandoah_SATB-final.mxl" -> "Shenandoah SATB-final"; nothing for a name that says nothing ("score.xml"). */
export function titleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const name = base.replace(/\.(musicxml|xml|mxl)$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return /^(untitled|score|musicxml|export|untitled score)?$/i.test(name) ? "" : name;
}

/** The key's name for ABC (`Bb`, `F#m`). */
export function keyName(fifths: number, mode: "major" | "minor"): string {
  const i = Math.max(-7, Math.min(7, fifths)) + 7;
  return mode === "major" ? MAJOR[i] : MINOR[i];
}

/**
 * A tie joins two notes of one pitch, end to start, in one voice. Files also
 * mark a slur's ends as ties, or tie one note of a chord to a different
 * pitch; those would be held as one note, so they are dropped.
 */
function keepRealTies(notes: PieceNote[]): void {
  const at = new Map<string, PieceNote[]>();
  for (const n of notes) {
    if (n.rest) continue;
    const k = `${n.staff}|${n.voice}|${n.start}|${n.midi}`;
    (at.get(k) ?? at.set(k, []).get(k)!).push(n);
  }
  const joined = new Set<PieceNote>();
  for (const n of notes) {
    if (!n.tieStart) continue;
    const next = at.get(`${n.staff}|${n.voice}|${n.start + n.length}|${n.midi}`)?.find((m) => m.tieStop);
    if (next) joined.add(next);
    else delete n.tieStart;
  }
  for (const n of notes) if (n.tieStop && !joined.has(n)) delete n.tieStop;
}
