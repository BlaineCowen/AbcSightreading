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

/** A laptop-sized page drawn at 1920x1080 device pixels, so the UI reads large on video. */
export const VIEW = { width: 1440, height: 810, deviceScaleFactor: 4 / 3 };

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
