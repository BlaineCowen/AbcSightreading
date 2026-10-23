<script lang="ts">
  import { onDestroy } from "svelte";
  import { canvasColors, onThemeChange } from "../../lib/tuner/canvas-colors";

  /**
   * abcOmniPitch: OmniPitch's own editor (Blaine's polyphonic pitch detector
   * and note editor), served from public/omnipitch/editor/ and shown here in
   * a frame, so its page, keys and styles stay its own. It takes the site's
   * theme from the address and from a message whenever the theme changes.
   * scripts/omnipitch/sync.ts brings it over; notes/omnipitch.md says how.
   */
  let frame: HTMLIFrameElement;
  let box: HTMLDivElement;
  const theme = () => (canvasColors().dark ? "dark" : "light");
  const src = `/omnipitch/editor/index.html?theme=${theme()}`;
  const offTheme = onThemeChange(() => frame?.contentWindow?.postMessage({ abcTheme: theme() }, location.origin));
  onDestroy(offTheme);

  function fullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.requestFullscreen?.().then(() => frame.focus());
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-3">
    <p class="flex-1 min-w-[16rem] text-sm text-sr-muted">
      Record your group or open a recording: every note at the pitch it was sung or played, its tuning in colour.
      Click a note to hear it alone, and tune, move or fix notes with the tools. The <b>?</b> button explains each one.
    </p>
    <button class="sr-btn-quiet" on:click={fullScreen}>Full screen</button>
  </div>
  <div bind:this={box} class="overflow-hidden rounded-2xl border border-sr-hairline bg-sr-panel" style="height: min(80vh, 780px); min-height: 480px">
    <iframe
      bind:this={frame}
      {src}
      title="abcOmniPitch"
      allow="microphone; autoplay; fullscreen; clipboard-write"
      class="block h-full w-full border-0"
    ></iframe>
  </div>
</div>
