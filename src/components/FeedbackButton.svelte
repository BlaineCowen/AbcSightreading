<script lang="ts">
  /**
   * Tester feedback, with the context already filled in.
   *
   * The report is the easy half. What makes one actionable is knowing which
   * exercise it was about - "the alto goes too low" is unusable, "the alto goes
   * too low, UIL 4, 3-Part Treble, Eb, 16 bars" is a bug I can reproduce. Every
   * setting lives in the URL already, so the page can say all of that for them.
   *
   * Opens a pre-filled email rather than posting anywhere: no backend, no
   * account, nothing to keep running, and the reporter can see exactly what
   * they are sending before it goes.
   */
  export let to: string;
  /** Shown in the panel so a tester knows what is being attached. */
  export let page: string = "";

  let open = false;
  let kind: "bug" | "idea" = "bug";
  let message = "";

  const KINDS: { id: "bug" | "idea"; label: string; prompt: string }[] = [
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

  function send() {
    const body = [
      message.trim() || "(no description)",
      "",
      "--- so this can be reproduced ---",
      context(),
      `Link: ${typeof window !== "undefined" ? window.location.href : ""}`,
      `Browser: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
      `Screen: ${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : ""}`,
    ].join("\n");
    const subject = kind === "bug" ? "Sight Reading: something is wrong" : "Sight Reading: an idea";
    window.location.href =
      `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    open = false;
    message = "";
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
    on:click|self={() => (open = false)}
  >
    <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">Tell me what you found</h2>
          <p class="text-sm text-slate-500">
            This opens an email with your settings attached, so the exercise can
            be reproduced exactly.
          </p>
        </div>
        <button
          class="text-slate-400 hover:text-slate-600 text-xl leading-none"
          on:click={() => (open = false)}
          aria-label="Close"
        >&times;</button>
      </div>

      <div class="flex gap-2">
        {#each KINDS as k}
          <button
            class="px-3 py-2 rounded text-sm {kind === k.id
              ? 'bg-blue-500 text-white'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}"
            on:click={() => (kind = k.id)}
            aria-pressed={kind === k.id}
          >{k.label}</button>
        {/each}
      </div>

      <div class="space-y-2">
        <label class="text-sm text-slate-600" for="feedback-text">{prompt}</label>
        <textarea
          id="feedback-text"
          bind:value={message}
          rows="5"
          class="w-full border border-slate-300 rounded p-2 text-sm"
          placeholder="The tenor line jumped a seventh in bar 3..."
        ></textarea>
      </div>

      {#if context()}
        <details class="text-xs text-slate-500">
          <summary class="cursor-pointer select-none">What gets attached</summary>
          <pre class="mt-2 whitespace-pre-wrap bg-slate-50 rounded p-2">{context()}</pre>
        </details>
      {/if}

      <div class="flex justify-end gap-2">
        <button
          class="px-4 py-2 rounded text-sm bg-slate-100 hover:bg-slate-200"
          on:click={() => (open = false)}
        >Cancel</button>
        <button
          class="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          on:click={send}
          disabled={!message.trim()}
        >Open email</button>
      </div>
    </div>
  </div>
{/if}
