/**
 * A printed sight-reading book: exercises written by the site's own
 * generators, engraved by abcjs in headless Chrome, each with a QR code that
 * opens it on the site (/b/<book>/<n>, src/pages/b/[book]/[n].ts) to show on
 * screen, play any part, and label with solfège or note names. (Not grade:
 * Listen and grade is the Unison page's; a Choral book must not promise it.)
 *
 *   BOOK=satb-sample VOICING="4 Part Mixed" LEVELS=1 PER_LEVEL=10 bun run scripts/make-book.ts
 *
 * Writes src/data/books/<BOOK>.json (what the QR codes open; commit it, so a
 * printed book keeps opening what it printed) and marketing/books/<BOOK>.pdf.
 * Seeded: the same BOOK and settings write the same exercises.
 *   BASE_URL   where the QR codes point (default https://www.abc-sightreading.com)
 *   BARS       bars per exercise (default 8)
 *   TITLE      the book's title
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { generateChoralExercise } from "../src/lib/generateChoral";
import { uilPresets } from "../src/lib/uil-presets";
import { chords as fullChordSet } from "../src/resources/chords";
import { rhythms as allRhythms } from "../src/resources/rhythms";
import { packExercise } from "../src/lib/exercise-link";
import { melodyFirstFor } from "../src/lib/two-part-treble";
import { ssaLevelFor } from "../src/lib/three-part-treble";
import { skipLevelFor } from "../src/lib/uil-skips";
import { unisonProbabilityFor } from "../src/lib/unison-spans";
import { rhymeProbabilityFor } from "../src/lib/rhyming-phrases";
import { TIME_SIGS, choralSelectable, presetVoicing } from "./generation-fixtures";

const BOOK = process.env.BOOK ?? "satb-sample";
const VOICING = process.env.VOICING ?? "4 Part Mixed";
const LEVELS = (process.env.LEVELS ?? "1").split(",").map(Number);
const PER_LEVEL = Number(process.env.PER_LEVEL ?? 10);
const BARS = Number(process.env.BARS ?? 8);
const BASE_URL = (process.env.BASE_URL ?? "https://www.abc-sightreading.com").replace(/\/$/, "");
const VOICING_NAME: Record<string, string> = {
  "4 Part Mixed": "SATB", "3 Part Mixed": "SAB", "3 Part Treble": "SSA", "2 Part Treble": "SA",
  "3 Part Tenor/Bass": "TTB", "2 Part Tenor/Bass": "TB",
};
const TITLE = process.env.TITLE ?? `Choral Sight-Reading, ${VOICING_NAME[VOICING] ?? VOICING}`;

/** Seeded, so a book can be written again exactly. */
function seed(n: number) {
  let s = n % 2147483647 || 1;
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type Entry = { n: number; level: number; key: string; meter: string; abc: string; page: string; packed: string };
const entries: Entry[] = [];
const quiet = () => {};
const real = { log: console.log, warn: console.warn, random: Math.random };

let n = 0;
for (const level of LEVELS) {
  const key = `UIL ${level}` as keyof typeof uilPresets;
  const p = uilPresets[key];
  for (let i = 0; i < PER_LEVEL; i++) {
    n++;
    // Keys and meters taken in turn through the level's own.
    const k = p.allowedKeys[i % p.allowedKeys.length];
    const meter = p.allowedMeters[Math.floor(i / p.allowedKeys.length) % p.allowedMeters.length];
    const timeSig = TIME_SIGS[meter];
    seed(hash(BOOK) + level * 1000 + i);
    Object.assign(console, { log: quiet, warn: quiet });
    let ex;
    try {
      ex = generateChoralExercise({
        key: k, timeSig, partsObject: presetVoicing(VOICING, p)!, measures: BARS, maxSkip: p.maxSkip, bpm: 72,
        selectedRhythms: allRhythms.filter((r) => p.allowedRhythmNames.includes(r.name) && choralSelectable(r) && !r.rest && r.totalValue <= timeSig.tsPerMeasure),
        chords: fullChordSet, accidentalsByStep: true, nctProbability: 0.1, chromaticFrequency: 1,
        allowedChordNames: p.allowedChordNames, voiceTexture: "full", stepwiseEighths: true,
        unisonProbability: unisonProbabilityFor(key), rhymeProbability: rhymeProbabilityFor(key),
        melodyFirst: melodyFirstFor(key), skipLevel: skipLevelFor(key), ssaLevel: ssaLevelFor(key), partWriterLevel: level,
        breathRests: !p.noRests, cadenceTypes: p.allowedCadenceTypes, dottedOnStrongBeats: !!p.dottedOnStrongBeats,
      } as any);
    } finally {
      Object.assign(console, { log: real.log, warn: real.warn });
      Math.random = real.random;
    }
    const packed = await packExercise({ kind: "choral", result: { exercise: ex.renderInput } }, { compress: false });
    // The printed copy: no title or composer line (the page heads each exercise itself).
    const abc = ex.abcString.split("\n").filter((l) => !/^(T|C):/.test(l)).join("\n");
    entries.push({ n, level, key: k, meter, abc, page: "/choral-sightreading", packed });
  }
}

mkdirSync("src/data/books", { recursive: true });
writeFileSync(`src/data/books/${BOOK}.json`, JSON.stringify({ id: BOOK, title: TITLE, exercises: entries.map(({ n, page, packed }) => ({ n, page, packed })) }));

// ── The printed book ───────────────────────────────────────────────────────
const abcjs = readFileSync("node_modules/abcjs/dist/abcjs-basic-min.js", "utf8");
const keyName = (k: string) => k.replace("b", "♭").replace("#", "♯") + " major";
const year = new Date().getFullYear();
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script>${abcjs}</script>
<style>
  @page { size: 8.5in 11in; margin: 0.6in 0.6in 0.7in 0.75in; }
  body { font-family: Nunito, sans-serif; color: #1d2433; margin: 0; }
  h1, h2, h3 { font-family: Fredoka, sans-serif; font-weight: 600; margin: 0; }
  .cover { height: 9.5in; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover h1 { font-size: 40pt; line-height: 1.1; }
  .cover .sub { font-size: 16pt; margin-top: 0.2in; color: #4a5568; }
  .cover .brand { margin-top: auto; font-family: Fredoka; font-size: 14pt; }
  .howto { page-break-after: always; font-size: 11.5pt; line-height: 1.5; }
  .howto h2 { font-size: 20pt; margin-bottom: 0.15in; }
  .howto .qrnote { display: flex; gap: 0.2in; align-items: center; background: #eef6f1; border-radius: 14px; padding: 0.15in 0.2in; margin-top: 0.2in; }
  .level { page-break-before: always; }
  .level h2 { font-size: 24pt; margin-bottom: 0.1in; }
  .ex { page-break-inside: avoid; margin: 0.15in 0 0.3in; }
  .exhead { display: flex; align-items: flex-end; gap: 0.15in; border-bottom: 1.5px solid #1d2433; padding-bottom: 4px; }
  .exhead h3 { font-size: 15pt; }
  .exhead .meta { color: #4a5568; font-size: 10pt; flex: 1; }
  .qr { display: flex; align-items: center; gap: 8px; font-size: 7.5pt; color: #4a5568; width: 2.2in; line-height: 1.25; }
  .qr svg { width: 0.8in; height: 0.8in; flex: none; }
  .score svg { width: 100%; }
</style></head><body>
<section class="cover">
  <h1>${TITLE}</h1>
  <div class="sub">${LEVELS.length === 1 ? `UIL-style Level ${LEVELS[0]}` : `UIL-style Levels ${LEVELS[0]} to ${LEVELS.at(-1)}`} · ${entries.length} exercises</div>
  <div class="sub">Every exercise written to the UIL choir sight-reading criteria for its level: keys, meters, rhythms, skips and cadences.</div>
  <div class="brand">abcSightReading</div>
</section>
<section class="howto">
  <h2>How to use this book</h2>
  <p>Each exercise is new music, written for sight-reading: read it once, the way you would at contest. The exercises in a level grow a little harder as you go.</p>
  <p>Give the key, the starting pitches and the tempo, then sing on solfège, numbers or a neutral syllable.</p>
  <div class="qrnote"><div id="qr-demo" class="qr" style="width:auto"></div><div><strong>Scan any exercise's code</strong> to open it on screen at abcSightReading: show it to the whole room, play it or any one part, add solfège or note names, and slow it down.</div></div>
</section>
${LEVELS.map((level) => `<section class="level"><h2>Level ${level}</h2>
${entries.filter((e) => e.level === level).map((e) => `<div class="ex">
  <div class="exhead"><h3>${e.n}.</h3><div class="meta">${keyName(e.key)} · ${e.meter}</div>
    <div class="qr" data-url="${BASE_URL}/b/${BOOK}/${e.n}"></div></div>
  <div class="score" id="s${e.n}"></div>
</div>`).join("\n")}
</section>`).join("\n")}
<script>
  const ex = ${JSON.stringify(entries.map((e) => ({ n: e.n, abc: e.abc })))};
  for (const e of ex) ABCJS.renderAbc("s" + e.n, e.abc, { staffwidth: 680, scale: 0.92, paddingtop: 6, paddingbottom: 6, add_classes: false });
  function qr(el, url, caption) {
    const q = qrcode(0, "M"); q.addData(url); q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }) + (caption ? "<span>" + caption + "</span>" : "");
  }
  for (const el of document.querySelectorAll(".exhead .qr")) qr(el, el.dataset.url, "Scan: show on screen, play any part, add solfège or note names");
  qr(document.getElementById("qr-demo"), "${BASE_URL}/b/${BOOK}/1", "");
  window.__ready = true;
</script>
</body></html>`;
mkdirSync("marketing/books", { recursive: true });
writeFileSync(`marketing/books/${BOOK}.html`, html);

const puppeteer = (await import(process.env.PUPPETEER ?? "/Users/blainecowen/Projects/abcSightreading/marketing/ad/node_modules/puppeteer-core")).default;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.goto("file://" + process.cwd() + `/marketing/books/${BOOK}.html`, { waitUntil: "networkidle0" });
await page.waitForFunction("window.__ready === true");
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: `marketing/books/${BOOK}.pdf`, format: "letter", printBackground: true, preferCSSPageSize: true,
  // The copyright and page number on every page, the way the site's scores carry it (src/lib/copyright.ts).
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:Nunito,sans-serif;font-size:8px;color:#718096;display:flex;justify-content:space-between;padding:0 0.75in 0 0.75in"><span>© ${year} abcSightReading · abc-sightreading.com</span><span class="pageNumber"></span></div>`,
});
await browser.close();
console.log(`${entries.length} exercises -> src/data/books/${BOOK}.json, marketing/books/${BOOK}.pdf`);
