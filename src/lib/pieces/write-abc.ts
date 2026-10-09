import { keyName } from "./read-musicxml";
import { TICKS, type Clef, type PieceMeasure, type PieceNote, type PiecePart, type PieceScore, type Pitch } from "./model";

/**
 * ABC for abcjs to draw and play a piece (or bars of it), from the model.
 *
 * L:1/192, so a tick is one unit and every length the reader keeps is a whole
 * number of units. Each part's staff-and-voice pair is an ABC voice; voices on
 * one staff share it (`%%score (a b)`), a part on two staves is braced. Each
 * voice carries its part's instrument (`%%MIDI program`, after the voice's
 * first `V:` line in the body, which is the only place abcjs reads it per
 * voice) and its transposition (`transpose=`, which moves playback only, so
 * a B-flat clarinet is drawn as written and sounds concert).
 *
 * `voices` says which model note each drawn note or rest is, in order, so a
 * page can pair abcjs's elements with notes (`drawnElements`): grading reads
 * the model, and the marks go on the element drawn for each note.
 */

export type AbcVoice = {
  id: string;
  part: number;
  staff: number;
  voice: string;
  /** Per drawn note or rest element, in order: the index into `part.notes` of the note it draws (a chord's first note), or -1 for filler. */
  elements: number[];
};

export type PieceAbc = {
  abc: string;
  voices: AbcVoice[];
  /** ABC voice ids per drawn staff, top to bottom, as abcjs numbers staves. */
  staves: string[][];
  /** Ticks at the excerpt's first bar, so a time in the ABC is `tick - startTick`. */
  startTick: number;
};

export type AbcOptions = {
  /** Part indexes to draw (default all). */
  parts?: number[];
  /** First and last bar index, inclusive (default the whole piece). */
  from?: number;
  to?: number;
  barsPerLine?: number;
  title?: boolean;
  /** Quarter notes a minute, over the score's own tempo. */
  tempo?: number;
  /** Write the score's tempo changes (default true). */
  tempoChanges?: boolean;
  /** MIDI program per part index, over the part's own. */
  programs?: Record<number, number>;
};

/** Lengths abcjs draws as one note, longest first (whole to 64th, with dots). */
const PLAIN = [384, 288, 192, 144, 96, 72, 48, 36, 24, 18, 12, 9, 6, 3];

/** A length as notes abcjs can draw, tied: 60 ticks is a quarter and a sixteenth. */
export function splitLength(length: number): number[] {
  const out: number[] = [];
  let left = length;
  while (left > 0) {
    const piece = PLAIN.find((p) => p <= left) ?? left;
    out.push(piece);
    left -= piece;
  }
  return out;
}

const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const FLATS = ["B", "E", "A", "D", "G", "C", "F"];

function keyAlter(fifths: number, step: string): number {
  if (fifths > 0) return SHARPS.slice(0, fifths).includes(step) ? 1 : 0;
  if (fifths < 0) return FLATS.slice(0, -fifths).includes(step) ? -1 : 0;
  return 0;
}

function abcPitch(p: Pitch): string {
  return p.octave >= 5 ? p.step.toLowerCase() + "'".repeat(p.octave - 5) : p.step + ",".repeat(Math.max(0, 4 - p.octave));
}

function accidental(alter: number): string {
  return alter === 0 ? "=" : alter > 0 ? "^".repeat(alter) : "_".repeat(-alter);
}

function lyricText(n: PieceNote): string {
  if (!n.lyric) return "*";
  const t = n.lyric.text.replace(/([-*_|~\\])/g, "\\$1").replace(/\s+/g, "~");
  const tail = n.lyric.syllabic === "begin" || n.lyric.syllabic === "middle" ? "-" : " ";
  return t + (n.lyric.extend && tail === " " ? " _ " : tail);
}

function keyAt<T extends { measure: number }>(changes: T[], measure: number, staff?: number): T | undefined {
  let found: T | undefined;
  for (const c of changes) {
    if (c.measure > measure) break;
    if (staff !== undefined && (c as unknown as { staff: number }).staff !== staff) continue;
    found = c;
  }
  return found;
}

/** The beat a note is beamed within: a quarter in simple time, a dotted quarter in compound. */
function beamUnit(m: PieceMeasure): number {
  const { beats, beatType } = m.time;
  if (beatType === 8 && beats % 3 === 0 && beats > 3) return (TICKS * 3) / 2;
  return (4 * TICKS) / beatType;
}

function voicesOf(part: PiecePart): { staff: number; voice: string }[] {
  const seen = new Map<string, { staff: number; voice: string }>();
  for (const n of part.notes) {
    const k = `${n.staff}|${n.voice}`;
    if (!seen.has(k)) seen.set(k, { staff: n.staff, voice: n.voice });
  }
  for (let s = 1; s <= part.staves; s++) {
    if (![...seen.values()].some((v) => v.staff === s)) seen.set(`${s}|-`, { staff: s, voice: "-" });
  }
  return [...seen.values()].sort((a, b) => a.staff - b.staff || a.voice.localeCompare(b.voice, undefined, { numeric: true }));
}

const place = (p: Pitch) => `${p.step}${p.octave}`;

/** Where on the staff each voice strikes notes at each moment: `staff|voice|tick` to places ("E5"). */
const onsetCache = new WeakMap<PiecePart, Map<string, Set<string>>>();
function onsetsOf(part: PiecePart): Map<string, Set<string>> {
  let map = onsetCache.get(part);
  if (map) return map;
  map = new Map();
  for (const n of part.notes) {
    if (n.rest) continue;
    const k = `${n.staff}|${n.voice}|${n.start}`;
    (map.get(k) ?? map.set(k, new Set()).get(k)!).add(place(n.written!));
  }
  onsetCache.set(part, map);
  return map;
}

const quote = (s: string) => s.replace(/"/g, "'");

export function abcForPiece(score: PieceScore, opts: AbcOptions = {}): PieceAbc {
  const partIdx = opts.parts ?? score.parts.map((_, i) => i);
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(score.measures.length - 1, opts.to ?? score.measures.length - 1);
  const whole = from === 0 && to === score.measures.length - 1;
  const barsPerLine = opts.barsPerLine ?? 4;
  const bars = score.measures.slice(from, to + 1);
  const first = bars[0];

  const voices: AbcVoice[] = [];
  const staves: string[][] = [];
  const scoreTerms: string[] = [];
  const defs: string[] = [];
  const clefOf = (part: PiecePart, staff: number, measure: number): Clef =>
    keyAt(part.clefs, measure, staff)?.clef ?? (staff === 1 ? "treble" : "bass");

  for (const pi of partIdx) {
    const part = score.parts[pi];
    const pv = voicesOf(part);
    const staffTerms: string[] = [];
    for (let s = 1; s <= part.staves; s++) {
      const ids = pv.filter((v) => v.staff === s).map((v) => `P${pi}S${s}V${v.voice.replace(/\W/g, "") || "x"}`);
      staves.push(ids);
      staffTerms.push(ids.length > 1 ? `(${ids.join(" ")})` : ids[0]);
      pv.filter((v) => v.staff === s).forEach((v, k) => {
        const id = ids[k];
        voices.push({ id, part: pi, staff: s, voice: v.voice, elements: [] });
        const clef = clefOf(part, s, from);
        const named = s === 1 && k === 0;
        defs.push(
          `V:${id} clef=${clef}` +
            (named ? ` name="${quote(part.name)}" snm="${quote(part.abbreviation ?? "")}"` : "") +
            (part.transpose ? ` transpose=${part.transpose}` : ""),
        );
      });
    }
    scoreTerms.push(part.staves > 1 ? `{${staffTerms.join(" | ")}}` : staffTerms[0]);
  }

  const marks = score.measures.map((m, i) => ({ measure: i, tempo: m.tempo })).filter((m) => m.tempo);
  // A score's first tempo often sits a bar in (after a pickup): it is the tempo from the start.
  const tempo = opts.tempo ?? keyAt(marks, from)?.tempo ?? marks[0]?.tempo ?? 100;
  const head = [
    "X:1",
    opts.title ? `T:${score.title}` : null,
    opts.title && score.composer ? `C:${score.composer}` : null,
    `M:${first.time.beats}/${first.time.beatType}`,
    "L:1/192",
    `Q:1/4=${Math.round(tempo)}`,
    `%%score ${scoreTerms.join(" ")}`,
    ...defs,
    "K:C",
  ].filter((l): l is string => l !== null);

  // Each voice's notes grouped by bar.
  const byBar = new Map<string, Map<number, number[]>>();
  for (const v of voices) {
    const part = score.parts[v.part];
    const m = new Map<number, number[]>();
    part.notes.forEach((n, i) => {
      if (n.staff !== v.staff || n.voice !== v.voice || n.measure < from || n.measure > to) return;
      (m.get(n.measure) ?? m.set(n.measure, []).get(n.measure)!).push(i);
    });
    byBar.set(v.id, m);
  }

  const barline = (i: number): string => {
    const m = score.measures[i];
    const next = score.measures[i + 1];
    if (i === to) return whole && m.repeatEnd ? ":|" : "|]";
    const end = whole && m.repeatEnd;
    const start = whole && next?.repeatStart;
    return end && start ? ":||:" : end ? ":|" : start ? "|:" : "|";
  };

  const body: string[] = [];
  for (let lineStart = from; lineStart <= to; lineStart += barsPerLine) {
    const lineEnd = Math.min(to, lineStart + barsPerLine - 1);
    for (const v of voices) {
      const part = score.parts[v.part];
      const notes = part.notes;
      const onsets = onsetsOf(part);
      const out: string[] = [];
      const words: string[] = [];
      body.push(`V:${v.id}`);
      if (lineStart === from) body.push(`%%MIDI program ${opts.programs?.[v.part] ?? part.program}`);
      if (lineStart === from && whole && score.measures[from].repeatStart) out.push("|:");
      for (let mi = lineStart; mi <= lineEnd; mi++) {
        const m = score.measures[mi];
        const fields: string[] = [];
        const prev = score.measures[mi - 1];
        if (mi === from || (prev && (prev.time.beats !== m.time.beats || prev.time.beatType !== m.time.beatType))) {
          if (mi !== from) fields.push(`[M:${m.time.beats}/${m.time.beatType}]`);
        }
        if (mi !== from && m.tempo && v === voices[0] && opts.tempoChanges !== false && marks[0]?.measure !== mi) {
          fields.push(`[Q:1/4=${m.tempo}]`);
        }
        const key = keyAt(part.keys, mi)!;
        const clef = clefOf(part, v.staff, mi);
        const keyChanged = mi === from || keyAt(part.keys, mi - 1) !== key;
        const clefChanged = mi !== from && clefOf(part, v.staff, mi - 1) !== clef;
        if (keyChanged || clefChanged) fields.push(`[K:${keyName(key.fifths, key.mode)}${clefChanged ? ` clef=${clef}` : ""}]`);
        if (whole && m.endingStart) fields.push(`[${m.endingStart.replace(/\s+/g, "")}`);
        out.push(...fields);

        const unit = beamUnit(m);
        const altered = new Map<string, number>();
        let cursor = m.start;
        const end = m.start + m.length;
        const ids = byBar.get(v.id)!.get(mi) ?? [];
        // A chord: its first note and the notes stacked on it.
        const groups: number[][] = [];
        for (const i of ids) {
          if (notes[i].chord && groups.length) groups[groups.length - 1].push(i);
          else groups.push([i]);
        }
        let tupletLeft = 0;
        const filler = (len: number) => {
          for (const piece of splitLength(len)) {
            out.push(`x${piece}`);
            v.elements.push(-1);
          }
        };
        for (let g = 0; g < groups.length; g++) {
          const group = groups[g];
          const headNote = notes[group[0]];
          if (headNote.start < cursor) continue; // overlaps the note before: a second voice the file did not mark
          if (headNote.start > cursor) filler(headNote.start - cursor);
          cursor = headNote.start;
          const sep = (cursor - m.start) % unit === 0 || headNote.rest ? " " : "";
          if (headNote.tuplet && tupletLeft === 0) {
            // The file's own bracket if it marks one, else `actual` notes.
            const marked = groups.slice(g).some((x) => notes[x[0]].tuplet?.stop);
            let r = 0;
            for (let h = g; h < groups.length; h++) {
              const t = notes[groups[h][0]].tuplet;
              if (!t) break;
              r++;
              if (t.stop || (!marked && r >= headNote.tuplet.actual)) break;
            }
            out.push(` (${headNote.tuplet.actual}:${headNote.tuplet.normal}:${r}`);
            tupletLeft = r;
          } else if (sep) out.push(sep);
          const written = headNote.tuplet
            ? Math.round((headNote.length * headNote.tuplet.actual) / headNote.tuplet.normal)
            : headNote.length;
          const pieces = headNote.tuplet ? [written] : splitLength(Math.min(written, end - cursor));
          pieces.forEach((len, k) => {
            const lastPiece = k === pieces.length - 1;
            if (headNote.rest) {
              out.push(`${headNote.hidden ? "x" : "z"}${len}`);
              v.elements.push(group[0]);
              return;
            }
            // A chord tied in part: abcjs only holds a tie written on the
            // chord as a whole (`[Fca]72-`), and holds just the notes on the
            // same line or space after it (whatever their accidental), so
            // write it that way unless an untied note's place comes again.
            const next = onsets.get(`${v.staff}|${v.voice}|${headNote.start + headNote.length}`);
            const wholeTie =
              lastPiece &&
              group.length > 1 &&
              group.some((i) => notes[i].tieStart) &&
              !group.some((i) => !notes[i].tieStart && next?.has(place(notes[i].written!)));
            const pitches = group.map((i) => {
              const n = notes[i];
              const w = n.written!;
              const at = `${w.step}${w.octave}`;
              const current = altered.get(at) ?? keyAlter(key.fifths, w.step);
              let acc = "";
              if (w.alter !== current) {
                acc = accidental(w.alter);
                // A tied-over note's accidental does not carry through the bar
                // (engraving's rule, and abcjs's: it forgets it).
                if (!n.tieStop) altered.set(at, w.alter);
              }
              const tie = !lastPiece || (n.tieStart && group.length > 1 && !wholeTie) ? "-" : "";
              return acc + abcPitch(w) + (group.length > 1 ? tie : "");
            });
            const tieAll = (group.length === 1 && (!lastPiece || headNote.tieStart)) || wholeTie ? "-" : "";
            out.push((group.length > 1 ? `[${pitches.join("")}]` : pitches[0]) + len + tieAll);
            v.elements.push(group[0]);
            words.push(k === 0 ? lyricText(headNote) : "*");
          });
          if (tupletLeft > 0) tupletLeft--;
          cursor += headNote.length;
        }
        if (cursor < end) filler(end - cursor);
        out.push(` ${barline(mi)}`);
      }
      body.push(out.join("").replace(/\s+/g, " ").trim());
      if (words.some((w) => w !== "*")) body.push(`w: ${words.join(" ").replace(/\s+/g, " ").trim()}`);
    }
  }

  return { abc: [...head, ...body].join("\n") + "\n", voices, staves, startTick: first.start };
}

/**
 * abcjs's drawn note elements for each ABC voice, in order, from a parsed or
 * rendered tune: lines, then staves in `staves` order, then voices on each.
 */
export function drawnElements<T = unknown>(tune: { lines?: { staff?: { voices?: T[][] }[] }[] }, staves: string[][]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const line of tune.lines ?? []) {
    (line.staff ?? []).forEach((st, s) => {
      (st.voices ?? []).forEach((els, k) => {
        const id = staves[s]?.[k];
        if (!id) return;
        const list = out.get(id) ?? out.set(id, []).get(id)!;
        for (const el of els) if ((el as { el_type?: string }).el_type === "note") list.push(el);
      });
    });
  }
  return out;
}
