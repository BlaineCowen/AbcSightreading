/**
 * Demo classes on a teacher's account, to try the class and student pages
 * with students in them (Blaine, 13 October 2026). Every class is named
 * "Demo: ..." and its students are made by the same roster code as "I make
 * their logins", so they are real student accounts (no email) that can sign in.
 *
 *   bun run scripts/demo-classes.ts list   EMAIL=...   # read only
 *   bun run scripts/demo-classes.ts create EMAIL=...
 *   bun run scripts/demo-classes.ts remove EMAIL=...   # the Demo classes and the students they made
 *
 * The database is the one the live site uses (dev shares it): run with the
 * environment in .env.local (`set -a; . ./.env.local; set +a`).
 */
import { prisma } from "../src/lib/server/db";
import { addRoster, seatInfo } from "../src/lib/server/students";
import { newJoinCode } from "../src/lib/server/educator";
import { STEP_BY_STEP } from "../src/lib/curriculum/catalogue";
import { trackById } from "../src/lib/curriculum/tracks";
import { ladder as LADDER } from "../src/lib/ladder";

const mode = process.argv[2] ?? "list";
const email = (process.env.EMAIL ?? "blaine.cowen@gmail.com").toLowerCase();
const PREFIX = "Demo: ";

const trumpet = Object.keys(trackById).find((id) => /trumpet/.test(id)) ?? null;
const DEMO = [
  {
    name: "Demo: 6th Grade Choir",
    course: STEP_BY_STEP,
    passed: 5,
    students: ["Maria Garcia", "Bao Nguyen", "Aiden Smith", "Sofia Hernandez", "Liam Johnson", "Ava Williams", "Noah Brown", "Isabella Martinez", "Elijah Davis", "Mia Rodriguez", "Lucas Wilson", "Amelia Lopez", "Mateo Gonzalez", "Harper Anderson"],
  },
  {
    name: "Demo: Varsity Treble Choir",
    course: null,
    passed: 0,
    students: ["Chloe Thomas", "Zoe Taylor", "Layla Moore", "Grace Jackson", "Nora Martin", "Lily Lee", "Hannah Perez", "Aria Thompson", "Ella White", "Riley Harris"],
  },
  {
    name: "Demo: Beginning Trumpets",
    course: trumpet,
    passed: 3,
    students: ["Jayden Clark", "Ethan Lewis", "Caleb Robinson", "Owen Walker", "Ryan Young", "Dylan Allen", "Gavin King", "Isaac Wright"],
  },
];

const teacher = await prisma.user.findFirst({ where: { email }, select: { id: true, name: true, accountType: true } });
if (!teacher) throw new Error(`No account for ${email}`);
const classes = await prisma.class.findMany({ where: { userId: teacher.id }, select: { id: true, name: true, joinCode: true, _count: { select: { enrollments: true } } }, orderBy: { position: "asc" } });

if (mode === "list") {
  console.log(`${teacher.name} (${email}), ${teacher.accountType}; seats`, await seatInfo(teacher.id));
  for (const c of classes) console.log(`  ${c.name}  code ${c.joinCode ?? "-"}  ${c._count.enrollments} students`);
} else if (mode === "create") {
  if (classes.some((c) => c.name.startsWith(PREFIX))) throw new Error("Demo classes are already there: remove them first.");
  const seats = await seatInfo(teacher.id);
  const needed = DEMO.reduce((a, d) => a + d.students.length, 0);
  if (seats.left < needed) throw new Error(`${needed} demo students need seats and ${seats.left} are left.`);
  let position = classes.length;
  for (const d of DEMO) {
    const cls = await prisma.class.create({ data: { userId: teacher.id, name: d.name, position: position++, course: d.course, joinCode: await newJoinCode() } });
    const roster = d.students.map((n) => ({ first: n.split(" ")[0], last: n.split(" ").slice(1).join(" ") }));
    const r = await addRoster(teacher.id, cls.id, roster as any);
    if ("error" in r) throw new Error(r.error);
    // Steps passed, a week apart, ending yesterday.
    const steps = d.course === STEP_BY_STEP ? LADDER.slice(0, d.passed).map((s) => `step:${s.id}`) : d.course ? Array.from({ length: d.passed }, (_, i) => `track:${d.course}-${String(i + 1).padStart(2, "0")}:rhythm`) : [];
    for (const [i, key] of steps.entries()) {
      await prisma.classProgress.create({ data: { classId: cls.id, presetKey: key, passedAt: new Date(Date.now() - (steps.length - i) * 7 * 864e5) } });
    }
    console.log(`${d.name}: code ${r.joinCode}, ${r.created.length} students, ${steps.length} marked passed`);
    for (const s of r.created) console.log(`    ${s.name.padEnd(20)} ${s.username.padEnd(14)} ${s.password}`);
  }
} else if (mode === "remove") {
  const demo = classes.filter((c) => c.name.startsWith(PREFIX));
  for (const c of demo) {
    const made = await prisma.enrollment.findMany({ where: { classId: c.id, managed: true }, select: { studentId: true } });
    await prisma.user.deleteMany({ where: { id: { in: made.map((m) => m.studentId) }, accountType: "student" } });
    await prisma.class.delete({ where: { id: c.id } });
    console.log(`removed ${c.name} and ${made.length} students`);
  }
  if (!demo.length) console.log("no Demo classes");
}
await prisma.$disconnect();
