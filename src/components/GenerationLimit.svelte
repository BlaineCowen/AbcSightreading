<script lang="ts">
  import { X } from "lucide-svelte";
  import { usage, dismissLimit } from "../lib/usage";
  import { GENERATION_LIMITS } from "../lib/plan";

  /**
   * What the monthly allowance says, beside Generate: a quiet count when a few
   * are left, and when none are, what to do about it - make a free account
   * (signed out) or get Pro (signed in). Nothing at all on an unlimited plan.
   */

  $: here = typeof location !== "undefined" ? location.pathname + location.search : "/";
  $: signupHref = `/login?mode=signup&next=${encodeURIComponent(here)}`;
  const upgradeHref = "/account#plan";
</script>

{#if $usage?.blocked}
  <div class="w-full max-w-xl rounded-lg border border-sr-hairline bg-sr-panel p-4 flex gap-3 items-start" role="alert">
    <div class="flex-1 text-sm text-sr-ink-2 flex flex-col gap-2">
      {#if $usage.tier === "anonymous"}
        <p class="font-semibold text-sr-ink">That's this month's {GENERATION_LIMITS.anonymous} free exercises.</p>
        <p>A free account gives you {GENERATION_LIMITS.free} a month, and keeps your presets. Pro is unlimited.</p>
        <p><a class="underline font-medium text-sr-action-fg" href={signupHref}>Create a free account</a></p>
      {:else}
        <p class="font-semibold text-sr-ink">That's this month's {GENERATION_LIMITS.free} exercises.</p>
        <p>Pro is unlimited, with the tuner and practice tools, for $19.99 a year. Or wait for the 1st - the count starts again each month.</p>
        <p><a class="underline font-medium text-sr-action-fg" href={upgradeHref}>Get Pro</a></p>
      {/if}
    </div>
    <button type="button" class="p-1 text-sr-faint hover:text-sr-ink-2" on:click={dismissLimit} aria-label="Close">
      <X size={14} />
    </button>
  </div>
{:else if $usage && $usage.remaining !== null && $usage.remaining <= 3}
  <p class="text-xs text-sr-muted" role="status">
    {$usage.remaining === 0 ? "That was the last one this month." : `${$usage.remaining} ${$usage.remaining === 1 ? "exercise" : "exercises"} left this month.`}
    {#if $usage.tier === "anonymous"}
      <a class="underline text-sr-action-fg" href={signupHref}>A free account</a> gives {GENERATION_LIMITS.free}.
    {:else}
      <a class="underline text-sr-action-fg" href={upgradeHref}>Pro</a> is unlimited.
    {/if}
  </p>
{/if}
