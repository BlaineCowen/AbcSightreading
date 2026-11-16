import { prisma } from "./db";
import type { Prisma } from "../../generated/prisma/client";
import { isAdmin } from "./admin";
import { assignmentDoneFor } from "./practice";
import {
  ASSIGNMENT_POINTS, EARLY_MS, EARLY_POINTS, EXERCISE_MIN_SECONDS, EXERCISE_POINTS, NEW_BEST_POINTS, POINTS_KEEP_DAYS,
  currentStreak, gradePoints, levelFrom, nextStreak, previousWeek, recommendedGoal, repeatFactor, scaled, tierOf, timePoints, weekOf,
  type Tier,
} from "../points";
import { badgeText, earnedLevels, type BadgeStats } from "../badges";

/**
 * Points, streaks, badges and the weekly leaderboard against the database
 * (rules in src/lib/points.ts and src/lib/badges.ts).
 *
 * Points ride on the reports the practice pages already send every 30
 * seconds (/api/practice, recordPractice) and on graded attempts
 * (finishAttempt): no requests of their own. A report says which exercises
 * the student spent EXERCISE_MIN_SECONDS on and which they graded; this
 * decides what each earns, from the day's PointEvent rows (repeats, the daily
 * slowdown) and the student's StudentStats (their level, bests, streak).
 */

export type ExerciseReport = {
  id: string; kind: "step" | "preset" | "own" | "assigned"; key: string; label: string; step: number | null;
  keySig: string | null; minor: boolean; compound: boolean; bass: boolean; contest: boolean;
};
export type GradeReport = {
  exerciseId: string; kind: ExerciseReport["kind"]; key: string; label: string; step: number | null;
  score: number; pitch: number | null; rhythm: number | null; clapped: boolean;
};
/** One line of what a report earned, for the card after an exercise. */
export type Earned = { label: string; points: number; note?: string };
export type NewBadge = { badgeId: string; level: number; name: string; says: string; icon: string; colour: string };
export type Award = { earned: Earned[]; total: number; today: number; week: number; streak: number; badges: NewBadge[] };

/** The classes whose leaderboard this student is on while points are tried out: an owner's. */
export async function pointsClasses(studentId: string) {
  const rows = await prisma.enrollment.findMany({
    where: { studentId },
    select: { class: { select: { id: true, name: true, breakUntil: true, leaderboardOn: true, weeklyGoal: true, position: true, user: { select: { email: true } } } } },
  });
  return rows.map((r) => r.class).filter((c) => isAdmin(c.user));
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const KINDS = ["step", "preset", "own", "assigned"] as const;
const kindOf = (v: unknown): ExerciseReport["kind"] => (KINDS.includes(v as never) ? (v as ExerciseReport["kind"]) : "own");

/** The points part of a practice report, checked: at most 5 exercises and 5 grades. */
export function checkPointsReport(v: unknown): { exercises: ExerciseReport[]; grades: GradeReport[] } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.slice(0, 5) : []);
  const exercises = list(o.exercises).map((e: Record<string, unknown>) => ({
    id: str(e?.id, 40), kind: kindOf(e?.kind), key: str(e?.key, 120) || "own", label: str(e?.label, 60) || "Exercise",
    step: num(e?.step) !== null ? Math.round(num(e?.step)!) : null,
    keySig: str(e?.keySig, 4) || null, minor: e?.minor === true, compound: e?.compound === true, bass: e?.bass === true, contest: e?.contest === true,
  })).filter((e) => e.id);
  const grades = list(o.grades).map((g: Record<string, unknown>) => ({
    exerciseId: str(g?.exerciseId, 40), kind: kindOf(g?.kind), key: str(g?.key, 120) || "own", label: str(g?.label, 60) || "Exercise",
    step: num(g?.step) !== null ? Math.round(num(g?.step)!) : null,
    score: Math.min(100, Math.max(0, Math.round(num(g?.score) ?? 0))),
    pitch: num(g?.pitch), rhythm: num(g?.rhythm), clapped: g?.clapped === true,
  })).filter((g) => g.exerciseId);
  return { exercises, grades };
}

const asRecord = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {});
const asList = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const TIER_SAYS: Record<Tier, string> = { level: "your level", review: "review", easy: "much easier", own: "your own settings", assigned: "assigned" };

/**
 * What a report (or a graded attempt) earns, written down. Null when points
 * are not on for this student. `credited` is the practice seconds the report
 * was credited; `assignmentId` the assignment practised, if any.
 */
export async function award(
  studentId: string,
  day: string,
  input: {
    credited: number; page: string | null; assignmentId: string | null; exercises: ExerciseReport[]; grades: GradeReport[];
    prevAssignmentBest?: number | null; board?: boolean;
    /** False when nothing shows the new badges now (a graded attempt): the This week card shows them next. */
    showBadges?: boolean;
  },
): Promise<Award | null> {
  const classes = await pointsClasses(studentId);
  if (!classes.length) return null;
  const breakUntil = classes.map((c) => c.breakUntil).filter(Boolean).sort().pop() ?? null;
  const week = weekOf(day);

  const [statsRow, events] = await Promise.all([
    prisma.studentStats.findUnique({ where: { studentId } }),
    prisma.pointEvent.findMany({ where: { studentId, day }, orderBy: { createdAt: "asc" }, select: { kind: true, key: true, points: true } }),
  ]);
  const st = {
    seconds: statsRow?.seconds ?? 0, exercises: statsRow?.exercises ?? 0, graded: statsRow?.graded ?? 0, tries90: statsRow?.tries90 ?? 0,
    tries100: statsRow?.tries100 ?? 0, onTime: statsRow?.onTime ?? 0, gameCorrect: statsRow?.gameCorrect ?? 0,
    weeklyTop3: statsRow?.weeklyTop3 ?? 0, ensembles: statsRow?.ensembles ?? 0,
    streak: statsRow?.streak ?? 0, bestStreak: statsRow?.bestStreak ?? 0, streakDay: statsRow?.streakDay ?? null,
    level: statsRow?.level ?? 0, steps: { ...asRecord(statsRow?.steps) }, bests: { ...asRecord(statsRow?.bests) },
    keys: [...asList(statsRow?.keys)], flags: [...asList(statsRow?.flags)],
  };
  const flag = (f: string) => {
    if (!st.flags.includes(f)) st.flags.push(f);
  };

  let today = events.reduce((n, e) => n + e.points, 0);
  const all = [...events];
  const rows: { kind: string; key: string; points: number }[] = [];
  const earned: Earned[] = [];
  const add = (kind: string, key: string, points: number, label: string, note?: string) => {
    const row = { kind, key, points };
    rows.push(row);
    all.push(row);
    today += points;
    if (points > 0 || note) earned.push({ label, points, ...(note ? { note } : {}) });
  };

  // Practice time: a point a minute, up to the day's cap.
  let daySeconds = 0;
  if (input.credited > 0 || input.exercises.length) {
    const sum = await prisma.practiceTime.aggregate({ where: { studentId, day }, _sum: { seconds: true } });
    daySeconds = sum._sum.seconds ?? 0;
  }
  if (input.credited > 0) {
    st.seconds += input.credited;
    const tp = timePoints(daySeconds - input.credited, daySeconds);
    if (tp) add("time", "", tp, "Practice time");
  }
  // No more exercises than the day's credited time allows (EXERCISE_MIN_SECONDS each, and a little slack).
  const exerciseRoom = Math.max(0, Math.floor(daySeconds / EXERCISE_MIN_SECONDS) + 2 - events.filter((e) => e.kind === "exercise").length);
  if (input.page === "unison" || input.page === "choral") flag(`page-${input.page}`);

  // Exercises: by how hard for the student, less for repeats and past the day's slowdown.
  for (const ex of input.exercises.slice(0, exerciseRoom)) {
    const n = all.filter((e) => e.kind === "exercise" && e.key === ex.key).length + 1;
    const tier = tierOf(ex, st.level);
    const factor = repeatFactor(n);
    const p = scaled(EXERCISE_POINTS[tier], factor, today);
    const note =
      factor < 1
        ? `That's the ${ordinal(n)} time today on ${ex.label}, so it counts for less.${st.level && ex.kind === "step" ? ` Step ${st.level} or higher earns full points.` : " Something new earns full points."}`
        : tier === "easy"
        ? `Much easier than your level, Step ${st.level}: harder music earns more.`
        : undefined;
    add("exercise", ex.key, p, `Exercise, ${ex.label} (${TIER_SAYS[tier]})`, note);
    st.exercises++;
    if (ex.step !== null && ex.kind === "step") st.steps[String(ex.step)] = (st.steps[String(ex.step)] ?? 0) + 1;
    if (ex.keySig && !st.keys.includes(ex.keySig)) st.keys.push(ex.keySig);
    if (ex.minor) flag("minor");
    if (ex.compound) flag("compound");
    if (ex.bass) flag("bass");
    if (ex.contest) flag("contest");
  }
  st.level = Math.max(st.level, levelFrom(st.steps));

  // Graded tries: once an exercise, more only for a better score.
  for (const g of input.grades) {
    const prefix = `g:${g.exerciseId}|`;
    const before = all.filter((e) => e.kind === "grade" && e.key.startsWith(prefix));
    const prevBest = before.reduce((b, e) => Math.max(b, Number(e.key.slice(prefix.length)) || 0), -1);
    const lastGrade = [...all].reverse().find((e) => e.kind === "grade");
    const tier = tierOf(g, st.level);
    const owed = gradePoints(g.score, tier) - before.reduce((n, e) => n + e.points, 0);
    add("grade", `${prefix}${g.score}`, owed > 0 ? scaled(owed, 1, today) : 0, `Graded try, ${g.score}%${g.score >= 80 && (tier === "level" || tier === "assigned") ? (g.score >= 100 ? " (100% bonus)" : " (80% bonus)") : ""}`);
    if (prevBest < 0) st.graded++;
    if (g.score >= 90 && prevBest < 90) st.tries90++;
    if (g.score >= 100 && prevBest < 100) st.tries100++;
    if (g.rhythm === 100) flag("perfect-rhythm");
    if (g.pitch === 100) flag("perfect-pitch");
    if (g.clapped && g.score >= 100) flag("perfect-clap");
    if (lastGrade && Number(lastGrade.key.split("|")[1]) < 60) flag("try-again");
    if (input.prevAssignmentBest != null && g.score - input.prevAssignmentBest >= 20) flag("comeback");
    if (input.board) flag("board");
    // A new best on a step or level: what the student chose, not the exercise.
    if (g.kind === "step" || g.kind === "preset") {
      const was = st.bests[g.key];
      if (was === undefined || g.score > was) {
        st.bests[g.key] = g.score;
        add("best", g.key, scaled(NEW_BEST_POINTS, 1, today), `New best on ${g.label}`);
      }
    }
  }

  // An assignment finished: once.
  if (input.assignmentId) {
    const state = await assignmentDoneFor(studentId, input.assignmentId);
    if (state?.done && !state.board) {
      const already = await prisma.pointEvent.findFirst({ where: { studentId, kind: "assignment", key: input.assignmentId }, select: { id: true } });
      if (!already) {
        const now = Date.now();
        const early = !!state.dueAt && state.dueAt.getTime() - now >= EARLY_MS;
        add("assignment", input.assignmentId, ASSIGNMENT_POINTS + (early ? EARLY_POINTS : 0), early ? "Assignment finished, 2 days early" : "Assignment finished");
        if (!state.dueAt || state.dueAt.getTime() >= now) st.onTime++;
        if (early) flag("early");
      }
    }
  }

  // The streak: a school day with points (or a minute of practice) counts.
  if (rows.some((r) => r.points > 0) || input.credited >= 60) {
    const s = nextStreak({ streak: st.streak, streakDay: st.streakDay }, day, breakUntil);
    st.streak = s.streak;
    st.streakDay = s.streakDay;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
  }

  const data = {
    seconds: st.seconds, exercises: st.exercises, graded: st.graded, tries90: st.tries90, tries100: st.tries100, onTime: st.onTime,
    streak: st.streak, bestStreak: st.bestStreak, streakDay: st.streakDay, level: st.level,
    steps: st.steps, bests: st.bests, keys: st.keys, flags: st.flags,
  };
  await Promise.all([
    rows.length ? prisma.pointEvent.createMany({ data: rows.map((r) => ({ ...r, studentId, day, week })) }) : null,
    prisma.studentStats.upsert({ where: { studentId }, create: { studentId, ...data }, update: data }),
  ]);
  const badges = await grantBadges(studentId, { ...st }, input.showBadges !== false);
  const weekPoints = await prisma.pointEvent.aggregate({ where: { studentId, week }, _sum: { points: true } });
  return {
    earned,
    total: rows.reduce((n, r) => n + r.points, 0),
    today,
    week: weekPoints._sum.points ?? 0,
    streak: st.streak,
    badges,
  };
}

/** Writes the badge levels the stats have earned and the student lacks; returns them. */
async function grantBadges(studentId: string, s: BadgeStats, seen = true): Promise<NewBadge[]> {
  const have = await prisma.badge.findMany({ where: { studentId, givenById: null }, select: { badgeId: true, level: true } });
  const got = new Set(have.map((b) => `${b.badgeId}:${b.level}`));
  const fresh = earnedLevels(s).filter(([id, level]) => !got.has(`${id}:${level}`));
  if (!fresh.length) return [];
  await prisma.badge.createMany({ data: fresh.map(([badgeId, level]) => ({ studentId, badgeId, level, seenAt: seen ? new Date() : null })) });
  return fresh.map(([badgeId, level]) => ({ badgeId, level, ...badgeText(badgeId, level)! }));
}

/** A graded attempt on an assignment (finishAttempt): its points, for the student it belongs to. */
export async function awardAttempt(at: {
  id: string; studentId: string; assignmentId: string; overall: number; pitch: number | null; rhythm: number | null; board: boolean;
}) {
  const prev = await prisma.pieceAttempt.aggregate({
    where: { assignmentId: at.assignmentId, studentId: at.studentId, id: { not: at.id }, overall: { not: null } },
    _max: { overall: true },
  });
  const now = new Date();
  return award(at.studentId, now.toISOString().slice(0, 10), {
    credited: 0, page: null, assignmentId: at.assignmentId, exercises: [],
    grades: [{ exerciseId: at.id, kind: "assigned", key: `a:${at.assignmentId}`, label: "Assignment", step: null, score: at.overall, pitch: at.pitch, rhythm: at.rhythm, clapped: at.pitch === null }],
    prevAssignmentBest: prev._max.overall ?? null,
    board: at.board,
    showBadges: false,
  });
}

// ── The leaderboard ───────────────────────────────────────────────────────────

/** "Maya R.": first name and last initial, all a classmate sees. */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A student";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** A class's points for a week, everyone, most first. */
async function classWeekPoints(classId: string, week: string) {
  const enrolled = await prisma.enrollment.findMany({ where: { classId }, select: { student: { select: { id: true, name: true } } } });
  const ids = enrolled.map((e) => e.student.id);
  const sums = ids.length
    ? await prisma.pointEvent.groupBy({ by: ["studentId"], where: { week, studentId: { in: ids } }, _sum: { points: true } })
    : [];
  const by = new Map(sums.map((s) => [s.studentId, s._sum.points ?? 0]));
  return enrolled
    .map((e) => ({ id: e.student.id, name: e.student.name ?? "", points: by.get(e.student.id) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

const goalOf = (c: { weeklyGoal: number | null }, students: number) => c.weeklyGoal ?? recommendedGoal(students);

/**
 * Settles a class's finished week once (the first look after it ends): its
 * top three get Weekly Winner, and everyone gets Ensemble if the class
 * reached its goal. Returns the week as kept.
 */
export async function closeWeek(classId: string, week: string) {
  const kept = await prisma.classWeek.findUnique({ where: { classId_week: { classId, week } } });
  if (kept) return kept;
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { weeklyGoal: true, createdAt: true } });
  if (!cls) return null;
  const board = await classWeekPoints(classId, week);
  const total = board.reduce((n, s) => n + s.points, 0);
  if (!total) return null; // nothing happened that week: nothing to settle or show
  const goal = goalOf(cls, board.length);
  const top = board.filter((s) => s.points > 0).slice(0, 3).map((s) => ({ studentId: s.id, name: shortName(s.name), points: s.points }));
  // The board's extras: the longest streak, and who rose the most on the week before.
  const before = new Map((await classWeekPoints(classId, previousWeek(week))).map((s) => [s.id, s.points]));
  const improved = board.map((s) => ({ s, up: s.points - (before.get(s.id) ?? 0) })).sort((a, b) => b.up - a.up)[0];
  const stats = await prisma.studentStats.findMany({ where: { studentId: { in: board.map((s) => s.id) } }, select: { studentId: true, streak: true } });
  const longest = stats.sort((a, b) => b.streak - a.streak)[0];
  const nameOf = (id: string) => shortName(board.find((s) => s.id === id)?.name);
  const extras = {
    ...(longest && longest.streak >= 3 ? { streak: { name: nameOf(longest.studentId), days: longest.streak } } : {}),
    ...(improved && improved.up > 0 && before.size ? { improved: { name: shortName(improved.s.name) } } : {}),
  };
  try {
    const row = await prisma.classWeek.create({ data: { classId, week, top, total, goal, reached: total >= goal, extras } });
    // Settled here only: a second look at the same moment met the unique row and stops above.
    const winners = top.map((t) => t.studentId);
    const everyone = total >= goal ? board.map((s) => s.id) : [];
    await Promise.all([
      winners.length ? prisma.studentStats.updateMany({ where: { studentId: { in: winners } }, data: { weeklyTop3: { increment: 1 } } }) : null,
      everyone.length ? prisma.studentStats.updateMany({ where: { studentId: { in: everyone } }, data: { ensembles: { increment: 1 } } }) : null,
    ]);
    for (const id of new Set([...winners, ...everyone])) {
      const s = await prisma.studentStats.findUnique({ where: { studentId: id } });
      // Shown on the student's next look (myPoints), not at the moment.
      if (s) await grantBadges(id, { ...s, keys: asList(s.keys), flags: asList(s.flags) }, false);
    }
    return row;
  } catch {
    return prisma.classWeek.findUnique({ where: { classId_week: { classId, week } } });
  }
}

/** The student's week: points, place, streak, the leaderboard and class goal, and badges not yet shown. */
export async function myPoints(studentId: string, today: string) {
  const classes = (await pointsClasses(studentId)).sort((a, b) => a.position - b.position);
  if (!classes.length) return { on: false as const };
  const week = weekOf(today);
  const cls = classes.find((c) => c.leaderboardOn) ?? classes[0];
  await closeWeek(cls.id, previousWeek(week));
  const [board, stats, unseen] = await Promise.all([
    classWeekPoints(cls.id, week),
    prisma.studentStats.findUnique({ where: { studentId }, select: { streak: true, streakDay: true } }),
    prisma.badge.findMany({ where: { studentId, seenAt: null }, orderBy: { earnedAt: "asc" }, select: { id: true, badgeId: true, level: true, title: true } }),
  ]);
  if (unseen.length) await prisma.badge.updateMany({ where: { id: { in: unseen.map((b) => b.id) } }, data: { seenAt: new Date() } });
  const breakUntil = classes.map((c) => c.breakUntil).filter(Boolean).sort().pop() ?? null;
  const mine = board.find((s) => s.id === studentId)?.points ?? 0;
  const ranked = board.filter((s) => s.points > 0);
  const place = mine > 0 ? ranked.findIndex((s) => s.id === studentId) + 1 : null;
  const above = place && place > 1 ? ranked[place - 2].points - mine : null;
  const total = board.reduce((n, s) => n + s.points, 0);
  return {
    on: true as const,
    className: cls.name,
    week,
    points: mine,
    place,
    behind: above,
    streak: stats ? currentStreak(stats, today, breakUntil) : 0,
    streakDays: weekDaysPractised(await prisma.pointEvent.findMany({ where: { studentId, week, points: { gt: 0 } }, distinct: ["day"], select: { day: true } })),
    leaderboard: cls.leaderboardOn
      ? ranked.slice(0, 10).map((s, i) => ({ place: i + 1, name: s.id === studentId ? "You" : shortName(s.name), points: s.points, me: s.id === studentId }))
      : null,
    goal: { total, goal: goalOf(cls, board.length) },
    newBadges: unseen.map((b) => ({ badgeId: b.badgeId, level: b.level, ...badgeText(b.badgeId, b.level, b.title)! })),
  };
}

/** Which of the week's school days (0 Monday to 4 Friday) the student earned points on. */
function weekDaysPractised(rows: { day: string }[]) {
  return rows.map((r) => (new Date(`${r.day}T12:00:00Z`).getUTCDay() + 6) % 7).filter((d) => d < 5);
}

/** The student's badges and the counts toward the next levels (the Badges page). */
export async function myBadges(studentId: string) {
  const [stats, badges] = await Promise.all([
    prisma.studentStats.findUnique({ where: { studentId } }),
    prisma.badge.findMany({ where: { studentId }, orderBy: { earnedAt: "asc" }, select: { badgeId: true, level: true, title: true, givenById: true, earnedAt: true } }),
  ]);
  return {
    stats: {
      seconds: stats?.seconds ?? 0, exercises: stats?.exercises ?? 0, graded: stats?.graded ?? 0, tries90: stats?.tries90 ?? 0,
      tries100: stats?.tries100 ?? 0, onTime: stats?.onTime ?? 0, weeklyTop3: stats?.weeklyTop3 ?? 0, ensembles: stats?.ensembles ?? 0,
      bestStreak: stats?.bestStreak ?? 0, level: stats?.level ?? 0, keys: asList(stats?.keys), flags: asList(stats?.flags),
    } satisfies BadgeStats,
    badges: badges.map((b) => ({ badgeId: b.badgeId, level: b.level, title: b.title, given: !!b.givenById, earnedAt: b.earnedAt.getTime() })),
  };
}

// ── The teacher's side ────────────────────────────────────────────────────────

/** A class's points settings and this week's standings, for its teacher. */
export async function classPoints(classId: string, today: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true, leaderboardOn: true, weeklyGoal: true, breakUntil: true } });
  if (!cls) return null;
  const week = weekOf(today);
  const last = await closeWeek(classId, previousWeek(week));
  const board = await classWeekPoints(classId, week);
  return {
    name: cls.name,
    leaderboardOn: cls.leaderboardOn,
    weeklyGoal: cls.weeklyGoal,
    recommended: recommendedGoal(board.length),
    breakUntil: cls.breakUntil,
    week,
    total: board.reduce((n, s) => n + s.points, 0),
    students: board.map((s) => ({ id: s.id, name: s.name, points: s.points })),
    lastWeek: last ? { week: last.week, top: last.top, total: last.total, goal: last.goal, reached: last.reached, extras: last.extras } : null,
  };
}

export async function updateClassPoints(classId: string, v: { leaderboardOn?: unknown; weeklyGoal?: unknown; breakUntil?: unknown }) {
  const data: Prisma.ClassUpdateInput = {};
  if (typeof v.leaderboardOn === "boolean") data.leaderboardOn = v.leaderboardOn;
  if (v.weeklyGoal === null) data.weeklyGoal = null;
  else if (typeof v.weeklyGoal === "number" && Number.isInteger(v.weeklyGoal) && v.weeklyGoal >= 50 && v.weeklyGoal <= 1_000_000) data.weeklyGoal = v.weeklyGoal;
  if (v.breakUntil === null || v.breakUntil === "") data.breakUntil = null;
  else if (typeof v.breakUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.breakUntil)) data.breakUntil = v.breakUntil;
  await prisma.class.update({ where: { id: classId }, data });
}

/** A badge from the teacher to a student of the class. */
export async function giveBadge(teacherId: string, classId: string, studentId: string, badgeId: string, title: string | null) {
  const enrolled = await prisma.enrollment.findFirst({ where: { classId, studentId }, select: { id: true } });
  if (!enrolled) return false;
  await prisma.badge.create({ data: { studentId, badgeId, level: 1, givenById: teacherId, classId, title } });
  return true;
}

/** Old point rows (POINTS_KEEP_DAYS): from the daily cron, beside deleteOldPractice. */
export async function deleteOldPoints(now = new Date()) {
  const cutoff = new Date(now.getTime() - POINTS_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  await prisma.pointEvent.deleteMany({ where: { day: { lt: cutoff } } });
}

