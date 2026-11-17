/**
 * Do ear-training games earn points as they should? (docs/claude/games.md,
 * Ear training; points.ts, the games section.) A class of the owner's with
 * two test students, "Ear test (delete me)":
 * - on the server, through award(): nothing while the class's Games switch is
 *   off, and at once when it is turned on; a point a right answer and 5 for
 *   all right, nothing under 7; the same round twice counts once, even sent
 *   on another day; half below the student's level and on Custom; two rounds
 *   of 9+ make a level theirs; less for the same game again today; at most
 *   50 a day from games; Good Ears counts the right answers;
 * - over HTTP: a round finished too fast counts nothing; someone else's token
 *   is refused; a forged token is refused;
 * - in the browser, as the second student: a whole Solfège round played (the answers
 *   read from the round's token, as the server deals it), the result card,
 *   +points, the points card, and the point row in the database; the
 *   teacher's Points tab has the switch; then a whole Interval round (Level 2,
 *   either direction), all right; signed out, a round plays and no
 *   points are promised.
 *
 * It writes to the shared database (Production's): the test class and
 * students, deleted at the end; the sign-up alert watcher is paused while
 * they exist. The dev server must know the owner:
 *
 *   E=$(grep '^DEV_SIGN_IN_EMAIL=' .env | cut -d= -f2- | tr -d '"')
 *   ADMIN_EMAILS="$E" BETTER_AUTH_URL=http://localhost:4399 bun run dev --port 4399
 *   APP=http://localhost:4399 bun run scripts/check-ear-games.ts   # SHOTS=<dir>
 */
import puppeteer, { type Page } from "../marketing/ad/node_modules/puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const APP = process.env.APP ?? "http://localhost:4321";
const SHOTS = process.env.SHOTS;
const NAME = "Ear test (delete me)";
const ownerEmail = (process.env.DEV_SIGN_IN_EMAIL ?? "").toLowerCase();
if (!ownerEmail) throw new Error("DEV_SIGN_IN_EMAIL is not set (.env)");
process.env.ADMIN_EMAILS ||= ownerEmail;

const { prisma } = await import("../src/lib/server/db");
const pts = await import("../src/lib/server/points");
const { createStudentAccount } = await import("../src/lib/server/students");
const { solfegeRound, checkSolfegeSetup, pcOf, intervalRound, checkIntervalSetup } = await import("../src/lib/games/ear-quiz");

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
  const ids = (await prisma.class.findMany({ where: { name: NAME }, select: { id: true } })).map((c) => c.id);
  const enr = await prisma.enrollment.findMany({ where: { classId: { in: ids } }, select: { studentId: true } });
  await prisma.user.deleteMany({ where: { id: { in: enr.map((e) => e.studentId) }, accountType: "student" } });
  await prisma.class.deleteMany({ where: { id: { in: ids } } });
}

const owner = await prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } });
if (!owner) throw new Error("no account for DEV_SIGN_IN_EMAIL");
if (!(await fetch(APP + "/").catch(() => null))?.ok) throw new Error(`no dev server at ${APP}`);

alerts("unload");
await cleanup();
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1280, height: 900 } });
try {
  const joinCode = "ET" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const cls = await prisma.class.create({ data: { userId: owner.id, name: NAME, joinCode, position: 999 } });
  const kids: { id: string; username: string; password: string }[] = [];
  for (const [i, [first, last]] of [["Remy", "Ear"], ["Ivy", "Ear"]].entries()) {
    const password = "et-" + crypto.randomUUID();
    const u = await createStudentAccount({ first, last, joinCode, username: "et" + (i + 1), password });
    await prisma.enrollment.create({ data: { classId: cls.id, studentId: u.id, managed: true } });
    kids.push({ id: u.id, username: `${joinCode.toLowerCase()}.et${i + 1}`, password });
  }
  const [remy, ivy] = kids;
  let n = 0;
  const round = (o: { level?: number; correct: number; track?: string }) => ({
    credited: 0, page: null, assignmentId: null, exercises: [], grades: [],
    game: { id: `r${++n}`, track: o.track ?? "solfege-major", level: o.level ?? 1, label: "Solfège", correct: o.correct, total: 10 },
  });
  const award = (o: Parameters<typeof round>[0], on = day) => pts.award(remy.id, on, round(o));

  // ── The rules, on the server.
  ok((await award({ correct: 10 })) === null, "Games switch off (the default): a round earns nothing");
  await prisma.class.update({ where: { id: cls.id }, data: { gamePoints: true } });
  const first = await award({ correct: 10 });
  const firstId = `r${n}`;
  ok(first?.total === 15, "switch on: at once, 10 right earns 10 + 5", String(first?.total));
  ok((await award({ correct: 6 }))?.total === 0, "6 right earns nothing");
  const again = await pts.award(remy.id, day, { ...round({ correct: 9 }), game: { ...round({ correct: 9 }).game, id: firstId } });
  ok(again?.total === 0 && !again.earned.length, "the same round sent again counts once");
  const otherDay = await pts.award(remy.id, "2026-01-05", { ...round({ correct: 9 }), game: { ...round({ correct: 9 }).game, id: firstId } });
  ok(otherDay?.total === 0, "and once on another day too");
  // Level 1 twice at 9+ (r1 was 10; one more) makes Level 1 Remy's in major.
  const master = await award({ correct: 9 });
  ok(master?.earned.some((e) => /Level 1 is yours/.test(e.label)), "two rounds of 9+ make the level theirs", JSON.stringify(master?.earned.map((e) => e.label)));
  // Each rule on a day of its own, so the day's 50 from games doesn't get in the way.
  const day2 = "2026-11-10", day3 = "2026-11-11";
  await award({ level: 3, correct: 10, track: "solfege-minor" }, day2);
  await award({ level: 3, correct: 10, track: "solfege-minor" }, day2);
  const below = await award({ level: 2, correct: 10, track: "solfege-minor" }, day2);
  ok(below?.total === 8 && below.earned.some((e) => /Below your level/.test(e.note ?? "")), "below the student's level earns half (15 to 8)", JSON.stringify(below?.earned));
  const custom = await award({ level: 0, correct: 8, track: "solfege-major" }, day2);
  ok(custom?.total === 4 && custom.earned.some((e) => /Custom rounds earn half/.test(e.note ?? "")), "Custom earns half (8 to 4)", JSON.stringify(custom?.earned));
  const stats = await prisma.studentStats.findUnique({ where: { studentId: remy.id } });
  ok(stats?.gameCorrect === 10 + 6 + 9 + 10 + 10 + 10 + 8, "Good Ears counts every right answer that counted, once", String(stats?.gameCorrect));
  const fourth = [1, 2, 3, 4].map(() => 0);
  for (const i of fourth.keys()) fourth[i] = (await award({ level: 8, correct: 7, track: "solfege-major" }, day3))?.total ?? -1;
  ok(fourth.join(",") === "7,7,7,4", "the same game again: full 3 times, then half", fourth.join(","));
  for (let i = 0; i < 6; i++) await award({ level: 8, correct: 10, track: "solfege-minor" }, day3);
  const fromGames = (await prisma.pointEvent.aggregate({ where: { studentId: remy.id, kind: "game", day: day3 }, _sum: { points: true } }))._sum.points ?? 0;
  ok(fromGames === 50, "games earn at most 50 a day", String(fromGames));
  const capped = await award({ level: 8, correct: 10, track: "solfege-minor" }, day3);
  ok(capped?.total === 0 && capped.earned.some((e) => /the most games earn in a day/.test(e.note ?? "")), "and say so after");

  // ── Over HTTP, as Ivy.
  const sctx = await browser.createBrowserContext();
  const p = await sctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.goto(APP + "/login", { waitUntil: "networkidle2" });
  const st = await p.evaluate(async (u, pw) => (await fetch("/api/auth/sign-in/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: pw }) })).status, ivy.username, ivy.password);
  ok(st === 200, "Ivy signs in");
  const quick = await p.evaluate(async (day) => {
    const r = await (await fetch("/api/games/round", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: "solfege", setup: { level: 1 }, day }) })).json();
    const f = await (await fetch("/api/games/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: r.token, answers: [] }) })).json();
    const forged = await fetch("/api/games/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: r.token.replace(/.$/, (c: string) => (c === "A" ? "B" : "A")), answers: [] }) });
    return { points: r.points, problem: f.problem, award: f.award, forged: forged.status };
  }, day);
  ok(quick.points === true, "a round tells Ivy it can earn");
  ok(/too fast/.test(quick.problem ?? "") && !quick.award, "a round finished at once counts nothing", quick.problem);
  ok(quick.forged === 400, "a changed token is refused");
  const ownerTokenRefused = await (async () => {
    const { dealRound } = await import("../src/lib/server/ear-games");
    const t = dealRound(remy.id, "solfege", {}, day).token;
    return p.evaluate(async (token) => (await fetch("/api/games/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, answers: [] }) })).status, t);
  })();
  ok(ownerTokenRefused === 400, "someone else's round is refused");

  // ── In the browser, a whole round as Ivy (9 right, one wrong on purpose).
  let token = "";
  const failedLoads: string[] = [];
  p.on("response", async (r) => {
    if (r.status() >= 400 && !r.url().includes("/api/")) failedLoads.push(`${r.status()} ${r.url().slice(-60)}`);
    if (r.url().endsWith("/api/games/round")) try { token = (await r.json()).token; } catch {}
  });
  /** A whole round at the speed of a quick student: each answer the moment its tiles open, all right. */
  async function fastRound(path: string, game: string, store: string, setup: object, answersOf: (t: any) => number[]) {
    await p.goto(APP + path, { waitUntil: "networkidle2" });
    await p.evaluate((k, v) => localStorage.setItem(k, v), store, JSON.stringify(setup));
    await p.reload({ waitUntil: "networkidle2" });
    token = "";
    await p.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Start/.test(b.textContent ?? "")) as HTMLElement).click());
    for (let i = 0; i < 50 && !token; i++) await new Promise((res) => setTimeout(res, 100));
    const answers = answersOf(JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString()));
    for (const a of answers) {
      await p.waitForFunction((g) => document.querySelector(`[data-ear-quiz="${g}"]`)?.getAttribute("data-phase") === "ask" && !(document.querySelector("[data-answer]") as HTMLButtonElement)?.disabled, { timeout: 15000, polling: 20 }, game);
      await p.click(`[data-answer="${a}"]`);
    }
    await p.waitForSelector("[data-result]", { timeout: 30000 });
    await new Promise((res) => setTimeout(res, 1500));
    return p.evaluate(() => document.querySelector("[data-result]")!.textContent!.replace(/\s+/g, " ").trim());
  }
  await p.goto(APP + "/games/solfege", { waitUntil: "networkidle2" });
  await p.evaluate(() => localStorage.setItem("sr-solfege-ear", JSON.stringify({ tonality: "major", level: 3, nameAs: "solfege", minorAs: "la", tonicFirst: true })));
  await p.reload({ waitUntil: "networkidle2" });
  await p.waitForSelector('[data-ear-quiz="solfege"]');
  ok(await p.evaluate(() => /Level 3: Up to so/.test((document.querySelector("#ear-level") as HTMLSelectElement).selectedOptions[0]!.textContent!)), "the setup is remembered");
  await p.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Start/.test(b.textContent ?? "")) as HTMLElement).click());
  await p.waitForSelector("[data-key-strip]", { timeout: 10000 });
  ok(true, "the key plays first, with its card");
  await p.waitForFunction(() => document.querySelector('[data-ear-quiz="solfege"]')?.getAttribute("data-phase") === "ask", { timeout: 20000 });
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/ear-1-ask.png` });
  const t = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
  const r = solfegeRound(checkSolfegeSetup(t.s), t.seed);
  const tiles = await p.evaluate(() => [...document.querySelectorAll("[data-answer]")].map((b) => b.textContent!.replace(/^\d/, "").trim()));
  ok(tiles.join(" ") === "do re mi fa so", "Level 3's answers: do re mi fa so", tiles.join(" "));
  for (let i = 0; i < r.questions.length; i++) {
    // The answers open once the note has sounded.
    await p.waitForFunction(() => document.querySelector('[data-ear-quiz="solfege"]')?.getAttribute("data-phase") === "ask" && !(document.querySelector("[data-answer]") as HTMLButtonElement)?.disabled, { timeout: 15000 });
    const want = pcOf(r.questions[i]!);
    const pick = i === 4 ? r.choices.find((c) => c !== want)! : want;
    await p.click(`[data-answer="${pick}"]`);
    if (i === 4) {
      await new Promise((res) => setTimeout(res, 300));
      const miss = await p.evaluate(() => document.querySelector(".miss")?.textContent?.trim());
      ok(/That was/.test(miss ?? ""), "a wrong answer shows the right one", miss);
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/ear-2-miss.png` });
      await p.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Next|Finish/.test(b.textContent ?? "")) as HTMLElement).click());
    }
  }
  await p.waitForSelector("[data-points]", { timeout: 30000 }).catch(() => {});
  const res = await p.evaluate(() => ({ big: document.querySelector("[data-result] .big")?.textContent, pts: document.querySelector("[data-points]")?.textContent, toast: !!document.querySelector(".toast") }));
  ok(res.big === "9 of 10 right", "the result card: 9 of 10", res.big ?? "");
  ok(res.pts === "+9 points", "and +9 points", res.pts ?? "");
  ok(res.toast, "the points card shows");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/ear-3-done.png` });
  const row = await prisma.pointEvent.findFirst({ where: { studentId: ivy.id, kind: "game" } });
  ok(row?.points === 9 && row.day === day && row.key.startsWith("solfege-major:3#"), "the point row: 9, today, solfege-major Level 3", row ? `${row.key} ${row.points}` : "none");

  // Intervals: Level 2 (2nds to 5ths), up or down, all right.
  await p.goto(APP + "/games/intervals", { waitUntil: "networkidle2" });
  await p.evaluate(() => localStorage.setItem("sr-interval-ear", JSON.stringify({ level: 2, direction: "both" })));
  await p.reload({ waitUntil: "networkidle2" });
  token = "";
  await p.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Start/.test(b.textContent ?? "")) as HTMLElement).click());
  await p.waitForFunction(() => document.querySelector('[data-ear-quiz="interval"]')?.getAttribute("data-phase") === "ask", { timeout: 20000 });
  for (let i = 0; i < 50 && !token; i++) await new Promise((res) => setTimeout(res, 100));
  const it = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
  ok(it.g === "interval", "the interval round was dealt by the server");
  const ir = intervalRound(checkIntervalSetup(it.s), it.seed);
  const itiles = await p.evaluate(() => [...document.querySelectorAll("[data-answer]")].map((b) => b.textContent!.replace(/^\d/, "").trim()));
  ok(itiles.join(" ") === "2nd 3rd 4th 5th", "Level 2's answers: 2nd 3rd 4th 5th", itiles.join(" "));
  ok(!(await p.$("[data-key-strip]")), "no key before intervals");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/ear-5-interval.png` });
  for (const q of ir.questions) {
    await p.waitForFunction(() => document.querySelector('[data-ear-quiz="interval"]')?.getAttribute("data-phase") === "ask" && !(document.querySelector("[data-answer]") as HTMLButtonElement)?.disabled, { timeout: 15000 });
    await p.click(`[data-answer="${q.answer}"]`);
  }
  await p.waitForSelector("[data-points]", { timeout: 30000 }).catch(() => {});
  const ires = await p.evaluate(() => ({ big: document.querySelector("[data-result] .big")?.textContent, pts: document.querySelector("[data-points]")?.textContent }));
  ok(ires.big === "10 of 10 right" && ires.pts === "+15 points", "all ten right: +15", `${ires.big} ${ires.pts}`);
  const irow = await prisma.pointEvent.findFirst({ where: { studentId: ivy.id, kind: "game", key: { startsWith: "interval:2#" } } });
  ok(irow?.points === 15, "its point row: interval Level 2, 15");

  // The fastest honest setups: no "too fast" for a quick student.
  const together = await fastRound("/games/intervals", "interval", "sr-interval-ear", { level: 1, direction: "together" }, (t) => intervalRound(checkIntervalSetup(t.s), t.seed).questions.map((q) => q.answer));
  ok(/10 of 10/.test(together) && !/too fast/.test(together) && /\+\d+ points/.test(together), "a quick round of intervals Together counts", together);
  const justNote = await fastRound("/games/solfege", "solfege", "sr-solfege-ear", { tonality: "minor", level: 8, nameAs: "letters", tonicFirst: false }, (t) => solfegeRound(checkSolfegeSetup(t.s), t.seed).questions.map(pcOf));
  ok(/10 of 10/.test(justNote) && !/too fast/.test(justNote), "a quick Solfège round, just the note (minor, chromatic), counts", justNote);
  ok(!failedLoads.length, "every piano sample and file loaded (notes from 52 to 81)", failedLoads.slice(0, 5).join(" | "));
  ok(!errors.length, "Ivy's games: no page errors", errors.join(" | "));
  await sctx.close();

  // ── The teacher's switch, and signed out.
  const tctx = await browser.createBrowserContext();
  const tp = await tctx.newPage();
  await tp.goto(APP + "/login", { waitUntil: "networkidle2" });
  await Promise.all([tp.waitForNavigation({ timeout: 20000 }).catch(() => {}), tp.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Sign in as/.test(b.textContent ?? "")) as HTMLElement).click())]);
  const sw = await tp.evaluate(async (id) => (await (await fetch(`/api/classes/${id}/points?day=x`)).json()).gamePoints, cls.id);
  ok(sw === true, "the class's points answer has the switch, on");
  await tp.evaluate(async (id) => fetch(`/api/classes/${id}/points`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gamePoints: false }) }), cls.id);
  ok((await prisma.class.findUnique({ where: { id: cls.id } }))?.gamePoints === false, "the teacher turns it off");
  ok((await award({ level: 8, correct: 10, track: "solfege-major" })) === null, "and rounds stop earning at once");
  await tctx.close();

  const anon = await browser.newPage();
  await anon.goto(APP + "/games/solfege", { waitUntil: "networkidle2" });
  await anon.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Start/.test(b.textContent ?? "")) as HTMLElement).click());
  await anon.waitForFunction(() => document.querySelector('[data-ear-quiz="solfege"]')?.getAttribute("data-phase") === "ask", { timeout: 20000 });
  ok(!(await anon.$(".earn")), "signed out: a round plays, no points promised");
  await anon.setViewport({ width: 390, height: 844 });
  await new Promise((res) => setTimeout(res, 400));
  ok((await anon.evaluate(() => document.documentElement.scrollWidth)) <= 390, "at phone width nothing runs off the side");
  if (SHOTS) await anon.screenshot({ path: `${SHOTS}/ear-4-phone.png` });
} catch (e) {
  fails++;
  console.log("FAIL", e instanceof Error ? e.stack : e);
} finally {
  await cleanup().catch((e) => console.log("FAIL cleanup", e));
  alerts("load");
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all checks passed");
  process.exit(fails ? 1 : 0);
}
