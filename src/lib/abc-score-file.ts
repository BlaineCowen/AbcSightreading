/**
 * Reading and writing the hand-transcribed score files in `scores/`.
 *
 * These are ABC files typed by hand on the /write page - real sight-reading
 * examples transcribed from paper - and they are meant to be read back as a
 * corpus, the way the Bach chorales were. So every one has to carry what it is:
 * which level, which voicing, where it came from. A file that loses its level is
 * not a smaller file, it is a file that cannot be used for anything.
 *
 * All of that rides in the ABC header as real information fields, so the file
 * stays valid ABC and describes itself. No sidecar JSON, which would be one more
 * thing to drift away from the score it belongs to.
 *
 * Kept as pure functions away from the endpoint and the component so the parts
 * with a right answer can be tested: a bad filename or a dropped field is
 * exactly the kind of failure nobody notices until the corpus is useless.
 */

export type ScoreMeta = {
  title: string;
  /** UIL level 1-5, as a string because it comes from a form. May be blank. */
  level?: string;
  /** SATB, SAB, SSA, TTB... May be blank. */
  voicing?: string;
  /** ABC key, e.g. "C", "F", "Am". */
  key?: string;
  /** ABC meter, e.g. "4/4". */
  meter?: string;
  /** Where it was transcribed from, free text. */
  source?: string;
  composer?: string;
  /** Quarter-note tempo. */
  tempo?: number;
};

const MAX_SLUG = 64;

/** The unit note length every hand-written score uses. See `blankScore`. */
export const UNIT_LENGTH = "1/8";

/**
 * A title turned into a filename stem.
 *
 * Accents are folded rather than dropped, so "Étude" becomes "etude" and not
 * "tude" - the point is a readable filename, and a transcriber typing a real
 * title should not have to think about this.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    // The combining marks NFD just split off. This has to happen BEFORE the
    // separator pass below, or each one becomes a hyphen and "Étude" slugs to
    // "e-tude".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, ""); // the slice can land mid-separator
}

/**
 * The gate the endpoint tests before touching the filesystem.
 *
 * An allowlist rather than a denylist, the same posture as SAFE_PATH in the
 * soundfont proxy: `..`, `/`, a leading dot and an empty string cannot describe
 * a path because they cannot be spelled at all.
 */
export function isSafeSlug(slug: string): boolean {
  // Must begin and end alphanumeric, 1 to 64 characters. The ends matter for
  // tidiness rather than safety - `forgotten-.abc` is a perfectly safe filename
  // and an untidy one - but `slugify` never produces one, so accepting it would
  // only ever admit a near-duplicate of a name already taken.
  return /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/.test(slug);
}

/**
 * One line of a header field, with anything that could break out of it removed.
 *
 * A newline in a value would not corrupt the file harmlessly - it would start a
 * new ABC line, and a title of "Forgotten\nK:Eb" would silently change the key
 * of the score. Values are single-line by construction.
 */
function fieldValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * A title, with the one character that would eat it removed.
 *
 * The parser truncates every line at its first `%` (abc_parse.js), so a title
 * of "50% Off" becomes "50" on the page and in the file's own title. Nothing
 * warns. Swapped for the word, which is what a transcriber meant anyway.
 */
function titleValue(value: string): string {
  return fieldValue(value).replace(/%/g, " percent");
}

/** Something in the ABC that will not do what the writer expects. */
export type AbcProblem = { kind: "blank-line" | "no-title" | "too-big"; message: string };

/** The largest file worth accepting, in characters. A transcription is tiny. */
export const MAX_ABC_CHARS = 256 * 1024;

/**
 * Problems worth telling the writer about before they lose work.
 *
 * The blank line is the one that matters. abcjs ends the tune at the first
 * empty line and silently discards everything after it (abc_parse_book.js), so
 * a transcriber who separates their systems with a blank line - which is the
 * natural way to lay out a long piece - sees the score quietly render short and
 * has no reason to suspect the file rather than their own typing.
 *
 * Reported rather than corrected: it is their text, and a save that rewrites
 * what they typed is worse than one that warns.
 */
export function abcProblems(abc: string): AbcProblem[] {
  const problems: AbcProblem[] = [];
  const normalised = abc.replace(/\r\n/g, "\n");

  if (normalised.length > MAX_ABC_CHARS) {
    problems.push({ kind: "too-big", message: "That is far larger than a transcription; refusing to save it." });
  }
  if (!/^T:.+$/m.test(normalised)) {
    problems.push({ kind: "no-title", message: "There is no T: title line, so the file has nothing to call itself." });
  }
  // A blank line anywhere ends the tune, but only one after the header can
  // actually swallow music.
  const keyAt = normalised.search(/^K:/m);
  const blankAt = normalised.indexOf("\n\n");
  if (blankAt !== -1 && (keyAt === -1 || blankAt > keyAt)) {
    const line = normalised.slice(0, blankAt + 1).split("\n").length;
    problems.push({
      kind: "blank-line",
      message: `There is a blank line at line ${line}. ABC ends the tune there - everything below it is silently dropped from the score. Delete it, or use a % comment line to space things out.`,
    });
  }
  return problems;
}

/** The voices each voicing is written on, matching `abc-assembly.ts` exactly. */
const VOICE_PARTS: Record<string, { id: string; name: string; clef: string }[]> = {
  SATB: [
    { id: "S", name: "Soprano", clef: "treble" },
    { id: "A", name: "Alto", clef: "treble" },
    { id: "T", name: "Tenor", clef: "treble octave up" },
    { id: "B", name: "Bass", clef: "bass" },
  ],
  SAB: [
    { id: "S", name: "Soprano", clef: "treble" },
    { id: "A", name: "Alto", clef: "treble" },
    { id: "B", name: "Baritone", clef: "bass" },
  ],
  SSA: [
    { id: "S1", name: "Soprano 1", clef: "treble" },
    { id: "S2", name: "Soprano 2", clef: "treble" },
    { id: "A", name: "Alto", clef: "treble" },
  ],
  SA: [
    { id: "S", name: "Soprano", clef: "treble" },
    { id: "A", name: "Alto", clef: "treble" },
  ],
  TTB: [
    { id: "T1", name: "Tenor 1", clef: "treble octave up" },
    { id: "T2", name: "Tenor 2", clef: "treble octave up" },
    { id: "B", name: "Bass", clef: "bass" },
  ],
  TTBB: [
    { id: "T1", name: "Tenor 1", clef: "treble octave up" },
    { id: "T2", name: "Tenor 2", clef: "treble octave up" },
    { id: "B1", name: "Baritone", clef: "bass" },
    { id: "B2", name: "Bass", clef: "bass" },
  ],
  TB: [
    { id: "T", name: "Tenor", clef: "treble octave up" },
    { id: "B", name: "Bass", clef: "bass" },
  ],
};

export const VOICINGS = Object.keys(VOICE_PARTS);

export function voicePartsFor(voicing: string | undefined) {
  return VOICE_PARTS[(voicing ?? "").toUpperCase()] ?? VOICE_PARTS.SATB;
}

/** Machine-readable metadata, on comment lines that never reach the page. */
const META_PREFIX = "%abcsr:";

/**
 * The header, in the order a reader expects to meet it.
 *
 * Level and voicing ride on `%abcsr:` comment lines rather than in ABC fields,
 * and the reason is that abcjs *draws* the fields that could carry them: `N:`
 * (notes) and `B:`/`S:`/`D:`/`Z:` all print in the block under the score, so
 * `N:level=3` would engrave the literal text "level=3" onto a page being
 * proofread against an original. A single-`%` comment is truncated away by the
 * parser before it reaches the music (abc_parse.js) - no warning, no render.
 * An invented `%%directive` is not an option either: unknown ones warn.
 *
 * `S:` keeps the source, because that one is both semantically right and worth
 * printing - a transcription should say what it was transcribed from.
 *
 * The comment block sits directly after `T:`. abcjs pulls the title by
 * splitting the file on the literal "T:" (abc_parse_book.js), so any metadata
 * that might itself contain "T:" has to come after the real title line.
 */
export function buildHeader(meta: ScoreMeta): string {
  const lines: string[] = [];
  lines.push("X:1");
  lines.push(`T:${titleValue(meta.title)}`);
  if (meta.composer) lines.push(`C:${fieldValue(meta.composer)}`);
  if (meta.level) lines.push(`${META_PREFIX} level=${fieldValue(meta.level)}`);
  if (meta.voicing) lines.push(`${META_PREFIX} voicing=${fieldValue(meta.voicing)}`);
  if (meta.source) lines.push(`S:${fieldValue(meta.source)}`);
  lines.push(`M:${fieldValue(meta.meter || "4/4")}`);
  lines.push(`L:${UNIT_LENGTH}`);
  lines.push(`Q:1/4=${meta.tempo ?? 72}`);

  const parts = voicePartsFor(meta.voicing);
  lines.push(`%%score ${parts.map((p) => p.id).join(" ")}`);
  for (const p of parts) {
    lines.push(`V:${p.id} clef=${p.clef} name="${p.name}" snm="${p.id}"`);
  }
  lines.push(`K:${fieldValue(meta.key || "C")}`);
  return lines.join("\n");
}

/**
 * The metadata back out of a file, for listing what has been saved.
 *
 * Reads the header only - everything up to the `K:` line, which is where ABC
 * says the header ends and the music begins. A `T:` inside a lyric line further
 * down is not a title.
 */
export function parseHeader(abc: string): ScoreMeta {
  const meta: ScoreMeta = { title: "" };
  for (const raw of abc.split(/\r?\n/)) {
    const line = raw.trim();

    if (line.startsWith(META_PREFIX)) {
      const value = line.slice(META_PREFIX.length).trim();
      // Split on the FIRST "=" only: a value may well contain one.
      const eq = value.indexOf("=");
      if (eq === -1) continue;
      const name = value.slice(0, eq).trim().toLowerCase();
      const val = value.slice(eq + 1).trim();
      if (name === "level") meta.level = val;
      else if (name === "voicing") meta.voicing = val;
      continue;
    }

    const field = /^([A-Za-z]):(.*)$/.exec(line);
    if (!field) continue;
    const [, letter, rest] = field;
    const value = rest.trim();
    switch (letter) {
      case "T":
        if (!meta.title) meta.title = value;
        break;
      case "C":
        meta.composer = value;
        break;
      case "S":
        meta.source = value;
        break;
      case "M":
        meta.meter = value;
        break;
      case "Q": {
        const bpm = /=\s*(\d+)/.exec(value);
        if (bpm) meta.tempo = Number(bpm[1]);
        break;
      }
      case "K":
        meta.key = value;
        // K: ends the header. Anything after it is music.
        return meta;
    }
  }
  return meta;
}

/**
 * Put the form's details into ABC that already exists.
 *
 * The alternative - letting the form and the text each hold their own idea of
 * the title - drifts immediately: the very first save wrote a file named after
 * the form and titled "Untitled" from the template. The text is the one thing
 * that gets saved, so the text has to be the thing the form edits.
 *
 * Only the fields the form actually shows are touched. `L:`, `Q:`, `%%score`
 * and the `V:` lines are left exactly as they are, in their original order,
 * because those are what a transcriber edits by hand as the piece demands -
 * rewriting them from a form that does not show them would quietly undo that
 * work. The music below `K:` is never touched at all.
 */
export function applyMeta(abc: string, meta: ScoreMeta): string {
  const lines = abc.split("\n");
  const kIndex = lines.findIndex((l) => /^K:/.test(l));
  if (kIndex === -1) return abc; // no header to speak of; leave it alone

  const header = lines.slice(0, kIndex + 1);
  const body = lines.slice(kIndex + 1);

  const isOwned = (l: string) =>
    /^[XTSMK]:/.test(l) || l.startsWith(META_PREFIX);
  const composer = header.find((l) => /^C:/.test(l));
  // Everything the form does not speak for, in the order it was written.
  const kept = header.filter((l) => !isOwned(l) && !/^C:/.test(l));

  const rebuilt = ["X:1", `T:${titleValue(meta.title)}`];
  if (meta.level) rebuilt.push(`${META_PREFIX} level=${fieldValue(meta.level)}`);
  if (meta.voicing) rebuilt.push(`${META_PREFIX} voicing=${fieldValue(meta.voicing)}`);
  if (composer) rebuilt.push(composer);
  else if (meta.composer) rebuilt.push(`C:${fieldValue(meta.composer)}`);
  if (meta.source) rebuilt.push(`S:${fieldValue(meta.source)}`);
  rebuilt.push(`M:${fieldValue(meta.meter || "4/4")}`);
  rebuilt.push(...kept);
  rebuilt.push(`K:${fieldValue(meta.key || "C")}`);

  return [...rebuilt, ...body].join("\n");
}

/**
 * Splitting a score into a header and one box per voice, and putting it back.
 *
 * Raw multi-voice ABC is laid out by LINE ORDER: the lines are read as voice 1,
 * voice 2, ... and then round again for the next system. Write a part across two
 * lines while the others have one and every line after it lands on the wrong
 * staff - the bass turns up on the soprano, carrying its clef with it. Neither
 * `[V:B]` at the start of the line nor a `V:B` field line rescues it.
 *
 * That rule is unlearnable by trial and error and has nothing to do with the
 * music. So the page does not ask anyone to obey it: each part gets its own box,
 * and the assembly below emits exactly one line per declared voice, in the order
 * the header declares them, which is the shape that always works.
 */

/** The voice ids a header declares, in order, from its `V:` lines. */
export function voiceIdsFromHeader(header: string): string[] {
  const ids: string[] = [];
  for (const line of header.split(/\r?\n/)) {
    const m = /^V:\s*(\S+)/.exec(line.trim());
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** Bars in a line of music, counted by the barlines that separate them. */
export function countBars(music: string): number {
  return music
    .split(/\|+/)
    .map((b) => b.replace(/[\]\[:]/g, "").trim())
    .filter((b) => b.length > 0).length;
}

/**
 * One voice's music as a single line.
 *
 * The box may be typed across as many lines as the writer likes - that is the
 * whole point of it - so they are joined here. One physical line per voice is
 * what keeps the line-order rule satisfied.
 */
export function flattenVoice(music: string): string {
  return music
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .trim();
}

/**
 * Header plus one box per voice, into a single valid ABC file.
 *
 * A voice with an empty box still gets a line, filled with bars of rest to match
 * the longest part. Leaving it out would be a line short, which is exactly the
 * misalignment this is here to prevent - and a part that has not been
 * transcribed yet should read as silence, not as missing.
 */
export function assembleScore(
  header: string,
  voices: Record<string, string>,
  meter?: string
): string {
  const ids = voiceIdsFromHeader(header);
  const flat = Object.fromEntries(ids.map((id) => [id, flattenVoice(voices[id] ?? "")]));
  const bars = Math.max(1, ...ids.map((id) => countBars(flat[id])));
  const rest = `z${barRestLength(meter ?? parseHeader(header).meter)}`;

  const lines = ids.map((id) => {
    const short = bars - countBars(flat[id]);
    const padding = short > 0 ? Array.from({ length: short }, () => ` ${rest} |`).join("") : "";
    return `[V:${id}] ${flat[id]}${padding}`.replace(/\s+/g, " ").trim();
  });
  return `${header.replace(/\s+$/, "")}\n${lines.join("\n")}\n`;
}

/**
 * Trailing bars of silence, taken back off.
 *
 * The inverse of the padding above, for when a file is loaded back into its
 * boxes: a box should hold what its writer typed, not the rests the assembler
 * added to keep the staves level. Without this, opening a part-finished
 * transcription hands the tenor its one real bar followed by forty of `z8` to
 * delete before carrying on.
 *
 * Safe against losing a real ending, because assembly puts them straight back:
 * every part is padded to the longest, so a stripped bar of rest returns unless
 * EVERY part ended with one - and these are exercises that end on a sounding
 * chord.
 */
export function stripTrailingRests(music: string): string {
  const bars = music.split("|");
  // Down to nothing if that is all there was: a part holding only rests was
  // never written, and should open as an empty box.
  while (bars.length > 0) {
    const last = bars[bars.length - 1].trim();
    // The split leaves an empty piece for music ending in a barline.
    if (last === "" || /^z\d*$/.test(last)) {
      bars.pop();
      continue;
    }
    break;
  }
  const out = bars.join("|").trim();
  if (!out) return "";
  // `|]` is a final barline, not a bar waiting for one.
  return /[|\]]$/.test(out) ? out : `${out}|`;
}

/** The inverse, for loading a saved file back into the boxes. */
export function splitScore(abc: string): { header: string; voices: Record<string, string> } {
  const lines = abc.split(/\r?\n/);
  const kIndex = lines.findIndex((l) => /^K:/.test(l));
  if (kIndex === -1) return { header: abc, voices: {} };

  const header = lines.slice(0, kIndex + 1).join("\n");
  const voices: Record<string, string> = {};
  let current: string | null = null;
  // A trailing backslash is ABC's line-continuation marker. It carries no
  // music, and the boxes do not need it - the assembler puts each part on one
  // line - so it comes off wherever it appears.
  const noContinuation = (music: string) => music.replace(/\\\s*$/, "").trim();
  for (const line of lines.slice(kIndex + 1)) {
    const inline = /^\[V:\s*([^\]\s]+)\]\s*(.*)$/.exec(line.trim());
    const field = /^V:\s*(\S+)\s*$/.exec(line.trim());
    if (inline) {
      current = inline[1];
      const music = noContinuation(inline[2]);
      voices[current] = voices[current] ? `${voices[current]}\n${music}` : music;
    } else if (field) {
      current = field[1];
      voices[current] = voices[current] ?? "";
    } else if (line.trim() && current) {
      // A continuation line, with or without a trailing backslash.
      voices[current] = `${voices[current]}\n${noContinuation(line.trim())}`.trim();
    }
  }
  for (const id of Object.keys(voices)) voices[id] = voices[id].trim();
  return { header, voices };
}

/**
 * How many eighth notes fill one bar of the given meter.
 *
 * Everything here is written with `L:1/8`, so a bar of n/d is n * (8/d)
 * eighths - 8 for 4/4, 6 for 3/4 and for 6/8, 4 for 2/4.
 */
export function barRestLength(meter: string | undefined): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec((meter ?? "").trim());
  if (!m) return 8;
  const beats = Number(m[1]);
  const unit = Number(m[2]);
  if (!beats || !unit) return 8;
  const eighths = Math.round(beats * (8 / unit));
  return eighths > 0 ? eighths : 8;
}

/**
 * A blank score to start typing into: the header, then empty bars.
 *
 * `L:1/8` rather than the generator's `L:1/32`. The assembler writes 1/32
 * because a machine emits exact multipliers; someone typing a quarter note by
 * hand wants to write `c2`, not `c8`.
 *
 * The bars are whole-bar rests rather than nothing at all, because an empty
 * voice line is not valid ABC and the score would fail to render before a single
 * note had been typed - the least encouraging possible start.
 */
export function blankScore(meta: ScoreMeta, measures = 8): string {
  const parts = voicePartsFor(meta.voicing);
  const rest = `z${barRestLength(meta.meter)}`;
  const bars = Array.from({ length: measures }, () => rest).join(" | ") + " |]";
  const body = parts.map((p) => `[V:${p.id}] ${bars}`).join("\n");
  return `${buildHeader(meta)}\n${body}\n`;
}
