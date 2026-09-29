<script lang="ts">
  import { onMount } from "svelte";
  import { X } from "lucide-svelte";
  import { usage, dismissLimit, loadUsage } from "../lib/usage";
  import { GENERATION_LIMITS } from "../lib/plan";

  /**
   * What the monthly allowance says, at the top of the practice page: how many
   * exercises are left this month and the way to more - a free account
   * (signed out) or Pro (signed in) - in amber once three or fewer are left;
   * and when none are, what to do about it. Nothing at all on an unlimited
   * plan. The playback bar's Generate button carries the number too.
   */
  onMount(loadUsage);

  $: here = typeof location !== "undefined" ? location.pathname + location.search : "/";
  $: signupHref = `/login?mode=signup&next=${encodeURIComponent(here)}`;
  const upgradeHref = "/account#plan";
</script>

{#if $usage?.blocked}
  <div class="w-full max-w-xl rounded-[24px] bg-sr-peach text-sr-peach-ink p-5 flex gap-3 items-start" role="alert">
    <div class="flex-1 text-sm flex flex-col gap-2">
      {#if $usage.tier === "anonymous"}
        <p class="font-extrabold">That's this month's {GENERATION_LIMITS.anonymous} free exercises.</p>
        <p>A free account gives you {GENERATION_LIMITS.free} a month, and keeps your presets. Pro is unlimited.</p>
        <p><a class="underline font-extrabold" href={signupHref}>Create a free account</a></p>
      {:else}
        <p class="font-extrabold">That's this month's {GENERATION_LIMITS.free} exercises.</p>
        <p>Pro is unlimited, with the tuner and practice tools, for $19.99 a year. Or wait for the 1st, when the count starts again.</p>
        <p><a class="underline font-extrabold" href={upgradeHref}>Get Pro</a></p>
      {/if}
    </div>
    <button type="button" class="p-1 opacity-70 hover:opacity-100" on:click={dismissLimit} aria-label="Close">
      <X size={14} />
    </button>
  </div>
{:else if $usage && $usage.limit !== null && $usage.remaining !== null}
  {@const low = $usage.remaining <= 3}
  <p
    class="w-full max-w-xl text-sm font-semibold rounded-full px-4 py-2 no-print {low ? 'bg-sr-peach text-sr-peach-ink' : 'bg-sr-butter text-sr-butter-ink'}"
    role="status"
  >
    <strong class="tabular-nums font-extrabold">{$usage.remaining}</strong> of {$usage.limit}
    {$usage.tier === "anonymous" ? "free exercises" : "exercises"} left this month.
    {#if $usage.tier === "anonymous"}
      Increase to {GENERATION_LIMITS.free} by <a class="underline font-extrabold" href={signupHref}>creating an account</a>.
    {:else}
      <a class="underline font-extrabold" href={upgradeHref}>Upgrade to Pro</a> for unlimited exercises.
    {/if}
  </p>
{/if}
