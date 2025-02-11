<script lang="ts">
  import { onMount } from "svelte";
  let isNavbarOpen = false;

  let navbar: HTMLDivElement;
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

<main>
  <div
    class="absolute bg-white flex w-full transition-transform duration-300"
    bind:this={navbar}
    style="transform: translateY(0);"
  >
    {#if isNavbarOpen}
      <div
        class="navbar-menu open inline-block bg-slate-100 top-full left-0 shadow-md w-32 z-10"
      >
        <!-- Your navbar menu content here -->
        <a href="/">Home</a>
        <a href="/choral-sightreading">Choral Sightreading</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </div>
    {/if}
    <div
      class="rounded-full m-4 inline-block bg-slate-100 shadow-md circle z-10"
    >
      <button id="hamburger" on:click={() => (isNavbarOpen = !isNavbarOpen)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          ><path
            fill="currentColor"
            d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"
          /></svg
        >
      </button>
    </div>
  </div>
</main>

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
