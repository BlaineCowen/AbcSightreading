<script lang="ts">
  import { onMount } from "svelte";
  import { whenLabel, type RecentExercise } from "../lib/recent-exercises";
  import { BUILTIN_SETS } from "../lib/curriculum/catalogue";
  import { trackById } from "../lib/curriculum/tracks";
  import Music from "lucide-svelte/icons/music";
  import Library from "lucide-svelte/icons/library";
  import BookOpen from "lucide-svelte/icons/book-open";
  import Users from "lucide-svelte/icons/users";
  import AudioLines from "lucide-svelte/icons/audio-lines";
  import StudentAssignments from "./StudentAssignments.svelte";
  import PipFace from "./PipFace.svelte";
  import { FIRST_STEP_HREF } from "../lib/tour";

  /**
   * The home page for someone signed in (index.astro shows the landing page to
   * everyone else): back into practice in one tap, the exercises they wrote
   * last, the tracks they follow, and the way to their account. Tracks used to
   * be a link in the navbar.
   *
   * Everything it shows comes from the server with the page (index.astro), and
   * the page is drawn there too: it used to fetch each list after loading, so
   * the page drew "Loading…" and then jumped as each arrived.
   */
  export let name = "";
  export let accountType: "standard" | "educator" | "student" = "standard";
  export let recent: RecentExercise[] = [];
  export let tracks: string[] = [];
  /** The month's allowance; limit null is unlimited. */
  export let allowance: { limit: number | null; remaining: number | null } | null = null;
  export let assignments: { enrolled: boolean; assignments: any[] } | null = null;
  /** A student's songs: every piece assigned to their classes (server/pieces.ts libraryFor). */
  export let library: { id: string; title: string; composer: string; classes: string[] }[] = [];
  /** The founding-teacher offer, when this teacher may join (index.astro). */
  export let founders: { ok: boolean } | null = null;
  /** Signed in through their district's ClassLink, so Pro is on free this school year. */
  export let classlink = false;
  /** The server's clock, so the times read the same drawn there and here. */
  export let now = Date.now();

  let showAll = false;

  const firstName = (name || "").trim().split(/\s+/)[0] ?? "";

  /**
   * The founding-teacher offer as a modal, the first time a teacher who may
   * join comes home (Blaine, 16 October 2026: the strip was hard to see in
   * dark mode). "Not now" is remembered in this browser; the strip stays.
   */
  const OFFER_SEEN = "abc-founders-offer-v1";
  let offerOpen = false;
  let offerButton: HTMLAnchorElement;
  function closeOffer() {
    offerOpen = false;
    try { localStorage.setItem(OFFER_SEEN, "1"); } catch {}
  }

  onMount(() => {
    try {
      if (founders && !localStorage.getItem(OFFER_SEEN)) {
        offerOpen = true;
        setTimeout(() => offerButton?.focus(), 50);
      }
    } catch {}
    now = Date.now();
    const tickTimer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(tickTimer);
  });

  async function forget(id: string) {
    recent = recent.filter((r) => r.id !== id);
    await fetch(`/api/recent?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  /** How many of the earlier exercises show before "Show all". */
  const SHOWN = 4;
  $: last = recent[0] ?? null;
  // The last one is the big card at the top, so the list starts after it.
  $: earlier = recent.slice(1);
  $: shown = showAll ? earlier : earlier.slice(0, SHOWN);
  $: planLine = !allowance
    ? ""
    : allowance.limit === null
      ? "Unlimited exercises"
      : `${allowance.remaining ?? 0} of ${allowance.limit} exercises left this month`;

  /** A subscribed set or track: its name and where it opens. */
  type Card = { id: string; name: string; level: string; href: string };
  $: cards = tracks.flatMap((id): Card[] => {
    const set = BUILTIN_SETS.find((s) => s.id === id);
    if (set) return [{ id, name: set.name, level: set.level, href: set.href }];
    const t = trackById[id];
    if (!t) return [];
    return [{ id, name: t.name, level: t.level, href: `/curriculum/${t.id}` }];
  });
  /** Students have three tiles (library, tuner, challenge); everyone else four. */
  $: tileCount = accountType === "student" ? 3 : 4;
</script>

<!--
  Symmetrical and focused (Blaine, 16 October 2026: "so messy", then "I just
  don't like how unsymmetrical it is"): one full-width card to pick up the
  last exercise (step 1 for a newcomer), with a fresh Unison or Choral in it;
  a row of equal tiles, My music first; at most one offer, as a slim strip;
  then the earlier exercises.
-->
<svelte:window on:keydown={(e) => offerOpen && e.key === "Escape" && closeOffer()} />

<div class="home w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-5">
  <header>
    <h1 class="text-3xl sm:text-4xl font-bold text-sr-ink">Welcome back{firstName ? `, ${firstName}` : ""}</h1>
    {#if planLine}<p class="mt-1 text-sm font-semibold text-sr-muted">{planLine}</p>{/if}
  </header>

  <!-- Back into practice: where they left off, or where a newcomer starts (tour.ts Quick start). -->
  <section class="hero" aria-label="Practice">
    {#if last || accountType !== "student"}
      <span class="text-xs font-bold uppercase tracking-wide opacity-80">{last ? "Pick up where you left off" : "Start here"}</span>
      <a class="hero-main" href={last ? last.link : FIRST_STEP_HREF}>
        <span class="min-w-0">
          <span class="block text-2xl sm:text-3xl font-extrabold leading-tight">{last ? last.title : "abcStepByStep, step 1"}</span>
          <span class="block text-sm opacity-90 truncate">{last ? last.detail : "A short rhythm first. Each step adds one new thing."}</span>
        </span>
        <span class="hero-go" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
        </span>
      </a>
    {:else}
      <span class="block text-2xl font-extrabold leading-tight">Write yourself an exercise</span>
    {/if}
    <div class="hero-new">
      <span class="text-sm font-semibold opacity-90">Or start a new one:</span>
      <a class="new-pill" href="/sightreading">Unison <span class="opacity-75 font-semibold">one line</span></a>
      <a class="new-pill" href="/choral-sightreading">Choral <span class="opacity-75 font-semibold">parts</span></a>
    </div>
  </section>

  <!-- Equal tiles: their music, their courses, their classes (or the tuner), the challenge. -->
  <section class="tiles" style="--n: {tileCount}" aria-label="Your things">
    {#if accountType === "student"}
      <a class="tile bg-sr-peach text-sr-peach-ink" href="/library">
        <Library size={26} aria-hidden="true" />
        <span class="tile-title">My library</span>
        <span class="tile-line">{library.length ? `${library.length} song${library.length === 1 ? "" : "s"} from your classes` : "Songs your teachers give you"}</span>
      </a>
    {:else}
      <a class="tile bg-sr-peach text-sr-peach-ink" href="/pieces">
        <Music size={26} aria-hidden="true" />
        <span class="tile-title">My music</span>
        <span class="tile-line">Your own pieces: play any part, loop the hard bars</span>
      </a>
      <!-- The sets and instrument courses they follow; each name opens its course. -->
      <div class="tile bg-sr-mint text-sr-mint-ink">
        <BookOpen size={26} aria-hidden="true" />
        <a class="tile-title hover:underline" href="/curriculum">My courses</a>
        {#if cards.length}
          <span class="flex flex-wrap gap-1.5">
            {#each cards as c (c.id)}<a class="chip" href={c.href}>{c.name}</a>{/each}
          </span>
        {:else}
          <a class="tile-line underline underline-offset-2" href="/curriculum">Choose a course</a>
        {/if}
      </div>
    {/if}
    {#if accountType === "educator"}
      <a class="tile bg-sr-sky text-sr-sky-ink" href="/account#students">
        <Users size={26} aria-hidden="true" />
        <span class="tile-title">Classes</span>
        <span class="tile-line">Students, assignments and progress</span>
      </a>
    {:else}
      <a class="tile bg-sr-sky text-sr-sky-ink" href="/tuner">
        <AudioLines size={26} aria-hidden="true" />
        <span class="tile-title">abcTuner</span>
        <span class="tile-line">Tuner, metronome, drone and more</span>
      </a>
    {/if}
    <a class="tile bg-sr-butter text-sr-butter-ink" href="/challenge">
      <PipFace class="w-[26px] h-[26px]" />
      <span class="tile-title">Can you sing it?</span>
      <span class="tile-line">A free challenge to send your {accountType === "student" ? "friends" : "singers"}</span>
    </a>
  </section>

  {#if founders}
    <!-- The founding-teacher offer (/founders), for a teacher who may join. -->
    <a class="offer bg-sr-peach text-sr-peach-ink" href="/founders">
      <span class="offer-tag">{classlink ? "Pro is on through ClassLink" : "Founding teachers"}</span>
      <span class="offer-text text-sm"><b>Educator free this school year</b>, with 300 student accounts, then half price for as long as you stay.</span>
      <span class="text-sm font-extrabold whitespace-nowrap underline underline-offset-2">See the offer</span>
    </a>
  {/if}

  {#if accountType === "student"}
    <StudentAssignments initial={assignments} />
  {/if}

  {#if offerOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="offer-back" on:click|self={closeOffer}>
      <div class="offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-h">
        <div class="offer-top">
          <span class="text-xs font-extrabold uppercase tracking-wide opacity-80">{classlink ? "Pro is already on through ClassLink" : "Founding teachers"}</span>
          <h2 id="offer-h" class="text-2xl font-extrabold leading-tight">Bring your students, free this school year</h2>
        </div>
        <ul class="offer-list">
          <li><b>Educator free</b> through May 31, 2027: classes with join codes, assignments, and each student's practice time.</li>
          <li><b>300 student accounts</b>, safe for every age: no student email, logins you can print.</li>
          <li><b>Half price after that</b>, for as long as you stay.</li>
        </ul>
        <div class="flex flex-wrap gap-2 justify-end">
          <button type="button" class="sr-btn-quiet" on:click={closeOffer}>Not now</button>
          <a class="sr-btn" href="/founders" bind:this={offerButton} on:click={closeOffer}>See the offer</a>
        </div>
      </div>
    </div>
  {/if}

  <!-- The exercises they wrote before the last, each reopening exactly as it was. -->
  {#if earlier.length}
    <section aria-labelledby="recent-h">
      <div class="section-head">
        <h2 id="recent-h">Recent</h2>
        {#if earlier.length > SHOWN}
          <button class="sr-link text-sm" on:click={() => (showAll = !showAll)}>{showAll ? "Show fewer" : `Show all ${earlier.length}`}</button>
        {/if}
      </div>
      <ul class="list">
        {#each shown as r (r.id)}
          <li class="row">
            <span class="page-tag {r.page === 'choral' ? 'bg-sr-sky text-sr-sky-ink' : 'bg-sr-mint text-sr-mint-ink'}">{r.page === "choral" ? "Choral" : "Unison"}</span>
            <a class="min-w-0 flex-1 group" href={r.link}>
              <span class="block font-bold text-sr-ink truncate group-hover:underline">{r.title}</span>
              <span class="block text-sm text-sr-muted truncate">{r.detail}</span>
            </a>
            <span class="when text-xs text-sr-faint whitespace-nowrap">{whenLabel(r.createdAt, now)}</span>
            <button class="forget" on:click={() => forget(r.id)} aria-label="Remove {r.title} from recent exercises" title="Remove">×</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.5rem 1.75rem 1.3rem;
    border-radius: 28px;
    background: var(--sr-action);
    color: var(--sr-action-ink);
    box-shadow: var(--sr-card-shadow);
  }
  .hero-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .hero-go {
    flex: none;
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 999px;
    background: var(--sr-action-ink);
    color: var(--sr-action);
    transition: transform 120ms ease;
  }
  .hero-main:hover .hero-go { transform: scale(1.08); }
  .hero-new {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.6rem;
    padding-top: 0.9rem;
    border-top: 1px solid color-mix(in srgb, var(--sr-action-ink) 25%, transparent);
  }
  @media (max-width: 480px) {
    .hero-new > span:first-child { width: 100%; }
  }
  .new-pill {
    display: inline-flex;
    gap: 0.35rem;
    align-items: baseline;
    font-weight: 800;
    font-size: 0.9rem;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--sr-action-ink) 18%, transparent);
  }
  .new-pill:hover { background: color-mix(in srgb, var(--sr-action-ink) 28%, transparent); }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  @media (min-width: 900px) {
    .tiles { grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    padding: 1.1rem 1.15rem 1.2rem;
    border-radius: 24px;
    min-height: 9.5rem;
    transition: transform 120ms ease;
  }
  a.tile:hover { transform: translateY(-2px); }
  .tile :global(svg) { margin-bottom: 0.35rem; }
  .tile-title { font-size: 1.1rem; font-weight: 800; line-height: 1.2; }
  .tile-line { font-size: 0.85rem; line-height: 1.35; opacity: 0.9; }
  .chip {
    font-size: 0.78rem;
    font-weight: 800;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }
  .chip:hover { background: color-mix(in srgb, currentColor 22%, transparent); }
  .offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.9rem;
    padding: 0.8rem 1.1rem;
    border-radius: 20px;
  }
  .offer:hover { filter: brightness(0.97); }
  .offer-text { flex: 1 1 18rem; min-width: 0; }
  .offer-tag {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    background: color-mix(in srgb, var(--sr-peach-ink) 12%, transparent);
  }
  .offer-back {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(15 23 42 / 0.55);
    animation: offer-fade 160ms ease-out;
  }
  .offer-modal {
    width: min(30rem, 100%);
    border-radius: 28px;
    overflow: hidden;
    background: var(--sr-raise);
    color: var(--sr-ink);
    box-shadow: 0 30px 80px -20px rgb(0 0 0 / 0.5);
    padding-bottom: 1.25rem;
    animation: offer-rise 200ms ease-out;
  }
  .offer-top {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 1.4rem 1.5rem 1.2rem;
    background: var(--sr-peach);
    color: var(--sr-peach-ink);
  }
  .offer-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.1rem 1.5rem 1.25rem 2.6rem;
    list-style: disc;
    font-size: 0.95rem;
    color: var(--sr-ink-2);
  }
  .offer-list b { color: var(--sr-ink); }
  .offer-modal > div:last-child { padding: 0 1.5rem; }
  @keyframes offer-fade { from { opacity: 0; } }
  @keyframes offer-rise { from { opacity: 0; transform: translateY(10px) scale(0.98); } }
  @media (prefers-reduced-motion: reduce) {
    .offer-back, .offer-modal { animation: none; }
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0.25rem 0 0.5rem;
    padding: 0 0.25rem;
  }
  .section-head h2 { font-size: 1.05rem; font-weight: 700; color: var(--sr-ink); }
  .list {
    display: flex;
    flex-direction: column;
    background: var(--sr-panel);
    border-radius: 24px;
    padding: 0.25rem 1.1rem;
    box-shadow: var(--sr-card-shadow);
  }
  .list > li + li { border-top: 1px solid var(--sr-hairline-2); }
  .row { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0; }
  .page-tag {
    font-size: 11px;
    font-weight: 800;
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    flex: none;
  }
  .forget {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    color: var(--sr-faint);
    font-size: 1.15rem;
    line-height: 1;
    flex: none;
  }
  .forget:hover { background: var(--sr-track); color: var(--sr-ink); }
  @media (max-width: 480px) {
    .when { display: none; }
    .tile { min-height: 8.5rem; padding: 1rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hero-go, .tile { transition: none; }
    .hero-main:hover .hero-go, a.tile:hover { transform: none; }
  }
</style>
