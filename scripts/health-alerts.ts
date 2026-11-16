/**
 * Site health alerts on Blaine's Telegram (11 November 2026: Brooke Grabowski's
 * band students at S&S CISD were "timing out on the practice page", and we
 * heard it from her, not from the site. "Help me diagnose and catch future
 * problems").
 *
 * Run by launchd on the Mac mini every 5 minutes
 * (scripts/com.blainecowen.abc-health-alerts.plist). Looks at the last 15
 * minutes of production through Vercel's metrics (the `vercel` CLI, signed in
 * on the mini) and sends one message when:
 *   - any request ended 5xx (a 504 is a request Vercel killed at 60 s), with
 *     the paths;
 *   - warm requests are slow: p95 over SLOW_MS with at least MIN_REQUESTS of
 *     them (a class's burst, not one stray request);
 *   - cold starts are very slow: p95 over COLD_MS over at least MIN_COLD new
 *     instances (what a class arriving at once feels).
 * The same kind of alert is not sent again for COOLDOWN_MIN, and one "back to
 * normal" line follows once a check is clean. Telegram's bot and chat come
 * from Hermes (~/.hermes/.env), as for scripts/signup-alerts.ts; state is in
 * ~/.abc-health-alerts.json.
 *
 *   bun scripts/health-alerts.ts                     # check and send
 *   bun scripts/health-alerts.ts --dry               # print instead of sending
 *   bun scripts/health-alerts.ts --dry --since 2026-11-11T19:05:00Z --until 2026-11-11T19:35:00Z
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SLOW_MS = 3_000;
const MIN_REQUESTS = 50;
const COLD_MS = 10_000;
// One slow new instance is one slow page (12 November 2026: one request that
// met a dead connection on a new instance sent this alert alongside the error
// one). A class arriving at once starts several.
const MIN_COLD = 3;
const COOLDOWN_MIN = 30;
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const SINCE = arg("--since") ?? "15m";
const UNTIL = arg("--until");
const STATE = join(homedir(), ".abc-health-alerts.json");

function dotenv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const tg = dotenv(join(homedir(), ".hermes/.env"));

async function send(text: string) {
  if (DRY || !tg.TELEGRAM_BOT_TOKEN || !tg.TELEGRAM_HOME_CHANNEL) {
    if (!DRY) console.error("No Telegram token or chat id; printing instead.");
    console.log(text.replace(/<[^>]+>/g, ""));
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${tg.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: tg.TELEGRAM_HOME_CHANNEL, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const j = (await r.json()) as { ok: boolean; description?: string };
  if (!j.ok) throw new Error(`Telegram: ${j.description ?? r.status}`);
}

type Row = Record<string, string | number>;
/** One `vercel metrics` query, production only, 5 minute buckets; returns its summary rows. */
async function metric(name: string, opts: { agg?: string; filter?: string; groupBy?: string[]; limit?: number } = {}): Promise<Row[]> {
  const cmd = ["vercel", "metrics", name, "--prod", "--json", "-s", SINCE, "-g", "5m"];
  if (UNTIL) cmd.push("-u", UNTIL);
  if (opts.agg) cmd.push("-a", opts.agg);
  if (opts.filter) cmd.push("-f", opts.filter);
  for (const g of opts.groupBy ?? []) cmd.push("--group-by", g);
  if (opts.limit) cmd.push("-l", String(opts.limit));
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", env: { ...process.env, _ZO_DOCTOR: "0" } });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) throw new Error(`vercel metrics ${name}: ${(await new Response(p.stderr).text()).slice(-300)}`);
  return (JSON.parse(out).summary ?? []) as Row[];
}
const value = (r: Row | undefined) => Number(Object.entries(r ?? {}).find(([k]) => k.startsWith("vercel_"))?.[1] ?? 0);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

type State = { sent: Record<string, string>; alerting: boolean };
const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { sent: {}, alerting: false };
const now = Date.now();
const due = (kind: string) => !state.sent[kind] || now - Date.parse(state.sent[kind]) > COOLDOWN_MIN * 60_000;

let problems: { kind: string; text: string }[] = [];
try {
  // Time to first byte, what a visitor waits, not function_duration_ms (12 November
  // 2026): attachDatabasePool (db.ts) keeps each instance running the pool's idle
  // timeout (20 s) after its last request to close connections, and Vercel counts
  // that as duration, so every quiet spell read as a 20, 40 or 59 s "slow" page
  // while the pages had answered in milliseconds.
  const [errors, hotCount, hotP95, coldP95, coldCount] = await Promise.all([
    metric("vercel.function_invocation.count", { filter: "httpStatus >= 500", groupBy: ["httpStatus", "requestPath"], limit: 6 }),
    metric("vercel.function_invocation.count", { filter: 'functionStartType = "hot"' }),
    metric("vercel.function_invocation.ttfb_ms", { agg: "p95", filter: 'functionStartType = "hot"' }),
    metric("vercel.function_invocation.ttfb_ms", { agg: "p95", filter: 'functionStartType != "hot"' }),
    metric("vercel.function_invocation.count", { filter: 'functionStartType != "hot"' }),
  ]);
  if (errors.length) {
    const lines = errors.map((r) => `${value(r)} × ${r.httpStatus} on ${r.requestPath}`).join("\n");
    const killed = errors.some((r) => String(r.httpStatus) === "504");
    problems.push({ kind: "errors", text: `<b>abcSightReading: requests failing</b>${killed ? " (504 = hung 60 s and killed)" : ""}\n${lines}` });
  }
  const hot = value(hotCount[0]);
  const p95 = value(hotP95[0]);
  if (hot >= MIN_REQUESTS && p95 > SLOW_MS) {
    problems.push({ kind: "slow", text: `<b>abcSightReading: slow</b>\nWarm requests p95 ${secs(p95)} over ${hot} requests (normal is about 0.1 s).` });
  }
  const cold = value(coldP95[0]);
  if (cold > COLD_MS && value(coldCount[0]) >= MIN_COLD) {
    problems.push({ kind: "cold", text: `<b>abcSightReading: slow cold starts</b>\np95 ${secs(cold)} over ${value(coldCount[0])} new instances (normal is about 3 s): a class arriving at once waits this long.` });
  }
  if (DRY) console.log(`checked ${SINCE}${UNTIL ? ` to ${UNTIL}` : ""}: ${errors.length} error groups, warm p95 ${secs(p95)} over ${hot}, cold p95 ${secs(cold)}`);
} catch (e) {
  problems = [{ kind: "check", text: `<b>abcSightReading health check failed</b>\n${String(e).slice(0, 300)}` }];
}

const toSend = problems.filter((p) => due(p.kind));
if (toSend.length) {
  await send(toSend.map((p) => p.text).join("\n\n") + "\n\nLogs: vercel.com, abc-sightreading, Observability.");
  for (const p of toSend) state.sent[p.kind] = new Date(now).toISOString();
}
if (problems.length) state.alerting = true;
else if (state.alerting) {
  await send("abcSightReading: back to normal (no errors or slow requests in the last 15 minutes).");
  state.alerting = false;
}
if (!DRY) writeFileSync(STATE, JSON.stringify(state, null, 2));
