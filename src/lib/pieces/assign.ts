import type { PieceScore } from "./model";

/**
 * Assigning bars of a piece to a class: what may be assigned, checked the
 * same on the page (to say why before anyone presses Assign) and on the
 * server (to refuse it). Graded attempts read the same settings.
 *
 * The teacher chooses the bars and what students hear; each student chooses
 * their own part (Blaine: a choir's sections take one assignment). A part
 * can be a student's when, over those bars, it is one line: no chords and no
 * second voice sounding at once, since one microphone hears one note at a
 * time. The bars keep one meter, which grading counts beats in.
 */

export const MAX_ATTEMPTS = 20;
export const STRICTNESS = ["easy", "standard", "strict"] as const;
export type Strictness = (typeof STRICTNESS)[number];

/**
 * What a student hears with their part:
 *   others     every other part, their own silent
 *   quiet      every part, their own quietly to lean on
 *   selected   only the parts the teacher chose (a piano), their own silent
 *   acappella  nothing but a click; the starting note and any note on a tap
 */
export const HEARING = ["others", "quiet", "selected", "acappella"] as const;
export type Hearing = (typeof HEARING)[number];

export const HEARING_LABEL: Record<Hearing, { title: string; detail: string }> = {
  others: { title: "The other parts", detail: "Everyone else plays; their own part is silent." },
  quiet: { title: "Their part quietly", detail: "Every part plays, theirs softly underneath to lean on." },
  selected: { title: "Only what you choose", detail: "Just the parts you pick play along, like the piano." },
  acappella: { title: "A cappella", detail: "Nothing plays but a click. They can hear the starting note, or tap any note to hear it." },
};

/** How loud a student's own part is in `quiet`, against its usual level. */
export const QUIET_LEVEL = 0.3;

export type PieceAssignment = {
  pieceId: string;
  /** Bar indexes into the score, inclusive: what is graded. */
  from: number;
  to: number;
  /** Where playback starts, at or before `from`: bars that lead in, heard and not graded. */
  leadIn: number;
  hearing: Hearing;
  /** The parts that play in `selected`. */
  playing: string[];
  /** Quarter notes a minute. */
  tempo: number;
  /** null: as many as they like. */
  maxAttempts: number | null;
  strictness: Strictness;
};

/** Why this part cannot be a student's over these bars, or null if it can. */
export function partProblem(score: PieceScore, partId: string, from: number, to: number): string | null {
  const part = score.parts.find((p) => p.id === partId);
  if (!part) return "Choose a part.";
  if (from < 0 || to >= score.measures.length || from > to) return "Choose the bars.";
  const notes = part.notes.filter((n) => !n.rest && n.measure >= from && n.measure <= to);
  if (notes.length === 0) return `${part.name} has no notes in these bars.`;
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].start + sorted[i - 1].length) {
      return `${part.name} plays more than one note at a time in bar ${score.measures[sorted[i].measure].label}. Choose a part with one line, or other bars.`;
    }
  }
  const first = score.measures[from].time;
  for (let m = from + 1; m <= to; m++) {
    const t = score.measures[m].time;
    if (t.beats !== first.beats || t.beatType !== first.beatType) {
      return `The meter changes in bar ${score.measures[m].label}. Choose bars in one meter.`;
    }
  }
  return null;
}

/** The parts a student may choose over these bars. */
export function partsFor(score: PieceScore, from: number, to: number): string[] {
  return score.parts.filter((p) => !partProblem(score, p.id, from, to)).map((p) => p.id);
}

/** Why these bars cannot be assigned, or null: one meter, and at least one part a student can take. */
export function barsProblem(score: PieceScore, from: number, to: number, leadIn = from): string | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= score.measures.length || from > to) return "Choose the bars.";
  if (!Number.isInteger(leadIn) || leadIn < 0 || leadIn > from) return "The lead-in starts at or before the graded bars.";
  const first = score.measures[leadIn].time;
  for (let m = leadIn + 1; m <= to; m++) {
    const t = score.measures[m].time;
    if (t.beats !== first.beats || t.beatType !== first.beatType) return `The meter changes in bar ${score.measures[m].label}. Choose bars in one meter.`;
  }
  if (partsFor(score, from, to).length === 0) {
    return "No part is a single line in these bars (each plays chords or two voices at once), so no one could be graded. Choose other bars.";
  }
  return null;
}

/** "bars 9 to 16". */
export function barsLabel(score: PieceScore, a: Pick<PieceAssignment, "from" | "to">): string {
  const from = score.measures[a.from]?.label ?? String(a.from + 1);
  const to = score.measures[a.to]?.label ?? String(a.to + 1);
  return from === to ? `bar ${from}` : `bars ${from} to ${to}`;
}

/** Each part's level for a student singing `mine` (1 as the teacher set it, 0 silent). */
export function levelFor(a: Pick<PieceAssignment, "hearing" | "playing">, partId: string, mine: string | null): number {
  if (a.hearing === "acappella") return 0;
  if (partId === mine) return a.hearing === "quiet" ? QUIET_LEVEL : 0;
  if (a.hearing === "selected") return a.playing.includes(partId) ? 1 : 0;
  return 1;
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** The piece half of an assignment request, checked against the score. */
export function checkPieceAssignment(body: unknown, pieceId: string, score: PieceScore): Checked<PieceAssignment> {
  if (!body || typeof body !== "object") return { ok: false, error: "Choose the bars." };
  const b = body as Record<string, unknown>;
  const from = Number(b.from);
  const to = Number(b.to);
  const leadIn = b.leadIn === undefined || b.leadIn === null || b.leadIn === "" ? from : Number(b.leadIn);
  const problem = barsProblem(score, from, to, leadIn);
  if (problem) return { ok: false, error: problem };
  const hearing = HEARING.includes(b.hearing as Hearing) ? (b.hearing as Hearing) : "others";
  const ids = new Set(score.parts.map((p) => p.id));
  const playing = Array.isArray(b.playing) ? [...new Set(b.playing.filter((x): x is string => typeof x === "string" && ids.has(x)))] : [];
  if (hearing === "selected" && playing.length === 0) return { ok: false, error: "Choose the parts that play along." };
  const tempo = Number(b.tempo);
  if (!Number.isFinite(tempo) || tempo < 30 || tempo > 240) return { ok: false, error: "Tempo: 30 to 240." };
  let maxAttempts: number | null = null;
  if (b.maxAttempts !== null && b.maxAttempts !== undefined && b.maxAttempts !== "") {
    const n = Number(b.maxAttempts);
    if (!Number.isInteger(n) || n < 1 || n > MAX_ATTEMPTS) return { ok: false, error: `Attempts: 1 to ${MAX_ATTEMPTS}, or as many as they like.` };
    maxAttempts = n;
  }
  const strictness = STRICTNESS.includes(b.strictness as Strictness) ? (b.strictness as Strictness) : "standard";
  return {
    ok: true,
    value: { pieceId, from, to, leadIn, hearing, playing: hearing === "selected" ? playing : [], tempo: Math.round(tempo), maxAttempts, strictness },
  };
}

/** An assignment's stored piece settings, read back; null if they are not readable. */
export function pieceAssignmentOf(params: unknown): PieceAssignment | null {
  if (!params || typeof params !== "object") return null;
  const p = params as Record<string, unknown>;
  if (typeof p.pieceId !== "string") return null;
  if (!Number.isInteger(p.from) || !Number.isInteger(p.to)) return null;
  // The first piece assignments (9 October 2026, dev only) named a part and its accompaniment.
  const legacy = Array.isArray(p.accompaniment) && !p.hearing;
  return {
    pieceId: p.pieceId,
    from: p.from as number,
    to: p.to as number,
    leadIn: Number.isInteger(p.leadIn) && (p.leadIn as number) <= (p.from as number) ? (p.leadIn as number) : (p.from as number),
    hearing: legacy ? "selected" : HEARING.includes(p.hearing as Hearing) ? (p.hearing as Hearing) : "others",
    playing: ((legacy ? p.accompaniment : p.playing) as unknown[] | undefined ?? []).filter((x): x is string => typeof x === "string"),
    tempo: typeof p.tempo === "number" ? p.tempo : 100,
    maxAttempts: typeof p.maxAttempts === "number" ? p.maxAttempts : null,
    strictness: STRICTNESS.includes(p.strictness as Strictness) ? (p.strictness as Strictness) : "standard",
  };
}
