/**
 * Does the still rhythm lane (Tap the rhythm, before and after a round) put
 * each note's pill under its notehead? (Blaine, 19 November 2026: "make sure
 * the bars under the notes line up with the starts of notes better".) For
 * each level: a new rhythm, then every pill's left edge against its note's
 * left edge in the drawing (by cursor, as rhythm-marks.ts finds it). Two-bar
 * rounds only: four bars are drawn on two lines and keep even beats.
 *
 *   APP=http://localhost:4399 bun run scripts/check-lane-under-notes.ts   # LEVELS=1,4,8,11 SHOT=path.png
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const LEVELS = (process.env.LEVELS ?? "1,2,3,4,5,6,7,8,9,10,11").split(",").map(Number);
const TOLERANCE = 3; // px
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
let failed = 0;
try {
  for (const width of [1200, 420]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.goto(`${APP}/games/rhythm`, { waitUntil: "networkidle2" });
    for (const level of LEVELS) {
      await page.click(`[data-level="${level - 1}"]`);
      for (let r = 0; r < 3; r++) {
        const out = await page.evaluate(async () => {
          const find = (re: RegExp) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent!.trim()));
          find(/^New rhythm$/)?.click();
          await new Promise((res) => setTimeout(res, 1800));
          const paper = document.querySelector(".stage .paper")!;
          const drawn = [...paper.querySelectorAll(".abcjs-note, .abcjs-rest")];
          if (drawn.some((el) => !el.classList.contains("abcjs-l0"))) return { skip: true, worst: 0, n: 0 };
          const pills = [...document.querySelectorAll<HTMLElement>("[data-lane-note]")];
          const offs = pills.map((p) => Math.abs(p.getBoundingClientRect().left - drawn[Number(p.dataset.laneNote)]!.getBoundingClientRect().left));
          // Pills in order, never overlapping.
          const lefts = pills.map((p) => p.getBoundingClientRect());
          const overlap = lefts.some((b, i) => i > 0 && b.left < lefts[i - 1]!.right - 0.5);
          return { skip: false, worst: Math.max(...offs), n: pills.length, overlap };
        });
        if (out.skip) {
          console.log(`skip level ${level} at ${width}px: on two lines`);
          continue;
        }
        const ok = out.worst <= TOLERANCE && !out.overlap;
        if (!ok) failed++;
        console.log(`${ok ? "ok  " : "FAIL"} level ${level} at ${width}px: ${out.n} pills, farthest ${out.worst.toFixed(1)}px from its note${out.overlap ? ", pills overlap" : ""}`);
      }
    }
    if (process.env.SHOT && width === 1200) await (await page.$(".stage"))!.screenshot({ path: process.env.SHOT });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} failed` : "All lined up");
process.exit(failed ? 1 : 0);
