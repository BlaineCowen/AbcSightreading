/**
 * Does Space leave the page where it is in Tap the rhythm? (Blaine, 20
 * November 2026: "make sure spacebar doesn't drag you down".) A long note
 * held down repeats the key, and the browser scrolls on every Space the page
 * does not keep. Real key presses (the browser's own, through DevTools: a
 * dispatched KeyboardEvent never scrolls, so check-rhythm-lane.ts could not
 * see this): Space held for a second mid-round, then a few late Spaces after
 * the round. The page may not move for either.
 *
 *   APP=http://localhost:4399 bun run scripts/check-rhythm-space.ts   # W=1200 H=700
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
let failed = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: Number(process.env.W ?? 1200), height: Number(process.env.H ?? 700) });
  await page.evaluateOnNewDocument(() => localStorage.setItem("sr-rhythm-lane", "still"));
  await page.goto(`${APP}/games/rhythm`, { waitUntil: "networkidle2" });
  await page.click(`[data-level="0"]`);
  await page.click(`[data-bars="2"]`);
  const clickText = (re: string) => page.evaluate((src: string) => [...document.querySelectorAll("button")].find((b) => new RegExp(src).test(b.textContent!.trim()))!.click(), re);
  await clickText("^New rhythm$");
  await page.waitForSelector("[data-game-play]");
  await sleep(1000);
  await page.click("[data-game-play]");
  // Two bars are one line: once the page has come up to it, nothing should move it.
  await sleep(2500);
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.down("Space");
  for (let i = 0; i < 30; i++) {
    await sleep(33);
    await page.keyboard.down("Space"); // held: a repeat
  }
  await page.keyboard.up("Space");
  const held = await page.evaluate(() => scrollY);
  console.log(`held Space mid-round: scrollY ${before} -> ${held}`);
  if (Math.abs(held - before) > 2) { failed++; console.log("FAIL: holding Space scrolled the page"); }

  await page.waitForSelector("[data-solo-score]", { timeout: 20000 });
  await sleep(1200);
  const after = await page.evaluate(() => scrollY);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Space");
    await sleep(80);
  }
  const late = await page.evaluate(() => scrollY);
  console.log(`late Spaces after the round: scrollY ${after} -> ${late}`);
  if (Math.abs(late - after) > 2) { failed++; console.log("FAIL: Space after the round scrolled the page"); }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} failed` : "ok");
process.exit(failed ? 1 : 0);
