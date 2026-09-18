<script lang="ts">
  import { uilPresets } from "../lib/uil-presets";
  import {
    APRIL_CALIBRATED_RANGES,
    soundingNoteName,
  } from "../lib/calibrated-voice-ranges";
  import RangeSelector from "./ui/rangeSelector.svelte";

  const levels = ["UIL 1", "UIL 2", "UIL 3", "UIL 4", "UIL 5"];
  const voices = ["Soprano", "Soprano1", "Soprano2", "Alto", "Tenor", "Baritone", "Bass", "Unison"];

  /** The official page draws each level's ranges as staff images. */
  const UIL_CRITERIA_URL =
    "https://www.uiltexas.org/music/concert-sight-reading/choir-sight-reading-criteria";

  const voiceClefs: Record<string, string> = {
    Soprano:  "treble octave=-1",
    Soprano1: "treble octave=-1",
    Soprano2: "treble octave=-1",
    Alto:     "treble octave=-1",
    Tenor:    "treble transpose=-12",
    Baritone: "bass octave=-1",
    Bass:     "bass octave=-1",
    Unison:   "treble octave=-1",
  };

  type Range = { min: number; max: number };
  type Source = "april" | "app";

  /** What the generator uses today. */
  function appRange(level: string, voice: string): Range | null {
    const r = uilPresets[level]?.voiceRanges?.[voice];
    return r ? { min: r[0], max: r[1] } : null;
  }

  function aprilRange(level: string, voice: string): Range | null {
    const r = APRIL_CALIBRATED_RANGES[level]?.[voice];
    return r ? { min: r[0], max: r[1] } : null;
  }

  function loadFrom(source: Source) {
    const next: Record<string, Record<string, Range>> = {};
    for (const level of levels) {
      next[level] = {};
      for (const voice of voices) {
        const r = source === "april" ? aprilRange(level, voice) : appRange(level, voice);
        next[level][voice] = r ?? { min: 21, max: 28 };
      }
    }
    return next;
  }

  // Start from the hand calibration, not from what later commits turned it into.
  let source: Source = "april";
  let ranges = loadFrom(source);

  let activeLevel = "UIL 1";
  let jsonOutput = "";
  let copied = false;

  function switchSource(next: Source) {
    if (next === source) return;
    source = next;
    ranges = loadFrom(source);
    jsonOutput = "";
    copied = false;
  }

  function handleRangeChange(level: string, voice: string, newRange: Range) {
    ranges[level][voice] = newRange;
    ranges = ranges;
    jsonOutput = "";
    copied = false;
  }

  const same = (a: Range | null, b: Range | null) =>
    !!a && !!b && a.min === b.min && a.max === b.max;
  const label = (r: Range) => `${soundingNoteName(r.min)}–${soundingNoteName(r.max)}`;

  $: changedHere = voices.filter(
    (v) => !same(aprilRange(activeLevel, v), appRange(activeLevel, v))
  ).length;

  function generateJson() {
    const output: Record<string, Record<string, [number, number]>> = {};
    for (const level of levels) {
      output[level] = {};
      for (const voice of voices) {
        const r = ranges[level][voice];
        output[level][voice] = [r.min, r.max];
      }
    }
    jsonOutput = JSON.stringify(output, null, 2);
  }

  async function copyJson() {
    generateJson();
    try {
      await navigator.clipboard.writeText(jsonOutput);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch (_) {}
  }
</script>

<div class="w-full max-w-6xl px-4 pb-12 space-y-6">
  <!-- Reference and starting point -->
  <div class="sr-panel p-4 space-y-3">
    <p class="text-sm text-sr-ink-2">
      Check each level against the official
      <a
        class="font-semibold text-sr-action-fg underline underline-offset-2"
        href={UIL_CRITERIA_URL}
        target="_blank"
        rel="noopener noreferrer"
      >UIL Choir Sight-Reading Criteria</a>
      - each level has a <em>Ranges</em> section with a staff for every voice part.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <span class="sr-label">Start from</span>
      <button
        type="button"
        class="sr-tok {source === 'april' ? 'sr-on' : ''}"
        aria-pressed={source === "april"}
        on:click={() => switchSource("april")}
      >My April calibration</button>
      <button
        type="button"
        class="sr-tok {source === 'app' ? 'sr-on' : ''}"
        aria-pressed={source === "app"}
        on:click={() => switchSource("app")}
      >What the app uses now</button>
      <span class="text-xs text-sr-muted">Switching starts over and drops unsaved edits.</span>
    </div>
  </div>

  <!-- Level tabs -->
  <div class="flex gap-2 flex-wrap items-center">
    {#each levels as level}
      <button
        type="button"
        class="sr-tok {activeLevel === level ? 'sr-on' : ''}"
        aria-pressed={activeLevel === level}
        on:click={() => { activeLevel = level; jsonOutput = ""; }}
      >{level}</button>
    {/each}
    <span class="text-xs text-sr-muted ml-2">
      {changedHere} of {voices.length} voices at {activeLevel} have changed since April
    </span>
  </div>

  <!-- Voice grid - re-mounts on tab/source switch so abcjs renders correctly -->
  {#key `${activeLevel}:${source}`}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each voices as voice}
        {@const current = ranges[activeLevel][voice]}
        {@const april = aprilRange(activeLevel, voice)}
        {@const app = appRange(activeLevel, voice)}
        <div class="flex flex-col items-center gap-1.5">
          <span class="sr-label">{voice}</span>
          <RangeSelector
            range={current}
            clef={voiceClefs[voice]}
            onRangeChange={(r) => handleRangeChange(activeLevel, voice, r)}
          />
          <span class="text-sm font-semibold text-sr-ink tabular-nums">
            {label(current)}
            <span class="text-xs font-normal text-sr-faint font-mono">[{current.min}, {current.max}]</span>
          </span>
          {#if april && app && !same(april, app)}
            <span class="text-xs text-sr-brass text-center">
              April {label(april)} &rarr; app now {label(app)}
            </span>
          {:else if april && app}
            <span class="text-xs text-sr-faint">Unchanged since April</span>
          {/if}
        </div>
      {/each}
    </div>
  {/key}

  <!-- Export -->
  <div class="flex flex-col gap-3">
    <button type="button" class="sr-btn self-start" on:click={copyJson}>
      {copied ? "Copied!" : "Copy JSON"}
    </button>
    {#if jsonOutput}
      <textarea
        class="w-full h-64 font-mono text-xs p-3 border border-sr-hairline rounded bg-sr-panel text-sr-ink resize-none"
        readonly
        value={jsonOutput}
        on:click={(e) => e.currentTarget.select()}
      />
    {/if}
  </div>
</div>
