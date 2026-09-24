<!-- Where the emailed reset link lands: Better Auth checks the token and sends
     the browser here with ?token=, or with ?error= when it is bad or old. -->
<script lang="ts">
  import { authClient } from "../lib/auth-client";

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const linkError = params.get("error");

  let password = "";
  let confirm = "";
  let busy = false;
  let problem = "";
  let done = false;

  async function submit() {
    problem = "";
    if (password !== confirm) {
      problem = "The two passwords don't match.";
      return;
    }
    busy = true;
    const { error } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
    busy = false;
    if (error) problem = error.message ?? "Could not reset the password.";
    else done = true;
  }

  const input =
    "w-full border border-sr-hairline bg-sr-raise text-sr-ink rounded-md px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-sr-action";
</script>

<div class="w-full max-w-sm bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-4">
  <h2 class="text-lg font-semibold text-sr-ink">Choose a new password</h2>
  {#if done}
    <p class="text-sm text-sr-ink-2">Your password is changed, and you've been signed out everywhere else.</p>
    <a class="sr-btn text-center py-2" href="/login">Sign in</a>
  {:else if !token || linkError}
    <p class="text-sm text-sr-danger">That reset link is invalid or has expired. Links work for an hour.</p>
    <a class="sr-btn text-center py-2" href="/login?mode=forgot">Send a new link</a>
  {:else}
    <form class="flex flex-col gap-3" on:submit|preventDefault={submit}>
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        New password
        <input class={input} type="password" bind:value={password} autocomplete="new-password" minlength="8" maxlength="128" required />
      </label>
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        Again
        <input class={input} type="password" bind:value={confirm} autocomplete="new-password" minlength="8" maxlength="128" required />
      </label>
      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      <button class="sr-btn w-full py-2" type="submit" disabled={busy}>Set password</button>
    </form>
  {/if}
</div>
