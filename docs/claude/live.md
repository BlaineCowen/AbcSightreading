# Live practice

Moved out of CLAUDE.md on 27 October 2026, word for word. Read it before touching Live rooms or the push worker.

## Live practice

A director's **permanent room** (notes/live-practice.md): one code per
director that never changes, at `/live/<code>`, on a printable QR poster
(`/live/poster`). With Live on (the Live button on Choral and Unison; Pro or
Educator), every student device on that link shows the exact exercise on the
director's page, each reading the part it chose (remembered per device and
room); with Live off it shows "Waiting for <director>" and turns to the
exercise by itself when Live comes on. No student accounts; nothing kept but a
random device id and its part. A student's view has a full screen button beside
its size buttons (`createFullscreen`, the music edge to edge for a tablet or
TV). Rules `src/lib/live.ts` (tests `live.test.ts`),
server `src/lib/server/live.ts`, API `src/pages/api/live/`, tables `LiveRoom`
and `LiveDevice`. Opening the Live panel puts the welcome card and any tour
away (`tourStepAside`). End to end: `scripts/check-live.ts`, on a local
database only (23 checks, Choral and Unison, clean 12 October 2026).
Devices sit on a WebSocket to a Cloudflare Durable Object per room
(`workers/live-push/`, 26 October 2026): polling every 1.5 s cost a CDN
request a phone each time, and Vercel bills those. The site POSTs the room's
state to it after every change the director makes (`notifyRoom`), a device
on a socket polls only every 30 s and sends no heartbeat, and the director's
count merges sockets and heartbeats (`mergeDevices`). Without
`PUBLIC_LIVE_PUSH_URL`, or where the socket cannot open, devices poll as
before. Switching it on (deploy, secret, three variables) and testing it
(`PUSH=1`): notes/live-practice.md, "Push".
