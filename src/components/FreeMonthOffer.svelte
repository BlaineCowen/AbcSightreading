<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";

  /**
   * The free month of Pro (src/lib/free-month.ts): no card, it simply ends.
   * Shown on the account page's free plan when this account may claim it, or
   * when one step stands in the way (confirm the email). Claiming marks this
   * browser, so a second account here is refused.
   */
  const dispatch = createEventDispatcher<{ claimed: { expiresAt: number } }>();
  let status: { ok: true } | { ok: false; reason: string; quiet?: boolean } | null = null;
  let busy = false;
  let problem = "";

  const BROWSER_KEY = "abc-fm-id";
  function browserId() {
    try {
      let id = localStorage.getItem(BROWSER_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(BROWSER_KEY, id);
      }
      return id;
    } catch {
      return undefined;
    }
  }

  onMount(async () => {
    const res = await fetch("/api/free-month").catch(() => null);
    status = res?.ok ? await res.json() : null;
  });

  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "long", day: "numeric" });

  async function claim() {
    busy = true;
    problem = "";
    try {
      const res = await fetch("/api/free-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserId: browserId() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "That did not work. Try again.");
      status = null;
      dispatch("claimed", { expiresAt: body.expiresAt });
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if status && (status.ok || !status.quiet)}
  <div class="rounded-md border border-sr-hairline bg-sr-mint text-sr-mint-ink p-3 flex flex-col gap-2">
    <p class="text-sm"><strong>Try Pro free for a month.</strong> No card, nothing to cancel: after 30 days you simply go back to the free plan.</p>
    {#if status.ok}
      <button class="sr-btn text-sm self-start" on:click={claim} disabled={busy}>{busy ? "Starting…" : "Start my free month"}</button>
    {:else}
      <p class="text-sm font-semibold">{status.reason}</p>
    {/if}
    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
  </div>
{/if}
