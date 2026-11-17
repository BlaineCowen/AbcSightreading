import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { serverEnv } from "./env";
import { award, pointsClasses, type Award } from "./points";
import {
  INTERVAL_LEVELS, QUIZ_LENGTH, SOLFEGE_LEVELS, checkIntervalSetup, checkSolfegeSetup, intervalMinSeconds, intervalRound, newSeed, pcOf, solfegeMinSeconds, solfegeRound,
} from "../games/ear-quiz";
import { practiceDay } from "../practice";

/**
 * Ear-training rounds that can earn points (points.ts, games section). The
 * server deals a round: a seed and the setup, signed with the site's secret
 * into a token, so nothing needs storing. The browser plays the round from
 * the seed (ear-quiz.ts, the same code) and sends the token back with its
 * answers; the server deals the same round again, marks it, and awards it
 * once (the round's id is in its point row). A round sent back sooner than
 * its game's minSeconds (as fast as an honest round can go, ear-quiz.ts), later than two hours, or by someone else earns nothing.
 * The round counts on the day it was dealt (the device's day, in the token),
 * and once ever: a token sent again, on any day, finds its row.
 *
 * Anyone signed in may ask for a round; `points` says whether it can earn
 * (a student in a class whose teacher turned games on, an owner's class
 * while points are tried out).
 */

type GameDef<S> = { check: (v: unknown) => S; key: (s: S, seed: number) => number[]; minSeconds: (s: S) => number; track: (s: S) => string; label: (s: S) => string };
/** The games, each with its setup check, its answer key from a seed, and how its levels are counted. */
const GAMES = {
  solfege: {
    check: checkSolfegeSetup,
    /** Each question's right answer: the note's pitch class from the tonic. */
    key: (setup: ReturnType<typeof checkSolfegeSetup>, seed: number) => solfegeRound(setup, seed).questions.map(pcOf),
    minSeconds: solfegeMinSeconds,
    track: (s: ReturnType<typeof checkSolfegeSetup>) => `solfege-${s.tonality}`,
    label: (s: ReturnType<typeof checkSolfegeSetup>) =>
      `Solfège, ${s.tonality}, ${s.level ? `Level ${s.level} (${SOLFEGE_LEVELS[s.tonality][s.level - 1]!.name})` : "Custom"}`,
  },
  interval: {
    check: checkIntervalSetup,
    /** Each question's right answer: the size (sizes levels) or the semitones. */
    key: (setup: ReturnType<typeof checkIntervalSetup>, seed: number) => intervalRound(setup, seed).questions.map((q) => q.answer),
    minSeconds: intervalMinSeconds,
    track: () => "interval",
    label: (s: ReturnType<typeof checkIntervalSetup>) => `Intervals, ${s.level ? `Level ${s.level} (${INTERVAL_LEVELS[s.level - 1]!.name})` : "Custom"}`,
  },
} as const;
export type GameId = keyof typeof GAMES;
export const isGame = (v: unknown): v is GameId => typeof v === "string" && v in GAMES;

type Token = { u: string; g: GameId; s: unknown; seed: number; t: number; id: string; d: string };
function secret() {
  const s = serverEnv("BETTER_AUTH_SECRET");
  if (s) return s;
  // Never a guessable key on the site: without the secret, tokens would be forgeable.
  if (import.meta.env.DEV) return "dev-secret";
  throw new Error("BETTER_AUTH_SECRET is not set");
}
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function dealRound(userId: string, game: GameId, rawSetup: unknown, day: unknown) {
  const setup = GAMES[game].check(rawSetup);
  const seed = newSeed();
  const token = { u: userId, g: game, s: setup, seed, t: Date.now(), id: randomUUID().slice(0, 12), d: practiceDay(day) } satisfies Token;
  const body = Buffer.from(JSON.stringify(token)).toString("base64url");
  return { token: `${body}.${sign(body)}`, seed, setup };
}

function readToken(token: unknown): Token | null {
  if (typeof token !== "string" || token.length > 4000) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as Token;
  } catch {
    return null;
  }
}

/** Whether this student's rounds can earn: a class of theirs has games on. */
export async function gamesEarn(studentId: string) {
  return (await pointsClasses(studentId)).some((c) => c.gamePoints);
}

export type Finished = { correct: number; total: number; marks: boolean[]; award: Award | null; problem?: string };

/** A round back from the browser: marked here, and awarded if it can earn. */
export async function finishRound(userId: string, token: unknown, answers: unknown): Promise<Finished | null> {
  const t = readToken(token);
  if (!t || t.u !== userId || !isGame(t.g)) return null;
  // Each game's functions take its own setup; one game's at a time here.
  const game = GAMES[t.g] as unknown as GameDef<{ level: number }>;
  const setup = game.check(t.s);
  const key = game.key(setup, t.seed);
  const given = Array.isArray(answers) ? answers : [];
  const marks = key.map((k, i) => given[i] === k);
  const correct = marks.filter(Boolean).length;
  const out: Finished = { correct, total: QUIZ_LENGTH, marks, award: null };
  const seconds = (Date.now() - t.t) / 1000;
  if (seconds < game.minSeconds(setup)) return { ...out, problem: "That round went too fast to count." };
  if (seconds > 2 * 3600) return { ...out, problem: "That round is too old to count." };
  out.award = await award(userId, practiceDay(t.d), {
    credited: 0, page: null, assignmentId: null, exercises: [], grades: [],
    game: { id: t.id, track: game.track(setup), level: setup.level, label: game.label(setup), correct, total: QUIZ_LENGTH },
  });
  return out;
}
