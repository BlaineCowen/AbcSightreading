<script lang="ts">
  import { onDestroy } from "svelte";
  import PitchHistory from "../tuner/PitchHistory.svelte";
  import SpectrumView from "./analysis/SpectrumView.svelte";
  import HarmonicsView from "./analysis/HarmonicsView.svelte";
  import VowelView from "./analysis/VowelView.svelte";
  import { pitchHistory } from "../../lib/tuner/pitch-history";
  import { tuner } from "../../lib/tuner/store";
  import { startTuner } from "../../lib/tuner/controller";
  import { NOTES } from "../../lib/tuner/pitch";
  import { voiceFrozen, watchVoice } from "../../lib/tools/voice-analysis";

  /**
   * Analysis, four ways, from the microphone alone:
   * - Pitch: the pitch trace, and what the last half minute adds up to.
   * - Spectrum: the live spectrum, with the outline, the harmonics and F1 and
   *   F2 as overlays.
   * - Harmonics: each harmonic's level, and what they say about the tone.
   * - Vowel: a guess at the vowel, on a vowel chart.
   */
  /** The abcTuner page's version: more room for the spectrum and bars. */
  export let large = false;

  type View = "pitch" | "spectrum" | "harmonics" | "vowel";
  const VIEWS: { id: View; label: string }[] = [
    { id: "pitch", label: "Pitch" },
    { id: "spectrum", label: "Spectrum" },
    { id: "harmonics", label: "Harmonics" },
    { id: "vowel", label: "Vowel" },
  ];
  const KEY = "sr-analysis-view";
  let view: View = "pitch";
  try {
    const saved = localStorage.getItem(KEY) as View | null;
    if (saved && VIEWS.some((v) => v.id === saved)) view = saved;
  } catch {}
  const choose = (v: View) => {
    view = v;
    voiceFrozen.set(false);
    try { localStorage.setItem(KEY, v); } catch {}
  };

  // Spectrum overlays.
  let outline = true;
  let marks = true;
  let formantLines = true;

  const stopWatching = watchVoice();
  onDestroy(stopWatching);

  // ── Pitch view ──
  const WINDOW_MS = 30_000;
  const IN_TUNE_CENTS = 10;
  let stats: { inTune: number; lean: number; worst: string | null; frames: number } | null = null;

  function measure() {
    const pts = pitchHistory.recent(WINDOW_MS).filter((p) => p.midi !== null);
    if (pts.length < 10) {
      stats = null;
      return;
    }
    const inTune = pts.filter((p) => Math.abs(p.cents) <= IN_TUNE_CENTS).length / pts.length;
    const lean = pts.reduce((a, p) => a + p.cents, 0) / pts.length;
    // The note sung furthest off on average, among notes held long enough to count.
    const byNote = new Map<number, number[]>();
    for (const p of pts) byNote.set(p.midi!, [...(byNote.get(p.midi!) ?? []), p.cents]);
    let worst: string | null = null;
    let worstOff = IN_TUNE_CENTS;
    for (const [midi, cs] of byNote) {
      if (cs.length < 8) continue;
      const off = Math.abs(cs.reduce((a, b) => a + b, 0) / cs.length);
      if (off > worstOff) {
        worstOff = off;
        worst = `${NOTES[midi % 12]}${Math.floor(midi / 12) - 1}`;
      }
    }
    stats = { inTune, lean, worst, frames: pts.length };
  }
  measure();
  const t = setInterval(measure, 500);
  onDestroy(() => clearInterval(t));
</script>

<div class="flex items-center justify-between gap-2">
  <h3 class="text-[15px] font-semibold text-sr-ink">Analysis</h3>
  {#if view !== "pitch" && $tuner.engineStatus === "running"}
    <button
      class="rounded-full px-3 py-1 text-xs font-bold {$voiceFrozen ? 'bg-sr-peach text-sr-peach-ink' : 'bg-sr-track text-sr-action-fg'}"
      on:click={() => voiceFrozen.update((f) => !f)}
      aria-pressed={$voiceFrozen}
    >{$voiceFrozen ? "Held · resume" : "Hold"}</button>
  {:else if view === "pitch"}
    <span class="text-xs text-sr-muted">last 30 seconds</span>
  {/if}
</div>

<div class="flex gap-1 p-1 rounded-full bg-sr-track" role="tablist" aria-label="Analysis views">
  {#each VIEWS as v}
    <button
      role="tab"
      aria-selected={view === v.id}
      class="flex-1 rounded-full py-1.5 text-xs font-bold transition-colors {view === v.id ? 'bg-sr-action text-sr-action-ink' : 'text-sr-muted hover:text-sr-ink'}"
      on:click={() => choose(v.id)}
    >{v.label}</button>
  {/each}
</div>

{#if $tuner.engineStatus !== "running"}
  <button class="sr-btn text-sm" on:click={startTuner}>Start microphone</button>
{/if}

{#if view === "pitch"}
  <PitchHistory compact={!large} />
  {#if stats}
    <div class="grid grid-cols-3 gap-2 text-center">
      <div>
        <div class="text-xl font-semibold text-sr-ink tabular-nums">{Math.round(stats.inTune * 100)}%</div>
        <div class="text-[11px] text-sr-muted">within {IN_TUNE_CENTS}¢</div>
      </div>
      <div>
        <div class="text-xl font-semibold tabular-nums {Math.abs(stats.lean) <= 5 ? 'text-green-600' : 'text-amber-600'}">{stats.lean > 0 ? "+" : ""}{Math.round(stats.lean)}¢</div>
        <div class="text-[11px] text-sr-muted">{Math.abs(stats.lean) <= 5 ? "centred" : stats.lean > 0 ? "leans sharp" : "leans flat"}</div>
      </div>
      <div>
        <div class="text-xl font-semibold text-sr-ink">{stats.worst ?? "·"}</div>
        <div class="text-[11px] text-sr-muted">{stats.worst ? "furthest off" : "no weak note"}</div>
      </div>
    </div>
  {:else}
    <p class="text-sm text-sr-muted text-center">Sing a few notes and the numbers appear here.</p>
  {/if}
{:else if view === "spectrum"}
  <SpectrumView {outline} {marks} {formantLines} height={large ? 300 : 180} />
  <div class="flex flex-wrap gap-1.5" role="group" aria-label="Show on the spectrum">
    <button class="sr-freq {outline ? 'sr-on' : ''}" aria-pressed={outline} on:click={() => (outline = !outline)}>Outline</button>
    <button class="sr-freq {marks ? 'sr-on' : ''}" aria-pressed={marks} on:click={() => (marks = !marks)}>Harmonics</button>
    <button class="sr-freq {formantLines ? 'sr-on' : ''}" aria-pressed={formantLines} on:click={() => (formantLines = !formantLines)}>F1 and F2</button>
  </div>
  <p class="text-xs text-sr-muted">
    The peaks are the note's harmonics. The outline through them is the shape your vowel gives the sound: its humps are
    the resonances F1 and F2.
  </p>
{:else if view === "harmonics"}
  <HarmonicsView {large} />
{:else}
  <VowelView />
{/if}
