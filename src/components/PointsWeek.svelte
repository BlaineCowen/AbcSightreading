<script lang="ts">
  import { onMount } from "svelte";
  import Flame from "lucide-svelte/icons/flame";
  import Users from "lucide-svelte/icons/users";
  import TrendingDown from "lucide-svelte/icons/trending-down";
  import { modal } from "../lib/modal";
  import {
    ASSIGNMENT_POINTS, DAILY_SLOWDOWN, EARLY_POINTS, EXERCISE_POINTS, GRADE_BONUS_100, GRADE_BONUS_80, GRADED_POINTS, NEW_BEST_POINTS, TIME_POINTS_PER_DAY,
  } from "../lib/points";
  import BadgeMedal from "./BadgeMedal.svelte";

  /**
   * A student's week (points.ts): points, school-day streak, place, the
   * class leaderboard (top 10 and their own place; nobody at 0 is listed)
   * and the class goal, with "How points work". On their home page and
   * account page. Shows nothing for anyone points are not on for.
   */
  type Week = {
    on: true; className: string; points: number; place: number | null; behind: number | null; streak: number; streakDays: number[];
    leaderboard: { place: number; name: string; points: number; me: boolean }[] | null;
    goal: { total: number; goal: number };
    newBadges: { badgeId: string; level: number; name: string; says: string; icon: string; colour: string }[];
  };
  let week: Week | null = null;
  let rulesOpen = false;

  const localDay = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  onMount(async () => {
    try {
      const res = await fetch(`/api/points/me?day=${localDay()}`);
      const data = await res.json();
      if (res.ok && data.on) week = data;
    } catch {}
  });

  const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
  const todayIndex = (new Date().getDay() + 6) % 7;
  const medal = (p: number) => (p === 1 ? "m1" : p === 2 ? "m2" : p === 3 ? "m3" : "");
  $: pct = week ? Math.min(100, Math.round((week.goal.total / Math.max(1, week.goal.goal)) * 100)) : 0;
</script>

{#if week}
  <section class="card" aria-labelledby="week-h">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="week-h" class="font-display text-2xl font-bold text-sr-ink">This week</h2>
      <span class="text-sm text-sr-muted">{week.className} · resets Monday</span>
    </div>

    {#each week.newBadges as b (b.badgeId + b.level)}
      <a class="newbadge" href="/badges">
        <BadgeMedal icon={b.icon} colour={b.colour} level={b.name.includes("level") ? b.level : null} size={48} />
        <span><span class="block text-xs font-extrabold text-sr-muted">NEW BADGE</span><span class="block font-display text-lg leading-tight text-sr-ink">{b.name}</span><span class="block text-xs text-sr-muted">{b.says}</span></span>
      </a>
    {/each}

    <div class="stats">
      <div class="stat bg-sr-butter text-sr-butter-ink"><span class="lbl">POINTS</span><b>{week.points}</b></div>
      <div class="stat bg-sr-peach text-sr-peach-ink"><span class="lbl">STREAK</span><b class="flex items-center gap-1"><Flame size={22} />{week.streak}</b></div>
      <div class="stat bg-sr-sky text-sr-sky-ink"><span class="lbl">PLACE</span><b>{week.place ? ordinal(week.place) : "–"}</b></div>
    </div>

    <div class="days-box bg-sr-peach text-sr-peach-ink">
      <div class="flex flex-wrap justify-between gap-2"><span class="text-sm font-extrabold">School days this week</span><span class="text-xs">Weekends never break it</span></div>
      <div class="days">
        {#each ["M", "T", "W", "T", "F"] as d, i}
          <span class="day" class:on={week.streakDays.includes(i)} class:today={i === todayIndex && !week.streakDays.includes(i)}>{d}</span>
        {/each}
      </div>
    </div>

    {#if week.leaderboard}
      <div class="flex items-baseline justify-between gap-2 mt-4 mb-1">
        <h3 class="font-display text-lg font-bold text-sr-ink">Leaderboard</h3>
        {#if week.behind !== null && week.place}<span class="text-xs text-sr-muted">{week.behind} points behind {ordinal(week.place - 1)}</span>{/if}
      </div>
      {#if week.leaderboard.length}
        <ol class="lb">
          {#each week.leaderboard as r (r.place)}
            <li class:me={r.me}>
              {#if medal(r.place)}<span class="medal {medal(r.place)}">{r.place}</span>{:else}<span class="rk">{r.place}</span>{/if}
              <span class="nm">{r.name}</span><span class="pt">{r.points}</span>
            </li>
          {/each}
          {#if week.place && week.place > 10}
            <li class="gap">⋯</li>
            <li class="me"><span class="rk">{week.place}</span><span class="nm">You</span><span class="pt">{week.points}</span></li>
          {/if}
        </ol>
      {:else}
        <p class="text-sm text-sr-muted">Nobody has points yet this week. Read an exercise to be first.</p>
      {/if}
    {/if}

    <div class="mt-4">
      <div class="flex justify-between text-sm mb-1.5"><span class="font-extrabold text-sr-ink flex items-center gap-1"><Users size={15} /> Class goal</span><span class="text-sr-muted tabular-nums">{week.goal.total.toLocaleString()} of {week.goal.goal.toLocaleString()}</span></div>
      <div class="goal"><i style="width:{pct}%"></i></div>
      <p class="text-xs text-sr-muted mt-1.5">{pct >= 100 ? "Reached! Everyone gets the Ensemble badge when the week ends." : "Reach it together and everyone gets the Ensemble badge."}</p>
    </div>

    <div class="flex gap-4 mt-4 text-sm">
      <a class="underline text-sr-action-fg font-semibold" href="/badges">My badges</a>
      <button class="underline text-sr-action-fg font-semibold" on:click={() => (rulesOpen = true)}>How points work</button>
    </div>
  </section>

  {#if rulesOpen}
    <dialog class="sr-modal rules-veil" use:modal={{ onClose: () => (rulesOpen = false) }} aria-labelledby="rules-h">
      <div class="card rules">
        <h2 id="rules-h" class="font-display text-xl font-bold text-sr-ink">How points work</h2>
        <p class="text-sm text-sr-muted">Points come from reading new music at your level. Doing the same easy thing again and again earns less and less.</p>
        <table>
          <tbody>
            <tr><td>Exercise at your level or harder</td><td>{EXERCISE_POINTS.level}</td></tr>
            <tr><td>Exercise a few steps easier (review)</td><td>{EXERCISE_POINTS.review}</td></tr>
            <tr><td>Exercise much easier than your level</td><td>{EXERCISE_POINTS.easy}</td></tr>
            <tr><td>Exercise with your own settings</td><td>{EXERCISE_POINTS.own}</td></tr>
            <tr><td>Graded try (sing or clap)<div class="sub">+{GRADE_BONUS_80} more for 80% or better, +{GRADE_BONUS_100} for 100%, at your level</div></td><td>{GRADED_POINTS}</td></tr>
            <tr><td>New best score on a step</td><td>{NEW_BEST_POINTS}</td></tr>
            <tr><td>Assignment finished<div class="sub">+{EARLY_POINTS} more if it's 2 days early</div></td><td>{ASSIGNMENT_POINTS}</td></tr>
            <tr><td>Practice time<div class="sub">up to {TIME_POINTS_PER_DAY} a day</div></td><td>1 a minute</td></tr>
          </tbody>
        </table>
        <div class="repeat bg-sr-brass-bg text-sr-brass text-sm">
          <div class="font-extrabold flex items-center gap-1"><TrendingDown size={16} /> Less for repeats</div>
          The same step or level earns full points 3 times a day, then half, then a quarter, then nothing after 10. After {DAILY_SLOWDOWN} points in a day, everything counts half. An exercise counts after 20 seconds of practice on it, and grade bonuses only count once per exercise.
        </div>
        <button class="sr-btn self-end" on:click={() => (rulesOpen = false)}>Got it</button>
      </div>
    </dialog>
  {/if}
{/if}

<style>
  .card { width: 100%; max-width: 32rem; background: var(--sr-raise); border: 1px solid var(--sr-hairline); border-radius: 28px; padding: 20px; box-shadow: var(--sr-card-shadow); display: flex; flex-direction: column; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
  .stat { border-radius: 18px; padding: 10px 12px; }
  .stat .lbl { font-size: 11px; font-weight: 800; }
  .stat b { display: block; font-family: var(--sr-font-display); font-size: 26px; line-height: 1.15; }
  .days-box { border-radius: 18px; padding: 10px 14px; }
  .days { display: flex; gap: 6px; margin-top: 6px; }
  .day { width: 26px; height: 26px; border-radius: 999px; display: grid; place-items: center; font-size: 11px; font-weight: 800; background: color-mix(in srgb, var(--sr-raise) 55%, transparent); }
  .day.on { background: var(--sr-peach-ink); color: var(--sr-peach); }
  .day.today { outline: 2px dashed var(--sr-peach-ink); background: transparent; }
  .lb { list-style: none; margin: 0; padding: 0; }
  .lb li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 14px; font-weight: 700; color: var(--sr-ink); }
  .lb .me { background: var(--sr-tint); }
  .lb .gap { justify-content: center; color: var(--sr-faint); padding: 0; }
  .rk { width: 26px; text-align: center; font-family: var(--sr-font-display); color: var(--sr-muted); }
  .medal { width: 26px; height: 26px; border-radius: 999px; display: grid; place-items: center; font-family: var(--sr-font-display); font-size: 13px; }
  .m1 { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .m2 { background: var(--sr-track); color: var(--sr-ink-2); }
  .m3 { background: var(--sr-peach); color: var(--sr-peach-ink); }
  .nm { flex: 1; }
  .pt { font-variant-numeric: tabular-nums; color: var(--sr-ink-2); }
  .goal { height: 14px; background: var(--sr-track); border-radius: 999px; overflow: hidden; }
  .goal i { display: block; height: 100%; background: linear-gradient(90deg, var(--sr-mint), color-mix(in srgb, var(--sr-mint-ink) 45%, var(--sr-mint))); border-radius: 999px; }
  .newbadge { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 10px; border-radius: 18px; background: var(--sr-track); text-decoration: none; }
  .rules-veil { display: flex; align-items: center; justify-content: center; padding: 1rem; background: color-mix(in srgb, var(--sr-ink) 28%, transparent); }
  .rules { gap: 10px; max-height: calc(100dvh - 2rem); overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; color: var(--sr-ink); }
  td { padding: 8px 4px; border-top: 1px solid var(--sr-hairline); vertical-align: top; }
  td:last-child { text-align: right; font-weight: 800; white-space: nowrap; }
  .sub { font-size: 12px; color: var(--sr-muted); }
  .repeat { border-radius: 16px; padding: 12px 14px; }
</style>
