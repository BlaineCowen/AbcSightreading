/**
 * Do points, streaks, badges and the weekly leaderboard work end to end?
 * (docs/claude/accounts-and-billing.md, Points.) Makes a test class "Points
 * test (delete me)" under the DEV_SIGN_IN_EMAIL account with four students,
 * runs the checks, and deletes it all again, also when a check fails.
 *
 * In the browser, as a student: a report cut off by the network is sent
 * again and earns; the 4th read of a step today earns half; the points card
 * shows; a made-up grade earns 0; the This week card; How points work closes
 * on Esc with focus back on its button; the Badges page. As the teacher
 * (owner): practising earns nothing, the board and the points panel open.
 * A student is sent away from the board.
 *
 * On the server, straight through award(): ten reports at once count
 * 10,10,10,5,5,5,3,3,3,3; one exercise sent twice counts once; a grade only
 * for an exercise practised, once; grades decay; no badge twice; a week
 * settled three times at once settles once.
 *
 * Points are owner only, so the dev server must know the owner:
 *
 *   E=$(grep '^DEV_SIGN_IN_EMAIL=' .env | cut -d= -f2- | tr -d '"')
 *   ADMIN_EMAILS="$E" BETTER_AUTH_URL=http://localhost:4399 bun run dev --port 4399
 *   APP=http://localhost:4399 bun run scripts/check-points.ts
 *
 * It writes to the shared database (Production's): the test rows only, all
 * deleted at the end. The sign-up alert watcher is paused while the test
 * students exist and started again after.
 */
import puppeteer, { type Page } from "../marketing/ad/node_modules/puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const APP = process.env.APP ?? "http://localhost:4321";
const NAME = "Points test (delete me)";
const ownerEmail = (process.env.DEV_SIGN_IN_EMAIL ?? "").toLowerCase();
if (!ownerEmail) throw new Error("DEV_SIGN_IN_EMAIL is not set (.env)");
// award() below runs in this process, and points are on only for an owner's classes.
process.env.ADMIN_EMAILS ||= ownerEmail;

const { prisma } = await import("../src/lib/server/db");
const pts = await import("../src/lib/server/points");
const { weekOf, previousWeek } = await import("../src/lib/points");
const { createStudentAccount } = await import("../src/lib/server/students");

let fails = 0;
const ok = (cond: unknown, what: string, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${what}${extra ? `  (${extra})` : ""}`);
  if (!cond) fails++;
};
const d = new Date();
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const week = weekOf(day);

const ALERTS = `${homedir()}/Library/LaunchAgents/com.blainecowen.abc-signup-alerts.plist`;
const alerts = (verb: "load" | "unload") => {
  if (existsSync(ALERTS)) try { execSync(`launchctl ${verb} ${ALERTS}`, { stdio: "ignore" }); } catch {}
};

async function cleanup() {
  const classes = await prisma.class.findMany({ where: { name: NAME }, select: { id: true } });
  const ids = classes.map((c) => c.id);
  const enr = await prisma.enrollment.findMany({ where: { classId: { in: ids } }, select: { studentId: true } });
  await prisma.user.deleteMany({ where: { id: { in: enr.map((e) => e.studentId) }, accountType: "student" } });
  await prisma.classWeek.deleteMany({ where: { classId: { in: ids } } });
  await prisma.class.deleteMany({ where: { id: { in: ids } } });
}

const owner = await prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } });
if (!owner) throw new Error("no account for DEV_SIGN_IN_EMAIL");
const res = await fetch(APP + "/").catch(() => null);
if (!res?.ok) throw new Error(`no dev server at ${APP}`);

alerts("unload");
await cleanup(); // a run that died half way
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, defaultViewport: { width: 1280, height: 900 } });
try {
  // ── The class: Maya (level 5, three Step 2 reads today, a streak), two classmates ahead, Sam for the server checks.
  const joinCode = "PT" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const cls = await prisma.class.create({ data: { userId: owner.id, name: NAME, joinCode, position: 999 } });
  const students: { id: string; username: string; password: string }[] = [];
  for (const [i, [first, last]] of [["Maya", "Rivera"], ["Jonah", "Park"], ["Ava", "Torres"], ["Sam", "Lee"]].entries()) {
    const password = "pt-" + crypto.randomUUID();
    const u = await createStudentAccount({ first, last, joinCode, username: "pt" + (i + 1), password });
    await prisma.enrollment.create({ data: { classId: cls.id, studentId: u.id, managed: true } });
    students.push({ id: u.id, username: `${joinCode.toLowerCase()}.pt${i + 1}`, password });
  }
  const [maya, jonah, ava, sam] = students;
  await prisma.studentStats.create({ data: { studentId: maya.id, level: 5, steps: { "5": 3, "2": 3 }, exercises: 9, streak: 2, bestStreak: 2, streakDay: previousSchoolDay(day), seconds: 3000 } });
  await prisma.pointEvent.createMany({ data: [1, 2, 3].map((i) => ({ studentId: maya.id, day, week, kind: "exercise", key: `step:2#seed${i}`, points: 5 })) });
  await prisma.practiceTime.create({ data: { studentId: maya.id, day, page: "unison", seconds: 300, exercises: 3 } });
  await prisma.pointEvent.createMany({ data: [
    { studentId: jonah.id, day, week, kind: "exercise", key: "step:9#seed", points: 540 },
    { studentId: ava.id, day, week, kind: "exercise", key: "step:7#seed", points: 448 },
  ] });
  // award() writes a student's stats row with their first points; the seeded rows need one too.
  await prisma.studentStats.createMany({ data: [{ studentId: jonah.id }, { studentId: ava.id }] });

  // ── In the browser, as Maya.
  const sctx = await browser.createBrowserContext();
  const p = await sctx.newPage();
  const errors: string[] = [];
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => errors.push("pageerror " + String(e).slice(0, 160)));
  await p.goto(APP + "/login", { waitUntil: "networkidle2" });
  const st = await p.evaluate(async (u, pw) => (await fetch("/api/auth/sign-in/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: pw }) })).status, maya.username, maya.password);
  ok(st === 200, "student signs in");

  // The first report carrying an exercise is cut off; the next one must carry it again.
  let cut = 0;
  const reports: { req: any; res: any }[] = [];
  await p.setRequestInterception(true);
  p.on("request", (req) => {
    if (req.url().endsWith("/api/practice") && req.method() === "POST" && !cut && /"exercises":\[\{/.test(req.postData() ?? "")) { cut++; return req.abort("internetdisconnected"); }
    return req.continue();
  });
  p.on("response", async (r) => {
    if (!r.url().endsWith("/api/practice")) return;
    try { reports.push({ req: JSON.parse(r.request().postData() ?? "null"), res: await r.json() }); } catch {}
  });
  await p.goto(APP + "/sightreading?step=sbs-02-rhythm", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));
  if (!(await p.$("#paper svg"))) await clickButton(p, /New exercise/);
  await p.waitForSelector("#paper svg", { timeout: 60000 });
  ok(true, "student practice page draws a score");
  for (let i = 0; i < 75 && !(await p.$(".toast")); i++) { await p.mouse.move(200 + (i % 7), 300); await new Promise((r) => setTimeout(r, 1000)); }
  ok(cut === 1, "the first points report was cut off by the network");
  const carried = reports.find((r) => r.req?.points?.exercises?.length);
  ok(carried, "a later report carried the exercise again");
  ok(carried?.res?.points?.earned?.[0]?.points === 3, "and it earned 3 (the 4th Step 2 read today counts half)", JSON.stringify(carried?.res?.points?.earned ?? null).slice(0, 160));
  ok(await p.$(".toast"), "the points card showed on the page");

  const fake = await p.evaluate(async (day) => (await fetch("/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seconds: 0, exercises: 0, page: "unison", day, points: { exercises: [], grades: [{ exerciseId: "never-read", kind: "step", key: "step:5", label: "Step 5", step: 5, score: 100, pitch: 100, rhythm: 100, clapped: false }] } }) })).json(), day);
  ok(!fake?.points?.earned?.length, "a made-up grade earns 0");

  await p.goto(APP + "/", { waitUntil: "networkidle2" });
  await p.waitForFunction(() => document.body.innerText.includes("This week"), { timeout: 30000 });
  const shown = Number(await p.$eval(".stat b", (el) => el.textContent));
  ok(shown > 0, "This week card shows the points", String(shown));
  await clickButton(p, /How points work/);
  await p.waitForSelector("dialog[open] #rules-h", { timeout: 5000 });
  ok(true, "How points work opens");
  await p.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 400));
  ok(!(await p.$("dialog[open]")), "Esc closes it");
  ok(await p.evaluate(() => /How points work/.test(document.activeElement?.textContent ?? "")), "focus returns to How points work");
  await p.goto(APP + "/badges", { waitUntil: "networkidle2" });
  ok(await p.evaluate(() => /On a Roll/.test(document.body.innerText) && /First Note/.test(document.body.innerText)), "Badges page lists badges");
  const real = errors.filter((e) => !e.includes("ERR_INTERNET_DISCONNECTED")); // the cut above
  ok(!real.length, "student pages: no console errors besides the planned cut", real.join(" | "));
  const board = await sctx.newPage();
  await board.goto(APP + "/winners/" + cls.id, { waitUntil: "networkidle2" });
  ok(!board.url().includes("/winners/"), "a student is sent away from the board");
  await sctx.close();

  // ── In the browser, as the teacher (the owner).
  const tctx = await browser.createBrowserContext();
  const tp = await tctx.newPage();
  const terr: string[] = [];
  tp.on("pageerror", (e) => terr.push(String(e).slice(0, 160)));
  await tp.goto(APP + "/login", { waitUntil: "networkidle2" });
  await Promise.all([tp.waitForNavigation({ timeout: 20000 }).catch(() => {}), clickButton(tp, /Sign in as/)]);
  const own = await tp.evaluate(async (day) => (await fetch("/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seconds: 30, exercises: 1, page: "unison", day, points: { exercises: [{ id: "t1", kind: "step", key: "step:3", label: "Step 3", step: 3 }], grades: [] } }) })).json(), day);
  ok(own?.logged !== undefined && !own?.points, "a teacher's practice earns no points");
  const w = await tp.goto(APP + "/winners/" + cls.id, { waitUntil: "networkidle2" });
  ok(w?.status() === 200 && (await tp.evaluate(() => /top readers/.test(document.body.innerText))), "the board opens for the class's teacher");
  await tp.goto(APP + "/account#classes", { waitUntil: "networkidle2" });
  await tp.waitForFunction((n) => document.body.innerText.includes(n), { timeout: 30000 }, NAME);
  await tp.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /Points and badges/.test(b.textContent ?? "")).pop()?.click());
  await tp.waitForFunction(() => document.body.innerText.includes("Weekly leaderboard"), { timeout: 20000 });
  ok(true, "the teacher's points panel opens");
  ok(!terr.length, "teacher pages: no page errors", terr.join(" | "));
  await tctx.close();

  // ── On the server, straight through award(), as Sam.
  await prisma.practiceTime.create({ data: { studentId: sam.id, day, page: "unison", seconds: 1200, exercises: 0 } });
  const ex = (id: string) => ({ id, kind: "step" as const, key: "x", label: "Step 3", step: 3, keySig: null, minor: false, compound: false, bass: false, contest: false });
  const base = { credited: 0, page: "unison", assignmentId: null, grades: [] as any[] };
  await Promise.all(Array.from({ length: 10 }, (_, i) => pts.award(sam.id, day, { ...base, exercises: [ex("e" + i)] } as any)));
  const evs = await prisma.pointEvent.findMany({ where: { studentId: sam.id, kind: "exercise" }, orderBy: { createdAt: "asc" } });
  ok(evs.map((e) => e.points).join(",") === "10,10,10,5,5,5,3,3,3,3", "ten reports at once count 10,10,10,5,5,5,3,3,3,3", evs.map((e) => e.points).join(","));
  ok((await prisma.studentStats.findUnique({ where: { studentId: sam.id } }))?.exercises === 10, "and the stats count 10 exercises");
  await Promise.all([pts.award(sam.id, day, { ...base, exercises: [ex("dup")] } as any), pts.award(sam.id, day, { ...base, exercises: [ex("dup")] } as any)]);
  ok((await prisma.pointEvent.count({ where: { studentId: sam.id, key: { endsWith: "#dup" } } })) === 1, "one exercise sent twice at once counts once");
  const g = (exerciseId: string, score: number) => ({ exerciseId, kind: "step", key: "x", label: "Step 3", step: 3, score, pitch: score, rhythm: score, clapped: false });
  ok((await pts.award(sam.id, day, { ...base, exercises: [], grades: [g("never", 100)] } as any))?.total === 0, "a grade for an exercise never practised earns 0");
  ok(((await pts.award(sam.id, day, { ...base, exercises: [], grades: [g("e0", 86)] } as any))?.total ?? 0) > 0, "a grade for a practised one earns");
  ok((await pts.award(sam.id, day, { ...base, exercises: [], grades: [g("e0", 86)] } as any))?.total === 0, "the same grade again earns 0");
  const gs: (number | undefined)[] = [];
  for (const id of ["e1", "e2", "e3", "e4"]) gs.push((await pts.award(sam.id, day, { ...base, exercises: [], grades: [g(id, 70)] } as any))?.earned.find((e) => e.label.startsWith("Graded"))?.points);
  ok(gs.join(",") === "10,10,5,5", "grades on the same step decay (e0 was the 1st)", gs.join(","));
  const dups: unknown[] = await prisma.$queryRaw`SELECT "badgeId", level FROM badge WHERE "studentId" = ${sam.id} GROUP BY 1,2 HAVING count(*) > 1`;
  ok(!dups.length, "no badge given twice");
  const last = previousWeek(week);
  await prisma.pointEvent.create({ data: { studentId: ava.id, day: last, week: last, kind: "exercise", key: "step:1#w", points: 50 } });
  await Promise.all([pts.closeWeek(cls.id, last), pts.closeWeek(cls.id, last), pts.closeLastWeeks()]);
  ok((await prisma.classWeek.count({ where: { classId: cls.id, week: last } })) === 1, "a week settled three times at once settles once");
  ok((await prisma.badge.count({ where: { studentId: ava.id, badgeId: "weekly-winner" } })) === 1, "and its winner gets one Weekly Winner badge");
} catch (e) {
  fails++;
  console.log("FAIL", e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  await cleanup();
  alerts("load");
  const left = await prisma.class.count({ where: { name: NAME } });
  console.log(left ? `FAIL ${left} test classes left over` : "test data deleted");
  console.log(fails ? `${fails} FAILED` : "all checks passed");
  process.exit(fails || left ? 1 : 0);
}

async function clickButton(page: Page, re: RegExp) {
  await page.evaluate((src) => [...document.querySelectorAll("button")].find((b) => new RegExp(src).test(b.textContent ?? ""))?.click(), re.source);
}

/** The school day before `day` (Friday before a Monday), so Maya's streak carries on today. */
function previousSchoolDay(day: string): string {
  let t = new Date(`${day}T12:00:00Z`).getTime();
  do t -= 86_400_000; while ([0, 6].includes(new Date(t).getUTCDay()));
  return new Date(t).toISOString().slice(0, 10);
}
