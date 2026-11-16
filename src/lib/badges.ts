import { STEP_COUNT } from "./ladder";

/**
 * The badges (Blaine, 16 November 2026; designed from the mockups he
 * approved). Levelled badges climb with a lifetime count; one-time badges are
 * a skill done once; teacher badges are given by hand. What a student has is
 * decided here from their StudentStats (earnedLevels), and stored as Badge
 * rows by src/lib/server/points.ts, one a level, so a level is never taken
 * back.
 *
 * Badge ids are permanent: never rename or reuse one.
 */

export type Colour = "mint" | "peach" | "butter" | "sky" | "tint";
export type BadgeStats = {
  seconds: number; exercises: number; graded: number; tries90: number; tries100: number; onTime: number;
  weeklyTop3: number; ensembles: number; bestStreak: number; level: number; keys: string[]; flags: string[];
};

type Levelled = {
  id: string; name: string; icon: string; colour: Colour; group: "keep-going" | "skills";
  /** The count it climbs with, and the count each level needs. */
  count: (s: BadgeStats) => number; levels: number[];
  /** "7 school days in a row": what a level means. */
  says: (n: number) => string; unit?: (n: number) => string;
};
type Once = { id: string; name: string; icon: string; colour: Colour; group: "skills" | "effort"; says: string; done: (s: BadgeStats) => boolean };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const has = (f: string) => (s: BadgeStats) => s.flags.includes(f);

export const LEVELLED: Levelled[] = [
  { id: "streak", name: "On a Roll", icon: "flame", colour: "peach", group: "keep-going", count: (s) => s.bestStreak, levels: [3, 7, 14, 30, 60, 100], says: (n) => `${n} school days in a row` },
  { id: "time", name: "Practice Time", icon: "clock", colour: "sky", group: "keep-going", count: (s) => Math.floor(s.seconds / 3600), levels: [1, 5, 10, 25, 50, 100], says: (n) => plural(n, "hour"), unit: (n) => plural(n, "hour") },
  { id: "exercises", name: "Sight Reader", icon: "music", colour: "mint", group: "keep-going", count: (s) => s.exercises, levels: [10, 50, 100, 250, 500, 1000], says: (n) => plural(n, "exercise") },
  { id: "spot-on", name: "Spot On", icon: "target", colour: "butter", group: "keep-going", count: (s) => s.tries90, levels: [1, 5, 25, 100], says: (n) => `${plural(n, "try", "tries")} at 90% or more` },
  { id: "perfect", name: "Perfect", icon: "sparkles", colour: "tint", group: "keep-going", count: (s) => s.tries100, levels: [1, 5, 25], says: (n) => `${plural(n, "try", "tries")} at 100%` },
  { id: "climber", name: "Climber", icon: "mountain", colour: "tint", group: "keep-going", count: (s) => s.level, levels: [5, 10, 20, 30, STEP_COUNT].filter((n, i, a) => n <= STEP_COUNT && a.indexOf(n) === i), says: (n) => (n === STEP_COUNT ? "The top of the ladder" : `Step ${n} of the ladder`), unit: (n) => plural(n, "step") },
  { id: "on-time", name: "On Time", icon: "calendar-check", colour: "mint", group: "keep-going", count: (s) => s.onTime, levels: [1, 5, 15, 30], says: (n) => `${plural(n, "assignment")} by the due date` },
  { id: "weekly-winner", name: "Weekly Winner", icon: "crown", colour: "butter", group: "keep-going", count: (s) => s.weeklyTop3, levels: [1, 3, 10], says: (n) => `Top 3 of the week ${plural(n, "time")}` },
  { id: "ensemble", name: "Ensemble", icon: "users", colour: "sky", group: "keep-going", count: (s) => s.ensembles, levels: [1, 5, 10], says: (n) => `Your class reached its goal ${plural(n, "time")}` },
  { id: "keys", name: "Key Collector", icon: "key-round", colour: "peach", group: "skills", count: (s) => s.keys.length, levels: [5, 8, 12], says: (n) => `Read in ${n} keys`, unit: (n) => plural(n, "key") },
];

export const ONCE: Once[] = [
  { id: "first-note", name: "First Note", icon: "music-2", colour: "mint", group: "effort", says: "Your first exercise", done: (s) => s.exercises >= 1 },
  { id: "first-grade", name: "First Grade", icon: "badge-check", colour: "sky", group: "effort", says: "Your first graded try", done: (s) => s.graded >= 1 },
  { id: "in-the-pocket", name: "In the Pocket", icon: "drum", colour: "butter", group: "skills", says: "A perfect rhythm score", done: has("perfect-rhythm") },
  { id: "bullseye", name: "Bullseye", icon: "crosshair", colour: "sky", group: "skills", says: "A perfect pitch score", done: has("perfect-pitch") },
  { id: "clap-back", name: "Clap Back", icon: "hand", colour: "peach", group: "skills", says: "100% on a clapped try", done: has("perfect-clap") },
  { id: "minor", name: "Minor Mood", icon: "moon", colour: "tint", group: "skills", says: "Your first minor key", done: has("minor") },
  { id: "compound", name: "Six Eight", icon: "waves", colour: "mint", group: "skills", says: "Your first compound meter", done: has("compound") },
  { id: "bass-clef", name: "Bass Clef Brave", icon: "anchor", colour: "sky", group: "skills", says: "Your first exercise in bass clef", done: has("bass") },
  { id: "contest", name: "Contest Ready", icon: "trophy", colour: "butter", group: "skills", says: "Read a UIL, TMEA or NYSSMA level", done: has("contest") },
  { id: "comeback", name: "Comeback", icon: "trending-up", colour: "mint", group: "effort", says: "Raised a score by 20 on the same assignment", done: has("comeback") },
  { id: "try-again", name: "Try Again", icon: "rotate-ccw", colour: "peach", group: "effort", says: "Tried again right after a score under 60", done: has("try-again") },
  { id: "board", name: "Brave at the Board", icon: "presentation", colour: "tint", group: "effort", says: "Took a test on the board", done: has("board") },
  { id: "early-bird", name: "Early Bird", icon: "sunrise", colour: "butter", group: "effort", says: "Finished an assignment 2 days early", done: has("early") },
  { id: "explorer", name: "Explorer", icon: "compass", colour: "sky", group: "effort", says: "Practised on Unison and Choral", done: (s) => s.flags.includes("page-unison") && s.flags.includes("page-choral") },
];

/** Given by a teacher, from their class's Points and badges. "own" is named by the teacher. */
export const TEACHER_BADGES: { id: string; name: string; icon: string; colour: Colour }[] = [
  { id: "t-most-improved", name: "Most Improved", icon: "trending-up", colour: "mint" },
  { id: "t-section-leader", name: "Section Leader", icon: "star", colour: "butter" },
  { id: "t-great-attitude", name: "Great Attitude", icon: "smile", colour: "peach" },
  { id: "t-helper", name: "Helper", icon: "hand-heart", colour: "sky" },
  { id: "t-own", name: "", icon: "award", colour: "tint" },
];

/** Every badge a student can earn, counting each level: the "of 56". */
export const BADGE_TOTAL = LEVELLED.reduce((n, b) => n + b.levels.length, 0) + ONCE.length;

/** The badges a student's stats have earned: [badgeId, level] (level 1 for one-time badges). */
export function earnedLevels(s: BadgeStats): [string, number][] {
  const out: [string, number][] = [];
  for (const b of LEVELLED) {
    const n = b.count(s);
    b.levels.forEach((need, i) => {
      if (n >= need) out.push([b.id, i + 1]);
    });
  }
  for (const b of ONCE) if (b.done(s)) out.push([b.id, 1]);
  return out;
}

/** A levelled badge's next level: what it needs and how far along the student is. */
export function nextLevel(b: Levelled, s: BadgeStats): { level: number; need: number; have: number } | null {
  const have = b.count(s);
  const i = b.levels.findIndex((need) => have < need);
  return i < 0 ? null : { level: i + 1, need: b.levels[i], have };
}

export const badgeById = (id: string) => LEVELLED.find((b) => b.id === id) ?? ONCE.find((b) => b.id === id) ?? TEACHER_BADGES.find((b) => b.id === id) ?? null;

/** What a badge level is called: "On a Roll, level 2" and "7 school days in a row". */
export function badgeText(id: string, level: number, title?: string | null): { name: string; says: string; icon: string; colour: Colour } | null {
  const l = LEVELLED.find((b) => b.id === id);
  if (l) return { name: `${l.name}${l.levels.length > 1 ? `, level ${level}` : ""}`, says: l.says(l.levels[level - 1] ?? 0), icon: l.icon, colour: l.colour };
  const o = ONCE.find((b) => b.id === id);
  if (o) return { name: o.name, says: o.says, icon: o.icon, colour: o.colour };
  const t = TEACHER_BADGES.find((b) => b.id === id);
  if (t) return { name: title || t.name, says: "From your teacher", icon: t.icon, colour: t.colour };
  return null;
}
