/**
 * Grade, end to end, against a singer whose every note is known.
 *
 *   bun run scripts/check-grade.ts                 # Pitch & rhythm, Standard
 *   MODE=pitch STRICT=easy bun run scripts/check-grade.ts
 *   CURSOR=note CLICK=sub bun run scripts/check-grade.ts
 *   RHYTHMS=quarter,half,quarterRest,halfRest bun run scripts/check-grade.ts
 *
 * Also: SHOTS=<png> a screenshot of the result; SAVE=<dir> press "Save this
 * run" and keep its files; LAYOUT=1 print the notes and rests; PROBE=1 what
 * the tuner hears during the run; NO_RECORD=1 run without the review recording.
 *
 * Needs the dev server (bun run dev). Chrome is driven by puppeteer-core
 * (marketing/ad's copy); the account is answered as Pro; the microphone is
 * replaced by a synthesized voice (a sawtooth through a low-pass, a little
 * vibrato) played into a MediaStream, so the tuner engine hears it exactly as
 * it hears a microphone. The singer sings the exercise in time from the
 * count-in, with faults planted: one note a whole step high, one late, one
 * left out. The check is that Grade finds those and nothing else, and it
 * reports where the clean notes' onsets landed (the detector's delay, for
 * DETECT_LATENCY_MS).
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";
import { gradeSchedule } from "../src/lib/grade";

const APP = process.env.APP ?? "http://localhost:4321";
const MODE = (process.env.MODE ?? "performance") as "pitch" | "performance";
const STRICT = (process.env.STRICT ?? "standard") as "easy" | "standard" | "strict";
const CURSOR = process.env.CURSOR ?? "smooth";
const CLICK = process.env.CLICK ?? "beat";
const LATE_BEATS = 0.35;
const SHOTS = process.env.SHOTS ?? "";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 1000 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.error("console:", m.text().slice(0, 300)); });

// Pro, signed in.
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = new URL(req.url());
  const json = (body: unknown) => req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname === "/api/auth/get-session")
    return json({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "grade@test.local", name: "Grade", accountType: "standard", emailVerified: true } });
  if (url.pathname === "/api/billing") return json({ plan: "pro", billingEnabled: true, subscription: null });
  if (url.pathname.startsWith("/api/usage")) return json({ allowed: true, plan: "pro", limit: null, remaining: null });
  if (url.pathname === "/api/presets" || url.pathname === "/api/classes") return json([]);
  if (url.pathname === "/api/preferences") return json({});
  return req.continue();
});

if (process.env.NO_RECORD) await page.evaluateOnNewDocument(() => { (window as any).MediaRecorder = undefined; });
// The singer: the microphone is a MediaStream we play notes into.
await page.evaluateOnNewDocument(() => {
  const ctx = new AudioContext();
  // The voice, into which every note plays; each microphone stream is a new
  // destination fed from it.
  const voice = ctx.createGain();
  // Each call its own stream, as a real microphone gives (Grade records a
  // second one on the dev server; stopping it must not stop the tuner's).
  navigator.mediaDevices.getUserMedia = async () => {
    await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    voice.connect(dest);
    return dest.stream;
  };
  (window as any).__sing = (notes: { midi: number; at: number; ms: number }[]) => {
    const offset = ctx.currentTime - performance.now() / 1000;
    for (const n of notes) {
      const t = n.at / 1000 + offset;
      if (t < ctx.currentTime) continue;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const depth = ctx.createGain();
      depth.gain.value = osc.frequency.value * 0.004;
      vib.connect(depth).connect(osc.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.02);
      g.gain.setValueAtTime(0.25, t + n.ms / 1000 - 0.04);
      g.gain.linearRampToValueAtTime(0, t + n.ms / 1000 - 0.01);
      osc.connect(lp).connect(g).connect(voice);
      osc.start(t);
      vib.start(t);
      osc.stop(t + n.ms / 1000);
      vib.stop(t + n.ms / 1000);
    }
  };
  // The count-in words as they show, on the page's clock (as capture/lib.ts watches them).
  const log: { word: string | null; at: number }[] = ((window as any).__countIn = []);
  let last: string | null = null;
  const tick = () => {
    const el = [...document.querySelectorAll('[aria-live="assertive"]')].find((e) => /^(\d+|Ready|Go)$/.test((e.textContent ?? "").trim()));
    const word = el ? (el.textContent ?? "").trim() : null;
    if (word !== last) {
      log.push({ word, at: performance.now() });
      last = word;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const params = new URLSearchParams({
  clef: "treble", range: "14-21", key: "G", scaleDegrees: "1,2,3,4,5", rhythms: process.env.RHYTHMS ?? "quarter,half",
  timeSignature: "4/4", measures: "4", maxSkip: "2", bpm: "90", showSolfege: "true", rhythmOnly: "false",
});
await page.evaluateOnNewDocument(
  (s) => localStorage.setItem("abc-tuner-settings", s),
  JSON.stringify({ gradeMode: MODE, gradeStrictness: STRICT, gradeCursor: CURSOR, gradeClick: CLICK, gradeReference: process.env.REF ?? "note" }),
);
await page.goto(`${APP}/sightreading?${params}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await page.click('[aria-label="Generate a new exercise"]');
try {
  await page.waitForFunction(() => !!(window as any).__gradeDebug?.abc(), { timeout: 20000 });
} catch {
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  await page.screenshot({ path: "/tmp/check-grade-fail.png" });
  throw new Error("no exercise was generated; the page says:\n" + text);
}

const info = await page.evaluate(() => {
  const d = (window as any).__gradeDebug;
  return { abc: d.abc() as string, transpose: d.transpose() as number, tempo: d.tempo() as number };
});
const sched = gradeSchedule(info.abc, info.transpose);
const beatMs = 60_000 / info.tempo;
console.log(`${sched.notes.length} notes at ${info.tempo} BPM, mode ${MODE}, ${STRICT}, cursor ${CURSOR}, click ${CLICK}`);
if (process.env.LAYOUT) {
  console.log("notes (beat, length):", sched.notes.map((n, i) => `${i + 1}:${n.startUnits / 8}+${n.lengthUnits / 8}`).join(" "));
  console.log("rests (beat, length):", sched.rests.map((r) => `${r.startUnits / 8}+${r.lengthUnits / 8}`).join(" "));
}

// The planted faults: well inside the exercise, apart from each other.
const n = sched.notes.length;
const WRONG = Math.min(2, n - 1), LATE = Math.min(4, n - 1), SKIP = Math.min(6, n - 1);

// Open Grade and set it up (the settings came from localStorage).
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Listen and grade/.test(x.textContent ?? ""));
  (b as HTMLButtonElement | undefined)?.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".grade-dock button")].find((x) => (x.textContent ?? "").trim() === "Start");
  (b as HTMLButtonElement | undefined)?.click();
});

// Pitch only is untimed: the singer answers each note as it comes up.
if (MODE === "pitch") {
  await page.waitForFunction(() => (window as any).__gradeDebug.view().phase === "sing", { timeout: 15000 });
  for (let i = 0; i < sched.notes.length; i++) {
    await page.waitForFunction((k) => { const v = (window as any).__gradeDebug.view(); return v.index === k || v.phase === "results"; }, { timeout: 15000 }, i);
    const now = await page.evaluate(() => performance.now());
    const midi = sched.notes[i].midi;
    if (i === SKIP) {
      await new Promise((r) => setTimeout(r, 700));
      await page.evaluate(() => (window as any).__gradeDebugSkip?.());
      continue;
    }
    // A wrong first try: a step high for half a second, then the note.
    const plan = i === WRONG
      ? [{ midi: midi + 2, at: now + 250, ms: 550 }, { midi, at: now + 900, ms: 700 }]
      : [{ midi, at: now + 250, ms: 700 }];
    await page.evaluate((p) => (window as any).__sing(p), plan);
    await page.waitForFunction((k) => { const v = (window as any).__gradeDebug.view(); return v.index !== k || v.phase === "results"; }, { timeout: 15000 }, i);
  }
  await page.waitForFunction(() => (window as any).__gradeDebug.view().phase === "results", { timeout: 15000 });
  const r = (await page.evaluate(() => (window as any).__gradeDebug.view())).result;
  let failures = 0;
  r.notes.forEach((x: any, i: number) => {
    const want = i === WRONG ? "corrected" : i === SKIP ? "skipped" : "first";
    const ok = x.outcome === want && (i !== WRONG || Math.abs(x.firstTry - (sched.notes[i].midi + 2)) < 0.5);
    console.log(`  ${String(i + 1).padStart(2)} ${x.outcome.padEnd(9)} score ${x.score}${x.firstTry !== null ? ` first try ${x.firstTry.toFixed(2)}` : ""}${ok ? "" : `  FAIL (wanted ${want})`}`);
    if (!ok) failures++;
  });
  console.log(`pitch ${r.score}% ${r.letter}`);
  console.log(failures ? `${failures} check(s) failed` : "all checks passed");
  await browser.close();
  process.exit(0);
}

// The count-in's "1": the first downbeat is four beats later (4/4).
const one = await page.waitForFunction(() => (window as any).__countIn.find((w: any) => w.word === "1")?.at, { timeout: 15000 });
const t1 = (await one.jsonValue()) as number;
const t0 = t1 + 4 * beatMs;
const unitMs = beatMs / 8;
const plan = sched.notes
  .map((note, i) => {
    if (i === SKIP) return null;
    let at = t0 + note.startUnits * unitMs;
    let ms = note.lengthUnits * unitMs;
    if (i === LATE) { at += LATE_BEATS * beatMs; ms -= LATE_BEATS * beatMs; }
    if (i === LATE - 1) ms += 0; // the note before simply ends; the gap is the lateness
    return { midi: note.midi + (i === WRONG ? 2 : 0), at, ms };
  })
  .filter(Boolean);
await page.evaluate((p) => (window as any).__sing(p), plan);
if (process.env.PROBE) {
  for (let k = 0; k < 6; k++) {
    await new Promise((r) => setTimeout(r, 700));
    console.log("probe:", JSON.stringify(await page.evaluate(() => { const d = (window as any).__gradeDebug; const v = d.view(); return { phase: v.phase, sung: v.sung, i: v.index, mic: d.mic(), now: performance.now() }; })), "t0", t0.toFixed(0), "first note at", (plan[0] as any)?.at?.toFixed(0));
  }
}

const end = t0 + (sched.totalUnits * unitMs) + 3000;
const waitMs = end - (await page.evaluate(() => performance.now()));
await new Promise((r) => setTimeout(r, Math.max(0, waitMs) + (MODE === "pitch" ? 6000 : 1500)));
if (SHOTS) await page.screenshot({ path: SHOTS, fullPage: false });
// SAVE=<dir>: press "Save this run" and keep the two files there.
if (process.env.SAVE) {
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: process.env.SAVE });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".grade-dock button")].find((x) => (x.textContent ?? "").trim() === "Save this run");
    (b as HTMLButtonElement | undefined)?.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
}

const out = await page.evaluate(() => {
  const dock = document.querySelector(".grade-dock")?.textContent?.replace(/\s+/g, " ").trim();
  const trace = document.querySelectorAll(".grade-overlay polyline").length;
  const marks = document.querySelectorAll(".grade-overlay path, .grade-overlay line").length;
  return { dock, trace, marks, view: (window as any).__gradeDebug.view() };
});
console.log("strip:", out.dock);
console.log("drawn: trace segments", out.trace, "marks", out.marks);
const v = out.view;
let failures = 0;
const expect = (ok: boolean, what: string) => { if (!ok) { failures++; console.log("  FAIL:", what); } };
if (MODE === "performance") {
  const p = v.perf;
  if (!p) throw new Error("no result: " + JSON.stringify(v).slice(0, 300));
  console.log(`pitch ${p.pitch}%  rhythm ${p.rhythm}%  ${p.letter}`);
  p.notes.forEach((r: any, i: number) =>
    console.log(`  ${String(i + 1).padStart(2)} midi ${r.midi} sung ${r.sung?.toFixed(2) ?? "-"} cents ${r.cents ?? "-"} pitch ${r.pitch} rhythm ${r.rhythm} onset ${r.onsetBeats?.toFixed(3) ?? "-"}${r.cutShort ? " short" : ""}${r.missed ? " missed" : ""}`));
  p.notes.forEach((r: any, i: number) => {
    if (i === WRONG) expect(!r.pitchOk && Math.abs((r.sung ?? 0) - (r.midi + 2)) < 0.5, `note ${i + 1} should be heard a step high`);
    else if (i === SKIP) expect(r.missed, `note ${i + 1} should be missed`);
    else if (i === LATE) expect(r.onsetBeats !== null && Math.abs(r.onsetBeats - LATE_BEATS) < 0.12 && r.rhythm < 100, `note ${i + 1} should be about ${LATE_BEATS} late`);
    else expect(r.pitchOk && r.rhythm >= 90, `note ${i + 1} should be clean (pitch ${r.pitch}, rhythm ${r.rhythm})`);
  });
  const clean = p.notes.filter((_: any, i: number) => ![WRONG, LATE, SKIP].includes(i) && _.onsetBeats !== null).map((r: any) => r.onsetBeats * beatMs);
  clean.sort((a: number, b: number) => a - b);
  console.log(`clean onsets vs written: median ${clean[clean.length >> 1]?.toFixed(0)} ms (after DETECT_LATENCY_MS), range ${clean[0]?.toFixed(0)}..${clean[clean.length - 1]?.toFixed(0)}`);
} else {
  const r = v.result;
  if (!r) throw new Error("no result: " + JSON.stringify(v).slice(0, 300));
  console.log(`pitch ${r.score}% ${r.letter}`);
  r.notes.forEach((x: any, i: number) => console.log(`  ${String(i + 1).padStart(2)} midi ${x.midi} score ${x.score} find ${x.findBeats?.toFixed(2) ?? "-"} cents ${x.cents ?? "-"}${x.missed ? " missed" : x.skipped ? " skipped" : ""}`));
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
await browser.close();
console.log(`planted: note ${WRONG + 1} a whole step high, note ${LATE + 1} ${LATE_BEATS} beats late, note ${SKIP + 1} not sung`);
