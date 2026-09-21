<!-- src/components/ui/DropUp.svelte -->
<script lang="ts">
  /**
   * A menu that opens upward from a chip in the playback bar.
   *
   * Inline on a phone, where the bar's "More controls" sheet scrolls and would
   * clip a floating menu; a drop-up above the chip from sm up. One place for
   * the parts that are easy to get subtly wrong:
   *
   * - Outside clicks close it, tested with composedPath rather than
   *   contains(target). An item that swaps its own icon as it is clicked has
   *   left the DOM by the time the click reaches the window, so contains() said
   *   "outside" and every toggle closed the menu behind it.
   * - Escape closes it and puts focus back on the chip, so a keyboard user is
   *   not left nowhere.
   */
  import ChevronUp from "lucide-svelte/icons/chevron-up";

  /** Classes for the chip. The open state is added here. */
  export let triggerClass = "";
  export let title = "";
  /** Names the menu for assistive tech. */
  export let label = "";
  export let open = false;
  export let disabled = false;
  export let menuClass = "min-w-[13rem]";

  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;

  function closeOnOutside(e: MouseEvent) {
    if (open && root && !e.composedPath().includes(root)) open = false;
  }

  function closeOnEscape(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      open = false;
      trigger?.focus();
    }
  }

  const close = () => (open = false);
</script>

<svelte:window on:click={closeOnOutside} on:keydown={closeOnEscape} />

<div class="relative w-full sm:w-auto" bind:this={root}>
  <button
    bind:this={trigger}
    class="{triggerClass} {open ? 'bg-slate-500' : ''}"
    on:click={() => (open = !open)}
    aria-haspopup="true"
    aria-expanded={open}
    {title}
    {disabled}
  >
    <slot name="trigger" />
    <ChevronUp size={14} class="transition-transform {open ? '' : 'rotate-180'}" />
  </button>
  {#if open}
    <div
      class="mt-2 sm:mt-0 sm:absolute sm:bottom-full sm:left-0 sm:mb-2 {menuClass}
             rounded-md bg-slate-700 shadow-xl ring-1 ring-slate-600 py-1"
      role="group"
      aria-label={label}
    >
      <slot {close} />
    </div>
  {/if}
</div>
