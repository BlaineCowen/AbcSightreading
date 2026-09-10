/**
 * What a rhythm exercise sounds like.
 *
 * The staff has always played claves, and claves is a *click*: it has no
 * duration, so a half note sounds exactly like an eighth. That is fine for
 * drilling attacks and useless for hearing a note held, which is half of what
 * reading rhythm is.
 *
 * So there are two kinds here. A click keeps the percussion staff as it was. A
 * sustained sound swaps the percussion clef for an ordinary one and names a MIDI
 * program, which lets the note ring for its written length. The staff still
 * shows a single line either way - `stafflines=1` is already on the rhythm
 * staff and is what makes it look like a rhythm staff rather than a melody.
 */

export type RhythmSound =
  | { id: string; label: string; kind: "click"; drum: string }
  | { id: string; label: string; kind: "sustained"; program: number };

/**
 * Percussion names must come from abcjs's own list (abc_parse_directive.js) or
 * `%%percmap` is rejected; programs are checked against instrumentIndexToName
 * in the tests.
 */
export const RHYTHM_SOUNDS: readonly RhythmSound[] = [
  { id: "claves", label: "Claves", kind: "click", drum: "claves" },
  { id: "woodblock", label: "Woodblock", kind: "click", drum: "hi-wood-block" },
  { id: "piano", label: "Piano", kind: "sustained", program: 0 },
  { id: "marimba", label: "Marimba", kind: "sustained", program: 12 },
  { id: "organ", label: "Organ", kind: "sustained", program: 19 },
  { id: "voice", label: "Voice “ah”", kind: "sustained", program: 52 },
];

export const DEFAULT_RHYTHM_SOUND = "claves";

export function isRhythmSoundId(value: unknown): value is string {
  return typeof value === "string" && RHYTHM_SOUNDS.some((s) => s.id === value);
}

export function rhythmSoundFor(id: string): RhythmSound {
  return (
    RHYTHM_SOUNDS.find((s) => s.id === id) ??
    RHYTHM_SOUNDS.find((s) => s.id === DEFAULT_RHYTHM_SOUND)!
  );
}

/**
 * abcjs applies a 3x boost only when it recognises its own sample URL, and this
 * app serves them from its own origin - so the multiplier is restated by hand.
 * Claves is intrinsically quiet (raw peak 0.16 against a piano note's 0.3-0.5)
 * and needs more; a sustained instrument at the same gain would clip.
 */
export function volumeMultiplierFor(sound: RhythmSound): number {
  return sound.kind === "click" ? 4.0 : 3.0;
}

const PERCMAP = /^%%percmap\s+\S+\s+\S+.*$/m;
const MIDI_PROGRAM = /^%%MIDI program \d+$/m;
/**
 * Removing a directive has to take its newline with it.
 *
 * A blank line in ABC ends the tune - leaving one behind truncated the exercise
 * to nothing, and the staff came back empty rather than erroring.
 */
const PERCMAP_LINE = /^%%percmap\s+\S+\s+\S+.*\n/m;
const MIDI_PROGRAM_LINE = /^%%MIDI program \d+\n/m;

/**
 * Rewrite an assembled rhythm exercise to use a different sound.
 *
 * Works from either state and is idempotent, so it can be applied to a string it
 * has already touched. Only the header changes - the music is not read.
 */
export function withRhythmSound(abc: string, sound: RhythmSound): string {
  let out = abc;

  if (sound.kind === "click") {
    // Percussion staff: the clef is what puts the synth on the drum kit, and
    // only then does %%percmap mean anything.
    //
    // Only ever rewrites the rhythm staff's own clefs - `clef=treble` is left
    // alone, since that belongs to a pitched exercise and this never runs on one.
    out = out.replace(/clef=none(?=[\s\n])/g, "clef=perc");
    out = out.replace(MIDI_PROGRAM_LINE, "");
    const percmap = `%%percmap B ${sound.drum} normal`;
    out = PERCMAP.test(out)
      ? out.replace(PERCMAP, percmap)
      : out.replace(/^(L:1\/32.*)$/m, `$1\n${percmap}`);
    return out;
  }

  // Sustained: `clef=none` rather than a real clef. The note then keeps its
  // pitch and its written length, and the staff still reads as a rhythm staff -
  // a single line with no clef glyph. Using treble here put a treble clef on the
  // rhythm staff, which is not what a rhythm exercise looks like.
  out = out.replace(/clef=perc(?=[\s\n])/g, "clef=none");
  out = out.replace(PERCMAP_LINE, "");
  const program = `%%MIDI program ${sound.program}`;
  out = MIDI_PROGRAM.test(out)
    ? out.replace(MIDI_PROGRAM, program)
    : out.replace(/^(L:1\/32.*)$/m, `$1\n${program}`);
  return out;
}
