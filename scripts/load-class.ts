/**
 * A class of Chromebooks, simulated (12 November 2026, before S&S CISD's band
 * class: "Run more tests to make sure we won't have issues tomorrow").
 *
 * A test teacher (Educator for a day) with a class of N student accounts on
 * the shared database, all clearly named "Load test", then every student
 * signing in and opening the practice page at once from this one address, as
 * a school does. Run it twice with a pause between: the second run meets
 * instances and a database that have gone to sleep, a class's first minute.
 *
 *   bun scripts/load-class.ts setup 30          # make the class (prints nothing secret)
 *   bun scripts/load-class.ts run https://www.abc-sightreading.com [ramp seconds]
 *   bun scripts/load-class.ts cleanup           # delete every test account and the class
 *
 * Pause the sign-up alerts while the test teacher exists (launchctl unload
 * ~/Library/LaunchAgents/com.blainecowen.abc-signup-alerts.plist), and load
 * them again after cleanup. Credentials stay in a 0600 file in /tmp.
 */
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const TEACHER_EMAIL = "load-test-teacher@abc-sightreading.invalid";
const CREDS = "/tmp/abc-load-class.json";
type Creds = { joinCode: string; students: { username: string; password: string }[] };

const [cmd, a1, a2] = process.argv.slice(2);

async function setup(n: number) {
  const { prisma } = await import("../src/lib/server/db");
  const { createStudentAccount } = await import("../src/lib/server/students");
  const auth = (await import("../src/lib/server/auth")).auth;
  const ctx = await auth.$context;
  const teacher =
    (await prisma.user.findFirst({ where: { email: TEACHER_EMAIL } })) ??
    (await ctx.internalAdapter.createUser({ email: TEACHER_EMAIL, name: "Load test teacher", emailVerified: true, accountType: "teacher" }, { method: "load-test" }));
  await prisma.accessGrant.create({ data: { userId: teacher.id, plan: "educator", expiresAt: new Date(Date.now() + 24 * 3600_000) } });
  const joinCode = "LT" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const cls = await prisma.class.create({ data: { userId: teacher.id, name: "Load test (delete me)", joinCode } });
  const students: Creds["students"] = [];
  for (let i = 1; i <= n; i++) {
    const username = `student${i}`;
    const password = `lt-${crypto.randomUUID()}`;
    const user = await createStudentAccount({ first: "Load", last: `Test ${i}`, joinCode, username, password });
    await prisma.enrollment.create({ data: { classId: cls.id, studentId: user.id, managed: true } });
    students.push({ username, password });
  }
  writeFileSync(CREDS, JSON.stringify({ joinCode, students } satisfies Creds));
  chmodSync(CREDS, 0o600);
  console.log(`class ${joinCode}: ${n} students`);
  process.exit(0);
}

async function cleanup() {
  const { prisma } = await import("../src/lib/server/db");
  const teacher = await prisma.user.findFirst({ where: { email: TEACHER_EMAIL }, select: { id: true } });
  if (!teacher) return console.log("nothing to clean up");
  const classes = await prisma.class.findMany({ where: { userId: teacher.id }, select: { id: true } });
  const enr = await prisma.enrollment.findMany({ where: { classId: { in: classes.map((c) => c.id) } }, select: { studentId: true } });
  const ids = enr.map((e) => e.studentId);
  const students = await prisma.user.deleteMany({ where: { id: { in: ids }, accountType: "student", name: { startsWith: "Load Test" } } });
  await prisma.user.delete({ where: { id: teacher.id } });
  if (existsSync(CREDS)) unlinkSync(CREDS);
  console.log(`deleted ${students.count} students, the teacher and ${classes.length} class`);
  process.exit(0);
}

/** What the practice page asks for as it opens, signed in (recorded from a browser). */
const PAGE_OPEN = (process.env.LOAD_PATHS ?? "/sightreading,/api/auth/get-session,/api/usage,/api/presets,/api/preferences,/api/tracks,/api/billing,/api/free-month,/api/gift,/api/student,/api/assignments,/api/recent").split(",");

async function run(base: string, rampSec: number) {
  const creds: Creds = JSON.parse(readFileSync(CREDS, "utf8"));
  const results: { path: string; status: number; ms: number }[] = [];
  const timed = async (path: string, init: RequestInit) => {
    const t = performance.now();
    let status = 0;
    try {
      const r = await fetch(base + path, { ...init, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      status = r.status;
      await r.arrayBuffer();
      return r;
    } catch {
      return null;
    } finally {
      results.push({ path, status, ms: performance.now() - t });
    }
  };
  const one = async (s: Creds["students"][number], i: number) => {
    await Bun.sleep((rampSec * 1000 * i) / creds.students.length);
    const r = await timed("/api/auth/sign-in/username", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ username: `${creds.joinCode.toLowerCase()}.${s.username}`, password: s.password }),
    });
    const cookie = (r?.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) return;
    // The page, then its requests all at once, as a browser sends them; then a second page view.
    for (let view = 0; view < 2; view++) {
      await timed(PAGE_OPEN[0], { headers: { cookie } });
      await Promise.all(PAGE_OPEN.slice(1).map((p) => timed(p, { headers: { cookie } })));
    }
  };
  const t0 = performance.now();
  await Promise.all(creds.students.map(one));
  const wall = ((performance.now() - t0) / 1000).toFixed(1);
  const by = new Map<string, number[]>();
  const bad: string[] = [];
  for (const r of results) {
    (by.get(r.path) ?? by.set(r.path, []).get(r.path)!).push(r.ms);
    if (r.status === 0 || r.status >= 500 || r.status === 429) bad.push(`${r.status || "timeout"} ${r.path}`);
  }
  const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
  console.log(`${creds.students.length} students, ${results.length} requests in ${wall} s`);
  for (const [path, xs] of by) console.log(`  ${path.padEnd(28)} n=${String(xs.length).padStart(3)}  p50 ${pct(xs, 0.5).toFixed(0).padStart(5)} ms  p95 ${pct(xs, 0.95).toFixed(0).padStart(5)} ms  max ${Math.max(...xs).toFixed(0).padStart(5)} ms`);
  const counts = new Map<string, number>();
  for (const b of bad) counts.set(b, (counts.get(b) ?? 0) + 1);
  console.log(bad.length ? `FAILED: ${[...counts].map(([k, v]) => `${v} × ${k}`).join(", ")}` : "no failures");
  process.exit(bad.length ? 1 : 0);
}

if (cmd === "setup") await setup(Number(a1 ?? 30));
else if (cmd === "cleanup") await cleanup();
else if (cmd === "run") await run(a1 ?? "https://dev.abc-sightreading.com", Number(a2 ?? 20));
else console.log("setup N | run BASE [ramp] | cleanup");
