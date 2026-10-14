/**
 * The piece viewer (My music) on the dev server, with no account and no
 * database: /dev/piece draws PieceViewer and this script answers its API
 * calls with a piece read from MusicXML (by default a three-part round in the
 * shape of Ghost of John, written here: three entries two bars apart, the
 * lowest in bass clef).
 *
 *   bun run scripts/check-piece-viewer.ts                SHOTS=<dir> screenshots
 *   FILE=<some.musicxml> the piece to open instead
 *   PHONE=1 a phone-sized viewport
 *
 * Opens the director's view, a student's assignment and the teacher's look at
 * that assignment, and checks what each offers. Needs `bun run dev`.
 */
import { readFileSync } from "node:fs";
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";
import { readMusicXml } from "../src/lib/pieces/read-musicxml";
import { defaultPartSettings } from "../src/lib/pieces/rules";

const APP = process.env.APP ?? "http://localhost:4321";
const SHOTS = process.env.SHOTS ?? "";

/** Ghost of John, roughly: E minor, 4/4, eight bars, sung as a round in three entries. */
function roundXml(): string {
  // [step, alter, octave, quarters]
  const tune: [string, number, number, number][][] = [
    [["E", 0, 4, 1], ["G", 0, 4, 1], ["A", 0, 4, 1], ["B", 0, 4, 1]],
    [["B", 0, 4, 2], ["B", 0, 4, 2]],
    [["E", 0, 4, 1], ["G", 0, 4, 1], ["A", 0, 4, 1], ["B", 0, 4, 1]],
    [["B", 0, 4, 4]],
    [["E", 0, 5, 1], ["D", 0, 5, 1], ["B", 0, 4, 1], ["A", 0, 4, 1]],
    [["B", 0, 4, 2], ["G", 0, 4, 2]],
    [["E", 0, 4, 1], ["F", 1, 4, 1], ["G", 0, 4, 1], ["A", 0, 4, 1]],
    [["E", 0, 4, 4]],
  ];
  const BARS = 12;
  const entries = [
    { id: "P1", name: "Group 1", start: 0, octave: 0, clef: "G" },
    { id: "P2", name: "Group 2", start: 2, octave: 0, clef: "G" },
    { id: "P3", name: "Group 3", start: 4, octave: -1, clef: "F" },
  ];
  const type = (q: number) => (q === 4 ? "whole" : q === 2 ? "half" : "quarter");
  const note = (s: string, alter: number, oct: number, q: number) =>
    `<note><pitch><step>${s}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${oct}</octave></pitch><duration>${q}</duration><voice>1</voice><type>${type(q)}</type></note>`;
  const parts = entries.map((e) => {
    const bars: string[] = [];
    for (let b = 0; b < BARS; b++) {
      const k = b - e.start;
      const body = k >= 0 && k < tune.length
        ? tune[k].map(([s, a, o, q]) => note(s, a, o + e.octave, q)).join("")
        : `<note><rest measure="yes"/><duration>4</duration><voice>1</voice></note>`;
      const attrs = b === 0
        ? `<attributes><divisions>1</divisions><key><fifths>1</fifths><mode>minor</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${e.clef}</sign><line>${e.clef === "G" ? 2 : 4}</line></clef></attributes>${e.id === "P1" ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type><sound tempo="96"/></direction>` : ""}`
        : "";
      bars.push(`<measure number="${b + 1}">${attrs}${body}</measure>`);
    }
    return `<part id="${e.id}">${bars.join("")}</part>`;
  });
  const list = entries.map((e) => `<score-part id="${e.id}"><part-name>${e.name}</part-name></score-part>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>Ghost of John</work-title></work><part-list>${list}</part-list>${parts.join("")}</score-partwise>`;
}

const bytes = process.env.FILE ? new Uint8Array(readFileSync(process.env.FILE)) : new TextEncoder().encode(roundXml());
const score = readMusicXml(bytes, process.env.FILE ?? "Ghost of John.musicxml");
let parts: Record<string, unknown> = defaultPartSettings(score);
let settings: Record<string, unknown> = {};
const ID = "dev-piece";
const summary = () => ({
  id: ID, title: score.title || "Ghost of John", composer: score.composer ?? "", sourceName: "Ghost of John.musicxml",
  bars: score.measures.length, parts: score.parts.map((p) => p.name), warnings: [], createdAt: Date.now(),
});
console.log(`${summary().title}: ${score.parts.length} parts, ${score.measures.length} bars`);

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
let failures = 0;
const fail = (m: string) => { failures++; console.log(`  FAIL: ${m}`); };
const patches: unknown[] = [];

async function open(query: string, name: string) {
  const page = await browser.newPage();
  if (process.env.PHONE) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 900 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: process.env.THEME ?? "light" }]);
  page.on("pageerror", (e) => { console.error(`  page error (${name}):`, e.message); failures++; });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    const j = (body: unknown, status = 200) => req.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname === `/api/pieces/${ID}/score`) return j(score);
    if (u.pathname === `/api/pieces/${ID}`) {
      if (req.method() === "PATCH") {
        const body = JSON.parse(req.postData() ?? "{}");
        patches.push(body);
        if (body.parts) parts = body.parts;
        if (body.settings) settings = body.settings;
      }
      return j({ piece: summary(), parts, settings });
    }
    if (u.pathname.startsWith("/api/assignments/")) return j({ role: name.includes("student") ? "student" : "teacher", max: null, attempts: [] });
    if (u.pathname === "/api/classes") return j([{ id: "c1", name: "Concert Choir" }, { id: "c2", name: "Treble Choir" }]);
    if (u.pathname.startsWith("/api/classes/") && u.pathname.includes("/library/")) return j({ ok: true });
    if (u.pathname === "/api/auth/get-session") return j({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "t@t.l", name: "T", accountType: "educator", emailVerified: true } });
    if (u.pathname === "/api/billing") return j({ plan: "educator", billingEnabled: true, subscription: null });
    return req.continue();
  });
  await page.goto(`${APP}/dev/piece?${query}`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#piece-paper svg", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
  const over = await page.evaluate(() => {
    const W = window.innerWidth;
    const wide = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > W + 1);
    return { by: document.documentElement.scrollWidth - W, what: wide.slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${(e.getAttribute("class") ?? "").split(" ")[0]}`) };
  });
  if (over.by > 0) fail(`${name}: the page scrolls sideways by ${over.by}px (${over.what.join(", ")})`);
  return page;
}

const shot = async (page: any, name: string, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
const texts = (page: any, sel: string) => page.evaluate((s: string) => [...document.querySelectorAll(s)].map((e) => (e.textContent ?? "").trim()), sel);

const clickText = (page: any, text: string) =>
  page.evaluate((t: string) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === t);
    (b as HTMLButtonElement | undefined)?.click();
    return !!b;
  }, text);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noBoxes = async (page: any, where: string) => {
  const n = await page.evaluate(() => document.querySelectorAll("#piece-paper .piece-shade, #piece-paper [class*='shade-']").length);
  if (n) fail(`${where}: ${n} shading boxes drawn over the music`);
};
const faded = (page: any) => page.evaluate(() => document.querySelectorAll("#piece-paper .piece-out").length);
const label = (page: any) => page.evaluate(() => document.querySelector(".t-label")?.textContent?.trim() ?? "");

// The director's own view.
{
  const page = await open("", "director");
  await shot(page, "1-director", true);
  const buttons: string[] = (await texts(page, "button")).filter(Boolean);
  for (const want of ["Starting pitches", "Count-in", "Click", "Loop", "Full screen", "Choose bars", "Everyone", "Group 2 loud", "Offer practice mixes in class libraries", "Add to a class library"]) {
    if (!buttons.some((b) => b.includes(want))) fail(`director: no "${want}"`);
  }
  await noBoxes(page, "director");
  if (await faded(page)) fail("director: bars faded with the whole piece chosen");

  // Choose bars 3 to 6 by tapping the music.
  await clickText(page, "Choose bars");
  await sleep(300);
  const tapped = await page.evaluate(() => {
    const hit = (bar: number) => {
      const r = document.querySelector(`#piece-paper [data-bar="${bar}"]`);
      r?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return !!r;
    };
    return hit(2) && hit(5);
  });
  if (!tapped) fail("director: no bar to tap");
  await sleep(300);
  const l = await label(page);
  if (!/Bars 3 to 6/.test(l)) fail(`director: chose bars 3 to 6, the bar says "${l}"`);
  if (!(await faded(page))) fail("director: nothing fades outside the chosen bars");
  await noBoxes(page, "director, bars chosen");
  if (await page.evaluate(() => document.querySelectorAll("#piece-paper [data-bar]").length)) fail("director: the tap targets stayed after choosing");
  await shot(page, "1b-director-bars", true);

  // Key: down two, saved with the piece.
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => /as written/i.test(o.text))) as HTMLSelectElement;
    sel.value = "-2";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(1200);
  const keyText = await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => /as written/i.test(o.text))) as HTMLSelectElement;
    return sel.selectedOptions[0]?.text ?? "";
  });
  console.log(`key: ${keyText}`);
  if (!/down 2/.test(keyText)) fail(`director: the key reads "${keyText}"`);
  if (!patches.some((x: any) => x.settings?.transpose === -2)) fail("director: the key was not saved");
  // Every line's key signature the same (abcjs's own transposition drew line 1's and another after).
  const sigs: number[] = await page.evaluate(() => [...document.querySelectorAll("#piece-paper .abcjs-key-signature")].map((k) => k.querySelectorAll("path").length));
  console.log(`key signatures per staff after the move: ${sigs.join(" ")}`);
  if (!sigs.length || new Set(sigs).size !== 1) fail(`director: key signatures differ from line to line (${sigs.join(" ")})`);

  // Practice mixes, offered to class libraries; and into one.
  await clickText(page, "Group 2 loud");
  await clickText(page, "Offer practice mixes in class libraries");
  await sleep(300);
  if (!patches.some((x: any) => x.settings?.practiceMixes === true)) fail("director: practice mixes were not saved as offered");
  await clickText(page, "Add to a class library");
  await sleep(500);
  await clickText(page, "Concert Choir");
  await sleep(400);
  const status = await page.evaluate(() => document.querySelector('[role="status"].text-sr-brass')?.textContent ?? "");
  if (!/Concert Choir/.test(status)) fail(`director: adding to a library says "${status}"`);

  // Starting pitches, and play.
  await clickText(page, "Starting pitches");
  await page.evaluate(() => (document.querySelector('[aria-label="Play"]') as HTMLButtonElement)?.click());
  await page.waitForSelector('[aria-label="Pause"]', { timeout: 20000 }).catch(() => fail("director: Play never started"));
  await sleep(2500);
  await shot(page, "1c-director-playing");
  await page.evaluate(() => (document.querySelector('[aria-label="Pause"]') as HTMLButtonElement)?.click());
  await page.close();
}

// The teacher opening their assignment: the director's view first, then the student's.
{
  const page = await open("as=teacher", "assignment teacher");
  const sw = await texts(page, ".view-switch button");
  if (sw.join("|") !== "Director view|Student view") fail(`teacher: the view switch reads ${sw.join("|")}`);
  if (!(await texts(page, "button")).some((b: string) => b.includes("Starting pitches"))) fail("teacher: no director tools at first");
  const l = await label(page);
  if (!/Bars 3 to 6/.test(l)) fail(`teacher: the assignment's bars are not ready to rehearse ("${l}")`);
  await noBoxes(page, "teacher");
  await shot(page, "2-teacher-director", true);
  await clickText(page, "Student view");
  await sleep(1500);
  if (!(await page.$(".assign-card"))) fail("teacher: Student view shows no assignment card");
  if (!(await texts(page, "button")).some((b: string) => b.includes("Try the grading"))) fail("teacher: Student view has no Try the grading");
  if (!(await faded(page))) fail("teacher: Student view fades nothing outside the assignment");
  await noBoxes(page, "teacher, student view");
  await shot(page, "3-teacher-student-view", true);
  await clickText(page, "Director view");
  await sleep(1200);
  if (await page.$(".assign-card")) fail("teacher: back in the director's view the assignment card stays");
  await page.close();
}

// A student.
{
  const page = await open("as=student", "assignment student");
  if (await page.$(".view-switch")) fail("student: offered the director's view");
  if (!(await page.$(".assign-card"))) fail("student: no assignment card");
  await noBoxes(page, "student");
  await shot(page, "4-student", true);
  await page.close();
}

console.log(failures ? `${failures} check(s) failed` : "all checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
