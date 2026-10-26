/**
 * Live practice: the rules, with nothing that touches the database or the
 * page, so all of it is unit-tested (tests/unit/live.test.ts).
 *
 * Each director has one room with a code that never changes, so its address
 * (/live/482KTZ) can go on a QR poster on the wall. While the director has
 * Live on, their practice page publishes whatever it draws to the room;
 * every student's device on that address shows it, each reading the part it
 * chose. With Live off the address waits, and the music appears by itself
 * when Live comes back on. The server side is src/lib/server/live.ts and
 * src/pages/api/live/.
 */

// ── The code students type ────────────────────────────────────────────────

/**
 * Three digits, then three letters: "482-KTZ". The same unambiguous alphabet
 * as class codes (join-code.ts: no O or 0, no I, L or 1), but the other way
 * round, so a live code can never be taken for a class code or the reverse,
 * and the hint can say which one was typed.
 */
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

export function generateLiveCode(random: () => number = Math.random): string {
  const pick = (from: string) => from[Math.floor(random() * from.length)];
  return pick(DIGITS) + pick(DIGITS) + pick(DIGITS) + pick(LETTERS) + pick(LETTERS) + pick(LETTERS);
}

/** "482 ktz", "482-KTZ" -> "482KTZ". */
export const normalizeLiveCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const isLiveCode = (code: string) => /^[2-9]{3}[A-HJKMNP-Z]{3}$/.test(code);

/** "482KTZ" -> "482-KTZ", as it is shown. */
export const formatLiveCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;

/** A room's permanent address, the one its poster points at. */
export const livePath = (code: string) => `/live/${code}`;

/** Why what has been typed is not a live code, for the hint under the box; null while it may still become one. */
export function liveCodeHint(input: string): string | null {
  const code = normalizeLiveCode(input);
  if (!code || isLiveCode(code)) return null;
  if (/^[A-Z]{3}[0-9]{3}$/.test(code)) return "That looks like a class code. A live code starts with numbers, like 482-KTZ.";
  if (/[01OIL]/.test(code)) return "Live codes never use O, 0, I, L or 1. Check the code again.";
  if (code.length >= 6 || /[A-Z]/.test(code.slice(0, 3)) || /[0-9]/.test(code.slice(3))) {
    return "A live code is three numbers, then three letters, like 482-KTZ.";
  }
  return null;
}

// ── How long Live stays on ───────────────────────────────────────────────

/** Live with no activity from the director for this long goes off by itself, so a room is not left on overnight. */
export const LIVE_IDLE_MS = 3 * 60 * 60 * 1000;
/** And Live is never on longer than a school day at a stretch, however busy. */
export const LIVE_MAX_MS = 12 * 60 * 60 * 1000;

/** When Live goes off if nothing else happens: idle time from now, capped at the most from when it was turned on. */
export function liveEndsAt(startedAt: Date, now: Date): Date {
  return new Date(Math.min(now.getTime() + LIVE_IDLE_MS, startedAt.getTime() + LIVE_MAX_MS));
}

/** Whether a room is on air: Live on, and not run out. */
export const isLiveOpen = (s: { endsAt: Date; endedAt: Date | null }, now: Date) =>
  !s.endedAt && s.endsAt.getTime() > now.getTime();

/**
 * The teacher's panel checks in every few seconds; pushing `endsAt` back on
 * each would be a write every time. Once a minute is plenty against hours.
 */
export const EXTEND_EVERY_MS = 60 * 1000;
export const shouldExtend = (endsAt: Date, startedAt: Date, now: Date) =>
  liveEndsAt(startedAt, now).getTime() - endsAt.getTime() >= EXTEND_EVERY_MS;

// ── Devices ───────────────────────────────────────────────────────────────

/** A student's device says it is there this often... */
export const HEARTBEAT_MS = 15 * 1000;
/** ...and counts as connected for this long after, so one missed beat does not drop it. */
export const DEVICE_WINDOW_MS = 40 * 1000;

export const isConnected = (seenAt: Date, now: Date) => now.getTime() - seenAt.getTime() <= DEVICE_WINDOW_MS;

/** How many devices are following, and how many on each part. */
export function deviceSummary(devices: { seenAt: Date; part: string | null }[], now: Date) {
  const live = devices.filter((d) => isConnected(d.seenAt, now));
  const parts: Record<string, number> = {};
  for (const d of live) {
    const key = d.part ?? "";
    parts[key] = (parts[key] ?? 0) + 1;
  }
  return { connected: live.length, parts };
}

/** A device id the browser makes up: letters and digits, 12 to 40 of them. */
export const isDeviceKey = (key: unknown): key is string => typeof key === "string" && /^[A-Za-z0-9]{12,40}$/.test(key);

// ── Polling ───────────────────────────────────────────────────────────────

/**
 * How long a student's device waits between checks: fast while it is seen,
 * slower hidden, slower again while the room is off air (a page left open on
 * the poster's address all day costs little), backing off on errors.
 */
export function pollDelayMs(o: { hidden: boolean; failures: number; waiting?: boolean }): number {
  const base = o.waiting ? (o.hidden ? 20000 : 4000) : o.hidden ? 6000 : 1500;
  if (o.failures <= 0) return base;
  return Math.min(30000, base * 2 ** Math.min(o.failures, 5));
}

// ── Push ──────────────────────────────────────────────────────────────────

/**
 * With a socket open to the push service (workers/live-push), every change
 * reaches the device the moment the director makes it, so the device polls
 * only as a safety net against a message lost in a reconnect, and sends no
 * heartbeat: the open socket is what the director's panel counts. Polling at
 * 1.5 s cost a CDN request a phone every 1.5 s, about 18,000 for a class of
 * thirty in a quarter of an hour; on push it is a few dozen.
 */
export const PUSH_SAFETY_POLL_MS = 30 * 1000;
/** A device's keep-alive on its socket, answered by the service without waking the room. */
export const PUSH_PING_MS = 25 * 1000;
/** How long a device waits before trying the socket again, by failures in a row: polling carries on meanwhile. */
export const pushRetryMs = (failures: number) => Math.min(60_000, 2000 * 2 ** Math.min(failures, 5));

/** A device's socket address, from the service's base address (http(s) or ws(s)). */
export function pushSocketUrl(base: string, code: string, device: string, part: string | null): string {
  const url = new URL(`/rooms/${code}/ws`, base.replace(/^http/, "ws"));
  url.searchParams.set("d", device);
  if (part) url.searchParams.set("p", part);
  return url.toString();
}

/**
 * Whether a state pushed to a device is newer than what it shows: a later
 * version, the same one with another start (or none), or the room going off
 * or on air. Two changes sent close together can arrive out of order; an
 * older score must never replace a newer one.
 */
export function isNewerState(
  pushed: { live?: unknown; version?: unknown },
  shown: { live: boolean; version: number },
): boolean {
  if (pushed.live === false) return true;
  if (typeof pushed.version !== "number") return false;
  return !shown.live || pushed.version >= shown.version;
}

/**
 * The director's count, from both kinds of device: those on a socket (seen
 * now, by the push service) and those polling with heartbeats (the
 * database). A device in both is counted once, by its socket.
 */
export function mergeDevices(
  beating: { deviceKey: string; seenAt: Date; part: string | null }[],
  pushed: { device: string; part: string | null }[],
  now: Date,
): { seenAt: Date; part: string | null }[] {
  const byKey = new Map<string, { seenAt: Date; part: string | null }>();
  for (const d of beating) byKey.set(d.deviceKey, { seenAt: d.seenAt, part: d.part });
  for (const d of pushed) if (isDeviceKey(d.device)) byKey.set(d.device, { seenAt: now, part: d.part });
  return [...byKey.values()];
}

/** The ETag for a session's state: its version, its play, and whether it is open. */
export const liveEtag = (s: { version: number; playId: string | null; open: boolean }) =>
  `"v${s.version}-${s.playId ?? "0"}-${s.open ? "o" : "x"}"`;

/**
 * A fixed-window counter: at most `limit` hits per key in each `windowMs`.
 * Kept in the memory of one server instance, so on Vercel it is a guard
 * against a runaway tab or someone guessing codes, not an exact quota.
 * Old windows are swept once the map grows, so it cannot grow without end.
 */
export function rateLimiter(limit: number, windowMs: number, maxKeys = 20_000) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string, now: number = Date.now()): boolean => {
    let w = hits.get(key);
    if (!w || now - w.start >= windowMs) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
        if (hits.size >= maxKeys) hits.clear();
      }
      w = { start: now, count: 0 };
      hits.set(key, w);
    }
    w.count += 1;
    return w.count <= limit;
  };
}

// ── What the teacher publishes ────────────────────────────────────────────

export type LiveVoice = { id: string; name: string };

export type LiveSettings = {
  /** The page's tempo, beats a minute. */
  bpm: number;
  /** A line for the student's view: "F major · 4/4 · SATB". */
  title: string;
  /** Rhythm only (a one-line percussion staff). */
  rhythm?: boolean;
};

export type LivePlay = {
  /** Changes with each start, so a device can tell a new start from the one it has played. */
  id: string;
  /** When the count-in begins, in server milliseconds since 1970. */
  at: number;
  bpm: number;
  /** The exercise version it starts, so a device never starts an older one. */
  version: number;
};

/** The largest score accepted. A 64-bar four-part piece with solfège is under 30 KB. */
export const MAX_ABC_LENGTH = 120_000;

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A publish from the teacher's page: the score and its settings. */
export function checkPublish(body: unknown): Checked<{ abc: string; settings: LiveSettings }> {
  const b = body as { abc?: unknown; settings?: unknown } | null;
  if (!b || typeof b.abc !== "string" || !b.abc.trim()) return { ok: false, error: "There is no exercise to send." };
  if (b.abc.length > MAX_ABC_LENGTH) return { ok: false, error: "That exercise is too long to send." };
  if (!/^X:/m.test(b.abc) || !/^K:/m.test(b.abc)) return { ok: false, error: "That is not an exercise." };
  const s = (b.settings ?? {}) as Partial<LiveSettings>;
  const bpm = Number(s.bpm);
  const settings: LiveSettings = {
    bpm: Number.isFinite(bpm) ? Math.max(20, Math.min(300, Math.round(bpm))) : 90,
    title: typeof s.title === "string" ? s.title.slice(0, 120) : "",
    ...(s.rhythm === true ? { rhythm: true } : {}),
  };
  return { ok: true, value: { abc: b.abc, settings } };
}

/** The lead a "Start together" gives every device to hear of it before the count-in starts. */
export const START_LEAD_MS = 3500;

/** A start: from now (server time) plus the lead, at the tempo and version given. */
export function startPlay(o: { now: number; bpm: number; version: number; id: string }): LivePlay {
  return { id: o.id, at: o.now + START_LEAD_MS, bpm: Math.max(20, Math.min(300, Math.round(o.bpm))), version: o.version };
}

export function isLivePlay(v: unknown): v is LivePlay {
  const p = v as LivePlay | null;
  return !!p && typeof p.id === "string" && Number.isFinite(p.at) && Number.isFinite(p.bpm) && Number.isFinite(p.version);
}

// ── The clock ─────────────────────────────────────────────────────────────

/**
 * One reading of the server's clock: when the request left (`sent`), what the
 * server said (`server`), when the answer came back (`received`), the first
 * and last on this device's clock.
 */
export type ClockSample = { sent: number; server: number; received: number };

/**
 * How far the server's clock is ahead of this one, as NTP reckons it: the
 * server read its clock somewhere in the round trip, most likely the middle.
 * The sample with the shortest round trip has the least room to be wrong, so
 * it is the one trusted. `error` is half that round trip, the most it can be off.
 */
export function clockOffset(samples: ClockSample[]): { offset: number; error: number } | null {
  const good = samples.filter((s) => s.received >= s.sent);
  if (good.length === 0) return null;
  const best = good.reduce((a, b) => (b.received - b.sent < a.received - a.sent ? b : a));
  const rtt = best.received - best.sent;
  return { offset: best.server - (best.sent + rtt / 2), error: rtt / 2 };
}

/**
 * Where a start stands on this device: milliseconds until the count-in
 * begins (negative once it has), and when the music itself begins, after the
 * count-in's beats.
 */
export function playTiming(play: LivePlay, offset: number, localNow: number, countInBeats: number) {
  const countInAt = play.at - offset;
  const beatMs = 60000 / play.bpm;
  return {
    untilCountIn: countInAt - localNow,
    countInAt,
    musicAt: countInAt + countInBeats * beatMs,
    beatMs,
  };
}

// ── One part out of the score ─────────────────────────────────────────────

const headerEnd = (lines: string[]) => {
  const k = lines.findIndex((l) => /^K:/.test(l.trim()));
  return k < 0 ? lines.length - 1 : k;
};

/** The voices of a score, in order, from its V: header lines: id and the name it prints. One-line scores give one. */
export function voicesOf(abc: string): LiveVoice[] {
  const lines = abc.split(/\r?\n/);
  const end = headerEnd(lines);
  const voices: LiveVoice[] = [];
  for (const raw of lines.slice(0, end + 1)) {
    const m = /^V:\s*([^\s\]]+)(.*)$/.exec(raw.trim());
    if (!m) continue;
    const name = /\bname="([^"]*)"/.exec(m[2])?.[1];
    if (!voices.some((v) => v.id === m[1])) voices.push({ id: m[1], name: name || m[1] });
  }
  return voices;
}

/**
 * Tokens of an ABC music line that matter for timing: annotations ("^V7"),
 * decorations (!mf!), inline fields ([V:S]), notes and rests with their
 * lengths, and chords ([CEG]8). Anything else (bars, spaces, ties) only
 * passes through.
 */
const TOKEN =
  /"([^"]*)"|![^!]*!|\[[A-Za-z]:[^\]]*\]|\[([\^_=]*[A-Ga-g][,']*)+\](\d*)(?:\/(\d*))?|([\^_=]*[A-Ga-gzx][,']*)(\d*)(?:\/(\d*))?/g;

/** A note's length in L: units from its digits: "8" is 8, "" is 1, "/2" is a half. */
const lengthOf = (num: string | undefined, den: string | undefined, slash: boolean) => {
  const n = num ? Number(num) : 1;
  if (!slash) return n;
  return n / (den ? Number(den) : 2);
};

/** Where each chord symbol ("^...) falls in a voice's music, in L: units from the start. */
function chordSymbolTimes(music: string[]): Map<number, string> {
  const at = new Map<number, string>();
  let t = 0;
  for (const line of music) {
    for (const m of line.matchAll(TOKEN)) {
      const tok = m[0];
      if (tok.startsWith('"')) {
        if (m[1]?.startsWith("^") && !at.has(t)) at.set(t, m[1]);
      } else if (tok.startsWith("[") && m[3] === undefined && m[2] === undefined) {
        // an inline field: no time
      } else if (tok.startsWith("[")) {
        t += lengthOf(m[3], m[4], tok.includes("/"));
      } else if (!tok.startsWith("!")) {
        t += lengthOf(m[6], m[7], tok.includes("/"));
      }
    }
  }
  return at;
}

/** The music with each symbol written before the note or rest that starts at its time. Symbols falling mid-note are left out. */
function withChordSymbols(music: string[], symbols: Map<number, string>): string[] {
  let t = 0;
  return music.map((line) => {
    let out = "";
    let last = 0;
    for (const m of line.matchAll(TOKEN)) {
      const tok = m[0];
      const isField = tok.startsWith("[") && m[2] === undefined && m[3] === undefined;
      if (tok.startsWith('"') || tok.startsWith("!") || isField) continue;
      const sym = symbols.get(t);
      if (sym !== undefined) {
        out += line.slice(last, m.index) + `"${sym}"`;
        last = m.index!;
        symbols.delete(t);
      }
      t += tok.startsWith("[") ? lengthOf(m[3], m[4], tok.includes("/")) : lengthOf(m[6], m[7], tok.includes("/"));
    }
    return out + line.slice(last);
  });
}

/**
 * One part of a score, as a score of its own: the header with only that
 * voice, and only that voice's music and words. Key, meter, tempo and
 * instrument stay as they were. The chord symbols, written on the top voice,
 * are copied onto this one where one of its notes starts with them, so a
 * singer of an inner part still sees the harmony when the teacher shows it.
 *
 * An unknown voice, or a score of one voice, comes back unchanged.
 */
export function extractVoice(abc: string, voiceId: string): string {
  const voices = voicesOf(abc);
  if (voices.length <= 1 || !voices.some((v) => v.id === voiceId)) return abc;
  const lines = abc.split(/\r?\n/);
  const end = headerEnd(lines);

  const header = lines.slice(0, end + 1).flatMap((raw) => {
    const line = raw.trim();
    const v = /^V:\s*([^\s\]]+)/.exec(line);
    if (v) return v[1] === voiceId ? [raw] : [];
    if (/^%%score\b/.test(line) || /^%%staves\b/.test(line)) return [`%%score ${voiceId}`];
    return [raw];
  });

  // The body, line by line, each belonging to the voice last named.
  const byVoice = new Map<string, { music: string[]; at: number[]; all: string[] }>();
  const before: string[] = [];
  let current: string | null = null;
  for (const raw of lines.slice(end + 1)) {
    const line = raw.trim();
    const inline = /^\[V:\s*([^\]\s]+)\]/.exec(line);
    const field = /^V:\s*([^\s\]]+)/.exec(line);
    if (inline) current = inline[1];
    else if (field) current = field[1];
    if (current === null) {
      before.push(raw);
      continue;
    }
    const entry = byVoice.get(current) ?? { music: [], at: [], all: [] };
    byVoice.set(current, entry);
    entry.all.push(raw);
    if (!/^(w|W):/.test(line) && !line.startsWith("%") && !field) {
      entry.music.push(raw);
      entry.at.push(entry.all.length - 1);
    }
  }

  const mine = byVoice.get(voiceId) ?? { music: [], at: [], all: [] };
  const body = [...mine.all];
  const top = voices[0].id;
  const alreadyHas = mine.music.some((l) => /"\^/.test(l));
  if (top !== voiceId && !alreadyHas) {
    const symbols = chordSymbolTimes(byVoice.get(top)?.music ?? []);
    if (symbols.size > 0) {
      withChordSymbols(mine.music, symbols).forEach((line, i) => (body[mine.at[i]] = line));
    }
  }
  return [...header, ...before, ...body].join("\n").replace(/\s*$/, "\n");
}

/**
 * A one-part score without the part's name down the left of every line: on
 * a phone that margin is a fifth of the staff, and the singer knows their part.
 */
export const withoutPartNames = (abc: string) =>
  abc.replace(/^(V:[^\n]*?)\s+(?:name|snm)="[^"]*"(?:\s+(?:name|snm)="[^"]*")?/gm, "$1");

/** What a device reads: "all" is the full score, otherwise one voice's id. */
export const FULL_SCORE = "all";

/** The part a device read before, if this score has it; the full score for a one-voice score; else null, and the device is asked. */
export function choosePart(saved: string | null, voices: LiveVoice[]): string | null {
  if (voices.length <= 1) return FULL_SCORE;
  if (saved === FULL_SCORE || (saved && voices.some((v) => v.id === saved))) return saved;
  return null;
}

/**
 * Where a device keeps its part, most particular first: for this room and
 * this set of voices (a bass who picked B in SATB gets B in SATB tomorrow,
 * after an SA exercise in between), then for this room whatever the voices.
 */
export const partKeys = (code: string, voices: LiveVoice[]) => [
  `sr-live-part:${code}:${voices.map((v) => v.id).join(",")}`,
  `sr-live-part:${code}`,
];

/** The part a device chose before in this room, by partKeys, if the score has it. */
export function rememberedPart(get: (key: string) => string | null, code: string, voices: LiveVoice[]): string | null {
  for (const key of partKeys(code, voices)) {
    const part = choosePart(get(key), voices);
    if (part) return part;
  }
  return choosePart(null, voices);
}
