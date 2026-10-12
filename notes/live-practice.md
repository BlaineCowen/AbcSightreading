# Live practice

Built 7 October 2026 on the `live-practice` branch (from `grading`).
Sight Reading Factory's "Live Practice", matched and beaten: a teacher's
exercise on every student's own device, each showing only their part, and
every new exercise arriving on all of them within two seconds.

## What it does

**Teacher** (Choral page and Unison page, Pro or Educator): a mint **Live**
button beside Generate (hidden for student accounts and while an assignment
is open; a free or signed-out teacher sees it with a Pro tag and is sent to
/pricing or /login). Pressing it starts a session and opens a panel:

- the code, big enough to project (`482-KTZ`), and a QR code to
  `<site>/live?code=482KTZ`;
- how many devices are connected, and how many on each part;
- **Start together**: every device shows a count-in ("1, 2, Ready, Go", the
  page's own count-in words) and then highlights each note as it comes, in
  time, from one start on the server clock; **Stop** clears it;
- **Hide this** (the Live button then shows the code and the device count,
  and opens the panel again) and **End session**.

From then on whatever the page draws is sent: every Generate, history
step, opened link, and every change of chord symbols, solfège, rhythm
syllables or tempo. The same score twice is sent once. A reloaded page picks
its open session up again.

**Student** (`/live`, linked from /join and the account page): type the
code (or open the QR link), pick a part (Soprano, Alto, ... or the full
score; remembered per session in this browser), and that part is drawn big
on white paper in either theme, without the part's name down the side,
bars per line from `score-layout.ts`, a size control, the copyright line.
Chord symbols the teacher shows are copied onto every part (they are written
on the top voice). "Hear my part" plays it with abcjs and highlights the
notes. New exercises replace the old with a "New exercise" badge; the part
is kept. When the teacher ends the session the page says so.

**No account, nothing personal.** A device sends a random id it made up
(localStorage `sr-live-device`) and the part it reads, so the teacher's
panel can count it. /live renders with `Layout childSafe`: no analytics, no
feedback form, the same as a student account's pages. Signed-in students
use it the same way. Unlike SRF, students need no paid seat.

## How it works

- `src/lib/live.ts`: every rule, unit-tested in `tests/unit/live.test.ts`
  (28 tests, looped 20 times): codes (three digits then three letters, the
  class-code alphabet reversed so the two can never be confused, with hints
  that say "that looks like a class code"), expiry, device counting, poll
  timing and backoff, the ETag, publish validation, the Start together
  timing and the NTP-style clock offset, a per-instance rate limiter, and
  `extractVoice`, which takes one part out of a multi-voice score. It is
  tested against the assembler itself: for a generated SATB exercise, in
  every display (plain, solfège, chord symbols, both), each extracted part
  equals byte for byte what `renderChoral` writes with the other three
  voices hidden, lifted chord symbols included.
- `src/lib/server/live.ts` and `src/pages/api/live/`:
  - `POST /api/live { page }` starts a session (signed in, `hasPremium`, not
    a student account; checked on the server). It ends the teacher's other
    open sessions and deletes sessions finished more than a day ago.
    `GET /api/live` returns the open one.
  - `GET /api/live/<code>?since=<version>` is the students' poll, every
    1.5 s while the page is seen, 6 s hidden, backing off on errors. It
    answers `{ version, play }` and, only when the version differs from
    `since`, the score `{ abc, settings, page }`; ETag/304; and
    `Vercel-CDN-Cache-Control: max-age=1`, so every device in a room asking
    the same address costs about one database query a second per class.
  - `PUT /api/live/<code> { abc, settings }` publishes (owner only; version
    + 1, pushes the expiry back). `DELETE` ends it.
  - `POST /api/live/<code>/beat { device, part }` every 15 s from each
    device (one `updateMany` in the usual case; at most 400 devices).
  - `GET /api/live/<code>/devices` for the teacher's panel every 4 s:
    devices seen in the last 40 s, by part; keeps the session alive.
  - `POST /api/live/<code>/play { start, bpm }` sets or clears the start:
    `{ id, at, bpm, version }`, `at` 3.5 s from now on the server clock.
  - `GET /api/live/time` is the server clock; each device takes five
    readings and trusts the quickest round trip.
- Sessions end when ended, or 3 hours after the teacher's last activity
  (publish, Start together, or the panel being open), and never more than 12
  hours after starting.
- Rate limits are in memory per server instance (a guard, not a quota):
  polls per address loose (a class shares a school's address), unknown codes
  30 a minute per address (stops guessing), heartbeats 12 a minute per
  device, teacher calls 240 a minute.
- UI: `src/components/LiveTeacher.svelte` (the button and panel, QR from
  `src/lib/qr.ts` on the small MIT `qrcode-generator` package),
  `src/components/LiveStudent.svelte`, `src/pages/live.astro`. Choral sends
  `renderCurrent({ ...displayOptions(), hiddenVoices: [] })` (every voice
  whatever the teacher hides on their own screen); Unison sends
  `withChosenAnnotations(renderedString[0])`.

## Testing

- `bun run test`: 1459 pass, 5 skip, 0 fail (live.test.ts included).
- `bunx astro check`: 0 errors, 0 warnings.
- End to end, `scripts/check-live.ts` (puppeteer-core, Chrome): one teacher
  and two phone-sized student devices on a dev server. It checks the code,
  that the students read different parts and each is drawn one staff, that
  the panel counts both, that a new Generate reaches both (0.5 to 1.7 s
  after the click, generation included), that the part is kept, that Start
  together counts both in and runs their cursors, and that End session ends
  both. Passed on Choral and Unison (`PAGE=unison`), light and dark
  (`THEME=`). To run it:

  ```sh
  DATABASE_URL=postgresql://postgres:localdev@127.0.0.1:54329/abcsr \
  BETTER_AUTH_SECRET=<any 32+ chars> BETTER_AUTH_URL=http://localhost:4472 \
  COMP_EMAILS=live-teacher@example.test bun run dev -- --port 4472
  # once: sign up live-teacher@example.test (password LiveTest!2026pw) at /login
  APP=http://localhost:4472 SHOTS=/tmp bun run scripts/check-live.ts
  ```

  Never against the shared database.

## The migration to apply later

`prisma/migrations/20261007000000_live_practice/migration.sql`: two new
tables, `live_session` and `live_device`, their indexes and foreign keys
(cascade from `user`). Additive only; nothing existing changes. Applied to
the local Docker database only. For production, read it and run
`bun run db:deploy` when this branch is merged.

## Follow-ups

- **The teacher's own screen in Start together**: the devices count in and
  follow, but the teacher's page does not (its Play has its own count-in and
  synth). Next: start the page's playback at the shared moment, so the
  projected full score follows too.
- **Sound on Start together**: devices are silent then (thirty phones
  playing at once is noise). An opt-in "play my part" for headphones, and a
  click on the teacher's device only, would be easy on the same timing.
- **Accuracy of Start together**: measured only as "both devices count in
  and follow"; the clock offset is within half the quickest round trip
  (usually under 30 ms on school wifi). A check that compares two devices'
  cursor times would put a number on it.
- **Teacher picks parts for devices**, or locks the part choice; and a
  "follow the bouncing note" size for the full score on a tablet.
- **Grade in live sessions**: each student runs Listen and grade on their
  own part, results to the teacher's panel. The data rules (under 13, no
  account) need deciding first.
- Polling could move to server-sent events if Vercel's limits allow; the
  1 s CDN cache makes polling cheap enough for now.
- Unison's playback transpose and instrument are not sent: devices hear
  piano at written pitch.

## Open questions for Blaine

1. **Who may run it**: Pro and Educator (any paid plan), as built. SRF ties
   it to its ensemble plans. Educator only?
2. **Students need no account at all.** That is the point, and nothing about
   them is stored, but it also means anyone with the code can watch. Fine for
   sight-reading exercises? (Codes are 6.2 million to one, guessing is rate
   limited, sessions end within hours.)
3. **Database cost**: with the CDN cache a class polling costs about one
   query a second plus two heartbeat writes a second per 30 devices. Prisma
   Postgres bills by operation: worth a look at the plan's numbers before
   launch, and the CDN caching should be confirmed on a preview deploy
   (response header `x-vercel-cache: HIT`).
4. **The name**: "Live practice" and "Live" on the button. "Live" may read
   as streaming video; alternatives: "Class screens", "Share to class".
5. **Assignments**: Live is hidden while an assignment is open on the page.
   Right?
