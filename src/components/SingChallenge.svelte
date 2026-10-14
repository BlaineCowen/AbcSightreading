<script lang="ts">
  /**
   * /challenge: "Can you sing it?" Free, no account. Eight notes at one of
   * three levels; the phone listens (the tuner's own detector, on the same
   * stream as the camera) and Pip shows where the voice is against the note;
   * each note held in tune pops, judged by Grade's Note by note rules
   * (challenge/run.ts). The whole frame, camera on top and score below, is
   * one canvas (challenge/scene.ts), recorded with the voice and shared
   * straight to Instagram or TikTok from the phone's share sheet. Nothing is
   * uploaded.
   */
  import { onDestroy, onMount } from "svelte";
  import { TunerEngine } from "../lib/tuner/tuner-engine";
  import { LEVELS, LEVEL_IDS, challengeLink, makeChallenge, newSeed, type Challenge, type ChallengeLevel, type ChallengeVoice } from "../lib/challenge/exercise";
  import { ChallengeRun, type ChallengeView } from "../lib/challenge/run";
  import { ChallengeScene, SHUFFLE_MS, type SceneState } from "../lib/challenge/scene";
  import { STRICTNESS } from "../lib/grade";
  import { extensionFor, startRecording, videoType, type Recording } from "../lib/play-along/recorder";

  type Phase = "intro" | "starting" | "ready" | "reference" | "singing" | "done" | "result";
  const TOLERANCE = STRICTNESS.easy.cents;
  /** The finished frame stays this long in the recording, so the video ends on the verdict. */
  const END_HOLD_MS = 2600;

  let phase: Phase = "intro";
  let level: ChallengeLevel = "skips";
  let voice: ChallengeVoice = "high";
  let seed = newSeed();
  let fromFriend = false;
  let useCamera = true;
  let record = true;
  let canRecord = false;
  let error: string | null = null;
  let copied = false;
  /** The notes are shown: from Go on. Before it they are "?", so nobody can rehearse them. */
  let revealed = false;
  /** What the bar says while the notes shuffle and the first note plays. */
  let refStatus = "";

  let canvas: HTMLCanvasElement;
  let video: HTMLVideoElement;
  let scene: ChallengeScene | null = null;
  let stream: MediaStream | null = null;
  let engine: TunerEngine | null = null;
  let recDest: MediaStreamAudioDestinationNode | null = null;
  let recording: Recording | null = null;
  let take: { url: string; file: File; shareable: boolean } | null = null;
  let final: ChallengeView | null = null;
  let wakeLock: { release: () => Promise<void> } | null = null;

  // Not in the markup: changed every frame, so kept out of Svelte's updates.
  let challenge: Challenge = makeChallenge(level, voice, seed);
  let run: ChallengeRun | null = null;
  let view: ChallengeView | null = null;
  let sung: number | null = null;
  let message: string | null = "Tap Start, then sing each note";
  let expected: number | null = null;
  let raf = 0;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  /** The last note played to the singer (checked by scripts/check-challenge.ts). */
  let lastPlayed: number | null = null;

  $: staged = phase !== "intro" && phase !== "starting";
  $: if (phase === "intro") challenge = makeChallenge(level, voice, seed);

  onMount(() => {
    const p = new URLSearchParams(location.search);
    const l = p.get("l"), v = p.get("v"), c = Number(p.get("c"));
    if (l && (LEVEL_IDS as string[]).includes(l)) level = l as ChallengeLevel;
    if (v === "high" || v === "low") voice = v;
    if (Number.isFinite(c) && c > 0) { seed = Math.floor(c); fromFriend = true; }
    challenge = makeChallenge(level, voice, seed);
    canRecord = !!videoType();
    record = canRecord;
    scene = new ChallengeScene(canvas);
    // The clefs come from Noto Music (the two glyphs only); draw again once it is in.
    (document as any).fonts?.load?.('88px "Noto Music"', "\u{1D11E}\u{1D122}").catch(() => {});
    raf = requestAnimationFrame(frame);
    // scripts/check-challenge.ts follows the run through this (dev server only).
    if (import.meta.env.DEV) (window as any).__challengeDebug = () => ({ phase, view, notes: challenge.notes.map((n) => n.midi), take: take && { url: take.url, size: take.file.size, type: take.file.type }, lastPlayed });
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    teardown();
  });

  function scenePhase(): SceneState["phase"] {
    return phase === "reference" ? "reference" : phase === "singing" ? "singing" : phase === "done" || phase === "result" ? "done" : "ready";
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (run && phase === "singing") {
      view = run.tick(now, sung);
      // The detector hears the note asked for on a little less clarity, as in Grade.
      if (run.current !== expected) {
        expected = run.current;
        engine?.setExpected(expected === null ? null : [expected]);
      }
      if (view.done) finish();
    }
    scene?.draw(now, {
      challenge,
      phase: scenePhase(),
      view,
      video: stream?.getVideoTracks().length ? video : null,
      message,
      tolerance: TOLERANCE,
      reveal: revealed,
    });
  }

  function micError(e: unknown): string {
    const name = (e as { name?: string })?.name;
    if (!navigator.mediaDevices?.getUserMedia) return "This browser cannot use the microphone here. Open abc-sightreading.com/challenge in Safari or Chrome.";
    if (name === "NotAllowedError" || name === "SecurityError")
      return "The microphone is blocked for this site. Allow it in your browser's settings (on an iPhone: Settings, Safari, Microphone), then tap Start again.";
    if (name === "NotFoundError") return "No microphone was found on this device.";
    return "The microphone could not start. Close other apps using it and try again.";
  }

  async function start() {
    error = null;
    phase = "starting";
    const audio = { echoCancellation: true, noiseSuppression: false, autoGainControl: false };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no mediaDevices");
      // One request for both, so iOS does not silence the microphone with a second one.
      if (useCamera) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } } });
        } catch (e) {
          // No camera, or the camera refused: carry on with the microphone alone.
          if ((e as { name?: string })?.name === "NotAllowedError") throw e;
          stream = await navigator.mediaDevices.getUserMedia({ audio });
        }
      } else stream = await navigator.mediaDevices.getUserMedia({ audio });
      engine = new TunerEngine();
      engine.onFrame((f) => {
        sung = f.pitch ? 69 + 12 * Math.log2(f.pitch.frequency / 440) : null;
      });
      await engine.start(stream);
    } catch (e) {
      error = micError(e);
      teardown();
      phase = "intro";
      return;
    }
    if (stream.getVideoTracks().length) {
      video.srcObject = new MediaStream(stream.getVideoTracks());
      await video.play().catch(() => {});
    }
    const mic = engine.micInput();
    if (mic && canRecord) {
      recDest = mic.ctx.createMediaStreamDestination();
      mic.source.connect(recDest);
    }
    try {
      wakeLock = await (navigator as any).wakeLock?.request("screen");
    } catch {}
    message = "Tap Go to shuffle your notes";
    phase = "ready";
  }

  /** Do in the singer's voice: what "Hear do" plays before the notes are known. */
  const doMidi = () => (voice === "high" ? 60 : 48);

  /** Play a note on the engine's own context (so it is in the recording), and tell the detector it is sounding. */
  function playNote(midi: number, ms = 900): Promise<void> {
    const ctx = engine?.context;
    if (!ctx || !engine) return Promise.resolve();
    lastPlayed = midi;
    const t = ctx.currentTime;
    const hz = 440 * 2 ** ((midi - 69) / 12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    for (const [type, mult, level] of [["triangle", 1, 1], ["sine", 2, 0.25]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = hz * mult;
      g.gain.value = level;
      o.connect(g).connect(gain);
      o.start(t);
      o.stop(t + ms / 1000 + 0.05);
    }
    gain.connect(ctx.destination);
    if (recDest) gain.connect(recDest);
    engine.setSelfPlaying(true);
    return new Promise((r) =>
      setTimeout(() => {
        engine?.setSelfPlaying(false);
        r();
      }, ms + 150),
    );
  }

  /**
   * `fresh`: new notes, shuffled in (a friend's link keeps theirs the first
   * time). Try again keeps the notes and skips the shuffle.
   */
  async function go(fresh = true) {
    if (!engine) return;
    clearTake();
    if (fresh) {
      if (!fromFriend) seed = newSeed();
      fromFriend = false;
      challenge = makeChallenge(level, voice, seed);
    }
    scene?.reset();
    run = null;
    view = null;
    final = null;
    revealed = true;
    if (record && canRecord && recDest) {
      try {
        recording = startRecording(canvas, recDest.stream, 30);
      } catch {
        recording = null;
      }
    }
    phase = "reference";
    if (fresh) {
      // The notes fly in, so the video shows they were drawn there and then.
      scene?.shuffle(performance.now());
      message = "Shuffling…";
      refStatus = "Shuffling…";
      await new Promise((r) => setTimeout(r, SHUFFLE_MS));
      if (phase !== "reference") return;
    }
    message = `Your first note: ${challenge.notes[0].syl}`;
    refStatus = "Listen…";
    await playNote(challenge.notes[0].midi);
    if (phase !== "reference") return;
    message = null;
    expected = null;
    run = new ChallengeRun(challenge.notes.map((n) => n.midi), performance.now(), TOLERANCE, STRICTNESS.easy.freeCents);
    phase = "singing";
  }

  function finish() {
    if (phase !== "singing") return;
    final = view;
    phase = "done";
    engine?.setExpected(null);
    finishTimer = setTimeout(async () => {
      finishTimer = null;
      if (recording) {
        const r = recording;
        recording = null;
        const blob = await r.stop();
        const file = new File([blob], `can-you-sing-it.${extensionFor(r.type)}`, { type: blob.type });
        const shareable = !!(navigator as any).canShare?.({ files: [file] });
        take = { url: URL.createObjectURL(blob), file, shareable };
      }
      if (phase === "done") phase = "result";
    }, recording ? END_HOLD_MS : 900);
  }

  function hear() {
    if (phase === "singing" && run && run.current !== null) {
      run.help(performance.now(), 1000);
      void playNote(run.current);
    } else if (phase === "ready" || phase === "result") void playNote(doMidi());
  }

  function skip() {
    run?.skip(performance.now());
  }

  async function stopRun() {
    if (finishTimer) clearTimeout(finishTimer);
    finishTimer = null;
    if (recording) {
      const r = recording;
      recording = null;
      await r.stop().catch(() => {});
    }
    run = null;
    view = null;
    revealed = false;
    message = "Tap Go to shuffle your notes";
    phase = "ready";
  }

  function again(fresh: boolean) {
    void go(fresh);
  }

  function clearTake() {
    if (take) URL.revokeObjectURL(take.url);
    take = null;
  }

  async function shareVideo() {
    if (!take) return;
    try {
      await navigator.share({ files: [take.file], title: "Can you sing it?", text: `Can you sing it? ${link()}` });
    } catch {}
  }

  const link = () => challengeLink(location.origin.includes("localhost") ? location.origin : "https://www.abc-sightreading.com", challenge);

  async function shareLink() {
    const url = link();
    const text = "Can you sing these eight notes? I tried:";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Can you sing it?", text, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {}
  }

  function teardown() {
    if (finishTimer) clearTimeout(finishTimer);
    finishTimer = null;
    recording?.stop().catch(() => {});
    recording = null;
    engine?.stop();
    engine = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recDest = null;
    if (video) video.srcObject = null;
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    run = null;
    view = null;
    sung = null;
  }

  function close() {
    teardown();
    clearTake();
    final = null;
    revealed = false;
    message = "Tap Start, then sing each note";
    phase = "intro";
  }

</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Music&text=%F0%9D%84%9E%F0%9D%84%A2&display=block" />
</svelte:head>

<div class="challenge" class:staged>
  <div class="frame-wrap">
    <canvas bind:this={canvas} class="frame" aria-label="The challenge: your camera, the eight notes, and a ball showing your pitch"></canvas>
    <!-- The camera, drawn into the canvas; never shown itself. -->
    <video bind:this={video} playsinline muted autoplay class="cam"></video>
  </div>

  {#if !staged}
    <section class="intro">
      <h1 class="font-display">Can you sing it?</h1>
      <p class="lede">Eight notes. Your phone listens, and a little ball shows where your voice is. Hold each note in tune to pop it, then share the video.</p>
      {#if fromFriend}<p class="friend">A friend sent you this one: the same eight notes they sang.</p>{/if}

      <div class="field" role="radiogroup" aria-label="Level">
        <span class="label">Level</span>
        <div class="choices">
          {#each LEVEL_IDS as id}
            <button class="choice" class:on={level === id} role="radio" aria-checked={level === id}
              on:click={() => { if (level !== id) { level = id; seed = newSeed(); fromFriend = false; } }}>
              <b>{LEVELS[id].label}</b><small>{LEVELS[id].blurb}</small>
            </button>
          {/each}
        </div>
      </div>

      <div class="field" role="radiogroup" aria-label="Voice">
        <span class="label">Your voice</span>
        <div class="row">
          <button class="tok" class:on={voice === "high"} role="radio" aria-checked={voice === "high"} on:click={() => (voice = "high")}>Higher (treble)</button>
          <button class="tok" class:on={voice === "low"} role="radio" aria-checked={voice === "low"} on:click={() => (voice = "low")}>Lower (bass)</button>
        </div>
        <small class="hint">Any octave counts.</small>
      </div>

      <div class="field">
        <span class="label">Video</span>
        <div class="row">
          <button class="tok" class:on={useCamera} aria-pressed={useCamera} on:click={() => (useCamera = !useCamera)}>Camera {useCamera ? "on" : "off"}</button>
          {#if canRecord}
            <button class="tok" class:on={record} aria-pressed={record} on:click={() => (record = !record)}>Record {record ? "on" : "off"}</button>
          {/if}
        </div>
      </div>

      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="start" on:click={start} disabled={phase === "starting"}>{phase === "starting" ? "Starting…" : "Start"}</button>
      <p class="fine">Free, no account. Nothing is uploaded: the video stays on your phone unless you share it.</p>
    </section>
  {:else}
    <div class="bar">
      {#if phase === "ready"}
        <button class="ghost" on:click={close}>Close</button>
        <button class="ghost" on:click={hear}>Hear do</button>
        <button class="go" on:click={() => go(true)}>Go</button>
      {:else if phase === "reference"}
        <span class="status">{refStatus}</span>
      {:else if phase === "singing"}
        <button class="ghost" on:click={stopRun}>Stop</button>
        <button class="ghost" on:click={hear}>Hear it</button>
        <button class="ghost" on:click={skip}>Skip</button>
      {:else if phase === "done"}
        <span class="status">{recording ? "Saving your video…" : "Done!"}</span>
      {:else if phase === "result"}
        <div class="result">
          <div class="row wrap">
            {#if take?.shareable}
              <button class="go" on:click={shareVideo}>Share video</button>
            {/if}
            {#if take}
              <a class="ghost" href={take.url} download={take.file.name}>Save video</a>
            {/if}
            <button class="ghost" on:click={shareLink}>{copied ? "Link copied" : "Challenge a friend"}</button>
          </div>
          <div class="row wrap">
            <button class="ghost" on:click={() => again(false)}>Try again</button>
            <button class="ghost" on:click={() => again(true)}>New notes</button>
            <button class="ghost" on:click={close}>Done</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .challenge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding-bottom: 2rem;
  }
  .frame-wrap {
    width: min(100%, 300px);
  }
  .frame {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 9 / 16;
    border-radius: 24px;
    box-shadow: var(--sr-card-shadow);
    background: #fff;
  }
  /* Kept just visible: iOS may stop decoding a video that is hidden outright. */
  .cam {
    position: fixed;
    left: 0;
    bottom: 0;
    width: 2px;
    height: 2px;
    opacity: 0.01;
    pointer-events: none;
  }

  /* Staged: the frame and its buttons take the whole screen. */
  .staged {
    position: fixed;
    inset: 0;
    z-index: 60;
    gap: 0;
    padding: env(safe-area-inset-top, 0px) 0 0;
    background: #0b1222;
    justify-content: space-between;
  }
  .staged .frame-wrap {
    flex: 1;
    min-height: 0;
    width: 100%;
    position: relative;
    margin-top: 8px;
  }
  /* As large as fits, at 9:16 exactly: a canvas keeps its shape under max-width
     and max-height, and inset 0 with auto margins centres it. */
  .staged .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: auto;
    height: auto;
    max-width: calc(100% - 16px);
    max-height: 100%;
    border-radius: 18px;
  }

  .intro {
    order: -1;
    width: min(100%, 520px);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  h1 {
    font-size: clamp(2rem, 7vw, 2.6rem);
    line-height: 1.05;
    margin: 0;
    color: var(--sr-ink);
  }
  .lede {
    margin: 0;
    color: var(--sr-muted);
  }
  .friend {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border-radius: 16px;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
    font-weight: 700;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .label {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sr-muted);
  }
  .hint {
    color: var(--sr-muted);
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
    padding: 0.7rem 0.8rem;
    min-height: 44px;
    border-radius: 18px;
    border: 2px solid var(--sr-hairline);
    background: var(--sr-surface, transparent);
    color: var(--sr-ink);
  }
  .choice small {
    color: var(--sr-muted);
    font-size: 0.78rem;
    line-height: 1.25;
  }
  .choice.on {
    border-color: var(--sr-action);
    background: var(--sr-sky);
    color: var(--sr-sky-ink);
  }
  .choice.on small {
    color: var(--sr-sky-ink);
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .wrap {
    flex-wrap: wrap;
    justify-content: center;
  }
  .tok {
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 999px;
    border: 2px solid var(--sr-hairline);
    color: var(--sr-ink);
    font-weight: 700;
  }
  .tok.on {
    border-color: var(--sr-action);
    background: var(--sr-sky);
    color: var(--sr-sky-ink);
  }
  .start {
    min-height: 56px;
    border-radius: 999px;
    background: var(--sr-action);
    color: var(--sr-action-ink);
    font-size: 1.2rem;
    font-weight: 800;
  }
  .start:disabled {
    opacity: 0.6;
  }
  .error {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border-radius: 16px;
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
    font-weight: 700;
  }
  .fine {
    margin: 0;
    font-size: 0.85rem;
    color: var(--sr-muted);
  }

  .bar {
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 0.6rem;
    padding: 12px max(16px, env(safe-area-inset-left, 0px)) calc(14px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-right, 0px));
  }
  .bar .ghost,
  .bar .go {
    min-height: 48px;
    padding: 0 1.2rem;
    border-radius: 999px;
    font-weight: 800;
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
  .bar .ghost {
    background: #243353;
    color: #ffffff;
  }
  .bar .go {
    background: #bdebd9;
    color: #0f3b2c;
    min-width: 7rem;
  }
  .status {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    color: #c3d0ea;
    font-weight: 800;
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    align-items: center;
    width: 100%;
  }
  button:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--sr-action);
    outline-offset: 2px;
  }
</style>
