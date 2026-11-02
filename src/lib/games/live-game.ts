/**
 * A game played in a director's live room (Games, 2 November 2026): the big
 * screen hosts and every student's device on /live/<code> plays. These are
 * the rules for what the room holds and what a device sends, with nothing
 * that touches the database or the page, so all of it is unit-tested
 * (tests/unit/games-live.test.ts). The routes are src/pages/api/live/[code]/game*.
 *
 * The room's `game` is public: every device with the code is sent it. So a
 * Catch the tune round carries the tune's length, first note and rows, and
 * the tune itself only once the round is over (`publicGame` makes sure).
 */

export type GameKind = "rhythm" | "tune";
/** The lobby (players join), a round being played, its answers coming in, and the results. */
export type GamePhase = "lobby" | "playing" | "answering" | "results";

export type RhythmRound = {
  bpm: number;
  meter: string;
  beatsPerBar: number;
  bars: number;
  /** When the count-in starts, in server milliseconds ("1, 2, Ready, Go", tapped along with). */
  at: number;
  /**
   * In the results only: the rhythm and how it was scored, so each device
   * marks its own taps on it (game-score.ts scoreRhythm, the same as the big
   * screen): what a student missed shows on their own screen, and nothing
   * more is sent than the taps already were.
   */
  review?: { abc: string; strictness: "easy" | "standard" | "strict"; roomLag: number | null; beatUnits: number };
};

export type TuneRound = {
  /** The notes the grid has, low to high, as scale steps (tune-path.ts: do 0, re 1, low la -2...). */
  steps: number[];
  /** How many notes the tune has; the first is given. */
  length: number;
  first: number;
  /** When answers close, in server milliseconds; null while the tune is still being played. */
  answerBy: number | null;
  /** The tune, only in the results. */
  tune?: number[];
};

/** A player on the board: `tag` is playerTag(device), how a device finds its own row. */
export type BoardRow = { tag: string; name: string; points: number; last: number; team?: string };

/** A team (Teams mode): its name, and its players by name. */
export type Team = { id: string; name: string; members: string[] };
export const TEAM_NAMES = ["Mint", "Peach", "Butter", "Sky"] as const;

export type LiveGame = {
  kind: GameKind;
  /** Changes with each round, so an answer can say which round it is for. */
  round: string;
  /** Rounds played so far, this one included. */
  number: number;
  phase: GamePhase;
  rhythm?: RhythmRound;
  tune?: TuneRound;
  /** Everyone's points so far, best first: a device finds its own row by its tag. */
  board?: BoardRow[];
  /** How many rounds the game has; null or absent, it goes on until the teacher ends it. */
  total?: number | null;
  /** Names the teacher removed (nameKey): those devices go back to their made-up names. */
  blocked?: string[];
  /** Teams mode: the teams, dealt out when the first round starts. */
  teams?: Team[];
};

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const ints = (v: unknown, max: number, lo: number, hi: number): number[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => Number.isInteger(x) && x >= lo && x <= hi) ? (v as number[]) : null;

/** Steps a tune can use: low so to high mi (tune-path.ts). */
const STEP_LO = -7;
const STEP_HI = 10;
export const MAX_BOARD = 400;

/** The host's game as sent (PUT .../game), checked and cut down to what the room keeps. */
export function checkGame(body: unknown): Checked<LiveGame> {
  const b = body as Partial<LiveGame> | null;
  if (!b || (b.kind !== "rhythm" && b.kind !== "tune")) return { ok: false, error: "Not a game." };
  if (typeof b.round !== "string" || !/^[A-Za-z0-9-]{4,40}$/.test(b.round)) return { ok: false, error: "Not a round." };
  if (!["lobby", "playing", "answering", "results"].includes(b.phase as string)) return { ok: false, error: "Not a phase." };
  const game: LiveGame = { kind: b.kind, round: b.round, number: num(b.number, 0, 10_000) ?? 0, phase: b.phase as GamePhase };
  if (b.kind === "rhythm" && b.rhythm) {
    const r = b.rhythm;
    const bpm = num(r.bpm, 30, 240);
    const beatsPerBar = num(r.beatsPerBar, 1, 12);
    const bars = num(r.bars, 1, 16);
    const at = num(r.at, 0, 1e14);
    if (bpm === null || beatsPerBar === null || bars === null || at === null || typeof r.meter !== "string") return { ok: false, error: "Not a rhythm round." };
    game.rhythm = { bpm, meter: r.meter.slice(0, 8), beatsPerBar, bars, at };
  }
  if (b.kind === "tune" && b.tune) {
    const t = b.tune;
    const steps = ints(t.steps, 20, STEP_LO, STEP_HI);
    const length = num(t.length, 2, 16);
    const first = num(t.first, STEP_LO, STEP_HI);
    if (!steps || length === null || first === null) return { ok: false, error: "Not a tune round." };
    const answerBy = t.answerBy === null || t.answerBy === undefined ? null : num(t.answerBy, 0, 1e14);
    game.tune = { steps, length, first, answerBy };
    const tune = ints(t.tune, 16, STEP_LO, STEP_HI);
    if (tune && game.phase === "results") game.tune.tune = tune;
  }
  if (b.total !== undefined && b.total !== null) {
    const total = num(b.total, 1, 100);
    if (total !== null) game.total = Math.round(total);
  }
  if (Array.isArray(b.blocked)) game.blocked = b.blocked.filter((n): n is string => typeof n === "string").slice(0, 400).map((n) => n.slice(0, 32).toLowerCase());
  if (Array.isArray(b.teams)) {
    game.teams = b.teams.slice(0, 4).flatMap((t) =>
      t && typeof t.id === "string" && typeof t.name === "string" && Array.isArray(t.members)
        ? [{ id: t.id.slice(0, 12), name: t.name.slice(0, 16), members: t.members.filter((m): m is string => typeof m === "string").slice(0, 400).map((m) => m.slice(0, 28)) }]
        : []
    );
  }
  if (game.rhythm && b.rhythm?.review && game.phase === "results") {
    const v = b.rhythm.review;
    const strictness = v.strictness === "easy" || v.strictness === "strict" ? v.strictness : "standard";
    const beatUnits = num(v.beatUnits, 1, 64);
    if (typeof v.abc === "string" && v.abc.length <= 20_000 && beatUnits !== null) {
      game.rhythm.review = { abc: v.abc, strictness, roomLag: v.roomLag === null ? null : num(v.roomLag, -500, 500), beatUnits };
    }
  }
  if (Array.isArray(b.board)) {
    game.board = b.board.slice(0, MAX_BOARD).flatMap((r) =>
      r && typeof r.name === "string" && typeof r.tag === "string" && Number.isFinite(r.points)
        ? [{ tag: r.tag.slice(0, 12), name: r.name.slice(0, 28), points: Math.round(r.points), last: Math.round(Number(r.last) || 0), ...(typeof r.team === "string" ? { team: r.team.slice(0, 12) } : {}) }]
        : []
    );
  }
  return { ok: true, value: publicGame(game) };
}

/** What every device may see: the tune only once the round is over. */
export function publicGame(game: LiveGame): LiveGame {
  if (!game.tune?.tune || game.phase === "results") return game;
  const { tune: _hidden, ...rest } = game.tune;
  return { ...game, tune: rest };
}

export const isLiveGame = (v: unknown): v is LiveGame => checkGame(v).ok;

/** A rhythm's taps, in server milliseconds; a tune's notes and how long it took. */
export type RhythmAnswer = { taps: number[] };
export type TuneAnswer = { notes: number[]; ms: number };
/** The game is over when its last round's results are up. */
export const isFinal = (g: LiveGame) => g.phase === "results" && !!g.total && g.number >= g.total;
export type GameAnswer = RhythmAnswer | TuneAnswer;

/** More taps than any round has notes, with room for a busy student. */
export const MAX_TAPS = 200;

/** A device's answer (POST .../game/answer), checked against the round it is for. */
export function checkAnswer(kind: GameKind, body: unknown): Checked<GameAnswer> {
  const b = body as { taps?: unknown; notes?: unknown; ms?: unknown } | null;
  if (kind === "rhythm") {
    if (!Array.isArray(b?.taps) || b.taps.length > MAX_TAPS || !b.taps.every((t) => Number.isFinite(t) && t > 0)) {
      return { ok: false, error: "Not a rhythm's taps." };
    }
    return { ok: true, value: { taps: (b.taps as number[]).map((t) => Math.round(t)) } };
  }
  const notes = ints(b?.notes, 16, STEP_LO, STEP_HI);
  const ms = num(b?.ms, 0, 3_600_000);
  if (!notes || ms === null) return { ok: false, error: "Not a tune's notes." };
  return { ok: true, value: { notes, ms: Math.round(ms) } };
}

/**
 * The count-in is the site's own (count-in.ts): "1, 2, Ready, Go", a bar, two
 * in 2/4. Everyone taps along with it, and those taps measure each device's
 * delay (game-lag.ts). It used to be two bars, "Listen" then "Tap with the
 * clicks" (Blaine, 2 November 2026: listen to what? just count in).
 */
export const countInBarsFor = (beatsPerBar: number) => (beatsPerBar === 2 ? 2 : 1);

/** Where a rhythm round stands, all in server milliseconds. */
export function rhythmTimes(r: RhythmRound) {
  const beatMs = 60_000 / r.bpm;
  const barMs = beatMs * r.beatsPerBar;
  const countBeats = countInBarsFor(r.beatsPerBar) * r.beatsPerBar;
  const musicAt = r.at + countBeats * beatMs;
  const clicks = Array.from({ length: countBeats }, (_, i) => r.at + i * beatMs);
  return { beatMs, barMs, countBeats, musicAt, endAt: musicAt + r.bars * barMs, tapClicks: clicks };
}
