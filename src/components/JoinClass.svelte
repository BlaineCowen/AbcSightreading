<script lang="ts">
  import { onMount } from "svelte";
  import { signedInUser, type SignedInUser } from "../lib/auth-client";
  import { formatJoinCode, isJoinCode, joinCodeHint, normalizeJoinCode } from "../lib/join-code";
  import { generatePassword, usernameFor } from "../lib/roster";

  /**
   * Joining a class with its code. Signed in, one button. Signed out, a
   * student account that asks for nothing a child should not give: a first
   * name, a last name or initial if they like, a username and a password.
   */

  let code = "";
  let first = "";
  let last = "";
  let username = "";
  let usernameEdited = false;
  let password = "";
  let showPassword = false;
  let user: SignedInUser | null | undefined = undefined;
  let busy = false;
  let problem = "";
  let joined = "";

  onMount(async () => {
    const fromLink = new URLSearchParams(location.search).get("code");
    if (fromLink) code = formatJoinCode(normalizeJoinCode(fromLink));
    user = await signedInUser();
  });

  // Suggest a username from the name until the student types their own.
  $: if (!usernameEdited && first) username = usernameFor(first, last, new Set());
  $: codeOk = isJoinCode(normalizeJoinCode(code));
  $: codeHint = joinCodeHint(code);

  function makePassword() {
    password = generatePassword();
    showPassword = true;
  }

  async function join() {
    busy = true;
    problem = "";
    try {
      const body = user ? { code } : { code, first, last, username, password };
      const res = await fetch("/api/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        problem = data?.error ?? "Could not join.";
        return;
      }
      if (user) joined = data.joined;
      else window.location.href = "/account";
    } catch {
      problem = "Could not reach the server.";
    } finally {
      busy = false;
    }
  }

  const input =
    "w-full border border-sr-hairline bg-sr-raise text-sr-ink rounded-md px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-sr-action";
</script>

<div class="w-full max-w-sm bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-4">
  {#if joined}
    <p class="text-sr-ink">You're in <strong>{joined}</strong>.</p>
    <a class="sr-btn text-center" href="/account">Go to your account</a>
  {:else if user === undefined}
    <p class="text-sm text-sr-muted">Loading…</p>
  {:else if user?.accountType === "educator"}
    <p class="text-sm text-sr-ink-2">You are signed in as a teacher. Students join with this page from their own device.</p>
  {:else}
    <form class="flex flex-col gap-3" on:submit|preventDefault={join}>
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        Class code
        <input class="{input} uppercase tracking-widest" bind:value={code} placeholder="KTZ-482" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" required />
        {#if codeHint}<span class="text-xs text-sr-danger" role="status">{codeHint}</span>{/if}
      </label>

      {#if !user}
        <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
          First name
          <input class={input} bind:value={first} maxlength="40" autocomplete="given-name" required />
        </label>
        <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
          Last name or initial <span class="text-xs text-sr-faint">(so your teacher knows which Maria you are)</span>
          <input class={input} bind:value={last} maxlength="40" autocomplete="off" />
        </label>
        <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
          Username
          <input class={input} bind:value={username} on:input={() => (usernameEdited = true)} maxlength="20" autocapitalize="none" spellcheck="false" autocomplete="username" required />
          <span class="text-xs text-sr-faint">Letters, numbers and dots. You'll type this with the class code to sign in.</span>
        </label>
        <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
          Password
          <div class="flex gap-2">
            {#if showPassword}
              <input class={input} type="text" bind:value={password} minlength="8" maxlength="64" autocomplete="new-password" required />
            {:else}
              <input class={input} type="password" bind:value={password} minlength="8" maxlength="64" autocomplete="new-password" required />
            {/if}
            <button type="button" class="sr-btn-quiet text-xs whitespace-nowrap" on:click={makePassword}>Make one for me</button>
          </div>
          <span class="text-xs text-sr-faint">At least 8 characters. Write it down somewhere safe.</span>
        </label>
      {:else}
        <p class="text-sm text-sr-muted">You'll join as yourself, and your presets and settings come with you.</p>
      {/if}

      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      <button class="sr-btn w-full py-2" type="submit" disabled={busy || !codeOk}>Join the class</button>
    </form>
    {#if !user}
      <p class="text-xs text-sr-muted text-center">Already have a login card? <a class="underline" href="/login?mode=student">Sign in</a></p>
    {/if}
  {/if}
</div>
