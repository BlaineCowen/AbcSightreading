/**
 * Every step of every curriculum track generates: the rhythm drill and the
 * note exercise, RUNS times each, with the settings the Unison page applies
 * (src/lib/curriculum). A note exercise must stay inside its placed range and
 * use at least three pitches (a line stuck on one or two notes "succeeds").
 *
 *   bun run scripts/check-tracks.ts            # every track
 *   TRACK=band-tuba RUNS=40 bun run scripts/check-tracks.ts
 */
import { createNewSr } from "../src/lib/generateUnison";
import { timeSignatureFor } from "../src/lib/meter";
import { selectableRhythmsFor } from "../src/lib/selectable-rhythms";
import { meterKindOf } from "../src/lib/meter";
import { TRACKS } from "../src/lib/curriculum/tracks";
import { placeRange } from "../src/lib/curriculum/range";
import type { Track, TrackPart } from "../src/lib/curriculum/types";

const RUNS = Number(process.env.RUNS ?? 20);
const quiet = () => {};

function generate(track: Track, part: TrackPart) {
  const meter = part.meters[Math.floor(Math.random() * part.meters.length)];
  const key = part.keys ? part.keys[Math.floor(Math.random() * part.keys.length)] : "C";
  const range = part.span ? placeRange(part.span, key, track.anchor, track.range)! : { min: 14, max: 21 };
  const pool = selectableRhythmsFor(meterKindOf(meter));
  const saved = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: quiet, warn: quiet, error: quiet });
  try {
    const out: any = createNewSr({
      bpm: part.bpm, tempo: part.bpm, clef: track.clef, selectedClef: track.clef,
      timeSig: timeSignatureFor(meter), selectedTimeSignature: meter,
      measures: part.measures, maxSkip: part.maxSkip ?? 2, range,
      rhythms: pool.filter((r) => part.rhythms.includes(r.name)), selectedRhythms: part.rhythms,
      scaleDegrees: part.scaleDegrees ?? [1, 3, 5], selectedSharpDegrees: part.sharps ?? [], selectedFlatDegrees: part.flats ?? [],
      key, showSolfege: !part.rhythmOnly, lyricSystem: "movable", rhythmOnly: part.rhythmOnly,
      showRhythmSyllables: part.rhythmOnly, syllableSystemId: "counting",
      moveOnEighthNotes: true, accidentalsFollowStep: true, allowTiesAcrossBarline: part.ties, progressions: part.progressions ?? true,
      partsObject: { numofParts: 1, parts: { Unison: { order: 0, smallName: "U" } } },
    });
    return { out, range, key, meter };
  } finally {
    Object.assign(console, saved);
  }
}

let failures = 0;
for (const track of TRACKS) {
  if (process.env.TRACK && process.env.TRACK !== track.id) continue;
  for (const step of track.steps) {
    for (const [kind, part] of [["rhythm", step.rhythm], ["notes", step.notes]] as const) {
      if (!part) continue;
      let failed = 0, outOfRange = 0, stuck = 0;
      const errors = new Set<string>();
      for (let i = 0; i < RUNS; i++) {
        try {
          const { out, range } = generate(track, part);
          const score = out?.[2];
          if (!out?.[0] || !score) { failed++; continue; }
          if (!part.rhythmOnly) {
            const notes = Object.values<any>(score.partsObject.parts)[0].chordNoteObject.filter((n: any) => !n.rhythm?.rest);
            if (notes.some((n: any) => n.pitchValue < range.min || n.pitchValue > range.max)) outOfRange++;
            if (new Set(notes.map((n: any) => n.pitchValue)).size < Math.min(3, part.scaleDegrees?.length ?? 3)) stuck++;
          }
        } catch (e: any) {
          failed++;
          errors.add(String(e?.message ?? e).slice(0, 90));
        }
      }
      const bad = failed + outOfRange + stuck;
      failures += bad;
      const tag = `${track.id} ${String(step.number).padStart(2)} ${kind.padEnd(6)}`;
      console.log(bad ? `FAIL ${tag} failed ${failed} out-of-range ${outOfRange} stuck ${stuck} ${[...errors].join(" | ")}` : `ok   ${tag}`);
    }
  }
}
console.log(failures ? `\n${failures} problem(s)` : "\nevery step of every track generates");
process.exit(failures ? 1 : 0);
