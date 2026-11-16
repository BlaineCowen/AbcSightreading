<script lang="ts">
  import TrendingUp from "lucide-svelte/icons/trending-up";
  import Star from "lucide-svelte/icons/star";
  import Smile from "lucide-svelte/icons/smile";
  import HandHeart from "lucide-svelte/icons/hand-heart";
  import Pencil from "lucide-svelte/icons/pencil";
  import Presentation from "lucide-svelte/icons/presentation";
  import { TEACHER_BADGES } from "../lib/badges";

  /**
   * A class's points and badges, for its teacher (points.ts): the weekly
   * leaderboard on or off (on by default), the weekly class goal (the
   * recommended one unless the teacher sets their own), a break that does not
   * count against streaks, this week's points by student, last week's winners
   * on the board, and a badge given by hand. Owner only while tried out
   * (ownerSees("points"), EducatorStudents).
   */
  export let classId: string;

  type Data = {
    name: string; leaderboardOn: boolean; weeklyGoal: number | null; recommended: number; breakUntil: string | null;
    total: number; students: { id: string; name: string; points: number }[];
  };
  let data: Data | null = null;
  let open = false;
  let problem = "";
  let note = "";
  let goalText = "";
  let badgeId = TEACHER_BADGES[0].id;
  let ownTitle = "";
  let studentId = "";
  let busy = false;

  const localDay = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  async function load() {
    problem = "";
    const res = await fetch(`/api/classes/${classId}/points?day=${localDay()}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return void (problem = body.error ?? "Could not load the points.");
    data = body;
    goalText = String(body.weeklyGoal ?? body.recommended);
  }
  function toggle() {
    open = !open;
    if (open && !data) void load();
  }
  async function save(patch: Record<string, unknown>, done: string) {
    note = "";
    const res = await fetch(`/api/classes/${classId}/points`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) return void (problem = "Could not save that. Try again.");
    note = done;
    await load();
  }
  function saveGoal() {
    const n = Number(goalText.replace(/[^\d]/g, ""));
    if (!data || !n || n < 50) return void (problem = "A goal is at least 50 points.");
    void save({ weeklyGoal: n === data.recommended && data.weeklyGoal === null ? null : n }, "Goal saved.");
  }
  async function give() {
    if (!studentId) return;
    busy = true;
    problem = note = "";
    const res = await fetch(`/api/classes/${classId}/points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, badgeId, title: ownTitle }),
    });
    const body = await res.json().catch(() => ({}));
    busy = false;
    if (!res.ok) return void (problem = body.error ?? "Could not give it.");
    const who = data?.students.find((s) => s.id === studentId)?.name ?? "them";
    note = `Given to ${who}. They'll see it on their badges.`;
    studentId = "";
    ownTitle = "";
  }
  const ICONS: Record<string, typeof Star> = { "t-most-improved": TrendingUp, "t-section-leader": Star, "t-great-attitude": Smile, "t-helper": HandHeart, "t-own": Pencil };
  $: ranked = data ? data.students.filter((s) => s.points > 0) : [];
</script>

<div class="flex flex-col gap-2">
  <button class="text-xs text-sr-action-fg font-semibold underline self-start" aria-expanded={open} on:click={toggle}>{open ? "Hide points and badges" : "Points and badges"}</button>
  {#if open}
    <div class="panel">
      {#if !data && !problem}<p class="text-sm text-sr-muted">Loading…</p>{/if}
      {#if data}
        <div class="row">
          <div><div class="font-extrabold text-sr-ink">Weekly leaderboard</div><div class="text-xs text-sr-muted">Students see their class's top 10 and their own place. Nobody with 0 points is listed.</div></div>
          <button class="switch" class:on={data.leaderboardOn} role="switch" aria-checked={data.leaderboardOn} aria-label="Weekly leaderboard"
            on:click={() => data && save({ leaderboardOn: !data.leaderboardOn }, data.leaderboardOn ? "Leaderboard off." : "Leaderboard on.")}></button>
        </div>
        <div class="row">
          <div>
            <div class="font-extrabold text-sr-ink">Class goal each week</div>
            <div class="text-xs text-sr-muted">Everyone gets Ensemble when the class reaches it. Recommended for {data.students.length} students: {data.recommended.toLocaleString()}.{#if data.weeklyGoal !== null} <button class="underline" on:click={() => save({ weeklyGoal: null }, "Back to the recommended goal.")}>Use it</button>{/if}</div>
          </div>
          <span class="flex items-center gap-2">
            <input class="field w-24 text-right" inputmode="numeric" bind:value={goalText} aria-label="Weekly class goal" on:keydown={(e) => e.key === "Enter" && saveGoal()} />
            <button class="sr-btn-quiet text-sm px-3 py-1.5" on:click={saveGoal}>Save</button>
          </span>
        </div>
        <div class="row">
          <div><div class="font-extrabold text-sr-ink">On a break until</div><div class="text-xs text-sr-muted">School days of a break never end a streak.</div></div>
          <span class="flex items-center gap-2">
            <input class="field" type="date" value={data.breakUntil ?? ""} aria-label="On a break until" on:change={(e) => save({ breakUntil: e.currentTarget.value || null }, e.currentTarget.value ? "Break saved." : "Break cleared.")} />
          </span>
        </div>
        <div class="row">
          <div class="font-extrabold text-sr-ink">Last week's winners</div>
          <a class="sr-btn-quiet text-sm px-3 py-1.5 no-underline inline-flex items-center gap-1.5" href="/winners/{classId}"><Presentation size={15} /> On the board</a>
        </div>

        <div class="border-t border-sr-hairline pt-3">
          <div class="flex justify-between text-sm mb-1"><span class="font-extrabold text-sr-ink">This week</span><span class="text-sr-muted tabular-nums">{data.total.toLocaleString()} of {(data.weeklyGoal ?? data.recommended).toLocaleString()}</span></div>
          {#if ranked.length}
            <ol class="text-sm">
              {#each ranked.slice(0, 10) as s, i (s.id)}
                <li class="flex justify-between py-0.5"><span class="text-sr-ink">{i + 1}. {s.name}</span><span class="tabular-nums text-sr-ink-2">{s.points}</span></li>
              {/each}
            </ol>
            {#if ranked.length > 10}<p class="text-xs text-sr-muted">and {ranked.length - 10} more with points</p>{/if}
          {:else}
            <p class="text-xs text-sr-muted">No points yet this week.</p>
          {/if}
        </div>

        <div class="border-t border-sr-hairline pt-3 flex flex-col gap-2">
          <div class="font-extrabold text-sr-ink">Give a badge</div>
          <div class="flex flex-wrap gap-2">
            {#each TEACHER_BADGES as b (b.id)}
              <button class="sr-tok text-sm inline-flex items-center gap-1.5 {badgeId === b.id ? 'sr-on' : ''}" aria-pressed={badgeId === b.id} on:click={() => (badgeId = b.id)}>
                <svelte:component this={ICONS[b.id]} size={14} /> {b.name || "Your own"}
              </button>
            {/each}
          </div>
          {#if badgeId === "t-own"}<input class="field" placeholder="Name it, like Best Blend" maxlength="40" bind:value={ownTitle} aria-label="Badge name" />{/if}
          <div class="flex gap-2">
            <select class="field flex-1" bind:value={studentId} aria-label="Student">
              <option value="">Choose a student</option>
              {#each [...data.students].sort((a, b) => a.name.localeCompare(b.name)) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            </select>
            <button class="sr-btn text-sm px-4" disabled={busy || !studentId || (badgeId === "t-own" && !ownTitle.trim())} on:click={give}>Give it</button>
          </div>
        </div>
      {/if}
      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      {#if note}<p class="text-sm text-sr-ink-2" role="status">{note}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--sr-hairline); border-radius: 18px; padding: 14px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .row > div:first-child { flex: 1 1 14rem; }
  .field { border: 1px solid var(--sr-hairline); border-radius: 12px; padding: 6px 10px; background: var(--sr-track); color: var(--sr-ink); font-weight: 700; font-size: 14px; }
  .switch { width: 46px; height: 26px; border-radius: 999px; background: var(--sr-hairline); position: relative; flex: none; transition: background 0.15s; }
  .switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px; background: var(--sr-raise); transition: left 0.15s; }
  .switch.on { background: var(--sr-action); }
  .switch.on::after { left: 23px; }
</style>
