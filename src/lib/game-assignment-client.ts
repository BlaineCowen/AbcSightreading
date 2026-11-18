/**
 * A game page's side of game assignments (game-assignments.ts): the one the
 * address names (?ga=), and reporting a round. Ear games report through
 * /api/games/finish instead, where the round is marked.
 */
import { GAME_ASSIGNMENT_PARAM, type GameGoal, type GameId, type GameProgress } from "./game-assignments";

export type OpenGameAssignment = {
  id: string;
  game: GameId;
  title: string;
  setup: Record<string, unknown>;
  goal: GameGoal;
  goalText: string;
  note: string;
  dueAt: number | null;
  role: "teacher" | "student";
  progress: GameProgress;
};

/** The assignment this page was opened for, if it is this game's. */
export async function loadGameAssignment(game: GameId): Promise<OpenGameAssignment | null> {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(location.search).get(GAME_ASSIGNMENT_PARAM);
  if (!id) return null;
  try {
    const res = await fetch(`/api/game-assignments/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const a = (await res.json()) as OpenGameAssignment;
    return a.game === game ? a : null;
  } catch {
    return null;
  }
}

/** A round of Note Rain, the rhythm game or Catch the tune: its score, as this device saw it. */
export async function reportGameRound(a: OpenGameAssignment, score: number): Promise<GameProgress | null> {
  if (a.role !== "student") return null;
  try {
    const res = await fetch(`/api/game-assignments/${encodeURIComponent(a.id)}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: a.game, score }),
    });
    if (!res.ok) return null;
    return (await res.json()).progress as GameProgress;
  } catch {
    return null;
  }
}
