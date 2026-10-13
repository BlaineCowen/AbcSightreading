import { ensembleInstrument } from "./instruments";
import type { EnsembleMember } from "./arrange";
import { ENSEMBLE_KEYS } from "./generate";

/**
 * The Ensemble page's settings, and the link that carries them
 * (`/ensemble-sightreading?e=band-trumpet:2,band-horn:1&level=3&keys=Bb,F&meters=4/4&bars=8&bpm=80`).
 */
export type EnsembleSettings = {
  members: EnsembleMember[];
  /** UIL level 1-5: rhythms, chords, cadences and skips. */
  level: number;
  /** Concert keys; each exercise draws one. */
  keys: string[];
  meters: string[];
  measures: number;
  bpm: number;
};

export const ENSEMBLE_METERS = ["2/4", "3/4", "4/4"];
export const ENSEMBLE_LENGTHS = [4, 8, 16];

/** Ready-made groups, a tap to start from. */
export const ENSEMBLE_PRESETS: { id: string; label: string; members: EnsembleMember[]; keys: string[] }[] = [
  { id: "brass-quintet", label: "Brass quintet", keys: ["Bb", "Eb", "F"], members: [{ instrument: "band-trumpet", count: 2 }, { instrument: "band-horn", count: 1 }, { instrument: "band-trombone", count: 1 }, { instrument: "band-tuba", count: 1 }] },
  { id: "woodwind-quintet", label: "Woodwind quintet", keys: ["Bb", "Eb", "F"], members: [{ instrument: "band-flute", count: 1 }, { instrument: "band-oboe", count: 1 }, { instrument: "band-clarinet", count: 1 }, { instrument: "band-horn", count: 1 }, { instrument: "band-bassoon", count: 1 }] },
  { id: "sax-quartet", label: "Sax quartet", keys: ["Bb", "Eb", "F"], members: [{ instrument: "band-alto-sax", count: 2 }, { instrument: "band-tenor-sax", count: 1 }, { instrument: "band-bari-sax", count: 1 }] },
  { id: "concert-band", label: "Concert band", keys: ["Bb", "Eb", "F"], members: [
    { instrument: "band-flute", count: 2 }, { instrument: "band-oboe", count: 1 }, { instrument: "band-clarinet", count: 3 }, { instrument: "band-bassoon", count: 1 },
    { instrument: "band-alto-sax", count: 2 }, { instrument: "band-tenor-sax", count: 1 }, { instrument: "band-bari-sax", count: 1 },
    { instrument: "band-trumpet", count: 3 }, { instrument: "band-horn", count: 2 }, { instrument: "band-trombone", count: 2 }, { instrument: "band-euphonium", count: 1 }, { instrument: "band-tuba", count: 1 },
  ] },
  { id: "string-quartet", label: "String quartet", keys: ["D", "G", "C"], members: [{ instrument: "orch-violin", count: 2 }, { instrument: "orch-viola", count: 1 }, { instrument: "orch-cello", count: 1 }] },
  { id: "string-orchestra", label: "String orchestra", keys: ["D", "G", "C"], members: [{ instrument: "orch-violin", count: 4 }, { instrument: "orch-viola", count: 2 }, { instrument: "orch-cello", count: 2 }, { instrument: "orch-bass", count: 1 }] },
  { id: "satb", label: "SATB choir", keys: ["F", "G", "C"], members: [{ instrument: "soprano", count: 1 }, { instrument: "alto", count: 1 }, { instrument: "tenor", count: 1 }, { instrument: "bass", count: 1 }] },
  { id: "choir-strings", label: "Choir and strings", keys: ["F", "G", "D"], members: [{ instrument: "soprano", count: 1 }, { instrument: "alto", count: 1 }, { instrument: "tenor", count: 1 }, { instrument: "bass", count: 1 }, { instrument: "orch-violin", count: 2 }, { instrument: "orch-viola", count: 1 }, { instrument: "orch-cello", count: 1 }] },
];

export const DEFAULT_SETTINGS: EnsembleSettings = {
  members: ENSEMBLE_PRESETS[0].members,
  level: 3,
  keys: ENSEMBLE_PRESETS[0].keys,
  meters: ["4/4"],
  measures: 8,
  bpm: 80,
};

/** At most this many of one instrument, and in all (a full band fits). */
export const MAX_EACH = 12;
export const MAX_PLAYERS = 40;

/** Players in all. */
export const playerCount = (members: EnsembleMember[]) => members.reduce((a, m) => a + m.count, 0);

export function settingsQuery(s: EnsembleSettings): string {
  const q = new URLSearchParams({
    e: s.members.filter((m) => m.count > 0).map((m) => `${m.instrument}:${m.count}`).join(","),
    level: String(s.level),
    keys: s.keys.join(","),
    meters: s.meters.join(","),
    bars: String(s.measures),
    bpm: String(s.bpm),
  });
  return q.toString();
}

/** A link's settings, each one checked; anything missing or wrong keeps the default. */
export function settingsFromQuery(search: string): EnsembleSettings {
  const q = new URLSearchParams(search);
  const out: EnsembleSettings = { ...DEFAULT_SETTINGS };
  const members = (q.get("e") ?? "")
    .split(",")
    .map((x) => x.split(":"))
    .filter(([id, n]) => ensembleInstrument[id] && /^\d+$/.test(n ?? ""))
    .map(([id, n]) => ({ instrument: id, count: Math.min(MAX_EACH, Number(n)) }))
    .filter((m) => m.count > 0);
  if (playerCount(members) >= 2 && playerCount(members) <= MAX_PLAYERS) out.members = members;
  const level = Number(q.get("level"));
  if (Number.isInteger(level) && level >= 1 && level <= 5) out.level = level;
  const keys = (q.get("keys") ?? "").split(",").filter((k) => ENSEMBLE_KEYS.includes(k));
  if (keys.length) out.keys = keys;
  const meters = (q.get("meters") ?? "").split(",").filter((m) => ENSEMBLE_METERS.includes(m));
  if (meters.length) out.meters = meters;
  const bars = Number(q.get("bars"));
  if (ENSEMBLE_LENGTHS.includes(bars)) out.measures = bars;
  const bpm = Number(q.get("bpm"));
  if (bpm >= 40 && bpm <= 200) out.bpm = Math.round(bpm);
  return out;
}
