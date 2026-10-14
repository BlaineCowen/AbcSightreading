/**
 * Records the lessons (lessons.ts) through the play-along's own Export
 * button, in real time, with Blaine's sound settings: drums 100%, melody 25%
 * on clarinet, bass 80%, guitar 70% Campfire, click off, ball on, movable do.
 * An exercise with six or more eighth notes in a row is thrown away and a new
 * one written (read from the bar pictures the video draws). Needs the dev
 * server on 4321; Pro is answered for the page.
 *
 *   bun run marketing/youtube-lessons/capture.ts          # every lesson
 *   ONLY=1,6 bun run marketing/youtube-lessons/capture.ts
 *
 * Writes raw/<slug>.<ext>; finish.ts adds the end card.
 */
import puppeteer, { type Page } from "../ad/node_modules/puppeteer-core";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { LESSONS, queryFor } from "./lessons";

const APP = process.env.APP ?? "http://localhost:4321";
const OUT = new URL("./raw/", import.meta.url).pathname;
const TMP = new URL("./.downloads/", import.meta.url).pathname;
const MAX_EIGHTHS = 5;
const want = process.env.ONLY?.split(",").map(Number);

const SOUND = {
  loop: 1, guide: 0.25, click: 0, bass: 0.8, guitar: 0.7, guitarStyle: "campfire",
  guideSound: "claves", clickSound: "quartz", melodyProgram: 71, ball: true,
};

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});

async function proPage(): Promise<Page> {
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
  await p.evaluateOnNewDocument((s) => {
    localStorage.setItem("abcsr_playalong_sound", JSON.stringify(s));
    // Every bar picture the video draws is an SVG blob (bar-images.ts): keep their text.
    const w = window as unknown as { __svgs: string[] };
    w.__svgs = [];
    const Orig = window.Blob;
    window.Blob = class extends Orig {
      constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        if (opts?.type === "image/svg+xml" && parts?.every((x) => typeof x === "string")) w.__svgs.push((parts as string[]).join(""));
      }
    } as typeof Blob;
  }, SOUND);
  return p;
}

const button = (p: Page, text: RegExp, scope = "body") =>
  p.evaluate((src, flags, scope) => {
    const re = new RegExp(src, flags);
    const b = [...document.querySelectorAll(`${scope} button`)].find((e) => re.test((e.textContent ?? "").trim())) as HTMLButtonElement | undefined;
    if (b && !b.disabled) b.click();
    return !!b && !b.disabled;
  }, text.source, text.flags, scope);
const until = async (fn: () => Promise<boolean>, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out: ${what}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const overlay = '[aria-label="Play-along video"]';
const ready = (p: Page) =>
  until(() => p.evaluate((o) => [...document.querySelectorAll(`${o} button`)].some((b) => (b.textContent ?? "").trim() === "Play" && !(b as HTMLButtonElement).disabled), overlay), 90000, "ready to play");

/**
 * The note lengths of the exercise drawn since the last clear, bar by bar, from
 * abcjs's duration classes (abcjs-d0-125 is an eighth); rests break a run.
 */
async function longestEighthRun(p: Page): Promise<{ run: number; notes: number; bars: number }> {
  return p.evaluate(() => {
    const svgs = (window as unknown as { __svgs: string[] }).__svgs;
    let run = 0, best = 0, notes = 0;
    for (const s of svgs) {
      const doc = new DOMParser().parseFromString(s, "image/svg+xml");
      for (const el of doc.querySelectorAll(".abcjs-note, .abcjs-rest")) {
        const cls = el.getAttribute("class") ?? "";
        const d = cls.match(/abcjs-d(\d+)-(\d+)/);
        if (!d) continue;
        const len = Number(`${d[1]}.${d[2]}`);
        if (cls.includes("abcjs-rest")) { run = 0; continue; }
        notes++;
        run = len === 0.125 ? run + 1 : 0;
        best = Math.max(best, run);
      }
    }
    return { run: best, notes, bars: svgs.length };
  });
}
const clearSvgs = (p: Page) => p.evaluate(() => void ((window as unknown as { __svgs: string[] }).__svgs = []));

for (const l of LESSONS) {
  if (want && !want.includes(l.n)) continue;
  console.log(`${l.slug}`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const p = await proPage();
  const cdp = await p.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: TMP });
  await p.goto(`${APP}/sightreading?${queryFor(l)}`, { waitUntil: "networkidle2" });
  await wait(1500);
  await p.click('[aria-label="Generate a new exercise"]');
  await wait(3000);
  await button(p, /^Video/);
  await until(async () => !!(await p.$(`${overlay} select[aria-label="Backing track"]`)), 20000, "the video overlay");
  await ready(p);
  const label = await p.evaluate((o) => {
    const s = [...document.querySelectorAll(`${o} select`)].find((x) => [...(x as HTMLSelectElement).options].some((op) => op.text.startsWith("Movable"))) as HTMLSelectElement | undefined;
    const op = s && [...s.options].find((x) => x.text.startsWith("Movable"));
    if (!s || !op) return null;
    s.value = op.value;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return op.text;
  }, overlay);
  if (!label) throw new Error("no Movable do label");

  // Draw again (after the labels) and check; a run of six eighths writes a new one.
  let check = { run: 0, notes: 0, bars: 0 };
  for (let tries = 0; ; tries++) {
    await clearSvgs(p);
    if (tries === 0) {
      // The label change redraws; give it a moment to start.
      await p.evaluate((o) => {
        const s = [...document.querySelectorAll(`${o} select`)].find((x) => [...(x as HTMLSelectElement).options].some((op) => op.text.startsWith("Movable"))) as HTMLSelectElement;
        const keep = s.value;
        s.value = [...s.options].find((x) => x.value !== keep)!.value;
        s.dispatchEvent(new Event("change", { bubbles: true }));
        s.value = keep;
        s.dispatchEvent(new Event("change", { bubbles: true }));
      }, overlay);
    } else if (!(await button(p, /^New exercise$/, overlay))) throw new Error("no New exercise button");
    await wait(2500);
    await ready(p);
    await wait(1000);
    check = await longestEighthRun(p);
    console.log(`  try ${tries + 1}: ${check.bars} bars, ${check.notes} notes, longest eighth run ${check.run}`);
    if (check.bars > 0 && check.notes > 0 && check.run <= MAX_EIGHTHS) break;
    if (tries > 15) throw new Error("no exercise without a long eighth run");
  }

  if (process.env.DRY) { console.log(await p.evaluate(() => (window as any).__svgs[0]?.match(/class="[^"]*abcjs-note[^"]*"/g)?.slice(0, 4))); await p.close(); continue; }
  const startedAt = Date.now();
  if (!(await button(p, /^Export video$/, overlay))) throw new Error("no Export button");
  const watch = setInterval(async () => {
    const t = await p.evaluate((o) => document.querySelector(o)?.textContent?.replace(/\s+/g, " ").slice(0, 300), overlay).catch(() => "");
    console.log(`  [${((Date.now() - startedAt) / 1000).toFixed(0)} s] ${t}`);
  }, 20000);
  try {
    await until(async () => readdirSync(TMP).some((f) => /\.(webm|mp4)$/.test(f)), 8 * 60_000, "the download");
  } finally {
    clearInterval(watch);
  }
  await wait(1500);
  const file = readdirSync(TMP).find((f) => /\.(webm|mp4)$/.test(f))!;
  const ext = file.split(".").pop();
  renameSync(`${TMP}${file}`, `${OUT}${l.slug}.${ext}`);
  writeFileSync(`${OUT}${l.slug}.json`, JSON.stringify({ ...l, query: queryFor(l), label, check, file, seconds: (Date.now() - startedAt) / 1000 }, null, 1));
  console.log(`  -> ${l.slug}.${ext} (${((Date.now() - startedAt) / 1000).toFixed(0)} s)`);
  await p.close();
}
await browser.close();
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
