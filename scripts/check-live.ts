/**
 * Live practice end to end (src/lib/live.ts, notes/live-practice.md): a
 * director's permanent room, one teacher page and two student devices.
 *
 *   APP=http://localhost:4472 bun run scripts/check-live.ts
 *
 * Needs a dev server on a local database (never the shared one) where the
 * teacher has Pro: COMP_EMAILS=live-teacher@example.test on the dev server.
 * The teacher account is made on first run. PAGE=ensemble runs it on the
 * Ensemble page (each device a player's part); PAGE=unison runs it on the
 * Unison page; SHOTS=<dir> saves screenshots; THEME=light|dark.
 *
 * Checks: the room's address is the same every time (the poster's); a device
 * on it while Live is off waits, and turns to the exercise by itself when
 * Live comes on; two students read different parts, one staff each; the
 * panel counts them; a new Generate reaches both and keeps their parts;
 * Start together counts both in and runs their cursors; Live off sends both
 * back to waiting, and Live on again brings them back on their parts with no
 * tap; a reload keeps the part; the poster carries the same code; an old
 * /live?code= link lands on the room's address.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4472";
const EMAIL = process.env.EMAIL ?? "live-teacher@example.test";
const PASSWORD = process.env.PASSWORD ?? "LiveTest!2026pw";
const PAGE = process.env.PAGE === "unison" ? "unison" : process.env.PAGE === "ensemble" ? "ensemble" : "choral";
/** Pages with parts to choose between. */
const PARTS = PAGE !== "unison";
const SHOTS = process.env.SHOTS ?? "";
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
const clickText = async (p: any, text: string) => {
  const done = await p.evaluate((t: string) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith(t) && !(x as HTMLButtonElement).disabled && (x as HTMLElement).offsetParent);
    if (!b) return false;
    (b as HTMLButtonElement).click();
    return true;
  }, text);
  if (!done) throw new Error(`no button "${text}"`);
};
/** Waits for a condition, true if it came within the time. */
const within = (p: any, fn: any, ms: number, ...args: any[]) =>
  p.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);

// ── The teacher ───────────────────────────────────────────────────────────
const teacherCtx = await browser.createBrowserContext();
const teacher = await teacherCtx.newPage();
watch(teacher, "teacher");
await teacher.setViewport({ width: 1366, height: 900 });
await theme(teacher);
await teacher.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
const signedIn = await teacher.evaluate(async (email: string, password: string) => {
  const post = (path: string, body: object) =>
    fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let res = await post("/api/auth/sign-in/email", { email, password });
  // First run on this database: make the account.
  if (!res.ok) res = await post("/api/auth/sign-up/email", { email, password, name: "Mr. Live" });
  return res.ok;
}, EMAIL, PASSWORD);
check(signedIn, "the teacher signs in");

// Off air to begin with, and the room's address (made if new: the poster's).
const room = await teacher.evaluate(async () => {
  const { room: before } = await (await fetch("/api/live")).json();
  if (before?.live) await fetch(`/api/live/${before.code}`, { method: "DELETE" });
  const { room } = await (await fetch("/api/live?make=1")).json();
  const { room: again } = await (await fetch("/api/live?make=1")).json();
  return { code: room?.code as string, again: again?.code as string, live: room?.live as boolean };
});
const code = room.code;
check(/^[2-9]{3}[A-Z]{3}$/.test(code ?? "") && room.again === code, `the room has one permanent code (${code})`);
check(room.live === false, "Live starts off");

// ── A student on the poster's link before Live is on ──────────────────────
type Student = { page: any; part: string };
async function device(n: number) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watch(page, `student ${n}`);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await theme(page);
  return page;
}
/** Picks part number `partIndex` once the parts are offered; "all" on a single line. */
async function pickPart(page: any, partIndex: number): Promise<string> {
  await page.waitForFunction(() => !!document.querySelector("[data-live-pick], #live-paper svg"), { timeout: 20000 });
  const picks: string[] = await page.$$eval("[data-live-pick]", (els: Element[]) => els.map((e) => e.getAttribute("data-live-pick")!));
  const voices = picks.filter((p) => p !== "all");
  const part = voices.length ? voices[partIndex % voices.length] : "all";
  if (voices.length) await page.click(`[data-live-pick="${part}"]`);
  await page.waitForSelector("#live-paper svg", { timeout: 15000 });
  return part;
}

const early = await device(1);
await early.goto(`${APP}/live/${code}`, { waitUntil: "domcontentloaded" });
check(await within(early, () => !!document.querySelector("[data-live-waiting]"), 15000), "a device on the link while Live is off waits");
if (SHOTS) await early.screenshot({ path: `${SHOTS}/live-waiting.png` });

// ── Live on ───────────────────────────────────────────────────────────────
await teacher.goto(`${APP}/${PAGE === "choral" ? "choral-sightreading" : PAGE === "ensemble" ? "ensemble-sightreading" : "sightreading"}`, { waitUntil: "networkidle2" });
await teacher.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim().startsWith("Live")), { timeout: 20000 });
await clickText(teacher, "New exercise").catch(() => clickText(teacher, "Generate"));
await teacher.waitForSelector(".focus-score svg .abcjs-note", { timeout: 60000 });
await clickText(teacher, "Live");
await teacher.waitForSelector("[data-live-code]", { timeout: 15000 });
const shown = await teacher.$eval("[data-live-code]", (el: Element) => el.getAttribute("data-live-code"));
check(shown === code, `Live on shows the same code (${shown})`);
// A first visit's welcome card (tour) steps aside for the panel, and stays away.
await sleep(1200);
check(!(await teacher.$(".tour-welcome")), "no welcome card over the Live panel");
if (SHOTS) await teacher.screenshot({ path: `${SHOTS}/live-teacher-panel.png` });

// The waiting device turns to the exercise by itself.
check(await within(early, () => !document.querySelector("[data-live-waiting]") && !!document.querySelector("[data-live-pick], #live-paper svg"), 15000), "the waiting device turns to the exercise with no tap");
const s1: Student = { page: early, part: await pickPart(early, 0) };
const late = await device(2);
await late.goto(`${APP}/live/${code}`, { waitUntil: "domcontentloaded" });
const s2: Student = { page: late, part: await pickPart(late, PARTS ? 3 : 0) };
if (PARTS) check(s1.part !== s2.part, `the students read different parts (${s1.part}, ${s2.part})`);

/** How many voices a device draws, from abcjs's per-voice classes. */
const voicesDrawn = (p: any) =>
  p.evaluate(() => new Set([...document.querySelectorAll("#live-paper .abcjs-note")].map((n) => /abcjs-v(\d+)/.exec(n.getAttribute("class") ?? "")?.[1])).size);
for (const [i, s] of [s1, s2].entries()) check((await voicesDrawn(s.page)) === 1, `student ${i + 1} sees only their part`);
if (SHOTS) await s2.page.screenshot({ path: `${SHOTS}/live-student-bass.png` });

await within(teacher, () => document.querySelector("[data-live-connected]")?.textContent?.trim() === "2", 12000);
const connected = await teacher.$eval("[data-live-connected]", (el: Element) => el.textContent?.trim());
check(connected === "2", `the teacher's panel counts the 2 devices (${connected})`);

// ── A new exercise reaches both ───────────────────────────────────────────
await teacher.keyboard.press("Escape");
const versionOf = (p: any) => p.$eval("#live-paper", (el: Element) => Number(el.getAttribute("data-live-version")));
const v1 = await versionOf(s1.page);
const sent = Date.now();
await clickText(teacher, "New exercise").catch(() => clickText(teacher, "Generate"));
const reached = await Promise.all(
  [s1, s2].map(async (s) => {
    const ok = await within(s.page, (v: number) => Number(document.querySelector("#live-paper")?.getAttribute("data-live-version")) > v, 30000, v1);
    return ok ? Date.now() - sent : Infinity;
  }),
);
check(reached.every((ms) => ms < 30000), `a new exercise reached both devices (${reached.map((m) => (m / 1000).toFixed(1)).join(" s, ")} s after the click, generation included)`);
for (const [i, s] of [s1, s2].entries()) {
  const kept = await s.page.$eval("[data-live-part]", (el: Element) => el.getAttribute("data-live-part")).catch(() => "all");
  check(kept === s.part && (await voicesDrawn(s.page)) === 1, `student ${i + 1} keeps their part (${kept})`);
}

// ── Start together ────────────────────────────────────────────────────────
await clickText(teacher, `${code.slice(0, 3)}-${code.slice(3)}`);
await teacher.waitForSelector("[data-live-code]", { timeout: 5000 });
await clickText(teacher, "Start together");
const counted = await Promise.all([s1, s2].map((s) => within(s.page, () => !!document.querySelector(".live-count"), 12000)));
check(counted.every(Boolean), "both devices count in");
const following = await Promise.all([s1, s2].map((s) => within(s.page, () => !!document.querySelector("#live-paper .live-now"), 15000)));
check(following.every(Boolean), "both devices follow the music with the cursor");
await clickText(teacher, "Stop");

// ── Live off: back to waiting; Live on: back on their parts ──────────────
await clickText(teacher, "Turn Live off");
const waiting = await Promise.all([s1, s2].map((s) => within(s.page, () => !!document.querySelector("[data-live-waiting]"), 15000)));
check(waiting.every(Boolean), "Live off sends both devices back to waiting");
await clickText(teacher, "Live");
await teacher.waitForSelector("[data-live-code]", { timeout: 15000 });
check((await teacher.$eval("[data-live-code]", (el: Element) => el.getAttribute("data-live-code"))) === code, "Live on again uses the same code");
for (const [i, s] of [s1, s2].entries()) {
  const back = await within(s.page, () => !!document.querySelector("#live-paper svg") && !document.querySelector("[data-live-waiting]"), 20000);
  const part = back ? await s.page.$eval("[data-live-part]", (el: Element) => el.getAttribute("data-live-part")).catch(() => "all") : null;
  check(back && part === s.part, `student ${i + 1} is back on ${s.part} with no tap (${part})`);
}

// A reload keeps the part.
await s2.page.reload({ waitUntil: "domcontentloaded" });
const reloaded = await within(s2.page, () => !!document.querySelector("#live-paper svg"), 20000);
const afterReload = reloaded ? await s2.page.$eval("[data-live-part]", (el: Element) => el.getAttribute("data-live-part")).catch(() => "all") : null;
check(afterReload === s2.part, `a reload keeps the part (${afterReload})`);

// ── The poster, and an old-style link ─────────────────────────────────────
const poster = await teacherCtx.newPage();
await poster.goto(`${APP}/live/poster`, { waitUntil: "domcontentloaded" });
const posterText = await poster.evaluate(() => document.body.textContent ?? "");
const posterQr = await poster.$("svg.poster-qr path");
check(posterText.includes(`/live/${code}`) && posterText.includes(`${code.slice(0, 3)}-${code.slice(3)}`) && !!posterQr, "the poster carries the room's address, code and QR");
if (SHOTS) await poster.screenshot({ path: `${SHOTS}/live-poster.png`, fullPage: true });
const old = await device(3);
await old.goto(`${APP}/live?code=${code}`, { waitUntil: "domcontentloaded" });
check(await within(old, (c: string) => location.pathname === `/live/${c}`, 15000, code), "an old /live?code= link lands on the room's address");

await clickText(teacher, "Turn Live off").catch(async () => {
  await clickText(teacher, `${code.slice(0, 3)}-${code.slice(3)}`);
  await clickText(teacher, "Turn Live off");
});
await sleep(300);
await browser.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
