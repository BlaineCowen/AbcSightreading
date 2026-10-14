/**
 * The promo's interface shots, recorded from the screen (puppeteer's
 * screencast, 1920x1080): the plain score (line 1), opening the video (2),
 * the tempo stepping (6), the labels flipping (7), full screen and Export
 * (8). Needs the dev server; Pro is answered. Run after exports.ts (it
 * competes for the CPU, and those record in real time).
 *
 *   bun run capture/ui.ts            # every shot
 *   SHOTS=tempo bun run capture/ui.ts
 */
import puppeteer, { type Page } from "../../ad/node_modules/puppeteer-core";
import { mkdirSync } from "fs";

const APP = process.env.APP ?? "http://localhost:4321";
const MINE = {
  beat: "du", slots: ["du", "ta", "de", "ta"], holdStart: "du", holdEach: "u", rest: "shh",
  named: { dotQuarterEighth: ["du", "de"], dotHalfQuarter: ["du", "du"], eighthQuarterEighth: ["du", "de", "de"], eighthDotQuarter: ["du", "de"], dotEighthSixteenth: ["du", "ta"] },
};
import { writeFileSync } from "fs";
/** Where a control sits on the 1920x1080 page, for the promo to zoom on. */
async function rectOf(p: Page, sel: string) {
  return p.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);
}
const OUT = new URL("../assets/footage/", import.meta.url).pathname;
const want = process.env.SHOTS?.split(",");
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1920,1080", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080 },
});

async function proPage(sound: Record<string, unknown> = {}): Promise<Page> {
  const p = await browser.newPage();
  p.on("pageerror", (e) => console.log("  page error:", e.message));
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await p.setRequestInterception(true);
  p.on("request", (req) => {
    const u = new URL(req.url());
    const j = (x: unknown) => req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
    if (u.pathname === "/api/auth/get-session")
      return j({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "promo@test.local", name: "Promo", accountType: "standard", emailVerified: true } });
    if (u.pathname === "/api/billing") return j({ plan: "pro", billingEnabled: true, subscription: null });
    if (u.pathname.startsWith("/api/usage")) return j({ allowed: true, plan: "pro", limit: null, remaining: null });
    if (u.pathname === "/api/presets" || u.pathname === "/api/classes") return j([]);
    // A teacher's own syllables, so the video's picker offers "Mine" (Gordon-style du-de, for the promo).
    if (u.pathname === "/api/preferences") return j({ rhythmSyllables: MINE });
    return req.continue();
  });
  await p.evaluateOnNewDocument((s) => {
    localStorage.setItem("abcsr_playalong_sound", JSON.stringify({ loop: 1, guide: 0.5, click: 0, bass: 0.8, guitar: 0.7, guitarStyle: "passenger", guideSound: "claves", clickSound: "quartz", melodyProgram: 0, ball: true, ...s }));
    // A clean screen: no theme toggle flash, light theme.
    localStorage.setItem("theme", "light");
  }, sound);
  return p;
}
const button = (p: Page, text: RegExp, scope = "body") =>
  p.evaluate((src, flags, scope) => {
    const re = new RegExp(src, flags);
    const b = [...document.querySelectorAll(`${scope} button`)].find((e) => re.test((e.textContent ?? "").trim())) as HTMLButtonElement | undefined;
    if (b && !b.disabled) b.click();
    return !!b && !b.disabled;
  }, text.source, text.flags, scope);
const OVERLAY = '[aria-label="Play-along video"]';
const ready = (p: Page) =>
  p.waitForFunction((o) => [...document.querySelectorAll(`${o} button`)].some((b) => (b.textContent ?? "").trim() === "Play" && !(b as HTMLButtonElement).disabled), { timeout: 60000 }, OVERLAY);
async function exercise(p: Page, query: string) {
  await p.goto(`${APP}/sightreading?${query}`, { waitUntil: "networkidle2" });
  await sleep(1500);
  await p.click('[aria-label="Generate a new exercise"]');
  await sleep(3000);
}
async function openVideo(p: Page, track?: string) {
  await button(p, /^Video/);
  await p.waitForSelector(`${OVERLAY} select[aria-label="Backing track"]`, { timeout: 20000 });
  if (track) await p.select(`${OVERLAY} select[aria-label="Backing track"]`, track);
  await ready(p);
}
async function pickLabel(p: Page, startsWith: string) {
  await p.evaluate((o, want) => {
    const s = [...document.querySelectorAll(`${o} select`)].find((x) => [...(x as HTMLSelectElement).options].some((op) => op.text.startsWith(want))) as HTMLSelectElement | undefined;
    const op = s && [...s.options].find((x) => x.text.startsWith(want));
    if (!s || !op) return;
    s.value = op.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, OVERLAY, startsWith);
}
async function record(p: Page, name: string, act: () => Promise<void>) {
  const rec = await p.screencast({ path: `${OUT}${name}.webm` as `${string}.webm` });
  await act();
  await rec.stop();
  console.log(`  -> ${name}.webm`);
}
const RHYTHM = "rhythmOnly=true&rhythms=quarter,eighthEighth,half,quarterRest&timeSignature=4/4&bpm=90&measures=8";
const PITCHED = "rhythmOnly=false&key=G&clef=treble&scaleDegrees=1,2,3,4,5,6&rhythms=quarter,eighthEighth,half&timeSignature=4/4&bpm=90&measures=8&showSolfege=true";

/**
 * The video playing, its labels switched in turn, each held long enough to
 * cut to: the switch times (seconds into the recording) go to <name>.json, so
 * the promo shows each label as Blaine names it. The video is paused (see below).
 */
async function labelRun(p: Page, name: string, labels: string[]) {
  // One clip a label (<name>-<label>.webm), each recorded once its bars have
  // redrawn: the redraw of 32 bars lands seconds after the picker changes,
  // later than the picker shows, so a single take with switches mistimed them.
  for (const l of labels) {
    await pickLabel(p, l);
    await sleep(6000);
    await record(p, `${name}-${l.toLowerCase()}`, async () => { await sleep(2600); });
  }
}

const shots: Record<string, () => Promise<void>> = {
  // Line 1: the plain exercise, full screen (the score alone), as a still.
  async score() {
    const p = await proPage();
    await exercise(p, RHYTHM.replace("&measures=8", "&measures=4"));
    await p.keyboard.press("f");
    await sleep(1500);
    await p.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    await p.screenshot({ path: `${OUT}score.png` });
    console.log("  -> score.png");
    await p.close();
  },
  // Line 2: the page, then the Video button, and the video opening.
  async open() {
    const p = await proPage();
    await exercise(p, RHYTHM);
    await p.evaluate(() => window.scrollTo(0, 0));
    await record(p, "open", async () => {
      await sleep(1200);
      await button(p, /^Video/);
      await p.waitForSelector(`${OVERLAY} select[aria-label="Backing track"]`, { timeout: 20000 });
      await ready(p);
      await sleep(400);
      await button(p, /^Play$/, OVERLAY);
      await sleep(5500);
    });
    await p.close();
  },
  // Line 6: the tempo button, down to half speed and up past full.
  async tempo() {
    const p = await proPage();
    await exercise(p, RHYTHM);
    await openVideo(p, "drums-rock-4-4-90");
    const rect = await rectOf(p, `${OVERLAY} [aria-label="Tempo"]`);
    const t0 = Date.now();
    const steps: { at: number; dir: string }[] = [];
    await record(p, "tempo", async () => {
      await sleep(500);
      // Down a few steps, then up past full speed: each one visible.
      for (let k = 0; k < 5; k++) { steps.push({ at: (Date.now() - t0) / 1000, dir: "down" }); await p.click(`${OVERLAY} [aria-label="Slower"]`); await sleep(260); }
      await sleep(350);
      for (let k = 0; k < 9; k++) { steps.push({ at: (Date.now() - t0) / 1000, dir: "up" }); await p.click(`${OVERLAY} [aria-label="Faster"]`); await sleep(220); }
      await sleep(1200);
    });
    writeFileSync(`${OUT}tempo.json`, JSON.stringify({ rect, steps }, null, 1));
    await p.close();
  },
  // Line 7: the rhythm syllables, then solfège on a sung exercise.
  async labels() {
    const p = await proPage();
    await exercise(p, RHYTHM);
    await openVideo(p, "drums-rock-4-4-90");
    await labelRun(p, "labels-rhythm", ["Count", "Kod", "Mine"]);
    await p.close();
    const q = await proPage();
    await exercise(q, PITCHED);
    await openVideo(q, "drums-rock-4-4-90");
    await labelRun(q, "labels-pitched", ["Movable", "Fixed", "Note"]);
    await q.close();
  },
  // Line 8: playing, then the Export button (recording in real time).
  async export() {
    const p = await proPage();
    await exercise(p, PITCHED);
    await openVideo(p, "drums-rock-4-4-90");
    await pickLabel(p, "Movable");
    await sleep(1500);
    await ready(p);
    const exportRect = await p.evaluate((o) => {
      const b = [...document.querySelectorAll(`${o} button`)].find((e) => (e.textContent ?? "").trim() === "Export video")!;
      const r = b.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, OVERLAY);
    const t0 = Date.now();
    let pressAt = 0;
    await record(p, "export", async () => {
      await sleep(1000);
      pressAt = (Date.now() - t0) / 1000;
      await button(p, /^Export video$/, OVERLAY);
      await sleep(5000);
    });
    writeFileSync(`${OUT}export.json`, JSON.stringify({ rect: exportRect, pressAt }, null, 1));
    await button(p, /^Cancel export$/, OVERLAY);
    await p.close();
  },
};

for (const [name, run] of Object.entries(shots)) {
  if (want && !want.includes(name)) continue;
  console.log(name);
  await run();
}
await browser.close();
