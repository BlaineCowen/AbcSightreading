<script lang="ts">
  import { onMount } from "svelte";
  import { usage, loadUsage } from "../lib/usage";
  import { whenLabel, type RecentExercise } from "../lib/recent-exercises";
  import { BUILTIN_SETS } from "../lib/curriculum/catalogue";
  import { trackById, TRACK_COLOR_CLASS, iconFor } from "../lib/curriculum/tracks";
  import { INSTRUMENT_ICON, INSTRUMENT_PATHS } from "../lib/curriculum/instrument-icons";
  import StudentAssignments from "./StudentAssignments.svelte";

  /**
   * The home page for someone signed in (index.astro shows the landing page to
   * everyone else): back into practice in one tap, the exercises they wrote
   * last, the tracks they follow, and the way to their account. Tracks used to
   * be a link in the navbar.
   */
  export let name = "";
  export let accountType: "standard" | "educator" | "student" = "standard";

  let recent: RecentExercise[] | null = null;
  let tracks: string[] | null = null;
  let showAll = false;
  let now = Date.now();

  const firstName = (name || "").trim().split(/\s+/)[0] ?? "";

  onMount(() => {
    loadUsage();
    fetch("/api/recent")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RecentExercise[]) => (recent = rows))
      .catch(() => (recent = []));
    if (accountType !== "student") {
      fetch("/api/tracks")
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { tracks?: string[] } | null) => (tracks = s?.tracks ?? []))
        .catch(() => (tracks = []));
    }
    const tickTimer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(tickTimer);
  });

  async function forget(id: string) {
    recent = (recent ?? []).filter((r) => r.id !== id);
    await fetch(`/api/recent?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  $: shown = showAll ? recent ?? [] : (recent ?? []).slice(0, 6);
  $: last = recent?.[0] ?? null;
  $: planLine = !$usage
    ? ""
    : $usage.limit === null
      ? "Unlimited exercises"
      : `${$usage.remaining ?? 0} of ${$usage.limit} exercises left this month`;

  /** A subscribed set or track as a card: where it opens, its name and colour, and a drawing for an instrument. */
  type Card = { id: string; name: string; level: string; href: string; color: string; icon: string | null };
  $: cards = (tracks ?? []).flatMap((id): Card[] => {
    const set = BUILTIN_SETS.find((s) => s.id === id);
    if (set) return [{ id, name: set.name, level: set.level, href: set.href, color: TRACK_COLOR_CLASS[set.color], icon: null }];
    const t = trackById[id];
    if (!t) return [];
    return [{ id, name: t.name, level: t.level, href: `/curriculum/${t.id}`, color: TRACK_COLOR_CLASS[t.color], icon: iconFor(t) }];
  });
  const iconPaths = (key: string) => INSTRUMENT_PATHS[INSTRUMENT_ICON[key]?.icon ?? ""] ?? [];
</script>

<div class="home w-full max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-3xl sm:text-4xl font-bold text-sr-ink">Welcome back{firstName ? `, ${firstName}` : ""}</h1>
      {#if planLine}<p class="mt-1 text-sm font-semibold text-sr-muted">{planLine}</p>{/if}
    </div>
    <a class="sr-btn-quiet text-sm" href="/account">Account and settings</a>
  </header>

  <!-- Back into practice: where they left off, or either page fresh. -->
  <section class="grid gap-3 sm:grid-cols-3" aria-label="Practice">
    {#if last}
      <a class="start-card bg-sr-action text-sr-action-ink sm:col-span-1" href={last.link}>
        <span class="text-xs font-bold uppercase tracking-wide opacity-80">Continue</span>
        <span class="text-lg font-extrabold leading-tight">{last.title}</span>
        <span class="text-sm opacity-90">{last.detail}</span>
      </a>
    {/if}
    <a class="start-card bg-sr-mint text-sr-mint-ink {last ? '' : 'sm:col-span-1'}" href="/sightreading">
      <span class="text-xs font-bold uppercase tracking-wide opacity-80">Unison</span>
      <span class="text-lg font-extrabold leading-tight">One line</span>
      <span class="text-sm">Sing or play a single line, or rhythm alone.</span>
    </a>
    <a class="start-card bg-sr-sky text-sr-sky-ink" href="/choral-sightreading">
      <span class="text-xs font-bold uppercase tracking-wide opacity-80">Choral</span>
      <span class="text-lg font-extrabold leading-tight">Parts</span>
      <span class="text-sm">Two, three and four parts, UIL levels 1 to 5.</span>
    </a>
  </section>

  {#if accountType === "student"}
    <StudentAssignments />
  {/if}

  <!-- The exercises they wrote last, each reopening exactly as it was. -->
  <section class="sr-panel p-5" aria-labelledby="recent-h">
    <div class="flex items-baseline justify-between gap-3 mb-3">
      <h2 id="recent-h" class="text-xl font-bold text-sr-ink">Recent exercises</h2>
      {#if (recent?.length ?? 0) > 6}
        <button class="sr-link text-sm" on:click={() => (showAll = !showAll)}>{showAll ? "Show fewer" : `Show all ${recent?.length}`}</button>
      {/if}
    </div>
    {#if recent === null}
      <p class="text-sm text-sr-muted">Loading…</p>
    {:else if recent.length === 0}
      <p class="text-sm text-sr-muted">
        Nothing yet. Press New exercise on <a class="sr-link" href="/sightreading">Unison</a> or
        <a class="sr-link" href="/choral-sightreading">Choral</a> and it shows up here, ready to open again.
      </p>
    {:else}
      <ul class="flex flex-col divide-y divide-sr-hairline-2">
        {#each shown as r (r.id)}
          <li class="flex items-center gap-3 py-2.5">
            <span class="page-tag {r.page === 'choral' ? 'bg-sr-sky text-sr-sky-ink' : 'bg-sr-mint text-sr-mint-ink'}">{r.page === "choral" ? "Choral" : "Unison"}</span>
            <a class="min-w-0 flex-1 group" href={r.link}>
              <span class="block font-bold text-sr-ink truncate group-hover:underline">{r.title}</span>
              <span class="block text-sm text-sr-muted truncate">{r.detail}</span>
            </a>
            <span class="text-xs text-sr-faint whitespace-nowrap">{whenLabel(r.createdAt, now)}</span>
            <button class="forget" on:click={() => forget(r.id)} aria-label="Remove {r.title} from recent exercises" title="Remove">×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- The sets and instrument tracks they follow (they used to be behind the navbar's Tracks). -->
  {#if accountType !== "student"}
    <section class="sr-panel p-5" aria-labelledby="tracks-h">
      <div class="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="tracks-h" class="text-xl font-bold text-sr-ink">My tracks</h2>
        <a class="sr-link text-sm" href="/curriculum">Choose tracks</a>
      </div>
      {#if tracks === null}
        <p class="text-sm text-sr-muted">Loading…</p>
      {:else if cards.length === 0}
        <p class="text-sm text-sr-muted">No tracks yet. <a class="sr-link" href="/curriculum">Choose one</a> and its steps appear in the preset menu.</p>
      {:else}
        <ul class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
          {#each cards as c (c.id)}
            <li>
              <a class="track-card {c.color}" href={c.href}>
                {#if c.icon && iconPaths(c.icon).length}
                  <svg width="40" height="40" viewBox="0 0 512 512" aria-hidden="true" class="shrink-0">
                    <g fill="currentColor" transform={INSTRUMENT_ICON[c.icon]?.upright ? "rotate(-38 256 256)" : undefined}>
                      {#each iconPaths(c.icon) as d}<path {d} />{/each}
                    </g>
                  </svg>
                {/if}
                <span class="min-w-0">
                  <span class="block font-extrabold leading-tight">{c.name}</span>
                  <span class="block text-sm opacity-80">{c.level}</span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if accountType === "educator"}
    <section class="sr-panel p-5 flex flex-wrap items-center justify-between gap-3" aria-label="Classes">
      <div>
        <h2 class="text-xl font-bold text-sr-ink">Classes</h2>
        <p class="text-sm text-sr-muted">Students, assignments and what each class has passed.</p>
      </div>
      <a class="sr-btn text-sm" href="/account">Open classes</a>
    </section>
  {/if}
</div>

<style>
  .start-card {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 1.1rem 1.25rem;
    border-radius: 24px;
    min-height: 7rem;
    box-shadow: var(--sr-card-shadow);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .start-card:hover { transform: translateY(-2px); }
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
  .track-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border-radius: 20px;
    height: 100%;
  }
  .track-card:hover { filter: brightness(0.97); }
  @media (prefers-reduced-motion: reduce) {
    .start-card { transition: none; }
    .start-card:hover { transform: none; }
  }
</style>
