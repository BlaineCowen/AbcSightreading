/**
 * The promo's footage: the app's own play-along videos, made with its real
 * "Export video" button (canvas and mix recorded in real time), so every
 * frame and every sound is what a teacher would get. Needs the dev server
 * (bun run dev on 4321); Pro is answered for the page.
 *
 *   bun run capture/exports.ts            # every job
 *   JOBS=soul,pitched bun run capture/exports.ts
 *
 * Writes assets/footage/<job>.webm (or .mp4) and <job>.json (the settings).
 */
import puppeteer, { type Page } from "../../ad/node_modules/puppeteer-core";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";

const APP = process.env.APP ?? "http://localhost:4321";
const OUT = new URL("../assets/footage/", import.meta.url).pathname;
const TMP = new URL("../.downloads/", import.meta.url).pathname;

type Job = {
  name: string;
  /** The page's query: what exercise the video writes. */
  query: string;
  /** The backing track's id in the overlay's picker. */
  track: string;
  /** The label picker's option, by its text. */
  labels: string;
  sound: Record<string, unknown>;
};
const RHYTHM = "rhythmOnly=true&rhythms=quarter,eighthEighth,half,quarterRest&timeSignature=4/4";
const rhythmSound = { loop: 1, guide: 0.55, click: 0, bass: 0, guitar: 0, guitarStyle: "passenger", guideSound: "claves", clickSound: "quartz", melodyProgram: 0, ball: true };
const JOBS: Job[] = [
  { name: "rock", query: `${RHYTHM}&bpm=90`, track: "drums-rock-4-4-90", labels: "Kod", sound: rhythmSound },
  { name: "soul", query: `${RHYTHM}&bpm=80`, track: "soul-4-4-80", labels: "Count", sound: rhythmSound },
  { name: "cumbia", query: `${RHYTHM}&bpm=100`, track: "cumbia-4-4-100", labels: "Kod", sound: rhythmSound },
  { name: "trap", query: `${RHYTHM}&bpm=70`, track: "trap-4-4-70", labels: "Count", sound: rhythmSound },
  {
    name: "pitched",
    query: "rhythmOnly=false&key=G&clef=treble&scaleDegrees=1,2,3,4,5,6&rhythms=quarter,eighthEighth,half&timeSignature=4/4&bpm=90&progressions=true",
    track: "drums-rock-4-4-90",
    labels: "Movable",
    sound: { loop: 0.9, guide: 0.35, click: 0, bass: 0.85, guitar: 0.8, guitarStyle: "passenger", guideSound: "claves", clickSound: "quartz", melodyProgram: 0, ball: true },
  },
];
const want = process.env.JOBS?.split(",");

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});

async function proPage(sound: Record<string, unknown>): Promise<Page> {
  const p = await browser.newPage();
  p.on("pageerror", (e) => console.log("  page error:", e.message));
  await p.setRequestInterception(true);
  p.on("request", (req) => {
    const u = new URL(req.url());
    const j = (x: unknown) => req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
    if (u.pathname === "/api/auth/get-session")
      return j({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "promo@test.local", name: "Promo", accountType: "standard", emailVerified: true } });
    if (u.pathname === "/api/billing") return j({ plan: "pro", billingEnabled: true, subscription: null });
    if (u.pathname.startsWith("/api/usage")) return j({ allowed: true, plan: "pro", limit: null, remaining: null });
    if (u.pathname === "/api/presets" || u.pathname === "/api/classes") return j([]);
    if (u.pathname === "/api/preferences") return j({});
    return req.continue();
  });
  await p.evaluateOnNewDocument((s) => localStorage.setItem("abcsr_playalong_sound", JSON.stringify(s)), sound);
  return p;
}

const button = (p: Page, text: RegExp, scope = "body") =>
  p.evaluate((src, flags, scope) => {
    const re = new RegExp(src, flags);
    const b = [...document.querySelectorAll(`${scope} button`)].find((e) => re.test((e.textContent ?? "").trim())) as HTMLButtonElement | undefined;
    if (b && !b.disabled) b.click();
    return !!b && !b.disabled;
  }, text.source, text.flags, scope);
const until = async (p: Page, fn: () => Promise<boolean>, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out: ${what}`);
};

for (const job of JOBS) {
  if (want && !want.includes(job.name)) continue;
  console.log(`${job.name}: ${job.track}`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const p = await proPage(job.sound);
  const cdp = await p.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: TMP });
  await p.goto(`${APP}/sightreading?${job.query}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  await p.click('[aria-label="Generate a new exercise"]');
  await new Promise((r) => setTimeout(r, 3000));
  await button(p, /^Video/);
  const overlay = '[aria-label="Play-along video"]';
  await until(p, async () => !!(await p.$(`${overlay} select[aria-label="Backing track"]`)), 20000, "the video overlay");
  // The track (a track in another meter writes a new exercise), then the labels.
  await p.select(`${overlay} select[aria-label="Backing track"]`, job.track);
  await new Promise((r) => setTimeout(r, 1500));
  await until(p, () => p.evaluate((o) => [...document.querySelectorAll(`${o} button`)].some((b) => (b.textContent ?? "").trim() === "Play" && !(b as HTMLButtonElement).disabled), overlay), 60000, "ready to play");
  const label = await p.evaluate((o, want) => {
    const s = [...document.querySelectorAll(`${o} select`)].find((x) => x.getAttribute("aria-label") !== "Backing track" && [...(x as HTMLSelectElement).options].some((op) => op.text.startsWith(want))) as HTMLSelectElement | undefined;
    const op = s && [...s.options].find((x) => x.text.startsWith(want));
    if (!s || !op) return null;
    s.value = op.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return op.text;
  }, overlay, job.labels);
  await new Promise((r) => setTimeout(r, 2500));
  await until(p, () => p.evaluate((o) => [...document.querySelectorAll(`${o} button`)].some((b) => (b.textContent ?? "").trim() === "Play" && !(b as HTMLButtonElement).disabled), overlay), 60000, "ready after labels");
  const startedAt = Date.now();
  if (!(await button(p, /^Export video$/, overlay))) throw new Error("no Export button");
  await until(p, async () => readdirSync(TMP).some((f) => /\.(webm|mp4)$/.test(f)), 6 * 60_000, "the download");
  const file = readdirSync(TMP).find((f) => /\.(webm|mp4)$/.test(f))!;
  const ext = file.split(".").pop();
  renameSync(`${TMP}${file}`, `${OUT}${job.name}.${ext}`);
  writeFileSync(`${OUT}${job.name}.json`, JSON.stringify({ ...job, label, file, seconds: (Date.now() - startedAt) / 1000 }, null, 1));
  console.log(`  -> ${job.name}.${ext} (${label}, ${((Date.now() - startedAt) / 1000).toFixed(0)} s)`);
  await p.close();
}
await browser.close();
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
