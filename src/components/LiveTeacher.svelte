<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Radio, X, Play, Square, Users, Printer } from "lucide-svelte";
  import { billingStatus } from "../lib/billing-client";
  import { signedInUser } from "../lib/auth-client";
  import { qrPath } from "../lib/qr";
  import { formatLiveCode, type LivePlay } from "../lib/live";

  /**
   * Live practice, the director's side (src/lib/live.ts): a Live button beside
   * Generate, for Pro and Educator. Each director has one room whose address
   * never changes (/live/482KTZ, on a QR poster on the wall). Live on, every
   * exercise the page draws, and every change to its key, words or chord
   * symbols, is sent to every student's device on that address, where each
   * reads only their own part. Live off, the address waits for next time.
   *
   * `abc` is the whole score, every voice, as the page would draw it with
   * nothing hidden; empty while there is none.
   */
  export let page: "choral" | "unison";
  export let abc: string;
  export let bpm: number;
  export let title = "";
  export let rhythm = false;

  type Room = { code: string; display: string; path: string; live: boolean; page: string; version: number };

  let allowed: boolean | null = null;
  let signedIn = false;
  /** A student account runs no session of its own: no button at all. */
  let isStudent = false;
  /** The room while this page has Live on; null with Live off. */
  let session: Room | null = null;
  let panelOpen = false;
  let busy = false;
  let problem = "";
  let connected = 0;
  let parts: Record<string, number> = {};
  let play: LivePlay | null = null;
  let playNote = "";
  let qr: { size: number; path: string } | null = null;
  let joinUrl = "";
  let joinHost = "";

  onMount(async () => {
    const [user, status] = await Promise.all([signedInUser(), billingStatus()]);
    signedIn = !!user;
    isStudent = user?.accountType === "student";
    allowed = !!status && status.plan !== "free" && user?.accountType !== "student";
    if (!allowed) return;
    // A reloaded page carries on while Live is on from this page.
    try {
      const res = await fetch("/api/live");
      const data = await res.json();
      if (data?.room?.live && data.room.page === page) useSession(data.room);
    } catch {}
  });

  function useSession(s: Room) {
    session = s;
    joinUrl = `${location.origin}${s.path}`;
    joinHost = `${location.host}${s.path}`;
    qr = qrPath(joinUrl);
    lastSent = "";
    startStatus();
  }

  async function start() {
    if (!allowed) {
      window.location.href = signedIn ? "/pricing" : `/login?next=${encodeURIComponent(location.pathname)}`;
      return;
    }
    if (session) {
      panelOpen = true;
      return;
    }
    busy = true;
    problem = "";
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        problem = data?.error ?? "Could not turn Live on.";
        panelOpen = true;
        return;
      }
      useSession(data.room);
      panelOpen = true;
    } catch {
      problem = "Could not reach the server.";
      panelOpen = true;
    } finally {
      busy = false;
    }
  }

  async function end() {
    if (!session) return;
    const code = session.code;
    stopStatus();
    session = null;
    play = null;
    panelOpen = false;
    connected = 0;
    parts = {};
    try {
      await fetch(`/api/live/${code}`, { method: "DELETE" });
    } catch {}
  }

  /** A new address for the room, for a link that has got out: the old one and its posters stop working. Live stays on. */
  async function newLink() {
    if (!session) return;
    if (!confirm("Make a new live link? The old link and any posters of it stop working, and students need the new one.")) return;
    try {
      const made = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "new-code" }),
      });
      if (!made.ok) throw new Error();
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      useSession(data.room);
    } catch {
      problem = "Could not make a new link.";
    }
  }

  // ── Publishing ─────────────────────────────────────────────────────────
  // Whatever the page draws is sent, a moment after it settles; the same
  // score twice is sent once.
  let lastSent = "";
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  $: if (session && abc) schedulePublish(abc, bpm, title, rhythm);

  function schedulePublish(score: string, tempo: number, name: string, rhythmOnly: boolean) {
    const payload = JSON.stringify({ abc: score, settings: { bpm: tempo, title: name, ...(rhythmOnly ? { rhythm: true } : {}) } });
    if (payload === lastSent) return;
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = setTimeout(() => publish(payload), 250);
  }

  async function publish(payload: string) {
    if (!session) return;
    try {
      const res = await fetch(`/api/live/${session.code}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.offAir) return ended();
      if (!res.ok) {
        problem = data?.error ?? "Could not send the exercise.";
        return;
      }
      lastSent = payload;
      problem = "";
      if (session) session = { ...session, version: data.version };
    } catch {
      problem = "Could not reach the server. The exercise will be sent when it is back.";
      // Try again on the next status check.
      lastSent = "";
    }
  }

  function ended() {
    stopStatus();
    session = null;
    play = null;
    problem = "Live went off after a long time without use. Turn it on again to carry on: the link is the same.";
    panelOpen = true;
  }

  // ── Devices ────────────────────────────────────────────────────────────
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  function startStatus() {
    stopStatus();
    void checkStatus();
    statusTimer = setInterval(checkStatus, 4000);
  }
  function stopStatus() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = null;
  }
  async function checkStatus() {
    if (!session || document.hidden) return;
    try {
      const res = await fetch(`/api/live/${session.code}/devices`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.open) return ended();
      connected = data.connected;
      parts = data.parts ?? {};
      if (!lastSent && abc) schedulePublish(abc, bpm, title, rhythm);
    } catch {}
    if (play && Date.now() > playEndsLocal) play = null;
  }
  onDestroy(() => {
    stopStatus();
    if (publishTimer) clearTimeout(publishTimer);
    if (countdownTimer) clearInterval(countdownTimer);
  });

  // ── Start together ─────────────────────────────────────────────────────
  let playEndsLocal = 0;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  async function startTogether(on: boolean) {
    if (!session) return;
    try {
      const sent = Date.now();
      const res = await fetch(`/api/live/${session.code}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: on, bpm }),
      });
      const received = Date.now();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        problem = data?.error ?? "Could not start.";
        return;
      }
      play = data.play;
      if (play) {
        // Close enough for a countdown on this screen: the server's clock less half the round trip.
        const offset = data.serverNow - (sent + received) / 2;
        const startsLocal = play.at - offset;
        playEndsLocal = startsLocal + 10 * 60 * 1000;
        if (countdownTimer) clearInterval(countdownTimer);
        const tickDown = () => {
          const left = Math.ceil((startsLocal - Date.now()) / 1000);
          playNote = left > 0 ? `Counting in on every device in ${left}…` : "Every device is counting in and following.";
          if (left <= 0 && countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
          }
        };
        tickDown();
        countdownTimer = setInterval(tickDown, 250);
      } else {
        playNote = "";
      }
    } catch {
      problem = "Could not reach the server.";
    }
  }

  $: partList = Object.entries(parts)
    .filter(([k]) => k)
    .map(([k, n]) => `${k === "all" ? "Full score" : k} ${n}`)
    .join(" · ");

  /** A share of the room shown as the poster's address: "abc-sightreading.com/live/482KTZ". */
  $: shortUrl = joinHost.replace(/^www\./, "");

  function onKey(e: KeyboardEvent) {
    if (panelOpen && e.key === "Escape") panelOpen = false;
  }
</script>

<svelte:window on:keydown={onKey} />

{#if isStudent}
  <!-- nothing: students follow a session at /live -->
{:else if session}
  <button
    class="live-btn sr-btn-live-on shrink-0 no-print"
    on:click={() => (panelOpen = true)}
    title="Live is on: every student's device on your live link follows this page"
  >
    <span class="live-dot" aria-hidden="true"></span>
    <span class="tabular-nums tracking-wide">{session.display}</span>
    <span class="flex items-center gap-0.5 tabular-nums" aria-label="{connected} devices connected"><Users size={14} />{connected}</span>
  </button>
{:else}
  <button
    class="live-btn sr-btn-live shrink-0 no-print"
    on:click={start}
    disabled={busy}
    title={allowed === false ? "Live practice is part of Pro" : "Live: show this page's exercise on every student's device, each with their own part"}
  >
    <Radio size={16} />
    <span>Live</span>
    {#if allowed === false}<span class="live-pro-tag">Pro</span>{/if}
  </button>
{/if}

{#if panelOpen}
  <div class="fixed inset-0 z-[60] live-scrim flex items-center justify-center p-3 sm:p-6 no-print" role="presentation" on:click|self={() => (panelOpen = false)}>
    <div class="live-card bg-sr-raise text-sr-ink border border-sr-hairline rounded-[28px] shadow-2xl w-full max-w-3xl max-h-full overflow-y-auto p-5 sm:p-8" role="dialog" aria-modal="true" aria-label="Live practice">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="font-display text-2xl sm:text-3xl font-bold">Live practice</h2>
          {#if session}
            <p class="text-sr-muted text-sm sm:text-base mt-1">Live is on. Students scan the code or open <strong class="text-sr-ink" data-live-url>{shortUrl}</strong>, pick their part, and see only that. The link never changes: put the poster up once and leave it.</p>
          {/if}
        </div>
        <button class="sr-icon-btn h-10 w-10 flex items-center justify-center shrink-0" on:click={() => (panelOpen = false)} aria-label="Hide"><X size={22} /></button>
      </div>

      {#if problem}
        <p class="mt-4 rounded-xl bg-sr-brass-bg text-sr-brass px-4 py-3 text-sm" role="status">{problem}</p>
      {/if}

      {#if session}
        <div class="mt-5 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
          <div class="flex-1 text-center sm:text-left">
            <p class="sr-label">Your live code</p>
            <p class="live-code font-display font-bold tabular-nums text-sr-ink" data-live-code={session.code}>{session.display}</p>
            <p class="mt-3 flex items-center justify-center sm:justify-start gap-2 text-lg font-semibold">
              <Users size={20} /> <span data-live-connected>{connected}</span> {connected === 1 ? "device" : "devices"} connected
            </p>
            {#if partList}<p class="text-sm text-sr-muted mt-1">{partList}</p>{/if}
            <p class="text-xs text-sr-faint mt-2">
              {#if session.version > 0}Exercise {session.version} is on every device. Generate and it follows.{:else}Generate an exercise and it appears on every device.{/if}
            </p>
          </div>
          {#if qr}
            <div class="live-qr bg-sr-paper rounded-2xl p-3 shrink-0">
              <svg viewBox="0 0 {qr.size} {qr.size}" class="w-44 h-44 sm:w-56 sm:h-56" shape-rendering="crispEdges" role="img" aria-label="QR code for {joinUrl}">
                <path d={qr.path} class="live-qr-dots" />
              </svg>
            </div>
          {/if}
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-2">
          {#if play}
            <button class="sr-btn flex items-center gap-1.5" on:click={() => startTogether(false)}><Square size={16} />Stop</button>
          {:else}
            <button class="sr-btn flex items-center gap-1.5" on:click={() => startTogether(true)} disabled={session.version === 0} title="Every device counts in together and follows with its cursor">
              <Play size={16} />Start together
            </button>
          {/if}
          <a class="sr-btn-quiet flex items-center gap-1.5" href="/live/poster" target="_blank" rel="noopener"><Printer size={16} />Print the poster</a>
          <button class="sr-btn-quiet" on:click={() => (panelOpen = false)}>Hide this</button>
          <button class="sr-btn-quiet ml-auto text-sr-danger" on:click={end} data-live-off>Turn Live off</button>
        </div>
        {#if playNote}<p class="text-sm text-sr-muted mt-2" role="status">{playNote}</p>{/if}
        <p class="text-xs text-sr-faint mt-4">
          Students need no account. Nothing about them is kept: each device is counted, not named. With Live off, the link shows a waiting page.
          <button class="sr-link" on:click={newLink}>Need a new link?</button>
        </p>
      {:else if !problem}
        <p class="mt-4 text-sr-muted">Turning Live on…</p>
      {:else}
        <button class="sr-btn mt-4" on:click={start}>Turn Live on</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* The size and shape of the score toolbar's buttons beside it (Display, Drill, Video). */
  .live-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 2.5rem;
    padding: 0 16px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 800;
  }
  .live-btn:disabled {
    opacity: 0.5;
  }
  .sr-btn-live {
    background: var(--sr-mint);
    color: var(--sr-mint-ink);
  }
  .sr-btn-live:hover:not(:disabled) {
    background: var(--sr-mint);
    filter: brightness(0.96);
  }
  .sr-btn-live-on {
    background: var(--sr-mint-ink);
    color: var(--sr-mint);
  }
  .sr-btn-live-on:hover:not(:disabled) {
    background: var(--sr-mint-ink);
    filter: brightness(1.15);
  }
  .live-pro-tag {
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    padding: 3px 7px;
    border-radius: 999px;
    background: var(--sr-mint-ink);
    color: var(--sr-mint);
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--sr-mint);
    animation: live-pulse 1.6s ease-in-out infinite;
  }
  @keyframes live-pulse {
    50% { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot { animation: none; }
  }
  .live-code {
    /* One line however wide: "482-" over "KTZ" reads as two codes. */
    white-space: nowrap;
    font-size: clamp(2.75rem, 10vw, 6rem);
    line-height: 1;
    letter-spacing: 0.04em;
  }
  .live-scrim {
    background: rgb(var(--sr-bar-rgb) / 0.35);
  }
  .live-qr-dots {
    fill: var(--sr-bar);
  }
  .font-display {
    font-family: var(--sr-font-display);
  }
</style>
