/**
 * Capture helpers: drive the app on the local dev server in Chrome and
 * record what it draws. Recordings land in ../assets/captures/ (not committed).
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { mkdirSync } from "fs";
import { resolve } from "path";

export const APP = process.env.APP ?? "http://localhost:4321";
export const OUT = resolve(import.meta.dir, "../assets/captures");
mkdirSync(OUT, { recursive: true });

/**
 * A laptop-sized page drawn at 1920x1080 device pixels, so the UI reads large
 * on video; or, with PHONE=1 (the vertical ad), a phone's 390x844 at 2x,
 * 780x1688, the app in its phone layout.
 */
export const PHONE = process.env.PHONE === "1";
export const VIEW = PHONE
  ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 810, deviceScaleFactor: 4 / 3 };
const PX = { w: Math.round(VIEW.width * VIEW.deviceScaleFactor), h: Math.round(VIEW.height * VIEW.deviceScaleFactor) };

export async function launch(extraArgs: string[] = []): Promise<Browser> {
  return puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", ...extraArgs],
    defaultViewport: VIEW,
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Clicks the first visible button (or link) whose text includes `text`. */
export async function clickText(page: Page, text: string, opts: { exact?: boolean; within?: string } = {}) {
  const ok = await page.evaluate(
    (text, exact, within) => {
      const root = within ? document.querySelector(within) ?? document : document;
      const els = [...root.querySelectorAll<HTMLElement>("button, a, [role=button], summary, label")];
      const el = els.find((e) => {
        const t = (e.textContent ?? "").replace(/\s+/g, " ").trim();
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (exact ? t === text : t.includes(text));
      });
      if (!el) return false;
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      el.click();
      return true;
    },
    text,
    !!opts.exact,
    opts.within ?? "",
  );
  if (!ok) throw new Error(`No button "${text}"`);
}

/** Smoothly scrolls the page so `selector` sits at `block` of the viewport. */
export async function scrollTo(page: Page, selector: string, block: ScrollLogicalPosition = "start", offset = 0) {
  await page.evaluate(
    (sel, block, offset) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const target = window.scrollY + r.top - (block === "center" ? window.innerHeight / 2 - r.height / 2 : 0) + offset;
      window.scrollTo({ top: target, behavior: "smooth" });
    },
    selector,
    block,
    offset,
  );
}

/** Records the page while `act` runs. */
export async function record(page: Page, name: string, act: () => Promise<void>) {
  const path = `${OUT}/${name}.webm`;
  const rec = await page.screencast({ path: path as `${string}.webm` });
  try {
    await act();
  } finally {
    await rec.stop();
  }
  return path;
}

/**
 * Records like `record`, but keeps time exactly: Chrome's screencast frames
 * each carry a wall-clock timestamp, and the video is assembled from them at
 * a constant 30 fps (each frame held until the next), at the full 1920x1080
 * the page draws. Puppeteer's own screencast ran about a fifth slow against
 * real time, which is no use for syncing to music.
 *
 * The page logs the count-in's words with the same clock (watchCountIn), so
 * `<name>.json` says when, in the video, the count-in started and the first
 * note sounded.
 */
export async function recordExact(page: Page, name: string, act: () => Promise<void>) {
  const { writeFileSync, mkdirSync, rmSync } = await import("fs");
  const { execFileSync } = await import("child_process");
  const dir = `${OUT}/${name}-frames`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  const frames: { file: string; ts: number }[] = [];
  cdp.on("Page.screencastFrame", async (f: any) => {
    const file = `${dir}/${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, ts: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: PX.w, maxHeight: PX.h, everyNthFrame: 1 });
  const startedMs = Date.now();
  try {
    await act();
  } finally {
    await cdp.send("Page.stopScreencast");
  }
  const endTs = Date.now() / 1000;
  const marks: { word: string | null; at: number }[] = await page.evaluate(() => (window as any).__countIn ?? []);
  const t0 = frames[0].ts;
  // Each frame shown until the next; the last until the recording stopped.
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.ts ?? endTs) - f.ts).toFixed(4)}`).join("\n");
  writeFileSync(`${dir}/list.txt`, list + `\nfile '${frames[frames.length - 1].file}'\n`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", `fps=30,scale=${PX.w}:${PX.h}:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-g", "15", "-pix_fmt", "yuv420p", `${OUT}/${name}.mp4`]);
  rmSync(dir, { recursive: true, force: true });
  const words = marks.map((m) => ({ word: m.word, at: +(m.at / 1000 - t0).toFixed(3) }));
  const go = words.find((w) => w.word === "Go");
  const gone = go ? words.find((w) => w.at > go.at && w.word === null) : undefined;
  const one = words.find((w) => w.word === "1");
  const beat = one && go ? (go.at - one.at) / 3 : null;
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({
    frames: frames.length, seconds: +(endTs - t0).toFixed(3), lead: +((t0 * 1000 - startedMs) / 1000).toFixed(3),
    countin_start: one?.at ?? null, beat_measured: beat && +beat.toFixed(4),
    // The first note: a beat after "Go" (the badge hides then, a frame or so late).
    music_start: go && beat ? +(go.at + beat).toFixed(3) : null, badge_hidden: gone?.at ?? null, words,
  }, null, 1));
  return `${OUT}/${name}.mp4`;
}

/** Logs the count-in badge's words with their wall-clock time, for recordExact. */
export async function watchCountIn(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__countIn = [];
    let last: string | null = null;
    const tick = () => {
      const el = [...document.querySelectorAll('[aria-live="assertive"]')].find((e) => /^(\d+|Ready|Go)$/.test((e.textContent ?? "").trim()));
      const word = el ? (el.textContent ?? "").trim() : null;
      if (word !== last) {
        w.__countIn.push({ word, at: Date.now() });
        last = word;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
