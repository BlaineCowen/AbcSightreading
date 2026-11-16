// Choir parts from a note list: which voice (soprano, alto, ...) sings each note. A pure module, so the page and
// Node checks share it. Notes: [{start, end, midi}], times in s.
//
// A note is given the part that keeps the parts' lines smooth: each part is a melody, near where that part sang
// a moment ago and before long after, in its usual range, never two notes at once and rarely crossing the part
// below. It starts from the order of the notes sounding together (top note soprano, and so on) and improves one
// note at a time (iterated conditional modes) until no note would rather change part.

// Usual ranges (MIDI), high to low, for each number of parts.
const RANGES = {
  1: [[40, 81]],
  2: [[55, 81], [40, 67]],
  3: [[60, 81], [53, 74], [40, 66]],
  4: [[60, 81], [53, 74], [48, 69], [40, 64]],
  5: [[62, 81], [58, 77], [53, 74], [48, 69], [40, 64]],
  6: [[62, 81], [58, 77], [53, 74], [48, 69], [43, 66], [38, 62]],
};
export const PART_NAMES = {
  1: ["Voice"], 2: ["Upper", "Lower"], 3: ["Soprano", "Alto", "Bass"], 4: ["Soprano", "Alto", "Tenor", "Bass"],
  5: ["Soprano 1", "Soprano 2", "Alto", "Tenor", "Bass"], 6: ["Soprano 1", "Soprano 2", "Alto", "Tenor", "Baritone", "Bass"],
};
export const PART_SHORT = {
  1: ["V"], 2: ["U", "L"], 3: ["S", "A", "B"], 4: ["S", "A", "T", "B"], 5: ["S1", "S2", "A", "T", "B"], 6: ["S1", "S2", "A", "T", "Bar", "B"],
};
export const MAX_PARTS = 6;

// Overlaps shorter than this (or than a quarter of the shorter note) are a legato handover in one voice, which a
// detector often draws with the notes touching, not two voices.
const SLACK = 0.12;
const overlap = (a, b) => Math.min(a.end, b.end) - Math.max(a.start, b.start);
// Two notes at one pitch overlapping are one voice the detector cut twice (a unison of two parts reads as one note).
const real = (a, b) => { const o = overlap(a, b); return a.midi !== b.midi && o > Math.max(SLACK, 0.25 * Math.min(a.end - a.start, b.end - b.start)) ? o : 0; };

// How many parts sing: the number of notes sounding together, 90th percentile over the time anything sounds.
export function guessParts(notes) {
  const ns = notes.filter((n) => n.end - n.start >= 0.15 && n.midi >= 36 && n.midi <= 88);
  if (!ns.length) return 4;
  const end = Math.max(...ns.map((n) => n.end)), counts = [];
  for (let t = 0; t < end; t += 0.05) { const c = ns.filter((n) => n.start <= t && t < n.end).length; if (c) counts.push(c); }
  counts.sort((a, b) => a - b);
  return Math.max(2, Math.min(MAX_PARTS, counts[Math.floor(0.9 * (counts.length - 1))] || 4));
}

// Notes sounding together, as order-keeping parts: the k parts' range centres matched to the m notes (sorted
// high to low) so the total distance is least, each note its own part (m <= k).
function byOrder(pitches, centre) {
  const m = pitches.length, k = centre.length;
  if (m > k) return pitches.map((_, r) => Math.round((r * (k - 1)) / Math.max(1, m - 1)));
  // best[r][v]: cost of notes r.. on parts v..
  const best = Array.from({ length: m + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let v = 0; v <= k; v++) best[m][v] = 0;
  for (let r = m - 1; r >= 0; r--) for (let v = k - 1; v >= 0; v--)
    best[r][v] = Math.min(best[r][v + 1], Math.abs(pitches[r] - centre[v]) + best[r + 1][v + 1]);
  const out = []; let v = 0;
  for (let r = 0; r < m; r++) {
    while (best[r][v + 1] <= Math.abs(pitches[r] - centre[v]) + best[r + 1][v + 1] && k - v - 1 >= m - r) v++;
    out.push(v++);
  }
  return out;
}

export const W = { range: 0.6, track: 0.35, lead: 0.25, same: 12, cross: 3, tess: 0.2, top: 2 };

/**
 * {part: part index per note (0 = highest), k}. k: number of parts (guessed if not given). keep: a part per note,
 * -1 where unknown: only those notes are assigned, the others stay as they are (a note added to a list already
 * assigned, or set by hand).
 */
export function assignParts(notes, k = guessParts(notes), { iterations = 10, start = null, keep = null } = {}) {
  const n = notes.length, ranges = RANGES[k], centre = ranges.map(([lo, hi]) => (lo + hi) / 2);
  const part = new Int32Array(n);
  if (!n) return { part, k };
  const order = notes.map((_, i) => i).sort((a, b) => notes[a].start - notes[b].start);
  // the notes each note sounds against, and its neighbours in time (for the parts' lines)
  const against = notes.map(() => []), near = notes.map(() => []);
  for (let x = 0; x < n; x++) {
    const a = notes[order[x]];
    for (let y = x + 1; y < n && notes[order[y]].start < a.end + 4; y++) {
      const b = notes[order[y]], o = real(a, b);
      if (o > 0) { against[order[x]].push([order[y], o]); against[order[y]].push([order[x], o]); }
      near[order[x]].push(order[y]); near[order[y]].push(order[x]);
    }
  }
  // start: order among the notes sounding at its middle
  for (const i of order) {
    const a = notes[i], t = (a.start + a.end) / 2;
    const now = notes.filter((b) => b.start <= t && t < b.end && (b === a || real(a, b) > 0)).sort((p, q) => q.midi - p.midi);
    part[i] = byOrder(now.map((b) => b.midi), centre)[now.indexOf(a)];
  }
  if (start) part.set(start);
  const fixed = notes.map((_, i) => !!keep && keep[i] >= 0 && keep[i] < k);
  if (keep) fixed.forEach((f, i) => f && (part[i] = keep[i]));
  const dur = (a) => Math.max(0.05, a.end - a.start);
  // How sure a note is a voice: a quiet note, and above all one an octave, twelfth or two octaves over a louder
  // note sounding with it (a harmonic the detector took for a note), may not push a voice out of its part.
  const cf = notes.map((a, i) => {
    const vel = a.velocity ?? 0.6;
    let c = Math.max(0.15, Math.min(1, (vel - 0.2) / 0.4));
    for (const [j, o] of against[i]) {
      const b = notes[j];
      if ([12, 19, 24, 28].includes(a.midi - b.midi) && (b.velocity ?? 0.6) >= vel + 0.1 && o >= 0.5 * dur(a)) { c *= 0.3; break; }
    }
    return c;
  });
  // the highest sure note sounding: in choral writing, nearly always the sopranos (it is the lower parts that rest)
  const top = notes.map((a, i) => cf[i] >= 0.5 && against[i].every(([j]) => cf[j] < 0.5 || notes[j].midi < a.midi));
  const cost = (i, v) => {
    const a = notes[i], [lo, hi] = ranges[v], d = dur(a);
    let c = W.range * d * Math.max(0, lo - a.midi, a.midi - hi) + W.tess * d * Math.abs(a.midi - tess[v]) + (top[i] && v ? W.top * d : 0);
    // where part v sings around this note: time-weighted mean of its other notes within ~4 s
    let sw = 0, sp = 0, prev = null, next = null;
    for (const j of near[i]) {
      if (part[j] !== v) continue;
      const b = notes[j], gap = Math.max(0, b.start - a.end, a.start - b.end), w = cf[j] * dur(b) * Math.exp(-gap / 2);
      sw += w; sp += w * b.midi;
      if (cf[j] < 0.5) continue;
      if (b.end <= a.start + SLACK && (!prev || b.end > prev.end)) prev = b;
      if (b.start >= a.end - SLACK && (!next || b.start < next.start)) next = b;
    }
    c += W.track * d * (sw > 0.05 ? Math.abs(a.midi - sp / sw) : Math.abs(a.midi - centre[v]) * 0.5);
    // the step from the note before and to the note after in this part, if close in time
    for (const b of [prev, next]) if (b) { const gap = Math.max(0, b.start - a.end, a.start - b.end); if (gap < 1.5) c += W.lead * d * Math.min(12, Math.abs(a.midi - b.midi)) * (1 - gap / 1.5); }
    c *= cf[i];
    for (const [j, o] of against[i]) {
      const b = notes[j], q = Math.min(cf[i], cf[j]);
      if (part[j] === v) c += W.same * o * q;
      else if ((a.midi > b.midi && v > part[j]) || (a.midi < b.midi && v < part[j])) c += W.cross * o * q * Math.min(3, Math.abs(a.midi - b.midi));
    }
    return c;
  };
  // A passage where one part rests can settle with the others all a part off (each line still smooth), which no
  // single note's move undoes: so whole passages are also tried a part up or down, or with two parts swapped.
  const end = Math.max(...notes.map((a) => a.end));
  const passages = [];
  for (const len of [2, 4, 8]) for (let t = 0; t < end; t += len / 2) {
    const inside = order.filter((i) => !fixed[i] && notes[i].start >= t && notes[i].start < t + len);
    if (inside.length) passages.push([inside, order.filter((i) => notes[i].end > t - 6 && notes[i].start < t + len + 6)]);
  }
  const remaps = [(v) => v + 1, (v) => v - 1];
  for (let v = 0; v + 1 < k; v++) remaps.push((u) => (u === v ? v + 1 : u === v + 1 ? v : u));
  const total = (around) => around.reduce((s, i) => s + cost(i, part[i]), 0);
  // each part's usual pitch in this piece: the duration-weighted mean of its notes, a little toward the prior
  const tess = centre.slice();
  const learn = () => {
    const sw = centre.map(() => 4), sp = centre.map((c) => 4 * c);
    notes.forEach((a, i) => { sw[part[i]] += cf[i] * dur(a); sp[part[i]] += cf[i] * dur(a) * a.midi; });
    centre.forEach((_, v) => (tess[v] = sp[v] / sw[v]));
  };
  learn();
  for (let it = 0; it < iterations; it++) {
    let changed = 0;
    learn();
    for (const i of order) {
      if (fixed[i]) continue;
      let best = part[i], bc = cost(i, best);
      for (let v = 0; v < k; v++) if (v !== part[i]) { const c = cost(i, v); if (c < bc - 1e-9) { bc = c; best = v; } }
      if (best !== part[i]) { part[i] = best; changed++; }
    }
    for (const [inside, around] of passages) {
      const was = inside.map((i) => part[i]);
      let e0 = total(around);
      for (const f of remaps) {
        const to = was.map(f);
        if (to.some((v) => v < 0 || v >= k)) continue;
        inside.forEach((i, q) => (part[i] = to[q]));
        const e = total(around);
        if (e < e0 - 1e-6) { e0 = e; was.splice(0, was.length, ...to); changed++; }
        else inside.forEach((i, q) => (part[i] = was[q]));
      }
    }
    if (!changed) break;
  }
  return { part, k, energy: total(order) };
}

/** The naive answer, for comparison: the note's rank (high to low) among the notes sounding at its middle. */
export function rankParts(notes, k) {
  return Int32Array.from(notes, (a) => {
    const t = (a.start + a.end) / 2;
    return Math.min(k - 1, notes.filter((b) => b !== a && b.start <= t && t < b.end && b.midi > a.midi).length);
  });
}

// --- timing: entries together ---
// A choir that comes in ragged: the onsets heard together (within `window` s of the first of them) are pulled
// toward one time, the group's median (or the onset of a part to follow), by an amount. Or toward a grid of a
// tempo, for music that has one. Notes carry {start, dt?, part?}; times as heard are start + dt.
const onset = (n) => n.start + (n.dt || 0);
const median = (v) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Groups of note indices whose onsets are heard together, in time order. */
export function ensembleOnsets(notes, window = 0.12) {
  const order = notes.map((_, i) => i).sort((a, b) => onset(notes[a]) - onset(notes[b]));
  const out = [];
  let cur = null;
  for (const i of order) {
    if (!cur || onset(notes[i]) - onset(notes[cur[0]]) > window) out.push((cur = [i]));
    else cur.push(i);
  }
  return out;
}

/**
 * Each note's new dt, its onset moved `strength` (0..1) of the way to its target. mode "ensemble": the median
 * onset of its group; "part": the onset of part `part` in the group (the median where that part is not in it);
 * "grid": the nearest line of a grid of `div` lines a beat at `bpm`, from `offset` s. Off the grid, a note heard
 * alone stays where it is.
 */
export function tighten(notes, strength, { mode = "ensemble", part = 0, bpm = 120, div = 2, window = 0.12, offset = 0 } = {}) {
  const dt = Float64Array.from(notes, (n) => n.dt || 0), step = 60 / bpm / div;
  for (const g of ensembleOnsets(notes, window)) {
    let target;
    if (mode === "grid") target = null;
    else if (g.length < 2) continue;
    else {
      const lead = mode === "part" ? g.filter((i) => notes[i].part === part) : [];
      target = median((lead.length ? lead : g).map((i) => onset(notes[i])));
    }
    for (const i of g) {
      const t = onset(notes[i]), to = target ?? offset + Math.round((t - offset) / step) * step;
      dt[i] += strength * (to - t);
    }
  }
  return dt;
}

/** How ragged the entries are: the mean, over groups of two or more onsets, of their spread (latest - earliest), s. */
export function onsetSpread(notes, window = 0.12) {
  const spreads = ensembleOnsets(notes, window).filter((g) => g.length > 1).map((g) => {
    const t = g.map((i) => onset(notes[i]));
    return Math.max(...t) - Math.min(...t);
  });
  return spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
}
