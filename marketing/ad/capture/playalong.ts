/**
 * The play-along video, rendered frame by frame by the app's own scene code
 * (src/lib/play-along/scene.ts) at 30 fps: a real exercise over a chord
 * progression, its bars drawn by bar-images.ts, the count-in, the ball. The
 * same pixels the app records when a Pro user exports a video.
 */
import { APP, OUT, launch, sleep } from "./lib";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";

const FPS = 30;
const SECONDS = Number(process.env.SECONDS ?? 13);
/** The song's tempo, so the ball lands on its beats; and seconds of opening screen before the count-in. */
const BPM = Number(process.env.BPM ?? 90);
const LEAD = Number(process.env.LEAD ?? 0.5);
const NAME = process.env.NAME ?? "playalong";
const dir = `${OUT}/${NAME}-frames`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await page.goto(`${APP}/sightreading`, { waitUntil: "networkidle2" });
await sleep(800);
await page.evaluate((bpm) => { (window as any).__bpm = bpm; }, BPM);
await page.evaluate(async () => {
  const gen: any = await import("/src/lib/generateUnison.ts");
  const R: any = await import("/src/resources/rhythms.ts");
  const M: any = await import("/src/lib/meter.ts");
  const B: any = await import("/src/lib/play-along/bar-images.ts");
  const names = ["quarter", "eighthEighth", "half"];
  const score = gen.createNewSr({
    bpm: 90, tempo: 90, clef: "treble", selectedClef: "treble", timeSig: M.timeSignatureFor("4/4"), selectedTimeSignature: "4/4",
    measures: 8, maxSkip: 4, maxEighthSkip: 99, range: { min: 14, max: 21 }, selectedRhythms: names,
    rhythms: R.rhythms.filter((x: any) => names.includes(x.name)), scaleDegrees: new Set([1, 2, 3, 4, 5, 6, 7]), key: "D",
    chords: ["1", "2", "3", "4", "5", "6", "7"], showSolfege: true, rhythmOnly: false, progressions: true, dynamics: [],
    partsObject: { numofParts: 1, parts: { Unison: { chordNoteObject: [], order: 0, smallName: "U", selectedRange: [14, 21] } } },
  })[2];
  const abc = gen.assembleUnisonAbc(score, { showSolfege: true, lyricSystem: "movable" });
  const { bars } = await B.renderBars(abc, (window as any).__bpm, 8);
  const c = document.createElement("canvas");
  c.width = 1920; c.height = 1080;
  (window as any).__pa = { bars, c, ctx: c.getContext("2d") };
});
const total = Math.round(SECONDS * FPS);
for (let from = 0; from < total; from += 30) {
  const frames: string[] = await page.evaluate(async (from, n, fps, bpm, lead) => {
    const S: any = await import("/src/lib/play-along/scene.ts");
    const T: any = await import("/src/lib/play-along/timeline.ts");
    const { bars, c, ctx } = (window as any).__pa;
    const out: string[] = [];
    const beats = 4, bar = (60 / bpm) * beats;
    for (let k = from; k < from + n; k++) {
      // Half a second of the opening screen, then the count-in and the music.
      const t = k / fps - lead;
      const frame = T.frameAt(t, { bars: 8, bpm, meter: "4/4", countInBars: 1 });
      const musicEnd = (1 + 8) * bar;
      // Timed at the song's exact tempo; the header shows it rounded, as the app would.
      S.drawScene(ctx, { frame: t < 0 ? { ...frame, word: null } : frame, bars, total: 8, meter: "4/4", bpm: Math.round(bpm), beats, t, beatSec: 60 / bpm,
        countInBars: 1, clock: k / fps, sinceEnd: Math.max(0, t - musicEnd), playing: t >= 0, showBall: true });
      out.push(c.toDataURL("image/jpeg", 0.93).split(",")[1]);
    }
    return out;
  }, from, Math.min(30, total - from), FPS, BPM, LEAD);
  frames.forEach((b64, i) => writeFileSync(`${dir}/${String(from + i).padStart(5, "0")}.jpg`, Buffer.from(b64, "base64")));
}
await browser.close();
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", `${dir}/%05d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", `${OUT}/${NAME}.mp4`]);
rmSync(dir, { recursive: true, force: true });
console.log(`${NAME}.mp4: ${total} frames at ${BPM} bpm`);
