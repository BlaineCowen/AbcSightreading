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
export function measuresPerLine(o: { measures: number; narrow: boolean; dense: boolean; most?: number; want?: number | null }): number {
  // The reader's own choice (the Layout menu), up to the bars there are and
  // no more than abcjs managed to fit last time (`most`).
  if (o.want) return Math.max(1, Math.min(o.want, Math.round(o.measures) || o.want, o.most ?? Infinity));
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
 * Whether the tune opens with a pickup: its first voice's first bar shorter
 * than the meter (a Choral score, every length written out in L:1/32).
 */
export function hasPickup(abc: string): boolean {
  const meter = abc.match(/^M:\s*(\d+)\/(\d+)/m);
  if (!meter || !/^L:\s*1\/32/m.test(abc)) return false;
  const bar = (Number(meter[1]) * 32) / Number(meter[2]);
  const first = abc.split("\n").find((l) => l.startsWith("[V:"));
  const opening = first?.replace(/^\[V:[^\]]+\]/, "").replace(/"[^"]*"/g, "").replace(/![^!]*!/g, "").split("|")[0];
  if (!opening) return false;
  const length = [...opening.matchAll(/[A-Ga-gz][,']*(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  return length > 0 && length < bar;
}

/**
 * A Choral score with a pickup, its lines broken in the ABC itself:
 * `perLine` whole bars a line, the pickup in front of the first. abcjs's
 * preferred bars a line count the pickup as a bar (a line came out short),
 * and its wrapping numbers bars afresh, so the pickup's bar 0 was lost; its
 * `lineBreaks` list did nothing. Each voice's "[V:..]" line and its "w:"
 * line are cut at the same bars (a syllable a sung note), and the first
 * whole bar is numbered 1 (`%%setbarnb 0` after the first voice is named;
 * in the header, with voices, abcjs throws on it).
 *
 * Returns null if the score is not in the shape expected, so the page can
 * fall back to abcjs's own wrapping.
 */
export function withPickupLines(abc: string, perLine: number): string | null {
  const lines = abc.split("\n");
  const firstVoice = lines.findIndex((l) => l.startsWith("[V:"));
  if (firstVoice < 0 || perLine < 1) return null;
  const head = lines.slice(0, firstVoice);
  type Voice = { tag: string; bars: string[]; words: string[][] | null };
  const voices: Voice[] = [];
  /** Sung notes in a bar: a letter and a length, chord symbols and decorations left out. */
  const sung = (bar: string) => bar.replace(/"[^"]*"/g, "").replace(/![^!]*!/g, "").match(/[\^_=]*[A-Ga-g][,']*\d+/g)?.length ?? 0;
  for (let i = firstVoice; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const tag = line.match(/^\[V:[^\]]+\]/)?.[0];
    if (!tag) return null;
    const music = line.slice(tag.length).trim().replace(/\|\]\s*$/, "");
    const bars = music.split("|").map((b) => b.trim());
    let words: string[][] | null = null;
    if (lines[i + 1]?.startsWith("w:")) {
      const syllables = lines[++i].slice(2).trim().split(/\s+/).filter(Boolean);
      words = [];
      let k = 0;
      for (const bar of bars) {
        const n = sung(bar);
        words.push(syllables.slice(k, k + n));
        k += n;
      }
      if (k !== syllables.length) return null;
    }
    voices.push({ tag, bars, words });
  }
  if (!voices.length || voices.some((v) => v.bars.length !== voices[0].bars.length)) return null;
  const total = voices[0].bars.length;
  const out = [...head, voices[0].tag.replace(/^\[(V:[^\]]+)\]$/, "$1"), "%%setbarnb 0"];
  for (let from = 0; from < total; ) {
    const to = Math.min(total, from === 0 ? perLine + 1 : from + perLine);
    for (const v of voices) {
      out.push(`${v.tag} ${v.bars.slice(from, to).join(" | ")} ${to === total ? "|]" : "|"}`);
      if (v.words) out.push(`w: ${v.words.slice(from, to).flat().join(" ")}`);
    }
    from = to;
  }
  return out.join("\n") + "\n";
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

