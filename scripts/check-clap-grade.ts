/**
 * Grading a clapped rhythm, end to end, against claps whose every time is known.
 *
 *   bun run scripts/check-clap-grade.ts                  # one person, the microphone, Standard
 *   WHO=class bun run scripts/check-clap-grade.ts        # a class: each clap 20 people, ragged
 *   INPUT=keys bun run scripts/check-clap-grade.ts       # the spacebar and the pad
 *   ECHO=1 CLICK=beat bun run scripts/check-clap-grade.ts  # the page's click heard back by the microphone
 *   MEASURE=1 bun run scripts/check-clap-grade.ts        # the microphone's delay (sets no latency)
 *
 * Also STRICT=easy|standard|strict, SHOTS=<png>.
 *
 * Needs the dev server (bun run dev); Chrome through puppeteer-core
 * (marketing/ad's copy); the account answered as Pro. The microphone is a
 * MediaStream the script plays noise-burst claps into, so the clap listener
 * hears it exactly as a microphone. Faults are planted: one note clapped 0.35
 * beats late, one not clapped, one clapped twice, one stray clap (in a rest,
 * or inside a held note). Grade must find exactly those. With the spacebar
 * and pad, the taps alternate between them.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";
import { STRICTNESS, gradeSchedule } from "../src/lib/grade";

const APP = process.env.APP ?? "http://localhost:4321";
const STRICT = (process.env.STRICT ?? "standard") as "easy" | "standard" | "strict";
const WHO = (process.env.WHO ?? "solo") as "solo" | "class";
const INPUT = (process.env.INPUT ?? "mic") as "mic" | "keys";
const CLICK = process.env.CLICK ?? "off";
const ECHO = !!process.env.ECHO;
const MEASURE = !!process.env.MEASURE;
// Inside what the strictness still counts as this note (three windows): Strict's
// is 0.375 beats, and 0.35 plus a tap's dispatch delay landed past it.
const LATE_BEATS = Math.min(0.35, 2.4 * STRICTNESS[STRICT].onsetBeats);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 1000 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text().slice(0, 300)); });

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

await page.evaluateOnNewDocument(() => {
  const ctx = new AudioContext();
  const room = ctx.createGain();
  navigator.mediaDevices.getUserMedia = async () => {
    await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    room.connect(dest);
    return dest.stream;
  };
  // A clap: 60 ms of noise, ringing out over about 8 ms.
  const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.06), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / ctx.sampleRate / 0.008);
  (window as any).__clap = (claps: { at: number; amp: number }[]) => {
    const offset = ctx.currentTime - performance.now() / 1000;
    for (const c of claps) {
      const t = c.at / 1000 + offset;
      if (t < ctx.currentTime) continue;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const g = ctx.createGain();
      g.gain.value = c.amp;
      src.connect(g).connect(room);
      src.start(t);
    }
  };
  // Taps, alternating the spacebar and the pad, each dispatched at its time.
  (window as any).__tap = (times: number[]) => {
    times.forEach((at, k) =>
      setTimeout(() => {
        if (k % 2 === 0) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
        } else {
          const pad = document.querySelector('[aria-label="Tap"]');
          pad?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
        }
      }, at - performance.now()),
    );
  };
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
  rhythmOnly: "true", rhythms: process.env.RHYTHMS ?? "quarter,half,quarterRest", timeSignature: "4/4", measures: "4", bpm: "90",
});
await page.evaluateOnNewDocument(
  (s) => localStorage.setItem("abc-tuner-settings", s),
  JSON.stringify({ gradeStrictness: STRICT, gradeCursor: "beat", gradeClapClick: CLICK, gradeClapInput: INPUT, gradeWho: WHO, ...(MEASURE ? { clapLatencyMs: 0 } : {}) }),
);
await page.goto(`${APP}/sightreading?${params}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await page.click('[aria-label="Generate a new exercise"]');
await page.waitForFunction(() => !!(window as any).__gradeDebug?.abc(), { timeout: 20000 });
const info = await page.evaluate(() => ({ abc: (window as any).__gradeDebug.abc() as string, tempo: (window as any).__gradeDebug.tempo() as number }));
const sched = gradeSchedule(info.abc);
const beatMs = 60_000 / info.tempo;
const unitMs = beatMs / 8;
const n = sched.notes.length;
console.log(`${n} notes, ${sched.rests.length} rests at ${info.tempo} BPM; ${INPUT}, ${WHO}, ${STRICT}, click ${CLICK}${ECHO ? ", echo" : ""}`);

// The faults, apart from each other.
// The late one on a note a beat or more before the next: 0.35 beats late on an
// eighth is nearer the next note than its own, which no grader can tell apart.
const roomy = (i: number) => i < n - 1 && sched.notes[i + 1].startUnits - sched.notes[i].startUnits >= 8;
// The doubled one likewise (its second clap 0.18 beats on must stay nearer it than the next note); none next to another.
const picks: number[] = [];
// Every note from the third on: a busy start can have no roomy note among the first dozen.
for (let i = 2; i < n - 1; i++) if (roomy(i) && picks.every((p) => Math.abs(p - i) > 1)) picks.push(i);
const LATE = picks[0] ?? Math.min(2, n - 1);
// A room's second clap comes half a beat on, so its note needs two beats clear.
const DOUBLE = picks.slice(1).find((i) => WHO !== "class" || (i < n - 1 && sched.notes[i + 1].startUnits - sched.notes[i].startUnits >= 16)) ?? picks[1] ?? Math.min(6, n - 1);
const MISS = [...Array(n).keys()].slice(1).find((i) => Math.abs(i - LATE) > 1 && Math.abs(i - DOUBLE) > 1) ?? Math.min(4, n - 1);
// Two beats clear of the note left out, which on Easy would otherwise take the stray as itself, clapped late.
const clear = (u: number) => Math.abs(u - sched.notes[MISS].startUnits) >= 16;
const rest = sched.rests.find((r) => r.startUnits > 0 && clear(r.startUnits + 4));
const held = sched.notes.find((x, i) => x.lengthUnits >= 16 && ![LATE, MISS, DOUBLE].includes(i) && clear(x.startUnits + 4));
// Off the beat (an eighth in), never on a click: one quiet clap exactly on the click is indistinguishable from its echo.
const strayUnits = rest ? rest.startUnits + 4 : held ? held.startUnits + 4 : null;

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Clap and grade/.test(x.textContent ?? ""));
  (b as HTMLButtonElement | undefined)?.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".grade-dock button")].find((x) => (x.textContent ?? "").trim() === "Start");
  (b as HTMLButtonElement | undefined)?.click();
});
const one = await page.waitForFunction(() => (window as any).__countIn.find((w: any) => w.word === "1")?.at, { timeout: 15000 });
const t0 = ((await one.jsonValue()) as number) + 4 * beatMs;

// What is clapped, on the page's clock.
const times: number[] = [];
sched.notes.forEach((note, i) => {
  if (i === MISS) return;
  const at = t0 + note.startUnits * unitMs + (i === LATE ? LATE_BEATS * beatMs : 0);
  times.push(at);
  // One person's flam; a room's second clap half a beat on (a room's claps are tens of ms wide, so closer ones merge).
  if (i === DOUBLE) times.push(at + (WHO === "class" ? 0.5 : 0.18) * beatMs);
});
if (strayUnits !== null) times.push(t0 + strayUnits * unitMs);
times.sort((a, b) => a - b);

if (INPUT === "keys") {
  await page.waitForSelector('[aria-label="Tap"]', { timeout: 10000 });
  await page.evaluate((t) => (window as any).__tap(t), times);
} else {
  const claps: { at: number; amp: number }[] = [];
  if (WHO === "class") {
    // Twenty people a clap, each up to 35 ms either side; the lone stray is one of them.
    const strayAt = strayUnits !== null ? t0 + strayUnits * unitMs : null;
    for (const at of times) {
      if (at === strayAt) claps.push({ at, amp: 0.25 });
      else for (let k = 0; k < 20; k++) claps.push({ at: at + (Math.random() * 70 - 35), amp: 0.25 });
    }
  } else for (const at of times) claps.push({ at, amp: 0.6 });
  // The page's click heard back: every count-in beat and, with the click on, every beat after.
  if (ECHO) {
    const end = t0 + sched.totalUnits * unitMs;
    for (let k = -4; t0 + k * beatMs <= end; k++) if (k < 0 || CLICK !== "off") claps.push({ at: t0 + k * beatMs + 5, amp: 0.15 });
  }
  await page.evaluate((c) => (window as any).__clap(c), claps);
}

await page.waitForFunction(() => (window as any).__gradeDebug.view().phase === "results", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 600));
if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS });
const out = await page.evaluate(() => ({
  dock: document.querySelector(".grade-dock")?.textContent?.replace(/\s+/g, " ").trim(),
  marks: document.querySelectorAll(".grade-overlay path").length,
  view: (window as any).__gradeDebug.view(),
}));
const r = out.view.claps;
if (!r) throw new Error("no result: " + JSON.stringify(out.view).slice(0, 300));
console.log("strip:", out.dock);
console.log(`rhythm ${r.rhythm}% ${r.letter}; strays ${r.strays.map((s: any) => `${(s.units / 8).toFixed(2)}b w${s.weight.toFixed(2)}`).join(", ") || "none"}${r.together !== undefined ? `; together ${r.together} ms` : ""}; marks drawn ${out.marks}`);
let failures = 0;
const expect = (ok: boolean, what: string) => { if (!ok) { failures++; console.log("  FAIL:", what); } };
const errs: number[] = [];
r.notes.forEach((x: any, i: number) => {
  console.log(`  ${String(i + 1).padStart(2)} rhythm ${String(x.rhythm).padStart(3)} onset ${x.onsetBeats === null ? "  -  " : (x.onsetBeats * beatMs).toFixed(0).padStart(4) + "ms"}${x.missed ? " missed" : ""}`);
  if (i === MISS) expect(x.missed, `note ${i + 1} should be missed`);
  else if (i === LATE) expect(x.onsetBeats !== null && Math.abs(x.onsetBeats - LATE_BEATS) < 0.1 && (LATE_BEATS <= STRICTNESS[STRICT].onsetBeats ? x.rhythm === 100 : x.rhythm < 100), `note ${i + 1} should be about ${LATE_BEATS} late`);
  else {
    expect(!x.missed && (MEASURE || x.rhythm >= 90), `note ${i + 1} should be clean`);
    if (x.onsetBeats !== null) errs.push(x.onsetBeats * beatMs);
  }
});
const wantStrays = 1 + (strayUnits !== null ? 1 : 0);
if (WHO === "class") {
  // The double clap is the whole room (a whole stray); the lone one a fraction.
  expect(r.strays.length === wantStrays, `${wantStrays} strays, got ${r.strays.length}`);
  const lone = strayUnits !== null ? r.strays.find((s: any) => Math.abs(s.units - strayUnits) < 2) : null;
  if (strayUnits !== null) expect(!!lone && lone.weight < 0.6, `the lone stray should count a fraction (${lone?.weight?.toFixed(2)})`);
} else expect(r.strays.length === wantStrays, `${wantStrays} strays, got ${r.strays.length}`);
errs.sort((a, b) => a - b);
console.log(`clean claps vs written: median ${errs[errs.length >> 1]?.toFixed(0)} ms, range ${errs[0]?.toFixed(0)}..${errs[errs.length - 1]?.toFixed(0)}${MEASURE ? " (no latency set: this is the microphone's delay)" : ""}`);
console.log(`planted: note ${LATE + 1} ${LATE_BEATS} beats late, note ${MISS + 1} not clapped, note ${DOUBLE + 1} clapped twice${strayUnits !== null ? `, a stray at beat ${(strayUnits / 8).toFixed(2)}` : ""}`);
if (failures && process.env.DUMP) {
  const blocks = await page.evaluate(() => (window as any).__gradeDebug.clapBlocks());
  const at = t0 + sched.notes[LATE].startUnits * unitMs + LATE_BEATS * beatMs + 45;
  console.log("blocks around the late clap (ms from it: hi dB / full dB):");
  console.log(blocks.filter((b: any) => Math.abs(b.t - at) < 120).map((b: any) => `${(b.t - at).toFixed(0)}:${(10 * Math.log10(b.hi + 1e-12)).toFixed(0)}/${(10 * Math.log10(b.full + 1e-12)).toFixed(0)}`).join(" "));
  const { detectClaps } = await import("../src/lib/clap-detect");
  console.log("late note at beat", sched.notes[LATE].startUnits / 8, "neighbours", sched.notes[LATE - 1]?.startUnits / 8, sched.notes[LATE + 1]?.startUnits / 8, "strays (beats)", r.strays.map((s: any) => (s.units / 8).toFixed(3)).join(" "), "lag", r.lagMs, "forgiven", r.lagForgiven);
  console.log("detected near it:", detectClaps(blocks).filter((c) => Math.abs(c.t - at) < 400).map((c) => (c.t - at).toFixed(0)).join(" "));
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
