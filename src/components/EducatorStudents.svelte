<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, KeyRound, UserMinus, Printer, Upload } from "lucide-svelte";
  import { parseRoster, type RosterStudent } from "../lib/roster";
  import { classes as classList } from "../lib/classes";
  import { buySeatPacks } from "../lib/billing-client";
  import { EDUCATOR_ON_SALE } from "../lib/plan";
  import ClassAssignments from "./ClassAssignments.svelte";
  import { UNISON_PRESET_STORE } from "../lib/preset-storage";

  /**
   * The educator's students: seats, each class's join code, its students,
   * adding a roster (pasted names or a CSV), printing login cards, resetting a
   * password, removing a student.
   *
   * Passwords are only ever known at the moment they are made - by a roster or
   * a reset - so that is when cards can be printed. Afterwards the teacher
   * resets a password to print a new card.
   */

  type Student = { id: string; name: string; username: string | null; managed: boolean };
  type Cls = { id: string; name: string; joinCode: string | null; students: Student[] };
  type Card = { name: string; username: string; password: string; className: string; joinCode: string };

  let seats = { total: 0, used: 0, left: 0 };
  let classes: Cls[] = [];
  let loaded = false;
  let problem = "";
  let notice = "";
  let addingTo: string | null = null;
  let rosterText = "";
  let busy = false;
  let cards: Card[] = [];

  $: parsed = parseRoster(rosterText);
  const origin = typeof location !== "undefined" ? location.origin : "";

  async function load() {
    const res = await fetch("/api/educator");
    if (!res.ok) {
      problem = (await res.json().catch(() => ({}))).error ?? "Could not load your students.";
      return;
    }
    ({ seats, classes } = await res.json());
    loaded = true;
  }
  // The teacher's own presets, both pages, for the assignment picker.
  let savedPresets: { id: string; name: string; page: string }[] = [];
  async function loadSaved() {
    const lists = await Promise.all(
      [["abcsr_presets", "Choral"], [UNISON_PRESET_STORE, "Unison"]].map(([store, page]) =>
        fetch(`/api/presets?store=${store}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((list: { id: string; name: string }[]) => list.map((p) => ({ id: p.id, name: p.name, page })))
      )
    );
    savedPresets = lists.flat();
  }

  onMount(() => {
    loadSaved().catch(() => {});
    if (new URLSearchParams(location.search).get("seats") === "added") {
      notice = "Thank you! The seats are added, and they count for a year.";
      history.replaceState(null, "", "/account#students");
    }
    load();
  });

  // Seat packs: 25 seats each, for a year from purchase.
  let packs = 1;
  async function buySeats() {
    problem = "";
    busy = true;
    try {
      await buySeatPacks(packs);
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not start checkout.";
      busy = false;
    }
  }
  // A class added, renamed or removed in the Classes section below.
  let lastSignature = "";
  $: {
    const sig = $classList.map((c) => `${c.id}:${c.name}`).join("|");
    if (loaded && sig && sig !== lastSignature) load();
    lastSignature = sig;
  }

  async function readFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) rosterText = await file.text();
  }

  async function addRoster(cls: Cls) {
    if (!parsed.students.length) return;
    busy = true;
    problem = notice = "";
    const res = await fetch(`/api/classes/${cls.id}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: parsed.students as RosterStudent[] }),
    });
    const data = await res.json().catch(() => ({}));
    busy = false;
    if (!res.ok) {
      problem = data.error ?? "Could not add those students.";
      return;
    }
    cards = data.created.map((c: { name: string; username: string; password: string }) => ({ ...c, className: cls.name, joinCode: data.joinCode }));
    notice = `Added ${data.created.length} student${data.created.length === 1 ? "" : "s"} to ${cls.name}. Print their login cards now: the passwords are not shown again.`;
    rosterText = "";
    addingTo = null;
    await load();
  }

  async function resetPassword(cls: Cls, s: Student) {
    if (!confirm(`Give ${s.name} a new password? They will be signed out.`)) return;
    const res = await fetch(`/api/classes/${cls.id}/students/${s.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-password" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      problem = data.error ?? "Could not reset the password.";
      return;
    }
    cards = [{ name: s.name, username: data.username, password: data.password, className: cls.name, joinCode: cls.joinCode ?? "" }];
    notice = `New password for ${s.name}: ${data.password}`;
  }

  async function remove(cls: Cls, s: Student) {
    const what = s.managed
      ? `Remove ${s.name}? Their account and practice will be deleted, and a seat freed.`
      : `Remove ${s.name} from ${cls.name}? They keep their own account.`;
    if (!confirm(what)) return;
    const res = await fetch(`/api/classes/${cls.id}/students/${s.id}`, { method: "DELETE" });
    if (!res.ok) problem = (await res.json().catch(() => ({}))).error ?? "Could not remove them.";
    await load();
  }

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => (notice = "Copied."));
</script>

<section id="students" class="w-full max-w-5xl bg-sr-panel border border-sr-hairline rounded-lg p-6 flex flex-col gap-5 print:hidden">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-lg font-semibold text-sr-ink">Students</h2>
      <p class="text-sm text-sr-muted">Students join a class with its code, or you make their accounts from a list. Secure student accounts for all age groups.</p>
    </div>
    {#if loaded}
      <div class="text-sm text-sr-ink-2 min-w-[12rem]">
        <div class="flex justify-between"><span>Seats</span><span class="tabular-nums">{seats.used} of {seats.total}</span></div>
        <div class="h-2 rounded bg-sr-track overflow-hidden mt-1"><div class="h-full bg-sr-action" style="width: {Math.min(100, (seats.used / Math.max(1, seats.total)) * 100)}%"></div></div>
        {#if seats.total > 0 && EDUCATOR_ON_SALE}
          <div class="flex items-center gap-1 mt-2 text-xs">
            <label for="seat-packs" class="text-sr-muted">More seats:</label>
            <select id="seat-packs" bind:value={packs} class="rounded border border-sr-hairline bg-sr-panel text-sr-ink text-xs px-1 py-0.5">
              {#each [1, 2, 4, 8] as n}<option value={n}>{n * 25} (${n * 25})</option>{/each}
            </select>
            <button class="underline text-sr-action-fg" on:click={buySeats} disabled={busy}>Buy</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if loaded && seats.total === 0}
    <p class="text-sm text-sr-ink-2 rounded-md border border-sr-hairline bg-sr-raise p-3">
      The Educator plan is not active, so no one new can join your classes. The students already in them keep their accounts.
      <a class="underline text-sr-action-fg" href="/account#plan">Renew Educator</a>
    </p>
  {/if}

  {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
  {#if notice}<p class="text-sm text-sr-ink-2" role="status">{notice}</p>{/if}

  {#if cards.length}
    <div class="flex items-center gap-2">
      <button class="sr-btn text-sm flex items-center gap-1" on:click={() => window.print()}><Printer size={14} /> Print {cards.length} login card{cards.length === 1 ? "" : "s"}</button>
      <button class="text-sm text-sr-muted underline" on:click={() => (cards = [])}>Done</button>
    </div>
  {/if}

  {#if !loaded}
    <p class="text-sm text-sr-muted">Loading…</p>
  {:else if !classes.length}
    <p class="text-sm text-sr-muted">Add a class under <strong>Classes</strong> below, and it gets a join code here.</p>
  {:else}
    {#each classes as cls (cls.id)}
      <div class="bg-sr-raise border border-sr-hairline rounded-lg p-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-base font-semibold text-sr-ink">{cls.name} <span class="text-sm font-normal text-sr-muted">· {cls.students.length} student{cls.students.length === 1 ? "" : "s"}</span></h3>
          {#if cls.joinCode}
            <div class="flex items-center gap-2 text-sm">
              <span class="text-sr-muted">Join code</span>
              <strong class="font-mono text-lg tracking-widest text-sr-ink">{cls.joinCode}</strong>
              <button class="p-1 text-sr-faint hover:text-sr-ink" title="Copy the join link" aria-label="Copy the join link for {cls.name}" on:click={() => copy(`${origin}/join?code=${cls.joinCode}`)}><Copy size={14} /></button>
            </div>
          {/if}
        </div>

        {#if cls.students.length}
          <table class="text-sm w-full">
            <thead><tr class="text-left text-xs text-sr-muted"><th class="font-medium py-1">Name</th><th class="font-medium">Username</th><th></th></tr></thead>
            <tbody>
              {#each cls.students as s (s.id)}
                <tr class="border-t border-sr-hairline">
                  <td class="py-1.5 text-sr-ink">{s.name}</td>
                  <td class="text-sr-ink-2 font-mono">{s.username ?? "own account"}</td>
                  <td class="text-right whitespace-nowrap">
                    {#if s.managed}
                      <button class="p-1 text-sr-faint hover:text-sr-ink" title="New password" aria-label="New password for {s.name}" on:click={() => resetPassword(cls, s)}><KeyRound size={14} /></button>
                    {/if}
                    <button class="p-1 text-sr-faint hover:text-sr-danger" title="Remove" aria-label="Remove {s.name}" on:click={() => remove(cls, s)}><UserMinus size={14} /></button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

        <ClassAssignments classId={cls.id} saved={savedPresets} />

        {#if addingTo === cls.id}
          <div class="flex flex-col gap-2">
            <label class="text-sm text-sr-ink-2 flex flex-col gap-1">
              Paste names, one per line (or "Last, First"), or a spreadsheet with First and Last columns
              <textarea class="w-full h-32 border border-sr-hairline bg-sr-raise text-sr-ink rounded-md p-2 text-sm font-mono" bind:value={rosterText} placeholder={"Maria Garcia\nNguyen, Bao"}></textarea>
            </label>
            <label class="text-xs text-sr-muted flex items-center gap-2 cursor-pointer self-start">
              <Upload size={14} /> Or choose a CSV file
              <input type="file" accept=".csv,.txt,text/csv,text/plain" class="sr-only" on:change={readFile} />
            </label>
            {#if parsed.students.length || parsed.errors.length}
              <p class="text-sm text-sr-ink-2">
                {parsed.students.length} student{parsed.students.length === 1 ? "" : "s"}{parsed.students.length > seats.left ? `, but only ${seats.left} seats left` : ""}.
                {#each parsed.errors as e}<span class="block text-xs text-sr-brass">{e}</span>{/each}
              </p>
            {/if}
            <div class="flex gap-2">
              <button class="sr-btn text-sm" on:click={() => addRoster(cls)} disabled={busy || !parsed.students.length || parsed.students.length > seats.left}>Add and make logins</button>
              <button class="text-sm text-sr-muted underline" on:click={() => (addingTo = null)}>Cancel</button>
            </div>
          </div>
        {:else}
          <button class="sr-btn-quiet text-sm self-start" on:click={() => { addingTo = cls.id; rosterText = ""; }}>Add students</button>
        {/if}
      </div>
    {/each}
  {/if}
</section>

<!-- Login cards: only these print. -->
{#if cards.length}
  <div class="login-cards hidden print:grid">
    {#each cards as c}
      <div class="card">
        <div class="class">{c.className}</div>
        <div class="name">{c.name}</div>
        <dl>
          <dt>Website</dt><dd>{origin.replace(/^https?:\/\//, "")}/login?mode=student</dd>
          <dt>Class code</dt><dd class="mono">{c.joinCode}</dd>
          <dt>Username</dt><dd class="mono">{c.username}</dd>
          <dt>Password</dt><dd class="mono">{c.password}</dd>
        </dl>
      </div>
    {/each}
  </div>
{/if}

<style>
  @media print {
    :global(body *) { visibility: hidden; }
    .login-cards, .login-cards * { visibility: visible; }
    .login-cards {
      position: absolute; left: 0; top: 0; width: 100%;
      grid-template-columns: repeat(2, 1fr); gap: 0.25in; padding: 0.25in;
      color: #000; background: #fff; font-family: system-ui, sans-serif;
    }
    .card { border: 1px dashed #999; border-radius: 8px; padding: 0.2in; break-inside: avoid; }
    .class { font-size: 10pt; color: #555; }
    .name { font-size: 14pt; font-weight: 700; margin: 2pt 0 6pt; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 2pt 8pt; margin: 0; font-size: 11pt; }
    dt { color: #555; }
    dd { margin: 0; }
    .mono { font-family: ui-monospace, monospace; font-size: 12pt; }
  }
</style>
