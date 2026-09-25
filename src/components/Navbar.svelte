<script lang="ts">
  import { onMount } from "svelte";
  import { Sun, Moon, CircleUser } from "lucide-svelte";
  import { nextNavState, type NavScroll } from "../lib/nav-reveal";
  import { signedInUser } from "../lib/auth-client";
  let isNavbarOpen = false;

  /**
   * The two modules. Short names on the bar - the logo already says "Sight
   * Reading" - and the full ones in the phone menu, where there is room.
   */
  const pages = [
    { href: "/sightreading", short: "Unison", full: "Unison Sight Reading" },
    { href: "/choral-sightreading", short: "Choral", full: "Choral Sight Reading" },
  ];
  // client:only, so the path is there from the first render.
  const here =
    typeof window === "undefined" ? "" : window.location.pathname.replace(/\/+$/, "") || "/";

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

  /**
   * Sign in, or the account page. Undecided until the session answers, and
   * nothing is drawn meanwhile, so the bar never flashes the wrong one.
   */
  let account: { email: string } | null | undefined = undefined;
  signedInUser().then((u) => (account = u));
  $: nextHere = encodeURIComponent(here || "/");

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
  class="fixed w-full bg-sr-raise border-b border-sr-hairline z-50 transition-transform duration-300"
>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
    <div class="flex justify-between items-center h-16">
      <!-- The logo: "abc" small, in the favicon's Edwin Bold Italic, then the
           name large. The three letters are the font's own outlines rather
           than text: the site's Edwin face loads only the regular weight,
           and a whole bold-italic font file for three letters would flash in
           late on every page. -->
      <a
        href="/"
        class="group flex items-baseline gap-1"
        aria-label="ABC Sight Reading, home"
      >
        <svg
          class="h-[0.75em] w-auto text-[18px] sm:text-[21px] text-sr-action-fg"
          viewBox="0 -736 1780 750"
          fill="currentColor"
          aria-hidden="true"
        ><path d="M440 -463 426 -416C402 -457 360 -477 301 -477C153 -477 15 -327 15 -166C15 -60 87 14 188 14C257 14 304 -11 351 -73C351 -51 351 -49 354 -41C363 -8 396 14 436 14C527 14 604 -85 646 -157L607 -181C570 -124 520 -70 503 -70C496 -70 489 -78 489 -86C489 -93 489 -94 499 -131L597 -463ZM334 -422C370 -422 395 -393 395 -350C395 -275 336 -56 239 -56C201 -56 178 -86 178 -135C178 -214 232 -422 334 -422ZM1018 -736 751 -722 744 -675H768C818 -675 830 -669 830 -644C830 -633 827 -623 814 -577L717 -251C696 -180 695 -177 695 -145C695 -49 776 14 899 14C981 14 1053 -14 1113 -70C1182 -133 1224 -223 1224 -306C1224 -404 1151 -478 1055 -478C1007 -478 973 -464 927 -426ZM997 -407C1034 -407 1061 -375 1061 -333C1061 -258 1000 -29 904 -29C865 -29 838 -60 838 -105C838 -155 864 -252 895 -315C925 -378 958 -407 997 -407ZM1684 -146C1625 -78 1577 -47 1528 -47C1480 -47 1446 -86 1446 -141C1446 -227 1497 -431 1609 -431C1634 -431 1651 -421 1651 -406C1651 -399 1648 -395 1639 -390C1611 -372 1601 -357 1601 -328C1601 -285 1633 -256 1679 -256C1731 -256 1765 -293 1765 -349C1765 -427 1698 -478 1594 -478C1424 -478 1281 -338 1281 -171C1281 -58 1362 14 1488 14C1576 14 1647 -26 1720 -116Z" /></svg>
        <span
          class="text-[26px] sm:text-[30px] font-semibold tracking-[-0.015em] leading-none text-sr-ink group-hover:text-sr-action-fg transition-colors"
        >Sight Reading</span>
      </a>

      <div class="flex items-center gap-1 md:hidden">
      {#if themable}
        <button
          class="w-11 h-11 flex items-center justify-center rounded-md text-sr-ink-2 hover:bg-sr-track transition-colors"
          on:click={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {#if isDark}<Sun size={20} />{:else}<Moon size={20} />{/if}
        </button>
      {/if}
      <!-- Mobile menu button -->
      <button
        class="w-11 h-11 flex items-center justify-center rounded-md text-sr-ink transition-colors {isNavbarOpen ? 'bg-sr-track' : 'hover:bg-sr-track'}"
        on:click={() => (isNavbarOpen = !isNavbarOpen)}
        aria-label={isNavbarOpen ? "Close menu" : "Open menu"}
        aria-expanded={isNavbarOpen}
      >
        <svg
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
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
      <div class="hidden md:flex items-center gap-7">
        {#each pages as page}
          <a
            href={page.href}
            class="text-[15px] transition-colors hover:text-sr-action-fg {here === page.href ? 'font-semibold text-sr-action-fg' : 'text-sr-ink-2'}"
            aria-current={here === page.href ? "page" : undefined}
          >
            {page.short}
          </a>
        {/each}
        {#if themable}
          <button
            class="w-10 h-10 flex items-center justify-center rounded-md text-sr-ink-2 hover:text-sr-action-fg hover:bg-sr-track transition-colors"
            on:click={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {#if isDark}<Sun size={18} />{:else}<Moon size={18} />{/if}
          </button>
        {/if}
        {#if account}
          <a
            href="/account"
            class="w-10 h-10 flex items-center justify-center rounded-md transition-colors hover:text-sr-action-fg hover:bg-sr-track {here === '/account' ? 'text-sr-action-fg' : 'text-sr-ink-2'}"
            aria-label="Account ({account.email})"
            title={account.email}
          ><CircleUser size={20} /></a>
        {:else if account === null && here !== "/login"}
          <a href="/login?next={nextHere}" class="sr-btn-quiet text-[14px]">Sign in</a>
        {/if}
      </div>
    </div>

    <!-- Mobile menu -->
    {#if isNavbarOpen}
      <div class="md:hidden pt-1 pb-3 flex flex-col gap-0.5">
        {#each pages as page}
          <a
            href={page.href}
            class="flex items-center min-h-12 px-3 rounded-md text-base transition-colors {here === page.href ? 'font-semibold text-sr-action-fg bg-sr-track' : 'text-sr-ink-2 hover:bg-sr-track'}"
            aria-current={here === page.href ? "page" : undefined}
            on:click={() => (isNavbarOpen = false)}
          >
            {page.full}
          </a>
        {/each}
        {#if account !== undefined}
          <a
            href={account ? "/account" : `/login?next=${nextHere}`}
            class="flex items-center min-h-12 px-3 rounded-md text-base transition-colors {here === '/account' || here === '/login' ? 'font-semibold text-sr-action-fg bg-sr-track' : 'text-sr-ink-2 hover:bg-sr-track'}"
            on:click={() => (isNavbarOpen = false)}
          >
            {account ? `Account (${account.email})` : "Sign in"}
          </a>
        {/if}
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
