/**
 * Does a drill bring each new exercise to the top while it is read? Blaine
 * (4 November 2026): "when we go to the next one, it still doesn't scroll up
 * all the way to the top for the study section". The page stayed where the
 * last pass ended and only went up when the next exercise began to play.
 *
 * Runs a drill of three long exercises on a phone-sized window, and in each
 * exercise's reading time ("Read it", before it plays) checks that the top of
 * the score sits just under the navbar.
 *
 *   bun run scripts/check-drill-scroll.ts     # APP=http://localhost:4321, SHOTS=dir
 *
 * Needs the dev server.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const SHOTS = process.env.SHOTS;
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 390, height: 700 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = new URL(req.url());
  const json = (body: unknown) => req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname === "/api/auth/get-session")
    return json({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "drill@test.local", name: "Drill", accountType: "standard", emailVerified: true } });
  if (url.pathname === "/api/billing") return json({ plan: "pro", billingEnabled: true, subscription: null });
  if (url.pathname.startsWith("/api/usage")) return json({ allowed: true, plan: "pro", limit: null, remaining: null });
  if (url.pathname === "/api/presets" || url.pathname === "/api/classes" || url.pathname === "/api/recent") return json([]);
  if (url.pathname === "/api/preferences") return json({});
  return req.continue();
});
await page.evaluateOnNewDocument((run) => localStorage.setItem("sightReadingOptions", JSON.stringify({ run })), {
  exercises: 3,
  repeats: 1,
  rampBpm: 0,
  previewSeconds: 4,
});
// Long enough to scroll on a phone, fast enough to finish.
const params = new URLSearchParams({ measures: "16", bpm: "240", timeSignature: "4/4" });
await page.goto(`${APP}/sightreading?${params}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /New exercise/.test(b.textContent ?? "")) as HTMLButtonElement | undefined)?.click());
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^\s*Drill/.test(b.textContent ?? ""))?.click());
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Start drill/.test(b.textContent ?? ""))?.click());

let failures = 0;
const statusLine = () => page.evaluate(() => document.body.innerText.match(/Drill · exercise \d+ of \d+[^\n]*/)?.[0] ?? "");
for (const n of [2, 3]) {
  // Wait for exercise n's reading time: its countdown is on.
  const ok = await page
    .waitForFunction((n) => new RegExp(`exercise ${n} of \\d+.*starts in`).test(document.body.innerText), { timeout: 120000, polling: 200 }, n)
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    console.log(`FAIL: exercise ${n}'s reading time never came (${await statusLine()})`);
    failures++;
    break;
  }
  await new Promise((r) => setTimeout(r, 1300)); // the smooth scroll lands
  const where = await page.evaluate(() => {
    const paper = document.getElementById("paper")!;
    return { top: Math.round(paper.getBoundingClientRect().top), scrollY: Math.round(window.scrollY), vh: window.innerHeight, status: document.body.innerText.match(/Drill · exercise \d+ of \d+[^\n]*/)?.[0] ?? "" };
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/drill-read-${n}.png` });
  // Just under the navbar (80 px of clearance, a tenth of the window on a tall one), not below it and not scrolled past.
  const good = where.top >= 40 && where.top <= Math.max(80, where.vh * 0.1) + 40;
  console.log(`${good ? "ok  " : "FAIL"} exercise ${n}, reading: the score's top is ${where.top} px down the window (scrollY ${where.scrollY}; ${where.status})`);
  if (!good) failures++;
}
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Stop drill/.test(b.textContent ?? ""))?.click());
await browser.close();
console.log(failures ? `\n${failures} failed` : "\nall clean");
process.exit(failures ? 1 : 0);
