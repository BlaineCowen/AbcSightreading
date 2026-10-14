import puppeteer from "puppeteer-core";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, defaultViewport: { width: 600, height: 1066 } });
const p = await b.newPage();
await p.goto("http://localhost:4321/choral-sightreading?uil=UIL%201", { waitUntil: "load" });
await sleep(2500);
console.log(await p.evaluate(async () => {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /abcjs\.js/.test(n));
  const mod: any = await import(urls[0]);
  const a = mod.default ?? mod;
  const desc = Object.getOwnPropertyDescriptor(a, "renderAbc");
  (window as any).__n = 0;
  const orig = a.renderAbc;
  try { a.renderAbc = function (...x: any[]) { (window as any).__n++; (window as any).__last = x[1]; return orig.apply(this, x); }; } catch (e) { return "assign failed " + e; }
  return JSON.stringify({ urls, keys: Object.keys(mod).slice(0, 5), desc: desc && { w: desc.writable, c: desc.configurable }, same: a.renderAbc !== orig });
}));
await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("New exercise"))!.click());
await sleep(2500);
console.log(await p.evaluate(() => [(window as any).__n, String((window as any).__last).slice(0, 80)]));
await b.close();
