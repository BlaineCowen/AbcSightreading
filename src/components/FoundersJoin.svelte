<script lang="ts">
  import { onMount } from "svelte";
  import { authClient } from "../lib/auth-client";
  import type { FounderDecision } from "../lib/founders";

  /**
   * The Join button on /founders (src/lib/founders.ts): asks whether this
   * account may join, says the one step in the way (sign in, confirm the
   * email), and joins.
   */
  let status: FounderDecision | null = null;
  let busy = false;
  let problem = "";
  let joined: { expiresAt: number; seats: number } | null = null;

  onMount(async () => {
    const res = await fetch("/api/founders").catch(() => null);
    status = res?.ok ? await res.json() : null;
  });

  let sent = "";
  async function resend() {
    problem = "";
    const email = (await authClient.getSession()).data?.user.email;
    if (!email) return;
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/founders" });
    if (error) problem = error.message ?? "Could not send the email.";
    else sent = `A new link is on its way to ${email}.`;
  }

  async function join() {
    busy = true;
    problem = "";
    try {
      const res = await fetch("/api/founders", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "That did not work. Try again.");
      joined = body;
    } catch (e) {
      problem = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const day = (t: number) => new Date(t - 3_600_000 * 7).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
</script>

<div class="flex flex-col items-center gap-3 text-center" aria-live="polite">
  {#if joined}
    <p class="text-xl font-semibold text-sr-ink">Welcome, founding teacher!</p>
    <p class="text-sr-ink-2">Educator is on until {day(joined.expiresAt)}, with {joined.seats} student seats.</p>
    <div class="flex flex-wrap justify-center gap-2">
      <a class="sr-btn" href="/account#students">Make your first class</a>
      <a class="sr-btn-quiet" href="/sightreading">Start sight-reading</a>
    </div>
  {:else if !status}
    <span class="sr-btn opacity-60" aria-disabled="true">Join as a founding teacher</span>
  {:else if status.ok}
    <button class="sr-btn text-lg px-6" on:click={join} disabled={busy}>{busy ? "Joining…" : "Join as a founding teacher"}</button>
  {:else if status.step === "joined"}
    <p class="text-xl font-semibold text-sr-ink">You're a founding teacher.</p>
    <a class="sr-btn" href="/account#students">Go to your classes</a>
  {:else if status.step === "sign-in"}
    <div class="flex flex-wrap justify-center gap-2">
      <a class="sr-btn text-lg px-6" href="/login?mode=signup&next=/founders">Create a free account to join</a>
      <a class="sr-btn-quiet" href="/login?next=/founders">I have an account</a>
    </div>
  {:else if status.step === "confirm"}
    <p class="text-sr-ink-2">{status.reason}</p>
    {#if sent}<p class="text-sm text-sr-ink-2">{sent}</p>{:else}<button class="sr-btn-quiet" on:click={resend}>Send the link again</button>{/if}
  {:else}
    <p class="text-sr-ink-2">{status.reason}</p>
  {/if}
  {#if problem}<p class="text-sm text-sr-danger">{problem}</p>{/if}
</div>
