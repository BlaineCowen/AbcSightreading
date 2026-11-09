/**
 * Sight-reading portfolios (9 November 2026, Blaine: districts that pay
 * Teacher Incentive Allotment bonuses need a student growth measure for
 * fine arts teachers, and TEA recommends portfolios for performance classes:
 * standards-aligned work, more than one artifact, a skills rubric of at
 * least four levels with criteria for scoring, 19 TAC §150.1012).
 *
 * A checkpoint is a sight-reading assignment on the Unison page marked for
 * the portfolio: beginning, middle or end of year, a few tries, each try a
 * new exercise at the level (no student sees another's), graded by Grade and
 * recorded. Its recordings are kept through the school year
 * (`keepUntil`), not the 90 days of an ordinary attempt. The teacher scores
 * each student's checkpoint on RUBRIC; the portfolio is every checkpoint in
 * order, with the change from the first to the last. Tests portfolio.test.ts.
 */

/**
 * Held back from the live site (Blaine, 9 November 2026: "hold off on
 * portfolio stuff"): the checkpoint option and the class's Portfolio show on
 * dev and local servers only. The server side stays, unused until then.
 * Delete this, and its two uses, to put it live.
 */
export const portfolioShown = () => typeof location === "undefined" || !/^(www\.)?abc-sightreading\.com$/.test(location.hostname);

export const STAGES = { boy: "Beginning of year", moy: "Middle of year", eoy: "End of year", other: "Checkpoint" } as const;
export type Stage = keyof typeof STAGES;
export const MAX_TRIES = 3;

export type Checkpoint = { stage: Stage; tries: number };

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A checkpoint as the assignment form sends it, or none. */
export function checkCheckpoint(v: unknown): Checked<Checkpoint | null> {
  if (v === undefined || v === null || v === false) return { ok: true, value: null };
  const c = (typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (typeof c.stage !== "string" || !Object.hasOwn(STAGES, c.stage)) return { ok: false, error: "Which checkpoint is it: beginning, middle or end of year?" };
  const tries = Number(c.tries);
  if (!Number.isInteger(tries) || tries < 1 || tries > MAX_TRIES) return { ok: false, error: `Tries: 1 to ${MAX_TRIES}.` };
  return { ok: true, value: { stage: c.stage as Stage, tries } };
}

/** The checkpoint an assignment's params carry, or null. */
export function checkpointOf(params: unknown): Checkpoint | null {
  if (!params || typeof params !== "object") return null;
  const c = checkCheckpoint((params as Record<string, unknown>).checkpoint);
  return c.ok ? c.value : null;
}

/**
 * How long a checkpoint's recordings are kept: to 30 September after the
 * school year it was made in (a school year runs August to July), so the
 * end-of-year scores can be checked when districts report in the fall.
 */
export function keepUntil(now = new Date()): Date {
  const y = now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return new Date(Date.UTC(y, 8, 30, 23, 59, 59));
}

/** The skills rubric: four levels, each with what the teacher listens for. */
export const RUBRIC = [
  { level: 1, name: "Beginning", criteria: "No steady beat. Few pitches or rhythms correct. Stops and cannot go on." },
  { level: 2, name: "Developing", criteria: "The beat wavers. About half the pitches and rhythms correct. Several stops." },
  { level: 3, name: "Proficient", criteria: "A steady beat. Most pitches and rhythms correct. A few hesitations, and recovers." },
  { level: 4, name: "Advanced", criteria: "A steady beat throughout. Nearly every pitch and rhythm correct. Keeps going through mistakes." },
] as const;
export type Level = 1 | 2 | 3 | 4;
export const isLevel = (v: unknown): v is Level => v === 1 || v === 2 || v === 3 || v === 4;

/** The level the automatic score points to, for the teacher to confirm or change. */
export function suggestedLevel(overall: number | null): Level | null {
  if (overall === null || !Number.isFinite(overall)) return null;
  return overall >= 90 ? 4 : overall >= 75 ? 3 : overall >= 50 ? 2 : 1;
}

export type PortfolioTry = { id: string; overall: number | null; rubric: number | null; hasTake: boolean; at: number };

/**
 * A student's result at a checkpoint: their best graded try, and the rubric
 * level the teacher gave (on any try; the latest given counts).
 */
export function resultOf(tries: PortfolioTry[]): { best: PortfolioTry | null; rubric: Level | null; tries: number } {
  const graded = tries.filter((t) => t.overall !== null);
  const best = graded.reduce<PortfolioTry | null>((b, t) => (!b || (t.overall ?? 0) > (b.overall ?? 0) ? t : b), null);
  const scored = [...tries].filter((t) => isLevel(t.rubric)).sort((a, b) => a.at - b.at).at(-1);
  return { best, rubric: (scored?.rubric as Level | undefined) ?? null, tries: tries.length };
}

/** The change from the first checkpoint with a value to the last, or null with fewer than two. */
export function growthOf(values: (number | null)[]): number | null {
  const got = values.filter((v): v is number => v !== null);
  return got.length >= 2 ? got[got.length - 1] - got[0] : null;
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export type PortfolioColumn = { title: string; stage: Stage; createdAt: number };
export type PortfolioRow = { name: string; username: string | null; cells: { score: number | null; rubric: number | null; at: number | null }[] };

/**
 * The portfolio as a spreadsheet: a row a student; for each checkpoint, in
 * order, the date sung, the score and the rubric level; then the change in
 * each from the first to the last. Blank is not done, never a zero.
 */
export function portfolioCsv(columns: PortfolioColumn[], rows: PortfolioRow[]): string {
  const day = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));
  const head = ["Student", "Username"];
  for (const c of columns) head.push(`${STAGES[c.stage]}: ${c.title} (date)`, `${STAGES[c.stage]}: score`, `${STAGES[c.stage]}: rubric (1-4)`);
  head.push("Score change", "Rubric change");
  const lines: (string | number | null)[][] = [head];
  for (const r of rows) {
    const line: (string | number | null)[] = [r.name, r.username];
    for (const c of r.cells) line.push(day(c.at), c.score, c.rubric);
    line.push(growthOf(r.cells.map((c) => c.score)), growthOf(r.cells.map((c) => c.rubric)));
    lines.push(line);
  }
  return "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
