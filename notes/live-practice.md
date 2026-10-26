# Live practice

Built 7 October 2026 as per-session codes (`live-practice` branch), reshaped
12 October 2026 on the `live-room` branch into what Blaine asked for: a
**permanent link per director**, on a QR poster on the classroom wall. While
the director has Live on, every student's device on that link shows the exact
exercise on the director's page, each reading the part it chose. With Live
off, the link waits.

## What it does

**Director** (Choral and Unison pages; Pro or Educator, not a student
account): a mint **Live** button beside New exercise. It turns Live on and
opens the panel:

- the room's code, big enough to project (`482-KTZ`), its address
  (`abc-sightreading.com/live/482KTZ`) and a QR code to it. **The code never
  changes**: it is the director's room, made the first time and kept;
- how many devices are connected, and on which parts;
- **Start together**: every device counts in ("1, 2, Ready, Go") and then
  highlights each note in time, from one start on the server clock; **Stop**;
- **Print the poster** (`/live/poster`: "Scan to see the music", the QR,
  the address and the code; print once and leave it up), **Hide this**,
  **Turn Live off**;
- **Need a new link?**: a new code when a link has got out. The old address
  and its posters stop working; codes are never reused.

While Live is on the button shows the code and the device count. Whatever the
page draws is sent: every New exercise, history step, opened link, and every
change of chord symbols, solfège, rhythm syllables or tempo. The same score
twice is sent once. A reloaded page carries on while Live is on. Opening the
panel puts away the first visit's welcome card and any tour (`tourStepAside`
in tour.ts): it carries the code and QR the room needs to see.

**Students** (`/live/<code>`, the poster's address; `/live` to type a code,
and old `/live?code=` links land on the room's address): no account. With Live
off the page says "Waiting for <director>" and keeps listening; when Live comes
on the exercise appears with no tap. A device picks a part (Soprano, Alto, ...
or the full score), remembered in that browser for that room, so a bass sees
the bass part every day, after a reload, and when Live goes off and on again.
The part is drawn big on white paper in either theme, without its name down
the side, with a size control and the copyright line; chord symbols the
director shows are copied onto every part. "Hear my part" plays it. New
exercises replace the old with a "New exercise" badge; the part is kept.

**Nothing personal is kept.** A device sends a random id it made up
(localStorage `sr-live-device`) and its part, so the panel can count it.
/live renders with `Layout childSafe`: no analytics, no feedback form.

## How it works

- `src/lib/live.ts`: the rules, unit-tested in `tests/unit/live.test.ts`:
  codes (three digits then three letters, never mistakable for a class code),
  `livePath`, on-air and expiry (`LIVE_IDLE_MS` 3 h since the director's last
  activity, `LIVE_MAX_MS` 12 h from Live on), device counting
  (`DEVICE_WINDOW_MS` 40 s, heartbeats every 15 s), poll timing and backoff
  (slower while waiting), the ETag, publish validation, Start together timing
  and the clock offset, the per-instance rate limiter, the remembered part,
  and `extractVoice`, which takes one part out of a multi-voice score (held
  byte for byte to what `renderChoral` writes with the other voices hidden).
- Schema: `LiveRoom` (one per director, `teacherId` unique, `code` unique and
  permanent; the current `abc`, `version`, `settings`, `play`; on air while
  `endedAt` is unset and `endsAt` ahead) and `LiveDevice` (room, random device
  key, part, seen at). Migration `20261012000000_live_room`, additive only.
- `src/lib/server/live.ts`: `mayRunLive`, `ensureRoom`, `goLive`,
  `newRoomCode`, `ownRoom`, `roomByCode`, `directorName`.
- `src/pages/api/live/`:
  - `GET /api/live` the director's room (`?make=1` makes it, off air, for the
    poster); `POST { page }` Live on; `POST { action: "new-code" }`.
  - `GET /api/live/<code>?since=<version>` the students' poll, every 1.5 s
    while the page is seen: off air `{ live: false, director }`; on air
    `{ live: true, version, play }` plus the score when the version moved.
    ETag/304 and `Vercel-CDN-Cache-Control: max-age=1`, so a class costs about
    one query a second. `PUT { abc, settings }` publishes (owner, on air);
    `DELETE` is Live off (the room and address stay).
  - `POST /api/live/<code>/beat`, `GET /api/live/<code>/devices`,
    `POST /api/live/<code>/play`, `GET /api/live/time` as before.
- UI: `src/components/LiveTeacher.svelte`, `src/components/LiveStudent.svelte`,
  `src/pages/live.astro`, `src/pages/live/[code].astro`,
  `src/pages/live/poster.astro`; QR from `src/lib/qr.ts`
  (`qrcode-generator`, MIT).

## Push (26 October 2026)

Polling cost a CDN request a phone every 1.5 s: about 18,000 for a class of
thirty in a quarter of an hour, which Vercel counts even when the CDN answers
(10 M a month on Pro, then about $2 a million). At a thousand teachers using
Live most days that is hundreds of dollars a month. So devices now sit on a
WebSocket to a Cloudflare Durable Object, one per room
(`workers/live-push/`), and the site tells the room whenever the director
changes anything:

- `notifyRoom(code)` (server/live.ts) after a publish, a start or stop, Live
  on and Live off sends `roomState(code)` (the poll's own answer) to
  `POST /rooms/<code>/publish`; the room sends it to every socket.
  `notifyGone` after a new code tells the old room's devices and closes them.
- A device on a socket polls every 30 s (`PUSH_SAFETY_POLL_MS`) as a safety
  net, sends no heartbeat, and keeps the socket alive with a "ping" every 25 s
  that the service answers without waking the room. Its part goes up the
  socket. `isNewerState` stops a late poll answer or a late push putting an
  older score back.
- The director's count (`/devices`) merges the sockets
  (`GET /rooms/<code>/presence`) with the heartbeat devices (`mergeDevices`).
- Without the service (no `PUBLIC_LIVE_PUSH_URL`, or the socket cannot open:
  a school network that blocks WebSockets) a device polls and beats exactly as
  before, and retries the socket with backoff (`pushRetryMs`).

Measured with `PUSH=1 scripts/check-live.ts`: 0 polls and 0 heartbeats a
device in a quiet 12 s (8 polls and a heartbeat before), a new exercise on
both devices 0.3 s after the click (0.6 to 1.4 s before), and the count still
2 from the sockets once the heartbeat window has passed.

Cost on Cloudflare: Durable Objects with SQLite storage run on the free
Workers plan (limits per day); past those, the $5 a month Workers Paid plan.
A hibernating socket is not billed while it waits, and a change costs one
request plus a message a device.

**To switch it on** (once):

1. `cd workers/live-push && bunx wrangler login && bunx wrangler deploy`;
   note the URL it prints (`https://abc-live-push.<account>.workers.dev`).
2. Make a long random secret and give it to both sides:
   `bunx wrangler secret put PUSH_SECRET`, and in Vercel (Preview and
   Production) `LIVE_PUSH_SECRET` = the same.
3. In Vercel (Preview and Production): `LIVE_PUSH_URL` and
   `PUBLIC_LIVE_PUSH_URL` = the URL from step 1. `PUBLIC_` is read at build
   time, so redeploy after setting it.

Until then the site behaves exactly as before.

## Testing

- `bun run test` (live.test.ts included) and `bunx astro check`.
- With push, run the worker beside the dev server and pass the three
  variables (the secret is in `workers/live-push/.dev.vars`, local only):

  ```sh
  cd workers/live-push && bunx wrangler dev --port 8787 --ip 127.0.0.1
  # the dev server below, plus:
  LIVE_PUSH_URL=http://127.0.0.1:8787 PUBLIC_LIVE_PUSH_URL=http://127.0.0.1:8787 \
  LIVE_PUSH_SECRET=<.dev.vars PUSH_SECRET>
  APP=http://localhost:4472 PUSH=1 bun run scripts/check-live.ts
  ```
- End to end, `scripts/check-live.ts` (puppeteer-core, Chrome): one director
  and two phone-sized devices on a dev server **on a local database, never the
  shared one**. 23 checks: one permanent code; a device on the link while Live
  is off waits and turns to the exercise by itself; no welcome card over the
  panel; different parts, one staff each; the panel counts both; a new
  exercise reaches both (0.6 to 1.4 s after the click, generation included)
  and keeps their parts; Start together counts both in and runs their cursors;
  Live off sends both back to waiting; Live on again brings both back on their
  parts with no tap and the same code; a reload keeps the part; the poster
  carries the address, code and QR; an old `/live?code=` link lands on the
  room. Clean on Choral and Unison (`PAGE=unison`), light and dark (`THEME=`),
  12 October 2026. The welcome-card check fails with the fix removed.

  ```sh
  # the local database: Docker container abcsr-live-db on 127.0.0.1:54329
  DATABASE_URL=postgresql://postgres:localdev@127.0.0.1:54329/abcsr \
  BETTER_AUTH_SECRET=<any 32+ chars> BETTER_AUTH_URL=http://localhost:4472 \
  COMP_EMAILS=live-teacher@example.test bun run dev -- --port 4472
  APP=http://localhost:4472 SHOTS=/tmp bun run scripts/check-live.ts
  ```

  The script makes the teacher account on first run. Leave email, Stripe and
  Google keys out of that server's environment. A device that leaves stays in
  the count for up to 40 s, so wait that long between runs.

## Before it goes live

`bun run db:deploy` applies `20261012000000_live_room` to the shared database
(two new tables; nothing existing changes). The 7 October `live_practice`
migration was never applied anywhere shared and is gone.

## Follow-ups

- The director's own screen in Start together: devices count in and follow,
  the director's page does not yet start at the shared moment.
- Sound on Start together (devices are silent: thirty phones at once is
  noise); an opt-in "play my part" for headphones.
- The director picks or locks parts for devices.
- Grading in a live room (the data rules for students with no account first).
- Unison's playback transpose and instrument are not sent.

## Open questions for Blaine

1. Pro and Educator may run it, as built. Educator only?
2. Anyone with the link can watch while Live is on (it is on the wall, by
   design). Fine for sight-reading exercises?
3. Database cost: about one query a second per class plus heartbeats; worth a
   look at Prisma Postgres's operation pricing, and confirm the CDN cache on a
   preview (`x-vercel-cache: HIT` on the poll).
4. The name: "Live practice" and "Live".
