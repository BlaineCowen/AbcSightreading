<script lang="ts">
  import { onMount } from "svelte";
  import { billingStatus, setAutoRenew, type BillingStatus } from "../lib/billing-client";

  /**
   * A paid plan that will not renew, in its last 30 days (src/lib/plan-ending.ts):
   * when it ends, and the one step that renews it. On the account page and
   * both practice pages; shows nothing otherwise (signed out, free, or a plan
   * that renews).
   */
  let ending: NonNullable<BillingStatus["ending"]> | null = null;
  let busy = false;
  let done = "";
  let problem = "";

  onMount(async () => {
    ending = (await billingStatus().catch(() => null))?.ending ?? null;
  });

  const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  $: left = ending ? Math.max(1, Math.ceil((ending.endsAt - Date.now()) / 86_400_000)) : 0;
  $: name = ending?.plan === "educator" ? "Educator" : "Pro";

  async function renewCard() {
    busy = true;
    problem = "";
    try {
      await setAutoRenew(true);
      done = `Renewal is on: your ${name} plan carries on after ${day(ending!.endsAt)}.`;
      ending = null;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if ending}
  <div class="w-full rounded-[18px] bg-sr-butter text-sr-butter-ink px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-2 no-print" role="status">
    <span class="flex-1 min-w-[14rem]">
      {#if ending.kind === "trial"}
        <strong>Your free month of Pro ends {day(ending.endsAt)}</strong>, in {left} day{left === 1 ? "" : "s"}. Keep Pro for $19.99 a year, or do nothing and go back to the free plan.
      {:else}
        <strong>Your {name} plan ends {day(ending.endsAt)}</strong>, in {left} day{left === 1 ? "" : "s"}. It does not renew by itself.
      {/if}
    </span>
    {#if ending.kind === "card"}
      <button class="sr-btn text-sm" on:click={renewCard} disabled={busy}>{busy ? "Turning on…" : "Turn renewal on"}</button>
    {:else if ending.kind === "quote" && ending.quoteId}
      <a class="sr-btn text-sm" href="/account?renew={ending.quoteId}#quote">Renewal quote</a>
    {:else}
      <a class="sr-btn text-sm" href="/account#plan">Keep {name}</a>
    {/if}
    {#if problem}<span class="w-full text-sr-danger">{problem}</span>{/if}
  </div>
{:else if done}
  <p class="w-full rounded-[18px] bg-sr-mint text-sr-mint-ink px-4 py-3 text-sm font-semibold no-print" role="status">{done}</p>
{/if}
