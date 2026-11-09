<script lang="ts">
  import { onMount } from "svelte";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ClipboardList from "lucide-svelte/icons/clipboard-list";
  import Clapperboard from "lucide-svelte/icons/clapperboard";
  import Presentation from "lucide-svelte/icons/presentation";
  import LiveTeacher from "./LiveTeacher.svelte";

  /**
   * The Teach pill (9 November 2026, Blaine: "That top bar is getting really
   * cluttered", then "lets do the teach pill"): the score toolbar's teaching
   * tools in one menu, so the row keeps to what everyone uses (Display, Drill,
   * Listen and grade). Assign to a class (Educator), Go live, and the
   * play-along Video. While Live is on the pill itself shows it, green with
   * the room's code and devices, since that is what a room has to see.
   *
   * The menu is always in the page (hidden when shut), so Live keeps its
   * session and panel while the menu is closed. A student account has no
   * Teach: only the Video button, as before.
   */

  export let page: "choral" | "unison";
  export let abc: string;
  export let bpm: number;
  export let liveTitle = "";
  export let rhythm = false;
  /** Live is offered (not inside an assignment). */
  export let live = true;
  /** Assign these settings to a class; null when this account cannot. */
  export let onAssign: (() => void) | null = null;
  /** The play-along video; null on a page without one. */
  export let onVideo: (() => void) | null = null;
  /** Videos are part of Pro: false shows the Pro tag. */
  export let videoAllowed: boolean | null = null;

  let open = false;
  let root: HTMLElement;
  let status: { display: string; connected: number } | null = null;
  let student = false;

  /** A row chosen (Live's included) shuts the menu. */
  function closeOnItem(e: MouseEvent) {
    if ((e.target as HTMLElement).closest(".teach-item")) open = false;
  }

  function choose(fn: (() => void) | null) {
    open = false;
    fn?.();
  }

  onMount(() => {
    const away = (e: Event) => { if (open && root && !root.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (open && e.key === "Escape") open = false; };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  });
</script>

{#if student}
  {#if onVideo}
    <button type="button" class="tool-btn" on:click={onVideo}>
      <Clapperboard size={16} aria-hidden="true" />Video
      {#if videoAllowed === false}<span class="sr-pro-tag">Pro</span>{/if}
    </button>
  {/if}
  <!-- Kept for its account check; it draws nothing for a student. -->
  {#if live}<LiveTeacher {page} {abc} {bpm} title={liveTitle} {rhythm} bind:student />{/if}
{:else}
  <div class="teach no-print" bind:this={root} data-teach>
    <button
      type="button"
      class="tool-btn"
      class:teach-live={!!status}
      aria-haspopup="menu"
      aria-expanded={open}
      on:click={() => (open = !open)}
      title={status ? "Live is on: open the Teach menu" : "Teaching tools: assign, go live, make a video"}
    >
      {#if status}
        <span class="dot" aria-hidden="true"></span>Live {status.display} · {status.connected}
      {:else}
        <Presentation size={16} aria-hidden="true" />Teach
      {/if}
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    <div class="menu" role="menu" hidden={!open} on:click={closeOnItem}>
      {#if onAssign}
        <button type="button" role="menuitem" class="teach-item" on:click={() => choose(onAssign)} data-assign-this>
          <ClipboardList size={18} aria-hidden="true" />
          <span class="flex flex-col text-left">
            <span class="font-bold">Assign to a class</span>
            <span class="text-xs opacity-80">These settings, with classes, voice parts and a due date next</span>
          </span>
        </button>
      {/if}
      {#if live}<LiveTeacher item {page} {abc} {bpm} title={liveTitle} {rhythm} bind:status bind:student />{/if}
      {#if onVideo}
        <button type="button" role="menuitem" class="teach-item" on:click={() => choose(onVideo)}>
          <Clapperboard size={18} aria-hidden="true" />
          <span class="flex flex-col text-left">
            <span class="font-bold">Make a play-along video {#if videoAllowed === false}<span class="sr-pro-tag">Pro</span>{/if}</span>
            <span class="text-xs opacity-80">Full screen, about a minute and a half, to show or save</span>
          </span>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .teach {
    position: relative;
    display: inline-flex;
  }
  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.5rem;
    padding: 0 0.875rem;
    border-radius: 999px;
    background: var(--sr-panel);
    color: var(--sr-ink-2);
    font-size: 14px;
    font-weight: 800;
    box-shadow: var(--sr-card-shadow);
    border: 2px solid transparent;
    white-space: nowrap;
  }
  .tool-btn:hover {
    border-color: var(--sr-tint);
  }
  .tool-btn[aria-expanded="true"] {
    background: var(--sr-action);
    color: var(--sr-action-ink);
  }
  .sr-pro-tag {
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    padding: 3px 7px;
    border-radius: 999px;
    background: var(--sr-peach-ink);
    color: var(--sr-peach);
  }
  .tool-btn.teach-live {
    background: var(--sr-mint);
    color: var(--sr-mint-ink);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--sr-mint-ink);
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    width: min(22rem, calc(100vw - 32px));
    padding: 6px;
    border-radius: 20px;
    background: var(--sr-panel);
    box-shadow: var(--sr-card-shadow), 0 12px 32px rgb(0 0 0 / 0.12);
    border: 1px solid var(--sr-hairline);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .menu[hidden] {
    display: none;
  }
  .menu :global(.teach-item) {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    width: 100%;
    padding: 0.6rem 0.75rem;
    border-radius: 14px;
    color: var(--sr-ink);
    font-size: 14px;
  }
  .menu :global(.teach-item:hover),
  .menu :global(.teach-item:focus-visible) {
    background: var(--sr-track);
  }
  .menu :global(.teach-item:disabled) {
    opacity: 0.5;
  }
  .menu :global(.teach-item > svg),
  .menu :global(.teach-item > .live-dot) {
    margin-top: 2px;
    flex-shrink: 0;
  }
  @media (max-width: 640px) {
    .menu {
      position: fixed;
      left: 16px;
      right: 16px;
      top: auto;
      bottom: calc(var(--bottom-bar-h, 96px) + 12px);
      width: auto;
    }
  }
</style>
