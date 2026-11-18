/**
 * Does Tap the rhythm's lane (RhythmLane.svelte) line up with the scoring?
 * Headless Chrome plays solo rounds and presses Space the moment each
 * count-in line and each note's pill reaches the hit line, the way a player
 * following the lane would. Taps on the line should score (near) 100%; a
 * lane drawn on another clock than the scoring's scores far less.
 * Signed out, nothing is sent anywhere.
 *
 *   APP=http://localhost:4399 bun run scripts/check-rhythm-lane.ts   # ROUNDS=3, LEVEL=1..11
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const LEVEL = Number(process.env.LEVEL ?? 1);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
let failed = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(`${APP}/games/rhythm`, { waitUntil: "networkidle2" });
  await page.click(`[data-level="${LEVEL - 1}"]`);
  for (let r = 0; r < ROUNDS; r++) {
    const out = await page.evaluate(async () => {
      const find = (re: RegExp) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent!.trim()));
      find(/^New rhythm$/)!.click();
      await new Promise((res) => setTimeout(res, 2500));
      const t0 = performance.now();
      find(/^Play$/)!.click();
      const tapped = new Set<string>();
      let frames = 0;
      await new Promise<void>((resolve) => {
        const loop = () => {
          frames++;
          const lane = document.querySelector("[data-rhythm-lane]");
          const hit = lane?.querySelector(".hit");
          if (hit) {
            const hx = hit.getBoundingClientRect().left + hit.getBoundingClientRect().width / 2;
            [...lane!.querySelectorAll(".tick.count"), ...lane!.querySelectorAll("[data-lane-note]")].forEach((p, i) => {
              const id = (p as HTMLElement).dataset.laneNote ?? `c${i}`;
              if (tapped.has(id) || p.getBoundingClientRect().left > hx) return;
              tapped.add(id);
              window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
            });
          }
          if (document.querySelector("[data-solo-score]") || performance.now() - t0 > 30000) return resolve();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      const s = document.querySelector("[data-solo-score]") as HTMLElement | null;
      return { secs: (performance.now() - t0) / 1000, fps: frames / ((performance.now() - t0) / 1000), taps: tapped.size, score: Number(s?.dataset.soloScore ?? -1), text: s?.textContent?.trim() ?? "" };
    });
    const ok = out.score >= 90;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} round ${r + 1}: ${out.text} (${out.taps} taps, ${out.fps.toFixed(0)} frames a second)`);
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} of ${ROUNDS} rounds scored under 90%` : "Taps on the hit line scored 90% or more every round.");
process.exit(failed ? 1 : 0);
