<script lang="ts">
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
        scale: 2,
        staffwidth: 200,
        paddingleft: 0,
        paddingright: 0,
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
  <div class="relative w-full max-w-[350px] p-4 bg-white rounded-lg shadow-md">
    <div class="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
      <button
        class="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        on:click={() => adjustRange("min", "up")}
      >
        ↑
      </button>
      <button
        class="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        on:click={() => adjustRange("min", "down")}
      >
        ↓
      </button>
    </div>

    <div class="flex justify-center items-center mx-12">
      <div id={staffId} class="w-full"></div>
    </div>

    <div class="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
      <button
        class="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        on:click={() => adjustRange("max", "up")}
      >
        ↑
      </button>
      <button
        class="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        on:click={() => adjustRange("max", "down")}
      >
        ↓
      </button>
    </div>
  </div>
{/if}
