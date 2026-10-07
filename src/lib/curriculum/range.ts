import { rangeForSpan } from "../ladder";
import type { Span } from "../unison-pools";

/**
 * Where a track step reads for one key: its span around do (rangeForSpan,
 * do the first tonic at or above the instrument's anchor), kept inside the
 * instrument's written range, so no key carries a beginner past it (a low G
 * trumpet, a clarinet over the break). Do itself is always inside: the
 * anchor and range are chosen so (tests/unit/curriculum.test.ts).
 */
export function placeRange(span: Span, key: string, anchor: number, limit?: { min: number; max: number } | null) {
  const r = rangeForSpan(span, key, anchor);
  if (!r) return null;
  if (!limit) return r;
  return { min: Math.max(r.min, limit.min), max: Math.min(r.max, limit.max) };
}
