/**
 * Does a drill's click stay one click a beat across its repeats? Blaine
 * (15 October 2026): "On drill repeats, the metronome clicks over itself".
 * Runs a drill (rhythm only, two bars, repeats with their count-in) with the
 * click on, logs every click the page starts on the audio clock, and reports
 * any two closer than half a beat, and any pass whose music does not start
 * on a click (a repeat off the beat).
 *
 *   bun run scripts/check-drill-clicks.ts     # APP=http://localhost:4321, REPEATS=3, COUNT_IN=on|off, BPM=120
 *
 * Needs the dev server.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const REPEATS = Number(process.env.REPEATS ?? 3);
const COUNT_IN = process.env.COUNT_IN ?? "on";
const BPM = Number(process.env.BPM ?? 120);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 1000 },
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
await page.evaluateOnNewDocument(
  (run) => {
    localStorage.setItem("sightReadingOptions", JSON.stringify({ run }));
    // Every short buffer started is a click (the music is one long buffer).
    const log: { at: number; dur: number }[] = ((window as any).__clicks = []);
    const music: number[] = ((window as any).__music = []);
    const P = AudioBufferSourceNode.prototype as any;
    const start = P.start;
    P.start = function (when?: number, ...rest: any[]) {
      const ctx = this.context as AudioContext;
      const dur = this.buffer?.duration ?? 0;
      const at = when && when > 0 ? Math.max(when, ctx.currentTime) : ctx.currentTime;
      if (dur < 1) log.push({ at, dur });
      // The music, started at its first note (an offset is a resumed pass).
      else if (!rest[0]) music.push(at);
      return start.call(this, when, ...rest);
    };
  },
  { exercises: 2, repeats: REPEATS, rampBpm: 0, previewSeconds: 0, repeatCountIn: COUNT_IN }
);
const params = new URLSearchParams({ rhythmOnly: "true", rhythms: "quarter,half", timeSignature: "4/4", measures: "2", bpm: String(BPM) });
await page.goto(`${APP}/sightreading?${params}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /New exercise/.test(b.textContent ?? "")) as HTMLButtonElement | undefined)?.click());
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^\s*Drill/.test(b.textContent ?? ""))?.click());
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Start drill/.test(b.textContent ?? ""))?.click());
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Stop drill/.test(b.textContent ?? "")), { timeout: 20000 }).catch(async () => {
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  console.log("FAIL: the drill never started");
  await browser.close();
  process.exit(1);
});
await page.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => /Stop drill/.test(b.textContent ?? "")), { timeout: 180000, polling: 300 });
const clicks: { at: number }[] = await page.evaluate(() => (window as any).__clicks);
const music: number[] = await page.evaluate(() => (window as any).__music);
await browser.close();

const beat = 60 / BPM;
const at = clicks.map((c) => c.at).sort((a, b) => a - b);
const t0 = at[0] ?? 0;
const close: string[] = [];
for (let k = 1; k < at.length; k++) {
  const gap = at[k] - at[k - 1];
  if (gap < beat / 2) close.push(`${(at[k - 1] - t0).toFixed(3)}s and ${(at[k] - t0).toFixed(3)}s (${(gap * 1000).toFixed(0)} ms apart)`);
}
console.log(`${at.length} clicks over ${(at.at(-1)! - t0).toFixed(1)} s at ${BPM} BPM, repeats ${REPEATS}, count-in ${COUNT_IN}`);
console.log("gaps (beats):", at.slice(1).map((x, k) => ((x - at[k]) / beat).toFixed(2)).join(" "));
// Each pass's music starts on a beat of the click (the last of the count-in's
// beats is a beat before it, the next click on it).
// (Starts before the first click are the sound being primed, not a pass.)
const nearest = (m: number) => at.reduce((b, c) => (Math.abs(c - m) < Math.abs(b) ? c - m : b), Infinity);
const offGrid = music
  .filter((m) => m >= t0)
  .filter((m) => Math.abs(nearest(m)) >= 0.03)
  .map((m) => `${(m - t0).toFixed(3)}s (nearest click ${(nearest(m) * 1000).toFixed(0)} ms)`);
console.log(`${music.length} passes; music starts off the click: ${offGrid.length ? offGrid.join(", ") : "none"}`);
if (offGrid.length) close.push(`music off the beat at ${offGrid.join(", ")}`);
if (close.length) {
  console.log(`FAIL: ${close.length} clicks closer than half a beat:\n  ${close.join("\n  ")}`);
  process.exit(1);
}
console.log("one click a beat throughout");
