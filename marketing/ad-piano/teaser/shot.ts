import puppeteer from "/Users/blainecowen/Projects/abcSightreading/marketing/ad/node_modules/puppeteer-core";
const dir = process.argv[2];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--allow-file-access-from-files"] });
const p = await b.newPage();
await p.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await p.goto(`file://${dir}/story.html`, { waitUntil: "networkidle0" });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: `${dir}/piano-teaser-story.png` });
await b.close();
