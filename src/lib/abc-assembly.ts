// This will take a voicePart Array and rhythmArray and turn it into valid abc string
//  we will also need the time signature to create the correct abc string
import {
  type VoiceNote,
  type VoicePart,
  type Rhythm,
  type TimeSignature,
} from "./types";
import { solfegeLineFor } from "../resources/solfege";

/**
 * What to print alongside the notes.
 *
 * Both default off, so the plain score is what you get unless something asks for
 * more. Teaching aids are opt-in; the clean copy is the baseline.
 */
export interface AbcDisplayOptions {
  /** Roman numerals above the top staff. */
  chordSymbols?: boolean;
  /** Solfège syllables as a `w:` lyric line under each voice. */
  solfege?: boolean;
}

// Interface for additional metadata needed for the ABC header
interface AbcMetadata {
  title: string;
  composer: string;
  tempo: number;
  /**
   * MIDI program for playback. Always emitted, even for the default piano, so
   * that switching instrument later is a replacement in the string rather than
   * an insertion into a header whose shape would have to be known.
   */
  midiProgram?: number;
}

/**
 * Assembles the final ABC notation string from generated voice notes and parameters.
 *
 * @param allVoiceNotes - A 2D array where each sub-array holds the VoiceNote objects for a single voice part, in order (e.g., Bass, Tenor, Alto, Soprano).
 * @param voiceParts - An array of VoicePart objects containing metadata like name, clef, etc.
 * @param rhythms - The array of Rhythm objects used for generation (needed for lengths).
 * @param key - The key signature string (e.g., "C", "Gm").
 * @param timeSig - The time signature object.
 * @param metadata - Additional metadata like title, composer, tempo.
 * @returns The fully formatted ABC notation string.
 */
export function assembleAbcString(
  allVoiceNotes: VoiceNote[][],
  voiceParts: VoicePart[],
  rhythms: Rhythm[],
  key: string,
  timeSig: TimeSignature,
  metadata: AbcMetadata,
  display: AbcDisplayOptions = {}
): string {
  console.log("Assembling ABC string with:");
  console.log(
    "  Notes per voice:",
    allVoiceNotes.map((notes) => notes.length)
  );
  console.log(
    "  Voice parts:",
    voiceParts.map((v) => v.name)
  );
  console.log(
    "  Rhythms:",
    rhythms.map((r) => ({ name: r.name, abcValue: r.abcValue }))
  );

  let abcString = "";

  // --- Header Generation ---
  abcString += `X:1\n`;
  abcString += `T:${metadata.title}\n`;
  abcString += `C:${metadata.composer}\n`;
  abcString += `M:${timeSig.name}\n`;
  abcString += `L:1/32\n`; // Base unit is 32nd notes
  abcString += `Q:1/4=${metadata.tempo}\n`;
  // abcjs reads the playback instrument from here - it becomes a program event
  // in the generated MIDI track, which create-synth maps to a sample folder.
  abcString += `%%MIDI program ${metadata.midiProgram ?? 0}\n`;

  // %%score directive
  let scoreDirective = "%%score";
  voiceParts.forEach((part) => {
    scoreDirective += ` ${part.smallName}`;
  });
  abcString += scoreDirective + "\n";

  // V: Voice part headers
  voiceParts.forEach((part) => {
    abcString += `V:${part.smallName} clef=${part.clef} name="${part.name}" snm="${part.smallName}"\n`;
  });

  // K: Key signature
  abcString += `K:${key}\n`;
  abcString += `% End of header, start of tune body:\n`;

  // --- Body Generation ---
  const numVoices = voiceParts.length;
  const beatsPerMeasure = timeSig.tsPerMeasure;

  /**
   * How wide one beam group is, in 32nd-note units - a quarter in simple time,
   * a dotted quarter in compound. Already carried on every time signature.
   */
  const beamUnit = timeSig.beamGroupSize ?? 8;

  /**
   * Whether these two notes should be joined by a beam.
   *
   * ABC beams whatever is written without a space between it, so this decides
   * where the spaces go. Choral put a space after *every* note, which meant
   * nothing was ever beamed - two eighths on one beat came out as two separate
   * flagged notes.
   *
   * Modern practice, and the rule here: a beam shows the beat. So notes beam
   * together only while they stay inside one beat, and a beam never crosses from
   * one beat into the next. Anything a quarter or longer has no flag to beam in
   * the first place, and a rest ends the group.
   *
   * `startsAt` is the position of the first note within its measure.
   */
  const beamsTogether = (
    note: VoiceNote,
    next: VoiceNote | undefined,
    startsAt: number
  ): boolean => {
    if (!next) return false;
    if (note.rest || next.rest) return false;
    if (note.length >= beamUnit || next.length >= beamUnit) return false;
    // Same beat: the note must not carry the group over a beat boundary.
    const endsAt = startsAt + note.length;
    return Math.floor(startsAt / beamUnit) === Math.floor(endsAt / beamUnit);
  };

  // Strip leading accidental characters (^, _, =) to get the bare pitch+octave key.
  const basePitch = (noteName: string) => noteName.replace(/^[\^_=]+/, "");

  for (let voiceIndex = 0; voiceIndex < numVoices; voiceIndex++) {
    const part = voiceParts[voiceIndex];
    const partSmallName = part.smallName;
    let partString = `[V:${partSmallName}] `;
    let measureCount = 0;

    // Tracks which pitch+octave strings have been altered within the current measure.
    // Key = bare pitch string (e.g. "A,", "F"); value = the accidental type applied.
    // Cleared at every barline so accidentals don't bleed across measures.
    const measureAccidentals = new Map<string, string>();

    const notesForPart = allVoiceNotes[voiceIndex];

    for (let stepIndex = 0; stepIndex < notesForPart.length; stepIndex++) {
      const note = notesForPart[stepIndex];

      // Log the note being processed
      console.log(`ABC_ASM [V:${partSmallName}, Step:${stepIndex}]:`, {
        name: note.name,
        length: note.length,
        rest: note.rest,
        accidental: note.accidental,
      });

      // Chord-symbol annotation (e.g. "I", "V⁷", "V⁶/V").
      //
      // Emitted before the rest/note branch, not inside it: the symbols sit in
      // one row above the top staff, and that voice can be resting there when
      // the texture thins. Kept inside the note branch, every symbol over a rest
      // silently vanished and the row thinned out with the texture.
      //
      // The leading "^" pins it above the staff as an annotation. A bare chord
      // token does survive the parser - checked, "V/V" comes back intact rather
      // than being read as a slash chord - but it would then be engraved in the
      // chord font, and Roman-numeral analysis is an annotation, not a lead
      // sheet chord.
      if (display.chordSymbols && note.chordSymbol) {
        partString += `"^${note.chordSymbol}"`;
      }

      if (note.rest) {
        partString += `z${note.length}`;
      } else {
        const base = basePitch(note.name);

        if (note.accidental) {
          // Explicit accidental - record it so we can cancel it for diatonic notes later.
          measureAccidentals.set(base, note.accidental);
          partString += `${note.name}${note.length}`;
        } else {
          // Diatonic note. If the same pitch was altered earlier in this measure, abcjs
          // will carry the prior accidental. Add an explicit natural to cancel it.
          if (measureAccidentals.has(base)) {
            measureAccidentals.delete(base);
            partString += `=${base}${note.length}`;
          } else {
            partString += `${note.name}${note.length}`;
          }
        }
      }
      // A space breaks the beam; leaving it out is what joins the notes.
      const startsAt = measureCount;
      measureCount += note.length;
      const completesMeasure = measureCount >= beatsPerMeasure;
      if (
        completesMeasure ||
        !beamsTogether(note, notesForPart[stepIndex + 1], startsAt)
      ) {
        partString += " ";
      }

      // Add bar line if measure is complete
      if (completesMeasure) {
        partString += "| ";
        measureCount = measureCount % beatsPerMeasure; // Handle any overflow
        measureAccidentals.clear(); // Accidentals don't carry across barlines
      }
    }

    // Add final double bar line
    if (!partString.endsWith("| ")) {
      partString += "|]";
    } else {
      partString = partString.slice(0, -2) + "|]";
    }
    abcString += partString + "\n";

    // Solfège goes on its own `w:` line directly after this voice's body, which
    // is how ABC attaches lyrics to a voice. One syllable per *note* - rests
    // take no slot, or every later syllable would sit one note to the left.
    if (display.solfege) {
      const syllables = solfegeLineFor(notesForPart, key);
      if (syllables.length > 0) abcString += `w: ${syllables.join(" ")}\n`;
    }
  }

  return abcString;
}
