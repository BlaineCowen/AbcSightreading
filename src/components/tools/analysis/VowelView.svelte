<script lang="ts">
  import { voiceReading } from "../../../lib/tools/voice-analysis";
  import { VOWELS, formantScale, RELIABLE_BELOW_HZ } from "../../../lib/tuner/voice-spectrum";

  /**
   * A guess at the vowel, from F1 and F2, and where the voice sits on a vowel
   * chart laid out the usual way: front vowels ([i]) to the left, back ([u],
   * [o]) to the right, closed at the top, open ([ɑ]) at the bottom. The five
   * choral vowels are drawn in IPA where a voice of this pitch puts them.
   */
  const W = 300, H = 190, PAD = 16;
  const F2_HI = 3000, F2_LO = 600, F1_LO = 200, F1_HI = 1100;
  const x = (f2: number) => PAD + (Math.log(F2_HI / f2) / Math.log(F2_HI / F2_LO)) * (W - 2 * PAD);
  const y = (f1: number) => PAD + (Math.log(f1 / F1_LO) / Math.log(F1_HI / F1_LO)) * (H - 2 * PAD);
  const clampX = (v: number) => Math.min(W - PAD, Math.max(PAD, v));
  const clampY = (v: number) => Math.min(H - PAD, Math.max(PAD, v));
  const COLORS: Record<string, string> = { ee: "var(--sr-sky)", eh: "var(--sr-mint)", ah: "var(--sr-peach)", oh: "var(--sr-butter)", oo: "var(--sr-tint)" };
  const INK: Record<string, string> = { ee: "var(--sr-sky-ink)", eh: "var(--sr-mint-ink)", ah: "var(--sr-peach-ink)", oh: "var(--sr-butter-ink)", oo: "var(--sr-action-fg)" };

  let trail: { x: number; y: number }[] = [];
  $: r = $voiceReading;
  $: scale = formantScale(r.f0 ?? 150);
  $: if (r.formants && r.f0) {
    const f2 = r.formants.f2 ?? 800 * scale;
    trail = [...trail, { x: clampX(x(f2)), y: clampY(y(r.formants.f1)) }].slice(-12);
  }
  $: if (!r.f0 && trail.length && !r.formants) trail = [];
  $: guess = r.vowel;
  $: info = guess ? VOWELS.find((v) => v.id === guess.vowel) : null;
  $: tooHigh = r.f0 !== null && r.f0 >= RELIABLE_BELOW_HZ;
</script>

<div class="flex items-center gap-3 min-h-[64px]">
  {#if tooHigh}
    <p class="text-sm font-semibold text-sr-ink-2">Too high to tell the vowels apart. Up here the harmonics are too far apart to show them, and a singer shapes them to the pitch.</p>
  {:else if info && guess}
    <span class="ipa rounded-[18px] px-4 py-2 text-3xl" style="background: {COLORS[info.id]}; color: {INK[info.id]}" aria-label="IPA {info.ipa}">[{info.ipa}]</span>
    <div class="flex flex-col">
      <span class="text-sm font-bold text-sr-ink">as in “{info.word}”</span>
      <span class="text-xs font-semibold text-sr-muted">{guess.confidence > 0.7 ? "a clear" : guess.confidence > 0.45 ? "a fair" : "a rough"} guess · F1 {Math.round(r.formants?.f1 ?? 0)}{r.formants?.f2 ? `, F2 ${Math.round(r.formants.f2)}` : ""} Hz</span>
    </div>
  {:else}
    <p class="text-sm font-semibold text-sr-muted">Sing a vowel on one steady note.</p>
  {/if}
</div>

<svg viewBox="0 0 {W} {H}" class="w-full rounded-[14px] bg-sr-track" role="img" aria-label="Vowel chart: where your vowel sits among i, ɛ, ɑ, o and u">
  <text x={PAD} y={H - 4} class="fill-sr-muted" font-size="9" font-weight="700">front</text>
  <text x={W - PAD} y={H - 4} text-anchor="end" class="fill-sr-muted" font-size="9" font-weight="700">back</text>
  <text x={W - 4} y={PAD + 4} text-anchor="end" class="fill-sr-muted" font-size="9" font-weight="700">closed</text>
  <text x={W - 4} y={H - 18} text-anchor="end" class="fill-sr-muted" font-size="9" font-weight="700">open</text>
  {#each VOWELS as v}
    <g>
      <circle cx={clampX(x(v.f2 * scale))} cy={clampY(y(v.f1 * scale))} r="17" style="fill: {COLORS[v.id]}" opacity={guess?.vowel === v.id ? 1 : 0.75} />
      <text x={clampX(x(v.f2 * scale))} y={clampY(y(v.f1 * scale)) + 5} text-anchor="middle" font-size="15" class="ipa" style="fill: {INK[v.id]}">{v.ipa}</text>
    </g>
  {/each}
  {#each trail as p, i}
    <circle cx={p.x} cy={p.y} r={i === trail.length - 1 ? 6 : 2.5} class="fill-sr-action" opacity={i === trail.length - 1 ? 1 : 0.2 + (0.5 * i) / trail.length} />
  {/each}
</svg>
<p class="text-xs text-sr-muted">
  Worked out from the voice's first two resonances. Best on steady, sustained vowels in the low and middle voice.
</p>

<style>
  /* A face with every IPA vowel: the site's fonts lack some (ɛ, ɑ). */
  .ipa {
    font-family: "Noto Sans", "Charis SIL", "Doulos SIL", "Gentium Plus", "Lucida Grande", "Segoe UI", system-ui, sans-serif;
    font-weight: 600;
  }
</style>

