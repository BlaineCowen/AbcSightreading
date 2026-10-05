/**
 * Writes REAPER projects around the saved Session Guitarist state
 * (scripts/guitar/template.RPP: Kontakt 8 with the patch and its patterns,
 * saved by hand once) and renders them from the command line. REAPER's
 * project format is plain text, so the MIDI is written here directly.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, resolve } from "path";

export const TPQ = 960;
export const REAPER = "/Applications/REAPER.app/Contents/MacOS/REAPER";
const TEMPLATE = resolve(import.meta.dir, "template.RPP");

/** A MIDI note: when (quarter notes from the start), how long, which key, how hard. */
export interface MidiNote {
  at: number;
  len: number;
  key: number;
  vel?: number;
}

/** One MIDI item's source: events as REAPER writes them (delta ticks, hex bytes). */
function midiSource(notes: MidiNote[], lengthQn: number): string {
  const ev: { t: number; s: string }[] = [];
  for (const n of notes) {
    const on = Math.round(n.at * TPQ);
    const off = Math.round((n.at + n.len) * TPQ);
    ev.push({ t: on, s: `90 ${n.key.toString(16).padStart(2, "0")} ${(n.vel ?? 100).toString(16).padStart(2, "0")}` });
    ev.push({ t: off, s: `80 ${n.key.toString(16).padStart(2, "0")} 00` });
  }
  // Offs before ons at the same tick, so a re-struck chord is not cut by its
  // own release; ons low to high, as a player's hand lands. Session Guitarist
  // reads a chord from the order its notes arrive: G B D sent G, B, D-below
  // played one strum and stopped, the same notes low to high the pattern.
  const isOff = (e: { s: string }) => e.s.startsWith("80");
  const keyOf = (e: { s: string }) => parseInt(e.s.split(" ")[1], 16);
  ev.sort((a, b) => a.t - b.t || (isOff(a) === isOff(b) ? keyOf(a) - keyOf(b) : isOff(a) ? -1 : 1));
  let last = 0;
  const lines = ev.map((e) => {
    const line = `        E ${e.t - last} ${e.s}`;
    last = e.t;
    return line;
  });
  const end = Math.round(lengthQn * TPQ);
  lines.push(`        E ${Math.max(0, end - last)} b0 7b 00`);
  return lines.join("\n");
}

/**
 * A project: the template's Kontakt track with one MIDI item from 0 to
 * `lengthQn`, at `bpm` in `beats`/`unit`, rendered to `out` (a .wav).
 */
export function project(o: { bpm: number; beats: number; unit: number; notes: MidiNote[]; lengthQn: number; out: string }): string {
  // REAPER on macOS saved it with CRLF line endings; work in LF.
  let s = readFileSync(TEMPLATE, "utf8").replace(/\r\n/g, "\n");
  const secPerQn = 60 / o.bpm;
  // In quarter notes per beat: a /8 meter's beat (an eighth) counts half a quarter.
  s = s.replace(/^  TEMPO .*$/m, `  TEMPO ${o.bpm} ${o.beats} ${o.unit} 0`);
  s = s.replace(/^  RENDER_FILE .*$/m, `  RENDER_FILE "${dirname(o.out)}"`);
  s = s.replace(/^  RENDER_PATTERN .*$/m, `  RENDER_PATTERN "${o.out.split("/").pop()!.replace(/\.wav$/, "")}"`);
  s = s.replace(/^  RENDER_RANGE .*$/m, `  RENDER_RANGE 1 0 0 18 1000`);
  s = s.replace(/^  RENDER_FMT .*$/m, `  RENDER_FMT 0 2 0`);
  const item = `    <ITEM
      POSITION 0
      LENGTH ${(o.lengthQn * secPerQn).toFixed(6)}
      LOOP 0
      NAME "gen"
      <SOURCE MIDI
        HASDATA 1 ${TPQ} QN
${midiSource(o.notes, o.lengthQn)}
      >
    >`;
  // The item goes inside the track, after its FX chain (the track's last child).
  const trackEnd = s.lastIndexOf("\n  >\n>");
  if (trackEnd < 0) throw new Error("template.RPP: no track to put the MIDI in");
  s = s.slice(0, trackEnd) + "\n" + item + s.slice(trackEnd);
  return s;
}

/** Writes and renders a project; returns the rendered file's path. */
export function render(o: Parameters<typeof project>[0]): string {
  mkdirSync(dirname(o.out), { recursive: true });
  const rpp = o.out.replace(/\.wav$/, ".rpp");
  writeFileSync(rpp, project(o));
  if (existsSync(o.out)) rmSync(o.out);
  execFileSync(REAPER, ["-nosplash", "-renderproject", rpp], { stdio: "pipe", timeout: 600_000 });
  if (!existsSync(o.out)) throw new Error(`REAPER did not render ${o.out}`);
  return o.out;
}
