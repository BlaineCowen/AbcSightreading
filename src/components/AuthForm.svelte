<!-- Sign in, create an account, or ask for a reset link: one card, three modes. -->
<script lang="ts">
  import { authClient } from "../lib/auth-client";
  import { safeNext } from "../lib/safe-next";
  import FreeMonthPromo from "./FreeMonthPromo.svelte";
  import { normalizeJoinCode, isJoinCode } from "../lib/join-code";
  import { studentLoginName } from "../lib/roster";

  export let googleEnabled = false;
  export let classlinkEnabled = false;
  export let mode: "signin" | "signup" | "forgot" | "student" = "signin";

  const next = safeNext(new URLSearchParams(window.location.search).get("next"));

  let name = "";
  let email = "";
  let password = "";
  let busy = false;
  // Students: the class code and username from their login card.
  let classCode = "";
  let username = "";
  let problem = oauthProblem();
  let notice = "";

  /** Back from Google or ClassLink with an error (Better Auth adds ?error=). */
  function oauthProblem(): string {
    const err = new URLSearchParams(window.location.search).get("error");
    if (!err) return "";
    if (mode === "student" && /signup/i.test(err)) {
      return "Your teacher has not brought your Google account into a class yet. Use the login card from your teacher, or ask them to import your class from Google Classroom.";
    }
    if (/signup/i.test(err)) return "There is no account for that Google account yet. Choose Create account to make one.";
    return "That sign-in did not work. Try again, or use your email and password.";
  }

  function setMode(m: typeof mode) {
    mode = m;
    problem = "";
    notice = "";
  }

  async function submit() {
    busy = true;
    problem = "";
    notice = "";
    try {
      if (mode === "student") {
        const code = normalizeJoinCode(classCode);
        if (!isJoinCode(code)) {
          problem = "Check your class code. It looks like KTZ-482.";
          return;
        }
        const { error } = await authClient.signIn.username({
          username: studentLoginName(code, username.trim().toLowerCase()),
          password,
        });
        if (error) problem = "That class code, username and password do not match. Check your login card.";
        // A student starts from their assignments, unless they were sent somewhere.
        else window.location.href = safeNext(new URLSearchParams(window.location.search).get("next"), "/account");
      } else if (mode === "signin") {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: next });
        if (error) problem = error.message ?? "Could not sign in.";
        else window.location.href = next;
      } else if (mode === "signup") {
        const { error } = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0],
          email,
          password,
          callbackURL: next,
        });
        if (error) problem = error.message ?? "Could not create the account.";
        else {
          // A welcome on the page it lands on (WelcomeNote).
          try { sessionStorage.setItem("sr-welcome", email); } catch {}
          window.location.href = next;
        }
      } else {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        // Same answer whether or not the address has an account, so the form
        // cannot be used to find out who does.
        if (error) problem = error.message ?? "Could not send the email.";
        else notice = "If that address has an account, a reset link is on its way. It works for an hour.";
      }
    } catch (e) {
      problem = e instanceof Error ? e.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }

  /**
   * Google or ClassLink. On the student tab a Google sign-in never makes an
   * account: it finds the one a teacher's Google Classroom import made.
   */
  async function social(provider: "google" | "classlink") {
    busy = true;
    problem = "";
    const student = mode === "student";
    const { error } = await authClient.signIn.social({
      provider: provider as "google",
      callbackURL: student ? safeNext(new URLSearchParams(window.location.search).get("next"), "/account") : next,
      errorCallbackURL: `/login?mode=${mode}`,
      requestSignUp: provider === "classlink" || !student,
    });
    // On success the browser is already on its way.
    if (error) {
      problem = error.message ?? "Could not reach the sign-in page.";
      busy = false;
    }
  }

  const input =
    "w-full border border-sr-hairline bg-sr-raise text-sr-ink rounded-md px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-sr-action";
</script>

<div class="w-full max-w-sm bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-4">
  {#if mode !== "forgot"}
    <div class="flex gap-1 p-1 bg-sr-track rounded-md" role="tablist">
      <button
        role="tab"
        aria-selected={mode === "signin"}
        class="flex-1 rounded px-3 py-1.5 text-sm font-medium {mode === 'signin' ? 'bg-sr-raise text-sr-ink shadow-sm' : 'text-sr-muted'}"
        on:click={() => setMode("signin")}
      >Sign in</button>
      <button
        role="tab"
        aria-selected={mode === "signup"}
        class="flex-1 rounded px-3 py-1.5 text-sm font-medium {mode === 'signup' ? 'bg-sr-raise text-sr-ink shadow-sm' : 'text-sr-muted'}"
        on:click={() => setMode("signup")}
      >Create account</button>
      <button
        role="tab"
        aria-selected={mode === "student"}
        class="flex-1 rounded px-3 py-1.5 text-sm font-medium {mode === 'student' ? 'bg-sr-raise text-sr-ink shadow-sm' : 'text-sr-muted'}"
        on:click={() => setMode("student")}
      >Student</button>
    </div>
  {:else}
    <div>
      <h2 class="text-lg font-semibold text-sr-ink">Reset your password</h2>
      <p class="text-sm text-sr-muted mt-1">We'll email you a link to choose a new one.</p>
    </div>
  {/if}

  {#if (googleEnabled || classlinkEnabled) && mode !== "forgot"}
    {#if googleEnabled}
      <button class="sr-btn-quiet w-full py-2 flex items-center justify-center gap-2" on:click={() => social("google")} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        {mode === "student" ? "Sign in with Google" : "Continue with Google"}
      </button>
    {/if}
    {#if classlinkEnabled}
      <button class="sr-btn-quiet w-full py-2 flex items-center justify-center gap-2" on:click={() => social("classlink")} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2c8bd1" /><path d="M8.5 12a3.5 3.5 0 0 1 6-2.45M15.5 12a3.5 3.5 0 0 1-6 2.45" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" /></svg>
        Sign in with ClassLink
      </button>
    {/if}
    <div class="flex items-center gap-3 text-xs text-sr-faint">
      <span class="flex-1 border-t border-sr-hairline"></span>{mode === "student" ? "or use your login card" : "or"}<span class="flex-1 border-t border-sr-hairline"></span>
    </div>
  {/if}

  <form class="flex flex-col gap-3" on:submit|preventDefault={submit}>
    {#if mode === "student"}
      <p class="text-sm text-sr-muted">Use the login card from your teacher.</p>
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        Class code
        <input class="{input} uppercase tracking-widest" type="text" bind:value={classCode} placeholder="KTZ-482" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" required />
      </label>
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        Username
        <input class={input} type="text" bind:value={username} autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required />
      </label>
    {/if}
    {#if mode === "signup"}
      <FreeMonthPromo variant="signup" />
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        Name <span class="text-sr-faint text-xs">(optional)</span>
        <input class={input} type="text" bind:value={name} autocomplete="name" maxlength="80" />
      </label>
    {/if}
    {#if mode !== "student"}
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        Email
        <input class={input} type="email" bind:value={email} autocomplete="email" required />
      </label>
    {/if}
    {#if mode !== "forgot"}
      <label class="flex flex-col gap-1 text-sm text-sr-ink-2">
        Password
        <input
          class={input}
          type="password"
          bind:value={password}
          autocomplete={mode === "signup" ? "new-password" : "current-password"}
          minlength={mode === "student" ? 1 : 8}
          maxlength="128"
          required
        />
        {#if mode === "signup"}<span class="text-xs text-sr-faint">At least 8 characters.</span>{/if}
      </label>
    {/if}

    {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
    {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}

    <button class="sr-btn w-full py-2" type="submit" disabled={busy}>
      {mode === "signin" || mode === "student" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
    </button>
  </form>

  {#if mode === "signup"}
    <p class="text-xs text-sr-muted text-center">By creating an account you agree to our <a class="underline" href="/terms">terms</a> and <a class="underline" href="/privacy">privacy policy</a>.</p>
  {/if}

  {#if mode === "student"}
    <p class="text-sm text-sr-muted text-center">Forgot your password? Ask your teacher for a new one.</p>
    <a class="text-sm text-sr-muted underline self-center" href="/join">Have a class code but no account? Join a class</a>
  {:else if mode === "signin"}
    <button class="text-sm text-sr-muted underline self-center" on:click={() => setMode("forgot")}>Forgot your password?</button>
  {:else if mode === "forgot"}
    <button class="text-sm text-sr-muted underline self-center" on:click={() => setMode("signin")}>Back to sign in</button>
  {/if}
</div>
