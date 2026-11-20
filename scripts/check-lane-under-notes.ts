/**
 * Does the still rhythm lane (Tap the rhythm, before and after a round) put
 * each note's pill under its notehead? (Blaine, 19 November 2026: "make sure
 * the bars under the notes line up with the starts of notes better".) For
 * each level: a new rhythm, then every pill's left edge against its note's
 * left edge in the drawing (by cursor, as rhythm-marks.ts finds it), and
 * each pill's row just under its own line of music, above the next line.
 * The still lane (RhythmLaneStill.svelte, the default), two bars and four
 * (four are drawn on two lines), on a phone, a laptop, 1920 and 2560 wide
 * (full screen draws the music as wide as the screen), and drawn at 1200
 * then widened to 1920 without drawing again (entering full screen): the
 * lane must measure the drawing again.
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
  for (const [width, bars, widen] of [[1200, 2], [1200, 4], [420, 2], [420, 4], [1920, 4], [2560, 4], [1200, 4, 1920]] as [number, number, number?][]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument(() => localStorage.setItem("sr-rhythm-lane", "still"));
    await page.goto(`${APP}/games/rhythm`, { waitUntil: "networkidle2" });
    await page.click(`[data-bars="${bars}"]`);
    for (const level of LEVELS) {
      await page.click(`[data-level="${level - 1}"]`);
      for (let r = 0; r < 2; r++) {
        if (widen) await page.setViewport({ width, height: 900 });
        await page.evaluate(async () => {
          const find = (re: RegExp) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent!.trim()));
          find(/^New rhythm$/)?.click();
          await new Promise((res) => setTimeout(res, 1800));
        });
        // Drawn at one width, then widened as full screen does, with no new drawing.
        if (widen) {
          await page.setViewport({ width: widen, height: 900 });
          await new Promise((res) => setTimeout(res, 400));
        }
        const out = await page.evaluate(() => {
          const paper = document.querySelector(".stage .paper")!;
          const drawn = [...paper.querySelectorAll(".abcjs-note, .abcjs-rest")];
          const lineOf = (el: Element) => Number(/abcjs-l(\d+)/.exec(el.getAttribute("class") ?? "")?.[1] ?? -1);
          const lines = new Set(drawn.map(lineOf)).size;
          const pills = [...document.querySelectorAll<HTMLElement>("[data-still-lane] .pill")];
          const firsts = pills.filter((p) => p.dataset.laneNote !== undefined);
          const offs = firsts.map((p) => Math.abs(p.getBoundingClientRect().left - drawn[Number(p.dataset.laneNote)]!.getBoundingClientRect().left));
          // Each pill's row under its own line: below that line's notes, above the next line's.
          const tops = [...Array(lines).keys()].map((l) => Math.min(...drawn.filter((el) => lineOf(el) === l).map((el) => el.getBoundingClientRect().top)));
          const bottoms = [...Array(lines).keys()].map((l) => Math.max(...[...paper.querySelectorAll(`.abcjs-l${l}`)].map((el) => el.getBoundingClientRect().bottom)));
          const misplaced = firsts.filter((p) => {
            const l = lineOf(drawn[Number(p.dataset.laneNote)]!);
            const row = p.parentElement!.getBoundingClientRect();
            return row.top < bottoms[l]! || (l + 1 < lines && row.bottom > tops[l + 1]! - 4);
          }).length;
          // Pills in order along each row, never overlapping.
          const overlap = [...document.querySelectorAll("[data-still-lane] .row")].some((row) => {
            const r = [...row.querySelectorAll(".pill")].map((p) => p.getBoundingClientRect());
            return r.some((b, i) => i > 0 && b.left < r[i - 1]!.right - 0.5);
          });
          return { worst: Math.max(0, ...offs), n: firsts.length, lines, misplaced, overlap };
        });
        const ok = out.worst <= TOLERANCE && !out.overlap && !out.misplaced && out.n > 0;
        if (!ok) failed++;
        console.log(`${ok ? "ok  " : "FAIL"} level ${level}, ${bars} bars at ${width}px${widen ? ` widened to ${widen}px` : ""}: ${out.lines} line(s), ${out.n} pills, farthest ${out.worst.toFixed(1)}px from its note${out.overlap ? ", pills overlap" : ""}${out.misplaced ? `, ${out.misplaced} off their line` : ""}`);
      }
    }
    if (process.env.SHOT && width === 1200 && bars === 4) await (await page.$(".stage"))!.screenshot({ path: process.env.SHOT });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} failed` : "All lined up");
process.exit(failed ? 1 : 0);
