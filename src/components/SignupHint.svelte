<script lang="ts">
  import { onMount } from "svelte";
  import { X } from "lucide-svelte";
  import { signedInUser } from "../lib/auth-client";

  /**
   * A one-line nudge to make an account, shown only to someone signed out, at
   * the moment an account would help them - never as a banner. Each hint can
   * be dismissed, and stays dismissed in this browser, so it says its piece
   * once rather than nagging.
   */

  /** Names the hint for dismissal; keep it stable. */
  export let id: string;
  /** Leave out the close button, for hints that sit inside a panel. */
  export let dismissible = true;
  export let linkText = "Create a free account";

  let show = false;
  const key = `abcsr_hint_dismissed:${id}`;

  onMount(async () => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) === "1";
    } catch {}
    if (dismissed && dismissible) return;
    show = !(await signedInUser());
  });

  function dismiss() {
    show = false;
    try {
      localStorage.setItem(key, "1");
    } catch {}
  }

  // Back to exactly this page - a ladder step's ?step= included - after.
  $: href = `/login?mode=signup&next=${encodeURIComponent(
    typeof location !== "undefined" ? location.pathname + location.search : "/"
  )}`;
</script>

{#if show}
  <span class="signup-hint inline-flex items-center gap-1 text-xs text-sr-muted" role="note">
    <span><slot /> <a class="underline text-sr-action-fg font-medium" {href}>{linkText}</a></span>
    {#if dismissible}
      <button type="button" class="p-0.5 text-sr-faint hover:text-sr-ink-2" on:click={dismiss} aria-label="Hide this hint">
        <X size={12} />
      </button>
    {/if}
  </span>
{/if}
