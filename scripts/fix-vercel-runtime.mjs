// @astrojs/vercel 6 picks the function runtime from the build machine's Node
// major, and knows only 18 and 20: anything newer falls back to nodejs18.x,
// which Vercel no longer accepts, so the deploy fails after a clean build.
// Prisma 7 needs Node >= 20.19 and Vercel stops building 20 on 2026-10-01, so
// the project is on 24 (package.json engines) and this pins the emitted
// functions to match. Remove it once Astro and the adapter are upgraded - the
// adapter for Astro 5 knows the current runtimes itself.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RUNTIME = "nodejs24.x";
const dir = ".vercel/output/functions";

if (existsSync(dir)) {
  for (const fn of readdirSync(dir)) {
    const file = join(dir, fn, ".vc-config.json");
    if (!existsSync(file)) continue;
    const config = JSON.parse(readFileSync(file, "utf8"));
    if (config.runtime === RUNTIME) continue;
    console.log(`${fn}: runtime ${config.runtime} -> ${RUNTIME}`);
    config.runtime = RUNTIME;
    writeFileSync(file, JSON.stringify(config, null, "\t"));
  }
}
