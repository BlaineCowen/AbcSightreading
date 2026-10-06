/**
 * What sits on top of what: every pair of floating elements (fixed or
 * sticky, visible) whose boxes overlap, on each page at desktop, tablet and
 * phone sizes, and in the states that add floating things (Grade open, the
 * Tools wheel open). For each overlap, which one is on top at its middle.
 * Needs the dev server; Pro is answered.
 *
 *   bun run scripts/check-overlaps.ts
 */
import puppeteer from "../marketing/ad/node_modules/puppeteer-core";
const APP = process.env.APP ?? "http://localhost:4321";
const SIZES = [
  { name: "4k", w: 3840, h: 2160 }, { name: "1440p", w: 2560, h: 1440 },
  { name: "desktop", w: 1440, h: 900 }, { name: "tablet", w: 820, h: 1180 }, { name: "phone", w: 390, h: 844 },
].filter((s) => !process.env.SIZES || process.env.SIZES.split(",").includes(s.name));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
type Case = { page: string; state: string; setup?: (p: any) => Promise<void> };
const gen = async (p: any) => { await p.click('[aria-label="Generate a new exercise"]').catch(() => {}); await sleep(2500); };
const press = (p: any, re: RegExp) => p.evaluate((s: string, f: string) => { const x = [...document.querySelectorAll("button")].find((e) => new RegExp(s, f).test((e.textContent ?? "").trim())); (x as HTMLButtonElement)?.click(); }, re.source, re.flags);
const CASES: Case[] = [
  { page: "/", state: "home" },
  { page: "/pricing", state: "pricing" },
  { page: "/sightreading?rhythmOnly=false", state: "unison", setup: gen },
  { page: "/sightreading?rhythmOnly=false", state: "unison + Grade strip", setup: async (p) => { await gen(p); await press(p, /Listen and grade/); await sleep(800); await press(p, /^Cancel$/); await sleep(500); } },
  { page: "/sightreading?rhythmOnly=false", state: "unison + Tools open", setup: async (p) => { await gen(p); await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find((e) => /^Tools$/.test((e.textContent ?? "").trim())); (x as HTMLButtonElement)?.click(); }); await sleep(800); } },
  { page: "/sightreading?rhythmOnly=true", state: "rhythm", setup: gen },
  // A clapped run on the spacebar and pad: the strip and the pad, mid-run; then the results, put away to the strip.
  { page: "/sightreading?rhythmOnly=true&bpm=200&measures=2", state: "clap run (pad)", setup: async (p) => {
    await p.evaluate(() => localStorage.setItem("abc-tuner-settings", JSON.stringify({ gradeClapInput: "keys", gradeWho: "solo" })));
    await p.reload({ waitUntil: "networkidle2" }); await sleep(1000); await gen(p);
    await press(p, /Clap and grade/); await sleep(800); await press(p, /^Start$/); await sleep(2200);
  } },
  { page: "/sightreading?rhythmOnly=true&bpm=200&measures=2", state: "clap results strip", setup: async (p) => {
    await p.evaluate(() => localStorage.setItem("abc-tuner-settings", JSON.stringify({ gradeClapInput: "keys", gradeWho: "solo" })));
    await p.reload({ waitUntil: "networkidle2" }); await sleep(1000); await gen(p);
    await press(p, /Clap and grade/); await sleep(800); await press(p, /^Start$/); await sleep(7000);
    await press(p, /^See it on the music$/); await sleep(600);
  } },
  { page: "/choral-sightreading", state: "choral", setup: gen },
  { page: "/tuner", state: "tuner" },
];
for (const size of SIZES) {
  for (const c of CASES) {
    const p = await b.newPage();
    await p.setViewport({ width: size.w, height: size.h });
    await p.setRequestInterception(true);
    p.on("request", (req: any) => {
      const u = new URL(req.url());
      const j = (x: unknown) => req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
      if (u.pathname === "/api/auth/get-session") return j({ session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "z@t.l", name: "Z", accountType: "standard", emailVerified: true } });
      if (u.pathname === "/api/billing") return j({ plan: "pro", billingEnabled: true, subscription: null });
      if (u.pathname.startsWith("/api/usage")) return j({ allowed: true, plan: "pro", limit: null, remaining: null });
      if (u.pathname === "/api/presets" || u.pathname === "/api/classes") return j([]);
      return req.continue();
    });
    try {
      if (process.env.LIST) await p.evaluateOnNewDocument(() => { (window as any).__listFloating = true; });
      await p.goto(APP + c.page, { waitUntil: "networkidle2", timeout: 30000 });
      await sleep(1200);
      if (c.setup) await c.setup(p);
      const found: string[] = await p.evaluate(() => {
        const name = (e: Element) => {
          const h = e as HTMLElement;
          const label = h.getAttribute("aria-label") || h.id || (h.className && typeof h.className === "string" ? h.className.split(" ").filter((x) => !/^(flex|items|justify|gap|p[xytrbl]?-|m[xytrbl]?-|w-|h-|bg-|text-|rounded|shadow|border|z-|fixed|absolute|sticky|inset|left|right|top|bottom|max-|min-|sm:|md:|lg:|xl:|2xl:)/.test(x)).slice(0, 2).join(".") : "");
          return `${h.tagName.toLowerCase()}${label ? `[${label.slice(0, 40)}]` : ""}`;
        };
        const floating = [...document.querySelectorAll("body *")].filter((e) => {
          const s = getComputedStyle(e);
          if (s.position !== "fixed" && s.position !== "sticky") return false;
          if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
          const r = e.getBoundingClientRect();
          if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
          // An inset-0 veil or full-screen layer is meant to cover everything.
          if (r.width >= innerWidth - 2 && r.height >= innerHeight - 2) return false;
          // Only the outermost floating element of a nest.
          let up = e.parentElement;
          while (up) { const ps = getComputedStyle(up).position; if (ps === "fixed" || ps === "sticky") return false; up = up.parentElement; }
          return true;
        });
        const out: string[] = [];
        if ((window as any).__listFloating) out.push("FLOATING: " + floating.map((e) => `${name(e)}@${Math.round(e.getBoundingClientRect().left)},${Math.round(e.getBoundingClientRect().top)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`).join(" | "));
        for (let i = 0; i < floating.length; i++) for (let j = i + 1; j < floating.length; j++) {
          const a = floating[i].getBoundingClientRect(), c = floating[j].getBoundingClientRect();
          const x1 = Math.max(a.left, c.left), x2 = Math.min(a.right, c.right), y1 = Math.max(a.top, c.top), y2 = Math.min(a.bottom, c.bottom);
          if (x2 - x1 < 3 || y2 - y1 < 3) continue;
          const top = document.elementFromPoint((x1 + x2) / 2, (y1 + y2) / 2);
          const winner = top && floating[i].contains(top) ? name(floating[i]) : top && floating[j].contains(top) ? name(floating[j]) : top ? `other:${name(top)}` : "?";
          out.push(`${name(floating[i])} z${getComputedStyle(floating[i]).zIndex} x ${name(floating[j])} z${getComputedStyle(floating[j]).zIndex} (${Math.round(x2 - x1)}x${Math.round(y2 - y1)}px, on top: ${winner})`);
        }
        return out;
      });
      for (const f of found) console.log(`${size.name.padEnd(7)} ${c.state.padEnd(22)} ${f}`);
    } catch (e) {
      console.log(`${size.name} ${c.state}: could not check (${(e as Error).message.slice(0, 80)})`);
    }
    await p.close();
  }
}
await b.close();
