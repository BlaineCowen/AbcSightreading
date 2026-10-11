<script lang="ts">
  import { onMount } from "svelte";
  import { X } from "lucide-svelte";
  import { GENERATION_LIMITS } from "../lib/plan";

  /**
   * Once, just after sign-up: what the account gives, and the one step to the
   * free month of Pro while it is on offer (confirm the email, or for a Google
   * account, which arrives confirmed, start it). An email sign-up leaves the
   * address in sessionStorage ("sr-welcome"); a new Google account arrives
   * with ?welcome=1 (AuthForm's newUserCallbackURL). This takes either, once.
   */
  let email: string | null = null;
  type Status = { ok: boolean; offer: boolean; step?: string };
  let fm: Status | null = null;

  onMount(async () => {
    try {
      email = sessionStorage.getItem("sr-welcome");
      if (email !== null) sessionStorage.removeItem("sr-welcome");
    } catch {}
    const url = new URL(location.href);
    if (url.searchParams.get("welcome") === "1") {
      email ??= "";
      url.searchParams.delete("welcome");
      history.replaceState(history.state, "", url);
    }
    if (email === null) return;
    const res = await fetch("/api/free-month").catch(() => null);
    fm = res?.ok ? await res.json() : null;
  });
</script>

{#if email !== null}
  <div class="fixed z-40 left-3 right-3 top-20 sm:left-auto sm:right-6 sm:w-[380px] rounded-[22px] bg-sr-mint text-sr-mint-ink shadow-xl p-5 flex gap-3 items-start" role="status">
    <div class="flex-1 text-sm flex flex-col gap-2">
      <p class="font-display text-lg font-bold leading-tight">Welcome to abcSightReading!</p>
      {#if fm?.offer && fm.ok}
        <p>Your free month of Pro is ready: unlimited exercises, Listen and grade, and the practice tools. No card needed.</p>
        <a class="sr-btn text-sm self-start" href="/account#plan">Start my free month</a>
      {:else if fm?.offer && fm.step === "confirm"}
        <p>
          One step to your free month of Pro: open the link we sent to
          {#if email}<strong class="break-all">{email}</strong>{:else}your inbox{/if}.
        </p>
        <p>Everything works in the meantime, with {GENERATION_LIMITS.free} exercises a month.</p>
      {:else}
        <p>Your account gives you {GENERATION_LIMITS.free} exercises a month, and your presets now follow you to any device.</p>
        {#if email}
          <p>We sent a link to <strong class="break-all">{email}</strong> to confirm your address. Everything works in the meantime.</p>
        {/if}
      {/if}
    </div>
    <button type="button" class="p-1 opacity-70 hover:opacity-100" on:click={() => (email = null)} aria-label="Close">
      <X size={14} />
    </button>
  </div>
{/if}
