<script lang="ts">
  import { onMount } from "svelte";

  /**
   * "You've been upgraded": shown once to an account given a month of Pro by
   * hand (src/lib/server/gift.ts, scripts/gift-pro.ts), until dismissed. On
   * /account and both practice pages, beside PlanEndingBanner; nothing
   * otherwise.
   */
  let gift: { grantId: string; until: number; plan: string } | null = null;

  onMount(async () => {
    gift = (await fetch("/api/gift").then((r) => (r.ok ? r.json() : null)).catch(() => null))?.gift ?? null;
  });

  const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  async function dismiss() {
    const id = gift?.grantId;
    gift = null;
    if (id) await fetch("/api/gift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId: id }) }).catch(() => {});
  }
</script>

{#if gift}
  <div class="w-full rounded-[18px] bg-sr-mint text-sr-mint-ink px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-2 no-print" role="status">
    <span class="flex-1 min-w-[14rem]">
      <strong>You've been upgraded to Pro, free until {day(gift.until)}.</strong>
      Thanks for being one of our first users. Unlimited exercises, Listen and grade, play-along videos and the practice tools are all yours; nothing to do, and no card needed.
    </span>
    <button class="sr-btn text-sm" on:click={dismiss}>Got it</button>
  </div>
{/if}
