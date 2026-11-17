/**
 * Does Continuous scroll (Display, owner only) draw the exercise on one line
 * and slide it along as it plays? (docs/claude/practice-page-ui.md, Score
 * layout.) Signed in as the owner on the dev server's one-tap sign-in:
 * - Display shows the Continuous scroll row; with ?everyone it does not;
 * - On: one line wider than the page, the score starting at its left;
 * - Play: the score slides left as the music goes, the blue cursor staying
 *   in view, at about a third of the way across;
 * - Off again: lines that fit the page, no sideways scroll.
 *
 * Points are not involved; it only reads. The dev server must know the owner:
 *
 *   E=$(grep '^DEV_SIGN_IN_EMAIL=' .env | cut -d= -f2- | tr -d '"')
 *   ADMIN_EMAILS="$E" BETTER_AUTH_URL=http://localhost:4399 bun run dev --port 4399
 *   APP=http://localhost:4399 bun run scripts/check-continuous-scroll.ts   # SHOTS=<dir>
 */
import puppeteer, { type Page } from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const SHOTS = process.env.SHOTS;
let fails = 0;
const ok = (cond: unknown, what: string, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${what}${extra ? `  (${extra})` : ""}`);
  if (!cond) fails++;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const click = (page: Page, re: RegExp, scope = "button") =>
  page.evaluate((src, scope) => {
    const b = [...document.querySelectorAll(scope)].find((el) => new RegExp(src).test(el.textContent ?? "")) as HTMLElement | undefined;
    b?.click();
    return !!b;
  }, re.source, scope);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
try {
  await page.goto(APP + "/login", { waitUntil: "networkidle2" });
  await Promise.all([page.waitForNavigation({ timeout: 20000 }).catch(() => {}), click(page, /Sign in as/)]);

  const paper = () =>
    page.evaluate(() => {
      const p = document.getElementById("paper")!;
      const svg = p.querySelector("svg");
      const cur = document.querySelector("#paper .abcjs-cursor")?.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      return {
        lines: p.querySelectorAll(".abcjs-staff-wrapper").length || new Set([...p.querySelectorAll(".abcjs-staff")].map((s) => [...s.classList].find((c) => /^abcjs-l\d+$/.test(c)))).size,
        scrollWidth: p.scrollWidth,
        clientWidth: p.clientWidth,
        scrollLeft: p.scrollLeft,
        svgWidth: svg?.getBoundingClientRect().width ?? 0,
        cursorX: cur && cur.height ? (cur.left - pr.left) / pr.width : null,
        paperHeight: Math.round(pr.height),
        svgHeight: Math.round(svg?.getBoundingClientRect().height ?? 0),
        oneLine: p.classList.contains("one-line"),
      };
    });

  // Eight bars, so the usual layout has two or more lines.
  await page.goto(APP + "/sightreading?measures=8&bpm=120", { waitUntil: "networkidle2" });
  await wait(1500);
  if (!(await page.$("#paper svg"))) await click(page, /New exercise/);
  await page.waitForSelector("#paper svg", { timeout: 60000 });
  await wait(800);
  const before = await paper();
  ok(before.lines > 1 && before.scrollWidth <= before.clientWidth + 2, "usual layout: more than one line, nothing wider than the page", JSON.stringify(before));

  await click(page, /^\s*Display/);
  await wait(500);
  ok(await page.evaluate(() => /Continuous scroll/.test(document.body.innerText)), "Display shows Continuous scroll for the owner");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".pop-row")].find((r) => /Continuous scroll/.test(r.textContent ?? ""));
    ([...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "On") as HTMLElement | undefined)?.click();
  });
  await wait(1200);
  await page.keyboard.press("Escape");
  await wait(300);
  const on = await paper();
  ok(on.oneLine && on.lines === 1, "On: one line", JSON.stringify(on));
  ok(on.scrollWidth > on.clientWidth * 1.5, "the line runs past the page's edge", `${on.scrollWidth} of ${on.clientWidth}`);
  ok(on.scrollLeft === 0, "and starts at its left");
  ok(Math.abs(on.paperHeight - on.svgHeight) < 40, "the score's card is as tall as the line, no more", `${on.paperHeight} for ${on.svgHeight}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/scroll-1-on.png` });

  // Play: it slides along.
  await click(page, /^\s*Play\s*$/);
  const lefts: number[] = [];
  const cursors: (number | null)[] = [];
  for (let i = 0; i < 24; i++) {
    await wait(1000);
    const s = await paper();
    lefts.push(s.scrollLeft);
    cursors.push(s.cursorX);
    if (SHOTS && i === 12) await page.screenshot({ path: `${SHOTS}/scroll-2-playing.png` });
  }
  ok(Math.max(...lefts) > 300, "playing slides the score along", lefts.join(","));
  ok(lefts.every((l, i) => i === 0 || l >= lefts[i - 1] - 2), "always forward, never back", lefts.join(","));
  // Until the line's end comes into view; then the score stops and the cursor goes on to the end.
  const end = Math.max(...lefts);
  const sliding = cursors.filter((c, i) => c !== null && lefts[i] > 0 && lefts[i] < end);
  const atEnd = cursors.filter((c, i) => c !== null && lefts[i] === end);
  ok(sliding.length > 3 && sliding.every((c) => c! > 0.2 && c! < 0.4), "while it slides, the cursor stays about a third of the way across", cursors.map((c) => (c === null ? "-" : c.toFixed(2))).join(","));
  ok(atEnd.every((c) => c! > 0 && c! < 1), "at the end, the cursor runs on to the last bar, still in view");
  await click(page, /^\s*(Pause|Stop)\s*$/);

  // Off again.
  await click(page, /^\s*Display/);
  await wait(500);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".pop-row")].find((r) => /Continuous scroll/.test(r.textContent ?? ""));
    ([...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "Off") as HTMLElement | undefined)?.click();
  });
  await wait(1200);
  const off = await paper();
  ok(!off.oneLine && off.lines > 1 && off.scrollWidth <= off.clientWidth + 2, "Off: back to lines that fit the page", JSON.stringify(off));

  // As everyone else sees it.
  await page.goto(APP + "/sightreading?measures=8&everyone", { waitUntil: "networkidle2" });
  await wait(1500);
  await click(page, /^\s*Display/);
  await wait(500);
  ok(!(await page.evaluate(() => /Continuous scroll/.test(document.body.innerText))), "with ?everyone there is no Continuous scroll row");
  ok(!errors.length, "no page errors", errors.join(" | "));
} catch (e) {
  fails++;
  console.log("FAIL", e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "all checks passed");
  process.exit(fails ? 1 : 0);
}
