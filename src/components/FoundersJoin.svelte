<script lang="ts">
  import { onMount } from "svelte";
  import { authClient } from "../lib/auth-client";
  import type { FounderDecision } from "../lib/founders";

  /**
   * The Join button on /founders (src/lib/founders.ts): asks whether this
   * account may join, says the one step in the way (sign in, confirm the
   * email, or tell us the school when the email is a personal one), and
   * joins.
   */
  let status: FounderDecision | null = null;
  let busy = false;
  let problem = "";
  let joined: { expiresAt: number; seats: number; proRenews?: boolean } | null = null;
  let form = { school: "", district: "", role: "", proofUrl: "", note: "" };

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

  async function apply() {
    busy = true;
    problem = "";
    try {
      const res = await fetch("/api/founders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apply: form }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "That did not work. Try again.");
      status = { ok: false, step: "pending", reason: "Thanks! We're checking your school and will email you, usually within a day." };
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
    {#if joined.proRenews}
      <p class="text-sm text-sr-ink-2 max-w-md">
        Your Pro subscription will still renew on its date. Educator includes everything in Pro, so you can
        <a class="sr-link" href="/account#plan">turn its renewal off</a>.
      </p>
    {/if}
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
  {:else if status.step === "apply"}
    <!-- A personal email: where they teach, and a page that shows it, for the owner to check. -->
    <form class="apply sr-panel p-5 w-full max-w-md flex flex-col gap-3 text-left" on:submit|preventDefault={apply}>
      <p class="text-sm text-sr-ink-2">
        Tell us where you teach. Joining with your school email skips this step; with a personal email we check first, usually within a day.
      </p>
      <label>School<input bind:value={form.school} required maxlength="120" autocomplete="organization" placeholder="Lamar Middle School" /></label>
      <label>District, or city for a private school<input bind:value={form.district} required maxlength="120" placeholder="Austin ISD" /></label>
      <label>What you teach<input bind:value={form.role} required maxlength="80" placeholder="Choir, grades 6 to 8" /></label>
      <label>A page that lists you<input bind:value={form.proofUrl} required maxlength="400" inputmode="url" placeholder="The school's staff directory, or your page on its site" /></label>
      <label>Anything else (optional)<textarea bind:value={form.note} maxlength="600" rows="2"></textarea></label>
      <button class="sr-btn self-start" disabled={busy}>{busy ? "Sending…" : "Ask to join"}</button>
    </form>
  {:else if status.step === "pending"}
    <p class="text-sr-ink-2 max-w-md">{status.reason}</p>
  {:else if status.step === "confirm"}
    <p class="text-sr-ink-2">{status.reason}</p>
    {#if sent}<p class="text-sm text-sr-ink-2">{sent}</p>{:else}<button class="sr-btn-quiet" on:click={resend}>Send the link again</button>{/if}
  {:else}
    <p class="text-sr-ink-2">{status.reason}</p>
  {/if}
  {#if problem}<p class="text-sm text-sr-danger">{problem}</p>{/if}
</div>

<style>
  .apply label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 700; color: var(--sr-ink); }
  .apply input, .apply textarea {
    font-weight: 500;
    font-size: 0.95rem;
    padding: 0.55rem 0.8rem;
    border-radius: 14px;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-raise);
    color: var(--sr-ink);
  }
</style>
