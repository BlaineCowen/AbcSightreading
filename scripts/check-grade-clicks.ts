/**
 * Where a Grade run's clicks really sound, against the beat the grading
 * scores claps by (its t0 and tempo). Every click the page starts is logged
 * with the audio time it was booked for, turned into page time through the
 * context's output timestamp, the same clock the clap listener uses.
 *
 *   bun run scripts/check-grade-clicks.ts              # APP=http://localhost:4321
 *   CPU=4 bun run scripts/check-grade-clicks.ts        # a slow laptop (Chrome's CPU throttling)
 *
 * Needs the dev server. Prints each click's distance from its beat, in ms.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const CPU = Number(process.env.CPU ?? 1);
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
    return json({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "grade@test.local", name: "Grade", accountType: "standard", emailVerified: true } });
  if (url.pathname === "/api/billing") return json({ plan: "pro", billingEnabled: true, subscription: null });
  if (url.pathname.startsWith("/api/usage")) return json({ allowed: true, plan: "pro", limit: null, remaining: null });
  if (url.pathname === "/api/presets" || url.pathname === "/api/classes") return json([]);
  if (url.pathname === "/api/preferences") return json({});
  return req.continue();
});
await page.evaluateOnNewDocument(() => {
  const log: { at: number }[] = ((window as any).__starts = []);
  for (const P of [AudioBufferSourceNode.prototype, OscillatorNode.prototype] as any[]) {
    const start = P.start;
    P.start = function (when?: number, ...rest: any[]) {
      const ctx = this.context as AudioContext;
      const t = when && when > 0 ? Math.max(when, ctx.currentTime) : ctx.currentTime;
      const ts = ctx.getOutputTimestamp?.();
      const at = ts?.performanceTime ? ts.performanceTime + (t - (ts.contextTime ?? 0)) * 1000 : performance.now() + (t - ctx.currentTime) * 1000;
      log.push({ at });
      return start.call(this, when, ...rest);
    };
  }
});
const params = new URLSearchParams({ rhythmOnly: "true", rhythms: "quarter,half,quarterRest", timeSignature: "4/4", measures: "8", bpm: "90" });
await page.evaluateOnNewDocument((s) => localStorage.setItem("abc-tuner-settings", s), JSON.stringify({ gradeCursor: "smooth", gradeClapClick: "beat", gradeClapInput: "keys", gradeWho: "solo" }));
await page.goto(`${APP}/sightreading?${params}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await page.click('[aria-label="Generate a new exercise"]');
await page.waitForFunction(() => !!(window as any).__gradeDebug?.abc(), { timeout: 20000 });
const tempo = await page.evaluate(() => (window as any).__gradeDebug.tempo() as number);
const beatMs = 60_000 / tempo;
if (CPU > 1) await (await page.target().createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: CPU });
await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Clap and grade/.test(x.textContent ?? ""))?.click());
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  (window as any).__starts.length = 0;
  ([...document.querySelectorAll('[role="dialog"] button, .grade-dock button')].find((x) => (x.textContent ?? "").trim() === "Start") as HTMLButtonElement | undefined)?.click();
});
await page.waitForFunction(() => (window as any).__gradeDebug.view().phase === "results", { timeout: 120000, polling: 500 });
const { starts, t0 } = await page.evaluate(() => ({ starts: (window as any).__starts as { at: number }[], t0: (window as any).__gradeDebug.t0() as number }));
await browser.close();
// One click a beat: the first start within each beat's reach.
const devs: number[] = [];
for (let k = -4; k < 40; k++) {
  const grid = t0 + k * beatMs;
  const near = starts.map((s) => s.at - grid).filter((d) => d > -beatMs / 2 && d < beatMs / 2).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  if (near !== undefined) devs.push(near);
}
const s = [...devs].sort((a, b) => a - b);
const spread = s.map((d) => Math.abs(d - s[s.length >> 1])).sort((a, b) => a - b);
console.log(`CPU x${CPU}, ${tempo} BPM, ${devs.length} clicks; ms from the scored beat:`, devs.map((d) => d.toFixed(0)).join(" "));
console.log(`median ${s[s.length >> 1].toFixed(1)} ms, range ${s[0].toFixed(0)}..${s.at(-1)!.toFixed(0)}, beat-to-beat wander p90 ${spread[Math.floor(spread.length * 0.9)].toFixed(1)} ms, max ${spread.at(-1)!.toFixed(1)}`);
