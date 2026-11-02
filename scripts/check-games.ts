/**
 * The class games end to end (Games; src/lib/games/, docs/claude/games.md):
 * a director hosts on the big screen, students play on their own devices at
 * the room's live code.
 *
 *   APP=http://localhost:4472 bun run scripts/check-games.ts     # GAME=rhythm|tune|both (both)
 *
 * Needs a dev server on a local database (never the shared one) where the
 * teacher has Pro, as check-live.ts: COMP_EMAILS=live-teacher@example.test.
 * SHOTS=<dir> saves screenshots.
 *
 * Rhythm: four phone-sized devices, each with its clock set wrong (seconds
 * off) and its taps delayed as a TV's speakers and a phone's touch would
 * delay them (0, 120, 300 ms), tap along with the count-in and the rhythm,
 * dispatched at the moments the big screen's round says. Three tap it
 * exactly and must score 100; the fourth taps one note a sixteenth late
 * and must lose that beat. The board must have all four, best first.
 *
 * Catch the tune: three devices fill in the board the big screen played;
 * one gets a note wrong. The right ones score 100 or more (speed), the wrong
 * one less; the big screen reveals by itself when all have sent; and no
 * device is ever sent the tune before the results.
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";

const APP = process.env.APP ?? "http://localhost:4472";
const EMAIL = process.env.EMAIL ?? "live-teacher@example.test";
const PASSWORD = process.env.PASSWORD ?? "LiveTest!2026pw";
const GAME = process.env.GAME ?? "both";
const SHOTS = process.env.SHOTS ?? "";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const watch = (p: any, name: string) => {
  p.on("pageerror", (e: Error) => console.error(`${name} page error:`, e.message));
  p.on("console", (m: any) => {
    if (m.type() === "error" && !/favicon|soundfont|404/.test(m.text())) console.error(`${name} console:`, m.text().slice(0, 200));
  });
};

// ── The teacher, signed in, Live off ───────────────────────────────────────
const teacherCtx = await browser.createBrowserContext();
const teacher = await teacherCtx.newPage();
watch(teacher, "teacher");
await teacher.setViewport({ width: 1366, height: 900 });
await teacher.evaluateOnNewDocument(() => {
  for (const k of ["abc-welcome-v1", "abc-tour-unison-v1", "abc-tour-choral-v1"]) localStorage.setItem(k, "done");
});
// Solo play needs no account (and may run against a dev server on the shared database).
if (GAME !== "solo") await teacher.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
const signedIn = GAME === "solo" || await teacher.evaluate(async (email: string, password: string) => {
  const post = (path: string, body: object) =>
    fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let res = await post("/api/auth/sign-in/email", { email, password });
  if (!res.ok) res = await post("/api/auth/sign-up/email", { email, password, name: "Mr. Games" });
  return res.ok;
}, EMAIL, PASSWORD);
if (GAME !== "solo") check(signedIn, "the teacher signs in");
const code: string = GAME === "solo" ? "" : await teacher.evaluate(async () => {
  const { room } = await (await fetch("/api/live?make=1")).json();
  if (room?.live) await fetch(`/api/live/${room.code}`, { method: "DELETE" });
  return room.code;
});

/** A student's phone: its clock `skew` ms wrong. */
async function device(n: number, skew: number) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watch(page, `student ${n}`);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((skew: number) => {
    const real = Date.now;
    Date.now = () => real() + skew;
    // Every room state the device is sent, to check nothing gives the tune away.
    (window as any).__seen = [];
    const f = window.fetch;
    window.fetch = async (...args: any[]) => {
      const res = await f(...(args as [any, any]));
      if (String(args[0]).match(/^\/api\/live\/[0-9A-Z]{6}(\?|$)/)) res.clone().text().then((t) => (window as any).__seen.push(t));
      return res;
    };
  }, skew);
  await page.goto(`${APP}/live/${code}`, { waitUntil: "domcontentloaded" });
  return page;
}

async function openRoom(path: string) {
  await teacher.goto(`${APP}${path}?host=1`, { waitUntil: "networkidle2" });
  await teacher.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /Open my room/.test(b.textContent ?? "")) as HTMLButtonElement)?.click());
  return teacher.waitForSelector("[data-players]", { timeout: 20000 }).then(() => true).catch(() => false);
}
const players = () => teacher.$eval("[data-players]", (el: Element) => Number(el.getAttribute("data-players")));

// ── Rhythm ─────────────────────────────────────────────────────────────────
if (GAME === "rhythm" || GAME === "both") {
  check(await openRoom("/games/rhythm"), "rhythm: the big screen opens the room");
  const kids = [
    { skew: 3000, lag: 0, nudge: null as null | number },
    { skew: -2500, lag: 120, nudge: null },
    { skew: 700, lag: 300, nudge: null },
    { skew: 0, lag: 120, nudge: 3 },
  ];
  const pages = await Promise.all(kids.map((k, i) => device(i + 1, k.skew)));
  for (const [i, p] of pages.entries()) {
    check(await p.waitForSelector("[data-player-name]", { timeout: 20000 }).then(() => true).catch(() => false), `rhythm: device ${i + 1} joins the game`);
  }
  await teacher.waitForFunction((n: number) => Number(document.querySelector("[data-players]")?.getAttribute("data-players")) >= n, { timeout: 20000 }, kids.length).catch(() => null);
  check((await players()) === kids.length, `rhythm: the big screen counts ${kids.length} players (${await players()})`);
  if (SHOTS) await teacher.screenshot({ path: `${SHOTS}/games-rhythm-lobby.png` });

  await teacher.click("[data-game-start]");
  await teacher.waitForFunction(() => (window as any).__rhythmGame?.game?.phase === "playing", { timeout: 30000 });
  const round = await teacher.evaluate(() => {
    const g = (window as any).__rhythmGame;
    return { r: g.game.rhythm, notes: g.exercise.schedule.notes.map((n: any) => n.startUnits), beatUnits: g.exercise.beatUnits };
  });
  const beatMs = 60000 / round.r.bpm;
  const countBeats = (round.r.beatsPerBar === 2 ? 2 : 1) * round.r.beatsPerBar;
  const musicAt = round.r.at + countBeats * beatMs;
  const clicks = Array.from({ length: countBeats }, (_, k) => round.r.at + k * beatMs);
  const onsets = round.notes.map((u: number) => musicAt + (u * beatMs) / round.beatUnits);
  console.log(`  ${round.r.bars} bars of ${round.r.meter} at ${round.r.bpm}, ${onsets.length} notes`);

  // Each device taps on its own clock: the server's moment, through its own offset, plus its delay.
  await Promise.all(
    pages.map((p, i) =>
      p.evaluate(
        async (o: { times: number[]; lag: number }) => {
          const samples: { sent: number; server: number; received: number }[] = [];
          for (let k = 0; k < 5; k++) {
            const sent = Date.now();
            const { now } = await (await fetch("/api/live/time", { cache: "no-store" })).json();
            samples.push({ sent, server: now, received: Date.now() });
          }
          const best = samples.reduce((a, b) => (b.received - b.sent < a.received - a.sent ? b : a));
          const offset = best.server - (best.sent + (best.received - best.sent) / 2);
          await new Promise((r) => {
            const pad = document.querySelector("[data-game-pad]") ?? null;
            let left = o.times.length;
            for (const t of o.times) {
              setTimeout(() => {
                const el = document.querySelector("[data-game-pad]") ?? pad;
                el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
                el?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
                if (--left === 0) r(null);
              }, Math.max(0, t - offset + o.lag - Date.now()));
            }
          });
        },
        { times: [...clicks, ...onsets.map((x: number, n: number) => x + (kids[i].nudge === n ? beatMs / 4 : 0))], lag: kids[i].lag }
      )
    )
  );
  const scored = await teacher.waitForFunction(() => (window as any).__rhythmGame?.game?.phase === "results", { timeout: 30000 }).then(() => true).catch(() => false);
  check(scored, "rhythm: the big screen scores the round");
  const board = await teacher.evaluate(() => (window as any).__rhythmGame.board as { tag: string; name: string; points: number; last: number }[]);
  console.log(`  board: ${board.map((b) => `${b.name} ${b.last}`).join(", ")}`);
  const mine = await Promise.all(pages.map((p) => p.evaluate(() => document.querySelector("[data-player-name]")?.getAttribute("data-player-name"))));
  const pts = mine.map((name) => board.find((b) => b.name === name)?.last ?? -1);
  check(board.length === kids.length, `rhythm: every device is on the board (${board.length})`);
  for (const [i, k] of kids.entries()) {
    if (k.nudge === null) check(pts[i] === 100, `rhythm: device ${i + 1} (clock ${k.skew} ms off, ${k.lag} ms delay) tapped exactly: ${pts[i]}`);
    else check(pts[i] >= 0 && pts[i] < 100, `rhythm: device ${i + 1}, one note a sixteenth late, scores less: ${pts[i]}`);
  }
  check(board.every((b, i) => i === 0 || board[i - 1].points >= b.points), "rhythm: the board is best first");
  const shown = await pages[0].waitForFunction(() => !!document.querySelector("[data-my-points]"), { timeout: 15000 }).then(() => true).catch(() => false);
  check(shown, "rhythm: a device shows its points");
  if (SHOTS) {
    await teacher.screenshot({ path: `${SHOTS}/games-rhythm-results.png` });
    await pages[3].screenshot({ path: `${SHOTS}/games-rhythm-device.png` });
  }
  await teacher.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /End game/.test(b.textContent ?? "")) as HTMLButtonElement)?.click());
  for (const p of pages) await p.browserContext().close();
  // A device that leaves stays in the room's count for up to 40 s (Live's
  // DEVICE_WINDOW_MS); Catch the tune waits for every player counted.
  if (GAME === "both") await sleep(42_000);
}

// ── Catch the tune ─────────────────────────────────────────────────────────
if (GAME === "tune" || GAME === "both") {
  check(await openRoom("/games/catch-the-tune"), "tune: the big screen opens the room");
  const pages = await Promise.all([1, 2, 3].map((n) => device(n + 10, (n - 2) * 2000)));
  for (const [i, p] of pages.entries()) {
    check(await p.waitForSelector("[data-player-name]", { timeout: 20000 }).then(() => true).catch(() => false), `tune: device ${i + 1} joins the game`);
  }
  await teacher.waitForFunction((n: number) => Number(document.querySelector("[data-players]")?.getAttribute("data-players")) >= n, { timeout: 45000 }, pages.length).catch(() => null);
  await teacher.click("[data-game-start]");
  await teacher.waitForFunction(() => (window as any).__catchGame?.game?.phase === "answering", { timeout: 60000 });
  const tune: number[] = await teacher.evaluate(() => (window as any).__catchGame.hostTune);
  console.log(`  the tune: ${tune.join(" ")}`);
  for (const [i, p] of pages.entries()) {
    await p.waitForSelector("[data-game-send]", { timeout: 15000 });
    const answer = tune.map((s, c) => (i === 2 && c === 2 ? (tune.includes(s + 1) || s + 1 <= Math.max(...tune) ? s + 1 : s - 1) : s));
    for (let c = 1; c < answer.length; c++) {
      const sel = `[data-col="${c}"][data-step="${answer[c]}"]`;
      const ok = await p.$(sel);
      if (!ok) {
        // The wrong note is off the board: use any other row.
        const other = await p.$$eval(`[data-col="${c}"]`, (els: Element[], want: number) => els.map((e) => Number(e.getAttribute("data-step"))).find((x) => x !== want), tune[c]);
        await p.click(`[data-col="${c}"][data-step="${other}"]`);
      } else await p.click(sel);
    }
    await p.click("[data-game-send]");
  }
  const revealed = await teacher.waitForFunction(() => (window as any).__catchGame?.game?.phase === "results", { timeout: 20000 }).then(() => true).catch(() => false);
  check(revealed, "tune: the big screen reveals once everyone has sent");
  const board = await teacher.evaluate(() => (window as any).__catchGame.board as { name: string; last: number }[]);
  console.log(`  board: ${board.map((b) => `${b.name} ${b.last}`).join(", ")}`);
  const names = await Promise.all(pages.map((p) => p.evaluate(() => document.querySelector("[data-player-name]")?.getAttribute("data-player-name"))));
  const pts = names.map((n) => board.find((b) => b.name === n)?.last ?? -1);
  check(pts[0] >= 100 && pts[1] >= 100, `tune: the right answers score 100 or more (${pts[0]}, ${pts[1]})`);
  check(pts[2] >= 0 && pts[2] < 100, `tune: the wrong note costs (${pts[2]})`);
  for (const [i, p] of pages.entries()) {
    const seen: string[] = await p.evaluate(() => (window as any).__seen);
    const early = seen.filter((t) => /"phase":"(playing|answering|lobby)"/.test(t) && /"tune":\{[^}]*"tune":\[/.test(t));
    check(early.length === 0, `tune: device ${i + 1} was never sent the tune before the results (${seen.length} states)`);
  }
  const marked = await pages[2].waitForFunction(() => !!document.querySelector("[data-my-points]"), { timeout: 15000 }).then(() => true).catch(() => false);
  check(marked, "tune: a device shows its result");
  if (SHOTS) {
    await teacher.screenshot({ path: `${SHOTS}/games-tune-results.png` });
    await pages[2].screenshot({ path: `${SHOTS}/games-tune-device.png` });
  }
  await teacher.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /End game/.test(b.textContent ?? "")) as HTMLButtonElement)?.click());
  await sleep(1000);
}

// ── On one device (no account) ─────────────────────────────────────────────
if (GAME === "solo" || GAME === "both") {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  watch(p, "solo");
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`${APP}/games/rhythm`, { waitUntil: "networkidle2" });
  await p.evaluate(() => ([...document.querySelectorAll("button")].find((b) => /New rhythm/.test(b.textContent ?? "")) as HTMLButtonElement)?.click());
  await p.waitForSelector("[data-game-play]", { timeout: 30000 });
  await p.click("[data-game-play]");
  await p.waitForFunction(() => !!(window as any).__rhythmGame?.round, { timeout: 10000 });
  // Spacebar presses at the round's moments, 150 ms late throughout (this device's speakers).
  await p.evaluate(async () => {
    const g = (window as any).__rhythmGame;
    const r = g.round;
    const beat = 60000 / r.bpm;
    const count = (r.beatsPerBar === 2 ? 2 : 1) * r.beatsPerBar;
    const music = r.at + count * beat;
    const times = [
      ...Array.from({ length: count }, (_, k) => r.at + k * beat),
      ...g.exercise.schedule.notes.map((n: any) => music + (n.startUnits * beat) / g.exercise.beatUnits),
    ];
    await new Promise((done) => {
      let left = times.length;
      for (const t of times)
        setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
          window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
          if (--left === 0) done(null);
        }, Math.max(0, t + 150 - performance.now()));
    });
  });
  const solo = await p.waitForSelector("[data-solo-score]", { timeout: 15000 }).then((el) => el?.evaluate((e) => Number(e.getAttribute("data-solo-score")))).catch(() => null);
  check(solo === 100, `solo rhythm: the spacebar in time, 150 ms behind the speakers, scores 100 (${solo})`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/games-rhythm-solo.png` });

  await p.goto(`${APP}/games/catch-the-tune`, { waitUntil: "networkidle2" });
  const tune: number[] = await p.waitForFunction(() => (window as any).__catchGame?.tune, { timeout: 10000 }).then(() => p.evaluate(() => (window as any).__catchGame.tune));
  // Each note: a wrong tap first on note 2 (if there is another row), then the right ones.
  const wrong = await p.$$eval(`[data-col="1"]`, (els: Element[], want: number) => els.map((e) => Number(e.getAttribute("data-step"))).find((x) => x !== want), tune[1]);
  if (wrong !== undefined) await p.click(`[data-col="1"][data-step="${wrong}"]`);
  const said = await p.$eval(".said", (e: Element) => e.textContent ?? "");
  check(/Not that one/.test(said), `solo tune: a wrong note is told (${said.trim()})`);
  for (let c = 1; c < tune.length; c++) await p.click(`[data-col="${c}"][data-step="${tune[c]}"]`);
  const caught = await p.$eval(".said", (e: Element) => e.textContent ?? "");
  check(/caught the tune/.test(caught), `solo tune: caught (${caught.trim()})`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/games-tune-solo.png` });
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : "\nall clean");
process.exit(failures ? 1 : 0);
