/**
 * Does Tap the rhythm's lane (RhythmLane.svelte) line up with the scoring?
 * Headless Chrome plays solo rounds and presses Space the moment each
 * count-in line and each note's pill reaches the hit line, the way a player
 * following the lane would. Taps on the line should score (near) 100%; a
 * lane drawn on another clock than the scoring's scores far less.
 * Signed out, nothing is sent anywhere.
 *
 * MODE=still (the lane that stays under the notes, 19 November 2026): Space
 * the moment the moving line reaches each pill's start instead (no count-in
 * taps, the line is hidden then), and the lane's rows (one under each line
 * of music, RhythmLaneStill.svelte) must never move.
 *
 * HOLD=full (with MODE=still): each key is let go as the line reaches the
 * end of its pill, and no long note may be marked let go too soon;
 * HOLD=tap: let go at once, and every note of two beats or more must be
 * marked (game-score.ts gradeHolds). Either way, while the round plays the
 * music must sit clear of the Tap pad (scrolled up above it): with the
 * still lane, the line being played and its row, between the window's top
 * and the pad, once the page has had 0.7 s to follow a new line (Blaine,
 * 20 November 2026: the page follows the music a line at a time; four bars
 * drawn big no longer fit whole); otherwise the whole music.
 *
 *   APP=http://localhost:4399 bun run scripts/check-rhythm-lane.ts   # ROUNDS=3, LEVEL=1..11, W=1200 H=900 FULL=1, MODE=scroll|still, BARS=2|4, HOLD=full|tap, PAD=big|small|hidden, INPUT=key|pad
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const LEVEL = Number(process.env.LEVEL ?? 1);
const MODE = process.env.MODE === "still" ? "still" : "scroll";
const BARS = Number(process.env.BARS ?? 2);
const PAD = process.env.PAD ?? "big";
/** INPUT=pad: press and let go of the Tap pad itself (pointer events), as on a phone, not the spacebar. */
const INPUT = process.env.INPUT === "pad" ? "pad" : "key";
const HOLD = process.env.HOLD === "full" || process.env.HOLD === "tap" ? process.env.HOLD : "";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
let failed = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: Number(process.env.W ?? 1200), height: Number(process.env.H ?? 900) });
  await page.evaluateOnNewDocument((mode: string, pad: string) => {
    localStorage.setItem("sr-rhythm-lane", mode);
    localStorage.setItem("sr-tap-pad", pad);
  }, MODE, PAD);
  await page.goto(`${APP}/games/rhythm`, { waitUntil: "networkidle2" });
  await page.click(`[data-level="${LEVEL - 1}"]`);
  await page.click(`[data-bars="${BARS}"]`);
  for (let r = 0; r < ROUNDS; r++) {
    const out = await page.evaluate(async (mode: string, hold: string, input: string, full: boolean) => {
      const find = (re: RegExp) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent!.trim()));
      find(/^New rhythm$/)!.click();
      await new Promise((res) => setTimeout(res, 2500));
      // FULL=1: the game's full screen.
      if (full && !document.documentElement.classList.contains("sr-focus")) {
        (document.querySelector("[data-full-screen]") as HTMLElement).click();
        await new Promise((res) => setTimeout(res, 800));
      }
      const t0 = performance.now();
      find(/^Play$/)!.click();
      const tapped = new Set<string>();
      let frames = 0;
      let moved = false;
      // Rows against the music they sit under (the page around may move).
      const rowsAt = () => {
        const p = document.querySelector(".stage .paper")!.getBoundingClientRect();
        return [...document.querySelectorAll("[data-still-lane] .row")].map((r) => `${Math.round(r.getBoundingClientRect().left - p.left)},${Math.round(r.getBoundingClientRect().top - p.top)}`).join(" ");
      };
      const rows0 = rowsAt();
      const key = (type: string) => {
        if (input === "pad") {
          document.querySelector(".tap-pad .pad")?.dispatchEvent(new PointerEvent(type === "keydown" ? "pointerdown" : "pointerup", { bubbles: true, cancelable: true }));
        } else window.dispatchEvent(new KeyboardEvent(type, { code: "Space", key: " ", bubbles: true }));
      };
      let held: { pill: HTMLElement; row: Element } | null = null;
      let longNotes = 0;
      let padOver = -Infinity;
      let lineSeen = -2;
      let padWhy = "";
      let begun = false;
      let lineAt = 0;
      const playStart = performance.now();
      await new Promise<void>((resolve) => {
        const loop = () => {
          frames++;
          const lane = document.querySelector("[data-rhythm-lane]");
          const hit = lane?.querySelector(".hit");
          const head = lane?.querySelector(".head") as HTMLElement | null;
          if (mode === "still" && head) {
            if (rowsAt() !== rows0) moved = true;
            const hx = head.getBoundingClientRect().left + head.getBoundingClientRect().width / 2;
            const row = head.parentElement!;
            // A held key comes up as the line reaches its pill's end (or moves to the next row).
            if (held && (held.row !== row || hx >= held.pill.getBoundingClientRect().right - 2)) {
              key("keyup");
              held = null;
            }
            row.querySelectorAll<HTMLElement>("[data-lane-note]").forEach((p) => {
              const id = p.dataset.laneNote!;
              if (tapped.has(id) || p.getBoundingClientRect().left > hx + 0.5) return;
              tapped.add(id);
              if (held) key("keyup");
              held = null;
              key("keydown");
              if (Number(p.dataset.laneLen) >= 2) longNotes++;
              if (hold === "full") held = { pill: p, row };
              else if (hold === "tap") setTimeout(() => key("keyup"), 60);
            });
          } else if (hit) {
            const hx = hit.getBoundingClientRect().left + hit.getBoundingClientRect().width / 2;
            [...lane!.querySelectorAll(".tick.count"), ...lane!.querySelectorAll("[data-lane-note]")].forEach((p, i) => {
              const id = (p as HTMLElement).dataset.laneNote ?? `c${i}`;
              if (tapped.has(id) || p.getBoundingClientRect().left > hx) return;
              tapped.add(id);
              window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
            });
          }
          // The music clear of the Tap pad once the scroll has settled: with
          // the still lane, the line being played (the first through the
          // count-in) and its row; otherwise the whole music.
          const pad = document.querySelector(".tap-pad");
          const rows = [...document.querySelectorAll("[data-still-lane] .row")];
          const playing = document.querySelector("[data-still-lane] .head")?.parentElement;
          if (playing) begun = true;
          const rowIx = playing ? rows.indexOf(playing) : rows.length && !begun ? 0 : -1;
          if (rowIx !== lineSeen) { lineSeen = rowIx; lineAt = performance.now(); }
          const padTop = pad ? pad.getBoundingClientRect().top : innerHeight;
          if (performance.now() - playStart > 1200 && performance.now() - lineAt > 700) {
            if (rows.length) {
              if (rowIx >= 0) {
                const tops = [...document.querySelectorAll(`.stage .paper .abcjs-l${rowIx}`)].map((e) => e.getBoundingClientRect()).filter((r) => r.height).map((r) => r.top);
                const under = rows[rowIx]!.getBoundingClientRect().bottom - padTop;
                const above = -Math.min(...tops);
                if (Math.max(under, above) > padOver) {
                  padOver = Math.max(under, above);
                  padWhy = under >= above ? `line ${rowIx + 1}'s row under the pad` : `line ${rowIx + 1} above the window's top`;
                }
              }
            } else if (pad) padOver = Math.max(padOver, document.querySelector(".rhythm .stage")!.getBoundingClientRect().bottom - padTop);
          }
          if (document.querySelector("[data-solo-score]") || performance.now() - t0 > 30000) return resolve();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      if (held) key("keyup");
      const s = document.querySelector("[data-solo-score]") as HTMLElement | null;
      const short = Number((document.querySelector("[data-held-short]") as HTMLElement | null)?.dataset.heldShort ?? 0);
      return { padWhy, longNotes, short, padOver, moved, secs: (performance.now() - t0) / 1000, fps: frames / ((performance.now() - t0) / 1000), taps: tapped.size, score: Number(s?.dataset.soloScore ?? -1), text: s?.textContent?.trim() ?? "" };
    }, MODE, HOLD, INPUT, !!process.env.FULL);
    const holdOk = HOLD === "full" ? out.short === 0 : HOLD === "tap" ? out.short === out.longNotes : true;
    const padOk = out.padOver <= 0;
    const ok = (HOLD === "tap" ? true : out.score >= 90) && !out.moved && holdOk && padOk;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} round ${r + 1}: ${out.text} (${out.taps} taps, ${out.fps.toFixed(0)} frames a second${out.moved ? ", THE STILL LANE MOVED" : ""}${HOLD ? `; ${out.longNotes} long notes, ${out.short} let go too soon` : ""}; music ${padOk ? "clear of" : `${Math.round(out.padOver)}px under`} the Tap pad${!padOk && out.padWhy ? `: ${out.padWhy}` : ""})`);
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} of ${ROUNDS} rounds scored under 90%` : "Taps on the hit line scored 90% or more every round.");
process.exit(failed ? 1 : 0);
