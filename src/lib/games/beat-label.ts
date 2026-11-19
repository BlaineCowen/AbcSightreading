/**
 * A note's length in beats, written short for Tap the rhythm's lane
 * (Blaine, 19 November 2026: "a way to show beat values on the bars"):
 * 1, 2, ½, 1½, ¼, ¾, and in compound meter (a dotted quarter beat) ⅓ and ⅔.
 */
const PARTS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 6, "⅙"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [5 / 6, "⅚"],
  [7 / 8, "⅞"],
];

export function beatLabel(beats: number): string {
  if (!(beats > 0)) return "";
  const whole = Math.floor(beats + 1e-6);
  const rest = beats - whole;
  if (rest < 1e-6) return String(whole);
  const part = PARTS.find(([v]) => Math.abs(v - rest) < 1e-3);
  if (!part) return String(Math.round(beats * 100) / 100);
  return whole ? `${whole}${part[1]}` : part[1];
}
