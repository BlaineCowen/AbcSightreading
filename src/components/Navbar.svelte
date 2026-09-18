<script lang="ts">
  import { onMount } from "svelte";
  import { Sun, Moon } from "lucide-svelte";
  import { nextNavState, type NavScroll } from "../lib/nav-reveal";
  let isNavbarOpen = false;

  /**
   * Light/dark toggle. Only pages that opt in to the dark theme (`themable` on
   * Layout) show it - elsewhere it would flip nothing. Until someone toggles,
   * the OS decides; a toggle is saved and applied before paint by Layout.
   */
  const THEME_KEY = "sr-theme";
  let themable = false;
  let isDark = false;
  let darkQuery: MediaQueryList | null = null;

  function effectiveDark() {
    const forced = document.documentElement.dataset.theme;
    if (forced === "dark") return true;
    if (forced === "light") return false;
    return darkQuery?.matches ?? false;
  }

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    isDark = next === "dark";
  }

  const syncWithOs = () => (isDark = effectiveDark());

  let navbar: HTMLElement;
  // Hide on scroll down, show on scroll up - decided by nextNavState, which
  // handles the iPad cases (rubber-banding, momentum jitter) this used to trip on.
  let navScroll: NavScroll = { anchorY: 0, visible: true };

  // No requestAnimationFrame throttle: browsers already deliver scroll at most
  // once a frame, and a queued frame never runs while the page is hidden.
  const handleScroll = () => {
    if (!navbar) return;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const next = nextNavState(navScroll, window.scrollY, maxY, navbar.offsetHeight);
    if (next.visible !== navScroll.visible) {
      navbar.style.transform = next.visible ? "translateY(0)" : "translateY(-100%)";
    }
    navScroll = next;
  };

  onMount(() => {
    themable = document.body.classList.contains("sr-themable");
    darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    isDark = effectiveDark();
    darkQuery.addEventListener("change", syncWithOs);
    navScroll = { anchorY: Math.max(window.scrollY, 0), visible: true };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      darkQuery?.removeEventListener("change", syncWithOs);
    };
  });
</script>

<nav
  bind:this={navbar}
  class="fixed w-full bg-sr-raise shadow-md z-50 transition-transform duration-300"
>
  <div class="max-w-7xl mx-auto px-4">
    <div class="flex justify-between items-center h-16">
      <a
        href="/"
        class="text-xl font-bold text-sr-ink hover:text-sr-action-fg transition-colors"
      >
        ABC Sight Reading
      </a>

      <div class="flex items-center gap-1 md:hidden">
      {#if themable}
        <button
          class="p-2 rounded-md text-sr-ink-2 hover:bg-sr-track transition-colors"
          on:click={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {#if isDark}<Sun size={20} />{:else}<Moon size={20} />{/if}
        </button>
      {/if}
      <!-- Mobile menu button -->
      <button
        class="md:hidden p-2 rounded-md hover:bg-sr-track transition-colors"
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
      </div>

      <!-- Desktop menu -->
      <div class="hidden md:flex items-center space-x-8">
        <a
          href="/sightreading"
          class="text-sr-ink-2 hover:text-sr-action-fg transition-colors"
        >
          Unison Sight Reading
        </a>
        <a
          href="/choral-sightreading"
          class="text-sr-ink-2 hover:text-sr-action-fg transition-colors"
        >
          Choral Sight Reading
        </a>
        {#if themable}
          <button
            class="p-2 -my-2 rounded-md text-sr-ink-2 hover:text-sr-action-fg hover:bg-sr-track transition-colors"
            on:click={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {#if isDark}<Sun size={18} />{:else}<Moon size={18} />{/if}
          </button>
        {/if}
      </div>
    </div>

    <!-- Mobile menu -->
    {#if isNavbarOpen}
      <div class="md:hidden py-4 space-y-2">
        <a
          href="/sightreading"
          class="block px-4 py-2 text-sr-ink-2 hover:bg-sr-track rounded-md transition-colors"
          on:click={() => (isNavbarOpen = false)}
        >
          Unison Sight Reading
        </a>
        <a
          href="/choral-sightreading"
          class="block px-4 py-2 text-sr-ink-2 hover:bg-sr-track rounded-md transition-colors"
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
