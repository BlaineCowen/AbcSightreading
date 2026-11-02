import { nameKey } from "./game-names";
import { addRound, dealTeams, joinTeam } from "./game-score";
import type { BoardRow, LiveGame, Team } from "./live-game";

/**
 * What the big screen does to the game between rounds, the same in both
 * games (Games, 2 November 2026): names the teacher removed, teams, and the
 * board. Pure, so it is tested (tests/unit/games-live.test.ts).
 */

export type Scored = { tag: string; name: string; fallback: string; points: number };

/**
 * A round's scores onto the board: a removed name shows as the device's
 * made-up one, and in Teams mode a player not on a team yet joins the
 * smallest. Returns the board and the teams.
 */
export function afterRound(game: LiveGame, board: BoardRow[], scored: Scored[]): { board: BoardRow[]; teams?: Team[] } {
  const blocked = new Set(game.blocked ?? []);
  let teams = game.teams?.length ? game.teams : undefined;
  const rows = scored.map((s) => {
    const name = blocked.has(nameKey(s.name)) ? s.fallback : s.name;
    let team: string | undefined;
    if (teams) {
      const joined = joinTeam(teams, name);
      teams = joined.teams;
      team = joined.team.id;
    }
    return { tag: s.tag, name, points: s.points, team };
  });
  return { board: addRound(board, rows), teams };
}

/**
 * The teacher removes a name: blocked from now on (the device goes back to
 * its made-up name), and wherever it already shows - the board and the teams
 * - it becomes that device's made-up name (`fallbacks`, by tag, from the
 * answers), or "A player" for one not seen yet.
 */
export function blockName(game: LiveGame, board: BoardRow[], name: string, fallbacks: Map<string, string>) {
  const key = nameKey(name);
  const renamed = new Map<string, string>();
  const nextBoard = board.map((r) => {
    if (nameKey(r.name) !== key) return r;
    const to = fallbacks.get(r.tag) ?? "A player";
    renamed.set(r.name, to);
    return { ...r, name: to };
  });
  const teams = game.teams?.map((t) => ({ ...t, members: t.members.map((m) => (nameKey(m) === key ? renamed.get(m) ?? m : m)) }));
  return { blocked: [...new Set([...(game.blocked ?? []), key])], board: nextBoard, teams };
}

/** The first round of a game: the teams dealt from everyone here, in Teams mode. */
export function teamsForStart(game: LiveGame | null, players: string[], teamCount: number): Team[] | undefined {
  if (game?.teams?.length) return game.teams;
  if (!teamCount) return undefined;
  const blocked = new Set(game?.blocked ?? []);
  return dealTeams(players.filter((p) => !blocked.has(nameKey(p))), teamCount);
}
