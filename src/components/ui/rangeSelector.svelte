<script lang="ts">
  import { ChevronUp, ChevronDown } from "lucide-svelte";
  import { noteArray } from "../../resources/noteArray";
  import { onMount, tick } from "svelte";

  export let range: { min: number; max: number };
  export let clef: string;
  export let onRangeChange: (newRange: { min: number; max: number }) => void;

  let mounted = false;
  let staffId: string;

  onMount(async () => {
    staffId = `abcjs-staff-${Math.random().toString(36).substr(2, 9)}`;
    mounted = true;
    await tick(); // let Svelte flush DOM so the div with id={staffId} exists
    renderStaff();
  });

  async function renderStaff(): Promise<any> {
    if (!staffId || !mounted) return;

    const abcString = `X:1\nL:1/4\nV:v clef=${clef}\nK:C\n[V:v] ${noteArray[range.min]} ${noteArray[range.max]}|`;

    return import("abcjs").then((abcjs) => {
      abcjs.renderAbc(staffId, abcString, {
        responsive: "resize",
        // Two notes and a clef: a short staff scales up to fill the card.
        staffwidth: 120,
        paddingleft: 0,
        paddingright: 0,
        paddingtop: 0,
        paddingbottom: 0,
        // abcjs draws everything in currentColor, and add_classes tags staff
        // lines and each note - so the theme colours the drawing from CSS
        // below rather than it being stuck black on a white card.
        foregroundColor: "currentColor",
        add_classes: true,
      });
    });
  }

  $: if (clef && mounted) renderStaff();
  $: if (range && mounted) renderStaff();

  function adjustRange(type: "min" | "max", direction: "up" | "down") {
    let newRange = { ...range };

    if (type === "min") {
      if (direction === "up") {
        newRange.min = Math.min(range.min + 1, range.max - 1);
      } else {
        newRange.min = Math.max(0, range.min - 1);
      }
    } else {
      if (direction === "up") {
        newRange.max = Math.min(noteArray.length - 1, range.max + 1);
      } else {
        newRange.max = Math.max(range.min + 1, range.max - 1);
      }
    }
    onRangeChange(newRange);
  }
</script>

{#if mounted}
  <div class="range-card w-full max-w-[350px] flex items-center gap-2 px-2 py-2">
    <div class="flex flex-col items-center gap-1 shrink-0" role="group" aria-label="Lowest note">
      <span class="sr-label">Low</span>
      <button
        type="button"
        class="sr-icon-btn h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center"
        aria-label="Raise lowest note"
        disabled={range.min >= range.max - 1}
        on:click={() => adjustRange("min", "up")}
      ><ChevronUp size={16} /></button>
      <button
        type="button"
        class="sr-icon-btn h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center"
        aria-label="Lower lowest note"
        disabled={range.min <= 0}
        on:click={() => adjustRange("min", "down")}
      ><ChevronDown size={16} /></button>
    </div>

    <div class="range-staff flex-1 min-w-0">
      <div id={staffId} class="w-full"></div>
    </div>

    <div class="flex flex-col items-center gap-1 shrink-0" role="group" aria-label="Highest note">
      <span class="sr-label">High</span>
      <button
        type="button"
        class="sr-icon-btn h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center"
        aria-label="Raise highest note"
        disabled={range.max >= noteArray.length - 1}
        on:click={() => adjustRange("max", "up")}
      ><ChevronUp size={16} /></button>
      <button
        type="button"
        class="sr-icon-btn h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center"
        aria-label="Lower highest note"
        disabled={range.max <= range.min + 1}
        on:click={() => adjustRange("max", "down")}
      ><ChevronDown size={16} /></button>
    </div>
  </div>
{/if}

<style>
  .range-card {
    background: var(--sr-raise);
    border: 1px solid var(--sr-hairline);
    border-radius: var(--sr-r-md);
  }
  /* One colour for the whole drawing - staff, clef and notes alike. */
  .range-staff {
    color: var(--sr-ink);
  }
</style>
