<script lang="ts">
  import { onMount } from "svelte";

  /**
   * The owner's codes. Access codes give a plan free for a while (beta
   * testers); affiliate codes give an advertiser's audience a discount and
   * the advertiser a share of each first-year payment, paid out by hand.
   */
  export let origin: string;

  type Code = { id: string; code: string; plan: string; days: number; maxUses: number | null; uses: number; expiresAt: number | null; note: string };
  type Sale = { id: string; amountPaid: number; commission: number; description: string; createdAt: number; paidOutAt: number | null };
  type Affiliate = { id: string; name: string; code: string; percentOff: number; commissionPercent: number; active: boolean; sales: Sale[]; earned: number; owed: number };

  let codes: Code[] = [];
  let affiliates: Affiliate[] = [];
  let problem = "";
  let notice = "";
  let busy = false;
  let open: string | null = null;

  let newCode = { code: "", plan: "educator", days: 365, maxUses: "", expiresAt: "", note: "" };
  let newAff = { name: "", code: "", percentOff: 10, commissionPercent: 20 };

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `The server said ${res.status}.`);
    return body;
  }
  async function load() {
    [codes, affiliates] = await Promise.all([api("/api/admin/codes"), api("/api/admin/affiliates")]);
  }
  onMount(() => load().catch((e) => (problem = e.message)));

  async function run(fn: () => Promise<unknown>, done: string) {
    busy = true;
    problem = notice = "";
    try {
      await fn();
      notice = done;
      await load();
    } catch (e) {
      problem = e instanceof Error ? e.message : "That didn't work.";
    }
    busy = false;
  }

  const makeCode = () =>
    run(() => api("/api/admin/codes", { method: "POST", body: JSON.stringify(newCode) }), `Made ${newCode.code.toUpperCase()}.`).then(() => {
      if (!problem) newCode = { code: "", plan: "educator", days: 365, maxUses: "", expiresAt: "", note: "" };
    });
  const makeAffiliate = () =>
    run(() => api("/api/admin/affiliates", { method: "POST", body: JSON.stringify(newAff) }), `Made ${newAff.code.toUpperCase()} in Stripe.`).then(() => {
      if (!problem) newAff = { name: "", code: "", percentOff: 10, commissionPercent: 20 };
    });
  const markPaid = (a: Affiliate) => {
    if (confirm(`Mark ${dollars(a.owed)} to ${a.name} as paid today?`)) run(() => api(`/api/admin/affiliates/${a.id}`, { method: "PATCH", body: JSON.stringify({ paidOut: true }) }), "Marked paid.");
  };
  const toggle = (a: Affiliate) => run(() => api(`/api/admin/affiliates/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: !a.active }) }), a.active ? "Turned off." : "Turned on.");
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => (notice = "Copied."));

  const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const input = "rounded border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-2 py-1";
</script>

<div class="w-full max-w-3xl flex flex-col gap-6">
  {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}
  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}

  <section class="bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-4">
    <div>
      <h2 class="text-lg font-semibold text-sr-ink">Access codes</h2>
      <p class="text-sm text-sr-muted">A plan free for a number of days from the day it's used - no card. Send the link; it signs them in or up, then applies the code.</p>
    </div>
    {#each codes as c (c.id)}
      <div class="rounded-md border border-sr-hairline bg-sr-raise p-3 text-sm flex flex-col gap-1">
        <div class="flex justify-between gap-2">
          <span class="font-mono font-semibold text-sr-ink">{c.code}</span>
          <span class="text-sr-ink-2">{c.plan === "educator" ? "Educator" : "Pro"} · {c.days} days · used {c.uses}{c.maxUses !== null ? ` of ${c.maxUses}` : ""}</span>
        </div>
        {#if c.note}<p class="text-sr-muted">{c.note}</p>{/if}
        <div class="flex gap-3 text-xs">
          <button class="underline text-sr-action-fg" on:click={() => copy(`${origin}/account?code=${c.code}`)}>Copy link</button>
          {#if c.expiresAt}<span class="text-sr-muted">stops working {day(c.expiresAt)}</span>{/if}
        </div>
      </div>
    {/each}
    <form class="flex flex-wrap gap-2 items-end" on:submit|preventDefault={makeCode}>
      <label class="text-xs text-sr-muted flex flex-col gap-1">Code<input class="{input} uppercase w-32" bind:value={newCode.code} required placeholder="BETA2026" /></label>
      <label class="text-xs text-sr-muted flex flex-col gap-1">Plan
        <select class={input} bind:value={newCode.plan}><option value="educator">Educator</option><option value="pro">Pro</option></select>
      </label>
      <label class="text-xs text-sr-muted flex flex-col gap-1">Days<input class="{input} w-20" type="number" min="1" max="730" bind:value={newCode.days} required /></label>
      <label class="text-xs text-sr-muted flex flex-col gap-1">Max uses<input class="{input} w-20" type="number" min="1" bind:value={newCode.maxUses} placeholder="any" /></label>
      <label class="text-xs text-sr-muted flex flex-col gap-1">Stops working<input class={input} type="date" bind:value={newCode.expiresAt} /></label>
      <label class="text-xs text-sr-muted flex flex-col gap-1 flex-1 min-w-40">Note<input class={input} bind:value={newCode.note} placeholder="Beta testers" /></label>
      <button class="sr-btn text-sm" disabled={busy}>Make code</button>
    </form>
  </section>

  <section class="bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-4">
    <div>
      <h2 class="text-lg font-semibold text-sr-ink">Affiliate codes</h2>
      <p class="text-sm text-sr-muted">A discount off the first year at checkout, and the advertiser's cut of what that checkout paid (before tax). Pay them yourself; mark it paid here.</p>
    </div>
    {#each affiliates as a (a.id)}
      <div class="rounded-md border border-sr-hairline bg-sr-raise p-3 text-sm flex flex-col gap-2">
        <button class="flex justify-between gap-2 text-left" on:click={() => (open = open === a.id ? null : a.id)}>
          <span><span class="font-mono font-semibold text-sr-ink">{a.code}</span> <span class="text-sr-ink-2">· {a.name}</span>{#if !a.active}<span class="text-sr-danger"> · off</span>{/if}</span>
          <span class="text-sr-ink-2 tabular-nums">{a.sales.length} sale{a.sales.length === 1 ? "" : "s"} · owed <strong class="text-sr-ink">{dollars(a.owed)}</strong></span>
        </button>
        <p class="text-xs text-sr-muted">{a.percentOff}% off for them · {a.commissionPercent}% to {a.name} · earned {dollars(a.earned)} in all</p>
        {#if open === a.id}
          {#if a.sales.length}
            <table class="text-xs w-full">
              <thead><tr class="text-left text-sr-muted"><th class="py-1">Date</th><th>What</th><th class="text-right">Paid</th><th class="text-right">Cut</th><th class="text-right">Paid out</th></tr></thead>
              <tbody>
                {#each a.sales as s (s.id)}
                  <tr class="border-t border-sr-hairline"><td class="py-1">{day(s.createdAt)}</td><td>{s.description}</td><td class="text-right tabular-nums">{dollars(s.amountPaid)}</td><td class="text-right tabular-nums">{dollars(s.commission)}</td><td class="text-right">{s.paidOutAt ? day(s.paidOutAt) : "-"}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
          <div class="flex gap-3 text-xs">
            {#if a.owed > 0}<button class="sr-btn-quiet text-xs" on:click={() => markPaid(a)} disabled={busy}>Mark {dollars(a.owed)} paid</button>{/if}
            <button class="underline text-sr-muted" on:click={() => toggle(a)} disabled={busy}>{a.active ? "Turn code off" : "Turn code on"}</button>
          </div>
        {/if}
      </div>
    {/each}
    <form class="flex flex-wrap gap-2 items-end" on:submit|preventDefault={makeAffiliate}>
      <label class="text-xs text-sr-muted flex flex-col gap-1 flex-1 min-w-40">Who<input class={input} bind:value={newAff.name} required placeholder="Jodi Coke (The Choir Queen)" /></label>
      <label class="text-xs text-sr-muted flex flex-col gap-1">Code<input class="{input} uppercase w-32" bind:value={newAff.code} required placeholder="CHOIRQUEEN" /></label>
      <label class="text-xs text-sr-muted flex flex-col gap-1">% off<input class="{input} w-16" type="number" min="1" max="50" bind:value={newAff.percentOff} required /></label>
      <label class="text-xs text-sr-muted flex flex-col gap-1">% to them<input class="{input} w-16" type="number" min="0" max="50" bind:value={newAff.commissionPercent} required /></label>
      <button class="sr-btn text-sm" disabled={busy}>Make code</button>
    </form>
  </section>
</div>
