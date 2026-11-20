<script lang="ts">
  /**
   * The rhythm game set up by hand (Blaine, 2 November 2026: ta and ti-ti is
   * too limiting; the same rhythm-only choices as the practice page): the
   * meters, the figures (the Unison page's own picker groups and note
   * pictures, selectable-rhythms.ts), ties across the barline, and rhythm
   * syllables printed under the notes. One kind of meter at a time, as on
   * the Unison page, so the figures chosen always fit the bar.
   *
   * Laid out as the Unison page's settings bar (Blaine, 20 November 2026:
   * "let me set up custom rhythms like our normal unison interface"): pills
   * in labelled groups, each showing what is chosen, and a pill opens its own
   * choices in a panel under the row (a disclosure, not a pop-up: the page
   * stays usable, and nothing covers the music). One panel open at a time.
   */
  import { tick } from "svelte";
  import { ChevronDown } from "lucide-svelte";
  import { rhythmPickerGroups, selectableRhythms, selectableCompoundRhythms, DEFAULT_RHYTHM_NAMES } from "../../lib/selectable-rhythms";
  import { rhythmLabel } from "../../lib/rhythm-labels";
  import { meterKindOf } from "../../lib/meter";
  import { syllableSystems } from "../../resources/rhythm-syllables";

  export let meters: string[];
  export let rhythms: string[];
  export let ties = false;
  /** "off", or a rhythm syllable system's id. */
  export let syllables = "off";

  const METER_GROUPS = [
    { label: "Simple", names: ["2/4", "3/4", "4/4"] },
    { label: "Compound", names: ["6/8", "9/8", "12/8"] },
  ];
  const icons = Object.fromEntries(
    [...selectableRhythms, ...selectableCompoundRhythms].map((r) => [r.name, import(`../../assets/svgs/${r.name}.svg?raw`)])
  );

  $: kind = meterKindOf(meters[0] ?? "4/4");
  $: groups = rhythmPickerGroups(kind === "compound" ? selectableCompoundRhythms : selectableRhythms);
  $: syllableSystem = Object.values(syllableSystems).find((s) => s.id === syllables);

  function toggleMeter(m: string) {
    const other = meterKindOf(m) !== kind;
    // Another kind of meter starts its own selection (its figures are different).
    if (other) {
      meters = [m];
      rhythms = [...DEFAULT_RHYTHM_NAMES[meterKindOf(m)]];
      return;
    }
    meters = meters.includes(m) ? (meters.length > 1 ? meters.filter((x) => x !== m) : meters) : [...meters, m];
  }
  const toggleRhythm = (name: string) => (rhythms = rhythms.includes(name) ? rhythms.filter((r) => r !== name) : [...rhythms, name]);

  type Panel = "meter" | "rhythm" | "syllables";
  let open: Panel | null = null;
  const TITLES: Record<Panel, string> = { meter: "Time signature", rhythm: "Rhythms", syllables: "Syllables" };
  const TONES: Record<Panel, string> = { meter: "sky", rhythm: "peach", syllables: "mint" };
  const pills: Partial<Record<Panel, HTMLButtonElement>> = {};
  const uid = `rs-${Math.random().toString(36).slice(2, 8)}`;
  function toggle(p: Panel) {
    open = open === p ? null : p;
  }
  /** Done: the panel shuts and focus goes back to its pill. */
  async function done() {
    const was = open;
    open = null;
    await tick();
    if (was) pills[was]?.focus();
  }
  function onPanelKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      void done();
    }
  }

  $: meterText = meters.join(", ");
  $: rhythmText = rhythms.length === 1 ? "1 rhythm" : `${rhythms.length} rhythms`;
  $: syllableText = syllableSystem ? syllableSystem.label : "No syllables";
</script>

<div class="rs" data-rhythm-setup>
  <div class="bar">
    <div class="grp" role="group" aria-label="Music">
      <span class="grp-l" aria-hidden="true"><span class="dot tone-sky"></span>Music</span>
      <div class="pills">
        <button bind:this={pills.meter} type="button" class="pill" aria-expanded={open === "meter"} aria-controls="{uid}-panel" on:click={() => toggle("meter")} data-pill="meter">
          <span class="pill-k">Meter</span>{meterText}<ChevronDown size={14} class="chev" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="grp" role="group" aria-label="Rhythm">
      <span class="grp-l" aria-hidden="true"><span class="dot tone-peach"></span>Rhythm</span>
      <div class="pills">
        <button bind:this={pills.rhythm} type="button" class="pill" class:warn={!rhythms.length} aria-expanded={open === "rhythm"} aria-controls="{uid}-panel" on:click={() => toggle("rhythm")} data-pill="rhythm">
          {rhythmText}<span class="pill-k">{ties ? "· ties across" : ""}</span><ChevronDown size={14} class="chev" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="grp" role="group" aria-label="Syllables">
      <span class="grp-l" aria-hidden="true"><span class="dot tone-mint"></span>Syllables</span>
      <div class="pills">
        <button bind:this={pills.syllables} type="button" class="pill" aria-expanded={open === "syllables"} aria-controls="{uid}-panel" on:click={() => toggle("syllables")} data-pill="syllables">
          {syllableText}<ChevronDown size={14} class="chev" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>

  <!-- The open pill's choices, under the row. Kept in the page (hidden when shut) so aria-controls always points somewhere. -->
  <div id="{uid}-panel" class="panel" hidden={!open} role="group" aria-label={open ? TITLES[open] : undefined} on:keydown={onPanelKey}>
    {#if open}
      <p class="panel-title"><span class="dot tone-{TONES[open]}"></span>{TITLES[open]}</p>
      {#if open === "meter"}
        <div class="stack" role="group" aria-label="Meters">
          {#each METER_GROUPS as g}
            <p class="sub">{g.label}</p>
            <div class="wrap">
              {#each g.names as m}
                <button type="button" class="sr-tok" class:sr-on={meters.includes(m)} aria-pressed={meters.includes(m)} on:click={() => toggleMeter(m)}>{m}</button>
              {/each}
            </div>
          {/each}
        </div>
        {#if meters.length > 1}<p class="hint">{meters.length} meters selected. One is drawn each round.</p>{/if}
        {#if kind === "compound"}<p class="hint">Felt in dotted-quarter beats: the tempo counts ♩., and the rhythms are compound figures.</p>{/if}
        <p class="hint">Choosing the other kind of meter starts its own rhythms.</p>
      {:else if open === "rhythm"}
        <div class="stack">
          {#each groups as group}
            <p class="sub">{group.label}</p>
            <div class="wrap" role="group" aria-label="Rhythms: {group.label}">
              {#each group.rhythms as r}
                <button type="button" class="sr-tok-sq fig" class:sr-on={rhythms.includes(r.name)} aria-pressed={rhythms.includes(r.name)} aria-label={rhythmLabel(r.name)} title={rhythmLabel(r.name)} on:click={() => toggleRhythm(r.name)} data-rhythm={r.name}>
                  {#await icons[r.name]}<span class="text-xs">…</span>{:then svg}<span class="icon rhythm-icon">{@html svg.default}</span>{:catch}<span class="text-xs">{r.name}</span>{/await}
                </button>
              {/each}
            </div>
          {/each}
        </div>
        {#if !rhythms.length}<p class="text-sm text-sr-danger" role="alert">Choose at least one rhythm.</p>{/if}
        <p class="label">Ties across barline</p>
        <div role="group" aria-label="Ties across the barline">
          <button type="button" class="sr-tok" class:sr-on={ties} aria-pressed={ties} on:click={() => (ties = !ties)} data-ties>{ties ? "On" : "Off"}</button>
        </div>
        <p class="hint">{ties ? "A long note may run past the barline, written as tied notes." : "Every note stays inside its bar."}</p>
      {:else}
        <div class="wrap" role="group" aria-label="Syllables under the notes">
          <button type="button" class="sr-tok" class:sr-on={syllables === "off"} aria-pressed={syllables === "off"} on:click={() => (syllables = "off")}>Off</button>
          {#each Object.values(syllableSystems) as sys}
            <button type="button" class="sr-tok" class:sr-on={syllables === sys.id} aria-pressed={syllables === sys.id} on:click={() => (syllables = sys.id)}>{sys.label}</button>
          {/each}
        </div>
        <p class="hint">{syllableSystem ? `Printed under the notes: ${syllableSystem.hint}.` : "Nothing printed under the notes."}</p>
      {/if}
      <div class="foot"><button type="button" class="sr-btn-quiet" on:click={done}>Done</button></div>
    {/if}
  </div>
  {#if !open && !rhythms.length}<p class="text-sm text-sr-danger" role="alert">Choose at least one rhythm.</p>{/if}
</div>

<style>
  /* The Unison page's settings bar (AbcjsSingle.svelte .setbar), its groups and pills. */
  .rs { display: flex; flex-direction: column; gap: 0.6rem; width: 100%; }
  .bar { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; padding: 0.625rem 0.625rem 0.625rem calc(0.625rem + 3px); border-radius: 22px; background: var(--sr-paper, var(--sr-bg)); border: 1px solid var(--sr-hairline); overflow-x: clip; }
  .grp { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; }
  /* A hairline between groups; the one before a group that starts a row falls outside and is clipped. */
  .grp::before { content: ""; position: absolute; left: -0.5rem; top: 0.25rem; bottom: 0.25rem; border-left: 1px solid var(--sr-hairline); }
  .grp-l { display: inline-flex; align-items: center; gap: 0.35rem; padding-left: 0.4rem; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sr-muted); }
  .pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .dot { width: 10px; height: 10px; border-radius: 999px; flex: none; display: inline-block; }
  .tone-sky { background: var(--sr-sky); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-sky-ink) 45%, transparent); }
  .tone-mint { background: var(--sr-mint); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-mint-ink) 45%, transparent); }
  .tone-peach { background: var(--sr-peach); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sr-peach-ink) 45%, transparent); }
  .pill { display: inline-flex; align-items: center; gap: 0.375rem; min-height: 2.5rem; padding: 0.4rem 0.45rem 0.4rem 0.75rem; border-radius: 999px; background: var(--sr-track); color: var(--sr-ink); font-size: 14px; font-weight: 800; white-space: nowrap; border: 2px solid transparent; transition: background 120ms ease, border-color 120ms ease; }
  .pill:hover { border-color: var(--sr-tint); }
  .pill[aria-expanded="true"] { background: var(--sr-action); color: var(--sr-action-ink); }
  .pill.warn { border-color: var(--sr-danger); }
  .pill-k { font-size: 12px; font-weight: 600; opacity: 0.7; }
  .pill-k:empty { display: none; }
  .pill :global(.chev) { opacity: 0.7; }
  @media (pointer: coarse) { .pill { min-height: 44px; } }
  .panel { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem 0.75rem; border-radius: 22px; background: var(--sr-paper, var(--sr-bg)); border: 1px solid var(--sr-hairline); box-shadow: 0 10px 28px -16px color-mix(in srgb, var(--sr-ink) 35%, transparent); }
  .panel[hidden] { display: none; }
  .panel-title { display: flex; align-items: center; gap: 0.5rem; font-family: var(--sr-font-display); font-weight: 800; font-size: 1.05rem; color: var(--sr-ink); }
  .stack { display: flex; flex-direction: column; gap: 0.5rem; }
  .wrap { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .sub { font-size: 0.75rem; color: var(--sr-faint, var(--sr-muted)); }
  .label { margin-top: 0.25rem; font-weight: 800; font-size: 0.9rem; color: var(--sr-ink); }
  .hint { font-size: 0.75rem; color: var(--sr-faint, var(--sr-muted)); }
  .foot { display: flex; justify-content: flex-end; padding-top: 0.6rem; border-top: 1px solid var(--sr-hairline); }
  .fig { height: 3rem; min-width: 3rem; padding: 0.25rem 0.5rem; display: flex; align-items: center; justify-content: center; }
  .icon { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .icon :global(svg) { max-height: 2.4rem; width: auto; }
</style>
