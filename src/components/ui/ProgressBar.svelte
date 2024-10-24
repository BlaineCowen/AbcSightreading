<script context="module">
  function MinusIcon() {
    return {
      $$render: () => `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-4 w-4"
      >
        <path d="M5 12h14" />
      </svg>
    `,
    };
  }

  function PlusIcon() {
    return {
      $$render: () => `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-4 w-4"
      >
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </svg>
    `,
    };
  }
</script>

<script>
  export let label = "Chordname";
  export let weight = 1;
  export let chordName = "C";
  import { createEventDispatcher } from "svelte";
  import { spring } from "svelte/motion";
  import { fade } from "svelte/transition";

  const dispatch = createEventDispatcher();

  let value = spring(weight, {
    stiffness: 0.1,
    damping: 0.25,
  });

  $: percentage = $value * 50;

  // Dispatch the new value whenever it changes
  $: dispatch("valueChange", { chordName, value: $value });

  function increment() {
    value.set(Math.min($value + 0.1, 2));
  }

  function decrement() {
    value.set(Math.max($value - 0.1, 0));
  }
</script>

<div class="w-full max-w-sm space-y-4 text-center">
  <label for="progress-bar" class="text-3xl text-center font-semibold">
    {label}
  </label>
  <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
    <div
      class="bg-primary h-2.5 rounded-full transition-all duration-300 ease-spring"
      style="width: {percentage}%"
      transition:fade
    ></div>
  </div>
  <div class="flex justify-between items-center">
    <button
      on:click={decrement}
      disabled={$value === 0}
      class="px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      aria-label="Decrease value"
    >
      {@html MinusIcon().$$render()}
    </button>
    <span class="text-2xl font-bold" in:fade>{$value.toFixed(1)}</span>
    <button
      on:click={increment}
      disabled={$value === 10}
      class="px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      aria-label="Increase value"
    >
      {@html PlusIcon().$$render()}
    </button>
  </div>
</div>

<style>
  /* Custom spring transition for smooth progress bar updates */
  .ease-spring {
    transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
</style>
