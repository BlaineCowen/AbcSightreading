/**
 * /challenge end to end, at phone size, against a singer whose every note is
 * known.
 *
 *   bun run scripts/check-challenge.ts            # Wild, treble, a fixed seed
 *   LEVEL=warmup VOICE=low bun run scripts/check-challenge.ts
 *   SHOTS=<dir> screenshots: the intro, ready, on a note, a wrong note, the verdict, the result
 *   THEME=light|dark the colour scheme the browser asks for
 *
 * Needs the dev server (bun run dev). Chrome is driven by puppeteer-core with
 * an iPhone-sized touch viewport. getUserMedia is replaced: the camera is a
 * canvas with a moving face, the microphone a synthesized voice (as in
 * check-grade.ts). The singer sings each note as it comes up, with two faults
 * planted: note 3 a step high before the right one (corrected), note 5 an
 * octave down (still right first time: any octave counts). Checks: every
 * note's outcome, the run finishing, a recorded video of some size, no
 * sideways scroll, Hear do playing do, and New notes drawing different notes.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";
import { makeChallenge, type ChallengeLevel, type ChallengeVoice } from "../src/lib/challenge/exercise";

const APP = process.env.APP ?? "http://localhost:4321";
const LEVEL = (process.env.LEVEL ?? "wild") as ChallengeLevel;
const VOICE = (process.env.VOICE ?? "high") as ChallengeVoice;
const SEED = Number(process.env.SEED ?? 4242);
const SHOTS = process.env.SHOTS ?? "";
const WRONG = 2, OCTAVE = 4;

const expected = makeChallenge(LEVEL, VOICE, SEED).notes.map((n) => n.midi);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (process.env.THEME) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: process.env.THEME }]);
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text().slice(0, 300)); });

await page.evaluateOnNewDocument(() => {
  const ctx = new AudioContext();
  const voice = ctx.createGain();
  // The camera: a face that drifts about, so a frame that froze would show.
  const cam = document.createElement("canvas");
  cam.width = 480; cam.height = 640;
  const c2 = cam.getContext("2d")!;
  const paint = (t: number) => {
    c2.fillStyle = "#d9c7b0"; c2.fillRect(0, 0, 480, 640);
    const x = 240 + Math.sin(t / 700) * 40, y = 300 + Math.cos(t / 900) * 20;
    c2.fillStyle = "#f2c9a0"; c2.beginPath(); c2.ellipse(x, y, 120, 150, 0, 0, Math.PI * 2); c2.fill();
    c2.fillStyle = "#3a2a20"; c2.beginPath(); c2.arc(x - 45, y - 30, 12, 0, 7); c2.arc(x + 45, y - 30, 12, 0, 7); c2.fill();
    c2.beginPath(); c2.ellipse(x, y + 60, 30, 18 + 10 * Math.abs(Math.sin(t / 150)), 0, 0, 7); c2.fill();
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
  navigator.mediaDevices.getUserMedia = async (c?: MediaStreamConstraints) => {
    await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    voice.connect(dest);
    const tracks = [...dest.stream.getAudioTracks()];
    if (c?.video) tracks.push(...cam.captureStream(30).getVideoTracks());
    return new MediaStream(tracks);
  };
  (window as any).__sing = (notes: { midi: number; at: number; ms: number }[]) => {
    const offset = ctx.currentTime - performance.now() / 1000;
    for (const n of notes) {
      const t = n.at / 1000 + offset;
      if (t < ctx.currentTime) continue;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const depth = ctx.createGain();
      depth.gain.value = osc.frequency.value * 0.004;
      vib.connect(depth).connect(osc.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.02);
      g.gain.setValueAtTime(0.25, t + n.ms / 1000 - 0.04);
      g.gain.linearRampToValueAtTime(0, t + n.ms / 1000 - 0.01);
      osc.connect(lp).connect(g).connect(voice);
      osc.start(t); vib.start(t);
      osc.stop(t + n.ms / 1000); vib.stop(t + n.ms / 1000);
    }
  };
});

const shot = async (name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const dbg = () => page.evaluate(() => (window as any).__challengeDebug());
const click = (label: string) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === l);
    (b as HTMLButtonElement | undefined)?.click();
    return !!b;
  }, label);

await page.goto(`${APP}/challenge?l=${LEVEL}&v=${VOICE}&c=${SEED}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));
let failures = 0;
const fail = (m: string) => { failures++; console.log(`  FAIL: ${m}`); };

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 0) fail(`the intro scrolls sideways by ${overflow}px`);
const notes = (await dbg()).notes as number[];
if (JSON.stringify(notes) !== JSON.stringify(expected)) fail(`the link's seed gave ${notes}, expected ${expected}`);
console.log(`${LEVEL}, ${VOICE}, seed ${SEED}: ${notes.join(" ")}`);
await shot("1-intro");

await click("Start");
await page.waitForFunction(() => (window as any).__challengeDebug().phase === "ready", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await shot("2-ready");
const stagedOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (stagedOverflow > 0) fail(`the stage scrolls sideways by ${stagedOverflow}px`);

await click("Hear do");
await new Promise((r) => setTimeout(r, 200));
const doWanted = VOICE === "high" ? 60 : 48;
const heard = (await dbg()).lastPlayed;
if (heard !== doWanted) fail(`Hear do played ${heard}, not do (${doWanted})`);
await new Promise((r) => setTimeout(r, 1100));

await click("Go");
await new Promise((r) => setTimeout(r, 650));
await shot("2b-shuffling");
await page.waitForFunction(() => (window as any).__challengeDebug().phase === "singing", { timeout: 15000 });
for (let i = 0; i < notes.length; i++) {
  await page.waitForFunction((k) => { const d = (window as any).__challengeDebug(); return d.view?.index === k && !d.view?.credited; }, { timeout: 15000 }, i);
  const now = await page.evaluate(() => performance.now());
  const midi = notes[i];
  const plan = i === WRONG
    ? [{ midi: midi + 2, at: now + 250, ms: 650 }, { midi, at: now + 950, ms: 800 }]
    : [{ midi: i === OCTAVE ? midi - 12 : midi, at: now + 250, ms: 800 }];
  await page.evaluate((p) => (window as any).__sing(p), plan);
  if (i === 1) { await new Promise((r) => setTimeout(r, 520)); await shot("3-on-a-note"); }
  if (i === WRONG) { await new Promise((r) => setTimeout(r, 820)); await shot("4-wrong-note"); }
  await page.waitForFunction((k) => { const d = (window as any).__challengeDebug(); return d.view?.index !== k || d.view?.done; }, { timeout: 15000 }, i);
}
await page.waitForFunction(() => ["done", "result"].includes((window as any).__challengeDebug().phase), { timeout: 15000 });
await new Promise((r) => setTimeout(r, 900));
await shot("5-verdict");
await page.waitForFunction(() => (window as any).__challengeDebug().phase === "result", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 300));
await shot("6-result");

const d = await dbg();
const outcomes = d.view.results.map((r: { outcome: string }) => r.outcome);
outcomes.forEach((o: string, i: number) => {
  const want = i === WRONG ? "corrected" : "first";
  console.log(`  ${i + 1} ${o.padEnd(9)} ${d.view.results[i].score}${o === want ? "" : `  FAIL (wanted ${want})`}`);
  if (o !== want) failures++;
});
console.log(`total ${d.view.total}, ${d.view.firsts} first try`);
if (!d.take) fail("no video was recorded");
else {
  console.log(`video: ${d.take.type}, ${(d.take.size / 1024).toFixed(0)} KB`);
  if (d.take.size < 20_000) fail("the video is too small to hold the run");
}
const buttons = await page.evaluate(() => [...document.querySelectorAll(".bar button, .bar a")].map((b) => (b.textContent ?? "").trim()));
console.log(`result buttons: ${buttons.join(" | ")}`);
if (!buttons.includes("Save video") || !buttons.includes("Challenge a friend") || !buttons.includes("Try again")) fail("the result is missing a button");

// New notes: a different set, shuffled in. Stop once it is singing.
await click("New notes");
await page.waitForFunction(() => (window as any).__challengeDebug().phase === "singing", { timeout: 15000 });
const fresh = (await dbg()).notes as number[];
console.log(`new notes: ${fresh.join(" ")}`);
if (JSON.stringify(fresh) === JSON.stringify(notes)) fail("New notes gave the same notes");
await click("Stop");

console.log(failures ? `${failures} check(s) failed` : "all checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
