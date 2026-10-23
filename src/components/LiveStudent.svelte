<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import abcjs from "abcjs";
  import { Minus, Plus, Play, Square, Radio, Maximize, Minimize } from "lucide-svelte";
  import {
    FULL_SCORE,
    HEARTBEAT_MS,
    clockOffset,
    extractVoice,
    formatLiveCode,
    isLiveCode,
    isLivePlay,
    liveCodeHint,
    livePath,
    partKeys,
    rememberedPart,
    normalizeLiveCode,
    playTiming,
    pollDelayMs,
    voicesOf,
    withoutPartNames,
    type ClockSample,
    type LivePlay,
    type LiveSettings,
    type LiveVoice,
  } from "../lib/live";
  import { barCount, drawnLines, evenLines, isDense, measuresPerLine } from "../lib/score-layout";
  import { styleCopyright, withCopyright } from "../lib/copyright";
  import { countInBeats, countInWords } from "../lib/count-in";
  import { createFullscreen } from "../lib/fullscreen";

  /**
   * Live practice, the student's side: a director's room, by the address on
   * their poster (/live/482KTZ) or the code typed at /live. While the
   * director has Live on, the device shows their exercise, only the part it
   * chose, big, and follows every new one within a couple of seconds. With
   * Live off it waits, and the music appears by itself when Live comes on.
   * No account and nothing personal: the device makes up a random id so the
   * director's panel can count it, and remembers its part in this browser.
   */

  /** The code in the address (/live/<code>), when there is one. */
  export let initialCode = "";

  type Phase = "enter" | "joining" | "waiting" | "live";
  let phase: Phase = "enter";
  /** Whose room this is, for the waiting screen: the director's account name. */
  let director = "";
  let codeInput = "";
  let code = "";
  let problem = "";

  let version = -1;
  let abc = "";
  let settings: LiveSettings | null = null;
  let voices: LiveVoice[] = [];
  let part: string | null = null;
  let choosing = false;
  let online = true;
  let fresh = false;
  let freshTimer: ReturnType<typeof setTimeout> | null = null;

  // ── This device ────────────────────────────────────────────────────────
  const store = {
    get(key: string): string | null {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key: string, value: string) {
      try { localStorage.setItem(key, value); } catch {}
    },
  };
  function deviceKey(): string {
    const saved = store.get("sr-live-device");
    if (saved && /^[A-Za-z0-9]{12,40}$/.test(saved)) return saved;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const key = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
    store.set("sr-live-device", key);
    return key;
  }
  let device = "";

  /** How big the music is drawn: a narrower staff, scaled up to the screen. */
  const SIZES = [0.8, 1, 1.25, 1.5, 1.8, 2.2];
  let sizeIndex = 2;

  /**
   * Full screen: the music alone across a tablet or a TV, the site's header
   * and footer gone (the practice pages' full screen, src/lib/fullscreen.ts;
   * inside the window where the browser has none). F toggles it, Esc leaves.
   */
  let fs: ReturnType<typeof createFullscreen> | null = null;
  let fsOn = false;
  let offFs: (() => void) | null = null;

  onMount(() => {
    fs = createFullscreen();
    offFs = fs.active.subscribe((on) => (fsOn = on));
    device = deviceKey();
    const savedSize = Number(store.get("sr-live-size"));
    if (Number.isInteger(savedSize) && savedSize >= 0 && savedSize < SIZES.length) sizeIndex = savedSize;
    const fromLink = initialCode || new URLSearchParams(location.search).get("code");
    if (fromLink) {
      codeInput = formatLiveCode(normalizeLiveCode(fromLink));
      if (isLiveCode(normalizeLiveCode(fromLink))) void join();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
  });

  $: codeHint = liveCodeHint(codeInput);
  $: codeOk = isLiveCode(normalizeLiveCode(codeInput));

  async function join() {
    const c = normalizeLiveCode(codeInput);
    if (!isLiveCode(c)) return;
    phase = "joining";
    problem = "";
    code = c;
    version = -1;
    const ok = await poll(true);
    if (!ok && phase === "joining") phase = "enter";
    if (phase === "live" || phase === "waiting") {
      if (location.pathname !== livePath(c)) history.replaceState(null, "", livePath(c));
      void measureClock();
      sendBeat();
    }
  }

  function leave(why = "") {
    stopLoops();
    stopSound();
    stopFollow();
    phase = "enter";
    code = "";
    abc = "";
    version = -1;
    part = null;
    problem = why;
    history.replaceState(null, "", "/live");
  }

  // ── Polling ────────────────────────────────────────────────────────────
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let failures = 0;

  function stopLoops() {
    if (pollTimer) clearTimeout(pollTimer);
    if (beatTimer) clearInterval(beatTimer);
    pollTimer = null;
    beatTimer = null;
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    if (phase !== "live" && phase !== "waiting") return;
    pollTimer = setTimeout(() => void poll(false), pollDelayMs({ hidden: document.hidden, failures, waiting: phase === "waiting" }));
  }

  function onVisibility() {
    // Back in view: check at once rather than wait out the slow hidden poll.
    if (!document.hidden && (phase === "live" || phase === "waiting")) void poll(false);
  }

  /** Live off: put the music away and wait. The part is kept for when it comes back. */
  function wait() {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null;
    stopSound();
    stopFollow();
    abc = "";
    version = -1;
    voices = [];
    choosing = false;
    phase = "waiting";
  }

  /** One check of the room. Answers whether the room was found. */
  async function poll(first: boolean): Promise<boolean> {
    try {
      const res = await fetch(`/api/live/${code}?since=${version}`);
      if (res.status === 404) {
        problem = first
          ? "No live room has that code. Check it with your director."
          : "This live link no longer works. Ask your director for the new one.";
        stopLoops();
        if (!first) leave(problem);
        return false;
      }
      if (res.status === 429) {
        failures++;
        schedulePoll();
        return true;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      failures = 0;
      online = true;
      if (data.live === false) {
        director = typeof data.director === "string" ? data.director : "";
        if (phase !== "waiting") wait();
        schedulePoll();
        return true;
      }
      if (phase !== "live") {
        phase = "live";
        if (!beatTimer) beatTimer = setInterval(sendBeat, HEARTBEAT_MS);
        if (!first) sendBeat();
      }
      if (typeof data.abc === "string" && data.version !== version) {
        const firstScore = version < 0 || !abc;
        version = data.version;
        settings = data.settings ?? null;
        await useScore(data.abc, !firstScore);
      }
      handlePlay(isLivePlay(data.play) ? data.play : null);
    } catch {
      failures++;
      online = false;
      if (first) {
        problem = "Could not reach the server. Check the connection and try again.";
        return false;
      }
    }
    schedulePoll();
    return true;
  }

  async function sendBeat() {
    if (phase !== "live" || !device) return;
    try {
      const res = await fetch(`/api/live/${code}/beat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, part }),
      });
      if (res.status === 409) void poll(false);
    } catch {}
  }

  // ── The score and the part ─────────────────────────────────────────────
  async function useScore(next: string, isNew: boolean) {
    stopSound();
    abc = next;
    voices = abc ? voicesOf(abc) : [];
    // The part read just now if this score has it, else the one this device chose before for these voices.
    const chosen = part && voices.some((v) => v.id === part) ? part : rememberedPart(store.get, code, voices);
    part = chosen;
    choosing = !chosen && voices.length > 1;
    if (isNew && abc) {
      fresh = true;
      if (freshTimer) clearTimeout(freshTimer);
      freshTimer = setTimeout(() => (fresh = false), 2500);
    }
    await tick();
    draw();
  }

  function pick(id: string) {
    part = id;
    choosing = false;
    for (const key of partKeys(code, voices)) store.set(key, id);
    sendBeat();
    stopSound();
    tick().then(draw);
  }

  $: partName = part === FULL_SCORE ? "Full score" : voices.find((v) => v.id === part)?.name ?? "";
  $: shown = abc && part ? (part === FULL_SCORE ? abc : extractVoice(abc, part)) : "";
  $: meter = /^M:\s*(\S+)/m.exec(abc)?.[1] ?? "4/4";
  $: keyName = /^K:\s*([A-G][b#]?m?)/m.exec(abc)?.[1] ?? "";
  $: heading = settings?.title || [keyName && keyLabel(keyName), meter].filter(Boolean).join(" · ");
  const keyLabel = (k: string) => (k.endsWith("m") ? `${k.slice(0, -1)} minor` : `${k} major`);

  let paper: HTMLDivElement;
  let tune: any = null;

  function draw() {
    if (!paper || !shown) {
      tune = null;
      return;
    }
    const cw = paper.clientWidth || 360;
    const scale = SIZES[sizeIndex];
    const narrow = cw < 480;
    const render = (most?: number) =>
      abcjs.renderAbc(paper, withCopyright(part === FULL_SCORE ? shown : withoutPartNames(shown)), {
        add_classes: true,
        responsive: "resize",
        staffwidth: Math.max(150, Math.round(Math.min(900, cw - 16) / scale)),
        wrap: {
          minSpacing: 1.2,
          maxSpacing: 2.7,
          preferredMeasuresPerLine: measuresPerLine({
            measures: barCount(shown) || 4,
            narrow: narrow || scale >= 1.5,
            dense: isDense({ lyrics: /^w:/m.test(shown), abc: shown }),
            most,
          }),
        },
      } as any);
    let result = render();
    let lines = drawnLines(paper);
    let most = Math.max(...lines);
    while (!evenLines(lines) && most >= 1) {
      result = render(most);
      lines = drawnLines(paper);
      most = Math.min(most - 1, Math.max(...lines));
    }
    styleCopyright(paper);
    tune = result?.[0] ?? null;
  }

  function resize(delta: number) {
    sizeIndex = Math.max(0, Math.min(SIZES.length - 1, sizeIndex + delta));
    store.set("sr-live-size", String(sizeIndex));
    draw();
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWidth = 0;
  function onResize() {
    if (!paper || paper.clientWidth === lastWidth) return;
    lastWidth = paper.clientWidth;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 200);
  }

  // ── Following the music: highlight the note being sung ─────────────────
  let follower: any = null;
  function stopFollow() {
    try { follower?.stop(); } catch {}
    follower = null;
    clearHighlight();
    countWord = null;
    for (const t of countTimers) clearTimeout(t);
    countTimers = [];
  }
  function clearHighlight() {
    paper?.querySelectorAll(".live-now").forEach((el) => el.classList.remove("live-now"));
  }
  function follow(bpm: number, fromSeconds = 0, onEnd?: () => void) {
    if (!tune) return;
    follower = new (abcjs as any).TimingCallbacks(tune, {
      qpm: bpm,
      eventCallback: (ev: any) => {
        clearHighlight();
        if (!ev) {
          onEnd?.();
          return "continue";
        }
        for (const group of ev.elements ?? []) for (const el of group) el.classList?.add("live-now");
        return undefined;
      },
    });
    if (fromSeconds > 0) follower.start(fromSeconds, "seconds");
    else follower.start();
  }

  // ── Hear my part ───────────────────────────────────────────────────────
  let audio: AudioContext | null = null;
  let synth: any = null;
  let sounding = false;
  let preparing = false;
  async function hear() {
    if (sounding) return stopSound();
    if (!tune) return;
    preparing = true;
    try {
      audio ??= new AudioContext();
      await audio.resume();
      synth = new abcjs.synth.CreateSynth();
      await synth.init({
        audioContext: audio,
        visualObj: tune,
        options: { qpm: settings?.bpm ?? 90, soundFontUrl: "/api/soundfont/" },
      } as any);
      await synth.prime();
      stopFollow();
      synth.start();
      sounding = true;
      follow(settings?.bpm ?? 90, 0, () => (sounding = false));
    } catch {
      problem = "Could not play the part on this device.";
    } finally {
      preparing = false;
    }
  }
  function stopSound() {
    try { synth?.stop(); } catch {}
    synth = null;
    if (sounding) stopFollow();
    sounding = false;
  }

  // ── Start together ─────────────────────────────────────────────────────
  let offset = 0;
  let clockKnown = false;
  async function measureClock() {
    const samples: ClockSample[] = [];
    for (let i = 0; i < 5; i++) {
      try {
        const sent = Date.now();
        const res = await fetch("/api/live/time", { cache: "no-store" });
        const { now } = await res.json();
        samples.push({ sent, server: now, received: Date.now() });
      } catch {}
    }
    const r = clockOffset(samples);
    if (r) {
      offset = r.offset;
      clockKnown = true;
    }
  }

  let playedId: string | null = null;
  let countWord: string | null = null;
  let countBeat = 0;
  let countTimers: ReturnType<typeof setTimeout>[] = [];
  let together = false;

  async function handlePlay(play: LivePlay | null) {
    if (!play) {
      if (together) {
        together = false;
        stopFollow();
      }
      playedId = null;
      return;
    }
    if (play.id === playedId || play.version !== version) return;
    if (!clockKnown) await measureClock();
    if (!tune) return;
    const beats = countInBeats(meter);
    const t = playTiming(play, offset, Date.now(), beats);
    const durationMs = (tune.getTotalTime?.() ?? 0) * 1000 * ((settings?.bpm ?? play.bpm) / play.bpm);
    // A start long finished is not started again.
    if (Date.now() > t.musicAt + Math.max(durationMs, 60_000)) return;
    playedId = play.id;
    stopSound();
    stopFollow();
    together = true;
    const words = countInWords(meter);
    for (let b = 0; b < beats; b++) {
      const at = t.countInAt + b * t.beatMs - Date.now();
      if (at < -t.beatMs) continue;
      countTimers.push(setTimeout(() => { countWord = words[b]; countBeat = b; }, Math.max(0, at)));
    }
    const late = Date.now() - t.musicAt;
    countTimers.push(
      setTimeout(() => {
        countWord = null;
        follow(play.bpm, Math.max(0, (Date.now() - t.musicAt) / 1000), () => (together = false));
      }, Math.max(0, -late)),
    );
  }

  onDestroy(() => {
    offFs?.();
    fs?.destroy();
    stopLoops();
    stopSound();
    stopFollow();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
    audio?.close().catch(() => {});
  });

  const input =
    "w-full border border-sr-hairline bg-sr-raise text-sr-ink rounded-2xl px-4 py-3 text-2xl text-center font-bold tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-sr-action";
</script>

{#if phase === "enter" || phase === "joining"}
  <div class="w-full max-w-sm sr-panel p-6 flex flex-col gap-4">
    <form class="flex flex-col gap-3" on:submit|preventDefault={join}>
      <label class="flex flex-col gap-2 text-sm text-sr-ink-2 font-semibold">
        Live code
        <input
          class="{input} uppercase"
          bind:value={codeInput}
          placeholder="482-KTZ"
          maxlength="9"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          inputmode="text"
          aria-describedby="live-code-hint"
          required
        />
        <span id="live-code-hint" class="text-xs font-normal {codeHint ? 'text-sr-danger' : 'text-sr-faint'}" role="status">
          {codeHint ?? "The code your teacher shows: three numbers, then three letters."}
        </span>
      </label>
      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      <button class="sr-btn text-base py-3" type="submit" disabled={!codeOk || phase === "joining"}>
        {phase === "joining" ? "Joining…" : "Join"}
      </button>
    </form>
    <p class="text-xs text-sr-faint">No account needed. Nothing about you is sent.</p>
  </div>
{:else if phase === "waiting"}
  <div class="w-full max-w-md sr-panel p-6 sm:p-8 flex flex-col items-center gap-3 text-center" data-live-waiting>
    <span class="live-chip"><span class="live-dot off" aria-hidden="true"></span><Radio size={14} /><span class="tabular-nums tracking-wide">{formatLiveCode(code)}</span></span>
    <p class="font-display text-2xl font-bold text-sr-ink">{director ? `Waiting for ${director}` : "Waiting for your director"}</p>
    <p class="text-sr-muted">Live is off right now. Keep this page open: the music appears here as soon as it goes on.</p>
    {#if part}<p class="text-sm text-sr-faint">You'll see your part again.</p>{/if}
  </div>
{:else}
  <div class="live-view w-full flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="live-chip" title={online ? "Connected" : "Reconnecting"}>
        <span class="live-dot {online ? '' : 'off'}" aria-hidden="true"></span>
        <Radio size={14} />
        <span class="tabular-nums tracking-wide">{formatLiveCode(code)}</span>
        {#if !online}<span class="text-xs">reconnecting</span>{/if}
      </span>
      {#if voices.length > 1 && part}
        <button class="sr-tok" on:click={() => (choosing = true)} data-live-part={part}>{partName} · change</button>
      {/if}
      <div class="ml-auto flex items-center gap-1">
        <button class="sr-icon-btn h-10 w-10 flex items-center justify-center" on:click={() => resize(-1)} disabled={sizeIndex === 0} aria-label="Smaller"><Minus size={18} /></button>
        <button class="sr-icon-btn h-10 w-10 flex items-center justify-center" on:click={() => resize(1)} disabled={sizeIndex === SIZES.length - 1} aria-label="Bigger"><Plus size={18} /></button>
        <button class="sr-icon-btn h-10 w-10 flex items-center justify-center" on:click={() => fs?.toggle()} aria-pressed={fsOn}
          aria-label={fsOn ? "Leave full screen" : "Full screen"} title={fsOn ? "Leave full screen (Esc)" : "Full screen (F)"} data-live-fullscreen>
          {#if fsOn}<Minimize size={18} />{:else}<Maximize size={18} />{/if}
        </button>
      </div>
    </div>

    {#if choosing}
      <div class="sr-panel p-5">
        <p class="font-display text-xl font-bold text-sr-ink mb-3">Which part do you sing?</p>
        <div class="grid grid-cols-2 gap-3 sr-pastels">
          {#each voices as v}
            <button class="sr-panel live-part p-4 text-lg font-bold text-left {part === v.id ? 'ring-2 ring-sr-action' : ''}" on:click={() => pick(v.id)} data-live-pick={v.id}>{v.name}</button>
          {/each}
        </div>
        <button class="sr-btn-quiet mt-3 w-full" on:click={() => pick(FULL_SCORE)} data-live-pick={FULL_SCORE}>The full score</button>
      </div>
    {:else if !abc}
      <div class="sr-panel p-6 text-center">
        <p class="text-lg font-semibold text-sr-ink">You're in.</p>
        <p class="text-sm text-sr-muted mt-1">Waiting for your teacher to generate an exercise…</p>
      </div>
    {/if}

    {#if abc && part && !choosing}
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm text-sr-muted font-semibold">{heading}</p>
        {#if fresh}<span class="live-fresh" role="status">New exercise</span>{/if}
        <button class="sr-btn ml-auto flex items-center gap-1.5" on:click={hear} disabled={preparing || together}>
          {#if sounding}<Square size={16} />Stop{:else}<Play size={16} />{preparing ? "Getting ready…" : voices.length > 1 && part !== FULL_SCORE ? "Hear my part" : "Hear it"}{/if}
        </button>
      </div>
    {/if}
    <div class="live-paper sr-sheet p-2 sm:p-4" class:hidden={!abc || !part || choosing}>
      <div bind:this={paper} id="live-paper" data-live-version={version}></div>
    </div>
  </div>

  {#if countWord}
    {#key countBeat}
      <div class="live-count" aria-live="assertive"><span class:go={countWord === "Go"}>{countWord}</span></div>
    {/key}
  {/if}
{/if}

<style>
  /* Full screen: the music as wide as the screen (the room's page holds it to max-w-5xl). */
  :global(html.sr-focus .live-room) {
    max-width: none;
  }
  .live-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--sr-mint);
    color: var(--sr-mint-ink);
    font-weight: 800;
    font-size: 14px;
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--sr-mint-ink);
  }
  .live-dot.off {
    background: var(--sr-brass);
  }
  .live-fresh {
    font-size: 12px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
  }
  .live-part {
    min-height: 4.5rem;
  }
  .live-paper :global(.live-now) {
    fill: var(--sr-action);
    stroke: var(--sr-action);
  }
  .live-count {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 60;
  }
  .live-count span {
    min-width: 9rem;
    padding: 1.5rem 2rem;
    border-radius: 999px;
    text-align: center;
    font-family: var(--sr-font-display);
    font-weight: 800;
    font-size: clamp(3rem, 14vw, 6rem);
    line-height: 1;
    background: var(--sr-countin-bg);
    color: var(--sr-countin-ink);
    box-shadow: var(--sr-card-shadow);
    animation: pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  .live-count .go {
    color: var(--sr-countin-go);
  }
  @keyframes pop {
    from { transform: scale(1.3); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-count span { animation: none; }
  }
  .font-display {
    font-family: var(--sr-font-display);
  }
</style>
