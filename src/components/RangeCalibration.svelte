<script lang="ts">
  import { uilPresets } from "../lib/uil-presets";
  import RangeSelector from "./ui/rangeSelector.svelte";

  const levels = ["UIL 1", "UIL 2", "UIL 3", "UIL 4", "UIL 5"];
  const voices = ["Soprano", "Soprano1", "Soprano2", "Alto", "Tenor", "Baritone", "Bass", "Unison"];

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

  // Initialize from uil-presets voiceRanges
  let ranges: Record<string, Record<string, { min: number; max: number }>> = {};
  for (const level of levels) {
    ranges[level] = {};
    const voiceRanges = uilPresets[level].voiceRanges ?? {};
    for (const voice of voices) {
      const vr = voiceRanges[voice];
      ranges[level][voice] = vr ? { min: vr[0], max: vr[1] } : { min: 21, max: 28 };
    }
  }

  let activeLevel = "UIL 1";
  let jsonOutput = "";
  let copied = false;

  function handleRangeChange(level: string, voice: string, newRange: { min: number; max: number }) {
    ranges[level][voice] = newRange;
    ranges = ranges;
    jsonOutput = "";
    copied = false;
  }

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

<div class="w-full max-w-6xl px-4 pb-12">
  <!-- Level tabs -->
  <div class="flex gap-2 mb-6 flex-wrap">
    {#each levels as level}
      <button
        class="px-4 py-2 rounded font-semibold transition-colors {activeLevel === level
          ? 'bg-blue-600 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}"
        on:click={() => { activeLevel = level; jsonOutput = ""; }}
      >
        {level}
      </button>
    {/each}
  </div>

  <!-- Voice grid — re-mounts on tab switch to ensure abcjs renders correctly -->
  {#key activeLevel}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
      {#each voices as voice}
        <div class="flex flex-col items-center gap-1">
          <span class="font-semibold text-gray-800 text-sm">{voice}</span>
          <RangeSelector
            range={ranges[activeLevel][voice]}
            clef={voiceClefs[voice]}
            onRangeChange={(r) => handleRangeChange(activeLevel, voice, r)}
          />
          <span class="text-xs text-gray-500 font-mono">
            [{ranges[activeLevel][voice].min}, {ranges[activeLevel][voice].max}]
          </span>
        </div>
      {/each}
    </div>
  {/key}

  <!-- Export -->
  <div class="flex flex-col gap-3">
    <button
      class="px-6 py-3 font-semibold rounded self-start transition-colors {copied
        ? 'bg-green-500 text-white'
        : 'bg-green-600 text-white hover:bg-green-700'}"
      on:click={copyJson}
    >
      {copied ? "Copied!" : "Copy JSON"}
    </button>
    {#if jsonOutput}
      <textarea
        class="w-full h-64 font-mono text-xs p-3 border rounded bg-gray-50 resize-none"
        readonly
        value={jsonOutput}
        on:click={(e) => e.currentTarget.select()}
      />
    {/if}
  </div>
</div>
