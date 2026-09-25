<script lang="ts">
  import { tuner } from "../../lib/tuner/store";

  const MIN_DB = -60;
  $: pct = Math.min(100, Math.max(0, (($tuner.dbfs - MIN_DB) / -MIN_DB) * 100));
  $: color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-400" : "bg-green-500";
</script>

<div class="flex items-center gap-3 text-xs text-sr-muted">
  <span class="w-12">Level</span>
  <div class="flex-1 h-2 rounded bg-sr-track overflow-hidden">
    <div class="h-full {color} transition-[width] duration-75" style="width: {pct}%"></div>
  </div>
  <span class="w-14 text-right font-mono">{Number.isFinite($tuner.dbfs) ? `${$tuner.dbfs.toFixed(0)} dB` : "—"}</span>
</div>
