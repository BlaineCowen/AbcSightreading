/**
 * The piano announcement's screen captures: real runs of /piano-sightreading
 * on the local dev server, at the song's tempo (Fun Fun Music, 100 BPM), in
 * the light theme. PHONE=1 records the phone layout for the vertical cut.
 *
 *   APP=http://localhost:4340 bun run capture/piano.ts            # every scene
 *   APP=http://localhost:4340 bun run capture/piano.ts grade      # one
 *
 * Each scene is recorded with recordExact, so its .json says when (on the
 * video's own clock) the count-in said "1" and, for the clicking scenes,
 * when each click happened (words: "click"), for ../../ad-piano/build.py to
 * put on the beat.
 */
import type { Page } from "puppeteer-core";
import { APP, PHONE, launch, recordExact, sleep, watchCountIn } from "./lib";

const BPM = 100;
const BEAT = 60_000 / 100.34;
const tag = (name: string) => `piano-${name}-100${PHONE ? "-phone" : ""}`;

/** Clicks a button by its exact text, or one whose aria-label starts so. */
async function press(page: Page, text: string, opts: { label?: boolean; within?: string } = {}) {
  const ok = await page.evaluate(
    (text, label, within) => {
      const root = (within && document.querySelector(within)) || document;
      const el = [...root.querySelectorAll<HTMLElement>("button")].find((b) => {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        return label ? (b.getAttribute("aria-label") ?? "").startsWith(text) : (b.textContent ?? "").replace(/\s+/g, " ").trim() === text;
      });
      el?.click();
      return !!el;
    },
    text,
    !!opts.label,
    opts.within ?? "",
  );
  if (!ok) throw new Error(`No button "${text}"`);
}

/** A click logged on the recording's clock, so build.py can put it on a beat. */
const logClick = (page: Page) => page.evaluate(() => ((window as any).__countIn ??= []).push({ word: "click", at: Date.now() }));

/** What a signed-out visitor sees that has no place in an ad: the monthly count, Feedback. */
async function tidy(page: Page) {
  await page.addStyleTag({
    content: `.setbar-count, [title$="left this month"], .tools-fab { visibility: hidden !important; }
      [role="alert"]:has(a[href*="pricing"]) { display: none !important; }`,
  });
  await page.evaluate(() => {
    for (const b of document.querySelectorAll("button, a")) if ((b.textContent ?? "").trim() === "Feedback") (b as HTMLElement).style.visibility = "hidden";
  });
}

async function open(query: string, layout: "lines" | "scroll" = "lines") {
  const browser = await launch();
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.evaluateOnNewDocument((layout) => {
    try {
      localStorage.setItem("theme", "light");
      localStorage.setItem("piano-layout", layout);
      localStorage.setItem("piano-cursor", "note");
    } catch {}
  }, layout);
  await page.goto(`${APP}/piano-sightreading?${query}&bpm=${BPM}`, { waitUntil: "networkidle2" });
  await sleep(1500);
  // Drawn on arrival? If not, the first exercise.
  if (!(await page.$("#paper svg"))) {
    await page.click('[aria-label="Generate a new exercise"]');
    await sleep(1500);
  }
  await tidy(page);
  await watchCountIn(page);
  return { browser, page };
}

/** The page scrolled so `selector` sits `offset` px from the top. */
const scrollTo = (page: Page, selector: string, offset = 0, smooth = false) =>
  page.evaluate(
    (sel, offset, smooth) => {
      const el = document.querySelector(sel);
      if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offset, behavior: smooth ? "smooth" : "instant" as ScrollBehavior });
    },
    selector,
    offset,
    smooth,
  );

const SCENES: Record<string, () => Promise<void>> = {
  /** The ten levels, one a beat in the Level popover, then the accompaniments. */
  async levels() {
    const { browser, page } = await open("level=piano-01");
    await scrollTo(page, ".setbar", PHONE ? 70 : 150);
    await recordExact(page, tag("levels"), async () => {
      await sleep(BEAT);
      await page.click(".set-pill-level");
      await logClick(page);
      for (let n = 1; n <= 10; n++) {
        await sleep(BEAT);
        await press(page, String(n), { within: ".set-pop" });
        await logClick(page);
      }
      await sleep(2 * BEAT);
      await press(page, "Done", { within: ".set-pop" });
      await sleep(BEAT);
      await press(page, "Accompaniment", { label: true });
      await logClick(page);
      await sleep(5 * BEAT);
    });
    await browser.close();
  },

  /** New exercise every two beats at Level 8, Alberti bass. */
  async generate() {
    const { browser, page } = await open("level=piano-08&meters=4/4&lh=alberti,albertiSixteenths,brokenEighths");
    await scrollTo(page, ".setbar", PHONE ? 70 : 150);
    await recordExact(page, tag("generate"), async () => {
      await sleep(BEAT);
      for (let k = 0; k < 4; k++) {
        await page.click('[aria-label="Generate a new exercise"]');
        await logClick(page);
        await sleep(2 * BEAT);
      }
      await sleep(2 * BEAT);
    });
    await browser.close();
  },

  /** Played, the notes lit as they sound, the page following. */
  async play() {
    const { browser, page } = await open("level=piano-08&meters=4/4&lh=alberti&bars=8");
    await scrollTo(page, "#paper", PHONE ? 60 : 20);
    await recordExact(page, tag("play"), async () => {
      await sleep(600);
      await page.click('[aria-label="Play"]');
      await sleep(BEAT * 4 * 6 + 1000);
    });
    await browser.close();
  },

  /** One scrolling line, moving continuously as it plays. */
  async scroll() {
    const { browser, page } = await open("level=piano-07&meters=4/4&lh=brokenEighths,arpeggio&bars=8", "scroll");
    await scrollTo(page, "#paper-box", PHONE ? 200 : 120);
    await recordExact(page, tag("scroll"), async () => {
      await sleep(600);
      await page.click('[aria-label="Play"]');
      await sleep(BEAT * 4 * 7 + 1000);
    });
    await browser.close();
  },

  /**
   * Play and grade with a keyboard: the keys pressed through the dev hook
   * (window.__pianoMidi) as a player would, with a few planted faults - a
   * note late, a wrong key, a note left out, a chord early, a key too many -
   * then the score with what was played drawn on it.
   */
  async grade() {
    const { browser, page } = await open("level=piano-05&meters=4/4&lh=block&bars=4&dyn=0");
    await press(page, "Play and grade");
    await sleep(500);
    await scrollTo(page, ".score-tools", PHONE ? 60 : 10);
    await recordExact(page, tag("grade"), async () => {
      await sleep(400);
      await press(page, "Start");
      await page.evaluate(async () => {
        const M = (window as any).__pianoMidi;
        let s = M.state();
        for (let i = 0; i < 100 && !(s.running && s.t0); i++) {
          await new Promise((r) => setTimeout(r, 30));
          s = M.state();
        }
        const unitMs = 60_000 / s.bpm / 8;
        const plan: { t: number; midi: number; len: number }[] = [];
        for (const n of s.expected) {
          let midi = n.midi;
          let off = 0;
          if (n.hand === "rh" && n.index === 2) off = 0.3 * 8 * unitMs; // late
          if (n.hand === "rh" && n.index === 5) midi = n.midi + 2; // a wrong key
          if (n.hand === "rh" && n.index === 8) continue; // left out
          if (n.hand === "lh" && n.index === 2) off = -0.45 * 8 * unitMs; // early
          // A human touch: a few ms either way.
          off += ((n.index * 37) % 11) - 5;
          plan.push({ t: s.t0 + n.start * unitMs + off, midi, len: n.length * unitMs * 0.85 });
        }
        plan.push({ t: s.t0 + 10 * 8 * unitMs + 4 * unitMs, midi: 81, len: 150 }); // a key too many
        for (const p of plan) {
          setTimeout(() => M.press(p.midi), p.t - performance.now());
          setTimeout(() => M.release(p.midi), p.t - performance.now() + p.len);
        }
      });
      // The count-in, four bars, and the grade.
      await sleep(BEAT * 4 * 5 + 1200);
      // The result's score: scrolled to, held.
      await scrollTo(page, "#paper", PHONE ? 60 : 20, true);
      await sleep(BEAT * 8);
    });
    await browser.close();
  },
};

const want = process.argv.slice(2);
for (const [name, run] of Object.entries(SCENES)) {
  if (want.length && !want.includes(name)) continue;
  console.log(`recording ${tag(name)}`);
  await run();
}
