/**
 * How many bars go on a line of the score (tests: score-layout.test.ts).
 *
 * abcjs fills each line with the number it is asked for and leaves whatever
 * is over to the last line, so asking for 3 with 4 bars drew 3 and a lonely 1.
 * This picks a number that shares the bars out evenly: the last line is at
 * most one bar short.
 *
 * The preference is only that: when the notes need more room than it allows,
 * abcjs breaks the lines itself, unevenly (8 bars as 3 + 2 + 3). The pages
 * then draw once more with `most` set to the most abcjs fitted on a line
 * (drawnLines, evenLines).
 *
 * The most a line holds: 4, or 3 when the music is dense (words under every
 * note, or sixteenths, need the room: at 4, rhythm syllables were pushed onto
 * a second row), or 2 on a phone.
 */
export function measuresPerLine(o: { measures: number; narrow: boolean; dense: boolean; most?: number }): number {
  const cap = Math.max(1, Math.min(o.narrow ? 2 : o.dense ? 3 : 4, o.most ?? Infinity));
  const m = Math.max(1, Math.round(o.measures));
  if (m <= cap) return m;
  const even = (p: number) => m % p === 0 || m % p >= p - 1;
  if (even(cap)) return cap;
  for (let p = cap - 1; p >= 2; p--) if (even(p)) return p;
  return cap;
}

/**
 * Words under the notes, or a sixteenth anywhere. The score is written with
 * L:1/32, so a sixteenth is a note of length 2.
 */
export function isDense(o: { lyrics: boolean; abc: string }): boolean {
  return o.lyrics || /[A-Ga-gz][,']*2(?![0-9])/.test(o.abc);
}

/**
 * The bars in an ABC tune: the first voice's barlines (a Choral score gives
 * each voice its own "[V:...]" lines; a Unison one has a single voice after
 * its K: line). Lyric (w:) and comment lines are skipped.
 */
export function barCount(abc: string): number {
  const lines = abc.split("\n");
  const body = lines.slice(lines.findIndex((l) => /^K:/.test(l)) + 1).filter((l) => l.trim() && !/^(w:|%)/.test(l.trim()));
  const firstVoice = body.find((l) => l.startsWith("[V:"))?.match(/^\[V:[^\]]+\]/)?.[0];
  const music = firstVoice ? body.filter((l) => l.startsWith(firstVoice)) : body.filter((l) => !/^[A-Za-z]:/.test(l));
  return music.reduce((n, l) => n + (l.match(/\|\]|\|\||\|/g)?.length ?? 0), 0);
}

/**
 * Whether lines drawn are shared out evenly: every line but the last the same,
 * and the last no longer than them and at most one short.
 */
export function evenLines(drawn: number[]): boolean {
  if (drawn.length <= 1) return true;
  const first = drawn[0], last = drawn[drawn.length - 1];
  return drawn.slice(0, -1).every((n) => n === first) && last <= first && first - last <= 1;
}

/**
 * The bars per line abcjs actually drew, read from the classes it gives each
 * note (abcjs-l<line>, abcjs-m<bar>). Browser only.
 */
export function drawnLines(container: Element | null): number[] {
  if (!container) return [];
  const per = new Map<number, Set<number>>();
  container.querySelectorAll(".abcjs-note, .abcjs-rest").forEach((el) => {
    const cls = el.getAttribute("class") ?? "";
    const l = cls.match(/abcjs-l(\d+)/)?.[1];
    const m = cls.match(/abcjs-m(\d+)/)?.[1];
    if (l === undefined || m === undefined) return;
    if (!per.has(+l)) per.set(+l, new Set());
    per.get(+l)!.add(+m);
  });
  return [...per.entries()].sort((a, b) => a[0] - b[0]).map(([, ms]) => ms.size);
}

