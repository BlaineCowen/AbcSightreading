<script lang="ts">
  /**
   * "Assign to classes" under a game's setup (Blaine, 18 November 2026: let
   * teachers assign a custom version of a game). Shown to an account with
   * classes of its own; the game as it is set up now goes to the classes
   * chosen, with what counts as done (rounds at or above a score), a due day
   * and a note. game-assignments.ts has the rules.
   */
  import { onMount } from "svelte";
  import { ClipboardList, Check } from "lucide-svelte";
  import { modal } from "../../lib/modal";
  import { SCORE_SCALE, gameTitle, goalText, type GameId } from "../../lib/game-assignments";

  export let game: GameId;
  /** The setup to assign, as the game plays it. */
  export let setup: Record<string, unknown>;
  /** Why it can't be assigned as it is (the setup's own problem). */
  export let problem: string | null = null;

  let classes: { id: string; name: string }[] = [];
  onMount(async () => {
    try {
      const res = await fetch("/api/classes");
      if (res.ok) classes = ((await res.json()) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
    } catch {}
  });

  let open = false;
  let chosen: string[] = [];
  let rounds = 1;
  $: scale = SCORE_SCALE[game];
  let score = SCORE_SCALE[game].usual;
  let due = "";
  let note = "";
  let busy = false;
  let error = "";
  let done = "";
  $: scores = game === "solfege" || game === "interval" ? [6, 7, 8, 9, 10] : game === "note-rain" ? [10, 15, 20, 25, 30, 40, 50, 75] : game === "rhythm" ? [60, 70, 80, 90, 100] : [1, 2, 3];
  $: title = gameTitle(game, setup);

  function show() {
    error = done = "";
    if (classes.length === 1) chosen = [classes[0]!.id];
    open = true;
  }
  async function assign() {
    error = "";
    if (!chosen.length) return void (error = "Choose a class.");
    busy = true;
    try {
      const dueAt = due ? new Date(`${due}T23:59:00`).getTime() : null;
      const res = await fetch("/api/game-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, setup, goal: { rounds, score }, dueAt, note, classIds: chosen }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) error = body.error ?? "Could not assign it.";
      else {
        done = `Assigned to ${chosen.length === 1 ? classes.find((c) => c.id === chosen[0])?.name : `${chosen.length} classes`}.`;
        open = false;
      }
    } catch {
      error = "Could not reach the site. Try again.";
    }
    busy = false;
  }
  const toggle = (id: string) => (chosen = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
</script>

{#if classes.length}
  <div class="assign">
    <button type="button" class="sr-btn-quiet bg-sr-raise" on:click={show} disabled={!!problem} data-assign-game><ClipboardList size={16} /> Assign to classes</button>
    {#if done}<p class="ok" role="status"><Check size={14} /> {done} Students find it with their assignments.</p>{/if}
  </div>
{/if}

{#if open}
  <dialog class="sr-modal ag-scrim" use:modal={{ onClose: () => (open = busy) }} aria-labelledby="ag-title">
    <div class="ag-card">
      <h2 id="ag-title" class="font-display text-2xl font-bold">Assign to classes</h2>
      <p class="text-sm text-sr-ink-2">Students play <b>{title}</b>, set up just as it is now. They can't change the setup.</p>
      <fieldset class="flex flex-col gap-1.5">
        <legend class="lab">Classes</legend>
        {#each classes as c (c.id)}
          <label class="row"><input type="checkbox" class="sr-check h-4 w-4" checked={chosen.includes(c.id)} on:change={() => toggle(c.id)} /> {c.name}</label>
        {/each}
      </fieldset>
      <div class="flex flex-wrap items-center gap-2">
        <span class="lab">Done after</span>
        <select class="pick" bind:value={rounds} aria-label="Rounds">{#each [1, 2, 3, 5, 10] as r}<option value={r}>{r === 1 ? "a round" : `${r} rounds`}</option>{/each}</select>
        <span>of</span>
        <select class="pick" bind:value={score} aria-label="Score">{#each scores as s}<option value={s}>{s}{scale.unit === "%" ? "%" : ` ${scale.unit}`}</option>{/each}</select>
        <span>or more</span>
      </div>
      <label class="flex flex-wrap items-center gap-2"><span class="lab">Due</span><input type="date" class="pick" bind:value={due} /></label>
      <label class="flex flex-col gap-1"><span class="lab">Note for students</span><input class="pick" maxlength="300" bind:value={note} placeholder="Optional" /></label>
      <p class="text-xs text-sr-muted">{goalText(game, { rounds, score })}.{game === "solfege" || game === "interval" ? " Rounds are marked by the site." : " The score is what the student's device reports."}</p>
      {#if error}<p class="text-sm text-sr-danger" role="alert">{error}</p>{/if}
      <div class="flex gap-2 justify-end">
        <button type="button" class="sr-btn-quiet" on:click={() => (open = false)}>Cancel</button>
        <button type="button" class="sr-btn" on:click={assign} disabled={busy} data-assign-confirm>{busy ? "Assigning…" : "Assign"}</button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .assign { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; }
  .assign :global(button) { display: inline-flex; align-items: center; gap: 0.4rem; }
  .ok { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; color: var(--sr-mint-ink); font-weight: 700; }
  .ag-scrim { display: flex; align-items: center; justify-content: center; padding: 1rem; background: color-mix(in srgb, var(--sr-ink) 28%, transparent); }
  .ag-card { width: min(32rem, 100%); max-height: calc(100dvh - 2rem); overflow: auto; display: flex; flex-direction: column; gap: 0.8rem; padding: 1.25rem; border-radius: 28px; background: var(--sr-panel); border: 1px solid var(--sr-hairline); color: var(--sr-ink); }
  .lab { font-weight: 800; font-size: 0.85rem; color: var(--sr-ink-2); }
  .row { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.7rem; border-radius: 14px; background: var(--sr-raise); border: 1px solid var(--sr-hairline); }
  .pick { border-radius: 12px; border: 1px solid var(--sr-hairline); background: var(--sr-panel); color: var(--sr-ink); padding: 0.35rem 0.6rem; font-size: 0.9rem; }
</style>
