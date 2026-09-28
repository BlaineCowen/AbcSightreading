<script lang="ts">
  import { authClient } from "../lib/auth-client";

  const session = authClient.useSession();
  $: user = $session.data?.user;
  $: accountType = (user as { accountType?: string } | undefined)?.accountType ?? "standard";
  $: isStudent = accountType === "student";

  // A student's username and classes; anyone's classes they have joined.
  let membership: { username: string | null; classes: { name: string; teacher: string }[] } | null = null;
  $: if (user && !membership) {
    fetch("/api/student").then((r) => (r.ok ? r.json() : null)).then((m) => (membership = m));
  }

  let upgrading = false;
  async function becomeEducator() {
    upgrading = true;
    problem = "";
    const res = await fetch("/api/educator", { method: "POST" });
    if (res.ok) {
      // The session is cached in a cookie; ask for a fresh one so the page
      // (and the server's own checks) see the new plan straight away.
      await authClient.getSession({ query: { disableCookieCache: true } });
      window.location.reload();
    }
    else {
      problem = (await res.json().catch(() => ({}))).error ?? "Could not upgrade.";
      upgrading = false;
    }
  }

  // Signed out (or the session ended): nothing to show here.
  $: if (!$session.isPending && !$session.data) {
    window.location.href = "/login?next=/account";
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

    <section class="flex flex-col gap-2">
      <h2 class="text-xs uppercase tracking-wide text-sr-faint">Plan</h2>
      {#if isStudent}
        <p class="text-sm text-sr-ink-2">Your teacher's class plan. If you forget your password, ask your teacher for a new one.</p>
      {:else if accountType === "educator"}
        <p class="text-sm text-sr-ink-2">Educator: classes with join codes, and student accounts for them. Free while billing is being set up.</p>
      {:else}
        <p class="text-sm text-sr-ink-2">Free. Your saved presets follow you to any device you sign in on.</p>
        <div class="rounded-md border border-sr-hairline bg-sr-raise p-3 flex flex-col gap-2">
          <p class="text-sm text-sr-ink"><strong>Teach a choir?</strong> An educator plan gives your classes join codes and up to 100 student accounts - for students under 13 too, with no email needed.</p>
          <button class="sr-btn text-sm self-start" on:click={becomeEducator} disabled={upgrading}>Start an educator plan</button>
        </div>
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
