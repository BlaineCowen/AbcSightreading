<script lang="ts">
  /**
   * Before a graded attempt: headphones, can you hear us, can we hear you,
   * and can the microphone hear your speakers (three beeps, listened for, as
   * SmartMusic does: if the microphone hears them it will hear the music and
   * grade it as you). Passed once, later attempts open on the last step with
   * a way to check again. Rules in src/lib/pieces/audio-check.ts.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import Headphones from "lucide-svelte/icons/headphones";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Mic from "lucide-svelte/icons/mic";
  import Radio from "lucide-svelte/icons/audio-lines";
  import Check from "lucide-svelte/icons/check";
  import X from "lucide-svelte/icons/x";
  import { tuner } from "../../lib/tuner/store";
  import { initTuner, startTuner, stopTuner } from "../../lib/tuner/controller";
  import { playArpeggio, playNotes } from "../../lib/tools/tone";
  import { BEEP_COUNT, BEEP_MIDI, BEEP_MS, GAP_MS, beepWindows, beepsHeard, bleeds, meterLevel, voiceHeard, type Heard } from "../../lib/pieces/audio-check";

  /** What the student is about to do, for the last step. */
  export let student = true;
  export let summary = "";
  export let maxAttempts: number | null = null;
  export let onStart: () => void;
  export let onClose: () => void;

  const KEY = "abc-audio-check-v1";
  type Step = "headphones" | "speaker" | "mic" | "beep" | "ready";
  const STEPS: Step[] = ["headphones", "speaker", "mic", "beep", "ready"];
  let step: Step = "headphones";
  let checkedBefore = false;
  let speakers = false;

  let dialog: HTMLDivElement;
  let micState: "off" | "starting" | "on" | "error" = "off";
  let heardVoice = false;
  let beepState: "idle" | "playing" | "clear" | "heard" = "idle";
  let beepCount = 0;
  let turnedMicOn = false;

  // What the tuner reports, kept for the tests above.
  let frames: Heard[] = [];
  const unsubscribe = tuner.subscribe((t) => {
    if (t.engineStatus !== "running") return;
    frames.push({ t: performance.now(), pitchHz: t.pitch, dbfs: t.dbfs });
    if (frames.length > 400) frames = frames.slice(-300);
    if (step === "mic" && !heardVoice && voiceHeard(frames.slice(-30))) heardVoice = true;
  });
  $: level = meterLevel($tuner.dbfs);

  onMount(() => {
    try {
      checkedBefore = sessionStorage.getItem(KEY) === "ok";
    } catch {}
    if (checkedBefore) step = "ready";
    if (tuner.get().engineStatus === "running") micState = "on";
    void focusStep();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    document.documentElement.classList.add("sr-pop-open");
    return () => {
      window.removeEventListener("keydown", esc);
      document.documentElement.classList.remove("sr-pop-open");
    };
  });
  onDestroy(unsubscribe);

  async function focusStep() {
    await tick();
    dialog?.querySelector<HTMLElement>("[data-first]")?.focus();
  }
  async function go(s: Step) {
    step = s;
    await focusStep();
    if (s === "speaker") playSample();
  }

  function playSample() {
    playArpeggio([60, 64, 67, 72], 0.28);
  }

  async function micOn() {
    micState = "starting";
    initTuner();
    if (tuner.get().engineStatus !== "running") {
      await startTuner();
      turnedMicOn = true;
    }
    if (tuner.get().engineStatus !== "running") {
      micState = "error";
      return;
    }
    tuner.setMicHeld(true);
    micState = "on";
    frames = [];
  }

  async function runBeeps() {
    if (micState !== "on") await micOn();
    if (micState !== "on") return;
    beepState = "playing";
    frames = [];
    const start = performance.now() + 400;
    const windows = beepWindows(start);
    const a4 = tuner.get().a4;
    windows.forEach((w) => setTimeout(() => playNotes([BEEP_MIDI], BEEP_MS / 1000, a4, 0.6), w.from - performance.now()));
    await new Promise((r) => setTimeout(r, 400 + BEEP_COUNT * (BEEP_MS + GAP_MS) + 100));
    beepCount = beepsHeard(frames, windows, a4);
    beepState = bleeds(beepCount) ? "heard" : "clear";
    if (beepState === "clear") {
      try { sessionStorage.setItem(KEY, "ok"); } catch {}
    }
    await focusStep();
  }

  function close() {
    if (turnedMicOn) {
      tuner.setMicHeld(false);
      stopTuner();
    }
    onClose();
  }

  /** The microphone stays on into the attempt. */
  function start() {
    turnedMicOn = false;
    onStart();
  }

  $: stepIndex = STEPS.indexOf(step);
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="scrim" on:click|self={close}>
  <div class="dialog sr-panel" role="dialog" aria-modal="true" aria-labelledby="check-h" bind:this={dialog}>
    <button type="button" class="close" aria-label="Close" on:click={close}><X size={20} aria-hidden="true" /></button>
    {#if step !== "ready" || !checkedBefore}
      <ol class="dots" aria-label="Step {stepIndex + 1} of {STEPS.length}">
        {#each STEPS as s, i}<li class:on={i <= stepIndex}></li>{/each}
      </ol>
    {/if}

    {#if step === "headphones"}
      <span class="badge bg-sr-sky text-sr-sky-ink"><Headphones size={28} aria-hidden="true" /></span>
      <h2 id="check-h">Headphones on?</h2>
      <p>The microphone grades what it hears. With speakers it also hears the music, and can mark you for notes the piano played. Wired headphones are best: Bluetooth can lag behind the music.</p>
      <div class="actions">
        <button type="button" class="sr-btn" data-first on:click={() => ((speakers = false), go("speaker"))}>My headphones are on</button>
        <button type="button" class="sr-btn-quiet" on:click={() => ((speakers = true), go("speaker"))}>I'm using speakers</button>
      </div>
    {:else if step === "speaker"}
      <span class="badge bg-sr-mint text-sr-mint-ink"><Volume2 size={28} aria-hidden="true" /></span>
      <h2 id="check-h">Can you hear this?</h2>
      <p>Four notes, going up. Set the volume so they are clear but comfortable.</p>
      <div class="actions">
        <button type="button" class="sr-btn" data-first on:click={() => go("mic")}>Yes, I heard them</button>
        <button type="button" class="sr-btn-quiet" on:click={playSample}>Play them again</button>
      </div>
      <p class="hint">Nothing? Check the volume and that sound is not muted{speakers ? "" : ", and that your headphones are plugged in and chosen as the output"}.</p>
    {:else if step === "mic"}
      <span class="badge bg-sr-peach text-sr-peach-ink"><Mic size={28} aria-hidden="true" /></span>
      <h2 id="check-h">Can we hear you?</h2>
      {#if micState === "off" || micState === "starting"}
        <p>Turn on your microphone, then sing or say "ah".</p>
        <div class="actions">
          <button type="button" class="sr-btn" data-first disabled={micState === "starting"} on:click={micOn}>{micState === "starting" ? "Starting…" : "Turn on the microphone"}</button>
        </div>
      {:else if micState === "error"}
        <p class="warn">The microphone did not start. Allow it for this site (the icon by the address), then try again.</p>
        <div class="actions"><button type="button" class="sr-btn" data-first on:click={micOn}>Try again</button></div>
      {:else}
        <p>{heardVoice ? "We hear you." : 'Sing or say "ah" for a moment.'}</p>
        <div class="meter" role="meter" aria-label="Microphone level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(level * 100)}>
          <div class="fill" class:good={heardVoice} style="width: {Math.round(level * 100)}%"></div>
        </div>
        <div class="actions">
          <button type="button" class="sr-btn" data-first disabled={!heardVoice} on:click={() => go("beep")}>
            {#if heardVoice}<Check size={16} aria-hidden="true" />{/if} Next
          </button>
        </div>
        {#if !heardVoice}<p class="hint">Nothing moving? Choose the right microphone in your browser's settings, or come closer to it.</p>{/if}
      {/if}
    {:else if step === "beep"}
      <span class="badge bg-sr-butter text-sr-butter-ink"><Radio size={28} aria-hidden="true" /></span>
      <h2 id="check-h">Can the microphone hear your speakers?</h2>
      {#if beepState === "idle"}
        <p>Stay quiet: we play three beeps and listen for them. If the microphone hears them, it will hear the music too.</p>
        <div class="actions"><button type="button" class="sr-btn" data-first on:click={runBeeps}>Play the beeps</button></div>
      {:else if beepState === "playing"}
        <p class="flex items-center gap-2" role="status"><span class="live-dot" aria-hidden="true"></span> Listening… stay quiet.</p>
      {:else if beepState === "clear"}
        <p class="ok" role="status"><Check size={18} aria-hidden="true" /> The microphone did not hear the beeps. You are set.</p>
        <div class="actions"><button type="button" class="sr-btn" data-first on:click={() => go("ready")}>Next</button></div>
      {:else}
        <p class="warn" role="alert">
          The microphone heard {beepCount} of {BEEP_COUNT} beeps, so it will hear the music too and may grade it as you.
          {speakers ? "Put on headphones if you can, or turn the volume down," : "Check your headphones are the sound output (not the speakers), or turn the volume down,"} then try again.
        </p>
        <div class="actions">
          <button type="button" class="sr-btn" data-first on:click={runBeeps}>Try again</button>
          <button type="button" class="sr-btn-quiet" on:click={() => go("ready")}>Go on anyway</button>
        </div>
      {/if}
    {:else}
      <span class="badge bg-sr-action text-sr-action-ink"><Check size={28} aria-hidden="true" /></span>
      <h2 id="check-h">{checkedBefore ? "Ready for a graded attempt?" : "Ready"}</h2>
      {#if summary}<p>{summary}</p>{/if}
      <p>You hear your starting note, then a count-in. {checkedBefore ? "Headphones on?" : ""}</p>
      {#if student}
        <p class="notice">Your teacher will hear a recording of this attempt. It is kept for 90 days, then deleted.{maxAttempts !== null ? ` This uses one of your ${maxAttempts} attempts, even if you stop part way.` : ""}</p>
      {/if}
      <div class="actions">
        <button type="button" class="sr-btn" data-first on:click={start}>Start</button>
        {#if checkedBefore}<button type="button" class="sr-btn-quiet" on:click={() => ((checkedBefore = false), go("headphones"))}>Check my setup again</button>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgb(var(--sr-bar-rgb) / 0.55);
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .dialog {
    position: relative;
    width: min(32rem, 100%);
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    padding: 1.75rem 1.5rem 1.5rem;
    border-radius: 28px;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    animation: rise 180ms ease-out;
  }
  @media (max-width: 640px) {
    .scrim {
      place-items: end stretch;
      padding: 0;
    }
    .dialog {
      width: 100%;
      border-radius: 28px 28px 0 0;
    }
  }
  @keyframes rise {
    from { transform: translateY(12px); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dialog { animation: none; }
  }
  .close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--sr-muted);
  }
  .close:hover {
    background: var(--sr-hairline);
  }
  .dots {
    display: flex;
    gap: 0.35rem;
  }
  .dots li {
    width: 1.75rem;
    height: 0.35rem;
    border-radius: 999px;
    background: var(--sr-hairline);
  }
  .dots li.on {
    background: var(--sr-action);
  }
  .badge {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
  }
  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--sr-ink);
  }
  p {
    color: var(--sr-ink-2);
  }
  .hint {
    font-size: 0.85rem;
    color: var(--sr-muted);
  }
  .warn {
    color: var(--sr-brass);
    background: var(--sr-brass-bg);
    border-radius: 16px;
    padding: 0.75rem 1rem;
  }
  .ok {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 700;
    color: var(--sr-ink);
  }
  .notice {
    font-weight: 700;
    color: var(--sr-ink);
    background: var(--sr-tint);
    border-radius: 16px;
    padding: 0.75rem 1rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .meter {
    height: 0.9rem;
    border-radius: 999px;
    background: var(--sr-track);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--sr-brass);
    transition: width 80ms linear;
  }
  .fill.good {
    background: #1f9d6b;
  }
  .live-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 999px;
    background: #d13f2f;
    animation: live 1s ease-in-out infinite alternate;
  }
  @keyframes live {
    to { opacity: 0.3; }
  }
</style>
