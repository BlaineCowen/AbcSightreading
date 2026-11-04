/**
 * Sign-up alerts on Blaine's Telegram (4 November 2026: "send me alerts on a
 * cron job when I have new sign ups at least until I get to a large number of
 * users then just say how many sign ups I have").
 *
 * Run by launchd on the Mac mini every 15 minutes
 * (~/Library/LaunchAgents/com.blainecowen.abc-signup-alerts.plist).
 *   - Under BIG accounts: one message per new sign-up batch, each account
 *     with its email, type and whether it is confirmed.
 *   - From BIG on: no per-account messages, one count a day at 8 am Central
 *     (new in the last day, and the total).
 *   - Emails or domains in WATCH get a louder line ("Jim at MusicFirst").
 *
 * Read only against DATABASE_URL (the shared database; bun loads this repo's
 * .env, so run it from the repo root). Telegram's bot token and chat come from
 * Hermes (~/.hermes/.env: TELEGRAM_BOT_TOKEN, TELEGRAM_HOME_CHANNEL), the bot
 * on the Mac mini (Blaine, 4 November 2026). What was
 * last reported is kept in ~/.abc-signup-alerts.json.
 *
 *   bun scripts/signup-alerts.ts           # check and send
 *   bun scripts/signup-alerts.ts --dry     # print instead of sending
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BIG = 200;
const WATCH: Record<string, string> = {
  "jim@musicfirst.com": "Jim Frankel at MusicFirst",
  "musicfirst.com": "someone at MusicFirst",
};
const DIGEST_HOUR = 8; // Central, once accounts reach BIG
const DRY = process.argv.includes("--dry");
const STATE = join(homedir(), ".abc-signup-alerts.json");

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
const TOKEN = tg.TELEGRAM_BOT_TOKEN;
const CHAT = tg.TELEGRAM_HOME_CHANNEL;

type State = { since: string; digestDay?: string };
const state: State | null = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function send(text: string) {
  if (DRY || !TOKEN || !CHAT) {
    if (!DRY) console.error("No Telegram token or chat id; printing instead.");
    console.log(text.replace(/<[^>]+>/g, ""));
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!j.ok) throw new Error(`Telegram: ${j.description ?? r.status}`);
}

function watched(email: string): string | null {
  const e = email.toLowerCase();
  return WATCH[e] ?? WATCH[e.split("@")[1] ?? ""] ?? null;
}

const sql = new Bun.SQL(process.env.DATABASE_URL!);
const now = new Date();
const { total, newRows } = await sql.begin("read only", async (tx) => {
  const [t] = await tx`select count(*)::int as total from "user" where "accountType" <> 'student'`;
  const since = state?.since ?? now.toISOString();
  const rows = await tx`
    select email, "accountType" as type, "emailVerified" as confirmed, "createdAt" as created,
           to_char("createdAt" at time zone 'America/Chicago', 'Mon DD, HH12:MI am') as joined
    from "user" where "accountType" <> 'student' and "createdAt" > ${since}::timestamptz
    order by "createdAt" asc`;
  return { total: t.total as number, newRows: rows as { email: string; type: string; confirmed: boolean; created: Date; joined: string }[] };
});
await sql.close();

const next: State = { since: newRows.length ? new Date(newRows.at(-1)!.created).toISOString() : (state?.since ?? now.toISOString()), digestDay: state?.digestDay };

if (!state) {
  await send(`🔔 <b>abcSightReading sign-up alerts are on.</b>\nYou have ${total} accounts. New ones will show up here.`);
} else if (total < BIG || newRows.some((r) => watched(r.email))) {
  if (newRows.length) {
    const lines = newRows.map((r) => {
      const who = watched(r.email);
      const bits = [r.type === "standard" ? null : r.type, r.confirmed ? null : "not confirmed yet"].filter(Boolean).join(", ");
      return `${who ? `⭐ <b>${esc(who)}!</b> ` : "• "}${esc(r.email)}${bits ? ` (${bits})` : ""}, ${r.joined}`;
    });
    const head = newRows.length === 1 ? "🎉 New sign-up" : `🎉 ${newRows.length} new sign-ups`;
    await send(`<b>${head}</b>\n${lines.join("\n")}\n\nTotal accounts: ${total}`);
  }
} else {
  // Big enough: a count once a day.
  const central = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const day = central.toISOString().slice(0, 10);
  if (central.getHours() >= DIGEST_HOUR && state.digestDay !== day) {
    const sql2 = new Bun.SQL(process.env.DATABASE_URL!);
    const [d] = await sql2`select count(*)::int as n from "user" where "accountType" <> 'student' and "createdAt" > now() - interval '1 day'`;
    await sql2.close();
    await send(`📈 <b>${d.n} new sign-up${d.n === 1 ? "" : "s"}</b> in the last day. Total accounts: ${total}`);
    next.digestDay = day;
  }
}

if (!DRY) writeFileSync(STATE, JSON.stringify(next, null, 2));
