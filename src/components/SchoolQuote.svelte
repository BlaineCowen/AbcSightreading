<script lang="ts">
  import { onMount } from "svelte";
  import { MAX_PACKS } from "../lib/quote";

  /**
   * Quotes for a school's purchasing office. The teacher fills in the school
   * and who buys for it; Stripe makes a numbered PDF quote, which is emailed to
   * the teacher and kept here. When the purchase order comes back, its number
   * goes in here: the Educator plan starts, and the invoice goes to the school.
   */

  type Quote = {
    id: string;
    number: string | null;
    school: string;
    contactEmail: string;
    packs: number;
    taxExempt: boolean;
    amountTotal: number;
    status: "open" | "accepted" | "canceled" | "expired";
    expiresAt: number;
    poNumber: string | null;
    invoiceUrl: string | null;
  };

  let quotes: Quote[] = [];
  let open = false;
  let busy = false;
  let problem = "";
  let notice = "";

  let form = {
    school: "",
    district: "",
    contactName: "",
    contactEmail: "",
    address: { line1: "", line2: "", city: "", state: "TX", postalCode: "" },
    packs: 0,
    taxExempt: true,
  };
  let po: Record<string, string> = {};

  async function load() {
    const res = await fetch("/api/quotes");
    if (res.ok) quotes = await res.json();
  }
  onMount(() => {
    load();
    if (location.hash === "#quote") open = true;
  });

  async function call(path: string, init: RequestInit) {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `The server said ${res.status}.`);
    return body;
  }

  async function requestQuote() {
    busy = true;
    problem = notice = "";
    try {
      const q: Quote = await call("/api/quotes", { method: "POST", body: JSON.stringify(form) });
      quotes = [q, ...quotes];
      open = false;
      notice = `Quote ${q.number} is ready - download it below. A copy is on its way to your email.`;
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not make the quote.";
    }
    busy = false;
  }

  async function accept(q: Quote) {
    busy = true;
    problem = notice = "";
    try {
      await call(`/api/quotes/${q.id}`, { method: "POST", body: JSON.stringify({ poNumber: po[q.id] ?? "" }) });
      // The plan changed: the rest of the page (students, classes) needs it.
      location.hash = "plan";
      location.reload();
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not use that PO.";
      busy = false;
    }
  }

  async function cancel(q: Quote) {
    problem = "";
    try {
      await call(`/api/quotes/${q.id}`, { method: "DELETE" });
      q.status = "canceled";
      quotes = quotes;
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not cancel.";
    }
  }

  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const input = "w-full rounded border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-2 py-1.5";
  $: total = 9900 + form.packs * 2500;
</script>

<section id="quote" class="w-full max-w-md bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-4">
  <div class="flex flex-col gap-1">
    <h2 class="text-lg font-semibold text-sr-ink">School purchase orders</h2>
    <p class="text-sm text-sr-muted">
      Get a quote for the Educator plan to send your purchasing office. When the PO comes back, enter its number here:
      the plan starts right away, and the invoice goes to the school, due in 30 days.
    </p>
  </div>

  {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}
  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

  {#each quotes as q (q.id)}
    <div class="rounded-md border border-sr-hairline bg-sr-raise p-3 flex flex-col gap-2 text-sm">
      <div class="flex justify-between gap-2">
        <span class="font-medium text-sr-ink">{q.number ?? "Quote"}</span>
        <span class="tabular-nums text-sr-ink-2">{dollars(q.amountTotal)}</span>
      </div>
      <p class="text-sr-muted">
        {q.school}{q.packs ? ` · ${100 + q.packs * 25} seats` : ""}{q.taxExempt ? " · tax-exempt" : ""} ·
        {#if q.status === "open"}good until {day(q.expiresAt)}
        {:else if q.status === "accepted"}PO {q.poNumber}
        {:else}{q.status}{/if}
      </p>
      <div class="flex flex-wrap gap-3 items-center">
        <a class="underline text-sr-action-fg" href="/api/quotes/{q.id}/pdf" target="_blank" rel="noopener">Quote PDF</a>
        {#if q.invoiceUrl}<a class="underline text-sr-action-fg" href={q.invoiceUrl} target="_blank" rel="noopener">Invoice</a>{/if}
        {#if q.status === "open"}
          <button class="text-sr-muted underline" on:click={() => cancel(q)}>Cancel</button>
        {/if}
      </div>
      {#if q.status === "open"}
        <form class="flex gap-2 items-center" on:submit|preventDefault={() => accept(q)}>
          <label class="sr-only" for="po-{q.id}">PO number</label>
          <input id="po-{q.id}" class={input} placeholder="PO number" bind:value={po[q.id]} maxlength="40" />
          <button class="sr-btn text-sm shrink-0" disabled={busy || !po[q.id]?.trim()}>Start Educator</button>
        </form>
      {/if}
    </div>
  {/each}

  {#if !open}
    <button class="sr-btn-quiet text-sm self-start" on:click={() => (open = true)}>Get a quote</button>
  {:else}
    <form class="flex flex-col gap-3" on:submit|preventDefault={requestQuote}>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">School <input class={input} bind:value={form.school} required /></label>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">District <span class="text-xs text-sr-faint">if the district pays - the quote is made out to it</span><input class={input} bind:value={form.district} placeholder="Springfield ISD" /></label>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Purchasing contact <input class={input} bind:value={form.contactName} required placeholder="Name" /></label>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Their email <span class="text-xs text-sr-faint">the invoice goes here</span><input class={input} type="email" bind:value={form.contactEmail} required /></label>
      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm text-sr-ink-2 mb-1">Billing address</legend>
        <input class={input} bind:value={form.address.line1} required placeholder="Street" aria-label="Street" />
        <input class={input} bind:value={form.address.line2} placeholder="Suite, building (optional)" aria-label="Address line 2" />
        <div class="flex gap-2">
          <input class={input} bind:value={form.address.city} required placeholder="City" aria-label="City" />
          <input class="{input} w-16" bind:value={form.address.state} required maxlength="2" aria-label="State" />
          <input class="{input} w-28" bind:value={form.address.postalCode} required placeholder="ZIP" aria-label="ZIP" />
        </div>
      </fieldset>
      <label class="text-sm text-sr-ink-2 flex items-center gap-2">
        Extra seats
        <select class="rounded border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-1 py-1" bind:value={form.packs}>
          {#each Array.from({ length: Math.min(MAX_PACKS, 20) + 1 }, (_, i) => i) as n}
            <option value={n}>{n === 0 ? "none - 100 students" : `+${n * 25} - ${100 + n * 25} students`}</option>
          {/each}
        </select>
      </label>
      <label class="text-sm text-sr-ink-2 flex items-start gap-2">
        <input type="checkbox" class="mt-1" bind:checked={form.taxExempt} />
        <span>Tax-exempt public school or district <span class="block text-xs text-sr-faint">They send their exemption certificate with the PO (Texas: Form 01-339).</span></span>
      </label>
      <p class="text-sm text-sr-ink">Total {dollars(total)} for one year{form.taxExempt ? ", tax-exempt" : ", any sales tax included"}.</p>
      <div class="flex gap-2">
        <button class="sr-btn text-sm" disabled={busy}>{busy ? "Making the quote…" : "Make the quote"}</button>
        <button type="button" class="text-sm text-sr-muted underline" on:click={() => (open = false)}>Not now</button>
      </div>
    </form>
  {/if}
</section>
