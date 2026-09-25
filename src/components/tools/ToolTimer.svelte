<script lang="ts">
  import { timer, startTimer, pauseTimer, setTimerMinutes, formatClock } from "../../lib/tools/timer";
  import { toolSettings, setTool } from "../../lib/tools/settings";
  import { exercisesThisSession } from "../../lib/tools/context";

  /** A practice timer, and how many exercises this session has read. */

  const PRESETS = [5, 10, 15, 20];
  function choose(minutes: number) {
    setTool({ timerMinutes: minutes });
    setTimerMinutes(minutes);
  }
  // First open: the saved length.
  if (!$timer.running && $timer.durationMs !== $toolSettings.timerMinutes * 60_000) {
    setTimerMinutes($toolSettings.timerMinutes);
  }
</script>

<h3 class="text-[15px] font-semibold text-sr-ink">Practice timer</h3>
<div class="text-5xl font-semibold text-center tabular-nums text-sr-ink leading-tight">{formatClock($timer.remainingMs)}</div>
<div class="flex justify-center gap-1.5">
  {#each PRESETS as m}
    <button class="sr-tok text-sm {$timer.durationMs === m * 60_000 ? 'sr-on' : ''}" on:click={() => choose(m)}>{m} min</button>
  {/each}
</div>
<p class="text-xs text-sr-muted text-center">
  {$exercisesThisSession} exercise{$exercisesThisSession === 1 ? "" : "s"} generated this session
</p>
<div class="flex gap-2">
  <button class="flex-1 h-11 rounded-lg border border-sr-hairline bg-sr-raise text-sr-ink-2 hover:border-sr-faint" on:click={() => setTimerMinutes($timer.durationMs / 60_000)}>Reset</button>
  <button class="flex-1 h-11 sr-btn font-semibold" on:click={() => ($timer.running ? pauseTimer() : startTimer())}>
    {$timer.running ? "Pause" : $timer.remainingMs < $timer.durationMs && $timer.remainingMs > 0 ? "Resume" : "Start"}
  </button>
</div>
