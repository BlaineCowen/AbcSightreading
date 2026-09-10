/**
 * The voices an exercise can be played back with.
 *
 * abcjs takes its instrument from a `%%MIDI program` directive in the ABC
 * itself, not from a playback option - the program arrives as an event in the
 * generated MIDI track, and create-synth maps it through
 * `instrumentIndexToName` to a sample folder. So switching instrument means
 * re-emitting the ABC, which is cheap: it re-parses and re-inits the synth
 * without regenerating the exercise.
 *
 * Every `program` here is checked against abcjs's own index, and every sample
 * folder it maps to is served by our proxy (src/pages/api/soundfont/) from
 * FluidR3_GM. A program whose folder does not exist is not an error anyone
 * sees - abcjs skips notes whose samples fail to load, silently, which sounds
 * exactly like the audio being broken. So this list is deliberately short and
 * verified rather than the whole General MIDI set.
 */
export type Instrument = {
  /** MIDI program number, as `%%MIDI program` takes it. */
  program: number;
  /** What the singer sees. */
  label: string;
  /** The FluidR3_GM sample folder, for the record and for testing. */
  samples: string;
};

export const INSTRUMENTS: readonly Instrument[] = [
  { program: 0, label: "Piano", samples: "acoustic_grand_piano" },
  { program: 52, label: "Choir “ah”", samples: "choir_aahs" },
  { program: 53, label: "Voices “ooh”", samples: "voice_oohs" },
  { program: 54, label: "Synth choir", samples: "synth_choir" },
  { program: 48, label: "Strings", samples: "string_ensemble_1" },
  { program: 19, label: "Church organ", samples: "church_organ" },
  { program: 71, label: "Clarinet", samples: "clarinet" },
];

export const DEFAULT_INSTRUMENT = 0;

export function isInstrumentProgram(value: unknown): value is number {
  const n = typeof value === "string" ? Number(value) : value;
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    INSTRUMENTS.some((i) => i.program === n)
  );
}

export function instrumentFor(program: number): Instrument {
  return (
    INSTRUMENTS.find((i) => i.program === program) ??
    INSTRUMENTS.find((i) => i.program === DEFAULT_INSTRUMENT)!
  );
}

/**
 * Swap the instrument in an already-assembled ABC string.
 *
 * The header always carries a `%%MIDI program` line, so this is a replacement
 * rather than an insertion - which keeps it from mattering *where* in the header
 * the directive belongs.
 */
export function withInstrument(abc: string, program: number): string {
  return abc.replace(/^%%MIDI program \d+$/m, `%%MIDI program ${program}`);
}
