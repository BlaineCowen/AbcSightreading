/**
 * Tapped rhythm grading on a slow screen (Blaine, 13 October 2026: on his TV
 * a rhythm tapped a 16th early graded high on Strict). A TV's HDMI delays the
 * click 100-200 ms, and the browser does not know. Here every tap lands `TV`
 * ms after the click it follows, as a player following a delayed click does,
 * plus `BIAS` (the player: -1 for a 16th early).
 *
 *   APP=http://localhost:4321 bun run scripts/check-tap-timing.ts
 *
 * Runs five cases on Strict, quarters at 90: on time and a 16th early through
 * the TV, unchecked and then checked (Check timing, tapping along with its
 * clicks through the same TV), and a 16th early on speakers with no delay,
 * unchecked. Checked, on time scores high and a 16th early low; unchecked, a
 * 16th early is never forgiven. Unchecked on the TV, a 16th early (167 ms)
 * less the TV's 150 is nearly on time: only the check can tell, which is why
 * the page asks for it.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4321";
const TV = Number(process.env.TV ?? 150);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 1000 },
});
let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

async function open(check: boolean, tv: number) {
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
    // Every click the page books, as heard (page time, through the context's output timestamp).
    const clicks: number[] = ((window as any).__clicks = []);
    for (const P of [AudioBufferSourceNode.prototype, OscillatorNode.prototype] as any[]) {
      const start = P.start;
      P.start = function (when?: number, ...rest: any[]) {
        const isClick = this instanceof OscillatorNode || (!!this.buffer && this.buffer.duration < 1);
        if (isClick) {
          const ctx = this.context as AudioContext;
          const t = when && when > 0 ? Math.max(when, ctx.currentTime) : ctx.currentTime;
          const ts = ctx.getOutputTimestamp?.();
          clicks.push(ts?.performanceTime ? ts.performanceTime + (t - (ts.contextTime ?? 0)) * 1000 : performance.now() + (t - ctx.currentTime) * 1000);
        }
        return start.call(this, when, ...rest);
      };
    }
    (window as any).__space = (times: number[]) =>
      times.forEach((at) => setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true })), at - performance.now()));
  });
  const params = new URLSearchParams({ rhythmOnly: "true", rhythms: "quarter", timeSignature: "4/4", measures: "4", bpm: "90" });
  await page.evaluateOnNewDocument((s) => localStorage.setItem("abc-tuner-settings", s), JSON.stringify({ gradeStrictness: "strict", gradeCursor: "beat", gradeClapClick: "beat", gradeClapInput: "keys", gradeWho: "solo" }));
  await page.goto(`${APP}/sightreading?${params}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.click('[aria-label="Generate a new exercise"]');
  await page.waitForFunction(() => !!(window as any).__gradeDebug?.abc(), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => ([...document.querySelectorAll("button")].find((x) => /Clap and grade/.test(x.textContent ?? "")) as HTMLButtonElement | undefined)?.click());
  await new Promise((r) => setTimeout(r, 1200));
  let measured: number | null = null;
  if (check) {
    // Check timing: tap with each click as heard through the TV.
    await page.evaluate(() => ((window as any).__clicks.length = 0));
    await page.evaluate(() => ([...document.querySelectorAll("button")].find((x) => /^Check (timing|again)$/.test((x.textContent ?? "").trim())) as HTMLButtonElement | undefined)?.click());
    await new Promise((r) => setTimeout(r, 600));
    const clicks = (await page.evaluate(() => (window as any).__clicks as number[])).slice(4);
    await page.evaluate((t) => (window as any).__space(t), clicks.map((c) => c + tv));
    // Twelve clicks at 0.6 s, then the result.
    await new Promise((r) => setTimeout(r, 9500));
    measured = await page.evaluate(() => JSON.parse(localStorage.getItem("abc-tuner-settings") ?? "{}").tapLatencyMs ?? null);
  }
  return { page, measured };
}

async function run(check: boolean, bias: number, tv = TV) {
  const { page, measured } = await open(check, tv);
  const tempo = await page.evaluate(() => (window as any).__gradeDebug.tempo() as number);
  const beatMs = 60_000 / tempo;
  await page.evaluate(() => ([...document.querySelectorAll('[role="dialog"] button, .grade-dock button')].find((x) => (x.textContent ?? "").trim() === "Start") as HTMLButtonElement | undefined)?.click());
  await page.waitForFunction(() => (window as any).__gradeDebug.t0?.() != null, { timeout: 15000 });
  const t0 = (await page.evaluate(() => (window as any).__gradeDebug.t0())) as number;
  // Quarters, four bars: a tap per beat, through the TV, with the player's bias.
  const taps = Array.from({ length: 16 }, (_, k) => t0 + k * beatMs + tv + bias * (beatMs / 4));
  await page.evaluate((t) => (window as any).__space(t), taps);
  await page.waitForFunction(() => (window as any).__gradeDebug.view().phase === "results", { timeout: 60000 });
  const r = await page.evaluate(() => (window as any).__gradeDebug.view().claps);
  await page.close();
  return { score: r.rhythm as number, measured, forgiven: r.forgivenMs as number };
}

const onTimeUnchecked = await run(false, 0);
console.log(`TV ${TV} ms, unchecked, on time: ${onTimeUnchecked.score} (forgiven ${onTimeUnchecked.forgiven} ms)`);
const earlyUnchecked = await run(false, -1);
console.log(`TV ${TV} ms, unchecked, a 16th early: ${earlyUnchecked.score} (the TV's delay hides it: only the check can tell)`);
const earlySpeakers = await run(false, -1, 0);
console.log(`no delay, unchecked, a 16th early: ${earlySpeakers.score} (forgiven ${earlySpeakers.forgiven} ms)`);
const onTimeChecked = await run(true, 0);
console.log(`TV ${TV} ms, checked (measured ${onTimeChecked.measured} ms), on time: ${onTimeChecked.score}`);
const earlyChecked = await run(true, -1);
console.log(`TV ${TV} ms, checked (measured ${earlyChecked.measured} ms), a 16th early: ${earlyChecked.score}`);

expect(onTimeUnchecked.score >= 90, `unchecked, on time on a TV still scores high: its delay is forgiven (${onTimeUnchecked.score})`);
expect(earlySpeakers.score <= 30 && earlySpeakers.forgiven === 0, `unchecked, a 16th early is never forgiven (${earlySpeakers.score})`);
expect(onTimeChecked.measured !== null && Math.abs(onTimeChecked.measured - TV) < 30, `Check timing measures the TV's delay (${onTimeChecked.measured} ms for ${TV})`);
expect(onTimeChecked.score >= 90, `checked, on time scores high (${onTimeChecked.score})`);
expect(earlyChecked.score <= 30, `checked, a 16th early on the TV scores low on Strict (${earlyChecked.score})`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
