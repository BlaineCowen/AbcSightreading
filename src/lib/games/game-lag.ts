/**
 * How late each student's taps land in a class rhythm game, and taking it off
 * (Games, 2 November 2026). Taps are stamped on the server clock (Live's
 * clockOffset), but three delays no browser reports stay in them: the big
 * screen's speakers (HDMI, Bluetooth), the sound crossing the room, and each
 * device's touch. Together they are steady for each student, so every round
 * measures them: everyone taps along with the count-in ("1, 2, Ready, Go"),
 * and the median of (tap minus click) is that student's lag. A student who did not
 * tap it takes the room's lag (the speakers are the same for everyone).
 *
 * Lining up on the first note instead would forgive a wrong first note and
 * shift every note after it; the count-in measures the same delay without
 * touching anything graded.
 */

/** Lag is clamped to this: a tap far outside it is not the click it is near. */
export const LAG_MIN_MS = -100;
export const LAG_MAX_MS = 350;
/** Taps needed in the count-in bar for a lag of one's own. */
export const MIN_COUNT_IN_TAPS = 2;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (x: number) => Math.max(LAG_MIN_MS, Math.min(LAG_MAX_MS, x));

/**
 * A student's lag from the count-in: each click takes the nearest tap within
 * its window (a little before, up to LAG_MAX_MS or three quarters of a beat
 * after, whichever is less, so the bar's last click never takes the first
 * note's tap), each tap once. Returns the lag (null with too few taps) and
 * the taps used, which are not graded.
 */
export function countInLag(taps: number[], clicks: number[], beatMs: number): { lag: number | null; used: Set<number> } {
  const used = new Set<number>();
  const offsets: number[] = [];
  const after = Math.min(LAG_MAX_MS, 0.75 * beatMs);
  const before = Math.min(-LAG_MIN_MS, 0.4 * beatMs);
  for (const c of clicks) {
    let best: number | null = null;
    for (const t of taps) {
      if (used.has(t) || t < c - before || t > c + after) continue;
      if (best === null || Math.abs(t - c) < Math.abs(best - c)) best = t;
    }
    if (best !== null) {
      used.add(best);
      offsets.push(best - c);
    }
  }
  return { lag: offsets.length >= MIN_COUNT_IN_TAPS ? clamp(median(offsets)) : null, used };
}

/** The room's lag: the median of the students who measured one, or null if none did. */
export function roomLag(lags: (number | null)[]): number | null {
  const known = lags.filter((l): l is number => l !== null);
  return known.length ? clamp(median(known)) : null;
}
