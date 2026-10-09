<!-- The metronome's practice assistant (practice-assistant.ts): count-in,
     tempo ramp, silent bars, dropped beats and a time limit, each a switch
     with its numbers. Folds away; opens by itself when anything is on. -->
<script lang="ts">
  import { tuner } from "../../lib/tuner/store";
  import { BPM_MAX, BPM_MIN } from "../../lib/tuner/metronome";
  import type { AssistantSettings } from "../../lib/tuner/practice-assistant";

  export let compact = false;

  $: a = $tuner.assistant;
  $: anyOn = a.countIn.on || a.ramp.on || a.silent.on || a.drop.on || a.limit.on;
  let open = false;
  $: if (anyOn) open = true;
  $: live = $tuner.metronomeRunning ? $tuner.metronomeLive : null;
  $: left = live && a.limit.on ? Math.max(0, a.limit.minutes * 60 - live.seconds) : null;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const set = <K extends keyof AssistantSettings>(part: K, patch: Partial<AssistantSettings[K]>) => tuner.setAssistant(part, patch);
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
  const field = "w-14 rounded-lg border border-sr-hairline bg-sr-raise text-sr-ink text-center tabular-nums py-1 focus:outline-none focus:ring-2 focus:ring-sr-action";
  const row = "flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-sr-ink-2";
</script>

<div class="flex flex-col gap-2 rounded-[20px] bg-sr-track p-4">
  <button type="button" class="flex items-center gap-2 text-left" aria-expanded={open} on:click={() => (open = !open)}>
    <span class="text-[15px] font-bold text-sr-ink">Practice</span>
    <span class="text-[13px] text-sr-muted truncate">
      {anyOn ? [a.countIn.on && "count-in", a.ramp.on && "ramp", a.silent.on && "silent bars", a.drop.on && "dropped beats", a.limit.on && "time limit"].filter(Boolean).join(", ") : "count-in, tempo ramp, silent bars, dropped beats, time limit"}
    </span>
    <span class="ml-auto text-sr-action-fg text-[13px] font-bold">{open ? "Hide" : "Show"}</span>
  </button>

  {#if live}
    <p class="text-xs font-bold text-sr-action-fg tabular-nums" role="status">
      {live.bar < 0 ? `Count-in ${a.countIn.bars + live.bar + 1}` : `Bar ${live.bar + 1}`} · {live.bpm} BPM{live.silent ? " · silent" : ""}{left !== null ? ` · ${mmss(left)} left` : ""}
    </p>
  {/if}

  {#if open}
    <div class="flex flex-col gap-3 pt-1">
      <label class={row}>
        <input type="checkbox" class="sr-check" checked={a.countIn.on} on:change={(e) => set("countIn", { on: e.currentTarget.checked })} />
        <span class="font-semibold text-sr-ink">Count-in</span>
        <input type="number" min="1" max="4" class={field} value={a.countIn.bars} on:change={(e) => set("countIn", { bars: num(e) })} aria-label="Count-in bars" />
        <span>{a.countIn.bars === 1 ? "bar" : "bars"} before it starts</span>
      </label>

      <label class={row}>
        <input type="checkbox" class="sr-check" checked={a.ramp.on} on:change={(e) => set("ramp", { on: e.currentTarget.checked })} />
        <span class="font-semibold text-sr-ink">Tempo ramp</span>
        <span>{a.ramp.target >= $tuner.bpm ? "+" : "−"}</span>
        <input type="number" min="1" max="20" class={field} value={a.ramp.step} on:change={(e) => set("ramp", { step: num(e) })} aria-label="BPM each step" />
        <span>BPM every</span>
        <input type="number" min="1" max="32" class={field} value={a.ramp.everyBars} on:change={(e) => set("ramp", { everyBars: num(e) })} aria-label="Bars between steps" />
        <span>bars, to</span>
        <input type="number" min={BPM_MIN} max={BPM_MAX} class={field} value={a.ramp.target} on:change={(e) => set("ramp", { target: num(e) })} aria-label="Target tempo" />
      </label>

      <label class={row}>
        <input type="checkbox" class="sr-check" checked={a.silent.on} on:change={(e) => set("silent", { on: e.currentTarget.checked })} />
        <span class="font-semibold text-sr-ink">Silent bars</span>
        <span>play</span>
        <input type="number" min="1" max="16" class={field} value={a.silent.play} on:change={(e) => set("silent", { play: num(e) })} aria-label="Bars that click" />
        <span>then silent for</span>
        <input type="number" min="1" max="16" class={field} value={a.silent.mute} on:change={(e) => set("silent", { mute: num(e) })} aria-label="Silent bars" />
      </label>

      <div class={row}>
        <label class="flex items-center gap-2">
          <input type="checkbox" class="sr-check" checked={a.drop.on} on:change={(e) => set("drop", { on: e.currentTarget.checked })} />
          <span class="font-semibold text-sr-ink">Dropped beats</span>
        </label>
        <input type="range" min="5" max="75" step="5" class="sr-range {compact ? 'w-28' : 'w-40'}" value={a.drop.percent}
          on:input={(e) => set("drop", { percent: num(e) })} aria-label="Share of beats dropped" />
        <span class="tabular-nums">{a.drop.percent}% of beats, never beat 1</span>
      </div>

      <label class={row}>
        <input type="checkbox" class="sr-check" checked={a.limit.on} on:change={(e) => set("limit", { on: e.currentTarget.checked })} />
        <span class="font-semibold text-sr-ink">Time limit</span>
        <span>stop after</span>
        <input type="number" min="1" max="120" class={field} value={a.limit.minutes} on:change={(e) => set("limit", { minutes: num(e) })} aria-label="Minutes" />
        <span>minutes</span>
      </label>

      <p class="text-[11px] text-sr-faint">
        Silent bars and dropped beats also reach the click under an exercise. The count-in, ramp and time limit are the
        metronome's own; Drill ramps the tempo between exercises.
      </p>
    </div>
  {/if}
</div>
