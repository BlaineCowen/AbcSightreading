<script lang="ts">
  import { onMount } from "svelte";
  import { authClient } from "../lib/auth-client";
  import { billingStatus, openBillingPortal, redeemCode, startCheckout, type BillingStatus } from "../lib/billing-client";
  import { EDUCATOR_ON_SALE, GENERATION_LIMITS } from "../lib/plan";

  const session = authClient.useSession();
  $: user = $session.data?.user;
  $: accountType = (user as { accountType?: string } | undefined)?.accountType ?? "standard";
  $: isStudent = accountType === "student";

  // A student's username and classes; anyone's classes they have joined.
  let membership: { username: string | null; classes: { name: string; teacher: string }[] } | null = null;
  $: if (user && !membership) {
    fetch("/api/student").then((r) => (r.ok ? r.json() : null)).then((m) => (membership = m));
  }

  // The plan, and this month's count on the free one.
  let billing: BillingStatus | null = null;
  let used: number | null = null;

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    // Back from paying for Educator: the classes get their join codes now,
    // whether or not Stripe's webhook has arrived yet.
    if (params.get("upgraded") === "educator") {
      await fetch("/api/educator", { method: "POST" });
      // The session is cached in a cookie; ask for a fresh one so the page
      // (and the server's own checks) see the new plan straight away.
      await authClient.getSession({ query: { disableCookieCache: true } });
      history.replaceState(null, "", "/account#plan");
      location.reload();
      return;
    }
    // A code link - /account?code=BETA2026 - is used as soon as the account is here.
    const linkCode = params.get("code");
    // Signed out, leave the address alone: the redirect below carries the code to sign-in and back.
    if (linkCode && (await authClient.getSession()).data) {
      history.replaceState(null, "", "/account#plan");
      await useCode(linkCode);
      return;
    }
    if (params.get("upgraded")) {
      notice = "Thank you! Pro is on.";
      history.replaceState(null, "", "/account#plan");
    }
    try {
      const saved = sessionStorage.getItem("abcsr_code_notice");
      if (saved) {
        notice = saved;
        sessionStorage.removeItem("abcsr_code_notice");
      }
    } catch {}
    billing = await billingStatus();
    if (billing?.plan === "free") {
      const res = await fetch("/api/usage");
      if (res.ok) used = (await res.json()).used;
    }
  });

  // An access code: a plan free for a while.
  let codeInput = "";
  let redeeming = false;
  async function useCode(code: string) {
    redeeming = true;
    problem = notice = "";
    try {
      const r = await redeemCode(code);
      // An Educator code changes the account type; the page shows what the database says.
      await authClient.getSession({ query: { disableCookieCache: true } });
      sessionStorage.setItem("abcsr_code_notice", `Code applied: ${planName(r.plan)} free until ${day(r.expiresAt)}.`);
      location.reload();
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not use that code.";
      redeeming = false;
      billing = await billingStatus();
    }
  }

  let upgrading = false;
  async function checkout(plan: "pro" | "educator") {
    upgrading = true;
    problem = "";
    try {
      await startCheckout(plan, billing?.subscription?.id);
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not start checkout.";
      upgrading = false;
    }
  }

  async function manageBilling() {
    problem = "";
    try {
      await openBillingPortal();
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not open billing.";
    }
  }

  const planName = (p: string) => (p === "educator" ? "Educator" : p === "pro" ? "Pro" : "Free");
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  // Signed out (or the session ended): nothing to show here.
  $: if (!$session.isPending && !$session.data) {
    // Keep the address: a code link (/account?code=...) is used after signing in.
    const back = location.pathname + location.search;
    const mode = new URLSearchParams(location.search).has("code") ? "mode=signup&" : "";
    window.location.href = `/login?${mode}next=${encodeURIComponent(back)}`;
  }

  let notice = "";
  let problem = "";
  let confirmingDelete = false;
  let busy = false;

  async function resendVerification() {
    if (!user) return;
    problem = notice = "";
    const { error } = await authClient.sendVerificationEmail({ email: user.email, callbackURL: "/account" });
    if (error) problem = error.message ?? "Could not send the email.";
    else notice = `A confirmation link is on its way to ${user.email}.`;
  }

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  async function deleteAccount() {
    busy = true;
    problem = "";
    const { error } = await authClient.deleteUser({ callbackURL: "/" });
    busy = false;
    if (error) {
      // Deleting needs a recent sign-in; an old session is refused.
      problem =
        error.code === "SESSION_EXPIRED"
          ? "For safety, sign out and back in, then delete the account."
          : error.message ?? "Could not delete the account.";
      return;
    }
    window.location.href = "/";
  }
</script>

<div class="w-full max-w-md bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-5">
  {#if !user}
    <p class="text-sm text-sr-muted">Loading…</p>
  {:else}
    <section class="flex flex-col gap-1">
      <h2 class="text-xs uppercase tracking-wide text-sr-faint">Signed in as</h2>
      <p class="text-sr-ink font-medium">{user.name}</p>
      {#if isStudent}
        <p class="text-sm text-sr-ink-2">Username <strong>{membership?.username ?? "…"}</strong></p>
      {:else}
        <p class="text-sm text-sr-ink-2">{user.email}
          {#if user.emailVerified}
            <span class="text-xs text-sr-faint">· confirmed</span>
          {:else}
            <span class="text-xs text-sr-danger">· not confirmed</span>
            <button class="text-xs underline text-sr-muted ml-1" on:click={resendVerification}>Send the link again</button>
          {/if}
        </p>
      {/if}
    </section>

    {#if membership?.classes.length}
      <section class="flex flex-col gap-1">
        <h2 class="text-xs uppercase tracking-wide text-sr-faint">Your {membership.classes.length === 1 ? "class" : "classes"}</h2>
        {#each membership.classes as c}
          <p class="text-sm text-sr-ink-2"><strong>{c.name}</strong> <span class="text-sr-muted">with {c.teacher}</span></p>
        {/each}
      </section>
    {/if}

    <section id="plan" class="flex flex-col gap-2">
      <h2 class="text-xs uppercase tracking-wide text-sr-faint">Plan</h2>
      {#if isStudent}
        <p class="text-sm text-sr-ink-2">Your teacher's class plan. If you forget your password, ask your teacher for a new one.</p>
      {:else if !billing}
        <p class="text-sm text-sr-muted">…</p>
      {:else if billing.plan !== "free"}
        <p class="text-sm text-sr-ink-2">
          <strong>{planName(billing.plan)}</strong>: unlimited exercises and the practice tools{billing.plan === "educator" ? ", plus classes with join codes and student accounts" : ""}.
        </p>
        {#if billing.subscription}
          {@const sub = billing.subscription}
          <p class="text-sm text-sr-muted">
            {#if sub.status === "past_due"}
              The last payment did not go through. Update the card to keep the plan.
            {:else if sub.cancelAtPeriodEnd && sub.periodEnd}
              Ends {day(sub.periodEnd)}.
            {:else if sub.periodEnd}
              Renews {day(sub.periodEnd)}.
            {/if}
          </p>
          <div class="flex flex-wrap gap-2">
            <button class="sr-btn-quiet text-sm" on:click={manageBilling}>Card, receipts and cancelling</button>
          </div>
          {#if EDUCATOR_ON_SALE && billing.plan === "pro" && accountType !== "student"}
            <div class="rounded-md border border-sr-hairline bg-sr-raise p-3 flex flex-col gap-2">
              <p class="text-sm text-sr-ink"><strong>Teach a choir?</strong> Educator gives your classes join codes and 100 secure student accounts for all age groups. $99 a year, less what is left of your Pro year.</p>
              <button class="sr-btn text-sm self-start" on:click={() => checkout("educator")} disabled={upgrading || !billing.billingEnabled}>Upgrade to Educator</button>
              <p class="text-xs text-sr-muted">Tax-exempt school, or paying by purchase order? <a class="underline" href="#quote">Get a quote</a>.</p>
            </div>
          {/if}
        {:else}
          <p class="text-sm text-sr-muted">
            {#if billing.via === "code" && billing.grantEnds}Free from a code until {day(billing.grantEnds)}.
            {:else if billing.via === "complimentary"}Complimentary.
            {:else}Through your teacher's class.{/if}
          </p>
        {/if}
      {:else}
        <p class="text-sm text-sr-ink-2">
          <strong>Free</strong>: {GENERATION_LIMITS.free} exercises a month{used !== null ? ` (${used} used this month)` : ""}. Your saved presets follow you to any device you sign in on.
        </p>
        <div class="rounded-md border border-sr-hairline bg-sr-raise p-3 flex flex-col gap-2">
          <p class="text-sm text-sr-ink"><strong>Pro: $19.99 a year.</strong> Unlimited exercises, abcTuner, and the practice tools beside the music: tuner, metronome, drone, starting pitches.</p>
          <button class="sr-btn text-sm self-start" on:click={() => checkout("pro")} disabled={upgrading || !billing.billingEnabled}>Get Pro</button>
        </div>
        <div class="rounded-md border border-sr-hairline bg-sr-raise p-3 flex flex-col gap-2">
          <p class="text-sm text-sr-ink">
            <strong>Educator: $99 a year.</strong>
            {#if !EDUCATOR_ON_SALE}<span class="ml-1 rounded bg-sr-brass-bg text-sr-brass text-xs font-semibold px-1.5 py-0.5 align-middle">Coming soon</span>{/if}
            Everything in Pro, and your classes get join codes and 100 secure student accounts for all age groups. Assign practice and see the minutes each student put in.
          </p>
          {#if EDUCATOR_ON_SALE}
            <button class="sr-btn text-sm self-start" on:click={() => checkout("educator")} disabled={upgrading || !billing.billingEnabled}>Get Educator</button>
            <p class="text-xs text-sr-muted">Tax-exempt school, or paying by purchase order? <a class="underline" href="#quote">Get a quote</a> for the purchasing office.</p>
          {/if}
        </div>
        {#if !billing.billingEnabled}
          <p class="text-xs text-sr-muted">Payments are not set up on this server.</p>
        {/if}
      {/if}
      {#if !isStudent && billing}
        <form class="flex gap-2 items-center mt-1" on:submit|preventDefault={() => useCode(codeInput)}>
          <label class="sr-only" for="access-code">Code</label>
          <input id="access-code" class="flex-1 rounded border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-2 py-1 uppercase" placeholder="Have a code?" bind:value={codeInput} maxlength="30" />
          <button class="sr-btn-quiet text-sm" disabled={redeeming || !codeInput.trim()}>Use it</button>
        </form>
      {/if}
    </section>

    {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}
    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

    <div class="flex flex-wrap gap-2 items-center">
      <button class="sr-btn" on:click={signOut}>Sign out</button>
      {#if isStudent}
        <span class="text-xs text-sr-muted">Your teacher manages this account.</span>
      {:else if !confirmingDelete}
        <button class="sr-btn-quiet text-sr-danger" on:click={() => (confirmingDelete = true)}>Delete account…</button>
      {:else}
        <span class="text-sm text-sr-ink-2 w-full">
          This removes the account and every preset saved to it{accountType === "educator" ? ", your classes, and the student accounts you made for them" : ""}. It cannot be undone.
        </span>
        <button class="sr-btn-quiet text-sr-danger" on:click={deleteAccount} disabled={busy}>Delete it</button>
        <button class="text-sm text-sr-muted underline" on:click={() => (confirmingDelete = false)}>Keep it</button>
      {/if}
    </div>
  {/if}
</div>
