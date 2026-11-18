/**
 * Games given to a class with their setup fixed (Blaine, 18 November 2026:
 * "let teachers assign a custom version of a game to students, e.g. an
 * Assign to Classes button"). The teacher sets a game up as they like (a
 * level or Customize), presses Assign to classes, and says what counts as
 * done: so many rounds at or above a score. Students find it with their
 * assignments and play it with that setup, locked.
 *
 * Its own table (GameAssignment), not Assignment: main's practice pages send
 * an assignment with a page they don't know to Choral, which redirects to
 * itself, and every site shares one database.
 *
 * Shared by the browser and the server; the server checks every setup with
 * the game's own check before it is stored.
 */
import { checkIntervalSetup, checkSolfegeSetup, INTERVAL_LEVELS, SOLFEGE_LEVELS, QUIZ_LENGTH } from "./games/ear-quiz";
import { checkRainSetup, RAIN_LEVELS } from "./games/note-rain";

export const ASSIGNABLE_GAMES = ["solfege", "interval", "note-rain", "rhythm", "tune"] as const;
export type GameId = (typeof ASSIGNABLE_GAMES)[number];
export const isGameId = (v: unknown): v is GameId => typeof v === "string" && (ASSIGNABLE_GAMES as readonly string[]).includes(v);

export const GAME_PATH: Record<GameId, string> = {
  solfege: "/games/solfege",
  interval: "/games/intervals",
  "note-rain": "/games/note-rain",
  rhythm: "/games/rhythm",
  tune: "/games/catch-the-tune",
};
export const GAME_NAME: Record<GameId, string> = {
  solfege: "Solfège ear training",
  interval: "Interval ear training",
  "note-rain": "Note Rain",
  rhythm: "Tap the rhythm",
  tune: "Catch the tune",
};
/** The games only an owner sees on the live site for now (earGamesShown): their assignments are hidden there too. */
export const DEV_ONLY_GAMES: GameId[] = ["solfege", "interval", "note-rain"];

/** The query parameter a game page reads to open an assignment. */
export const GAME_ASSIGNMENT_PARAM = "ga";
export const gameAssignmentHref = (a: { id: string; game: string }) =>
  `${isGameId(a.game) ? GAME_PATH[a.game] : "/games"}?${GAME_ASSIGNMENT_PARAM}=${encodeURIComponent(a.id)}`;

/** A round's score on each game's own scale, for the goal. */
export const SCORE_SCALE: Record<GameId, { unit: string; max: number; usual: number }> = {
  solfege: { unit: `right of ${QUIZ_LENGTH}`, max: QUIZ_LENGTH, usual: 8 },
  interval: { unit: `right of ${QUIZ_LENGTH}`, max: QUIZ_LENGTH, usual: 8 },
  "note-rain": { unit: "notes named", max: 300, usual: 25 },
  rhythm: { unit: "%", max: 100, usual: 80 },
  tune: { unit: "stars", max: 3, usual: 2 },
};

/** What counts as done: `rounds` rounds scoring `score` or more. */
export type GameGoal = { rounds: number; score: number };
export function checkGoal(game: GameId, v: unknown): GameGoal {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const int = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
  const scale = SCORE_SCALE[game];
  return { rounds: int(o.rounds, 1, 20, 1), score: int(o.score, 1, scale.max, scale.usual) };
}

/** Rhythm and Catch the tune keep their setups in their own components: plain, bounded objects. */
function checkPlain(v: unknown, keys: Record<string, "string" | "number" | "boolean" | "array" | "object">) {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(keys)) {
    const x = o[k];
    if (t === "array" ? Array.isArray(x) && x.length <= 40 : t === "object" ? x && typeof x === "object" && !Array.isArray(x) : typeof x === t) out[k] = x;
  }
  // Small, or nothing: a setup is a few choices, never a document.
  return JSON.stringify(out).length <= 4000 ? out : {};
}

/** A setup as stored and played: the game's own check. */
export function checkGameSetup(game: GameId, v: unknown): Record<string, unknown> {
  switch (game) {
    case "solfege": return checkSolfegeSetup(v);
    case "interval": return checkIntervalSetup(v);
    case "note-rain": return checkRainSetup(v);
    case "rhythm": return checkPlain(v, { levelId: "string", levelName: "string", bars: "number", bpm: "number", strictness: "string", own: "object" });
    case "tune": return checkPlain(v, { level: "number", levelName: "string", custom: "object", gap: "number" });
  }
}

/** A title for the student's list, from the setup. */
export function gameTitle(game: GameId, setup: Record<string, unknown>): string {
  const lvl = (n: unknown, names: string[]) => (typeof n === "number" && n > 0 && names[n - 1] ? `Level ${n}, ${names[n - 1]}` : "Custom");
  switch (game) {
    case "solfege": {
      const s = checkSolfegeSetup(setup);
      return `Solfège: ${lvl(s.level, SOLFEGE_LEVELS[s.tonality].map((l) => l.name))}${s.tonality === "minor" ? " (minor)" : ""}${s.key ? `, in ${s.key.replace("b", "♭")}` : ""}`;
    }
    case "interval": {
      const s = checkIntervalSetup(setup);
      return `Intervals: ${lvl(s.level, INTERVAL_LEVELS.map((l) => l.name))}${s.sameKey ? ", one key" : ""}`;
    }
    case "note-rain": {
      const s = checkRainSetup(setup);
      return `Note Rain: ${lvl(s.level, RAIN_LEVELS.map((l) => l.name))}, ${s.clef}, ${s.speed}`;
    }
    case "rhythm": return `Tap the rhythm${typeof setup.levelName === "string" ? `: ${setup.levelName}` : ""}`;
    case "tune": return `Catch the tune${typeof setup.levelName === "string" ? `: ${setup.levelName}` : ""}`;
  }
}

export type GameProgress = { rounds: number; passed: number; best: number | null; status: "not-started" | "in-progress" | "done" };
/** A student's rounds on an assignment against its goal. */
export function gameProgress(goal: GameGoal, scores: number[]): GameProgress {
  const passed = scores.filter((s) => s >= goal.score).length;
  return {
    rounds: scores.length,
    passed,
    best: scores.length ? Math.max(...scores) : null,
    status: passed >= goal.rounds ? "done" : scores.length ? "in-progress" : "not-started",
  };
}
export const goalText = (game: GameId, g: GameGoal) =>
  `${g.rounds === 1 ? "A round" : `${g.rounds} rounds`} of ${g.score}${SCORE_SCALE[game].unit === "%" ? "%" : ` ${SCORE_SCALE[game].unit}`} or more`;
