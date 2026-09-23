<script lang="ts">
  /**
   * Tester feedback, with the context already filled in.
   *
   * The report is the easy half. What makes one actionable is knowing which
   * exercise it was about - "the alto goes too low" is unusable, "the alto goes
   * too low, UIL 4, 3-Part Treble, Eb, 16 bars" is a bug I can reproduce. Every
   * setting lives in the URL already, so the page can say all of that for them.
   *
   * The report is POSTed to /api/feedback, which sends the email.
   *
   * It used to open a pre-filled `mailto:` instead, on the reasoning that it
   * needed no backend and the reporter could see what they were sending. What
   * it actually needed was a desktop mail client, and a reporter whose mail is
   * webmail has none: the browser is handed a `mailto:` it cannot open, does
   * nothing, and says nothing. Every one of those reports was lost, silently,
   * including for the person who owns the site. A server that sends the mail
   * asks nothing of the reporter's machine.
   */
  import { composeEmail, type ReportKind } from "../lib/feedback-report";

  /** Shown in the panel so a tester knows what is being attached. */
  export let page: string = "";

  let open = false;
  let kind: ReportKind = "bug";
  let message = "";
  /** idle while typing, sending in flight, then sent or failed. */
  let state: "idle" | "sending" | "sent" | "failed" = "idle";
  let failure = "";
  /** Where to send it by hand, when the server said it could not. */
  let contact = "";
  let copied = false;

  const KINDS: { id: ReportKind; label: string; prompt: string }[] = [
    {
      id: "bug",
      label: "Something is wrong",
      prompt:
        "What happened, and what did you expect instead? If it was about a particular exercise, leaving it on screen means the settings below describe it.",
    },
    {
      id: "idea",
      label: "An idea",
      prompt: "What would make this more useful to you?",
    },
  ];

  $: prompt = KINDS.find((k) => k.id === kind)!.prompt;

  /** The settings as a person would read them, not as query parameters. */
  function context(): string {
    if (typeof window === "undefined") return "";
    const p = new URLSearchParams(window.location.search);
    const say = (label: string, ...keys: string[]) => {
      for (const k of keys) {
        const v = p.get(k);
        if (v) return `${label}: ${decodeURIComponent(v)}`;
      }
      return null;
    };
    const lines = [
      page ? `Page: ${page}` : null,
      say("Level", "preset", "uil"),
      say("Voicing", "voicing", "voices"),
      say("Key", "key"),
      say("Time signature", "timeSig", "timeSignature"),
      say("Measures", "measures"),
      say("Rhythms", "rhythms"),
      say("Tempo", "bpm"),
    ].filter(Boolean);
    return lines.join("\n");
  }

  function report() {
    return {
      kind,
      message: message.trim(),
      context: context(),
      href: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      screen:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : "",
    };
  }

  /** The report as text, for the reporter to copy if sending failed. */
  $: fallbackText = composeEmail({ ...report(), message: message.trim() }).text;

  async function send() {
    if (!message.trim() || state === "sending") return;
    state = "sending";
    failure = "";
    contact = "";
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report()),
      });
      if (res.ok) {
        state = "sent";
        message = "";
        // Left on screen long enough to be read, then out of the way.
        setTimeout(() => {
          if (state === "sent") {
            open = false;
            state = "idle";
          }
        }, 2200);
        return;
      }
      const body = await res.json().catch(() => ({}));
      failure = body?.error ?? `The server answered ${res.status}.`;
      contact = body?.contact ?? "";
      state = "failed";
    } catch (e: any) {
      // Offline, or the request never left. Either way the report is still on
      // screen and can be copied rather than retyped.
      failure = "Could not reach the server.";
      state = "failed";
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(fallbackText);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      copied = false;
    }
  }

  function close() {
    open = false;
    state = "idle";
    failure = "";
  }
</script>

<button
  class="fixed bottom-20 right-4 z-20 px-4 py-2 rounded-full bg-slate-800 text-white text-sm font-medium shadow-lg hover:bg-slate-700 print:hidden"
  on:click={() => (open = !open)}
  aria-expanded={open}
>
  Feedback
</button>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 z-30 bg-black/30 flex items-end sm:items-center justify-center p-4 print:hidden"
    on:click|self={close}
  >
    <div class="bg-sr-raise rounded-lg shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-sr-ink">Tell me what you found</h2>
          <p class="text-sm text-sr-muted">
            This sends me your note with the settings attached, so the exercise
            can be reproduced exactly.
          </p>
        </div>
        <button
          class="text-sr-faint hover:text-sr-ink-2 text-xl leading-none"
          on:click={close}
          aria-label="Close"
        >&times;</button>
      </div>

      {#if state === "sent"}
        <p class="text-sm text-sr-ink py-6 text-center">
          Thank you - that reached me.
        </p>
      {:else}
        <div class="flex gap-2">
          {#each KINDS as k}
            <button
              class="sr-tok px-3 py-2 {kind === k.id ? 'sr-on' : ''}"
              on:click={() => (kind = k.id)}
              aria-pressed={kind === k.id}
              disabled={state === "sending"}
            >{k.label}</button>
          {/each}
        </div>

        <div class="space-y-2">
          <label class="text-sm text-sr-ink-2" for="feedback-text">{prompt}</label>
          <textarea
            id="feedback-text"
            bind:value={message}
            rows="5"
            disabled={state === "sending"}
            class="w-full border border-sr-hairline bg-sr-panel text-sr-ink rounded p-2 text-sm"
            placeholder="The tenor line jumped a seventh in bar 3..."
          ></textarea>
        </div>

        {#if context()}
          <details class="text-xs text-sr-muted">
            <summary class="cursor-pointer select-none">What gets attached</summary>
            <pre class="mt-2 whitespace-pre-wrap bg-sr-track rounded p-2">{context()}</pre>
          </details>
        {/if}

        {#if state === "failed"}
          <!-- The report is not lost because the send was. Show it, so it can
               be copied somewhere rather than typed again. -->
          <div class="space-y-2 text-sm">
            <p class="text-sr-ink">
              That did not send. {failure}
            </p>
            <p class="text-sr-muted text-xs">
              {#if contact}
                Copy your report below and email it to {contact}.
              {:else}
                Copy your report below so it is not lost, and try again in a moment.
              {/if}
            </p>
            <pre class="whitespace-pre-wrap bg-sr-track rounded p-2 text-xs max-h-40 overflow-y-auto">{fallbackText}</pre>
            <button class="sr-btn-quiet px-3 py-1.5 text-xs" on:click={copyReport}>
              {copied ? "Copied" : "Copy report"}
            </button>
          </div>
        {/if}

        <div class="flex justify-end gap-2">
          <button class="sr-btn-quiet px-4 py-2" on:click={close}>Cancel</button>
          <button
            class="sr-btn px-4 py-2 text-sm"
            on:click={send}
            disabled={!message.trim() || state === "sending"}
          >{state === "sending" ? "Sending..." : state === "failed" ? "Try again" : "Send"}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
