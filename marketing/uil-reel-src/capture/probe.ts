import puppeteer from "puppeteer-core";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--hide-scrollbars"], defaultViewport: { width: 720, height: 1100, deviceScaleFactor: 1.5 } });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await p.evaluateOnNewDocument(() => { try { localStorage.setItem("theme", "light"); } catch {} });
for (const lv of [1, 5]) {
  await p.goto(`http://localhost:4321/choral-sightreading?uil=UIL%20${lv}`, { waitUntil: "load", timeout: 30000 });
  console.log("loaded", lv); await sleep(3000);
  await p.screenshot({ path: `probe-l${lv}.png` });
  await p.keyboard.press("f");
  await sleep(1500);
  await p.screenshot({ path: `probe-l${lv}-focus.png` });
}
await b.close();
