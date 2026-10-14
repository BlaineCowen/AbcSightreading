/**
 * Adds the closing card ("customize all these settings at
 * abcsightreading.com") to each recorded lesson and writes a YouTube-ready
 * MP4 (H.264, AAC, 1920x1080, 30 fps) to final/, plus youtube.md with each
 * title and description.
 *
 *   bun run marketing/youtube-lessons/finish.ts
 */
import puppeteer from "../ad/node_modules/puppeteer-core";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { LESSONS } from "./lessons";

const DIR = new URL("./", import.meta.url).pathname;
const RAW = `${DIR}raw/`;
const FINAL = `${DIR}final/`;
const CARD = `${DIR}end-card.png`;
const CARD_SECONDS = 6;
mkdirSync(FINAL, { recursive: true });

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1920px;height:1080px;overflow:hidden}
  body{background:linear-gradient(160deg,#eef5ff 0%,#f7fbff 55%,#fff6ef 100%);font-family:Nunito,sans-serif;color:#15213a;display:grid;place-items:center}
  .card{width:1500px;padding:90px 100px 80px;background:#fff;border-radius:56px;box-shadow:0 2px 4px rgba(21,33,58,.04),0 40px 90px -40px rgba(30,70,160,.45);text-align:center}
  h1{font-family:Fredoka,sans-serif;font-weight:700;font-size:96px;margin:0 0 18px;line-height:1.05}
  p{font-size:44px;font-weight:700;color:#56637f;margin:0 0 46px}
  .chips{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-bottom:20px}
  .chip{font-family:Fredoka,sans-serif;font-weight:600;font-size:31px;padding:12px 26px;border-radius:999px}
  .url{font-family:Fredoka,sans-serif;font-weight:700;font-size:84px;color:#2f6fe0}
  .url i{font-style:italic}
</style></head><body><div class="card">
  <h1>Make it your own</h1>
  <p>Customize all these settings at</p>
  <div class="url"><i>abc</i>sightreading.com</div>
  <div style="height:56px"></div>
  <div class="chips">
    <span class="chip" style="background:#c9e4ff;color:#0e3563">Key</span>
    <span class="chip" style="background:#bdebd9;color:#0f3b2c">Notes</span>
    <span class="chip" style="background:#ffd3bf;color:#5a2310">Rhythms</span>
    <span class="chip" style="background:#ffefa8;color:#5c4a00">Skips</span>
    <span class="chip" style="background:#c9e4ff;color:#0e3563">Tempo</span>
    <span class="chip" style="background:#bdebd9;color:#0f3b2c">Drums</span>
    <span class="chip" style="background:#ffd3bf;color:#5a2310">Instruments</span>
    <span class="chip" style="background:#ffefa8;color:#5c4a00">Solfège</span>
  </div>
</div></body></html>`;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: CARD });
await browser.close();
console.log("end card ->", CARD);

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

const md: string[] = ["# YouTube lessons", ""];
for (const l of LESSONS) {
  const raw = readdirSync(RAW).find((f) => f.startsWith(l.slug) && /\.(webm|mp4)$/.test(f));
  if (!raw) {
    console.log(`${l.slug}: not recorded yet`);
    continue;
  }
  const out = `${FINAL}${l.slug}.mp4`;
  if (!existsSync(out) || process.env.FORCE) {
    // The lesson, then the card fading in from white over a quiet tail.
    ff([
      "-i", `${RAW}${raw}`,
      "-loop", "1", "-t", String(CARD_SECONDS), "-i", CARD,
      "-f", "lavfi", "-t", String(CARD_SECONDS), "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex",
      [
        "[0:v]fps=30,scale=1920:1080,setsar=1,format=yuv420p[v0]",
        "[0:a]aresample=48000,aformat=channel_layouts=stereo[a0]",
        `[1:v]fps=30,scale=1920:1080,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.6:color=white[v1]`,
        "[v0][a0][v1][2:a]concat=n=2:v=1:a=1[v][a]",
      ].join(";"),
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      out,
    ]);
    console.log(`${l.slug}: -> final/${l.slug}.mp4`);
  }
  md.push(
    `## ${l.n}. ${l.title}`,
    "",
    `File: final/${l.slug}.mp4`,
    "",
    "```",
    `${l.covers} Sing along with the bouncing ball in ${l.key} major, ${l.meter} time, at ${l.bpm} BPM, with movable do solfège under every note. Drums, bass and guitar play along; the melody plays quietly on clarinet so you can check yourself.`,
    "",
    `Lesson ${l.n} of 10 in our step-by-step sight-singing series: one new thing per lesson, building from do re mi to the whole scale.`,
    "",
    "Customize all these settings (key, notes, rhythms, skips, tempo, drums, instruments) and make your own play-along videos at https://abcsightreading.com",
    "```",
    "",
  );
}
writeFileSync(`${DIR}youtube.md`, md.join("\n"));
console.log("titles and descriptions -> youtube.md");
