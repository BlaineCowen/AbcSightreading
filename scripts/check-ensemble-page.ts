/**
 * The Ensemble tab end to end on the dev server (/dev/ensemble, abcTuner with
 * no account): the microphone is replaced by the recording, played on a loop
 * (headless Chrome's own fake capture file gave silence), the tab
 * records it, listens, and shows its parts, roll and transport; then the same
 * file is opened as a file. Checks that notes are found, every part has a
 * figure, playback moves the playhead, a part plays alone, a tapped note
 * gets its chip, nothing scrolls sideways, and no page error.
 *
 *   bun run scripts/check-ensemble-page.ts <mono wav>
 *   APP=http://localhost:4321  SHOTS=<dir>  PHONE=1  THEME=dark  SECONDS=8
 */
import { readFileSync } from "node:fs";
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const WAV = process.argv[2];
const SHOTS = process.env.SHOTS ?? "";
const SECONDS = Number(process.env.SECONDS ?? 8);
if (!WAV) throw new Error("usage: bun run scripts/check-ensemble-page.ts <mono wav>");

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
let failures = 0;
const fail = (m: string) => (failures++, console.log("  FAIL " + m));
const ok = (m: string) => console.log("  ok   " + m);
try {
  const page = await browser.newPage();
  if (process.env.PHONE) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  if (process.env.THEME) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: process.env.THEME }]);
  page.on("pageerror", (e) => fail("page error: " + e.message));
  // The microphone: the recording on a loop, through a stream of its own.
  await page.evaluateOnNewDocument((b64: string) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  }, readFileSync(WAV).toString("base64"));
  page.on("console", (m) => { if (m.type() === "error") console.log("  console: " + m.text().slice(0, 300)); });
  const shot = async (name: string) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  const clickText = async (text: string) => {
    const done = await page.evaluate((t) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim().startsWith(t) && !(x as HTMLButtonElement).disabled);
      b?.click();
      return !!b;
    }, text);
    if (!done) throw new Error(`no button "${text}"`);
  };
  const waitResults = async () => {
    await page.waitForFunction(
      () => document.body.innerText.includes("Everyone:") || document.querySelector('[role="alert"]'),
      { timeout: 120_000 }
    );
  };
  const readResults = () =>
    page.evaluate(() => {
      const text = document.body.innerText;
      const everyone = /Everyone: (.+?) on average, within 10¢ (\d+)% of the time/.exec(text);
      const notes = /(\d+) notes(?:, (\d+) unsure)?/.exec(text);
      const cards = [...document.querySelectorAll("button[aria-pressed]")].map((b) => (b as HTMLElement).innerText.replace(/\n+/g, " "));
      return { everyone: everyone?.[0] ?? null, notes: notes ? Number(notes[1]) : 0, unsure: notes?.[2] ? Number(notes[2]) : 0, cards, wide: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });

  await page.goto(`${APP}/dev/ensemble`, { waitUntil: "networkidle2" });
  await clickText("Ensemble");
  await page.waitForFunction(() => document.body.innerText.includes("Ensemble tuning"), { timeout: 30_000 });
  ok("the tab opens");
  await shot("1-empty");

  // Record from the fake microphone.
  await clickText("Record");
  await page.waitForFunction(() => document.body.innerText.includes("Stop and listen"), { timeout: 10_000 });
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  await shot("2-recording");
  const t0 = Date.now();
  await clickText("Stop and listen");
  await waitResults();
  const rec = await readResults();
  console.log(`  recorded ${SECONDS} s, listened in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${rec.everyone}; ${rec.notes} notes, ${rec.unsure} unsure`);
  console.log(`  parts: ${rec.cards.join(" | ")}`);
  if (!rec.everyone || rec.notes < 5) fail("the recording gave no results");
  else ok("the recording is listened to");
  if (rec.cards.length !== 4 || rec.cards.some((c) => c.includes("nothing heard"))) fail("every part should have a figure");
  if (rec.wide) fail("the page scrolls sideways");
  await shot("3-recorded");

  // Playback moves the playhead.
  const clockText = () => page.evaluate(() => /(\d+:\d\d) \/ (\d+:\d\d)/.exec(document.body.innerText)?.[1] ?? "");
  await clickText("Play");
  await new Promise((r) => setTimeout(r, 1500));
  const t1 = await clockText();
  if (t1 === "0:00") fail("playing did not move the playhead");
  else ok(`playing moves the playhead (${t1})`);
  // One part alone.
  await page.evaluate(() => (document.querySelectorAll("button[aria-pressed]")[1] as HTMLElement).click());
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim().endsWith("alone")), { timeout: 5000 });
  await clickText("Alto alone").catch(() => clickText("Part 2 alone"));
  await new Promise((r) => setTimeout(r, 800));
  ok("a part plays alone");
  await shot("4-alto");
  await clickText("Pause");

  // Tap the roll until a note is chosen.
  const canvas = await page.$("canvas");
  const box = await canvas!.boundingBox();
  let chip = false;
  // A grid of taps over the roll, until one lands on a note (a miss moves the playhead, which is fine).
  for (let gy = 0.12; gy < 0.92 && !chip && box; gy += 0.04) {
    for (let gx = 0.1; gx < 0.95 && !chip; gx += 0.08) {
      const [tx, ty] = [box!.x + box!.width * gx, box!.y + box!.height * gy];
      if (process.env.PHONE) await page.touchscreen.tap(tx, ty);
      else await page.mouse.click(tx, ty);
      chip = await page.evaluate(() => document.body.innerText.includes("Hear it in tune"));
    }
  }
  if (!chip) fail("no note could be tapped");
  else {
    ok("a tapped note gets its chip");
    await clickText("Hear it alone");
    await clickText("Hear it in tune");
  }
  await shot("5-note");

  // The same audio as a file.
  await clickText("New take");
  const input = await page.$('input[type="file"]');
  await input!.uploadFile(WAV);
  await waitResults();
  const file = await readResults();
  console.log(`  file: ${file.everyone}; ${file.notes} notes; parts: ${file.cards.join(" | ")}`);
  if (!file.everyone || file.notes < rec.notes) fail("the file gave fewer notes than a part of it recorded");
  else ok("a file is listened to");
  await shot("6-file");
} finally {
  await browser.close();
}
console.log(failures ? `${failures} failures` : "clean");
process.exit(failures ? 1 : 0);
