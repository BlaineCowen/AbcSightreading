<!-- Any time signature (meters.ts customMeter): the top number, the note
     that gets the count, and for an uneven meter how its beats are grouped
     (7/8 as 2+2+3, 2+3+2 or 3+2+2; anything else typed, 4+3). Every change
     is applied at once, so it is heard while it is set. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { BOTTOMS, MAX_TOP, customMeter, groupingsOf, meterById, meterName } from "../../lib/tuner/meters";

  export let compact = false;
  export let onManual: () => void = () => {};

  $: meter = meterById($tuner.meter);
  $: [top, bottom] = meterName(meter).split("/").map(Number);
  $: grouping = meter.kind === "uneven" ? meter.grouping ?? "" : "";
  // Twos and threes offered as buttons; a top number of 6, 9, 12 also "in threes", the compound reading.
  $: compoundOk = bottom >= 4 && top >= 6 && top % 3 === 0;
  $: choices =
    top >= 4 && top <= 16
      ? groupingsOf(top, 10)
          .filter((g) => g.length > 1 && !(compoundOk && g.every((n) => n === 3)))
          .map((g) => g.join("+"))
      : [];

  let typed = "";
  let typedError = "";

  function apply(t: number, b: number, g = "") {
    const id = g ? `${t}/${b}:${g}` : `${t}/${b}`;
    const m = customMeter(id);
    if (!m) return false;
    onManual();
    tuner.setMeter(m.id);
    return true;
  }
  /** A new top or bottom keeps a grouping only if it still adds up. */
  const setTop = (t: number) => apply(t, bottom, grouping && sum(grouping) === t ? grouping : "") || apply(t, bottom);
  const setBottom = (b: number) => apply(top, b, grouping) || apply(top, b);
  const sum = (g: string) => g.split("+").reduce((a, n) => a + Number(n), 0);

  function applyTyped() {
    const g = typed.replace(/\s+/g, "").replace(/[,-]/g, "+");
    if (!g) return;
    if (!/^\d+(\+\d+)+$/.test(g)) typedError = "Write the groups with plus signs, like 3+2+2.";
    else if (sum(g) !== top) typedError = `Those add up to ${sum(g)}; the bar has ${top}.`;
    else if (!apply(top, bottom, g)) typedError = "Each group is 1 to 9 beats.";
    else {
      typedError = "";
      typed = "";
    }
  }

  $: tok = `sr-tok inline-flex ${compact ? "px-3 text-[13px]" : ""}`;
  const NOTE_NAME: Record<number, string> = { 1: "Whole notes", 2: "Half notes", 4: "Quarter notes", 8: "Eighth notes", 16: "Sixteenth notes" };
</script>

<div class="flex flex-col gap-3 rounded-[20px] border-2 border-sr-tint bg-sr-panel p-3 {compact ? '' : 'sm:p-4'}">
  <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
    <div class="flex flex-col gap-1">
      <span class="text-xs font-bold text-sr-ink-2">Beats in a bar</span>
      <div class="flex items-center gap-1.5" role="group" aria-label="Beats in a bar">
        <button type="button" class="step" aria-label="One fewer" disabled={top <= 1} on:click={() => setTop(top - 1)}>−</button>
        <span class="w-10 text-center font-display font-bold text-2xl tabular-nums text-sr-ink" aria-live="polite">{top}</span>
        <button type="button" class="step" aria-label="One more" disabled={top >= MAX_TOP} on:click={() => setTop(top + 1)}>+</button>
      </div>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-xs font-bold text-sr-ink-2">Counted in</span>
      <div class="flex items-center gap-1.5" role="group" aria-label="The note that gets the count">
        {#each BOTTOMS as b}
          <button type="button" class="{tok} min-w-11 justify-center {bottom === b ? 'sr-on' : ''}" aria-pressed={bottom === b}
            title={NOTE_NAME[b]} on:click={() => setBottom(b)}>{b}</button>
        {/each}
      </div>
    </div>
  </div>

  {#if choices.length || compoundOk}
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-bold text-sr-ink-2">Grouping</span>
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Grouping">
        {#if compoundOk}
          <button type="button" class="{tok} {meter.kind === 'compound' ? 'sr-on' : ''}" aria-pressed={meter.kind === "compound"}
            title="Counted in {top / 3} dotted beats" on:click={() => apply(top, bottom)}>In threes</button>
        {:else if bottom < 8 || top % 2 === 0}
          <button type="button" class="{tok} {meter.kind === 'simple' ? 'sr-on' : ''}" aria-pressed={meter.kind === "simple"}
            title="Every beat the same" on:click={() => apply(top, bottom)}>Even</button>
        {/if}
        {#each choices as g}
          <button type="button" class="{tok} tabular-nums {grouping === g ? 'sr-on' : ''}" aria-pressed={grouping === g} on:click={() => apply(top, bottom, g)}>{g}</button>
        {/each}
      </div>
      <form class="flex items-center gap-2" on:submit|preventDefault={applyTyped}>
        <label class="sr-only" for="custom-grouping">Another grouping</label>
        <input
          id="custom-grouping"
          class="w-32 rounded-full border-2 border-sr-hairline bg-sr-panel px-3.5 py-1.5 text-base tabular-nums text-sr-ink focus:outline-none focus:border-sr-action"
          placeholder="Other: 4+3"
          inputmode="text"
          aria-describedby={typedError ? "custom-grouping-error" : undefined}
          bind:value={typed}
          on:input={() => (typedError = "")}
        />
        <button type="submit" class="sr-btn-quiet" disabled={!typed.trim()}>Use</button>
      </form>
      {#if typedError}<p id="custom-grouping-error" class="text-xs font-semibold text-sr-danger" role="alert">{typedError}</p>{/if}
    </div>
  {/if}
  <p class="text-xs text-sr-muted">
    {#if meter.kind === "compound"}
      Clicks {meter.beats} dotted beats a bar, each of three.
    {:else if meter.kind === "uneven"}
      Clicks {meter.beats} a bar, felt {meter.grouping}: each group starts louder.
    {:else}
      Clicks {meter.beats} a bar.
    {/if}
  </p>
</div>

<style>
  .step {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    background: var(--sr-panel);
    border: 2px solid var(--sr-hairline);
    color: var(--sr-ink);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
  }
  .step:hover:not(:disabled) { border-color: var(--sr-action); }
  .step:disabled { opacity: 0.38; cursor: default; }
</style>
