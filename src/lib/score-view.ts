/**
 * How the score is laid out on a practice page, chosen from the playback
 * bar's Layout menu (and kept in full screen, for a TV): its size, the bars
 * on a line, and the room between the lines. Remembered per page in this
 * browser. Size is the drawn scale (2 is the desktop default: the staff is
 * drawn at half the page's width and abcjs scales it to fill it); bars
 * per line overrides score-layout's choice; spacing is ABC's %%staffsep.
 */
export type LineSpacing = "tight" | "normal" | "wide";
export type ScoreView = { scale: number; bars: number | null; spacing: LineSpacing };

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 5;
export const BAR_CHOICES = [1, 2, 3, 4, 6] as const;
/** The room between systems, in ABC points (abcjs's default is about 46). */
const STAFFSEP: Record<LineSpacing, number | null> = { tight: 30, normal: null, wide: 90 };

const key = (page: string) => `sr-score-view-${page}`;

export function loadScoreView(page: string, defaults: ScoreView): ScoreView {
  try {
    const saved = JSON.parse(localStorage.getItem(key(page)) ?? "null");
    if (saved && typeof saved === "object") {
      return {
        scale: clampScale(Number(saved.scale) || defaults.scale),
        bars: BAR_CHOICES.includes(saved.bars) ? saved.bars : null,
        spacing: saved.spacing in STAFFSEP ? saved.spacing : defaults.spacing,
      };
    }
  } catch {}
  return defaults;
}

export function saveScoreView(page: string, view: ScoreView) {
  try {
    localStorage.setItem(key(page), JSON.stringify(view));
  } catch {}
}

export const clampScale = (s: number) => Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, s)) * 10) / 10;

/** The tune with the chosen room between its lines, written into its header (after X:). */
export function withLineSpacing(abc: string, spacing: LineSpacing): string {
  const sep = STAFFSEP[spacing];
  if (sep === null || !abc) return abc;
  return abc.replace(/^(X:.*)$/m, `$1\n%%staffsep ${sep}`);
}
