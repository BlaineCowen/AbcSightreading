<script lang="ts">
  import { onMount } from "svelte";
  import { whenLabel, type RecentExercise } from "../lib/recent-exercises";
  import { BUILTIN_SETS } from "../lib/curriculum/catalogue";
  import { trackById, TRACK_COLOR_CLASS, iconFor } from "../lib/curriculum/tracks";
  import { INSTRUMENT_ICON, INSTRUMENT_PATHS } from "../lib/curriculum/instrument-icons";
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

  onMount(() => {
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

  /** A subscribed set or track as a card: where it opens, its name and colour, and a drawing for an instrument. */
  type Card = { id: string; name: string; level: string; href: string; color: string; icon: string | null };
  $: cards = tracks.flatMap((id): Card[] => {
    const set = BUILTIN_SETS.find((s) => s.id === id);
    if (set) return [{ id, name: set.name, level: set.level, href: set.href, color: TRACK_COLOR_CLASS[set.color], icon: null }];
    const t = trackById[id];
    if (!t) return [];
    return [{ id, name: t.name, level: t.level, href: `/curriculum/${t.id}`, color: TRACK_COLOR_CLASS[t.color], icon: iconFor(t) }];
  });
  const iconPaths = (key: string) => INSTRUMENT_PATHS[INSTRUMENT_ICON[key]?.icon ?? ""] ?? [];
</script>

<!--
  One thing first: back into practice (the last exercise, or step 1 for a
  newcomer), with a fresh Unison or Choral beside it; the rest of what they
  wrote under it. Everything else sits in a quiet column at the side (under it
  on a phone), and only one offer shows at a time. Blaine, 16 October 2026:
  the page was eight full-width blocks of equal weight.
-->
<div class="home w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6">
  <header>
    <h1 class="text-3xl sm:text-4xl font-bold text-sr-ink">Welcome back{firstName ? `, ${firstName}` : ""}</h1>
    {#if planLine}<p class="mt-1 text-sm font-semibold text-sr-muted">{planLine}</p>{/if}
  </header>

  <div class="layout">
    <div class="main flex flex-col gap-6 min-w-0">
      <!-- Back into practice: where they left off, or where a newcomer starts (tour.ts Quick start). -->
      <section class="hero" aria-label="Practice">
        {#if last}
          <span class="text-xs font-bold uppercase tracking-wide opacity-80">Pick up where you left off</span>
          <a class="hero-main" href={last.link}>
            <span class="min-w-0">
              <span class="block text-2xl font-extrabold leading-tight">{last.title}</span>
              <span class="block text-sm opacity-90 truncate">{last.detail}</span>
            </span>
            <span class="hero-go" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
            </span>
          </a>
        {:else if accountType !== "student"}
          <span class="text-xs font-bold uppercase tracking-wide opacity-80">Start here</span>
          <a class="hero-main" href={FIRST_STEP_HREF}>
            <span class="min-w-0">
              <span class="block text-2xl font-extrabold leading-tight">abcStepByStep, step 1</span>
              <span class="block text-sm opacity-90">A short rhythm first. Each step adds one new thing.</span>
            </span>
            <span class="hero-go" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
            </span>
          </a>
        {:else}
          <span class="text-xs font-bold uppercase tracking-wide opacity-80">Practice</span>
          <span class="block text-2xl font-extrabold leading-tight">Write yourself an exercise</span>
        {/if}
        <div class="hero-new">
          <span class="text-sm font-semibold opacity-90">{last || accountType !== "student" ? "Or start a new one:" : ""}</span>
          <a class="new-pill" href="/sightreading">Unison <span class="opacity-75 font-semibold">one line</span></a>
          <a class="new-pill" href="/choral-sightreading">Choral <span class="opacity-75 font-semibold">parts</span></a>
        </div>
      </section>

      {#if accountType === "student"}
        <StudentAssignments initial={assignments} />
        {#if library.length}
          <!-- Songs their teachers assigned, whole and any part, to practise any time. -->
          <section aria-labelledby="library-h">
            <div class="section-head">
              <h2 id="library-h">My library</h2>
              {#if library.length > 4}<a class="sr-link text-sm" href="/library">All {library.length} songs</a>{/if}
            </div>
            <ul class="list">
              {#each library.slice(0, 4) as p (p.id)}
                <li>
                  <a class="row group" href="/pieces/{p.id}">
                    <span class="page-tag bg-sr-peach text-sr-peach-ink">Song</span>
                    <span class="min-w-0 flex-1">
                      <span class="block font-bold text-sr-ink truncate group-hover:underline">{p.title}</span>
                      <span class="block text-sm text-sr-muted truncate">{[p.composer, p.classes.join(", ")].filter(Boolean).join(" · ")}</span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
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
      {:else if !last && accountType !== "student"}
        <p class="text-sm text-sr-muted px-1">Every exercise you write shows up here, ready to open again.</p>
      {/if}
    </div>

    <aside class="side flex flex-col gap-4" aria-label="More">
      {#if accountType === "educator"}
        <section class="side-card">
          <h2>Classes</h2>
          <p class="text-sm text-sr-muted">Students, assignments and what each class has passed.</p>
          <div class="flex flex-wrap gap-2 mt-1">
            <a class="sr-btn text-sm" href="/account?assign=new#students">New assignment</a>
            <a class="sr-btn-quiet text-sm" href="/account#students">Open classes</a>
          </div>
        </section>
      {/if}

      {#if founders}
        <!-- The founding-teacher offer (/founders), for a teacher who may join; it stands in for the challenge. -->
        <a class="side-card offer bg-sr-peach text-sr-peach-ink" href="/founders">
          <span class="text-xs font-bold uppercase tracking-wide opacity-80">{classlink ? "Pro is on free through ClassLink" : "Founding teachers"}</span>
          <span class="text-lg font-extrabold leading-tight">Educator free this school year</span>
          <span class="text-sm">Bring your students: 300 accounts free through May 31, then half price for as long as you stay.</span>
          <span class="text-sm font-extrabold underline underline-offset-2">See the offer</span>
        </a>
      {:else}
        <!-- The free challenge (/challenge): something to send a choir or a class. -->
        <a class="side-card offer bg-sr-butter text-sr-butter-ink" href="/challenge">
          <span class="flex items-center gap-3">
            <PipFace class="w-12 h-12 shrink-0" />
            <span class="text-lg font-extrabold leading-tight">Can you sing it?</span>
          </span>
          <span class="text-sm">Eight random notes, graded as you sing, with a video to share. Send it to your {accountType === "student" ? "friends" : "singers"}.</span>
        </a>
      {/if}

      {#if accountType !== "student"}
        <!-- The sets and instrument courses they follow (they used to be behind the navbar's Tracks). -->
        <section class="side-card" aria-labelledby="tracks-h">
          <div class="section-head !mb-1">
            <h2 id="tracks-h">My courses</h2>
            <a class="sr-link text-sm" href="/curriculum">{cards.length ? "Change" : "Choose"}</a>
          </div>
          {#if cards.length === 0}
            <p class="text-sm text-sr-muted">Choose a course and its steps appear in the preset menu.</p>
          {:else}
            <ul class="flex flex-col">
              {#each cards as c (c.id)}
                <li>
                  <a class="link-row group" href={c.href}>
                    <span class="badge {c.color}">
                      {#if c.icon && iconPaths(c.icon).length}
                        <svg width="22" height="22" viewBox="0 0 512 512" aria-hidden="true">
                          <g fill="currentColor" transform={INSTRUMENT_ICON[c.icon]?.upright ? "rotate(-38 256 256)" : undefined}>
                            {#each iconPaths(c.icon) as d}<path {d} />{/each}
                          </g>
                        </svg>
                      {:else}<span aria-hidden="true">♪</span>{/if}
                    </span>
                    <span class="min-w-0">
                      <span class="block font-bold text-sr-ink leading-tight truncate group-hover:underline">{c.name}</span>
                      <span class="block text-xs text-sr-muted truncate">{c.level}</span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <nav class="side-card" aria-label="More to practise">
          <a class="link-row group" href="/pieces">
            <span class="min-w-0">
              <span class="block font-bold text-sr-ink group-hover:underline">My music</span>
              <span class="block text-xs text-sr-muted">Your own pieces, any part, loop the hard bars</span>
            </span>
          </a>
          {#if founders}
            <a class="link-row group" href="/challenge">
              <span class="min-w-0">
                <span class="block font-bold text-sr-ink group-hover:underline">Can you sing it?</span>
                <span class="block text-xs text-sr-muted">A free challenge to send your singers</span>
              </span>
            </a>
          {/if}
          <a class="link-row group" href="/account">
            <span class="min-w-0">
              <span class="block font-bold text-sr-ink group-hover:underline">Account and settings</span>
              <span class="block text-xs text-sr-muted">Plan, rhythm syllables{accountType === "educator" ? ", classes" : ""}</span>
            </span>
          </a>
        </nav>
      {/if}
    </aside>
  </div>
</div>

<style>
  .layout {
    display: grid;
    gap: 1.5rem;
    align-items: start;
  }
  @media (min-width: 900px) {
    .layout { grid-template-columns: minmax(0, 1fr) 19rem; gap: 2rem; }
  }
  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.4rem 1.5rem 1.25rem;
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
    width: 3.25rem;
    height: 3.25rem;
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
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    padding: 0 0.25rem;
  }
  .section-head h2, .side-card h2 {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--sr-ink);
  }
  .list {
    display: flex;
    flex-direction: column;
    background: var(--sr-panel);
    border-radius: 24px;
    padding: 0.25rem 1rem;
    box-shadow: var(--sr-card-shadow);
  }
  .list > li + li { border-top: 1px solid var(--sr-hairline-2); }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0;
  }
  .side-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 1rem 1.1rem;
    border-radius: 24px;
  }
  /* An offer brings its own pastel. */
  .side-card:not(.offer) { background: var(--sr-panel); }
  .side-card.offer { gap: 0.4rem; }
  a.side-card.offer:hover { filter: brightness(0.98); }
  .link-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0;
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 12px;
    font-weight: 800;
    font-size: 1.1rem;
  }
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
  }
  @media (prefers-reduced-motion: reduce) {
    .hero-go { transition: none; }
    .hero-main:hover .hero-go { transform: none; }
  }
</style>
