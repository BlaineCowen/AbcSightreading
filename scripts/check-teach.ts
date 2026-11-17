/**
 * Does /teach hold a teacher's classes, one card each, and does the account
 * page send its old class links there? (docs/claude/accounts-and-billing.md,
 * Classes page.) Signed in as the owner on the dev server's one-tap sign-in:
 * - signed out, /teach goes to sign-in;
 * - /account has Account and plan and Rhythm syllables only, and a link here;
 *   the menu has Classes;
 * - /account#students, #assignments and ?seats=... land on /teach;
 * - /teach: one card per class, each with Students, Course, Assignments and
 *   (owner) Points; each tab shows its part; arrow keys move along the tabs;
 * - the Assignments tab lists every assignment;
 * - a class added here gets a card (open on Students), is renamed, and deleted
 *   (a "Teach test (delete me)" class, removed in the end whatever happens);
 * - with ?everyone, no Points tab;
 * - a student: no Classes in the menu, /teach sends them to /account, and
 *   /account is still theirs (no tabs).
 *
 * It writes to the shared database (Production's): the test class and one
 * test student, deleted at the end; the sign-up alert watcher is paused while
 * the student exists. The dev server must know the owner:
 *
 *   E=$(grep '^DEV_SIGN_IN_EMAIL=' .env | cut -d= -f2- | tr -d '"')
 *   ADMIN_EMAILS="$E" BETTER_AUTH_URL=http://localhost:4399 bun run dev --port 4399
 *   APP=http://localhost:4399 bun run scripts/check-teach.ts   # SHOTS=<dir>
 */
import puppeteer, { type Page } from "../marketing/ad/node_modules/puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const ownerEmail = (process.env.DEV_SIGN_IN_EMAIL ?? "").toLowerCase();
if (!ownerEmail) throw new Error("DEV_SIGN_IN_EMAIL is not set (.env)");
const { prisma } = await import("../src/lib/server/db");
const { createStudentAccount } = await import("../src/lib/server/students");
const ALERTS = `${homedir()}/Library/LaunchAgents/com.blainecowen.abc-signup-alerts.plist`;
const alerts = (verb: "load" | "unload") => {
  if (existsSync(ALERTS)) try { execSync(`launchctl ${verb} ${ALERTS}`, { stdio: "ignore" }); } catch {}
};
/** Every test class, and the students in them. */
async function cleanup() {
  const ids = (await prisma.class.findMany({ where: { name: { startsWith: "Teach test (delete me)" } }, select: { id: true } })).map((c) => c.id);
  const enr = await prisma.enrollment.findMany({ where: { classId: { in: ids } }, select: { studentId: true } });
  await prisma.user.deleteMany({ where: { id: { in: enr.map((e) => e.studentId) }, accountType: "student" } });
  await prisma.class.deleteMany({ where: { id: { in: ids } } });
}
await cleanup(); // a run that died half way

const APP = process.env.APP ?? "http://localhost:4321";
const SHOTS = process.env.SHOTS;
const TEST = "Teach test (delete me)";
let fails = 0;
const ok = (cond: unknown, what: string, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${what}${extra ? `  (${extra})` : ""}`);
  if (!cond) fails++;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (page: Page, fn: () => boolean, ms = 20000) => {
  await page.waitForFunction(fn, { timeout: ms, polling: 200 }).catch(() => {});
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("dialog", (d) => d.accept());

/** The cards on /teach: name, and its tabs. */
const cards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("article.class-card")].map((c) => ({
      name: c.querySelector("h3")?.childNodes[0]?.textContent?.trim() ?? "",
      tabs: [...c.querySelectorAll('.class-tabs [role="tab"]')].map((t) => t.textContent!.trim()),
      on: c.querySelector('.class-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() ?? "",
      panel: (c.querySelector('[role="tabpanel"]') as HTMLElement)?.innerText ?? "",
    })),
  );
const clickTab = (cls: string, tab: string) =>
  page.evaluate((cls, tab) => {
    const card = [...document.querySelectorAll("article.class-card")].find((c) => c.querySelector("h3")?.textContent?.startsWith(cls));
    ([...(card?.querySelectorAll('.class-tabs [role="tab"]') ?? [])].find((t) => t.textContent!.trim() === tab) as HTMLElement | undefined)?.click();
  }, cls, tab);

try {
  // Signed out: to sign-in.
  await page.goto(APP + "/teach", { waitUntil: "networkidle2" });
  ok(/\/login\?next=/.test(page.url()), "signed out, /teach goes to sign-in", page.url());

  await page.goto(APP + "/login", { waitUntil: "networkidle2" });
  await Promise.all([
    page.waitForNavigation({ timeout: 20000 }).catch(() => {}),
    page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Sign in as/.test(b.textContent ?? "")) as HTMLElement)?.click()),
  ]);

  // The account page: its own two tabs, and the way to the classes.
  await page.goto(APP + "/account", { waitUntil: "networkidle2" });
  await until(page, () => !!document.querySelector("nav a[href='/teach']"));
  const acct = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll(".account-tabs [data-tab]")].map((a) => a.textContent!.trim()),
    link: !!document.querySelector("a.teach-link[href='/teach']"),
    menu: [...document.querySelectorAll("nav a[href='/teach']")].map((a) => a.textContent!.trim()),
  }));
  ok(acct.tabs.join("|") === "Account and plan|Rhythm syllables", "account page: Account and plan, Rhythm syllables", acct.tabs.join("|"));
  ok(acct.link, "account page links to Your classes");
  ok(acct.menu.includes("Classes"), "the menu has Classes", acct.menu.join("|"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/teach-0-account.png` });

  // Old links: from another page (an email, the founders page), then within /account.
  await page.goto(APP + "/badges", { waitUntil: "networkidle2" });
  await page.goto(APP + "/account#students", { waitUntil: "networkidle2" });
  await until(page, () => location.pathname === "/teach", 8000);
  ok(new URL(page.url()).pathname === "/teach", "/account#students lands on /teach", page.url());
  await page.goto(APP + "/account", { waitUntil: "networkidle2" });
  await page.goto(APP + "/account#assignments", { waitUntil: "networkidle2" });
  await until(page, () => location.pathname === "/teach", 8000);
  ok(new URL(page.url()).pathname === "/teach" && page.url().endsWith("#assignments"), "/account#assignments lands on /teach#assignments", page.url());
  const res = await page.goto(APP + "/account?seats=added", { waitUntil: "networkidle2" });
  ok(new URL(page.url()).pathname === "/teach" && res?.ok(), "/account?seats=added (the Stripe return) lands on /teach", page.url());

  // The classes page.
  await page.goto(APP + "/teach", { waitUntil: "networkidle2" });
  await until(page, () => document.querySelectorAll("article.class-card").length > 0);
  const list = await cards();
  const fromApi = await page.evaluate(async () => (await (await fetch("/api/educator")).json()).classes.map((c: { name: string }) => c.name));
  ok(list.length === fromApi.length && list.length > 0, "one card per class, each once", `${list.length} cards, ${fromApi.length} classes`);
  ok(list.every((c) => c.tabs.join("|") === "Students|Course|Assignments|Points"), "each card has Students, Course, Assignments, Points", list[0]?.tabs.join("|"));
  ok(!(await page.evaluate(() => /^Students$/m.test([...document.querySelectorAll("h2")].map((h) => h.textContent!.trim()).join("\n")))), "no second list of the classes under Students");
  const pageTabs = await page.evaluate(() => [...document.querySelectorAll(".page-tabs [data-tab]")].map((a) => a.textContent!.trim()).join("|"));
  ok(pageTabs === "Classes|Assignments", "page tabs: Classes, Assignments", pageTabs);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/teach-1-classes.png`, fullPage: true });

  // Each tab of the first class shows its part.
  const first = list[0].name;
  await clickTab(first, "Course");
  await until(page, () => /steps passed|Choose a course/.test((document.querySelector("article.class-card [role=tabpanel]") as HTMLElement)?.innerText ?? ""));
  let c0 = (await cards())[0];
  ok(c0.on === "Course" && /steps passed|Choose a course/.test(c0.panel), "Course shows the checklist", c0.panel.slice(0, 80));
  await clickTab(first, "Students");
  await wait(300);
  c0 = (await cards())[0];
  ok(c0.on === "Students" && /Add (more )?students|Name\s+Username/.test(c0.panel), "Students shows the roster or Add students", c0.panel.slice(0, 80));
  await clickTab(first, "Assignments");
  await wait(1500);
  c0 = (await cards())[0];
  ok(c0.on === "Assignments" && c0.panel.length > 10, "Assignments shows the class's assignments", c0.panel.slice(0, 80));
  await clickTab(first, "Points");
  await until(page, () => /Weekly leaderboard|points/i.test((document.querySelector("article.class-card [role=tabpanel]") as HTMLElement)?.innerText ?? ""));
  c0 = (await cards())[0];
  ok(c0.on === "Points" && /points|leaderboard/i.test(c0.panel), "Points shows the class's points", c0.panel.slice(0, 80));
  // Arrow keys along the tabs.
  await page.focus("article.class-card .class-tabs [role=tab][aria-selected=true]");
  await page.keyboard.press("ArrowLeft");
  await wait(200);
  const focused = await page.evaluate(() => ({ on: document.querySelector("article.class-card .class-tabs [role=tab][aria-selected=true]")?.textContent?.trim(), focus: document.activeElement?.textContent?.trim() }));
  ok(focused.on === "Assignments" && focused.focus === "Assignments", "ArrowLeft moves to Assignments, focus with it", JSON.stringify(focused));

  // The Assignments page tab.
  await page.evaluate(() => (document.querySelector(".page-tabs [data-tab=assignments]") as HTMLElement).click());
  await until(page, () => /Every assignment in your classes/.test(document.body.innerText));
  ok(await page.evaluate(() => !document.getElementById("panel-assignments")!.hidden && /Every assignment in your classes/.test(document.body.innerText)), "Assignments tab lists every assignment");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/teach-2-assignments.png` });

  // Add, rename, delete a class.
  await page.goto(APP + "/teach", { waitUntil: "networkidle2" });
  await until(page, () => document.querySelectorAll("article.class-card").length > 0);
  await page.type('input[aria-label="New class name"]', TEST);
  await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add class") as HTMLElement).click());
  await until(page, () => [...document.querySelectorAll("article.class-card h3")].some((h) => h.textContent!.startsWith("Teach test (delete me)")));
  let made = (await cards()).find((c) => c.name === TEST);
  ok(made && made.on === "Students" && /Add students to this class/.test(made.panel), "a new class gets a card, open on Students with Add students", made?.panel.slice(0, 80));
  ok(made && (await cards()).at(-1)?.name === TEST, "and it comes last");
  await page.evaluate((n) => (document.querySelector(`button[aria-label="Rename ${n}"]`) as HTMLElement).click(), TEST);
  await page.waitForSelector(`input[aria-label="New name for ${TEST}"]`);
  await page.evaluate((n) => { const i = document.querySelector(`input[aria-label="New name for ${n}"]`) as HTMLInputElement; i.select(); }, TEST);
  await page.keyboard.type(TEST + " 2");
  await page.keyboard.press("Enter");
  await until(page, () => [...document.querySelectorAll("article.class-card h3")].some((h) => h.textContent!.startsWith("Teach test (delete me) 2")));
  ok((await cards()).some((c) => c.name === TEST + " 2"), "renamed in place");
  await page.evaluate((n) => (document.querySelector(`button[aria-label="Delete ${n}"]`) as HTMLElement).click(), TEST + " 2");
  await until(page, () => ![...document.querySelectorAll("article.class-card h3")].some((h) => h.textContent!.startsWith("Teach test")));
  ok(!(await cards()).some((c) => c.name.startsWith("Teach test")), "deleted");

  // As everyone else sees it.
  await page.goto(APP + "/teach?everyone", { waitUntil: "networkidle2" });
  await until(page, () => document.querySelectorAll("article.class-card").length > 0);
  await wait(800);
  ok((await cards()).every((c) => !c.tabs.includes("Points")), "with ?everyone there is no Points tab");

  // A phone.
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(APP + "/teach", { waitUntil: "networkidle2" });
  await until(page, () => document.querySelectorAll("article.class-card").length > 0);
  await wait(800);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, "at phone width nothing runs off the side", `${wide}px`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/teach-3-phone.png` });

  // A student (the role decides the menu and the page: CLAUDE.md, Watch for).
  alerts("unload");
  const owner = await prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } });
  const joinCode = "TT" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const cls = await prisma.class.create({ data: { userId: owner!.id, name: TEST, joinCode, position: 999 } });
  const password = "tt-" + crypto.randomUUID();
  const kid = await createStudentAccount({ first: "Tess", last: "Test", joinCode, username: "tt1", password });
  await prisma.enrollment.create({ data: { classId: cls.id, studentId: kid.id, managed: true } });
  const sctx = await browser.createBrowserContext();
  const sp = await sctx.newPage();
  sp.on("pageerror", (e) => errors.push("student: " + String(e).slice(0, 160)));
  await sp.goto(APP + "/login", { waitUntil: "networkidle2" });
  const st = await sp.evaluate(async (u, pw) => (await fetch("/api/auth/sign-in/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: pw }) })).status, `${joinCode.toLowerCase()}.tt1`, password);
  ok(st === 200, "a student signs in");
  await sp.goto(APP + "/teach", { waitUntil: "networkidle2" });
  ok(new URL(sp.url()).pathname === "/account", "a student's /teach goes to /account", sp.url());
  await sp.waitForFunction(() => !!document.querySelector("nav a[href='/library']"), { timeout: 20000 }).catch(() => {});
  const student = await sp.evaluate(() => ({
    menu: [...document.querySelectorAll("nav a")].map((a) => a.textContent!.trim()),
    tabs: document.querySelectorAll(".account-tabs").length,
    link: !!document.querySelector("a.teach-link"),
  }));
  ok(!student.menu.includes("Classes") && student.menu.includes("My library"), "a student's menu has My library, no Classes", student.menu.join("|"));
  ok(!student.tabs && !student.link, "a student's account page has no tabs and no classes link");
  await sp.goto(APP + "/account#students", { waitUntil: "networkidle2" });
  ok(new URL(sp.url()).pathname === "/account", "and #students leaves a student on /account");
  await sctx.close();
  ok(!errors.length, "no page errors", errors.join(" | "));
} catch (e) {
  fails++;
  console.log("FAIL", e instanceof Error ? e.message : e);
} finally {
  // Whatever happened: no test class or student left behind.
  await cleanup().catch((e) => console.log("FAIL cleanup", e));
  alerts("load");
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all checks passed");
  process.exit(fails ? 1 : 0);
}
