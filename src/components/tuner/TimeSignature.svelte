<!-- The time signature, always open: the signature itself drawn as a
     fraction with a stepper on each number, the common meters beside it to
     jump to, and, where a bar can be felt more than one way, its groupings
     (7/8 as 2+2+3, 2+3+2 or 3+2+2; anything else typed). Any change is
     applied at once, so it is heard while it is set (meters.ts customMeter). -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { BOTTOMS, MAX_TOP, METERS, customMeter, groupingsOf, meterById, meterName } from "../../lib/tuner/meters";

  export let compact = false;
  /** On a practice page the meter is the exercise's: shown, not chosen. */
  export let locked = false;
  export let onManual: () => void = () => {};

  $: meter = meterById($tuner.meter);
  $: [top, bottom] = meterName(meter).split("/").map(Number);
  $: grouping = meter.grouping ?? "";
  /** The meter these numbers make with no grouping given: compound, simple, or uneven by default. */
  $: plain = customMeter(`${top}/${bottom}`)!;
  $: compoundOk = plain.kind === "compound";
  $: offersGrouping = top >= 5 && top <= 16 && (bottom >= 4);
  $: choices = offersGrouping
    ? groupingsOf(top, 10)
        .filter((g) => g.length > 1 && !(compoundOk && g.every((n) => n === 3)))
        .map((g) => g.join("+"))
    : [];

  let typed = "";
  let typedError = "";

  function apply(t: number, b: number, g = "") {
    const m = customMeter(g ? `${t}/${b}:${g}` : `${t}/${b}`);
    if (!m) return false;
    onManual();
    tuner.setMeter(m.id);
    return true;
  }
  const sum = (g: string) => g.split("+").reduce((a, n) => a + Number(n), 0);
  /** A new top keeps the grouping only while it still adds up. */
  const setTop = (t: number) => apply(t, bottom, meter.kind === "uneven" && sum(grouping) === t ? grouping : "") || apply(t, bottom);
  const stepBottom = (by: number) => {
    const i = BOTTOMS.indexOf(bottom as (typeof BOTTOMS)[number]) + by;
    if (i >= 0 && i < BOTTOMS.length) apply(top, BOTTOMS[i], meter.kind === "uneven" ? grouping : "") || apply(top, BOTTOMS[i]);
  };
  function pick(id: string) {
    onManual();
    tuner.setMeter(id);
  }
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

  const NOTE: Record<number, string> = { 1: "whole notes", 2: "half notes", 4: "quarter notes", 8: "eighth notes", 16: "sixteenth notes" };
  $: felt =
    meter.kind === "compound"
      ? `${meter.beats} dotted beats, each of three`
      : meter.kind === "uneven"
        ? `${meter.beats} ${NOTE[bottom]}, felt ${meter.grouping}`
        : `${meter.beats} ${NOTE[bottom]}`;
  $: tok = `sr-tok tabular-nums ${compact ? "px-3 text-[13px]" : ""}`;
</script>

<div class="flex flex-wrap items-start {compact ? 'gap-4' : 'gap-6'}">
  <!-- The signature as it is written: a number over a number. -->
  <div class="flex flex-col items-center gap-1" role="group" aria-label="Time signature {meterName(meter)}">
    {#each [["top", top], ["bottom", bottom]] as [part, n], i}
      {#if i === 1}<div class="h-[3px] w-24 rounded-full bg-sr-ink" aria-hidden="true"></div>{/if}
      <div class="flex items-center gap-2">
        {#if !locked}
          <button type="button" class="step" aria-label={part === "top" ? "One fewer beat" : "Longer beat note"}
            disabled={part === "top" ? top <= 1 : bottom === BOTTOMS[0]}
            on:click={() => (part === "top" ? setTop(top - 1) : stepBottom(-1))}>−</button>
        {/if}
        <span class="w-14 text-center font-display font-bold leading-none tabular-nums text-sr-ink {compact ? 'text-4xl' : 'text-5xl'}"
          aria-live="polite">{n}</span>
        {#if !locked}
          <button type="button" class="step" aria-label={part === "top" ? "One more beat" : "Shorter beat note"}
            disabled={part === "top" ? top >= MAX_TOP : bottom === BOTTOMS[BOTTOMS.length - 1]}
            on:click={() => (part === "top" ? setTop(top + 1) : stepBottom(1))}>+</button>
        {/if}
      </div>
    {/each}
    <p class="mt-1 max-w-[14rem] text-center text-xs font-semibold text-sr-muted">
      {locked ? "The exercise's meter" : `Clicks ${felt}`}
    </p>
  </div>

  {#if !locked}
    <div class="flex min-w-0 flex-1 basis-64 flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-bold text-sr-ink-2">Common</span>
        <div class="flex flex-wrap gap-2">
          {#each METERS as m}
            <button type="button" class="{tok} {$tuner.meter === m.id ? 'sr-on' : ''}" aria-pressed={$tuner.meter === m.id}
              title="{m.kind === 'simple' ? 'Simple' : m.kind === 'compound' ? 'Compound' : 'Uneven'}{m.grouping ? `, felt ${m.grouping}` : ''}"
              on:click={() => pick(m.id)}>{m.id}</button>
          {/each}
        </div>
      </div>

      {#if choices.length}
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-bold text-sr-ink-2">Felt as</span>
          <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Grouping">
            {#if compoundOk}
              <button type="button" class="{tok} {meter.kind === 'compound' ? 'sr-on' : ''}" aria-pressed={meter.kind === "compound"}
                on:click={() => apply(top, bottom)}>In threes</button>
            {:else if !plain.grouping}
              <button type="button" class="{tok} {meter.kind === 'simple' && !meter.grouping ? 'sr-on' : ''}"
                aria-pressed={meter.kind === "simple" && !meter.grouping} on:click={() => apply(top, bottom)}>Even</button>
            {/if}
            {#each choices as g}
              <button type="button" class="{tok} {grouping === g ? 'sr-on' : ''}" aria-pressed={grouping === g}
                on:click={() => apply(top, bottom, g)}>{g}</button>
            {/each}
            <form class="flex items-center gap-1.5" on:submit|preventDefault={applyTyped}>
              <label class="sr-only" for="ts-grouping">Another grouping</label>
              <input
                id="ts-grouping"
                class="w-24 rounded-full border-2 border-sr-hairline bg-sr-panel px-3 py-1.5 text-base tabular-nums text-sr-ink focus:border-sr-action focus:outline-none"
                placeholder="4+3"
                aria-describedby={typedError ? "ts-grouping-error" : undefined}
                bind:value={typed}
                on:input={() => (typedError = "")}
              />
              <button type="submit" class={tok} disabled={!typed.trim()}>Use</button>
            </form>
          </div>
          {#if typedError}<p id="ts-grouping-error" class="text-xs font-semibold text-sr-danger" role="alert">{typedError}</p>{/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .step {
    width: 44px;
    height: 44px;
    flex: none;
    border-radius: 999px;
    background: var(--sr-panel);
    border: 2px solid var(--sr-hairline);
    color: var(--sr-ink);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    transition: border-color 120ms ease;
  }
  .step:hover:not(:disabled) { border-color: var(--sr-action); }
  .step:disabled { opacity: 0.35; cursor: default; }
</style>
