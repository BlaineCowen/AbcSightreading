<script lang="ts">
  import { noteArray } from "../../resources/noteArray";
  import { onMount } from "svelte";

  export let range: { min: number; max: number };
  export let onRangeChange: (newRange: { min: number; max: number }) => void;
  let mounted = false;

  async function renderStaff(): Promise<any> {
    const abcString = `X:1\nK:C\nL:1/4\n${noteArray[range.min]}${noteArray[range.max]}|`;
    return import("abcjs").then((abcjs) => {
      var renderedTune = abcjs.renderAbc("abcjs-staff", abcString, {
        responsive: "resize",
        scale: 5,
        staffwidth: 300,
        paddingLeft: 10,
      });
      return renderedTune;
    });
  }

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

  $: if (range) {
    renderStaff();
  }

  onMount(() => {
    renderStaff();
    mounted = true;
  });
</script>

{#if mounted}
  <div class="relative w-[400px] p-4 mt-8 bg-white rounded-lg shadow-md">
    <div class="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
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

    <div class="flex justify-center items-center ml-10 w-full">
      <div id="abcjs-staff" class="flex justify-center w-full"></div>
    </div>

    <div class="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
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
