import type { ChoralJobResult } from "./choral-jobs";
import type { ChoralRenderInput } from "./generateChoral";
import type { UnisonScore } from "./generateUnison";
import type { SectionResult } from "./sectional-form";
import { ClefType, type TimeSignature, type VoiceNote, type VoicePart } from "./types";
import { keySignatures } from "../resources/key-signatures";
import { noteArray } from "../resources/noteArray";

/**
 * An exercise, carried whole in a link.
 *
 * A link to the settings writes a new exercise when it is opened: nothing is
 * seeded, and a seed would not survive the next change to the generator
 * anyway. So a link to *this* exercise has to carry its notes. Only what the
 * two assemblers read is kept - the choral notes as `renderChoral` sees them,
 * the unison score as `assembleUnisonAbc` does - so the exercise re-renders
 * byte for byte with any display option, and an 8-bar SATB exercise comes to
 * about 700 characters.
 *
 * It rides in the URL fragment (`#ex=`), which the browser never sends: it
 * stays out of the server's logs and the Referer header, and clear of any
 * limit on URL length.
 *
 * The format is `<codec><base64url>`: "1" is deflate-raw JSON, "0" plain JSON
 * for a browser that cannot compress. Everything decoded goes into an ABC
 * header or body, so it is checked against allowlists rather than trusted, and
 * a bad link comes back as a problem to show, never as an exception.
 */

const VERSION = 1;
/** Longest link value accepted, and the most JSON it may inflate to. */
const MAX_LINK_CHARS = 32_768;
const MAX_JSON_BYTES = 262_144;

export type LinkedExercise =
  | { kind: "choral"; result: Pick<ChoralJobResult, "exercise" | "sections"> }
  | { kind: "unison"; score: UnisonScore };

export type LinkProblem =
  /** Truncated, mangled, or not one of ours. */
  | "corrupt"
  /** Readable, but not a valid exercise. */
  | "invalid"
  /** Written by a newer version of the app. */
  | "too-new"
  /** Compressed, and this browser cannot decompress. */
  | "unsupported-browser"
  /** An exercise for the other page. */
  | "wrong-page";

export type UnpackResult =
  | { ok: true; exercise: LinkedExercise }
  | { ok: false; problem: LinkProblem; kind?: LinkedExercise["kind"] };

// ── The fragment ────────────────────────────────────────────────────────────

/** The packed exercise in a URL fragment, if it has one. */
export function exerciseParam(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("ex");
  return value ? value : null;
}

export function exerciseFragment(value: string): string {
  return `#ex=${value}`;
}

// ── Packing ─────────────────────────────────────────────────────────────────

export async function packExercise(
  exercise: LinkedExercise,
  opts: { compress?: boolean } = {}
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(toPayload(exercise)));
  if (opts.compress !== false && canCompress()) {
    return "1" + toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
  }
  return "0" + toBase64Url(bytes);
}

export async function unpackExercise(
  value: string,
  expect?: LinkedExercise["kind"]
): Promise<UnpackResult> {
  if (!value || value.length > MAX_LINK_CHARS) return { ok: false, problem: "corrupt" };
  const bytes = fromBase64Url(value.slice(1));
  if (!bytes) return { ok: false, problem: "corrupt" };

  let json: Uint8Array | null;
  if (value[0] === "0") {
    json = bytes.length <= MAX_JSON_BYTES ? bytes : null;
  } else if (value[0] === "1") {
    if (!canCompress()) return { ok: false, problem: "unsupported-browser" };
    json = await inflate(bytes);
  } else {
    return { ok: false, problem: "corrupt" };
  }
  if (!json) return { ok: false, problem: "corrupt" };

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  } catch {
    return { ok: false, problem: "corrupt" };
  }
  const result = fromPayload(payload);
  if (result.ok && expect && result.exercise.kind !== expect) {
    return { ok: false, problem: "wrong-page", kind: result.exercise.kind };
  }
  return result;
}

// ── Payload ─────────────────────────────────────────────────────────────────

const ACCIDENTALS = [null, "sharp", "flat", "natural", "double-sharp", "double-flat"] as const;
const CHORAL_CLEFS = new Set<string>(Object.values(ClefType));
const UNISON_CLEFS = new Set(["treble", "bass", "alto", "tenor"]);

/**
 * Choral: one render input per section, or `{r}` for a section that restates
 * an earlier one. Sections rather than one long exercise, so the decoded
 * result goes through `rendererFor` and `joinRendered` exactly as generated.
 */
type ChoralInputV1 = {
  k: string;
  m: [string, number, number?];
  q: number;
  i?: number;
  /** Only when not the defaults the generator writes. */
  t?: string;
  c?: string;
  p: [string, string, string][];
  n: unknown[][];
};

type PayloadV1 =
  | { v: 1; t: "c"; x: ChoralInputV1 }
  | { v: 1; t: "c"; s: (ChoralInputV1 | { r: number })[] }
  | { v: 1; t: "u"; st: "p" | "r"; m: [string, number, number?]; k?: string; c?: string; np?: number; pt: [string, string, unknown[]][] };

export function toPayload(exercise: LinkedExercise): PayloadV1 {
  if (exercise.kind === "unison") return unisonPayload(exercise.score);
  const { exercise: single, sections } = exercise.result;
  if (single) return { v: VERSION, t: "c", x: choralInput(single) };
  if (!sections?.length) throw new Error("A choral exercise needs an exercise or its sections.");

  const seen = new Map<string, number>();
  const s = sections.map((section, index) => {
    const input = (section.meta as { renderInput?: ChoralRenderInput } | undefined)?.renderInput;
    if (!input) throw new Error(`Section ${index + 1} has no render input.`);
    const encoded = choralInput(input);
    const key = JSON.stringify(encoded);
    const earlier = seen.get(key);
    if (earlier !== undefined) return { r: earlier };
    seen.set(key, index);
    return encoded;
  });
  return { v: VERSION, t: "c", s };
}

export function fromPayload(payload: unknown): UnpackResult {
  try {
    if (!isObject(payload) || typeof payload.v !== "number") return { ok: false, problem: "corrupt" };
    if (payload.v > VERSION) return { ok: false, problem: "too-new" };
    if (payload.v !== VERSION) return { ok: false, problem: "invalid" };
    if (payload.t === "u") return { ok: true, exercise: { kind: "unison", score: readUnison(payload) } };
    if (payload.t !== "c") return { ok: false, problem: "invalid" };

    if ("x" in payload) {
      return { ok: true, exercise: { kind: "choral", result: { exercise: readChoralInput(payload.x) } } };
    }
    if (!Array.isArray(payload.s) || payload.s.length === 0 || payload.s.length > 32) {
      return { ok: false, problem: "invalid" };
    }
    const inputs: ChoralRenderInput[] = [];
    const restated: boolean[] = [];
    for (const [index, entry] of (payload.s as unknown[]).entries()) {
      if (isObject(entry) && "r" in entry) {
        const from = entry.r;
        check(Number.isInteger(from) && (from as number) >= 0 && (from as number) < index);
        inputs.push(inputs[from as number]);
        restated.push(true);
      } else {
        inputs.push(readChoralInput(entry));
        restated.push(false);
      }
    }
    check(inputs.every((input) => sameFrame(input, inputs[0])));

    let startsAtBar = 1;
    const sections: SectionResult[] = inputs.map((renderInput, index) => {
      const measures = barsIn(renderInput);
      const section: SectionResult = {
        label: String.fromCharCode(65 + index),
        measures,
        startsAtBar,
        voices: [],
        restated: restated[index],
        meta: { chords: [], renderInput },
      };
      startsAtBar += measures;
      return section;
    });
    return { ok: true, exercise: { kind: "choral", result: { sections } } };
  } catch {
    // A failed check, or a shape odd enough to trip something unchecked: either
    // way the link is not an exercise, and the page says so rather than breaking.
    return { ok: false, problem: "invalid" };
  }
}

/** What a page needs to know about a linked choral exercise to show it. */
export function choralSummary(result: Pick<ChoralJobResult, "exercise" | "sections">) {
  const inputs = result.exercise
    ? [result.exercise]
    : (result.sections ?? []).map((s) => (s.meta as { renderInput: ChoralRenderInput }).renderInput);
  const first = inputs[0];
  return {
    key: first.key,
    meter: first.timeSig.name,
    tempo: first.metadata.tempo,
    voiceNames: first.voiceParts.map((p) => p.name),
    bars: inputs.reduce((sum, input) => sum + barsIn(input), 0),
  };
}

// ── Choral ──────────────────────────────────────────────────────────────────

const defaultTitle = (key: string) => `Sight Reading Exercise - ${key}`;
const DEFAULT_COMPOSER = "Generated by ABCSightreading";

/** The letter and octave, which is all the assembler reads of a note's name. */
const basePitch = (name: string) => name.replace(/^[\^_=]+/, "");

function choralInput(input: ChoralRenderInput): ChoralInputV1 {
  const { key, timeSig, metadata } = input;
  const encoded: ChoralInputV1 = {
    k: key,
    m: timeSig.beamGroupSize === undefined
      ? [timeSig.name, timeSig.tsPerMeasure]
      : [timeSig.name, timeSig.tsPerMeasure, timeSig.beamGroupSize],
    q: metadata.tempo,
    p: input.voiceParts.map((part) => [part.name, part.smallName, part.clef]),
    n: input.voices.map((voice) => voice.map(choralNote)),
  };
  if (metadata.midiProgram !== undefined) encoded.i = metadata.midiProgram;
  if (metadata.title !== defaultTitle(key)) encoded.t = metadata.title;
  if (metadata.composer !== DEFAULT_COMPOSER) encoded.c = metadata.composer;
  return encoded;
}

/**
 * `[pitchValue, length, degree, accidental, wasRaised, chordSymbol, name]`,
 * trailing defaults dropped; a rest is `[-1, length, chordSymbol]`. The name is
 * only kept when its letter and octave are not what the pitch implies.
 */
function choralNote(note: VoiceNote): unknown[] {
  if (note.rest) return trimmed([-1, note.length, note.chordSymbol ?? 0]);
  const accidental = Math.max(0, ACCIDENTALS.indexOf(note.accidental ?? null));
  const wasRaised = note.wasRaised === undefined ? 0 : note.wasRaised ? 1 : 2;
  const name = basePitch(note.name) === noteArray[note.pitchValue] ? 0 : note.name;
  return trimmed([note.pitchValue, note.length, note.degree, accidental, wasRaised, note.chordSymbol ?? 0, name]);
}

function readChoralInput(raw: unknown): ChoralRenderInput {
  check(isObject(raw));
  const r = raw as Record<string, unknown>;
  const key = r.k;
  check(typeof key === "string" && key in keySignatures);
  const meter = readMeter(r.m);
  // Choral meters always carry their beam group; the choral type requires it.
  check(meter.beamGroupSize !== undefined);
  const timeSig = meter as TimeSignature;
  const tempo = r.q;
  check(isInt(tempo, 20, 400));
  const midiProgram = r.i;
  check(midiProgram === undefined || isInt(midiProgram, 0, 127));
  check(r.t === undefined || isHeaderText(r.t));
  check(r.c === undefined || isHeaderText(r.c));

  check(Array.isArray(r.p) && r.p.length >= 1 && r.p.length <= 8);
  const voiceParts = (r.p as unknown[]).map((part) => {
    check(Array.isArray(part) && part.length === 3);
    const [name, smallName, clef] = part as unknown[];
    check(isPartName(name) && isSmallName(smallName) && typeof clef === "string" && CHORAL_CLEFS.has(clef));
    return { name, smallName, clef } as unknown as VoicePart;
  });

  check(Array.isArray(r.n) && r.n.length === voiceParts.length);
  const voices = (r.n as unknown[]).map((voice) => {
    check(Array.isArray(voice) && voice.length >= 1 && voice.length <= 2000);
    return (voice as unknown[]).map(readChoralNote);
  });
  const lengths = voices.map((voice) => voice.reduce((sum, note) => sum + note.length, 0));
  check(lengths.every((l) => l === lengths[0] && l % timeSig.tsPerMeasure === 0 && l > 0));

  return {
    voices,
    voiceParts,
    rhythms: [],
    key: key as string,
    timeSig,
    metadata: {
      title: (r.t as string | undefined) ?? defaultTitle(key as string),
      composer: (r.c as string | undefined) ?? DEFAULT_COMPOSER,
      tempo: tempo as number,
      ...(midiProgram === undefined ? {} : { midiProgram: midiProgram as number }),
    },
  };
}

function readChoralNote(raw: unknown): VoiceNote {
  check(Array.isArray(raw) && raw.length >= 2 && raw.length <= 7);
  const [pitchValue, length, a, b, c, d, e] = raw as unknown[];
  check(isInt(length, 1, 128));
  if (pitchValue === -1) {
    check(raw.length <= 3);
    const chordSymbol = readChordSymbol(a);
    return {
      name: "z",
      degree: 0,
      pitchValue: 0,
      length: length as number,
      rest: true,
      ...(chordSymbol ? { chordSymbol } : {}),
    } as VoiceNote;
  }
  check(isInt(pitchValue, 0, noteArray.length - 1));
  const degree = a ?? 0;
  const accidental = b ?? 0;
  const wasRaised = c ?? 0;
  check(isInt(degree, 0, 6) && isInt(accidental, 0, ACCIDENTALS.length - 1) && isInt(wasRaised, 0, 2));
  const chordSymbol = readChordSymbol(d);
  check(e === undefined || e === 0 || (typeof e === "string" && isNoteName(e)));
  const note = {
    name: typeof e === "string" ? e : noteArray[pitchValue as number],
    degree,
    pitchValue,
    length,
    rest: false,
    accidental: ACCIDENTALS[accidental as number],
    ...(wasRaised === 0 ? {} : { wasRaised: wasRaised === 1 }),
    ...(chordSymbol ? { chordSymbol } : {}),
  };
  return note as VoiceNote;
}

function readChordSymbol(raw: unknown): string | undefined {
  if (raw === undefined || raw === 0) return undefined;
  // Lands inside an ABC annotation, "^…": no quote to close it early, nothing
  // ABC reads as a comment or an escape, no line break.
  check(typeof raw === "string" && raw.length >= 1 && raw.length <= 16 && !/["%\\ -]/.test(raw));
  return raw as string;
}

const barsIn = (input: ChoralRenderInput) =>
  input.voices[0].reduce((sum, note) => sum + note.length, 0) / input.timeSig.tsPerMeasure;

/** Sections of one piece share a key, meter and voices - the joiner takes the first header for all. */
function sameFrame(a: ChoralRenderInput, b: ChoralRenderInput): boolean {
  return (
    a.key === b.key &&
    a.timeSig.name === b.timeSig.name &&
    JSON.stringify(a.voiceParts) === JSON.stringify(b.voiceParts)
  );
}

// ── Unison ──────────────────────────────────────────────────────────────────

/**
 * `[name, noteLength, degree, pitchValue, rhythmName, flags, patternIndex]`,
 * trailing defaults dropped. rhythmName is 0 for a note with no rhythm; flags
 * are 1 for a rest and 2 for a note inside a beamed pattern - all
 * createConcatString asks of the rhythm. The ~745-character `chord` each note
 * carries is not read by anything that writes the score, and is left behind.
 */
function unisonPayload(score: UnisonScore): PayloadV1 {
  const pt = Object.entries(score.partsObject.parts).map(([partKey, part]) => {
    const notes = ((part as any).chordNoteObject ?? []).map((note: any) => {
      const rhythm = note.rhythm;
      const flags = (rhythm?.rest ? 1 : 0) | (rhythm?.pattern ? 2 : 0);
      return trimmed([
        note.name,
        note.noteLength,
        note.degree ?? 0,
        note.pitchValue ?? 0,
        rhythm ? rhythm.name ?? "" : 0,
        flags,
        note.patternIndex ?? 0,
      ]);
    });
    return [partKey, part.smallName, notes] as [string, string, unknown[]];
  });
  const { timeSig } = score;
  return {
    v: VERSION,
    t: "u",
    st: score.staff === "rhythm" ? "r" : "p",
    m: timeSig.beamGroupSize === undefined
      ? [timeSig.name, timeSig.tsPerMeasure]
      : [timeSig.name, timeSig.tsPerMeasure, timeSig.beamGroupSize],
    ...(score.key === undefined ? {} : { k: score.key }),
    ...(score.clef === undefined ? {} : { c: score.clef }),
    ...(score.partsObject.numofParts === undefined ? {} : { np: score.partsObject.numofParts }),
    pt,
  };
}

function readUnison(raw: Record<string, unknown>): UnisonScore {
  check(raw.st === "p" || raw.st === "r");
  const staff = raw.st === "r" ? "rhythm" : "pitched";
  const timeSig = readMeter(raw.m);
  if (staff === "pitched") {
    check(typeof raw.k === "string" && raw.k in keySignatures);
    check(typeof raw.c === "string" && UNISON_CLEFS.has(raw.c));
  } else {
    check(raw.k === undefined && raw.c === undefined);
  }
  check(raw.np === undefined || isInt(raw.np, 1, 8));
  check(Array.isArray(raw.pt) && raw.pt.length >= 1 && raw.pt.length <= 8);

  const parts: Record<string, unknown> = {};
  for (const entry of raw.pt as unknown[]) {
    check(Array.isArray(entry) && entry.length === 3);
    const [partKey, smallName, notes] = entry as unknown[];
    check(isPartName(partKey) && isSmallName(smallName) && !(partKey in parts));
    check(Array.isArray(notes) && notes.length >= 1 && notes.length <= 2000);
    const chordNoteObject = (notes as unknown[]).map((note) => readUnisonNote(note, partKey as string));
    const total = chordNoteObject.reduce((sum, note) => sum + note.noteLength, 0);
    check(total <= 64 * timeSig.tsPerMeasure);
    parts[partKey as string] = { order: 0, smallName, chordNoteObject };
  }

  return {
    staff,
    partsObject: {
      ...(raw.np === undefined ? {} : { numofParts: raw.np }),
      parts,
    } as unknown as UnisonScore["partsObject"],
    timeSig,
    ...(staff === "pitched" ? { key: raw.k as string, clef: raw.c as string } : {}),
  };
}

function readUnisonNote(raw: unknown, partName: string) {
  check(Array.isArray(raw) && raw.length >= 2 && raw.length <= 7);
  const [name, noteLength, degree = 0, pitchValue = 0, rhythmName = 0, flags = 0, patternIndex = 0] = raw as unknown[];
  check(typeof name === "string" && isNoteName(name));
  check(isInt(noteLength, 1, 128) && isInt(degree, 0, 11) && isInt(pitchValue, 0, 96));
  check(rhythmName === 0 || (typeof rhythmName === "string" && /^[A-Za-z0-9]{0,40}$/.test(rhythmName)));
  check(isInt(flags, 0, 3) && isInt(patternIndex, 0, 32));
  const rhythm =
    rhythmName === 0
      ? null
      : {
          ...(rhythmName ? { name: rhythmName } : {}),
          rest: ((flags as number) & 1) === 1,
          ...(((flags as number) & 2) === 2 ? { pattern: true } : {}),
        };
  return {
    partName,
    noteLength: noteLength as number,
    name,
    degree,
    pitchValue,
    chord: null,
    rhythm,
    isPatternStart: false,
    isPatternEnd: false,
    patternIndex: patternIndex === 0 ? null : patternIndex,
  };
}

// ── Shared checks ───────────────────────────────────────────────────────────

class InvalidPayload extends Error {}

function check(condition: unknown): asserts condition {
  if (!condition) throw new InvalidPayload();
}

function readMeter(raw: unknown): { name: string; tsPerMeasure: number; beamGroupSize?: number } {
  check(Array.isArray(raw) && (raw.length === 2 || raw.length === 3));
  const [name, tsPerMeasure, beamGroupSize] = raw as unknown[];
  check(typeof name === "string" && /^\d{1,2}\/\d{1,2}$/.test(name));
  check(isInt(tsPerMeasure, 1, 128));
  check(beamGroupSize === undefined || isInt(beamGroupSize, 1, 64));
  return beamGroupSize === undefined
    ? { name, tsPerMeasure: tsPerMeasure as number }
    : { name, tsPerMeasure: tsPerMeasure as number, beamGroupSize: beamGroupSize as number };
}

const isObject = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isPartName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9 ]{1,24}$/.test(v);
const isSmallName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9]{1,4}$/.test(v);
const isNoteName = (v: string) => /^(\^\^?|__?|=)?[A-Ga-g][,']*$/.test(v);
/** A T: or C: line: nothing that ends the line, starts a comment or needs escaping. */
const isHeaderText = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9 #\-.,'()]{0,60}$/.test(v);

/** Drop trailing entries that equal their default (0), so short notes stay short. */
function trimmed(values: unknown[]): unknown[] {
  let end = values.length;
  while (end > 2 && values[end - 1] === 0) end--;
  return values.slice(0, end);
}

// ── Bytes ───────────────────────────────────────────────────────────────────

function canCompress(): boolean {
  try {
    new CompressionStream("deflate-raw");
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Inflate, stopping at the size cap so a hostile link cannot balloon. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
