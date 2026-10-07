<script lang="ts">
  import { onMount } from "svelte";

  /**
   * The free month of Pro, promoted (src/lib/free-month.ts): a strip at the
   * top of the home page, a one-time note on the practice pages, and a line
   * on the sign-up form. Each asks /api/free-month, so it says nothing when
   * the offer is off, and never to someone who cannot claim it. "For a
   * limited time", or "until <date>" once FREE_MONTH_UNTIL is set.
   */
  export let variant: "strip" | "note" | "signup" = "strip";

  type Status = { ok: boolean; reason?: string; quiet?: boolean; signedIn: boolean; offer: boolean; until: number | null };
  let s: Status | null = null;
  let dismissed = false;
  const NOTE_KEY = "sr-free-month-note";

  onMount(async () => {
    try {
      dismissed = variant === "note" && localStorage.getItem(NOTE_KEY) === "1";
    } catch {}
    const res = await fetch("/api/free-month").catch(() => null);
    s = res?.ok ? await res.json() : null;
  });

  function dismiss() {
    dismissed = true;
    try {
      localStorage.setItem(NOTE_KEY, "1");
    } catch {}
  }

  $: when = s?.until
    ? `until ${new Date(s.until).toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" })}`
    : "for a limited time";
  const signup = `/login?mode=signup&next=${encodeURIComponent("/account#plan")}`;
</script>

{#if s?.offer}
  {#if variant === "strip" && (!s.signedIn || s.ok)}
    <div class="w-full rounded-[22px] bg-sr-mint text-sr-mint-ink px-5 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
      <p class="text-sm sm:text-base">
        <span class="rounded-full bg-sr-action text-sr-action-ink px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide mr-1">Limited time</span>
        <strong>Try Pro free for a month.</strong> No card needed.
      </p>
      <a class="sr-btn text-sm" href={s.signedIn ? "/account#plan" : signup}>{s.signedIn ? "Start my free month" : "Create a free account"}</a>
    </div>
  {:else if variant === "note" && s.signedIn && s.ok && !dismissed}
    <div class="w-full rounded-[18px] bg-sr-mint text-sr-mint-ink px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-2 no-print">
      <span class="flex-1 min-w-[14rem]"><strong>Pro is free for a month, {when}:</strong> unlimited exercises and the practice tools. No card, nothing to cancel.</span>
      <a class="sr-btn text-sm" href="/account#plan">Start my free month</a>
      <button class="text-sm font-bold underline opacity-80" on:click={dismiss}>Not now</button>
    </div>
  {:else if variant === "signup"}
    <p class="text-sm rounded-[14px] bg-sr-mint text-sr-mint-ink px-3 py-2">
      <strong>Limited time:</strong> confirm your email and a free month of Pro is waiting for you. No card needed.
    </p>
  {/if}
{/if}
