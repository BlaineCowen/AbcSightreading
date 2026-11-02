import { gradeClaps, type ClapResult } from "../grade-rhythm";
import type { GradeNote, GradeRest, Strictness } from "../grade";
import { countInLag, LAG_MAX_MS } from "./game-lag";
import { FORGIVE_MAX_MS } from "../grade-rhythm";
import { TEAM_NAMES, rhythmTimes, type BoardRow, type RhythmRound, type Team } from "./live-game";

/**
 * A round's points in the games (Games, 2 November 2026): a rhythm by the
 * Clap and grade rules (beat by beat, grade-rhythm.ts), a tune by its notes.
 * Pure, so the host's scoring and the tests share it.
 */

export type RhythmScore = {
  points: number;
  result: ClapResult;
  /** The lag taken off, ms, and where it came from. */
  lag: number;
  lagFrom: "count-in" | "room" | "steady" | "device";
};

/**
 * One student's rhythm round. `taps` are on the server clock, count-in
 * included. Their own count-in lag is taken off when they tapped it, else the
 * room's (`roomLagMs`), else the device's own measured delay (solo play's
 * Check timing), else a steady lateness is forgiven as an unchecked Clap and
 * grade forgives it (up to FORGIVE_MAX_MS).
 */
export function scoreRhythm(o: {
  round: RhythmRound;
  schedule: { notes: GradeNote[]; rests: GradeRest[] };
  beatUnits: number;
  taps: number[];
  strictness: Strictness;
  roomLagMs?: number | null;
  deviceLagMs?: number | null;
}): RhythmScore {
  const t = rhythmTimes(o.round);
  const own = countInLag(o.taps, t.tapClicks, t.beatMs);
  const known = own.lag ?? o.roomLagMs ?? o.deviceLagMs ?? null;
  const lagFrom: RhythmScore["lagFrom"] = own.lag !== null ? "count-in" : o.roomLagMs != null ? "room" : o.deviceLagMs != null ? "device" : "steady";
  // Not graded: the count-in's taps, and anything before the music that the
  // count-in did not take (bar 1 tapped along, a tap early on the downbeat
  // stays: it is the first note's).
  const graded = o.taps.filter((x) => !own.used.has(x) && x - (known ?? 0) > t.musicAt - t.beatMs / 2);
  const result = gradeClaps(o.schedule, graded.map((x) => ({ t: x, level: 1 })), {
    t0: t.musicAt,
    bpm: o.round.bpm,
    beatUnits: o.beatUnits,
    strictness: o.strictness,
    who: "solo",
    latencyMs: known ?? 0,
    forgiveLag: known === null,
  });
  const lag = known ?? Math.min(FORGIVE_MAX_MS, Math.max(0, result.lagMs));
  return { points: result.rhythm, result, lag: Math.min(LAG_MAX_MS, lag), lagFrom };
}

export type TuneScore = { points: number; right: number; total: number; marks: boolean[] };

/** Speed counts for at most this much more than all right, when every note is right. */
export const TUNE_SPEED_BONUS = 20;

/**
 * One student's tune: each note after the given first one is right or not;
 * all right and quick earns up to TUNE_SPEED_BONUS more, full when answered
 * at once and none at the deadline.
 */
export function scoreTune(answer: number[], tune: number[], ms: number, limitMs: number): TuneScore {
  const marks = tune.map((s, i) => i === 0 || answer[i] === s);
  const total = Math.max(1, tune.length - 1);
  const right = marks.slice(1).filter(Boolean).length;
  let points = Math.round((100 * right) / total);
  if (right === total && limitMs > 0) points += Math.round(TUNE_SPEED_BONUS * Math.max(0, 1 - ms / limitMs));
  return { points, right, total, marks };
}

/** The board after a round: everyone's total, best first; ties keep the earlier order. A player is their tag (game-names.ts playerTag). */
export function addRound(board: BoardRow[], round: { tag: string; name: string; points: number; team?: string }[]): BoardRow[] {
  const rows = new Map(board.map((r) => [r.tag, { ...r, last: 0 }]));
  for (const r of round) {
    const row: BoardRow = rows.get(r.tag) ?? { tag: r.tag, name: r.name, points: 0, last: 0 };
    row.name = r.name;
    if (r.team) row.team = r.team;
    row.points += r.points;
    row.last = r.points;
    rows.set(r.tag, row);
  }
  return [...rows.values()].sort((a, b) => b.points - a.points);
}

/** Each note's share of the room right, for the reveal (the first note is given, so it is always right). */
export function shareRight(answers: number[][], tune: number[]): number[] {
  return tune.map((s, i) => (i === 0 || answers.length === 0 ? 1 : answers.filter((a) => a[i] === s).length / answers.length));
}

// ── Teams ─────────────────────────────────────────────────────────────────

/**
 * Teams mode (Blaine, 2 November 2026): everyone in the room when the first
 * round starts is dealt at random into `count` teams, as evenly as can be;
 * anyone who joins later goes to the smallest (`joinTeam`).
 */
export function dealTeams(names: string[], count: number, rand = Math.random): Team[] {
  const n = Math.max(2, Math.min(TEAM_NAMES.length, Math.round(count)));
  const shuffled = [...new Set(names)];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const teams: Team[] = TEAM_NAMES.slice(0, n).map((name) => ({ id: name.toLowerCase(), name, members: [] }));
  shuffled.forEach((name, i) => teams[i % n].members.push(name));
  return teams;
}

/** The team a player is on, by name. */
export const teamOf = (teams: Team[] | undefined, name: string) => teams?.find((t) => t.members.includes(name));

/** A player not on a team yet joins the smallest one. Returns the teams (new arrays) and theirs. */
export function joinTeam(teams: Team[], name: string): { teams: Team[]; team: Team } {
  const found = teamOf(teams, name);
  if (found) return { teams, team: found };
  const smallest = teams.reduce((a, b) => (b.members.length < a.members.length ? b : a));
  const next = teams.map((t) => (t.id === smallest.id ? { ...t, members: [...t.members, name] } : t));
  return { teams: next, team: next.find((t) => t.id === smallest.id)! };
}

/**
 * The teams' standing: each team's points per player who has scored (so a
 * bigger team does not win by size), best first.
 */
export function teamStandings(board: BoardRow[], teams: Team[]) {
  return teams
    .map((t) => {
      const rows = board.filter((r) => r.team === t.id);
      const total = rows.reduce((s, r) => s + r.points, 0);
      return { ...t, players: rows.length, total, average: rows.length ? Math.round(total / rows.length) : 0 };
    })
    .sort((a, b) => b.average - a.average);
}
