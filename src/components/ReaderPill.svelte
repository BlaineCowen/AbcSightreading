<script lang="ts">
  /**
   * Who is reading (readers.ts), beside Preset on the Unison page: one
   * choice that sets the clef, range, transposition and sound, and keeps the
   * preset menu to what that reader can use. Remembered in this browser.
   */
  import { onMount, tick } from 'svelte';
  import { ChevronDown } from 'lucide-svelte';
  import { READERS, READER_GROUPS, readerById } from '../lib/readers';

  export let readerId: string | null = null;
  export let onChoose: (id: string | null) => void = () => {};

  let open = false;
  let root: HTMLElement;
  let panel: HTMLElement;

  $: reader = readerId ? readerById[readerId] ?? null : null;

  async function toggle() {
    open = !open;
    if (open) {
      await tick();
      (panel?.querySelector('[aria-pressed="true"]') as HTMLElement | null ?? panel?.querySelector('button'))?.focus();
    }
  }

  function choose(id: string | null) {
    open = false;
    onChoose(id);
    (root?.querySelector('.reader-trigger') as HTMLElement | null)?.focus();
  }

  onMount(() => {
    const away = (e: Event) => { if (open && root && !root.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (open && e.key === 'Escape') { e.stopPropagation(); choose(readerId); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc, true);
    };
  });
</script>

<div bind:this={root} class="relative">
  <button
    type="button"
    data-tour="reader"
    class="reader-trigger inline-flex items-center gap-2 bg-sr-sky text-sr-sky-ink rounded-full px-4 py-2 text-sm font-extrabold hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-sr-action"
    aria-haspopup="dialog"
    aria-expanded={open}
    title="Who is reading: sets the clef, range and sound, and which levels the Preset menu lists"
    on:click={toggle}
  >
    <span class="text-xs font-bold opacity-75">Reading as</span>
    <span>{reader?.name ?? 'Any'}</span>
    <ChevronDown size={14} class="shrink-0" />
  </button>

  {#if open}
    <div
      bind:this={panel}
      class="reader-panel absolute left-0 top-full mt-2 z-40 w-[22rem] bg-sr-raise rounded-[24px] shadow-[0_24px_60px_-20px_rgba(30,27,58,0.45)] p-3 max-h-[70vh] overflow-y-auto"
      role="dialog"
      aria-label="Who is reading"
    >
      {#each READER_GROUPS as group}
        <p class="text-xs font-bold text-sr-muted px-1 pt-1">{group.label}</p>
        <div class="flex flex-wrap gap-1.5 pt-1 pb-2" role="group" aria-label={group.label}>
          {#each READERS.filter((r) => r.family === group.family) as r (r.id)}
            <button
              type="button"
              class="sr-tok text-sm {r.id === readerId ? 'sr-on' : ''}"
              aria-pressed={r.id === readerId}
              on:click={() => choose(r.id)}
            >{r.name}</button>
          {/each}
        </div>
      {/each}
      <div class="border-t border-sr-hairline-2 pt-2 mt-1 flex items-center gap-2">
        <button
          type="button"
          class="sr-tok text-sm {readerId === null ? 'sr-on' : ''}"
          aria-pressed={readerId === null}
          on:click={() => choose(null)}
        >Any</button>
        <span class="text-xs text-sr-muted">Every level, and the clef and range as you set them.</span>
      </div>
    </div>
  {/if}
</div>

<style>
  /* A phone: a sheet from the bottom, as the settings' popovers are, since
     the pill sits mid-row and a panel under it ran off the screen. */
  @media (max-width: 640px) {
    .reader-panel {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      width: auto;
      margin: 0;
      border-radius: 24px 24px 0 0;
      max-height: 75vh;
      padding-bottom: calc(1rem + env(safe-area-inset-bottom));
      z-index: 60;
    }
  }
</style>
