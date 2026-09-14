import type { APIRoute } from "astro";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  abcProblems,
  isSafeSlug,
  MAX_ABC_CHARS,
  parseHeader,
  slugify,
} from "../../../lib/abc-score-file";

/**
 * The hand-transcribed score files behind the /write page.
 *
 * `GET` lists what has been saved; `POST` writes one. Files land in `scores/`
 * at the project root as plain ABC, one per score, so they can be read straight
 * off disk, committed, and diffed like anything else in the repo. That is the
 * whole point of saving them here rather than in the browser: the corpus is
 * meant to be read by the coding agent, and localStorage is not.
 *
 * **Local development only.** On deployed Vercel the serverless filesystem is
 * read-only apart from an ephemeral `/tmp`, so a save there would either throw
 * or appear to work and then vanish with the instance. Rather than fail in a way
 * that looks like a bug, this refuses outright and says why. It also means there
 * is no publicly reachable endpoint that writes files, which matters because the
 * page itself is not behind any kind of login.
 */

const SCORES_DIR = join(process.cwd(), "scores");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * `import.meta.env.DEV` is true under `astro dev` and false in a build.
 *
 * That is the right line to draw rather than `process.env.VERCEL`, which
 * reports the host and not the mode - `astro preview` on a laptop would still
 * be writing into the repo. Because Vite replaces this statically at build
 * time, the whole filesystem branch is dead code in the deployed bundle.
 */
const WRITABLE = import.meta.env.DEV;

const NOT_WRITABLE =
  "Saving only works on the local dev server: the deployed site has a read-only filesystem, so there is nowhere for the file to go.";

async function listScores() {
  let names: string[];
  try {
    names = await readdir(SCORES_DIR);
  } catch {
    return []; // no directory yet means nothing saved yet
  }
  const scores = [];
  for (const name of names) {
    if (!name.endsWith(".abc")) continue;
    const slug = name.slice(0, -4);
    // Anything hand-dropped into the directory that is not a name we would have
    // written is listed but never used to build a path.
    if (!isSafeSlug(slug)) continue;
    try {
      const abc = await readFile(join(SCORES_DIR, name), "utf8");
      scores.push({ slug, meta: parseHeader(abc), abc });
    } catch (err) {
      console.error(`scores: could not read ${name}`, err);
    }
  }
  scores.sort((a, b) => (a.meta.title ?? "").localeCompare(b.meta.title ?? ""));
  return scores;
}

/**
 * Deliberately succeeds in production with an empty list.
 *
 * A working editor whose Save button is honestly disabled is a better deployed
 * page than one that opens on an error. The page reads `writable` and says so.
 */
export const GET: APIRoute = async () => {
  if (!WRITABLE) {
    return json({ success: true, writable: false, reason: NOT_WRITABLE, data: [] });
  }
  try {
    return json({ success: true, writable: true, data: await listScores() });
  } catch (err) {
    console.error("scores: list failed", err);
    return json({ success: false, error: "Could not read the scores folder." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  // 503 rather than 403: the capability exists, just not on this host.
  if (!WRITABLE) return json({ success: false, error: NOT_WRITABLE }, 503);

  let body: { title?: string; abc?: string };
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Body was not JSON." }, 400);
  }

  const title = (body.title ?? "").trim();
  // Normalised on the way in: the corpus is read back by scripts, and mixed
  // line endings inside it are a problem for a later reader, not this one.
  const abc = typeof body.abc === "string" ? body.abc.replace(/\r\n/g, "\n") : "";
  if (!title) return json({ success: false, error: "A title is needed to name the file." }, 400);
  if (!abc.trim()) return json({ success: false, error: "There is no music to save." }, 400);
  if (abc.length > MAX_ABC_CHARS) {
    return json({ success: false, error: "That is far larger than a transcription." }, 413);
  }

  // The blank-line trap is refused rather than warned about here: the file on
  // disk is what gets analysed later, and one that silently ends halfway is
  // worse than no file. The page warns about it long before this point.
  const fatal = abcProblems(abc).filter((p) => p.kind !== "no-title");
  if (fatal.length > 0) {
    return json({ success: false, error: fatal[0].message }, 400);
  }

  // The client never names the file. It sends a title, the slug is derived here,
  // and the result has to survive the same gate a path from anywhere else would.
  const slug = slugify(title);
  if (!isSafeSlug(slug)) {
    return json(
      {
        success: false,
        error: `"${title}" has no letters or numbers in it to make a filename from.`,
      },
      400
    );
  }

  try {
    await mkdir(SCORES_DIR, { recursive: true });
    // Saving the same title again overwrites it, which is what "save" means
    // while you are still working on a transcription. The files are in git, so
    // the previous version is not actually gone.
    await writeFile(join(SCORES_DIR, `${slug}.abc`), abc.endsWith("\n") ? abc : `${abc}\n`, "utf8");
  } catch (err) {
    console.error("scores: write failed", err);
    return json({ success: false, error: "Could not write the file." }, 500);
  }

  return json({ success: true, writable: true, data: { slug, scores: await listScores() } });
};
