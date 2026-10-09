import type { PieceScore } from "./model";

/**
 * Assigning bars of one part of a piece to a class: what may be assigned,
 * checked the same on the page (to say why before anyone presses Assign) and
 * on the server (to refuse it). Graded attempts read the same settings.
 *
 * A part can be assigned when, over the chosen bars, it is one line: no
 * chords and no second voice sounding at once, since one microphone hears
 * one note at a time. The bars keep one meter, which grading counts beats in.
 */

export const MAX_ATTEMPTS = 20;
export const STRICTNESS = ["easy", "standard", "strict"] as const;
export type Strictness = (typeof STRICTNESS)[number];

export type PieceAssignment = {
  pieceId: string;
  /** The part sung or played, by its id in the score. */
  partId: string;
  /** Bar indexes into the score, inclusive. */
  from: number;
  to: number;
  /** Parts that play along. */
  accompaniment: string[];
  /** Quarter notes a minute. */
  tempo: number;
  /** null: as many as they like. */
  maxAttempts: number | null;
  strictness: Strictness;
};

/** Why this part cannot be assigned over these bars, or null if it can. */
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

/** Parts that could be assigned somewhere: one line over at least part of the piece. */
export function singleLineParts(score: PieceScore): string[] {
  return score.parts.filter((p) => hasLine(score, p.id)).map((p) => p.id);
}

function hasLine(score: PieceScore, partId: string): boolean {
  for (let m = 0; m < score.measures.length; m++) if (!partProblem(score, partId, m, m)) return true;
  return false;
}

/** "Soprano, bars 9 to 16". */
export function excerptLabel(score: PieceScore, a: Pick<PieceAssignment, "partId" | "from" | "to">): string {
  const part = score.parts.find((p) => p.id === a.partId)?.name ?? "Part";
  const from = score.measures[a.from]?.label ?? String(a.from + 1);
  const to = score.measures[a.to]?.label ?? String(a.to + 1);
  return from === to ? `${part}, bar ${from}` : `${part}, bars ${from} to ${to}`;
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** The piece half of an assignment request, checked against the score. */
export function checkPieceAssignment(body: unknown, pieceId: string, score: PieceScore): Checked<PieceAssignment> {
  if (!body || typeof body !== "object") return { ok: false, error: "Choose the part and bars." };
  const b = body as Record<string, unknown>;
  const partId = typeof b.partId === "string" ? b.partId : "";
  const from = Number(b.from);
  const to = Number(b.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return { ok: false, error: "Choose the bars." };
  const problem = partProblem(score, partId, from, to);
  if (problem) return { ok: false, error: problem };
  const ids = new Set(score.parts.map((p) => p.id));
  const accompaniment = Array.isArray(b.accompaniment)
    ? [...new Set(b.accompaniment.filter((x): x is string => typeof x === "string" && ids.has(x) && x !== partId))]
    : [];
  const tempo = Number(b.tempo);
  if (!Number.isFinite(tempo) || tempo < 30 || tempo > 240) return { ok: false, error: "Tempo: 30 to 240." };
  let maxAttempts: number | null = null;
  if (b.maxAttempts !== null && b.maxAttempts !== undefined && b.maxAttempts !== "") {
    const n = Number(b.maxAttempts);
    if (!Number.isInteger(n) || n < 1 || n > MAX_ATTEMPTS) return { ok: false, error: `Attempts: 1 to ${MAX_ATTEMPTS}, or as many as they like.` };
    maxAttempts = n;
  }
  const strictness = STRICTNESS.includes(b.strictness as Strictness) ? (b.strictness as Strictness) : "standard";
  return { ok: true, value: { pieceId, partId, from, to, accompaniment, tempo: Math.round(tempo), maxAttempts, strictness } };
}

/** An assignment's stored piece settings, read back; null if they are not readable. */
export function pieceAssignmentOf(params: unknown): PieceAssignment | null {
  if (!params || typeof params !== "object") return null;
  const p = params as Record<string, unknown>;
  if (typeof p.pieceId !== "string" || typeof p.partId !== "string") return null;
  if (!Number.isInteger(p.from) || !Number.isInteger(p.to) || !Array.isArray(p.accompaniment)) return null;
  return {
    pieceId: p.pieceId,
    partId: p.partId,
    from: p.from as number,
    to: p.to as number,
    accompaniment: (p.accompaniment as unknown[]).filter((x): x is string => typeof x === "string"),
    tempo: typeof p.tempo === "number" ? p.tempo : 100,
    maxAttempts: typeof p.maxAttempts === "number" ? p.maxAttempts : null,
    strictness: STRICTNESS.includes(p.strictness as Strictness) ? (p.strictness as Strictness) : "standard",
  };
}
