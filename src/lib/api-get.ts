/**
 * Reads from the page's own API, gathered (12 November 2026). The practice
 * page asks for its account, plan, allowance, settings, courses and presets
 * all at once as it opens: eight requests, each with its own sign-in check and
 * plan lookup. apiGet holds a read for a moment, and every read asked for in
 * that moment goes to the server as one request (/api/batch), which answers
 * each exactly as the route would on its own.
 *
 * It is a drop-in for fetch(path) on a GET: the same Response comes back. A
 * path the batch does not take, a lone read, or a batch that fails goes the
 * old way, one fetch each, so nothing can be worse than before.
 */
const BATCHABLE = new Set([
  "/api/usage",
  "/api/gift",
  "/api/free-month",
  "/api/preferences",
  "/api/tracks",
  "/api/student",
  "/api/assignments",
  "/api/recent",
  "/api/presets",
  "/api/billing",
]);
/** Long enough for a page's components to ask together, too short to notice. */
const WAIT_MS = 30;

type Waiting = { path: string; resolve: (r: Response) => void; reject: (e: unknown) => void };
let queue: Waiting[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function batchable(path: string): boolean {
  return BATCHABLE.has(path.split("?")[0]);
}

export function apiGet(path: string): Promise<Response> {
  if (typeof window === "undefined" || !batchable(path)) return fetch(path);
  return new Promise((resolve, reject) => {
    queue.push({ path, resolve, reject });
    timer ??= setTimeout(flush, WAIT_MS);
  });
}

const alone = (w: Waiting) => fetch(w.path).then(w.resolve, w.reject);

async function flush() {
  const waiting = queue;
  queue = [];
  timer = null;
  if (waiting.length === 1) return alone(waiting[0]);
  // The same read asked twice (two components wanting the allowance) is sent once.
  const paths = [...new Set(waiting.map((w) => w.path))];
  try {
    const qs = paths.map((p) => "p=" + encodeURIComponent(p)).join("&");
    const res = await fetch(`/api/batch?${qs}`);
    if (!res.ok) throw new Error(String(res.status));
    const { results } = (await res.json()) as { results: { status: number; body: string }[] };
    if (results?.length !== paths.length) throw new Error("batch length");
    for (const w of waiting) {
      const r = results[paths.indexOf(w.path)];
      w.resolve(new Response(r.status === 204 ? null : r.body, { status: r.status, headers: { "Content-Type": "application/json" } }));
    }
  } catch {
    waiting.forEach(alone);
  }
}
