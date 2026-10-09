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
  const field = "w-16 rounded-full border-2 border-sr-hairline bg-sr-panel text-base text-sr-ink text-center tabular-nums py-1 focus:outline-none focus:ring-2 focus:ring-sr-action";
  // Every option shows its numbers; one that is off is dimmed, not hidden.
  const item = (on: boolean) =>
    `flex flex-col gap-1.5 rounded-2xl bg-sr-panel px-3.5 py-2.5 text-sm text-sr-ink-2 transition-opacity ${on ? "" : "opacity-60"}`;
  // The numbers sit under the name, lined up with it past the checkbox.
  const nums = "flex flex-wrap items-center gap-1.5 pl-6";
  $: summary = anyOn
    ? [a.countIn.on && "count-in", a.ramp.on && "ramp", a.silent.on && "silent bars", a.drop.on && "dropped beats", a.limit.on && "time limit"].filter(Boolean).join(", ")
    : "count-in, tempo ramp, silent bars, dropped beats, time limit";
</script>

<div class="flex flex-col gap-3">
  {#if compact}
    <button type="button" class="flex items-center gap-2 text-left" aria-expanded={open} on:click={() => (open = !open)}>
      <span class="text-[15px] font-bold text-sr-ink">Practice</span>
      <span class="truncate text-[13px] text-sr-muted">{summary}</span>
      <span class="ml-auto text-[13px] font-bold text-sr-action-fg">{open ? "Hide" : "Show"}</span>
    </button>
  {/if}

  {#if live}
    <p class="text-sm font-bold text-sr-action-fg tabular-nums" role="status">
      {live.bar < 0 ? `Count-in ${a.countIn.bars + live.bar + 1}` : `Bar ${live.bar + 1}`} · {live.bpm} BPM{live.silent ? " · silent" : ""}{left !== null ? ` · ${mmss(left)} left` : ""}
    </p>
  {/if}

  {#if open || !compact}
    <div class="flex flex-col gap-2.5">
      <div class={item(a.countIn.on)}>
        <label class="name"><input type="checkbox" class="sr-check h-4 w-4" checked={a.countIn.on} on:change={(e) => set("countIn", { on: e.currentTarget.checked })} />Count-in</label>
        <div class={nums}>
          <input type="number" min="1" max="4" class={field} value={a.countIn.bars} on:change={(e) => set("countIn", { bars: num(e) })} aria-label="Count-in bars" />
          <span>{a.countIn.bars === 1 ? "bar" : "bars"} first</span>
        </div>
      </div>

      <div class={item(a.ramp.on)}>
        <label class="name"><input type="checkbox" class="sr-check h-4 w-4" checked={a.ramp.on} on:change={(e) => set("ramp", { on: e.currentTarget.checked })} />Tempo ramp</label>
        <div class={nums}>
          <span>{a.ramp.target >= $tuner.bpm ? "+" : "−"}</span>
          <input type="number" min="1" max="20" class={field} value={a.ramp.step} on:change={(e) => set("ramp", { step: num(e) })} aria-label="BPM each step" />
          <span>every</span>
          <input type="number" min="1" max="32" class={field} value={a.ramp.everyBars} on:change={(e) => set("ramp", { everyBars: num(e) })} aria-label="Bars between steps" />
          <span>bars to</span>
          <input type="number" min={BPM_MIN} max={BPM_MAX} class={field} value={a.ramp.target} on:change={(e) => set("ramp", { target: num(e) })} aria-label="Target tempo" />
        </div>
      </div>

      <div class={item(a.silent.on)}>
        <label class="name"><input type="checkbox" class="sr-check h-4 w-4" checked={a.silent.on} on:change={(e) => set("silent", { on: e.currentTarget.checked })} />Silent bars</label>
        <div class={nums}>
          <input type="number" min="1" max="16" class={field} value={a.silent.play} on:change={(e) => set("silent", { play: num(e) })} aria-label="Bars that click" />
          <span>on,</span>
          <input type="number" min="1" max="16" class={field} value={a.silent.mute} on:change={(e) => set("silent", { mute: num(e) })} aria-label="Silent bars" />
          <span>silent</span>
        </div>
      </div>

      <div class={item(a.drop.on)}>
        <label class="name"><input type="checkbox" class="sr-check h-4 w-4" checked={a.drop.on} on:change={(e) => set("drop", { on: e.currentTarget.checked })} />Dropped beats</label>
        <div class={nums}>
          <input type="range" min="5" max="75" step="5" class="sr-range w-28" value={a.drop.percent}
            on:input={(e) => set("drop", { percent: num(e) })} aria-label="Share of beats dropped" />
          <span class="tabular-nums">{a.drop.percent}%, never beat 1</span>
        </div>
      </div>

      <div class={item(a.limit.on)}>
        <label class="name"><input type="checkbox" class="sr-check h-4 w-4" checked={a.limit.on} on:change={(e) => set("limit", { on: e.currentTarget.checked })} />Time limit</label>
        <div class={nums}>
          <input type="number" min="1" max="120" class={field} value={a.limit.minutes} on:change={(e) => set("limit", { minutes: num(e) })} aria-label="Minutes" />
          <span>minutes</span>
        </div>
      </div>

      <p class="text-xs text-sr-muted">
        Silent bars and dropped beats also reach the click under an exercise. The count-in, ramp and time limit are the
        metronome's own; Drill ramps the tempo between exercises.
      </p>
    </div>
  {/if}
</div>

<style>
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: var(--sr-ink);
    cursor: pointer;
  }
</style>
