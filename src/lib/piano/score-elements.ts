/**
 * Each hand's notes as abcjs drew them, in order: staff 0 is the right hand,
 * staff 1 the left, and every note or rest is one element (a chord's notes
 * share one), so the n-th element of a hand is its n-th PianoNote. For the
 * grade's marks, the playback highlight and the scrolling line.
 */
export type Hand = "rh" | "lh";

export function noteElements(tune: any): Record<Hand, Element[][]> {
  const map: Record<Hand, Element[][]> = { rh: [], lh: [] };
  for (const line of tune?.lines ?? []) {
    (line.staff ?? []).forEach((staff: any, s: number) => {
      const hand: Hand = s === 0 ? "rh" : "lh";
      for (const voice of staff.voices ?? []) for (const el of voice) if (el.el_type === "note") map[hand].push(el.abselem?.elemset ?? []);
    });
  }
  return map;
}
