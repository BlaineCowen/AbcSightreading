/**
 * Points, streaks and the weekly leaderboard (Blaine, 16 November 2026: "a
 * gamification thing ... points for practice in the week like Duolingo",
 * "they can't just do easy ex over and over. Has to be diminishing returns").
 * The rules only; the server applies them (src/lib/server/points.ts), the
 * pages show them (PointsToast, PointsWeek, the "How points work" card).
 *
 * An exercise earns by how hard it is for the student: at their level or
 * harder 10, a few steps easier 5, much easier 2, their own settings 5. The
 * same choice read again the same day earns full points 3 times, then half,
 * then a quarter, and nothing after 10; past 200 points in a day everything
 * counts half. An exercise counts once the student has spent
 * EXERCISE_MIN_SECONDS on it, so pressing New exercise over and over earns
 * nothing.
 *
 * Owner only while it is tried out: students of an owner's classes
 * (pointsOnFor), the teacher's controls behind ownerSees("points").
 */

export const EXERCISE_POINTS = { level: 10, review: 5, easy: 2, own: 5, assigned: 10 } as const;
export type Tier = keyof typeof EXERCISE_POINTS;

/** Steps below the student's level that still count as review (5), not much easier (2). */
export const REVIEW_STEPS = 3;
/** Seconds of practice on an exercise before it earns. */
export const EXERCISE_MIN_SECONDS = 20;
/** Past this many points in a day, everything counts half. */
export const DAILY_SLOWDOWN = 200;
/** A graded try, and the bonus for 80% or better and for 100% (at the student's level). */
export const GRADED_POINTS = 10;
export const GRADE_BONUS_80 = 10;
export const GRADE_BONUS_100 = 25;
/** A new best score on a step. */
export const NEW_BEST_POINTS = 10;
/** An assignment finished, and more when it is 2 days or more early. */
export const ASSIGNMENT_POINTS = 25;
export const EARLY_POINTS = 10;
export const EARLY_MS = 2 * 86_400_000;
/** A point a minute of practice time, up to this many a day. */
export const TIME_POINTS_PER_DAY = 30;
/** Exercises on a step before it counts as the student's level. */
export const LEVEL_EXERCISES = 3;
/** Point rows are kept this long (the leaderboard needs this week and last). */
export const POINTS_KEEP_DAYS = 60;

/** How hard an exercise is for this student. */
export function tierOf(e: { kind: "step" | "preset" | "own" | "assigned"; step: number | null }, level: number): Tier {
  if (e.kind === "assigned") return "assigned";
  if (e.kind === "own") return "own";
  if (e.kind === "preset" || e.step === null) return "level";
  if (e.step >= level) return "level";
  return level - e.step <= REVIEW_STEPS ? "review" : "easy";
}

/** The nth time today the same choice was read (1 for the first): its share of the points. */
export function repeatFactor(n: number): number {
  if (n <= 3) return 1;
  if (n <= 6) return 0.5;
  if (n <= 10) return 0.25;
  return 0;
}

/** Points after the repeat and daily rules: at least 1 while anything is left. */
export function scaled(base: number, factor: number, pointsToday: number): number {
  const f = factor * (pointsToday >= DAILY_SLOWDOWN ? 0.5 : 1);
  if (base <= 0 || f <= 0) return 0;
  return Math.max(1, Math.round(base * f));
}

/** A graded try's points: GRADED_POINTS, and the bonus where it counts. */
export function gradePoints(score: number, tier: Tier): number {
  const bonusHere = tier === "level" || tier === "assigned";
  const bonus = !bonusHere ? 0 : score >= 100 ? GRADE_BONUS_100 : score >= 80 ? GRADE_BONUS_80 : 0;
  return GRADED_POINTS + bonus;
}

/** Time points a report adds: a point a minute, up to the day's cap. */
export function timePoints(secondsBefore: number, secondsAfter: number): number {
  const m = (s: number) => Math.floor(Math.min(Math.max(s, 0), TIME_POINTS_PER_DAY * 60) / 60);
  return Math.max(0, m(secondsAfter) - m(secondsBefore));
}

/** The highest step practised LEVEL_EXERCISES times or more: the student's level. */
export function levelFrom(steps: Record<string, number>): number {
  let level = 0;
  for (const [step, n] of Object.entries(steps)) if (n >= LEVEL_EXERCISES && Number(step) > level) level = Number(step);
  return level;
}

/** A class's suggested weekly goal: 100 points a student, at least 300, in fifties. */
export function recommendedGoal(students: number): number {
  return Math.max(300, Math.round((students * 100) / 50) * 50);
}

// ── Days, weeks and school-day streaks ────────────────────────────────────────

const parse = (day: string) => new Date(`${day}T12:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => fmt(new Date(parse(day).getTime() + n * 86_400_000));

/** The Monday of a day's week: the leaderboard's week. */
export function weekOf(day: string): string {
  const dow = parse(day).getUTCDay(); // 0 Sunday
  return addDays(day, -((dow + 6) % 7));
}
export const previousWeek = (week: string) => addDays(week, -7);
/** A week's school days, Monday to Friday: "Nov 9 to Nov 13". */
export const weekLabel = (week: string) => {
  const f = (d: string) => parse(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(week)} to ${f(addDays(week, 4))}`;
};

export const isWeekend = (day: string) => [0, 6].includes(parse(day).getUTCDay());

/** A day that counts for a streak: a weekday, not inside the class's break. */
export const isSchoolDay = (day: string, breakUntil?: string | null) =>
  !isWeekend(day) && !(breakUntil && day <= breakUntil && day >= addDays(breakUntil, -30));

/**
 * The streak after practising on `day`. Weekends never break it (and add
 * nothing); a school day missed between the last one practised and this one
 * starts it over. Days of a class break (breakUntil, up to 30 days long) are
 * not school days.
 */
export function nextStreak(s: { streak: number; streakDay: string | null }, day: string, breakUntil?: string | null): { streak: number; streakDay: string | null } {
  if (!isSchoolDay(day, breakUntil)) return s;
  if (s.streakDay === day) return s;
  if (!s.streakDay) return { streak: 1, streakDay: day };
  // A day before the last one counted (a late report, a device on another clock) changes nothing.
  if (s.streakDay > day) return s;
  let missed = false;
  for (let d = addDays(s.streakDay, 1); d < day; d = addDays(d, 1)) {
    if (isSchoolDay(d, breakUntil)) {
      missed = true;
      break;
    }
  }
  return { streak: missed ? 1 : s.streak + 1, streakDay: day };
}

/** The streak as it stands today: 0 once a school day has gone by without practice. */
export function currentStreak(s: { streak: number; streakDay: string | null }, today: string, breakUntil?: string | null): number {
  if (!s.streakDay) return 0;
  for (let d = addDays(s.streakDay, 1); d < today; d = addDays(d, 1)) if (isSchoolDay(d, breakUntil)) return 0;
  return s.streak;
}

// ── What an exercise is, read from its ABC ─────────────────────────────────────

/** The key ("Bb", "F#m"), compound meter and bass clef of an exercise, from its ABC. */
export function exerciseTraits(abc: string): { keySig: string | null; minor: boolean; compound: boolean; bass: boolean } {
  const k = /^K:\s*([^\n%]*)/m.exec(abc)?.[1]?.trim() ?? "";
  const tonic = /^([A-G][#b]?)(\s*(m|min|minor|aeo|aeolian)\b)?/i.exec(k);
  const minor = !!tonic?.[2];
  const keySig = tonic ? `${tonic[1][0].toUpperCase()}${tonic[1].slice(1)}${minor ? "m" : ""}` : null;
  const m = /^M:\s*(\d+)\/(\d+)/m.exec(abc);
  const compound = !!m && Number(m[2]) === 8 && [6, 9, 12].includes(Number(m[1]));
  const bass = /clef\s*=\s*bass/i.test(abc);
  return { keySig, minor, compound, bass };
}

// ── Ear-training games (Blaine, 17 November 2026: points for games "if their teacher lets them") ──

/**
 * A game round (QUIZ_LENGTH questions, dealt and marked on the server,
 * ear-games.ts) earns a point a right answer and GAME_PERFECT more for all
 * right, nothing under GAME_PASS. Only when one of the student's classes has
 * games on (Class.gamePoints, off until the teacher turns it on). A level
 * below the student's own in that game, or Custom, earns half; the same game
 * the same day follows repeatFactor; games earn at most GAME_DAILY_CAP a day,
 * so they never outweigh sight reading.
 */
export const GAME_PASS = 7;
export const GAME_PERFECT = 5;
export const GAME_DAILY_CAP = 50;
/** A round faster than this was not listened to (10 notes, each played). */
export const GAME_MIN_SECONDS = 20;
/** Two rounds of 9 or better at a level make it the student's level in that game. */
export const GAME_MASTER = 9;
export const GAME_MASTER_ROUNDS = 2;

export function gameRoundPoints(o: { correct: number; total: number; below: boolean; custom: boolean; factor: number }): number {
  if (o.correct < GAME_PASS || o.factor <= 0) return 0;
  const base = o.correct + (o.correct >= o.total ? GAME_PERFECT : 0);
  return Math.max(1, Math.round(base * (o.below || o.custom ? 0.5 : 1) * o.factor));
}
