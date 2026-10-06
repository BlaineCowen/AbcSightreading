/**
 * Grade runs sent from a preview ("Send this run": /api/grade-runs) into the
 * private grade-runs Blob store.
 *
 *   bun run scripts/grade-runs.ts              # list them, newest first
 *   bun run scripts/grade-runs.ts pull [dir]   # download one (the newest without a dir) to grade-runs/ here (gitignored)
 *
 * Reads BLOB_READ_WRITE_TOKEN from .env.local (`vercel env pull`).
 */
import { get, list } from "@vercel/blob";
import { mkdirSync, writeFileSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {}
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("No BLOB_READ_WRITE_TOKEN: run `vercel env pull .env.local`.");

const blobs: { pathname: string; size: number; uploadedAt: Date }[] = [];
let cursor: string | undefined;
do {
  const page = await list({ prefix: "grade-runs/", cursor, token });
  blobs.push(...page.blobs);
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
const runs = new Map<string, typeof blobs>();
for (const b of blobs) {
  const dir = b.pathname.split("/").slice(0, 2).join("/");
  runs.set(dir, [...(runs.get(dir) ?? []), b]);
}
const dirs = [...runs.keys()].sort().reverse();

if (process.argv[2] === "pull") {
  const dir = process.argv[3] ? (process.argv[3].startsWith("grade-runs/") ? process.argv[3] : `grade-runs/${process.argv[3]}`) : dirs[0];
  if (!dir || !runs.has(dir)) throw new Error(`No run ${dir ?? ""}`);
  mkdirSync(dir, { recursive: true });
  for (const b of runs.get(dir)!) {
    // useCache false: a run just sent can be missing from the CDN for a while.
    const got = await get(b.pathname, { access: "private", token, useCache: false });
    if (!got) continue;
    writeFileSync(b.pathname, Buffer.from(await new Response(got.stream).arrayBuffer()));
    console.log("saved", b.pathname);
  }
} else {
  for (const d of dirs) {
    const files = runs.get(d)!;
    console.log(`${d}  ${files.map((f) => `${f.pathname.split("/").pop()} ${(f.size / 1024).toFixed(0)} KB`).join(", ")}  ${files[0].uploadedAt.toISOString().slice(0, 16)}`);
  }
  if (!dirs.length) console.log("No runs yet.");
}
