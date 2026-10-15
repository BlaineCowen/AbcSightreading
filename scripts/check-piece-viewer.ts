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
 *   PIP_SHOTS=<dir> Pip (pitch-guide.ts) beside a note, fed a pitch a third high, a little flat and in tune
 *
 * Opens the director's view, a student's assignment and the teacher's look at
 * that assignment, and checks what each offers: in the director's, the
 * settings pills, a tapped note as where Play starts (and a jump while
 * playing), Pause carrying on, and Listen and grade in both modes on a fake
 * microphone (a tone, so the run is only checked to start, run and finish).
 * Needs `bun run dev`.
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

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
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
/** What the Bars pill (or an assignment's playback bar) says. */
const label = (page: any) =>
  page.evaluate(() => {
    const pill = [...document.querySelectorAll(".set-pill")].find((p) => (p.textContent ?? "").includes("Bars"));
    const bar = document.querySelector(".playback-bar [role=status]");
    return ((pill ?? bar)?.textContent ?? "").replace(/\s+/g, " ").trim();
  });
/** Opens a settings pill by the words on it. */
const pill = (page: any, word: string) =>
  page.evaluate((w: string) => {
    const b = [...document.querySelectorAll(".set-pill")].find((x) => (x.textContent ?? "").includes(w)) as HTMLButtonElement | undefined;
    b?.click();
    return !!b;
  }, word);
const clickIncludes = (page: any, text: string) =>
  page.evaluate((t: string) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes(t));
    (b as HTMLButtonElement | undefined)?.click();
    return !!b;
  }, text);
/** Clicks the k-th drawn note with the mouse, as a reader would. */
const tapNote = async (page: any, k: number) => {
  const at = await page.evaluate((i: number) => {
    const n = [...document.querySelectorAll("#piece-paper .abcjs-note")][i] as SVGGraphicsElement | undefined;
    if (!n) return null;
    n.scrollIntoView({ block: "center" });
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, k);
  if (!at) return false;
  await sleep(200);
  await page.mouse.click(at.x, at.y);
  await sleep(300);
  return true;
};
const startChip = (page: any) => page.evaluate(() => document.querySelector(".start-chip")?.textContent?.replace(/\s+/g, " ").trim() ?? "");

// The director's own view.
{
  const page = await open("", "director");
  await shot(page, "1-director", true);
  const buttons: string[] = (await texts(page, "button")).filter(Boolean);
  for (const want of ["Starting pitches", "Listen and grade", "Count-in", "Click", "Key", "Parts", "Bars", "Class libraries"]) {
    if (!buttons.some((b) => b.includes(want))) fail(`director: no "${want}"`);
  }
  if (!(await page.$(".playback-bar"))) fail("director: no playback bar");
  await noBoxes(page, "director");
  if (await faded(page)) fail("director: bars faded with the whole piece chosen");

  // Choose bars 3 to 6 by tapping the music.
  await pill(page, "Bars");
  await sleep(300);
  await clickText(page, "Choose bars on the music");
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
  if (!/3 to 6/.test(l)) fail(`director: chose bars 3 to 6, the bar says "${l}"`);
  if (!(await faded(page))) fail("director: nothing fades outside the chosen bars");
  await noBoxes(page, "director, bars chosen");
  if (await page.evaluate(() => document.querySelectorAll("#piece-paper [data-bar]").length)) fail("director: the tap targets stayed after choosing");
  await shot(page, "1b-director-bars", true);

  // Key: down two, saved with the piece.
  await pill(page, "Key");
  await sleep(300);
  await clickIncludes(page, "down 2");
  await sleep(1200);
  const keyText = await page.evaluate(() => document.querySelector(".set-pop [aria-pressed=true]")?.textContent?.replace(/\s+/g, " ").trim() ?? "");
  console.log(`key: ${keyText}`);
  if (!/down 2/.test(keyText)) fail(`director: the key reads "${keyText}"`);
  await clickText(page, "Done");
  if (!patches.some((x: any) => x.settings?.transpose === -2)) fail("director: the key was not saved");
  // Every line's key signature the same (abcjs's own transposition drew line 1's and another after).
  const sigs: number[] = await page.evaluate(() => [...document.querySelectorAll("#piece-paper .abcjs-key-signature")].map((k) => k.querySelectorAll("path").length));
  console.log(`key signatures per staff after the move: ${sigs.join(" ")}`);
  if (!sigs.length || new Set(sigs).size !== 1) fail(`director: key signatures differ from line to line (${sigs.join(" ")})`);

  // The sound in another key: up 2, with the music still drawn down 2.
  await pill(page, "Key");
  await sleep(300);
  // Another key starts a semitone above the music (down 1), then up three more to up 2.
  const soundTapped = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[aria-labelledby="key-sound"] button')].find((x) => /Another key/.test(x.textContent ?? ""));
    (b as HTMLButtonElement | undefined)?.click();
    return !!b;
  });
  if (!soundTapped) fail("director: no sound key to choose");
  for (let k = 0; k < 3; k++) {
    await sleep(250);
    await page.evaluate(() => (document.querySelector('[aria-label="Sound a semitone higher"]') as HTMLButtonElement | null)?.click());
  }
  await sleep(600);
  const keys = await page.evaluate(() => (window as any).__pieceDebug.keys());
  console.log(`keys: drawn ${keys.drawn}, heard ${keys.heard}`);
  if (!keys.heard || keys.heard === keys.drawn) fail(`director: the sound is in the drawn key (${keys.drawn} / ${keys.heard})`);
  if (!patches.some((x: any) => x.settings?.sound === 2 && x.settings?.transpose === -2)) fail("director: the sound key was not saved");
  const sigs2: number[] = await page.evaluate(() => [...document.querySelectorAll("#piece-paper .abcjs-key-signature")].map((k) => k.querySelectorAll("path").length));
  if (sigs2.join() !== sigs.join()) fail(`director: choosing the sound redrew the music (${sigs.join(" ")} -> ${sigs2.join(" ")})`);
  const pillText = await page.evaluate(() => [...document.querySelectorAll(".set-pill")].find((b) => /Key/.test(b.textContent ?? ""))?.textContent?.replace(/\s+/g, " ").trim() ?? "");
  if (!/sounds in/.test(pillText)) fail(`director: the Key pill reads "${pillText}"`);
  await shot(page, "1c-director-sound-key", true);
  await page.evaluate(() => [...document.querySelectorAll('[aria-labelledby="key-sound"] button')].find((x) => /Same as the music/.test(x.textContent ?? ""))?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await sleep(400);
  const back = await page.evaluate(() => (window as any).__pieceDebug.keys());
  if (back.heard !== back.drawn) fail(`director: Same as the music still sounds apart (${back.drawn} / ${back.heard})`);
  if (!patches.some((x: any) => x.settings?.sound === null)) fail("director: Same as the music was not saved");
  await clickText(page, "Done");

  // Practice mixes, offered to class libraries; and into one.
  await pill(page, "Parts");
  await sleep(300);
  if (!(await clickText(page, "Group 2 loud"))) fail("director: no Group 2 loud in Parts");
  await clickText(page, "Done");
  await pill(page, "Class libraries");
  await sleep(300);
  await clickText(page, "Offer practice mixes in class libraries");
  await sleep(300);
  if (!patches.some((x: any) => x.settings?.practiceMixes === true)) fail("director: practice mixes were not saved as offered");
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

// Where Play starts is a line on the music; playing, a line follows the
// notes; Loop from a tapped note goes back to the top, not the note.
{
  const page = await open("", "director loop");
  if (!(await page.$("#piece-paper .piece-start-line rect"))) fail("start line: no line where Play starts");
  const notes = await page.evaluate(() => document.querySelectorAll("#piece-paper .abcjs-note").length);
  if (!(await tapNote(page, notes - 1))) fail("loop: no note to tap");
  const chip = await startChip(page);
  const tappedBar = Number(/bar (\d+)/.exec(chip)?.[1] ?? 0);
  await page.evaluate(() => {
    const f = document.querySelector(".playback-bar input[type=number]") as HTMLInputElement;
    f.value = "200";
    f.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.evaluate(() => (document.querySelector('[aria-label="Toggle loop"]') as HTMLButtonElement)?.click());
  await page.evaluate(() => (document.querySelector('[aria-label="Play"]') as HTMLButtonElement)?.click());
  await page.waitForSelector("#piece-paper .piece-play-line rect", { timeout: 20000 }).catch(() => fail("cursor: no line follows the music"));
  if (await page.$("#piece-paper .piece-start-line rect")) fail("start line: still shown while playing");
  // Round again: the tapped bar ends, then the count-in, then the top.
  let wrapped: { bar: number } | null = null;
  for (let i = 0; i < 40 && !wrapped; i++) {
    await sleep(250);
    const at = await page.evaluate(() => (window as any).__pieceDebug?.position?.() ?? null);
    if (at && at.bar < tappedBar - 2) wrapped = at;
  }
  console.log(`loop: tapped bar ${tappedBar}, came round to bar ${wrapped?.bar}`);
  if (!wrapped || wrapped.bar > 2) fail(`loop: came round to bar ${wrapped?.bar}, not the top`);
  await page.evaluate(() => (document.querySelector('[aria-label="Stop"]') as HTMLButtonElement)?.click());
  await sleep(300);
  if (!(await page.$("#piece-paper .piece-start-line rect"))) fail("start line: not back after Stop");
  await shot(page, "5a-start-line", true);
  await page.close();
}

{
  const page = await open("", "director playback");
  if (await startChip(page)) fail("playback: a start point before any note was tapped");
  if (!(await tapNote(page, 14))) fail("playback: no note to tap");
  const chip = await startChip(page);
  console.log(`tapped: ${chip}`);
  if (!/Plays from bar \d+/.test(chip)) fail(`playback: tapping a note says "${chip}"`);
  if (!(await page.$("#piece-paper .piece-start"))) fail("playback: the tapped note is not marked");
  const tappedBar = Number(/bar (\d+)/.exec(chip)?.[1] ?? 0);
  // Play from it (window.__pieceDebug: where the music is, dev only).
  await page.evaluate(() => (document.querySelector('[aria-label="Play"]') as HTMLButtonElement)?.click());
  await page.waitForSelector('[aria-label="Pause"]', { timeout: 20000 }).catch(() => fail("playback: Play never started"));
  await page.waitForSelector("#piece-paper .piece-now", { timeout: 15000 }).catch(() => fail("playback: no cursor"));
  await sleep(1500);
  const before = await page.evaluate(() => (window as any).__pieceDebug?.position?.() ?? null);
  if (!before || before.bar < tappedBar - 1) fail(`playback: started at bar ${before?.bar} after tapping bar ${tappedBar}`);
  // Jump while playing: tap an earlier note; it carries on from there, still playing.
  await tapNote(page, 2);
  await sleep(1200);
  const jumped = await page.evaluate(() => (window as any).__pieceDebug?.position?.() ?? null);
  console.log(`jump: bar ${before?.bar} -> bar ${jumped?.bar}`);
  if (!jumped || jumped.bar >= (before?.bar ?? 0)) fail("playback: tapping a note while playing did not jump");
  if (!(await page.$('[aria-label="Pause"]'))) fail("playback: the jump stopped the music");
  // Pause, then Play carries on from there.
  await page.evaluate(() => (document.querySelector('[aria-label="Pause"]') as HTMLButtonElement)?.click());
  const paused = await page.evaluate(() => (window as any).__pieceDebug?.paused?.() ?? null);
  if (!paused) fail("playback: Pause kept no place");
  await page.evaluate(() => (document.querySelector('[aria-label="Play"]') as HTMLButtonElement)?.click());
  await sleep(4000);
  const resumed = await page.evaluate(() => (window as any).__pieceDebug?.position?.() ?? null);
  console.log(`paused at ${Math.round(paused ?? 0)} ms, playing on at bar ${resumed?.bar}`);
  if (!resumed || resumed.bar < (jumped?.bar ?? 0)) fail("playback: Play after Pause started over");
  // A new tempo while playing keeps going, from the same place.
  await page.evaluate(() => {
    const f = document.querySelector('.playback-bar input[type=number]') as HTMLInputElement;
    f.value = "150";
    f.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(2500);
  if (!(await page.$('[aria-label="Pause"]'))) fail("playback: a new tempo stopped the music");
  const fast = await page.evaluate(() => (window as any).__pieceDebug?.position?.() ?? null);
  if (!fast || fast.bar < (resumed?.bar ?? 0)) fail(`playback: a new tempo lost the place (bar ${resumed?.bar} -> ${fast?.bar})`);
  await page.evaluate(() => (document.querySelector('[aria-label="Stop"]') as HTMLButtonElement)?.click());
  await shot(page, "5-tapped", true);

  // Listen and grade: the setup asks for a part and what plays.
  await clickIncludes(page, "Listen and grade");
  await sleep(500);
  const setup: string[] = await texts(page, "[role=dialog] button");
  for (const want of ["Group 1", "Group 2", "Group 3", "The other parts", "Everyone", "A cappella", "Pitch & rhythm", "Note by note"]) {
    if (!setup.some((b) => b.includes(want))) fail(`grade: the setup has no "${want}"`);
  }
  if (setup.some((b) => b.includes("New exercise"))) fail("grade: offers a new exercise for a piece");
  await shot(page, "6-grade-setup");
  // Note by note: the first note waits, lit.
  await clickIncludes(page, "Note by note");
  await clickIncludes(page, "Group 2");
  await page.evaluate(() => ([...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent?.trim() === "Start") as HTMLButtonElement)?.click());
  await page.waitForFunction(() => /Note 1 of/.test(document.querySelector("[aria-label=Grade]")?.textContent ?? ""), { timeout: 15000 }).catch(() => fail("grade: Note by note never reached the first note"));
  if (!(await page.$("#piece-paper .piece-now"))) fail("grade: the note waited on is not lit");
  await shot(page, "7-grade-note-by-note");
  await clickText(page, "Stop");
  await sleep(500);
  // Pitch & rhythm, a cappella, fast: it runs to the end and grades.
  await page.evaluate(() => {
    const f = document.querySelector('.playback-bar input[type=number]') as HTMLInputElement;
    f.value = "200";
    f.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.evaluate(() => ([...document.querySelectorAll("[aria-label=Grade] button")].find((b) => /change/.test(b.textContent ?? "")) as HTMLButtonElement)?.click());
  await sleep(400);
  await clickIncludes(page, "Pitch & rhythm");
  await clickIncludes(page, "A cappella");
  await page.evaluate(() => ([...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent?.trim() === "Start") as HTMLButtonElement)?.click());
  await page.waitForFunction(() => /Your score/.test(document.body.textContent ?? ""), { timeout: 60000 }).catch(() => fail("grade: Pitch & rhythm never reached a score"));
  const result = await page.evaluate(() => document.querySelector("#grade-result-title")?.closest("[role=dialog]")?.textContent?.replace(/\s+/g, " ").slice(0, 120) ?? "");
  console.log(`graded: ${result}`);
  if (!(await page.$("#piece-paper .grade-good, #piece-paper .grade-ok, #piece-paper .grade-bad"))) fail("grade: no marks on the music");
  await shot(page, "8-grade-result");

  // Hear your take: the run's recording plays back, the music under it on request, the score following.
  if (!(await clickIncludes(page, "Hear your take"))) fail("take: no Hear your take after a Pitch & rhythm run");
  await page.waitForFunction(() => !!document.querySelector('[aria-label="Where in your take"]') && !!document.querySelector('button[aria-label="Pause"]'), { timeout: 15000 }).catch(() => fail("take: it never started playing"));
  if (!(await clickText(page, "With the music"))) fail("take: no With the music");
  await page.waitForFunction(() => Number((document.querySelector('[aria-label="Where in your take"]') as HTMLInputElement | null)?.value ?? 0) > 0.05, { timeout: 15000 }).catch(() => fail("take: it never moved on"));
  await page.waitForFunction(() => !!document.querySelector("#piece-paper .piece-now"), { timeout: 15000 }).catch(() => {});
  const lit = await page.evaluate(() => document.querySelectorAll("#piece-paper .piece-now").length);
  const takeLine = await page.evaluate(() => document.querySelector('[aria-label="Where in your take"]')?.parentElement?.textContent?.replace(/\s+/g, " ").trim() ?? "");
  console.log(`take: ${lit} drawn elements lit, "${takeLine}"`);
  if (!lit) fail("take: the score does not follow the take");
  await shot(page, "9-grade-take");
  await page.evaluate(() => (document.querySelector('button[aria-label="Stop playing your take"]') as HTMLButtonElement | null)?.click());
  await sleep(300);
  if (await page.$("#piece-paper .piece-now")) fail("take: a note stayed lit after stopping the take");
  await page.close();
}

// The teacher opening their assignment: the director's view first, then the student's.
{
  const page = await open("as=teacher", "assignment teacher");
  const sw = await texts(page, ".view-switch button");
  if (sw.join("|") !== "Director view|Student view") fail(`teacher: the view switch reads ${sw.join("|")}`);
  if (!(await texts(page, "button")).some((b: string) => b.includes("Starting pitches"))) fail("teacher: no director tools at first");
  const l = await label(page);
  if (!/3 to 6/.test(l)) fail(`teacher: the assignment's bars are not ready to rehearse ("${l}")`);
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

// Pip, the pitch guide, beside the note waited on (never over it): fed by hand, no microphone.
if (process.env.PIP_SHOTS) {
  const page = await open("", "pip");
  for (const [name, cents] of [["off", 300], ["near", -40], ["in", 0]] as const) {
    const clip = await page.evaluate(async (cents: number) => {
      const { PitchGuide } = await import("/src/lib/pitch-guide.ts" as string);
      const { headOf } = await import("/src/lib/grade-feedback.ts" as string);
      (window as any).__pip?.destroy();
      const svg = document.querySelector("#piece-paper svg") as SVGSVGElement;
      const note = [...svg.querySelectorAll(".abcjs-note")][5] as SVGGElement;
      note.scrollIntoView({ block: "center" });
      const g = new PitchGuide({ doPc: 7, nameOf: (m: number) => ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][m % 12], tolerance: 25, reduceMotion: true });
      (window as any).__pip = g;
      g.setNote(() => ({ svg, head: headOf({ absEl: { elemset: [note] } })! }), 71);
      g.feed({ sung: 71 + cents / 100, cents, hold: cents === 0 ? 0.6 : 0, credited: false, helping: false });
      const r = note.getBoundingClientRect();
      return { x: Math.max(0, r.left - 200), y: Math.max(0, r.top - 130), width: 360, height: 260 };
    }, cents);
    await sleep(1200);
    await page.screenshot({ path: `${process.env.PIP_SHOTS}/pip-${name}.png`, clip });
  }
  await page.close();
}

console.log(failures ? `${failures} check(s) failed` : "all checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
