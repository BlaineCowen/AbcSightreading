<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Copy, KeyRound, UserMinus, Printer, Upload, Monitor, X } from "lucide-svelte";
  import { parseRoster, type RosterStudent } from "../lib/roster";
  import { classes as classList } from "../lib/classes";
  import { buySeatPacks } from "../lib/billing-client";
  import { EDUCATOR_ON_SALE } from "../lib/plan";
  import ClassAssignments from "./ClassAssignments.svelte";
  import AssignmentWizard from "./AssignmentWizard.svelte";
  import { readDraft, type AssignDraft } from "../lib/assignment-draft";
  import { UNISON_PRESET_STORE } from "../lib/preset-storage";
  import { authClient } from "../lib/auth-client";
  import { CLASSROOM_SCOPES, type ClassroomCourse } from "../lib/classroom";

  /** Whether Google sign-in is set up here, and so Google Classroom import. */
  export let googleEnabled = false;

  /**
   * The educator's students: seats, each class's join code, its students,
   * adding a roster (pasted names or a CSV), printing login cards, resetting a
   * password, removing a student.
   *
   * Passwords are only ever known at the moment they are made - by a roster or
   * a reset - so that is when cards can be printed. Afterwards the teacher
   * resets a password to print a new card.
   */

  type Student = { id: string; name: string; username: string | null; managed: boolean; google: boolean };
  type Cls = { id: string; name: string; joinCode: string | null; classroom: { syncedAt: number | null } | null; students: Student[] };
  type Card = { name: string; username: string; password: string; className: string; joinCode: string };

  let seats = { total: 0, used: 0, left: 0 };
  let classes: Cls[] = [];
  let loaded = false;
  let problem = "";
  let notice = "";
  let addingTo: string | null = null;
  /**
   * How a class gets its students (Blaine, 13 October 2026: adding students
   * without Google Classroom was not clear): they join with the code, the
   * teacher makes their logins from a list, or Google Classroom. The panel is
   * open by itself while a class has nobody in it.
   */
  type AddWay = "code" | "list" | "google";
  let wayFor: Record<string, AddWay> = {};
  let closedFor = new Set<string>();
  const showAdd = (cls: Cls, adding: string | null, closed: Set<string>) => adding === cls.id || (!cls.students.length && !closed.has(cls.id));
  function openAdd(cls: Cls, way?: AddWay) {
    addingTo = cls.id;
    rosterText = "";
    if (way) wayFor = { ...wayFor, [cls.id]: way };
    closedFor.delete(cls.id);
    closedFor = closedFor;
  }
  function closeAdd(cls: Cls) {
    if (addingTo === cls.id) addingTo = null;
    closedFor = new Set(closedFor).add(cls.id);
  }
  /** The class whose join code is up on the board (a projector), or null. */
  let boardFor: Cls | null = null;
  const site = () => origin.replace(/^https?:\/\//, "").replace(/^www\./, "");
  let rosterText = "";
  let busy = false;
  let cards: Card[] = [];
  /** Where the cards came from: new students just added (the class shows its own Print), or printing (the top bar has it). */
  let cardsFrom: "added" | "printed" = "added";

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

  // ── Google Classroom ──
  /** The class whose Classroom picker is open, the teacher's Classroom classes, and what is happening. */
  let classroomFor: string | null = null;
  let courses: ClassroomCourse[] = [];
  let classroomState: "idle" | "loading" | "connect" | "choose" | "syncing" = "idle";
  let classroomNote = "";

  async function openClassroom(cls: Cls) {
    classroomFor = cls.id;
    classroomNote = "";
    problem = notice = "";
    classroomState = "loading";
    const res = await fetch("/api/classroom/courses");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      courses = data.courses;
      classroomState = "choose";
      if (!courses.length) classroomNote = "No active classes in that Google Classroom account. Is it the account you teach with?";
    } else if (data.reconnect) {
      classroomState = "connect";
      classroomNote = data.error ?? "";
    } else {
      classroomState = "idle";
      classroomFor = null;
      problem = data.error ?? "Could not reach Google Classroom.";
    }
  }

  /** Off to Google to allow reading classes and rosters; back here with the picker open. */
  async function connectClassroom() {
    const { error } = await authClient.linkSocial({
      provider: "google",
      scopes: CLASSROOM_SCOPES,
      callbackURL: `/account?classroom=${classroomFor}#students`,
    });
    if (error) classroomNote = error.message ?? "Could not reach Google.";
  }

  async function syncClassroom(cls: Cls, courseId?: string) {
    classroomFor = cls.id;
    classroomState = "syncing";
    problem = notice = "";
    const res = await fetch(`/api/classes/${cls.id}/classroom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseId ? { courseId } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.reconnect) {
        classroomState = "connect";
        classroomNote = data.error ?? "";
        return;
      }
      classroomState = "idle";
      classroomFor = null;
      problem = data.error ?? "Could not bring that class in.";
      return;
    }
    classroomState = "idle";
    classroomFor = null;
    const n = data.added.length;
    notice =
      (n ? `Added ${n} student${n === 1 ? "" : "s"} from ${data.courseName} to ${cls.name}. They sign in on the Student tab with Sign in with Google.` : `Everyone in ${data.courseName} is already in ${cls.name}.`) +
      (data.present && n ? ` ${data.present} were already here.` : "") +
      (data.gone.length ? ` No longer in Google Classroom: ${data.gone.join(", ")}. Remove them below if they have left.` : "");
    await load();
  }

  const syncedOn = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

  /** Create assignment at the top: for any classes. Opened by ?assign=new, or back from the page with ?assign=resume. */
  let creating = false;
  let resume: AssignDraft | null = null;

  onMount(() => {
    loadSaved().catch(() => {});
    const assign = new URLSearchParams(location.search).get("assign");
    if (assign) {
      resume = assign === "resume" ? readDraft() : null;
      creating = true;
      history.replaceState(null, "", "/account#students");
    }
    // Back from connecting Google: open that class's Classroom picker.
    const back = new URLSearchParams(location.search).get("classroom");
    if (back) {
      history.replaceState(null, "", "/account#students");
      load().then(() => {
        const cls = classes.find((c) => c.id === back);
        if (cls) openClassroom(cls);
      });
      return;
    }
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
    cardsFrom = "added";
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
    cardsFrom = "added";
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

  /** Students with a login the teacher made: the ones a card can be printed for. */
  const madeLogins = (cls: Cls) => cls.students.filter((s) => s.managed && s.username).length;
  $: printable = classes.filter((c) => madeLogins(c) > 0);
  let printing = false;

  /**
   * Login cards for one class or every class (Blaine, 16 October 2026).
   * Passwords are stored one way, so printing makes new ones; the teacher is
   * told first. Each class starts on a new page.
   */
  async function printCards(list: Cls[]) {
    const n = list.reduce((sum, c) => sum + madeLogins(c), 0);
    if (!n) return;
    const where = list.length === 1 ? list[0].name : `${list.length} classes`;
    if (!confirm(`Print login cards for ${n} student${n === 1 ? "" : "s"} in ${where}?\n\nEach gets a new password on the card, and their old one stops working. Students who made their own login with the code are not included.`)) return;
    printing = true;
    problem = notice = "";
    const made: Card[] = [];
    try {
      for (const cls of list) {
        const res = await fetch(`/api/classes/${cls.id}/cards`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Could not make the cards for ${cls.name}.`);
        for (const c of data.cards) made.push({ ...c, className: data.className, joinCode: data.joinCode });
      }
    } catch (e) {
      problem = (e as Error).message;
    }
    printing = false;
    if (!made.length) return;
    cards = made;
    cardsFrom = "printed";
    notice = `${made.length} login card${made.length === 1 ? "" : "s"} ready. If the print window closed too soon, use Print again: the old passwords no longer work.`;
    await tick();
    window.print();
  }

  /** The cards by class, for a page break between classes. */
  $: cardGroups = cards.reduce<{ className: string; cards: Card[] }[]>((groups, c) => {
    const last = groups[groups.length - 1];
    if (last && last.className === c.className) last.cards.push(c);
    else groups.push({ className: c.className, cards: [c] });
    return groups;
  }, []);

  /**
   * The cards print from the end of <body>: inside the Classes tab they never
   * printed, since globals.css hides every .tab-panel in print (a blank page
   * from 11 October, when /account got its tabs, to 16 October 2026).
   */
  function toBody(node: HTMLElement) {
    document.body.appendChild(node);
    document.body.classList.add("printing-cards");
    return {
      destroy: () => {
        node.remove();
        document.body.classList.remove("printing-cards");
      },
    };
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
      Students join your classes once the Educator plan is active on this account, with a code or through a school quote. Students already in a class keep their accounts.
      <a class="underline text-sr-action-fg" href="/account#plan">Get the Educator plan</a>
    </p>
  {/if}

  {#if loaded && classes.length}
    {#if creating}
      <AssignmentWizard classes={classes.map((c) => ({ id: c.id, name: c.name }))} {resume} saved={savedPresets} onDone={() => (resume = null)} onCancel={() => ((creating = false), (resume = null))} />
    {:else}
      <div class="flex flex-wrap gap-2">
        <button class="sr-btn text-sm" on:click={() => (creating = true)}>Create assignment</button>
        {#if printable.length > 1}
          <button class="sr-btn-quiet text-sm flex items-center gap-1" disabled={printing} on:click={() => printCards(printable)}>
            <Printer size={14} /> {printing ? "Making the cards…" : "Print login cards for all classes"}
          </button>
        {/if}
      </div>
    {/if}
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
                  <td class="text-sr-ink-2 font-mono">{s.username ?? "own account"}{#if s.google}<span class="g-badge" title="Signs in with Google">Google</span>{/if}</td>
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

        <ClassAssignments classId={cls.id} className={cls.name} googleClass={!!cls.classroom} saved={savedPresets} allClasses={classes.map((c) => ({ id: c.id, name: c.name }))} />

        {#if classroomFor === cls.id && classroomState !== "idle"}
          <div class="flex flex-col gap-2 rounded-md border border-sr-hairline bg-sr-panel p-3" aria-live="polite">
            {#if classroomState === "loading"}
              <p class="text-sm text-sr-muted">Asking Google Classroom for your classes…</p>
            {:else if classroomState === "syncing"}
              <p class="text-sm text-sr-muted">Bringing in the students…</p>
            {:else if classroomState === "connect"}
              <p class="text-sm text-sr-ink-2">
                Connect the Google account you teach with. Google will ask to let abcSightReading see your classes and who is in them. We read the names only, never emails or grades.
              </p>
              {#if classroomNote}<p class="text-xs text-sr-brass">{classroomNote}</p>{/if}
              <div class="flex gap-2">
                <button class="sr-btn text-sm" on:click={connectClassroom}>Connect Google Classroom</button>
                <button class="text-sm text-sr-muted underline" on:click={() => ((classroomFor = null), (classroomState = "idle"))}>Cancel</button>
              </div>
            {:else}
              <p class="text-sm text-sr-ink-2">Which Google Classroom class is {cls.name}?</p>
              {#if classroomNote}<p class="text-xs text-sr-brass">{classroomNote}</p>{/if}
              <div class="flex flex-col gap-1">
                {#each courses as c (c.id)}
                  <button class="course" on:click={() => syncClassroom(cls, c.id)}>
                    <span class="font-semibold text-sr-ink">{c.name}</span>{#if c.section}<span class="text-sr-muted"> · {c.section}</span>{/if}
                  </button>
                {/each}
              </div>
              <div class="flex gap-2">
                <button class="text-sm text-sr-muted underline" on:click={connectClassroom}>Use a different Google account</button>
                <button class="text-sm text-sr-muted underline" on:click={() => ((classroomFor = null), (classroomState = "idle"))}>Cancel</button>
              </div>
            {/if}
          </div>
        {/if}

        {#if cardsFrom === "added" && cards.some((c) => c.className === cls.name)}
          <div class="flex flex-wrap items-center gap-2 rounded-md bg-sr-tint p-3">
            <span class="text-sm text-sr-ink">The new logins are ready. Print the cards now: the passwords are not shown again.</span>
            <button class="sr-btn text-sm flex items-center gap-1" on:click={() => window.print()}><Printer size={14} /> Print login cards</button>
          </div>
        {/if}

        {#if showAdd(cls, addingTo, closedFor)}
          <div class="add-panel">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-semibold text-sr-ink">{cls.students.length ? "Add more students" : "Add students to this class"}: choose one way</p>
              <button class="p-1 text-sr-faint hover:text-sr-ink" aria-label="Close" on:click={() => closeAdd(cls)}><X size={16} /></button>
            </div>
            <div class="ways" role="tablist" aria-label="How students get in">
              <button role="tab" class="way {(wayFor[cls.id] ?? 'code') === 'code' ? 'on' : ''}" aria-selected={(wayFor[cls.id] ?? "code") === "code"} on:click={() => (wayFor = { ...wayFor, [cls.id]: "code" })}>
                <strong>They join with a code</strong><span>Each student makes their own login</span>
              </button>
              <button role="tab" class="way {wayFor[cls.id] === 'list' ? 'on' : ''}" aria-selected={wayFor[cls.id] === "list"} on:click={() => (wayFor = { ...wayFor, [cls.id]: "list" })}>
                <strong>I make their logins</strong><span>From a list of names; you print login cards</span>
              </button>
              {#if googleEnabled}
                <button role="tab" class="way {wayFor[cls.id] === 'google' ? 'on' : ''}" aria-selected={wayFor[cls.id] === "google"} on:click={() => (wayFor = { ...wayFor, [cls.id]: "google" })}>
                  <strong>Google Classroom</strong><span>Bring in a Classroom class's students</span>
                </button>
              {/if}
            </div>

            {#if (wayFor[cls.id] ?? "code") === "code" && !cls.joinCode}
              <p class="text-sm text-sr-ink-2">This class has no join code yet: it was made before your Educator plan. Making logins for one student gives it one, or make a new class.</p>
            {:else if (wayFor[cls.id] ?? "code") === "code"}
              <ol class="steps">
                <li>Students go to <strong class="text-sr-ink">{site()}/join</strong> on any device.</li>
                <li>They type the class code <strong class="font-mono text-lg tracking-widest text-sr-ink">{cls.joinCode ?? "…"}</strong>.</li>
                <li>They type their name and pick a username and password. No email needed, so it suits students of any age.</li>
              </ol>
              <div class="flex flex-wrap gap-2">
                <button class="sr-btn text-sm flex items-center gap-1" on:click={() => (boardFor = cls)} disabled={!cls.joinCode}><Monitor size={14} /> Show on the board</button>
                <button class="sr-btn-quiet text-sm flex items-center gap-1" on:click={() => copy(`${origin}/join?code=${cls.joinCode}`)} disabled={!cls.joinCode}><Copy size={14} /> Copy the join link</button>
              </div>
              <p class="text-xs text-sr-muted">They appear in this class as they join. Best for students who can keep track of a password; for younger ones, make their logins instead.</p>
            {:else if wayFor[cls.id] === "list"}
              <ol class="steps">
                <li>Paste their names, one a line ("Maria Garcia" or "Garcia, Maria"), or choose a spreadsheet saved as CSV with First and Last columns.</li>
                <li><strong class="text-sr-ink">Add and make logins</strong> gives each a username and password.</li>
                <li>Print the login cards and hand them out. Students sign in at {site()}/login, Student.</li>
              </ol>
              <textarea class="w-full h-32 border border-sr-hairline bg-sr-raise text-sr-ink rounded-md p-2 text-sm font-mono" aria-label="Student names for {cls.name}" bind:value={rosterText} placeholder={"Maria Garcia\nNguyen, Bao"}></textarea>
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
              </div>
              <p class="text-xs text-sr-muted">Best for younger students: no email, and you hold their logins. A lost card: the key beside a student makes a new password and card.</p>
            {:else}
              <p class="text-sm text-sr-ink-2">Pick the Google Classroom class this one is, and its students come in. They sign in with their school Google account; Sync later brings in anyone new.</p>
              <div class="flex flex-wrap items-center gap-2">
                {#if cls.classroom}
                  <button class="sr-btn text-sm" disabled={classroomState === "syncing"} on:click={() => syncClassroom(cls)}>Sync with Google Classroom</button>
                  {#if cls.classroom.syncedAt}<span class="text-xs text-sr-muted">Synced {syncedOn(cls.classroom.syncedAt)}</span>{/if}
                {:else}
                  <button class="sr-btn text-sm" on:click={() => openClassroom(cls)}>Import from Google Classroom</button>
                {/if}
              </div>
            {/if}
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-2">
            <button class="sr-btn-quiet text-sm" on:click={() => openAdd(cls)}>Add students</button>
            {#if madeLogins(cls)}
              <button class="sr-btn-quiet text-sm flex items-center gap-1" disabled={printing} on:click={() => printCards([cls])}><Printer size={14} /> Print login cards</button>
            {/if}
            {#if cls.joinCode}<button class="sr-btn-quiet text-sm flex items-center gap-1" on:click={() => (boardFor = cls)}><Monitor size={14} /> Show join code</button>{/if}
            {#if googleEnabled && cls.classroom}
              <button class="sr-btn-quiet text-sm" disabled={classroomState === "syncing"} on:click={() => syncClassroom(cls)}>Sync with Google Classroom</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</section>

{#if boardFor}
  <!-- The join code big enough to read from the back of the room (a projector or TV). -->
  <div class="board print:hidden" role="dialog" aria-label="Join {boardFor.name}" on:click={() => (boardFor = null)} on:keydown={(e) => e.key === "Escape" && (boardFor = null)} tabindex="-1">
    <div class="board-inner">
      <p class="board-class">{boardFor.name}</p>
      <p class="board-step">Go to</p>
      <p class="board-url">{site()}/join</p>
      <p class="board-step">and type the class code</p>
      <p class="board-code">{boardFor.joinCode}</p>
      <p class="board-hint">Tap anywhere or press Esc to close</p>
    </div>
  </div>
{/if}

<!-- Login cards: only these print, eight to a letter page, each class from a new page. -->
{#if cards.length}
  <div class="login-cards hidden print:block" use:toBody>
    {#each cardGroups as g, gi}
      <div class="card-page" class:new-page={gi > 0}>
        {#each g.cards as c}
          <div class="card">
            <div class="card-head"><span class="brand">abcSightReading</span><span class="class">{c.className}</span></div>
            <div class="name">{c.name}</div>
            <ol class="how">
              <li>Go to <b>{site()}/login</b></li>
              <li>Tap <b>Student</b>, then type:</li>
            </ol>
            <dl>
              <dt>Class code</dt><dd class="mono">{c.joinCode}</dd>
              <dt>Username</dt><dd class="mono">{c.username}</dd>
              <dt>Password</dt><dd class="mono">{c.password}</dd>
            </dl>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .g-badge {
    margin-left: 0.5rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-family: Nunito, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    background: var(--sr-sky);
    color: var(--sr-sky-ink);
  }
  .course {
    text-align: left;
    padding: 0.6rem 0.8rem;
    min-height: 2.75rem;
    border-radius: 12px;
    border: 1px solid var(--sr-hairline);
    background: var(--sr-raise);
    font-size: 0.9rem;
  }
  .course:hover {
    border-color: var(--sr-action);
  }
  .add-panel { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border-radius: 16px; background: var(--sr-panel); border: 1px solid var(--sr-hairline); }
  .ways { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.5rem; }
  .way { display: flex; flex-direction: column; gap: 0.15rem; text-align: left; padding: 0.65rem 0.85rem; border-radius: 14px; background: var(--sr-track); border: 2px solid transparent; color: var(--sr-ink); }
  .way span { font-size: 0.8rem; color: var(--sr-muted); }
  .way.on { background: var(--sr-tint); border-color: var(--sr-action); }
  .way.on strong { color: var(--sr-action-fg); }
  .steps { list-style: decimal; padding-left: 1.4rem; display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.9rem; color: var(--sr-ink-2); }
  .board { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: var(--sr-bg, #111); cursor: pointer; }
  .board-inner { text-align: center; padding: 2rem; }
  .board-class { font-size: clamp(1.25rem, 3vw, 2.25rem); font-weight: 700; color: var(--sr-muted); margin-bottom: 2rem; }
  .board-step { font-size: clamp(1.25rem, 3vw, 2.5rem); color: var(--sr-ink-2); }
  .board-url { font-family: var(--sr-font-display); font-size: clamp(2rem, 6vw, 5.5rem); font-weight: 700; color: var(--sr-ink); margin: 0.25rem 0 1.5rem; }
  .board-code { font-family: ui-monospace, monospace; font-size: clamp(3rem, 12vw, 11rem); font-weight: 800; letter-spacing: 0.08em; color: var(--sr-action-fg); }
  .board-hint { margin-top: 2rem; font-size: 0.9rem; color: var(--sr-faint); }
  @media print {
    /* Only the cards: everything else on the page is left out. */
    :global(body.printing-cards > *:not(.login-cards)) { display: none !important; }
    .login-cards {
      width: 100%;
      color: #000; background: #fff; font-family: system-ui, sans-serif;
    }
    .card-page { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; padding: 0.3in; }
    .card-page.new-page { break-before: page; }
    .card { height: 2.45in; box-sizing: border-box; border: 1px dashed #aaa; padding: 0.18in 0.22in; break-inside: avoid; display: flex; flex-direction: column; gap: 4pt; }
    .card-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 9pt; color: #555; }
    .brand { font-weight: 800; color: #2f6fe0; }
    .name { font-size: 15pt; font-weight: 800; }
    .how { margin: 0; padding-left: 14pt; font-size: 9.5pt; color: #333; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 2pt 10pt; margin: 2pt 0 0; font-size: 10pt; }
    dt { color: #555; }
    dd { margin: 0; }
    .mono { font-family: ui-monospace, monospace; font-size: 12.5pt; font-weight: 700; }
  }
</style>
