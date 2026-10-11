<!--
  Sign in, create an account, sign in as a student, or ask for a reset link.
  Creating an account sits beside what it gives (the free month of Pro while
  it is on offer), and an access code carried in from a link is named, so
  nobody wonders whether it survived the trip through sign-up.
-->
<script lang="ts">
  import Eye from "lucide-svelte/icons/eye";
  import EyeOff from "lucide-svelte/icons/eye-off";
  import InfinityIcon from "lucide-svelte/icons/infinity";
  import Mic from "lucide-svelte/icons/mic";
  import Gauge from "lucide-svelte/icons/gauge";
  import Cloud from "lucide-svelte/icons/cloud";
  import Ticket from "lucide-svelte/icons/ticket";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import { authClient } from "../lib/auth-client";
  import { safeNext } from "../lib/safe-next";
  import { normalizeJoinCode, isJoinCode } from "../lib/join-code";
  import { studentLoginName } from "../lib/roster";
  import { GENERATION_LIMITS } from "../lib/plan";

  export let googleEnabled = false;
  export let classlinkEnabled = false;
  export let mode: "signin" | "signup" | "forgot" | "student" = "signin";
  /** The free month of Pro is on offer (src/lib/free-month.ts), and until when, if it has an end. */
  export let freeMonth = false;
  export let freeMonthUntil: number | null = null;
  /** An access code waiting in the `next` link (/account?code=X), used once the account is here. */
  export let code: string | null = null;

  const params = new URLSearchParams(window.location.search);
  // Home is where a signed-in visit starts (the dashboard); a link that sent
  // someone here takes them back to it.
  const next = safeNext(params.get("next"), "/");

  let name = "";
  let email = "";
  let password = "";
  let showPassword = false;
  let busy = false;
  // Students: the class code and username from their login card.
  let classCode = "";
  let username = "";
  let problem = oauthProblem();
  let notice = "";

  /** Back from Google or ClassLink with an error (Better Auth adds ?error=). */
  function oauthProblem(): string {
    const err = params.get("error");
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
    const url = new URL(location.href);
    if (m === "signin") url.searchParams.delete("mode");
    else url.searchParams.set("mode", m);
    url.searchParams.delete("error");
    history.replaceState(null, "", url);
  }

  /** `path` with ?welcome=1 added: the page it lands on says hello once (WelcomeNote). */
  function withWelcome(path: string) {
    const url = new URL(path, location.origin);
    url.searchParams.set("welcome", "1");
    return url.pathname + url.search + url.hash;
  }

  async function submit() {
    busy = true;
    problem = "";
    notice = "";
    try {
      if (mode === "student") {
        const joinCode = normalizeJoinCode(classCode);
        if (!isJoinCode(joinCode)) {
          problem = "Check your class code. It looks like KTZ-482.";
          return;
        }
        const { error } = await authClient.signIn.username({
          username: studentLoginName(joinCode, username.trim().toLowerCase()),
          password,
        });
        if (error) problem = "That class code, username and password do not match. Check your login card.";
        // A student starts from their assignments, unless they were sent somewhere.
        else window.location.href = safeNext(params.get("next"), "/account");
      } else if (mode === "signin") {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: next });
        if (error) problem = error.message ?? "Could not sign in.";
        else window.location.href = next;
      } else if (mode === "signup") {
        const { error } = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0],
          email,
          password,
          // Where the confirmation link lands: the plan, where the free month starts.
          callbackURL: "/account?confirmed=1#plan",
        });
        if (error) problem = error.message ?? "Could not create the account.";
        else {
          // A welcome on the page it lands on (WelcomeNote), with the address the link went to.
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
    const to = student ? safeNext(params.get("next"), "/account") : next;
    const { error } = await authClient.signIn.social({
      provider: provider as "google",
      callbackURL: to,
      // A new account says hello on arrival, as an email sign-up does.
      newUserCallbackURL: student ? to : withWelcome(to),
      errorCallbackURL: `/login?mode=${mode}`,
      requestSignUp: provider === "classlink" || !student,
    });
    // On success the browser is already on its way.
    if (error) {
      problem = error.message ?? "Could not reach the sign-in page.";
      busy = false;
    }
  }

  $: until = freeMonthUntil
    ? new Date(freeMonthUntil).toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" })
    : null;

  const heading = {
    signin: ["Welcome back", "Sign in to pick up where you left off."],
    signup: ["Create your free account", "One minute, and your settings follow you everywhere."],
    student: ["Student sign in", "Use the login card from your teacher."],
    forgot: ["Reset your password", "We will email you a link to choose a new one."],
  } as const;

  const tabs = [
    { id: "signin", label: "Sign in" },
    { id: "signup", label: "Create account" },
    { id: "student", label: "Student" },
  ] as const;

  const input =
    "w-full border border-sr-hairline bg-sr-raise text-sr-ink rounded-[14px] px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-sr-action";
</script>

<div class="wrap" class:split={mode === "signup"}>
  {#if mode === "signup"}
    <!-- What the account gives: the free month while it is on, the free plan otherwise. -->
    <aside class="pitch">
      {#if freeMonth}
        <p class="badge"><Sparkles size={14} aria-hidden="true" /> {until ? `Until ${until}` : "Limited time"}</p>
        <h2 class="font-display text-[28px] sm:text-[34px] leading-[1.1] font-bold">Pro free for a month</h2>
        <p class="text-[15px] leading-relaxed">
          Make a free account, confirm your email, and start a month of Pro. No card, nothing to cancel: after 30 days
          you simply go back to the free plan.
        </p>
        <ul class="perks">
          <li><span class="ic"><InfinityIcon size={18} /></span><span><strong>Unlimited exercises</strong> at every level, Unison and Choral</span></li>
          <li><span class="ic"><Mic size={18} /></span><span><strong>Listen and grade:</strong> sing it and see every note marked</span></li>
          <li><span class="ic"><Gauge size={18} /></span><span><strong>abcTuner</strong> and the tools beside the music: tuner, metronome, drone</span></li>
          <li><span class="ic"><Cloud size={18} /></span><span><strong>Your presets</strong> on every device you sign in on</span></li>
        </ul>
        <ol class="steps" aria-label="How it works">
          <li><b>1</b>Create your account</li>
          <li><b>2</b>Confirm your email</li>
          <li><b>3</b>Start your month</li>
        </ol>
      {:else}
        <h2 class="font-display text-[28px] sm:text-[34px] leading-[1.1] font-bold">Free, and yours everywhere</h2>
        <ul class="perks">
          <li><span class="ic"><InfinityIcon size={18} /></span><span><strong>{GENERATION_LIMITS.free} exercises a month</strong>, free for good</span></li>
          <li><span class="ic"><Cloud size={18} /></span><span><strong>Your presets</strong> on every device you sign in on</span></li>
          <li><span class="ic"><Gauge size={18} /></span><span><strong>Courses and class checklists</strong>: see which step each choir has passed</span></li>
        </ul>
      {/if}
    </aside>
  {/if}

  <div class="card">
    <header class="flex flex-col gap-1">
      <h1 class="font-display text-2xl font-bold text-sr-ink">{heading[mode][0]}</h1>
      <p class="text-sm text-sr-muted">{heading[mode][1]}</p>
    </header>

    {#if code && mode !== "student"}
      <p class="codebox" role="status">
        <Ticket size={18} aria-hidden="true" class="shrink-0" />
        <span>Your code <strong class="tracking-wide">{code}</strong> is ready. {mode === "signin" ? "Sign in" : "Create your account"} and it is applied straight away.</span>
      </p>
    {/if}

    {#if mode !== "forgot"}
      <div class="tabs" role="tablist" aria-label="How to sign in">
        {#each tabs as t}
          <button type="button" role="tab" aria-selected={mode === t.id} class:on={mode === t.id} on:click={() => setMode(t.id)}>{t.label}</button>
        {/each}
      </div>
    {/if}

    {#if (googleEnabled || classlinkEnabled) && mode !== "forgot"}
      <div class="flex flex-col gap-2">
        {#if googleEnabled}
          <button type="button" class="social" on:click={() => social("google")} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            {mode === "student" ? "Sign in with Google" : mode === "signup" ? "Sign up with Google" : "Continue with Google"}
          </button>
        {/if}
        {#if classlinkEnabled}
          <button type="button" class="social" on:click={() => social("classlink")} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2c8bd1" /><path d="M8.5 12a3.5 3.5 0 0 1 6-2.45M15.5 12a3.5 3.5 0 0 1-6 2.45" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" /></svg>
            Sign in with ClassLink
          </button>
        {/if}
      </div>
      <div class="flex items-center gap-3 text-xs text-sr-faint">
        <span class="flex-1 border-t border-sr-hairline"></span>{mode === "student" ? "or use your login card" : "or with email"}<span class="flex-1 border-t border-sr-hairline"></span>
      </div>
    {/if}

    <form class="flex flex-col gap-3.5" on:submit|preventDefault={submit}>
      {#if mode === "student"}
        <label class="field">
          <span>Class code</span>
          <input class="{input} uppercase tracking-widest" type="text" bind:value={classCode} placeholder="KTZ-482" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" required />
        </label>
        <label class="field">
          <span>Username</span>
          <input class={input} type="text" bind:value={username} autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required />
        </label>
      {/if}
      {#if mode === "signup"}
        <label class="field">
          <span>Your name <em>optional</em></span>
          <input class={input} type="text" bind:value={name} autocomplete="name" maxlength="80" />
        </label>
      {/if}
      {#if mode !== "student"}
        <label class="field">
          <span>Email</span>
          <input class={input} type="email" bind:value={email} autocomplete="email" required />
        </label>
      {/if}
      {#if mode !== "forgot"}
        <label class="field">
          <span>Password</span>
          <span class="relative">
            {#if showPassword}
              <input class="{input} pr-12" type="text" bind:value={password} autocomplete={mode === "signup" ? "new-password" : "current-password"} minlength={mode === "student" ? 1 : 8} maxlength="128" required />
            {:else}
              <input class="{input} pr-12" type="password" bind:value={password} autocomplete={mode === "signup" ? "new-password" : "current-password"} minlength={mode === "student" ? 1 : 8} maxlength="128" required />
            {/if}
            <button type="button" class="peek" on:click={() => (showPassword = !showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
              {#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
            </button>
          </span>
          {#if mode === "signup"}<small>At least 8 characters.</small>{/if}
        </label>
        {#if mode === "signin"}
          <button type="button" class="text-sm text-sr-muted underline self-end -mt-1" on:click={() => setMode("forgot")}>Forgot your password?</button>
        {/if}
      {/if}

      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}

      <button class="sr-btn w-full py-3 text-base" type="submit" disabled={busy}>
        {busy ? "One moment…" : mode === "signin" || mode === "student" ? "Sign in" : mode === "signup" ? (freeMonth ? "Create my free account" : "Create account") : "Send reset link"}
      </button>
    </form>

    {#if mode === "signup"}
      <p class="text-xs text-sr-muted text-center">By creating an account you agree to our <a class="underline" href="/terms">terms</a> and <a class="underline" href="/privacy">privacy policy</a>.</p>
    {:else if mode === "student"}
      <p class="text-sm text-sr-muted text-center">Forgot your password? Ask your teacher for a new one.</p>
      <a class="text-sm text-sr-muted underline self-center" href="/join">Have a class code but no account? Join a class</a>
    {:else if mode === "forgot"}
      <button type="button" class="text-sm text-sr-muted underline self-center" on:click={() => setMode("signin")}>Back to sign in</button>
    {:else}
      <p class="text-sm text-sr-muted text-center">New here? <button type="button" class="underline font-bold text-sr-ink-2" on:click={() => setMode("signup")}>Create a free account</button></p>
    {/if}
  </div>
</div>

<style>
  .wrap {
    width: 100%;
    max-width: 28rem;
    display: grid;
    gap: 1.25rem;
  }
  .wrap.split {
    max-width: 58rem;
  }
  @media (min-width: 860px) {
    .wrap.split {
      grid-template-columns: 1fr 1fr;
      align-items: stretch;
    }
  }
  .pitch {
    background: var(--sr-sky);
    color: var(--sr-sky-ink);
    border-radius: var(--sr-r-lg);
    padding: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .badge {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .perks {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    margin-top: 0.25rem;
    font-size: 0.95rem;
    line-height: 1.4;
  }
  .perks li {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
  }
  .ic {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: var(--sr-panel);
    color: var(--sr-action-fg);
  }
  .steps {
    display: none;
    margin-top: auto;
    gap: 0.5rem;
    padding-top: 1rem;
  }
  @media (min-width: 860px) {
    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .steps li {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--sr-panel);
    color: var(--sr-ink);
    border-radius: var(--sr-r-md);
    padding: 0.75rem;
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1.25;
  }
  .steps b {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    background: var(--sr-action);
    color: var(--sr-action-ink);
    font-size: 0.8rem;
  }
  .card {
    background: var(--sr-panel);
    border-radius: var(--sr-r-lg);
    box-shadow: var(--sr-card-shadow);
    border: 1px solid var(--sr-hairline);
    padding: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }
  @media (max-width: 480px) {
    .pitch,
    .card {
      padding: 1.25rem;
    }
  }
  .codebox {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    background: var(--sr-butter);
    color: var(--sr-butter-ink);
    border-radius: var(--sr-r-md);
    padding: 0.75rem 0.9rem;
    font-size: 0.875rem;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 5px;
    background: var(--sr-track);
    border-radius: 999px;
  }
  .tabs button {
    flex: 1;
    border-radius: 999px;
    padding: 0.5rem 0.5rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--sr-muted);
    white-space: nowrap;
  }
  .tabs button:hover {
    color: var(--sr-ink);
  }
  .tabs button.on {
    background: var(--sr-action);
    color: var(--sr-action-ink);
    font-weight: 800;
  }
  .tabs button:focus-visible,
  .peek:focus-visible,
  .social:focus-visible {
    outline: 2px solid var(--sr-action);
    outline-offset: 2px;
  }
  .social {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.7rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-raise);
    color: var(--sr-ink);
    font-weight: 700;
    font-size: 0.95rem;
  }
  .social:hover:not(:disabled) {
    background: var(--sr-tint);
  }
  .social:disabled {
    opacity: 0.5;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--sr-ink-2);
  }
  .field em {
    font-style: normal;
    font-weight: 600;
    color: var(--sr-faint);
    margin-left: 0.35rem;
  }
  .field small {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--sr-faint);
  }
  .peek {
    position: absolute;
    right: 0.35rem;
    top: 50%;
    transform: translateY(-50%);
    width: 2.5rem;
    height: 2.5rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--sr-muted);
  }
  .peek:hover {
    color: var(--sr-ink);
    background: var(--sr-track);
  }
</style>
