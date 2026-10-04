/**
 * The ad's screen captures: real runs of the app on the local dev server
 * (bun run dev in the repo root), recorded at 1920x1080 in the light theme.
 *
 *   bun run capture/capture.ts unison choral rhythm   # some scenes
 *   bun run capture/capture.ts                         # all of them
 */
import type { Page } from "puppeteer-core";
import { APP, OUT, launch, clickText, record, recordExact, sleep, scrollTo, watchCountIn } from "./lib";
import { resolve } from "path";

const light = async (page: Page) => {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("theme", "light"); } catch {}
  });
};

/**
 * What a signed-out visitor sees that has no place in an ad: the monthly
 * allowance banner and the floating Feedback button. Hidden, not removed, so
 * the page lays out as it does.
 */
async function tidy(page: Page) {
  await page.evaluate(() => {
    const hide = (el: Element | null | undefined) => el && ((el as HTMLElement).style.visibility = "hidden");
    // The innermost element saying it: hiding a parent took the Preset button with it.
    const says = (el: Element) => /exercises left this month/.test(el.textContent ?? "");
    for (const el of document.querySelectorAll("p, div, span")) {
      if (says(el) && ![...el.children].some(says)) hide(el);
    }
    for (const b of document.querySelectorAll("button, a")) if ((b.textContent ?? "").trim() === "Feedback") hide(b);
  });
}

async function open(path: string, extraArgs: string[] = []) {
  const browser = await launch(extraArgs);
  const page = await browser.newPage();
  await light(page);
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle2" });
  await sleep(1200);
  await tidy(page);
  return { browser, page };
}

/**
 * TEMPO=85: the playing scenes (unison, choral, rhythm) are recorded at the
 * song's tempo, into <scene>-<tempo>.webm, so the cursor keeps the music's
 * beat; build.py lines their first note up with a downbeat.
 */
const TEMPO = Number(process.env.TEMPO ?? 84);
const tagged = (name: string) => (process.env.TEMPO ? `${name}-${TEMPO}` : name);

const UNISON = `/sightreading?clef=treble&range=14-21&key=G&scaleDegrees=1,2,3,4,5,6,7&rhythms=quarter,eighthEighth,half,dotQuarterEighth&timeSignature=4/4&measures=8&maxSkip=4&bpm=${TEMPO}&showSolfege=true&rhythmOnly=false&progressions=true&cursor=smooth`;

const scenes: Record<string, () => Promise<void>> = {
  async unison() {
    const { browser, page } = await open(UNISON);
    await watchCountIn(page);
    await recordExact(page, tagged("unison"), async () => {
      await sleep(900);
      await clickText(page, "Notes", { exact: true });
      await sleep(1300);
      await clickText(page, "Generate", { exact: true });
      await sleep(1600);
      await clickText(page, "Play", { exact: true });
      await sleep(4 * (60000 / TEMPO) + 9000);
    });
    await browser.close();
  },

  async choral() {
    // UIL Level 3 in F major, at the song's tempo.
    const { browser, page } = await open(`/choral-sightreading?bpm=${TEMPO}`);
    await page.evaluate(() => {});
    await watchCountIn(page);
    await recordExact(page, tagged("choral"), async () => {
      await sleep(900);
      await clickText(page, "Generate", { exact: true });
      await sleep(1800);
      await clickText(page, "Play", { exact: true });
      await sleep(4 * (60000 / TEMPO) + 9000);
    });
    await browser.close();
  },

  async rhythm() {
    const { browser, page } = await open(
      `/sightreading?rhythmOnly=true&rhythms=quarter,eighthEighth,half,quarterRest,fourSixteenths&timeSignature=4/4&measures=8&bpm=${TEMPO}&showRhythmSyllables=true&syllableSystem=kodaly`,
    );
    await watchCountIn(page);
    await recordExact(page, tagged("rhythm"), async () => {
      await sleep(700);
      await clickText(page, "Generate", { exact: true });
      await sleep(1500);
      await clickText(page, "Play", { exact: true });
      await sleep(4 * (60000 / TEMPO) + 9000);
    });
    await browser.close();
  },

  async chromatic() {
    const { browser, page } = await open(
      "/sightreading?clef=treble&range=14-21&key=F&scaleDegrees=1,2,3,4,5,6,7&selectedSharpDegrees=4&rhythms=quarter,eighthEighth,half&timeSignature=4/4&measures=8&maxSkip=4&bpm=84&showSolfege=true&rhythmOnly=false&progressions=true",
    );
    await record(page, "chromatic", async () => {
      await clickText(page, "Notes", { exact: true });
      await sleep(1600);
      await clickText(page, "Generate", { exact: true });
      await sleep(1600);
      await scrollTo(page, ".abcjs-container, [id^=paper]", "start", 380);
      await sleep(2600);
    });
    await browser.close();
  },

  async ladder() {
    const { browser, page } = await open("/sightreading");
    await record(page, "ladder", async () => {
      await sleep(600);
      await clickText(page, "Choose");
      await sleep(900);
      await clickText(page, "abcStepByStep");
      await sleep(2600);
      await page.mouse.wheel({ deltaY: 260 });
      await sleep(1800);
    });
    await page.screenshot({ path: `${OUT}/ladder.png` });
    await browser.close();
  },

  async tuner() {
    // abcTuner is Pro: its page shows a signed-out visitor the Pro card, so the
    // capture mounts the app's own component in its place. The microphone is
    // Chrome's fake device playing a synthesized sung "ah" (capture/voice.py).
    const wav = `${OUT}/voice-ah.wav`;
    const { browser, page } = await open("/tuner", [
      "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`,
      // The sandboxed audio service cannot read the file: the fake microphone is silent without this.
      "--disable-features=AudioServiceSandbox",
    ]);
    await browser.defaultBrowserContext().overridePermissions(APP, ["microphone"]);
    await page.evaluate(async () => {
      const C: any = (await import("/src/components/tuner/AbcTuner.svelte")).default;
      const card = [...document.querySelectorAll("div")].find((d) => /abcTuner is part of Pro/.test(d.textContent ?? "") && d.children.length > 2);
      const host = document.createElement("div");
      host.style.width = "100%";
      (card ?? document.body).replaceWith(host);
      new C({ target: host });
    });
    await sleep(900);
    await clickText(page, "Solfège", { exact: true });
    await page.evaluate(() => window.scrollTo(0, 150));
    await sleep(300);
    await record(page, "tuner", async () => {
      await sleep(500);
      await clickText(page, "Start microphone");
      await sleep(5500);
      await clickText(page, "Analysis", { exact: true });
      await sleep(4500);
      await clickText(page, "Metronome", { exact: true });
      await sleep(3000);
    });
    await browser.close();
  },
};

const wanted = process.argv.slice(2);
for (const [name, run] of Object.entries(scenes)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const t0 = Date.now();
  await run();
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${resolve(OUT, name + ".webm")}`);
}
