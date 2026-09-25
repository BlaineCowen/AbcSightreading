<script lang="ts">
  import { onDestroy } from "svelte";
  import PitchHistory from "../tuner/PitchHistory.svelte";
  import { pitchHistory } from "../../lib/tuner/pitch-history";
  import { tuner } from "../../lib/tuner/store";
  import { startTuner } from "../../lib/tuner/controller";
  import { NOTES } from "../../lib/tuner/pitch";

  /**
   * Analysis: the pitch trace, and what it adds up to over the last half
   * minute of singing - how much of it was in tune, which way it leans, and
   * the note that was furthest off. Measured from the microphone alone; it does
   * not yet know what the score asked for.
   */

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

<div class="flex items-baseline justify-between">
  <h3 class="text-[15px] font-semibold text-sr-ink">Analysis</h3>
  <span class="text-xs text-sr-muted">last 30 seconds</span>
</div>

{#if $tuner.engineStatus !== "running"}
  <button class="sr-btn text-sm" on:click={startTuner}>Start microphone</button>
{/if}

<PitchHistory compact />

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
      <div class="text-xl font-semibold text-sr-ink">{stats.worst ?? "—"}</div>
      <div class="text-[11px] text-sr-muted">{stats.worst ? "furthest off" : "no weak note"}</div>
    </div>
  </div>
{:else}
  <p class="text-sm text-sr-muted text-center">Sing a few notes and the numbers appear here.</p>
{/if}
