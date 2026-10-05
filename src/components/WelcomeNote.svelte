<script lang="ts">
  import { onMount } from "svelte";
  import { X } from "lucide-svelte";
  import { GENERATION_LIMITS } from "../lib/plan";

  /**
   * Once, just after sign-up: what the account gives, and that a confirmation
   * email is on its way (optional to sign in). Sign-up used to go straight to
   * the practice page without a word; the only sign of the email was a line on
   * /account a new teacher would not find. The sign-up form leaves the address
   * in sessionStorage ("sr-welcome"), and this takes it, once.
   */
  let email: string | null = null;
  onMount(() => {
    try {
      email = sessionStorage.getItem("sr-welcome");
      if (email !== null) sessionStorage.removeItem("sr-welcome");
    } catch {}
  });
</script>

{#if email !== null}
  <div class="fixed z-40 left-3 right-3 top-20 sm:left-auto sm:right-6 sm:w-[380px] rounded-[20px] bg-sr-mint text-sr-mint-ink shadow-xl p-4 flex gap-3 items-start" role="status">
    <div class="flex-1 text-sm flex flex-col gap-1.5">
      <p class="font-extrabold">Welcome to abcSightReading.</p>
      <p>Your account gives you {GENERATION_LIMITS.free} exercises a month, and your presets now follow you to any device.</p>
      {#if email}
        <p>We sent a link to <strong class="break-all">{email}</strong> to confirm your address. Everything works in the meantime.</p>
      {/if}
    </div>
    <button type="button" class="p-1 opacity-70 hover:opacity-100" on:click={() => (email = null)} aria-label="Close">
      <X size={14} />
    </button>
  </div>
{/if}
