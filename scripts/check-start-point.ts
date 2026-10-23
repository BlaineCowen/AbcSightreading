/**
 * Does Play start from a tapped note on the practice pages? Blaine's item 9
 * ("Cursor on note"): pausing or clicking a note should start there, not at
 * the top, and the place should show even with the cursor off.
 *
 * On the page (dev server), with an eight-bar exercise:
 * - a note on the second line tapped: an orange "Start" line before it;
 * - Play: the count-in's words ("1, 2, Ready, Go"), then the music from that
 *   note (the audio started at its offset, one count-in after Play), the note
 *   lit as it sounds, and no note before it;
 * - Pause: a "Paused" line; Stop: back to "Start" on the tapped note;
 * - a tap while playing (back on the first line) jumps there at once, no count-in;
 * - Back to start: no line, and Play from the top again.
 *
 *   bun run scripts/check-start-point.ts      # PAGE=unison|choral, APP=http://localhost:4321, SHOTS=<dir>
 */
import puppeteer, { type Page } from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const PAGE = process.env.PAGE ?? "unison";
const SHOTS = process.env.SHOTS;
const BPM = 120;
let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log(`FAIL: ${m}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 1000 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
// Signed out is enough (a few free exercises). Intercepting requests also
// stalls Choral's generator worker, so nothing is mocked.
if (process.env.MOCK_PRO) await page.setRequestInterception(true);
if (process.env.MOCK_PRO) page.on("request", (req) => {
  const url = new URL(req.url());
  const json = (body: unknown) => req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname === "/api/auth/get-session")
    return json({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "start@test.local", name: "Start", accountType: "standard", emailVerified: true } });
  if (url.pathname === "/api/billing") return json({ plan: "pro", billingEnabled: true, subscription: null });
  if (url.pathname.startsWith("/api/usage")) return json({ allowed: true, plan: "pro", limit: null, remaining: null });
  if (url.pathname === "/api/presets" || url.pathname === "/api/classes" || url.pathname === "/api/recent") return json([]);
  if (url.pathname === "/api/preferences") return json({});
  return req.continue();
});
// Every long buffer started is the music (a tapped note's sample is shorter): when, and from how far in.
await page.evaluateOnNewDocument(() => {
  // No welcome card or tour over the score.
  for (const k of ["abc-welcome-v1", "abc-tour-unison-v1", "abc-tour-choral-v1"]) localStorage.setItem(k, "done");
  const music: { at: number; offset: number; now: number; perf: number }[] = ((window as any).__music = []);
  const P = AudioBufferSourceNode.prototype as any;
  const start = P.start;
  P.start = function (when?: number, offset?: number, ...rest: any[]) {
    const ctx = this.context as AudioContext;
    if ((this.buffer?.duration ?? 0) >= 5) music.push({ at: Math.max(when ?? 0, ctx.currentTime), offset: offset ?? 0, now: ctx.currentTime, perf: performance.now() });
    return start.call(this, when, offset, ...rest);
  };
});

const url =
  PAGE === "choral"
    ? `${APP}/choral-sightreading`
    : `${APP}/sightreading?measures=8&bpm=${BPM}&timeSignature=4/4`;
await page.goto(url, { waitUntil: "networkidle2" });
await sleep(1500);
await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /New exercise/.test(b.textContent ?? "")) as HTMLButtonElement | undefined)?.click());
await page.waitForSelector("#paper svg .abcjs-note", { timeout: 120000 });
await sleep(1500);

const startLabel = (p: Page) => p.evaluate(() => document.querySelector("#paper svg .sr-start-line text")?.textContent ?? (document.querySelector("#paper svg .sr-start-line") ? "(no label)" : ""));
const press = (p: Page, label: string) => p.evaluate((l) => (document.querySelector(`[aria-label="${l}"]`) as HTMLButtonElement | null)?.click(), label);
/** Taps the first note of a line (abcjs listens for the mouse on the SVG). */
async function tapNote(line: number) {
  const box = await page.evaluate((l) => {
    const el = document.querySelector(`#paper svg .abcjs-note.abcjs-l${l}`);
    el?.scrollIntoView({ block: "center" });
    const r = el?.querySelector("path")?.getBoundingClientRect() ?? el?.getBoundingClientRect();
    el?.setAttribute("data-tapped", String(l));
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, line);
  if (!box) throw new Error(`no note on line ${line + 1}`);
  await page.mouse.click(box.x, box.y);
  await sleep(300);
}
/** The words shown through the count-in, in order, for `ms`. */
async function wordsFor(ms: number) {
  const words: string[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const w = await page.evaluate(() => document.querySelector(".count-in span, .badge span")?.textContent ?? "");
    if (w && w !== words[words.length - 1]) words.push(w);
    // "Go" is the last word: stop once it has gone.
    if (!w && words[words.length - 1] === "Go") break;
    await sleep(30);
  }
  return words;
}
const shot = async (name: string) => SHOTS && page.screenshot({ path: `${SHOTS}/${PAGE}-${name}.png` });

// 1. A note on the second line is tapped: "Start" before it.
await tapNote(1);
if ((await startLabel(page)) !== "Start") fail(`after a tap the line says "${await startLabel(page)}"`);
await shot("1-start");

// 2. Play: the count-in, then the music from the note.
await page.evaluate(() => {
  (window as any).__music.length = 0;
  (window as any).__playAt = performance.now();
});
await press(page, "Play");
const words = await wordsFor(20000);
console.log(`  count-in: ${words.join(", ") || "none"}`);
if (words.slice(-2).join(" ") !== "Ready Go") fail(`the count-in said "${words.join(", ")}"`);
await sleep(400);
const starts: { at: number; offset: number; now: number; perf: number }[] = await page.evaluate(() => (window as any).__music);
const playAt: number = await page.evaluate(() => (window as any).__playAt);
console.log(`  buffers started: ${JSON.stringify(starts.map((x) => ({ in: +(x.at - x.now).toFixed(2), offset: +x.offset.toFixed(2) })))}`);
const first = starts[starts.length - 1];
if (!first) fail("no music started");
else {
  // A count-in (a bar of four beats) after Play, from inside the music. The
  // first Play also loads the sounds, so this is a floor, not an exact time.
  const wait = (first.perf + (first.at - first.now) * 1000 - playAt) / 1000;
  console.log(`  music: from ${first.offset.toFixed(2)} s in, ${wait.toFixed(2)} s after Play`);
  if (first.offset < 1) fail(`the music started ${first.offset.toFixed(2)} s in, not from the second line`);
  if (wait < 1.5) fail(`the music came in ${wait.toFixed(2)} s after Play, not after a count-in`);
}
const lit = await page.evaluate(() => {
  const lines = [...document.querySelectorAll("#paper svg .sr-now")].map((e) => Number(/abcjs-l(\d+)/.exec(e.getAttribute("class") ?? "")?.[1] ?? -1));
  return { lines, tapped: document.querySelector("[data-tapped]")?.classList.contains("sr-now") ?? false };
});
console.log(`  lit after the count-in: lines ${[...new Set(lit.lines)].join(",") || "none"}`);
if (lit.lines.some((l) => l === 0)) fail("a note on the first line lit: it played from the top");
if (await startLabel(page)) fail("the start line stayed on while playing");
await shot("2-playing");

// 3. Pause: "Paused"; Stop: "Start" on the tapped note again.
await sleep(800);
await press(page, "Pause");
await sleep(300);
if ((await startLabel(page)) !== "Paused") fail(`after Pause the line says "${await startLabel(page)}"`);
await shot("3-paused");
await press(page, "Stop");
await sleep(300);
if ((await startLabel(page)) !== "Start") fail(`after Stop the line says "${await startLabel(page)}"`);

// 4. A tap while playing goes straight there, no count-in.
await page.evaluate(() => ((window as any).__music.length = 0));
await press(page, "Play");
// Through its count-in, until the music is playing.
await page.waitForFunction(() => {
  // Booked ahead on Unison: wait until it sounds, not just until it is booked.
  const m = (window as any).__music[0];
  return !!m && performance.now() >= m.perf + (m.at - m.now) * 1000;
}, { timeout: 20000 }).catch(() => fail("Play after Stop never started the music"));
await sleep(600);
await page.evaluate(() => ((window as any).__music.length = 0));
await tapNote(0);
await sleep(300);
const jumped: { at: number; offset: number; now: number }[] = await page.evaluate(() => (window as any).__music);
if (!jumped[0]) fail("a tap while playing did not move the music");
else {
  console.log(`  jump: from ${jumped[0].offset.toFixed(2)} s in, ${(jumped[0].at - jumped[0].now).toFixed(2)} s after the tap`);
  if (jumped[0].at - jumped[0].now > 0.3) fail("a tap while playing counted in");
  if (first && jumped[0].offset >= first.offset) fail(`a tap on the first line jumped to ${jumped[0].offset.toFixed(2)} s in`);
}
await press(page, "Pause");
await sleep(200);

// 5. Back to start: no line, and Play from the top.
await press(page, "Back to start");
await sleep(300);
if (await startLabel(page)) fail(`after Back to start the line says "${await startLabel(page)}"`);
await page.evaluate(() => ((window as any).__music.length = 0));
await press(page, "Play");
await sleep(2700);
const top: { offset: number }[] = await page.evaluate(() => (window as any).__music);
if (!top[0] || top[0].offset > 0.05) fail(`after Back to start Play began ${top[0]?.offset.toFixed(2)} s in`);
await press(page, "Stop");

await browser.close();
console.log(failures ? `${failures} failed` : "all checks passed");
process.exit(failures ? 1 : 0);
