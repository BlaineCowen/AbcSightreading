<script lang="ts">
  import { onMount } from "svelte";
  let isNavbarOpen = false;

  let navbar: HTMLElement;
  let lastScrollY = 0;

  const handleScroll = () => {
    if (window.scrollY > lastScrollY) {
      navbar.style.transform = "translateY(-100%)"; // Hide on scroll down
    } else {
      navbar.style.transform = "translateY(0)"; // Show on scroll up
    }
    lastScrollY = window.scrollY;
  };

  onMount(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  });
</script>

<nav
  bind:this={navbar}
  class="fixed w-full bg-white shadow-md z-50 transition-transform duration-300"
>
  <div class="max-w-7xl mx-auto px-4">
    <div class="flex justify-between items-center h-16">
      <a
        href="/"
        class="text-xl font-bold text-gray-800 hover:text-blue-600 transition-colors"
      >
        ABC Sight Reading
      </a>

      <!-- Mobile menu button -->
      <button
        class="md:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
        on:click={() => (isNavbarOpen = !isNavbarOpen)}
        aria-label="Toggle menu"
      >
        <svg
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {#if isNavbarOpen}
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          {:else}
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          {/if}
        </svg>
      </button>

      <!-- Desktop menu -->
      <div class="hidden md:flex space-x-8">
        <a
          href="/sightreading"
          class="text-gray-600 hover:text-blue-600 transition-colors"
        >
          Unison Sight Reading
        </a>
        <a
          href="/choral-sightreading"
          class="text-gray-600 hover:text-blue-600 transition-colors"
        >
          Choral Sight Reading
        </a>
      </div>
    </div>

    <!-- Mobile menu -->
    {#if isNavbarOpen}
      <div class="md:hidden py-4 space-y-2">
        <a
          href="/sightreading"
          class="block px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          on:click={() => (isNavbarOpen = false)}
        >
          Unison Sight Reading
        </a>
        <a
          href="/choral-sightreading"
          class="block px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          on:click={() => (isNavbarOpen = false)}
        >
          Choral Sight Reading
        </a>
      </div>
    {/if}
  </div>
</nav>

<style lang="css">
  .navbar-menu {
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    z-index: 50; /* Ensure it's above other elements */
  }
  .navbar-menu.open {
    transform: translateX(0);
  }
  .navbar-menu a {
    display: block;
    padding: 10px;
    color: black; /* Ensure links are visible */
    text-decoration: none;
  }
  .circle {
    width: 32px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>
