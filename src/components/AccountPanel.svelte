<script lang="ts">
  import { authClient } from "../lib/auth-client";

  const session = authClient.useSession();
  $: user = $session.data?.user;

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
      <p class="text-sm text-sr-ink-2">{user.email}
        {#if user.emailVerified}
          <span class="text-xs text-sr-faint">· confirmed</span>
        {:else}
          <span class="text-xs text-sr-danger">· not confirmed</span>
          <button class="text-xs underline text-sr-muted ml-1" on:click={resendVerification}>Send the link again</button>
        {/if}
      </p>
    </section>

    <section class="flex flex-col gap-1">
      <h2 class="text-xs uppercase tracking-wide text-sr-faint">Plan</h2>
      <p class="text-sm text-sr-ink-2">Free. Your saved presets follow you to any device you sign in on.</p>
    </section>

    {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}
    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

    <div class="flex flex-wrap gap-2 items-center">
      <button class="sr-btn" on:click={signOut}>Sign out</button>
      {#if !confirmingDelete}
        <button class="sr-btn-quiet text-sr-danger" on:click={() => (confirmingDelete = true)}>Delete account…</button>
      {:else}
        <span class="text-sm text-sr-ink-2 w-full">This removes the account and every preset saved to it. It cannot be undone.</span>
        <button class="sr-btn-quiet text-sr-danger" on:click={deleteAccount} disabled={busy}>Delete it</button>
        <button class="text-sm text-sr-muted underline" on:click={() => (confirmingDelete = false)}>Keep it</button>
      {/if}
    </div>
  {/if}
</div>
