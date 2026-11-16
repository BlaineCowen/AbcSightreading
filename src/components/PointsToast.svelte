<script lang="ts">
  import { onDestroy } from "svelte";
  import { fly } from "svelte/transition";
  import TrendingDown from "lucide-svelte/icons/trending-down";
  import X from "lucide-svelte/icons/x";
  import { pointsNews, type PointsNews } from "../lib/practice-tracker";
  import BadgeMedal from "./BadgeMedal.svelte";

  /**
   * What an exercise or a graded try just earned (points.ts), from the
   * practice report's answer: the lines, any note that repeats count less,
   * and a new badge. Bottom corner, gone after a few seconds (longer with a
   * badge or a note), never over the music's controls.
   */
  let shown: PointsNews | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = pointsNews.subscribe((n) => {
    if (!n) return;
    shown = n;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (shown = null), n.badges.length || n.earned.some((e) => e.note) ? 9000 : 5000);
  });
  onDestroy(() => {
    unsub();
    if (timer) clearTimeout(timer);
  });
  $: notes = shown?.earned.filter((e) => e.note) ?? [];
  $: lines = shown?.earned.filter((e) => e.points > 0) ?? [];
  $: graded = lines.some((l) => l.label.startsWith("Graded"));
</script>

{#if shown}
  <div class="toast print:hidden" role="status" aria-live="polite" transition:fly={{ y: 24, duration: 200 }}>
    <div class="flex items-center justify-between gap-3">
      <span class="font-display text-lg">{graded ? "Nice reading!" : shown.total > 0 ? "Points" : "Done"}</span>
      <span class="flex items-center gap-2">
        <span class="big" class:dim={shown.total <= 2}>+{shown.total}</span>
        <button class="x" aria-label="Close" on:click={() => (shown = null)}><X size={16} /></button>
      </span>
    </div>
    {#each lines as l}
      <div class="line"><span>{l.label}</span><b>+{l.points}</b></div>
    {/each}
    {#each notes as n}
      <div class="warn"><TrendingDown size={16} class="shrink-0 mt-0.5" /><span>{n.note}</span></div>
    {/each}
    <div class="foot">{shown.week} this week{shown.streak ? ` · ${shown.streak} day streak` : ""} · <a href="/badges">Badges</a></div>
    {#each shown.badges as b (b.badgeId + b.level)}
      <div class="newbadge">
        <BadgeMedal icon={b.icon} colour={b.colour} level={b.level > 1 || b.name.includes("level") ? b.level : null} size={56} />
        <div>
          <div class="text-xs font-extrabold text-sr-muted">NEW BADGE</div>
          <div class="font-display text-lg leading-tight">{b.name}</div>
          <div class="text-xs text-sr-muted">{b.says}</div>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    right: 1rem;
    bottom: 5.5rem;
    z-index: 60;
    width: min(24rem, calc(100vw - 2rem));
    background: var(--sr-bar);
    color: var(--sr-bar-ink);
    border-radius: 22px;
    padding: 14px 16px;
    box-shadow: 0 18px 40px -18px rgb(var(--sr-bar-rgb) / 0.6);
  }
  .big { font-family: var(--sr-font-display); font-size: 28px; line-height: 1; color: var(--sr-bar-accent); }
  .big.dim { color: var(--sr-bar-muted); }
  .x { color: var(--sr-bar-muted); display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; }
  .x:hover { background: var(--sr-bar-btn); }
  .line { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--sr-bar-muted); padding: 2px 0; }
  .line b { color: var(--sr-bar-ink); }
  .warn { margin-top: 8px; background: var(--sr-bar-btn); border-radius: 12px; padding: 8px 10px; font-size: 13px; color: var(--sr-bar-accent); display: flex; gap: 8px; }
  .foot { margin-top: 8px; font-size: 12px; color: var(--sr-bar-muted); }
  .foot a { color: var(--sr-bar-on); text-decoration: underline; }
  .newbadge { margin-top: 10px; display: flex; gap: 12px; align-items: center; background: var(--sr-raise); color: var(--sr-ink); border-radius: 18px; padding: 10px; }
</style>
