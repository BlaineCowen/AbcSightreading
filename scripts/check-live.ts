/**
 * Live practice end to end (src/lib/live.ts, notes/live-practice.md): one
 * teacher page and two student devices.
 *
 *   APP=http://localhost:4472 EMAIL=... PASSWORD=... bun run scripts/check-live.ts
 *
 * Needs a dev server on a local database (never the shared one) and a Pro
 * account to teach with: COMP_EMAILS on the dev server, or an AccessGrant
 * row. PAGE=unison runs it on the Unison page; SHOTS=<dir> saves screenshots.
 *
 * Checks: the teacher starts a session and gets a code; each student joins
 * with it, picks a different part, and is drawn only that part (one staff);
 * the teacher's panel counts both devices; a new Generate reaches both
 * within a few seconds; Start together counts both in and runs their
 * cursors; End session ends theirs.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4472";
const EMAIL = process.env.EMAIL ?? "live-teacher@example.test";
const PASSWORD = process.env.PASSWORD ?? "LiveTest!2026pw";
const PAGE = process.env.PAGE === "unison" ? "unison" : "choral";
const SHOTS = process.env.SHOTS ?? "";
/** THEME=light or dark: the colour scheme every page is shown in (the OS setting otherwise). */
const THEME = process.env.THEME ?? "";
const theme = (p: any) => (THEME ? p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: THEME }]) : null);

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

const watch = (p: any, name: string) => {
  p.on("pageerror", (e: Error) => console.error(`${name} page error:`, e.message));
  p.on("console", (m: any) => {
    if (m.type() === "error") console.error(`${name} console:`, m.text().slice(0, 200));
  });
};

// ── The teacher ───────────────────────────────────────────────────────────
const teacherCtx = await browser.createBrowserContext();
const teacher = await teacherCtx.newPage();
watch(teacher, "teacher");
await teacher.setViewport({ width: 1366, height: 900 });
await theme(teacher);
await teacher.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
const signedIn = await teacher.evaluate(async (email, password) => {
  const res = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}, EMAIL, PASSWORD);
check(signedIn, "the teacher signs in");
// A session left open by an earlier run would be picked up again: end it, to start clean.
await teacher.evaluate(async () => {
  const { session } = await (await fetch("/api/live")).json();
  if (session) await fetch(`/api/live/${session.code}`, { method: "DELETE" });
});

await teacher.goto(`${APP}/${PAGE === "choral" ? "choral-sightreading" : "sightreading"}`, { waitUntil: "networkidle2" });
const clickText = async (p: any, text: string) => {
  const done = await p.evaluate((t: string) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith(t) && !(x as HTMLButtonElement).disabled && (x as HTMLElement).offsetParent);
    if (!b) return false;
    (b as HTMLButtonElement).click();
    return true;
  }, text);
  if (!done) throw new Error(`no button "${text}"`);
};
await teacher.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim().startsWith("Live")), { timeout: 20000 });
await clickText(teacher, "Generate");
await teacher.waitForSelector("#paper svg", { timeout: 60000 });
await clickText(teacher, "Live");
await teacher.waitForSelector("[data-live-code]", { timeout: 15000 });
const code = await teacher.$eval("[data-live-code]", (el) => el.getAttribute("data-live-code")!);
check(/^[2-9]{3}[A-Z]{3}$/.test(code), `a session starts with code ${code}`);
if (SHOTS) await teacher.screenshot({ path: `${SHOTS}/live-teacher-panel.png` });

// ── Two students ──────────────────────────────────────────────────────────
type Student = { page: any; part: string };
async function student(n: number, partIndex: number): Promise<Student> {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watch(page, `student ${n}`);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await theme(page);
  await page.goto(`${APP}/live?code=${code}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("[data-live-pick], #live-paper svg"), { timeout: 20000 });
  const picks: string[] = await page.$$eval("[data-live-pick]", (els: Element[]) => els.map((e) => e.getAttribute("data-live-pick")!));
  const voices = picks.filter((p) => p !== "all");
  const part = voices.length ? voices[partIndex % voices.length] : "all";
  if (voices.length) await page.click(`[data-live-pick="${part}"]`);
  await page.waitForSelector("#live-paper svg", { timeout: 15000 });
  return { page, part };
}
const s1 = await student(1, 0);
const s2 = await student(2, PAGE === "choral" ? 1 : 0);
if (PAGE === "choral") check(s1.part !== s2.part, `the students read different parts (${s1.part}, ${s2.part})`);

/** How many voices a device draws, from abcjs's per-voice classes. */
const voicesDrawn = (p: any) =>
  p.evaluate(() => new Set([...document.querySelectorAll("#live-paper .abcjs-note")].map((n) => /abcjs-v(\d+)/.exec(n.getAttribute("class") ?? "")?.[1])).size);
for (const [i, s] of [s1, s2].entries()) check((await voicesDrawn(s.page)) === 1, `student ${i + 1} sees only one part`);
if (SHOTS) await s1.page.screenshot({ path: `${SHOTS}/live-student-1.png` });

const versionOf = (p: any) => p.$eval("#live-paper", (el: Element) => Number(el.getAttribute("data-live-version")));
const v1 = await versionOf(s1.page);
const teacherVersion = await teacher.evaluate(() => (document.querySelector("[data-live-code]") ? 1 : 0));
check(v1 >= 1 && teacherVersion === 1, `the students have the exercise (version ${v1})`);

// The panel counts them.
await teacher.waitForFunction(() => document.querySelector("[data-live-connected]")?.textContent?.trim() === "2", { timeout: 12000 }).catch(() => {});
const connected = await teacher.$eval("[data-live-connected]", (el) => el.textContent?.trim());
check(connected === "2", `the teacher's panel counts ${connected} devices`);

// ── A new exercise reaches both ───────────────────────────────────────────
await teacher.keyboard.press("Escape");
const firstNotes = await s1.page.$eval("#live-paper", (el: Element) => el.innerHTML.length);
const sent = Date.now();
await clickText(teacher, "Generate");
const reached = await Promise.all(
  [s1, s2].map(async (s) => {
    await s.page.waitForFunction((v: number) => Number(document.querySelector("#live-paper")?.getAttribute("data-live-version")) > v, { timeout: 30000 }, v1);
    return Date.now() - sent;
  }),
);
check(reached.every((ms) => ms < 30000), `a new Generate reached both devices (${reached.map((m) => (m / 1000).toFixed(1)).join(" s, ")} s after the click, generation included)`);
for (const [i, s] of [s1, s2].entries()) check((await voicesDrawn(s.page)) === 1, `student ${i + 1} still sees only their part`);
const partKept = await s1.page.$eval("[data-live-part]", (el: Element) => el.getAttribute("data-live-part")).catch(() => "all");
check(partKept === s1.part, "student 1 keeps their part across exercises");
void firstNotes;

// ── Start together ────────────────────────────────────────────────────────
// While a session runs the Live button shows its code; it opens the panel again.
await clickText(teacher, `${code.slice(0, 3)}-${code.slice(3)}`);
await teacher.waitForSelector("[data-live-code]", { timeout: 5000 });
await clickText(teacher, "Start together");
const counted = await Promise.all(
  [s1, s2].map((s) => s.page.waitForSelector(".live-count", { timeout: 12000 }).then(() => true).catch(() => false)),
);
check(counted.every(Boolean), "both devices count in");
if (SHOTS) await s2.page.screenshot({ path: `${SHOTS}/live-student-countin.png` });
const following = await Promise.all(
  [s1, s2].map((s) => s.page.waitForSelector("#live-paper .live-now", { timeout: 15000 }).then(() => true).catch(() => false)),
);
check(following.every(Boolean), "both devices follow the music with the cursor");
if (SHOTS) await s1.page.screenshot({ path: `${SHOTS}/live-student-following.png` });
await clickText(teacher, "Stop");

// ── End ───────────────────────────────────────────────────────────────────
await clickText(teacher, "End session");
const endedBoth = await Promise.all(
  [s1, s2].map((s) =>
    s.page
      .waitForFunction(() => (document.body.textContent ?? "").includes("This live session has ended."), { timeout: 15000 })
      .then(() => true)
      .catch(() => false),
  ),
);
check(endedBoth.every(Boolean), "ending the session ends it on both devices");

await browser.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
