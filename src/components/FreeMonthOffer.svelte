<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import { authClient } from "../lib/auth-client";

  /**
   * The free month of Pro (src/lib/free-month.ts): no card, it simply ends.
   * Shown on the account page's free plan when this account may claim it, or
   * when one step stands in the way (confirm the email). Claiming marks this
   * browser, so a second account here is refused.
   */
  const dispatch = createEventDispatcher<{ claimed: { expiresAt: number } }>();
  let status: { ok: true } | { ok: false; reason: string; quiet?: boolean; step?: "confirm" } | null = null;
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

  /** The confirmation link again, for the one step left. */
  let sent = "";
  async function resend() {
    problem = "";
    const email = (await authClient.getSession()).data?.user.email;
    if (!email) return;
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/account?confirmed=1#plan" });
    if (error) problem = error.message ?? "Could not send the email.";
    else sent = `A new link is on its way to ${email}.`;
  }

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
  <div class="offer">
    <p class="badge"><Sparkles size={13} aria-hidden="true" /> Free for 30 days</p>
    <p class="font-display text-xl font-bold leading-tight">Try Pro free for a month</p>
    <p class="text-sm">Unlimited exercises, Listen and grade, abcTuner and the practice tools. No card, nothing to cancel: after 30 days you simply go back to the free plan.</p>
    {#if status.ok}
      <button class="sr-btn self-start" on:click={claim} disabled={busy}>{busy ? "Starting…" : "Start my free month"}</button>
    {:else if status.step === "confirm"}
      <p class="text-sm font-bold">One step left: confirm your email with the link in your inbox, then come back here.</p>
      {#if sent}<p class="text-sm" role="status">{sent}</p>
      {:else}<button class="sr-btn-quiet text-sm self-start" on:click={resend}>Send the link again</button>{/if}
    {:else}
      <p class="text-sm font-semibold">{status.reason}</p>
    {/if}
    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
  </div>
{/if}

<style>
  .offer {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    border-radius: var(--sr-r-md);
    background: var(--sr-mint);
    color: var(--sr-mint-ink);
    padding: 1.1rem 1.2rem;
  }
  .badge {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border-radius: 999px;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
    padding: 0.15rem 0.6rem;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
