<script lang="ts">
  import { onMount } from "svelte";
  import { MAX_PACKS, MAX_RECIPIENTS, INVOICE_DAYS } from "../lib/quote";
  import { billingStatus } from "../lib/billing-client";

  /**
   * Paying by a school purchase order. The teacher picks the plan, fills in
   * the school, and gives up to three purchasing addresses: one click sends
   * them the numbered PDF quote, with the teacher copied. When the PO comes
   * back its number goes in here; the plan starts, and the invoice goes to the
   * school, due in 30 days. Unpaid by then, the plan ends
   * (src/lib/server/quotes.ts).
   */
  export let educatorOnSale = false;

  type Quote = {
    id: string;
    number: string | null;
    plan: "pro" | "educator";
    school: string;
    contactEmail: string;
    sendTo: string[];
    packs: number;
    taxExempt: boolean;
    renews: boolean;
    amountTotal: number;
    status: "open" | "accepted" | "canceled" | "expired";
    expiresAt: number;
    poNumber: string | null;
    invoiceUrl: string | null;
    invoiceDueAt: number | null;
    paidAt: number | null;
    lapsedAt: number | null;
  };

  let quotes: Quote[] = [];
  let currentPlan: "free" | "pro" | "educator" | null = null;
  /** The current plan will not renew (one year only, renewal off, a code): it may be renewed by a new quote. */
  let wontRenew = false;
  let open = false;
  let busy = false;
  let problem = "";
  let notice = "";

  let form = {
    plan: "pro" as "pro" | "educator",
    school: "",
    district: "",
    contactName: "",
    sendTo: ["", "", ""],
    address: { line1: "", line2: "", city: "", state: "TX", postalCode: "" },
    packs: 0,
    taxExempt: true,
    /** One year only unless they ask for yearly renewal: many districts buy a year at a time. */
    renews: false,
  };
  let po: Record<string, string> = {};

  async function load() {
    const res = await fetch("/api/quotes");
    if (res.ok) quotes = await res.json();
  }
  onMount(async () => {
    load();
    const status = await billingStatus();
    currentPlan = status?.plan ?? "free";
    wontRenew = status?.subscription ? status.subscription.cancelAtPeriodEnd : status?.via === "code";
    // ?renew=<quote id>: a renewal quote filled in from that one (the email and the banner link here).
    const renew = new URLSearchParams(location.search).get("renew");
    if (renew) await startRenewal(renew);
    else if (location.hash === "#quote") open = true;
  });

  async function call(path: string, init: RequestInit) {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `The server said ${res.status}.`);
    return body;
  }

  /** Fill the form from an earlier quote (the school, contact, address, plan and seats), ready to send again. */
  async function startRenewal(id: string) {
    problem = notice = "";
    try {
      const prior = await call(`/api/quotes/${id}/renewal`, { method: "GET" });
      const sendTo = [...prior.sendTo, "", "", ""].slice(0, MAX_RECIPIENTS);
      form = { ...form, ...prior, sendTo, address: { ...form.address, ...prior.address } };
      open = true;
      notice = "This renewal quote is filled in from last year's. Check it and send it to purchasing. The new year starts the day you enter its PO, so enter it when your current year ends.";
      document.getElementById("quote")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  async function sendQuote() {
    busy = true;
    problem = notice = "";
    try {
      const body = { ...form, sendTo: form.sendTo.map((e) => e.trim()).filter(Boolean), packs: form.plan === "pro" ? 0 : form.packs };
      const q: Quote = await call("/api/quotes", { method: "POST", body: JSON.stringify(body) });
      quotes = [q, ...quotes];
      open = false;
      notice = `Quote ${q.number} is on its way to ${q.sendTo.join(", ")}, with a copy to you. When they send the PO number, enter it below.`;
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not send the quote.";
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
  const input = "w-full rounded-[14px] border-2 border-sr-hairline bg-sr-raise text-sr-ink text-sm px-3 py-2";
  $: total = form.plan === "pro" ? 1999 : 9900 + form.packs * 2500;
  // Who can ask: Pro for anyone on the free plan, Educator (while on sale) for anyone short of it.
  $: canPro = currentPlan === "free" || (currentPlan === "pro" && wontRenew);
  $: canEducator = educatorOnSale && (currentPlan !== "educator" || wontRenew);
  $: if (!canPro && canEducator) form.plan = "educator";
  $: shown = quotes.length > 0 || canPro || canEducator;
</script>

{#if currentPlan !== null && shown}
<section id="quote" class="w-full max-w-md sr-panel p-6 flex flex-col gap-4">
  <div class="flex flex-col gap-1">
    <h2 class="text-lg font-semibold text-sr-ink">Pay with a school purchase order</h2>
    <p class="text-sm text-sr-ink-2">
      Send a quote straight to your purchasing office. When they send the PO number, enter it here: the plan starts
      right away, and the invoice goes to the school, due in {INVOICE_DAYS} days. If it is not paid by then, the plan ends.
    </p>
  </div>

  {#if notice}<p class="text-sm font-semibold rounded-[18px] bg-sr-mint text-sr-mint-ink px-4 py-3" role="status">{notice}</p>{/if}
  {#if problem}<p class="text-sm font-semibold rounded-[18px] bg-sr-danger-bg text-sr-danger px-4 py-3" role="alert">{problem}</p>{/if}

  {#each quotes as q (q.id)}
    <div class="rounded-[18px] bg-sr-track p-4 flex flex-col gap-2 text-sm">
      <div class="flex justify-between gap-2">
        <span class="font-extrabold text-sr-ink">{q.number ?? "Quote"} · {q.plan === "pro" ? "Pro" : "Educator"}</span>
        <span class="tabular-nums text-sr-ink-2 font-bold">{dollars(q.amountTotal)}</span>
      </div>
      <p class="text-sr-muted">
        {q.school}{q.plan === "educator" && q.packs ? ` · ${100 + q.packs * 25} seats` : ""}{q.taxExempt ? " · tax-exempt" : ""}<br />
        Sent to {q.sendTo.join(", ")}
      </p>
      <p class="font-semibold">
        {#if q.status === "open"}
          <span class="text-sr-ink-2">Waiting for the PO · good until {day(q.expiresAt)}</span>
        {:else if q.status === "accepted" && q.lapsedAt}
          <span class="text-sr-danger">PO {q.poNumber} · ended {day(q.lapsedAt)}, unpaid</span>
        {:else if q.status === "accepted" && q.paidAt}
          <span class="text-sr-mint-ink rounded-full bg-sr-mint px-2.5 py-0.5">PO {q.poNumber} · paid</span>
        {:else if q.status === "accepted"}
          <span class="text-sr-ink-2">PO {q.poNumber} · invoice due {q.invoiceDueAt ? day(q.invoiceDueAt) : "in 30 days"}</span>
        {:else}
          <span class="text-sr-muted">{q.status === "expired" ? "Expired" : "Cancelled"}</span>
        {/if}
      </p>
      <div class="flex flex-wrap gap-3 items-center">
        <a class="underline font-bold text-sr-action-fg" href="/api/quotes/{q.id}/pdf" target="_blank" rel="noopener">Quote PDF</a>
        {#if q.invoiceUrl}<a class="underline font-bold text-sr-action-fg" href={q.invoiceUrl} target="_blank" rel="noopener">Invoice</a>{/if}
        {#if q.status === "open"}
          <button class="text-sr-muted underline" on:click={() => cancel(q)}>Cancel quote</button>
        {/if}
        {#if q.status === "accepted" && !q.renews}
          <span class="text-sr-muted">One year only</span>
          <button class="underline font-bold text-sr-action-fg" on:click={() => startRenewal(q.id)}>Renewal quote</button>
        {:else if q.status === "accepted"}
          <span class="text-sr-muted">Renews each year by invoice</span>
        {/if}
      </div>
      {#if q.status === "open"}
        <form class="flex gap-2 items-center" on:submit|preventDefault={() => accept(q)}>
          <label class="sr-only" for="po-{q.id}">PO number</label>
          <input id="po-{q.id}" class={input} placeholder="PO number" bind:value={po[q.id]} maxlength="40" />
          <button class="sr-btn text-sm shrink-0" disabled={busy || !po[q.id]?.trim()}>Start {q.plan === "pro" ? "Pro" : "Educator"}</button>
        </form>
      {/if}
    </div>
  {/each}

  {#if canPro || canEducator}
    {#if !open}
      <button class="sr-btn text-sm self-start" on:click={() => (open = true)}>Send a quote</button>
    {:else}
      <form class="flex flex-col gap-3" on:submit|preventDefault={sendQuote}>
        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-bold text-sr-ink mb-1">Plan</legend>
          <div class="flex gap-2 flex-wrap">
            {#if canPro}
              <button type="button" class="sr-tok {form.plan === 'pro' ? 'sr-on' : ''}" on:click={() => (form.plan = "pro")} aria-pressed={form.plan === "pro"}>Pro · $19.99 a year</button>
            {/if}
            {#if canEducator}
              <button type="button" class="sr-tok {form.plan === 'educator' ? 'sr-on' : ''}" on:click={() => (form.plan = "educator")} aria-pressed={form.plan === "educator"}>Educator · $99 a year</button>
            {:else if !educatorOnSale}
              <span class="sr-tok sr-outside" aria-disabled="true">Educator · coming soon</span>
            {/if}
          </div>
        </fieldset>

        <label class="text-sm font-bold text-sr-ink flex flex-col gap-1">School <input class={input} bind:value={form.school} required placeholder="Lincoln Middle School" /></label>
        <label class="text-sm font-bold text-sr-ink flex flex-col gap-1">District <span class="text-xs font-semibold text-sr-muted">if the district pays, the quote is made out to it</span><input class={input} bind:value={form.district} placeholder="Springfield ISD" /></label>
        <label class="text-sm font-bold text-sr-ink flex flex-col gap-1">Purchasing contact <input class={input} bind:value={form.contactName} required placeholder="Their name" /></label>

        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-bold text-sr-ink mb-1">
            Send it to
            <span class="block text-xs font-semibold text-sr-muted">Up to {MAX_RECIPIENTS} addresses. The first gets the invoice. You get a copy, and their replies come to you.</span>
          </legend>
          {#each form.sendTo as _, i}
            <input class={input} type="email" bind:value={form.sendTo[i]} required={i === 0} placeholder={i === 0 ? "purchasing@yourdistrict.org" : "another address (optional)"} aria-label="Email {i + 1}" />
          {/each}
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-bold text-sr-ink mb-1">Billing address</legend>
          <input class={input} bind:value={form.address.line1} required placeholder="Street" aria-label="Street" />
          <input class={input} bind:value={form.address.line2} placeholder="Suite, building (optional)" aria-label="Address line 2" />
          <div class="flex gap-2">
            <input class={input} bind:value={form.address.city} required placeholder="City" aria-label="City" />
            <input class="{input} !w-16" bind:value={form.address.state} required maxlength="2" aria-label="State" />
            <input class="{input} !w-28" bind:value={form.address.postalCode} required placeholder="ZIP" aria-label="ZIP" />
          </div>
        </fieldset>

        {#if form.plan === "educator"}
          <label class="text-sm font-bold text-sr-ink flex items-center gap-2">
            Extra seats
            <select class="rounded-full bg-sr-track text-sr-ink text-sm px-3 py-1.5" bind:value={form.packs}>
              {#each Array.from({ length: Math.min(MAX_PACKS, 20) + 1 }, (_, i) => i) as n}
                <option value={n}>{n === 0 ? "none (100 students)" : `+${n * 25} (${100 + n * 25} students)`}</option>
              {/each}
            </select>
          </label>
        {/if}

        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-bold text-sr-ink mb-1">Length</legend>
          <div class="flex gap-2 flex-wrap">
            <button type="button" class="sr-tok {!form.renews ? 'sr-on' : ''}" on:click={() => (form.renews = false)} aria-pressed={!form.renews}>One year only</button>
            <button type="button" class="sr-tok {form.renews ? 'sr-on' : ''}" on:click={() => (form.renews = true)} aria-pressed={form.renews}>Renew each year</button>
          </div>
          <p class="text-xs text-sr-muted">
            {form.renews
              ? "The school is invoiced again each year until it cancels."
              : "Nothing renews. A month before the year ends you get a reminder and a renewal quote ready to send."}
          </p>
        </fieldset>

        <label class="text-sm text-sr-ink-2 flex items-start gap-2">
          <input type="checkbox" class="sr-check mt-1" bind:checked={form.taxExempt} />
          <span><strong class="text-sr-ink">Tax-exempt public school or district</strong> <span class="block text-xs text-sr-muted">They send their exemption certificate with the PO (Texas: Form 01-339).</span></span>
        </label>

        <p class="text-sm text-sr-ink"><strong>{dollars(total)}</strong> for one year{form.renews ? ", renewing yearly" : ""}{form.taxExempt ? ", tax-exempt" : ", any sales tax included"}. Due {INVOICE_DAYS} days after you enter the PO.</p>
        <div class="flex gap-3 items-center">
          <button class="sr-btn text-sm" disabled={busy}>{busy ? "Sending…" : "Send the quote"}</button>
          <button type="button" class="text-sm font-bold text-sr-muted underline" on:click={() => (open = false)}>Not now</button>
        </div>
      </form>
    {/if}
  {/if}
</section>
{/if}
