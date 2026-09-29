<script lang="ts">
  import { onMount } from "svelte";

  /**
   * "JODI10 applied": shown where Pro is bought when the visitor came by an
   * advertiser's link (src/lib/referral.ts), so they know the discount is
   * already in checkout and there is nothing to type.
   */
  let ref: { code: string; percentOff: number } | null = null;
  onMount(async () => {
    try {
      const r = await fetch("/api/codes/ref");
      if (r.ok) ref = await r.json();
    } catch {}
  });
</script>

{#if ref}
  <p class="inline-flex flex-wrap items-center gap-x-1.5 rounded-full bg-sr-mint text-sr-mint-ink px-4 py-2 text-sm font-semibold">
    <strong class="font-extrabold">{ref.code}</strong> applied: {ref.percentOff}% off your first year of Pro, taken off at checkout.
  </p>
{/if}
