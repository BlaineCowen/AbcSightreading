/**
 * Two school weeks of class life in a teacher's Demo classes (Blaine, 18
 * November 2026: "simulate the students in my demo class doing assignments,
 * earning badges, and so on, and show me what that looks like on my end").
 * The students are the ones scripts/demo-classes.ts made (real student
 * accounts, no email); nothing new signs up.
 *
 *   bun scripts/demo-activity.ts plan     EMAIL=...   # read only: what it would touch
 *   bun scripts/demo-activity.ts create   EMAIL=...
 *   bun scripts/demo-activity.ts remove   EMAIL=...   # puts everything back as it was
 *
 * What it makes, through the site's own code wherever the code can take a
 * day: an assignment in each Demo class and a game assignment in two (their
 * note says "Simulated"); for each school day of the last two weeks, some
 * students practise (a practice row for that day, as the practice page's
 * reports add up to) and are awarded for it by points.ts `award` on that day,
 * so points, streaks, levels and badges come out as the site makes them;
 * some game rounds on the game assignments (`recordGameResult`); last week
 * settled for each class (`closeWeek`: Weekly Winner, the board); a
 * teacher's badge or two. No graded attempts: one needs a real recording
 * and exercise, and a made-up one would open a broken page from the
 * gradebook.
 *
 * The database is the one the live site uses (dev, preview and production
 * share it), so the activity shows on the live site too, on this account's
 * Demo classes only. Before writing anything it checks every student it
 * touches is a student account enrolled in this teacher's Demo classes and
 * nowhere else. `remove` deletes what `create` made (the rows dated from the
 * run's start, the Simulated assignments, the weeks it settled) and puts back
 * the stats rows that were there before (kept in ~/.abc-demo-activity.json).
 *
 * Run with the environment in .env.local (`set -a; . ./.env.local; set +a`).
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { prisma } from "../src/lib/server/db";
import { award, closeWeek, giveBadge } from "../src/lib/server/points";
import { createGameAssignments, recordGameResult } from "../src/lib/server/game-assignments";
import { ladder } from "../src/lib/ladder";
import { checkRainSetup } from "../src/lib/games/note-rain";
import { checkSolfegeSetup } from "../src/lib/games/ear-quiz";

const mode = process.argv[2] ?? "plan";
const email = (process.env.EMAIL ?? "blaine.cowen@gmail.com").toLowerCase();
const MARK = "Simulated by scripts/demo-activity.ts";
const SNAPSHOT = `${homedir()}/.abc-demo-activity.json`;

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "?";
  }
})();
console.log(`Database: ${host}`);

const teacher = await prisma.user.findFirst({ where: { email }, select: { id: true, name: true } });
if (!teacher) throw new Error(`No account for ${email}`);
const classes = await prisma.class.findMany({
  where: { userId: teacher.id, name: { startsWith: "Demo: " } },
  orderBy: { position: "asc" },
  select: { id: true, name: true, enrollments: { select: { student: { select: { id: true, name: true, accountType: true } } } } },
});
if (!classes.length) throw new Error("No Demo classes: make them with scripts/demo-classes.ts create.");
const classIds = classes.map((c) => c.id);
const students = classes.flatMap((c) => c.enrollments.map((e) => ({ ...e.student, classId: c.id })));
const studentIds = students.map((s) => s.id);

// The guard: every student here is a student account, enrolled only in this teacher's Demo classes.
const outside = await prisma.enrollment.count({ where: { studentId: { in: studentIds }, classId: { notIn: classIds } } });
const notStudents = students.filter((s) => s.accountType !== "student");
if (outside || notStudents.length) throw new Error(`Refusing: ${outside} enrollments outside the Demo classes, ${notStudents.length} accounts that are not students.`);
console.log(`${teacher.name} (${email}): ${classes.map((c) => `${c.name} (${c.enrollments.length})`).join(", ")}`);

const counts = async () => ({
  points: await prisma.pointEvent.count({ where: { studentId: { in: studentIds } } }),
  stats: await prisma.studentStats.count({ where: { studentId: { in: studentIds } } }),
  badges: await prisma.badge.count({ where: { studentId: { in: studentIds } } }),
  practice: await prisma.practiceTime.count({ where: { studentId: { in: studentIds } } }),
  games: await prisma.gameAssignmentResult.count({ where: { studentId: { in: studentIds } } }),
  weeks: await prisma.classWeek.count({ where: { classId: { in: classIds } } }),
  simulated: (await prisma.assignment.count({ where: { classId: { in: classIds }, note: { contains: MARK } } })) + (await prisma.gameAssignment.count({ where: { classId: { in: classIds }, note: { contains: MARK } } })),
});

/** A steady random, so a run is the same each time. */
let seed = 20261118;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const mondayOf = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return ymd(d);
};

if (mode === "plan") {
  console.log("Now:", await counts());
  console.log(existsSync(SNAPSHOT) ? `A run is recorded in ${SNAPSHOT}: remove it before another.` : "No run recorded.");
} else if (mode === "create") {
  if (existsSync(SNAPSHOT)) throw new Error(`A run is already there (${SNAPSHOT}): remove it first.`);
  const before = await counts();
  if (before.simulated) throw new Error("Simulated assignments are already there: remove them first.");
  const startedAt = new Date();
  const stats = await prisma.studentStats.findMany({ where: { studentId: { in: studentIds } } });
  const weeks = await prisma.classWeek.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
  writeFileSync(SNAPSHOT, JSON.stringify({ email, startedAt: startedAt.toISOString(), stats, weeks: weeks.map((w) => w.id) }, null, 1), { mode: 0o600 });
  console.log("Before:", before);

  // The school days: the last two weeks to today, Monday to Friday.
  const days: string[] = [];
  for (let back = 13; back >= 0; back--) {
    const d = new Date(startedAt.getTime() - back * 86_400_000);
    if (d.getUTCDay() % 6 !== 0) days.push(ymd(d));
  }
  const due = ymd(new Date(startedAt.getTime() + 3 * 86_400_000));

  // An assignment in each class: a step of the class's level, so many minutes.
  const steps = ["sbs-04-notes", "sbs-06-notes", "sbs-03-rhythm"];
  const assignments: { classId: string; id: string; minutes: number }[] = [];
  for (const [i, c] of classes.entries()) {
    const step = ladder.find((s) => s.id === steps[i % steps.length])!;
    const minutes = [15, 20, 10][i % 3]!;
    const a = await prisma.assignment.create({
      data: {
        classId: c.id, presetKey: `step:${step.id}`, title: `Step ${ladder.indexOf(step) + 1}: ${(step as { title?: string }).title ?? step.id}`,
        page: "unison", minutes, dueAt: new Date(`${due}T23:59:59Z`), note: `${MARK}. Practice ${minutes} minutes this week.`,
        createdAt: new Date(`${days[0]}T14:00:00Z`),
      },
    });
    assignments.push({ classId: c.id, id: a.id, minutes });
  }
  // Game assignments: Note Rain for the first class, Solfège for the second.
  const games: { classId: string; id: string; game: "note-rain" | "solfege" }[] = [];
  const rain = await createGameAssignments(teacher.id, {
    game: "note-rain", setup: checkRainSetup({ clef: "treble", level: 3, speed: "medium", round: "storm", names: "letters" }), goal: { rounds: 2, score: 20 },
    title: "Note Rain: Level 3, The lines, treble, medium", dueAt: new Date(`${due}T23:59:59Z`), note: `${MARK}.`, classIds: [classes[0]!.id],
  });
  if (rain) games.push({ classId: classes[0]!.id, id: rain[0]!, game: "note-rain" });
  if (classes[1]) {
    const sol = await createGameAssignments(teacher.id, {
      game: "solfege", setup: checkSolfegeSetup({ level: 2 }), goal: { rounds: 1, score: 8 },
      title: "Solfège: Level 2", dueAt: new Date(`${due}T23:59:59Z`), note: `${MARK}.`, classIds: [classes[1].id],
    });
    if (sol) games.push({ classId: classes[1].id, id: sol[0]!, game: "solfege" });
  }

  // Each student keeps to a habit: some most days, some now and then, a few never.
  const habit = new Map(students.map((s) => [s.id, pick([0.85, 0.7, 0.55, 0.4, 0.25, 0])]));
  let practised = 0;
  for (const day of days) {
    for (const s of students) {
      if (rand() > habit.get(s.id)!) continue;
      const a = assignments.find((x) => x.classId === s.classId)!;
      const onAssignment = rand() < 0.7;
      const seconds = Math.round((4 + rand() * 18) * 60);
      const exercises = 1 + Math.floor(rand() * 5);
      const row = await prisma.practiceTime.findFirst({ where: { studentId: s.id, day, assignmentId: onAssignment ? a.id : null, page: "unison" }, select: { id: true } });
      if (row) await prisma.practiceTime.update({ where: { id: row.id }, data: { seconds: { increment: seconds }, exercises: { increment: exercises } } });
      else await prisma.practiceTime.create({ data: { studentId: s.id, day, assignmentId: onAssignment ? a.id : null, page: "unison", seconds, exercises } });
      // The exercises as the practice page reports them: steps near the class's.
      const base = 3 + classes.findIndex((c) => c.id === s.classId) * 2;
      await award(s.id, day, {
        credited: seconds, page: "unison", assignmentId: onAssignment ? a.id : null,
        exercises: Array.from({ length: Math.min(5, exercises) }, () => {
          const step = Math.max(1, base + Math.floor(rand() * 4) - 1);
          return { id: Math.random().toString(36).slice(2, 12), kind: "step" as const, key: `step:${step}`, label: `Step ${step}`, step, keySig: pick(["C", "F", "G", "D"]), minor: false, compound: false, bass: false, contest: false };
        }),
        grades: [],
      });
      practised++;
    }
  }
  // Game rounds on the game assignments.
  let rounds = 0;
  for (const g of games) {
    for (const s of students.filter((x) => x.classId === g.classId)) {
      if (habit.get(s.id)! < 0.3) continue;
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const score = g.game === "note-rain" ? 10 + Math.floor(rand() * 25) : 5 + Math.floor(rand() * 6);
        await recordGameResult(s.id, g.id, g.game, score, { checked: g.game === "solfege", round: `sim-${g.id}-${s.id}-${k}` });
        rounds++;
      }
    }
  }
  // Last week settled in each class: Weekly Winner and the board.
  const lastWeek = mondayOf(ymd(new Date(startedAt.getTime() - 7 * 86_400_000)));
  for (const c of classes) await closeWeek(c.id, lastWeek);
  // A teacher's badge for the hardest worker in each class.
  for (const c of classes) {
    const best = students.filter((s) => s.classId === c.id).sort((a, b) => habit.get(b.id)! - habit.get(a.id)!)[0];
    if (best) await giveBadge(teacher.id, c.id, best.id, "t-great-attitude", null);
  }
  console.log(`${practised} practice days, ${rounds} game rounds, last week (${lastWeek}) settled.`);
  console.log("After:", await counts());
} else if (mode === "remove") {
  if (!existsSync(SNAPSHOT)) throw new Error(`No run recorded (${SNAPSHOT}).`);
  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { email: string; startedAt: string; stats: Record<string, unknown>[]; weeks: string[] };
  if (snap.email !== email) throw new Error(`The run recorded is ${snap.email}'s.`);
  const since = new Date(snap.startedAt);
  const sim = await prisma.assignment.findMany({ where: { classId: { in: classIds }, note: { contains: MARK } }, select: { id: true } });
  const simGames = await prisma.gameAssignment.findMany({ where: { classId: { in: classIds }, note: { contains: MARK } }, select: { id: true } });
  await prisma.$transaction([
    prisma.pointEvent.deleteMany({ where: { studentId: { in: studentIds }, createdAt: { gte: since } } }),
    prisma.badge.deleteMany({ where: { studentId: { in: studentIds }, earnedAt: { gte: since } } }),
    prisma.practiceTime.deleteMany({ where: { studentId: { in: studentIds }, assignmentId: { in: sim.map((a) => a.id) } } }),
    prisma.practiceTime.deleteMany({ where: { studentId: { in: studentIds }, assignmentId: null, updatedAt: { gte: since } } }),
    prisma.gameAssignmentResult.deleteMany({ where: { assignmentId: { in: simGames.map((a) => a.id) } } }),
    prisma.gameAssignment.deleteMany({ where: { id: { in: simGames.map((a) => a.id) } } }),
    prisma.assignment.deleteMany({ where: { id: { in: sim.map((a) => a.id) } } }),
    prisma.classWeek.deleteMany({ where: { classId: { in: classIds }, id: { notIn: snap.weeks } } }),
    prisma.studentStats.deleteMany({ where: { studentId: { in: studentIds } } }),
  ]);
  // The stats rows as they were before the run.
  for (const s of snap.stats) {
    const row = { ...s } as Record<string, unknown>;
    for (const k of Object.keys(row)) if (typeof row[k] === "string" && /At$/.test(k)) row[k] = new Date(row[k] as string);
    await prisma.studentStats.create({ data: row as never });
  }
  unlinkSync(SNAPSHOT);
  console.log("Removed. Now:", await counts());
} else {
  console.log("plan, create or remove");
}
await prisma.$disconnect();
