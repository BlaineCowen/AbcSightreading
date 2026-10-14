import puppeteer, { type Page } from "puppeteer-core";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const APP = "http://localhost:4321";
const OUT = new URL("../stills/", import.meta.url).pathname;
await Bun.$`mkdir -p ${OUT}`;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"], protocolTimeout: 240000, defaultViewport: { width: 600, height: 1066, deviceScaleFactor: 3 } });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await p.evaluateOnNewDocument(() => { try { localStorage.setItem("theme", "light"); } catch {} });

async function clickText(page: Page, text: string) {
  const ok = await page.evaluate((text) => {
    const el = [...document.querySelectorAll<HTMLElement>("button")].find((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim().startsWith(text) && e.getBoundingClientRect().width > 0);
    el?.click(); return !!el;
  }, text);
  if (!ok) throw new Error("no button " + text);
}
/** Fixed things (playback bar, Tools, Feedback) hidden so nothing sits on the music. */
async function hideFixed(page: Page, hide = true) {
  await page.evaluate((hide) => {
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") { if (hide) { el.dataset.hid = "1"; el.style.visibility = "hidden"; } }
      if (!hide && el.dataset.hid) el.style.visibility = "";
    }
  }, hide);
}
/** The white card the score is drawn on: the svg's nearest rounded ancestor. */
async function card(page: Page) {
  const h = await page.evaluateHandle(() => {
    let el = [...document.querySelectorAll<SVGElement>(".focus-score svg")].find((s) => !s.closest(".score-tools") && s.getBoundingClientRect().width > 300)?.parentElement ?? null;
    while (el && parseFloat(getComputedStyle(el).borderTopLeftRadius) < 12) el = el.parentElement;
    return el;
  });
  return h.asElement() as any;
}
async function score(page: Page, file: string) {
  await page.waitForFunction(() => [...document.querySelectorAll(".focus-score svg")].some((s) => !s.closest(".score-tools") && s.getBoundingClientRect().width > 300 && s.querySelector(".abcjs-note")), { timeout: 20000 });
  await sleep(400);
  await hideFixed(page);
  const el = await card(page);
  if (!el) throw new Error("no score");
  await el.scrollIntoView();
  await sleep(300);
  await el.screenshot({ path: OUT + file });
}

/** Wraps the page's own abcjs (the same Vite module) so the ABC of every drawn tune is kept. */
async function tapAbc(page: Page) {
  await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => /\/abcjs\.js/.test(n));
    if (!url) throw new Error("abcjs module not found");
    const mod: any = await import(/* @vite-ignore */ url);
    const a = mod.default ?? mod;
    if (a.__tapped) return;
    const orig = a.renderAbc;
    a.renderAbc = function (el: any, abc: string, ...rest: any[]) {
      const host = typeof el === "string" ? document.getElementById(el) : el;
      if (typeof abc === "string" && /V:/.test(abc) && host?.closest?.(".focus-score") && host.getBoundingClientRect().width > 300) (window as any).__abc = abc;
      return orig.call(this, el, abc, ...rest);
    };
    a.__tapped = true;
  });
}
/** The last drawn exercise rendered by the app's synth (render-abc.ts) to a 16-bit WAV. */
async function audio(page: Page, file: string, bpm = 80) {
  const b64: string = await page.evaluate(async (bpm) => {
    const abc = (window as any).__abc as string;
    if (!abc) throw new Error("no abc");
    const { renderAbcBuffer } = await import(/* @vite-ignore */ "/src/lib/render-abc.ts");
    const ctx = ((window as any).__ctx ??= new AudioContext()); await ctx.resume();
    const buf: AudioBuffer = await renderAbcBuffer(ctx, abc, { bpm });
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o: number, t: string) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); out.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
    out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
    w(36, "data"); out.setUint32(40, n * ch * 2, true);
    const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
    let bin = ""; const u = new Uint8Array(out.buffer);
    for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(bin);
  }, bpm);
  await Bun.write(OUT + file, Buffer.from(b64, "base64"));
  await Bun.write(OUT + file.replace(/\.wav$/, ".abc"), await page.evaluate(() => (window as any).__abc));
  const shown = await page.evaluate(() => (document.querySelector(".focus-score svg title, .focus-score .abcjs-title")?.textContent ?? "").trim());
  const k = (await page.evaluate(() => (window as any).__abc as string)).match(/^K:(\S+)/m)?.[1];
  console.log(file, "shown:", shown, "abc K:", k);
}

/** Where each bar's system starts, in the card's own pixels (x3), from abcjs's bar numbers. */
async function barMap(page: Page) {
  return page.evaluate(() => {
    let el = [...document.querySelectorAll<SVGElement>(".focus-score svg")].find((s) => !s.closest(".score-tools") && s.getBoundingClientRect().width > 300)!.parentElement!;
    while (el && parseFloat(getComputedStyle(el).borderTopLeftRadius) < 12) el = el.parentElement!;
    const top = el.getBoundingClientRect().top;
    const nums = [...el.querySelectorAll("svg text")].map((t) => ({ t: (t.textContent ?? "").trim(), y: t.getBoundingClientRect().top - top, cls: t.getAttribute("class") ?? t.parentElement?.getAttribute("class") ?? "" }))
      .filter((n) => /^\d+$/.test(n.t) && /measure|bar/i.test(n.cls));
    const systems = [...el.querySelectorAll(".abcjs-staff")].map((s) => s.getBoundingClientRect().top - top);
    return { nums: nums.map((n) => [Number(n.t), Math.round(n.y * 3)]), systems: systems.map((y) => Math.round(y * 3)), sample: [...el.querySelectorAll("svg text")].slice(0, 12).map((t) => [t.textContent, t.getAttribute("class"), t.parentElement?.getAttribute("class")]) };
  });
}

const VOICINGS: [string, string][] = [["sa", "2 Part Treble"], ["tb", "2 Part Tenor/Bass"], ["ssa", "3 Part Treble"], ["sab", "3 Part Mixed"], ["ttb", "3 Part Tenor/Bass"], ["satb", "4 Part Mixed"]];
const only = process.argv[2];
if (!only || only === "voicings") {
  for (const [id, voicing] of VOICINGS) {
    await p.goto(`${APP}/choral-sightreading?voicing=${encodeURIComponent(voicing)}&uil=UIL%203&solfege=0`, { waitUntil: "load" });
    await sleep(2500);
    await tapAbc(p);
    await clickText(p, "New exercise");
    await score(p, `v-${id}.png`);
    await audio(p, `v-${id}.wav`);
  }
}
/** A full-length piece at a level: the Length popover before and after the tap, then the piece and its form. */
async function full(level: number, voicing: string, id: string) {
  await p.goto(`${APP}/choral-sightreading?voicing=${encodeURIComponent(voicing)}&uil=UIL%20${level}&solfege=0`, { waitUntil: "load" });
  await sleep(2500);
  await tapAbc(p);
  await clickText(p, "8 bars");
  await sleep(800);
  await p.screenshot({ path: OUT + `${id}-len-off.png` });
  await clickText(p, "Full length piece");
  await sleep(1000);
  await p.screenshot({ path: OUT + `${id}-len-on.png` });
  const form = await p.evaluate(() => [...document.querySelectorAll("ul.font-mono li")].map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim()));
  console.log(id, form);
  await p.keyboard.press("Escape");
  await sleep(600);
  await clickText(p, "New exercise");
  await score(p, `${id}.png`);
  const map = await barMap(p);
  await Bun.write(OUT + `${id}.json`, JSON.stringify({ form, ...map }, null, 1));
  await audio(p, `${id}.wav`);
}
if (!only || only === "full") {
  await full(2, "2 Part Treble", "full-l2");
  await full(5, "4 Part Mixed", "full-l5");
}
await b.close();
