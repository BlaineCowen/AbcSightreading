/**
 * Do game assignments work end to end? (src/lib/game-assignments.ts,
 * docs/claude/games.md, Assigning a game.) Two classes of the owner's,
 * "Game assign test (delete me)" A and B, with a student in each:
 * - the teacher sets Solfège up (Level 3, in F) and uses Assign to classes:
 *   one assignment a class chosen, with the setup and goal as chosen;
 * - Kim (class A) sees it with her assignments, opens it: the banner, no
 *   levels or Customize, a round dealt from the stored setup even when the
 *   browser asks for another, marked on the server, counted once;
 * - Note Rain's rounds are reported by the device (checked false);
 * - Lou (class B only) can't open class A's; the teacher's view counts who
 *   is done; Remove deletes it and its rounds.
 *
 * It writes to the shared database (Production's): the test classes and
 * students, deleted at the end; the sign-up alert watcher is paused while
 * they exist. The dev server must know the owner (as check-ear-games.ts):
 *
 *   E=$(grep '^DEV_SIGN_IN_EMAIL=' .env | cut -d= -f2- | tr -d '"')
 *   ADMIN_EMAILS="$E" BETTER_AUTH_URL=http://localhost:4399 bun run dev --port 4399
 *   APP=http://localhost:4399 bun run scripts/check-game-assignments.ts
 */
import puppeteer, { type Page } from "../marketing/ad/node_modules/puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const APP = process.env.APP ?? "http://localhost:4321";
const NAME = "Game assign test (delete me)";
const ownerEmail = (process.env.DEV_SIGN_IN_EMAIL ?? "").toLowerCase();
if (!ownerEmail) throw new Error("DEV_SIGN_IN_EMAIL is not set (.env)");
process.env.ADMIN_EMAILS ||= ownerEmail;

const { prisma } = await import("../src/lib/server/db");
const { createStudentAccount } = await import("../src/lib/server/students");
const { solfegeRound, checkSolfegeSetup, pcOf } = await import("../src/lib/games/ear-quiz");

let fails = 0;
const ok = (cond: unknown, what: string, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${what}${extra ? `  (${extra})` : ""}`);
  if (!cond) fails++;
};
const d = new Date();
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ALERTS = `${homedir()}/Library/LaunchAgents/com.blainecowen.abc-signup-alerts.plist`;
const alerts = (verb: "load" | "unload") => {
  if (existsSync(ALERTS)) try { execSync(`launchctl ${verb} ${ALERTS}`, { stdio: "ignore" }); } catch {}
};
async function cleanup() {
  const ids = (await prisma.class.findMany({ where: { name: { startsWith: NAME } }, select: { id: true } })).map((c) => c.id);
  const enr = await prisma.enrollment.findMany({ where: { classId: { in: ids } }, select: { studentId: true } });
  await prisma.user.deleteMany({ where: { id: { in: enr.map((e) => e.studentId) }, accountType: "student" } });
  await prisma.class.deleteMany({ where: { id: { in: ids } } });
}
const post = (p: Page, url: string, body: unknown, method = "POST") =>
  p.evaluate(async (u, b, m) => { const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: b === null ? undefined : JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; }, url, body as never, method);

const owner = await prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } });
if (!owner) throw new Error("no account for DEV_SIGN_IN_EMAIL");
if (!(await fetch(APP + "/").catch(() => null))?.ok) throw new Error(`no dev server at ${APP}`);

alerts("unload");
await cleanup();
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 900 } });
try {
  const classes = [];
  const kids: { id: string; username: string; password: string }[] = [];
  for (const [k, first] of [["A", "Kim"], ["B", "Lou"]] as const) {
    const joinCode = "GA" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const cls = await prisma.class.create({ data: { userId: owner.id, name: `${NAME} ${k}`, joinCode, position: 998 } });
    classes.push(cls);
    const password = "ga-" + crypto.randomUUID();
    const u = await createStudentAccount({ first, last: "Game", joinCode, username: "ga1", password });
    await prisma.enrollment.create({ data: { classId: cls.id, studentId: u.id, managed: true } });
    kids.push({ id: u.id, username: `${joinCode.toLowerCase()}.ga1`, password });
  }
  const [clsA, clsB] = classes;
  const [kim, lou] = kids;

  // ── The teacher: Solfège Level 3 in F, assigned to class A from the game's own page.
  const tctx = await browser.createBrowserContext();
  const t = await tctx.newPage();
  await t.goto(APP + "/login", { waitUntil: "networkidle2" });
  await Promise.all([t.waitForNavigation({ timeout: 20000 }).catch(() => {}), t.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Sign in as/.test(b.textContent ?? "")) as HTMLElement).click())]);
  await t.goto(APP + "/games/solfege", { waitUntil: "networkidle2" });
  await t.evaluate(() => localStorage.removeItem("sr-solfege-ear"));
  await t.reload({ waitUntil: "networkidle2" });
  await t.click('[data-game-levels="solfege"] [data-level="2"]');
  await t.evaluate(() => ([...document.querySelectorAll('[aria-label="Key"] button')].find((b) => b.textContent?.trim() === "F") as HTMLElement).click());
  await t.waitForSelector("[data-assign-game]", { timeout: 10000 });
  ok(true, "the teacher has Assign to classes under the setup");
  await t.click("[data-assign-game]");
  await t.waitForSelector("dialog.sr-modal[open]");
  await t.evaluate((name) => { const l = [...document.querySelectorAll("dialog label")].find((x) => x.textContent?.includes(name)); (l?.querySelector("input") as HTMLInputElement).click(); }, clsA.name);
  await t.select('dialog select[aria-label="Rounds"]', "2");
  await t.select('dialog select[aria-label="Score"]', "8");
  await t.click("[data-assign-confirm]");
  await t.waitForFunction(() => /Assigned to/.test(document.body.textContent ?? ""), { timeout: 10000 });
  const made = await prisma.gameAssignment.findMany({ where: { classId: { in: [clsA.id, clsB.id] } } });
  const sa = made[0];
  const ss = sa?.setup as Record<string, unknown> | undefined;
  ok(made.length === 1 && sa?.classId === clsA.id, "one assignment, in class A only", String(made.length));
  ok(sa?.game === "solfege" && ss?.level === 3 && ss?.key === "F", "its setup is the one on the page: Level 3, in F", JSON.stringify(ss));
  // Field by field: Postgres keeps JSON with its keys in an order of its own.
  const goal = sa?.goal as { rounds?: number; score?: number } | undefined;
  ok(goal?.rounds === 2 && goal?.score === 8, "and its goal: 2 rounds of 8 or more", JSON.stringify(sa?.goal));
  ok(/Up to so, in F/.test(sa?.title ?? ""), "its title says what it is", sa?.title);
  // Note Rain, by the API (three notes, bass), to class A.
  const nr = await post(t, "/api/game-assignments", { game: "note-rain", setup: { level: 1, clef: "bass", speed: "fast" }, goal: { rounds: 1, score: 20 }, classIds: [clsA.id] });
  ok(nr.status === 201, "Note Rain assigned too", JSON.stringify(nr.body));
  const notMine = await post(t, "/api/game-assignments", { game: "note-rain", setup: {}, goal: {}, classIds: ["nope"] });
  ok(notMine.status === 404, "a class that isn't the teacher's is refused");

  // ── Kim, in class A.
  const kctx = await browser.createBrowserContext();
  const k = await kctx.newPage();
  const errors: string[] = [];
  k.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await k.goto(APP + "/login", { waitUntil: "networkidle2" });
  ok((await post(k, "/api/auth/sign-in/username", { username: kim.username, password: kim.password })).status === 200, "Kim signs in");
  const list = await post(k, "/api/game-assignments", null, "GET");
  ok(list.body?.assignments?.length === 2, "Kim's list has both games", String(list.body?.assignments?.length));
  await k.goto(APP + "/account", { waitUntil: "networkidle2" });
  await k.waitForSelector("[data-student-game]", { timeout: 10000 }).catch(() => {});
  const links = await k.evaluate(() => [...document.querySelectorAll("[data-student-game]")].map((a) => (a as HTMLAnchorElement).getAttribute("href")));
  ok(links.length === 2 && links.some((h) => h?.startsWith("/games/solfege?ga=")), "her assignments list shows them, Solfège linking to its game", links.join(" "));

  await k.goto(`${APP}/games/solfege?ga=${sa!.id}`, { waitUntil: "networkidle2" });
  await k.waitForSelector("[data-game-assignment]", { timeout: 10000 });
  ok(!(await k.$("[data-game-levels]")) && !(await k.$("[data-assign-game]")), "opened from it: the banner, and no levels, Customize or Assign");
  // A round: the browser asks for Level 1, the server deals Level 3 in F (the assignment's).
  let token = "";
  k.on("response", async (r) => { if (r.url().endsWith("/api/games/round")) try { token = (await r.json()).token; } catch {} });
  await k.evaluate(() => localStorage.setItem("sr-solfege-ear", JSON.stringify({ level: 1 })));
  await k.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Start/.test(b.textContent ?? "")) as HTMLElement).click());
  for (let i = 0; i < 50 && !token; i++) await new Promise((r) => setTimeout(r, 100));
  const tk = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
  ok(tk.ga === sa!.id && tk.s.level === 3 && tk.s.key === "F", "the round is dealt from the assignment's setup, in its token", JSON.stringify({ ga: tk.ga, level: tk.s.level, key: tk.s.key }));
  const answers = solfegeRound(checkSolfegeSetup(tk.s), tk.seed).questions.map(pcOf);
  for (const a of answers) {
    await k.waitForFunction(() => document.querySelector('[data-ear-quiz="solfege"]')?.getAttribute("data-phase") === "ask" && !(document.querySelector("[data-answer]") as HTMLButtonElement)?.disabled, { timeout: 15000, polling: 20 });
    await k.click(`[data-answer="${a}"]`);
  }
  await k.waitForSelector("[data-result]", { timeout: 30000 });
  await k.waitForFunction(() => /1 of 2 so far/.test(document.querySelector("[data-assignment-progress]")?.textContent ?? ""), { timeout: 10000 }).catch(() => {});
  ok(/1 of 2 so far/.test(await k.evaluate(() => document.querySelector("[data-assignment-progress]")?.textContent ?? "")), "after a round of 10: 1 of 2 so far, on the banner");
  const rows = await prisma.gameAssignmentResult.findMany({ where: { assignmentId: sa!.id, studentId: kim.id } });
  ok(rows.length === 1 && rows[0]!.score === 10 && rows[0]!.checked, "its row: 10, marked by the server", JSON.stringify(rows.map((r) => [r.score, r.checked])));
  const again = await post(k, "/api/games/finish", { token, answers });
  const rows2 = await prisma.gameAssignmentResult.count({ where: { assignmentId: sa!.id, studentId: kim.id } });
  ok(again.status === 200 && rows2 === 1, "the same round sent again counts once", String(rows2));
  const forgedEar = await post(k, `/api/game-assignments/${sa!.id}/result`, { game: "solfege", score: 10 });
  ok(forgedEar.status === 400, "an ear game's score can't be reported by the device");
  // Note Rain: reported by the device.
  const nrId = nr.body.ids[0];
  const nrRes = await post(k, `/api/game-assignments/${nrId}/result`, { game: "note-rain", score: 27 });
  ok(nrRes.body?.progress?.status === "done", "a Note Rain round of 27 (goal 20) is done", JSON.stringify(nrRes.body));
  const nrRow = await prisma.gameAssignmentResult.findFirst({ where: { assignmentId: nrId } });
  ok(nrRow?.checked === false && nrRow.score === 27, "its row says the device reported it");
  await k.goto(`${APP}/games/note-rain?ga=${nrId}`, { waitUntil: "networkidle2" });
  await k.waitForSelector("[data-game-assignment]", { timeout: 10000 });
  ok(await k.evaluate(() => document.querySelector("[data-game-assignment]")?.getAttribute("data-status") === "done"), "Note Rain's banner says done");
  await k.setViewport({ width: 375, height: 800 });
  await k.reload({ waitUntil: "networkidle2" });
  ok(await k.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "at phone width nothing runs off the side");
  ok(!errors.length, "Kim's pages: no errors", errors.join(" | "));

  // ── Lou, in class B only.
  const lctx = await browser.createBrowserContext();
  const l = await lctx.newPage();
  await l.goto(APP + "/login", { waitUntil: "networkidle2" });
  await post(l, "/api/auth/sign-in/username", { username: lou.username, password: lou.password });
  ok((await post(l, `/api/game-assignments/${sa!.id}`, null, "GET")).status === 404, "Lou can't open class A's assignment");
  ok((await post(l, "/api/games/round", { game: "solfege", setup: {}, day, assignment: sa!.id })).status === 400, "nor be dealt a round on it");
  ok((await post(l, `/api/game-assignments/${nrId}/result`, { game: "note-rain", score: 99 })).status === 404, "nor report a round to it");

  // ── The teacher's view, and Remove.
  const view = await post(t, `/api/classes/${clsA.id}/game-assignments`, null, "GET");
  const v = view.body?.assignments ?? [];
  ok(v.find((x: { game: string }) => x.game === "note-rain")?.done === 1 && v.find((x: { game: string }) => x.game === "solfege")?.done === 0, "the teacher sees Note Rain done by 1, Solfège by none yet");
  await t.goto(APP + "/teach", { waitUntil: "networkidle2" });
  const del = await post(t, `/api/game-assignments/${sa!.id}`, null, "DELETE");
  ok(del.status === 200 && (await prisma.gameAssignmentResult.count({ where: { assignmentId: sa!.id } })) === 0, "Remove deletes it and its rounds");
  await tctx.close();
  await kctx.close();
  await lctx.close();
} finally {
  await browser.close();
  await cleanup();
  const left = await prisma.gameAssignment.count({ where: { class: { name: { startsWith: NAME } } } });
  ok(left === 0, "cleaned up");
  alerts("load");
  console.log(fails ? `${fails} failed` : "all checks passed");
  process.exit(fails ? 1 : 0);
}
