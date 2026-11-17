/**
 * A TMEA level whose meters mix simple and 6/8 (Level III: 4/4, 3/4, 2/4, 6/8)
 * on the Unison page, New exercise again and again: every exercise is written,
 * 6/8 ones included after a 6/8 one was already on the page. Before the fix
 * (17 November 2026) the page's meter became 6/8 while its rhythms stayed the
 * simple ones, and the next 6/8 drawn failed: "No 6/8 rhythms are selected".
 *   APP=http://localhost:4399 bun scripts/check-mixed-meters.ts   (TRIES=40)
 * Signed out; the browser's monthly count is reset before each exercise.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const TRIES = Number(process.env.TRIES ?? 40);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1280, height: 1000 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.evaluateOnNewDocument(() => {
  for (const k of ["abc-welcome-v1", "abc-tour-unison-v1"]) localStorage.setItem(k, "done");
});

const results: { status: number; meter: string; error?: string }[] = [];
page.on("response", async (res) => {
  if (!res.url().endsWith("/api/generate") || res.request().method() !== "POST") return;
  const body = await res.json().catch(() => null);
  const sent = JSON.parse(res.request().postData() ?? "{}");
  results.push({ status: res.status(), meter: sent.timeSig?.name ?? "?", error: body?.success ? undefined : body?.error });
});

await page.goto(`${APP}/sightreading?tmea=tmea-voice-3`, { waitUntil: "networkidle2" });
await sleep(1500);
for (let i = 0; i < TRIES; i++) {
  const before = results.length;
  await page.evaluate(() => {
    localStorage.removeItem("abcsr_generations");
    ([...document.querySelectorAll("button")].find((b) => /New exercise/.test(b.textContent ?? "")) as HTMLButtonElement | undefined)?.click();
  });
  for (let t = 0; t < 100 && results.length === before; t++) await sleep(100);
  await sleep(300);
}
await browser.close();

const failed = results.filter((r) => r.status !== 200);
const compound = results.filter((r) => r.meter === "6/8" && r.status === 200).length;
console.log(`${results.length} exercises asked for; meters ${[...new Set(results.map((r) => r.meter))].join(" ")}; 6/8 written ${compound}`);
for (const f of failed) console.log(`  ${f.status} ${f.meter}: ${f.error}`);
const ok = results.length >= TRIES * 0.9 && failed.length === 0 && compound >= 2;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
