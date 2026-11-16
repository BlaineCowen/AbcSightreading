<script lang="ts">
  import { apiGet } from "../lib/api-get";
  import { onMount } from "svelte";
  import { X } from "lucide-svelte";
  import { GENERATION_LIMITS } from "../lib/plan";
  import { signedInUser } from "../lib/auth-client";
  import { isJoinCode, joinCodeHint, normalizeJoinCode } from "../lib/join-code";
  import { roleQuestion } from "../lib/role-question";

  /**
   * Once, just after sign-up: what the account gives, and the one step to the
   * free month of Pro while it is on offer (confirm the email, or for a Google
   * account, which arrives confirmed, start it). An email sign-up leaves the
   * address in sessionStorage ("sr-welcome"); a new Google account arrives
   * with ?welcome=1 (AuthForm's newUserCallbackURL). This takes either, once.
   *
   * Before that, "Are you a student or a teacher?" for an ordinary account in
   * no class and teaching no one (/api/role-check): students who signed in
   * with their school's Google got an account outside every class, unseen by
   * their teacher (S&S CISD, 10 to 12 November 2026, Blaine: "we need to do
   * the question"). A student types the class code here and joins; a teacher
   * goes on to the welcome. The answer is kept in this browser per account
   * (localStorage "sr-role:<id>"); closing it only hides it for this tab.
   */
  let email: string | null = null;
  type Status = { ok: boolean; offer: boolean; step?: string };
  let fm: Status | null = null;

  type Stage = "none" | "ask" | "code" | "joined" | "later";
  let stage: Stage = "none";
  let studentFirst = false;
  let roleKey = "";
  let code = "";
  let busy = false;
  let problem = "";
  let joined = "";

  const store = {
    get: (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } },
    set: (s: Storage, k: string, v: string) => { try { s.setItem(k, v); } catch {} },
  };

  onMount(async () => {
    try {
      email = sessionStorage.getItem("sr-welcome");
      if (email !== null) sessionStorage.removeItem("sr-welcome");
    } catch {}
    const url = new URL(location.href);
    if (url.searchParams.get("welcome") === "1") {
      email ??= "";
      url.searchParams.delete("welcome");
      history.replaceState(history.state, "", url);
    }
    const welcome = email !== null;
    // Hold the welcome until the question is settled, so the two never overlap.
    const held = email;
    email = null;

    const user = await signedInUser();
    if (user?.accountType === "standard") {
      roleKey = `sr-role:${user.id}`;
      const known = store.get(localStorage, roleKey);
      if (known === "teacher" || known === "student") roleQuestion.set(known);
      if (!known && !store.get(sessionStorage, roleKey)) {
        const res = await fetch("/api/role-check").catch(() => null);
        const data = res?.ok ? await res.json().catch(() => null) : null;
        if (data?.ask) {
          studentFirst = !!data.studentFirst;
          pendingWelcome = welcome ? held : null;
          stage = "ask";
          roleQuestion.set("asking");
          return;
        }
        if (data) store.set(localStorage, roleKey, "placed");
      }
    }
    roleQuestion.update((r) => (r === "pending" ? "none" : r));
    if (welcome) showWelcome(held);
  });

  let pendingWelcome: string | null = null;

  async function showWelcome(address: string | null) {
    email = address ?? "";
    const res = await apiGet("/api/free-month").catch(() => null);
    fm = res?.ok ? await res.json() : null;
  }

  function teacher() {
    store.set(localStorage, roleKey, "teacher");
    roleQuestion.set("teacher");
    stage = "none";
    if (pendingWelcome !== null) showWelcome(pendingWelcome);
  }

  function student() {
    roleQuestion.set("student");
    stage = "code";
    problem = "";
  }

  function noCode() {
    // Asked again next visit: the student still needs to join.
    store.set(sessionStorage, roleKey, "later");
    stage = "later";
  }

  function close() {
    store.set(sessionStorage, roleKey, "closed");
    stage = "none";
  }

  $: codeOk = isJoinCode(normalizeJoinCode(code));
  $: codeHint = joinCodeHint(code);

  async function join() {
    busy = true;
    problem = "";
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 404 can reach here as the site's 404 page, not the JSON (Astro), so name it from the status.
        problem = data?.error ?? (res.status === 404 ? "No class has that code. Check it with your teacher." : "Could not join.");
        return;
      }
      store.set(localStorage, roleKey, "student");
      joined = data.joined;
      stage = "joined";
    } catch {
      problem = "Could not reach the server.";
    } finally {
      busy = false;
    }
  }

  const input =
    "w-full border border-sr-hairline bg-sr-raise text-sr-ink rounded-[14px] px-3.5 py-2.5 text-base uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-sr-action";
</script>

{#if stage !== "none"}
  <div class="fixed z-40 left-3 right-3 top-20 sm:left-auto sm:right-6 sm:w-[380px] rounded-[22px] bg-sr-sky text-sr-sky-ink shadow-xl p-5 flex gap-3 items-start" role="dialog" aria-labelledby="role-q">
    <div class="flex-1 text-sm flex flex-col gap-3">
      {#if stage === "ask"}
        <p id="role-q" class="font-display text-lg font-bold leading-tight">Are you a student or a teacher?</p>
        <!-- The likelier answer first (a guess from the name and address, student-guess.ts). -->
        <div class="flex gap-2 flex-wrap">
          {#if studentFirst}
            <button type="button" class="sr-btn text-sm" on:click={student}>I'm a student</button>
            <button type="button" class="sr-btn-quiet text-sm" on:click={teacher}>I'm a teacher</button>
          {:else}
            <button type="button" class="sr-btn text-sm" on:click={teacher}>I'm a teacher</button>
            <button type="button" class="sr-btn-quiet text-sm" on:click={student}>I'm a student</button>
          {/if}
        </div>
      {:else if stage === "code"}
        <p id="role-q" class="font-display text-lg font-bold leading-tight">Join your class</p>
        <form class="flex flex-col gap-2" on:submit|preventDefault={join}>
          <label class="flex flex-col gap-1.5 font-bold">
            Class code from your teacher
            <!-- svelte-ignore a11y-autofocus -->
            <input class={input} bind:value={code} on:input={() => (problem = "")} placeholder="KTZ-482" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" autofocus required />
          </label>
          {#if codeHint}<span class="text-xs font-medium text-sr-danger" role="status">{codeHint}</span>{/if}
          {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
          <div class="flex gap-2 items-center flex-wrap">
            <button class="sr-btn text-sm" type="submit" disabled={busy || !codeOk}>Join the class</button>
            <button type="button" class="underline text-xs opacity-80" on:click={noCode}>I don't have a code yet</button>
          </div>
        </form>
      {:else if stage === "joined"}
        <p id="role-q" class="font-display text-lg font-bold leading-tight">You're in {joined}!</p>
        <p>Your teacher can see your practice now.</p>
        <a class="sr-btn text-sm self-start" href="/account">See your class</a>
      {:else}
        <p id="role-q" class="font-display text-lg font-bold leading-tight">Ask your teacher for the class code</p>
        <p>It looks like KTZ-482. Once you have it, you can join at <a class="underline" href="/join">abc-sightreading.com/join</a>, or here next time you visit.</p>
      {/if}
    </div>
    {#if stage !== "code" || !busy}
      <button type="button" class="p-1 opacity-70 hover:opacity-100" on:click={close} aria-label="Close">
        <X size={14} />
      </button>
    {/if}
  </div>
{/if}

{#if email !== null}
  <div class="fixed z-40 left-3 right-3 top-20 sm:left-auto sm:right-6 sm:w-[380px] rounded-[22px] bg-sr-mint text-sr-mint-ink shadow-xl p-5 flex gap-3 items-start" role="status">
    <div class="flex-1 text-sm flex flex-col gap-2">
      <p class="font-display text-lg font-bold leading-tight">Welcome to abcSightReading!</p>
      {#if fm?.offer && fm.ok}
        <p>Your free month of Pro is ready: unlimited exercises, Listen and grade, and the practice tools. No card needed.</p>
        <a class="sr-btn text-sm self-start" href="/account#plan">Start my free month</a>
      {:else if fm?.offer && fm.step === "confirm"}
        <p>
          One step to your free month of Pro: open the link we sent to
          {#if email}<strong class="break-all">{email}</strong>{:else}your inbox{/if}.
        </p>
        <p>Everything works in the meantime, with {GENERATION_LIMITS.free} exercises a month.</p>
      {:else}
        <p>Your account gives you {GENERATION_LIMITS.free} exercises a month, and your presets now follow you to any device.</p>
        {#if email}
          <p>We sent a link to <strong class="break-all">{email}</strong> to confirm your address. Everything works in the meantime.</p>
        {/if}
      {/if}
    </div>
    <button type="button" class="p-1 opacity-70 hover:opacity-100" on:click={() => (email = null)} aria-label="Close">
      <X size={14} />
    </button>
  </div>
{/if}
