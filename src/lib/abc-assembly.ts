// This will take a voicePart Array and rhythmArray and turn it into valid abc string
//  we will also need the time signature to create the correct abc string
import {
  type VoiceNote,
  type VoicePart,
  type Rhythm,
  type TimeSignature,
} from "./types";
import { lyricLineFor, type LyricSystem } from "../resources/solfege";
import { keySignatures } from "../resources/key-signatures";
import { getDiatonicDegree } from "./prep-params";

/**
 * What to print alongside the notes.
 *
 * Both default off, so the plain score is what you get unless something asks for
 * more. Teaching aids are opt-in; the clean copy is the baseline.
 */
export interface AbcDisplayOptions {
  /** Roman numerals above the top staff. */
  chordSymbols?: boolean;
  /**
   * A `w:` lyric line under each voice: movable-do solfège, fixed-do, or the
   * note names. Absent prints none.
   */
  lyrics?: LyricSystem | null;
  /**
   * Voices left off the page, by full name ("Alto"). They are still part of the
   * exercise and still heard - playback reads a full copy of the score - they
   * just get no staff. Hiding every voice is ignored rather than drawing nothing.
   */
  hiddenVoices?: string[];
}

// Interface for additional metadata needed for the ABC header
export interface AbcMetadata {
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

  // Which voices get a staff. Leaving a voice out of %%score is not enough -
  // abcjs draws every voice the body mentions whatever %%score says - so a
  // hidden voice is left out of the header and the body both.
  const hidden = new Set(display.hiddenVoices ?? []);
  let shown = voiceParts
    .map((_, i) => i)
    .filter((i) => !hidden.has(voiceParts[i].name));
  if (shown.length === 0) shown = voiceParts.map((_, i) => i);
  const shownParts = shown.map((i) => voiceParts[i]);

  // %%score directive. The square brackets draw a choir's bracket down the left
  // of each system, grouping its staves so one system reads as one unit and
  // the next as the next. Barlines stay broken between staves - joining them
  // (`|` between names) is for keyboard scores; a choral score leaves the gap
  // for the words under each staff, here the solfège. A single staff gets no
  // bracket: there is nothing to group.
  const names = shownParts.map((part) => part.smallName).join(" ");
  abcString += (shownParts.length > 1 ? `%%score [${names}]` : `%%score ${names}`) + "\n";

  // V: Voice part headers
  shownParts.forEach((part) => {
    abcString += `V:${part.smallName} clef=${part.clef} name="${part.name}" snm="${part.smallName}"\n`;
  });

  // K: Key signature
  abcString += `K:${key}\n`;
  abcString += `% End of header, start of tune body:\n`;

  // --- Body Generation ---
  const beatsPerMeasure = timeSig.tsPerMeasure;

  /**
   * Chord symbols from the hidden voices, by the time they start.
   *
   * The symbols are one row over the top staff, written on the top voice's notes
   * (see build-chord-notes). Hide that voice and the row would go with it, so they
   * move to the top voice still on the page, onto its note that starts at the
   * same moment. One that lands mid-note there - a suspension held across the
   * change - has nowhere to sit and is left out. Empty when nothing is hidden,
   * which leaves the score exactly as it always was.
   */
  const liftedSymbols = new Map<number, string>();
  for (let v = 0; v < voiceParts.length; v++) {
    if (shown.includes(v)) continue;
    let at = 0;
    for (const note of allVoiceNotes[v]) {
      if (note.chordSymbol && !liftedSymbols.has(at)) liftedSymbols.set(at, note.chordSymbol);
      at += note.length;
    }
  }

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

  /** What the key signature already does to a letter, with no accidental written. */
  const keyInfo = keySignatures[key];
  const keyAccidental = (note: VoiceNote): string => {
    if (!keyInfo) return "natural";
    const degree = getDiatonicDegree(note.pitchValue, keyInfo);
    if (keyInfo.sharps.includes(degree)) return "sharp";
    if (keyInfo.flats.includes(degree)) return "flat";
    return "natural";
  };

  const ACCIDENTAL_PREFIX: Record<string, string> = {
    sharp: "^",
    flat: "_",
    natural: "=",
    "double-sharp": "^^",
    "double-flat": "__",
  };

  // Strip leading accidental characters (^, _, =) to get the bare pitch+octave key.
  const basePitch = (noteName: string) => noteName.replace(/^[\^_=]+/, "");

  for (const voiceIndex of shown) {
    const part = voiceParts[voiceIndex];
    const partSmallName = part.smallName;
    let partString = `[V:${partSmallName}] `;
    let measureCount = 0;
    /** Where the current note starts, from the top of the piece. */
    let at = 0;
    const lifted = voiceIndex === shown[0] ? liftedSymbols : null;

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
      const chordSymbol = note.chordSymbol ?? lifted?.get(at);
      if (display.chordSymbols && chordSymbol) {
        partString += `"^${chordSymbol}"`;
      }

      if (note.rest) {
        partString += `z${note.length}`;
      } else {
        const base = basePitch(note.name);

        // One rule for both altered and diatonic notes: work out what this note
        // needs to sound as, compare it with what is already in force for that
        // letter, and print a sign only when the two differ.
        //
        // Two bugs came from not doing this. An accidental holds for the rest of
        // the measure, so a bar of repeated eighths printed ^G ^G ^G where a
        // reader expects ^G G G. And cancelling was hard-coded to a natural,
        // which is only right in a key that does not already alter that letter -
        // in G major, a plain F after an F natural has to be restored with ^F,
        // not marked natural again.
        const want = note.accidental ?? keyAccidental(note);
        const inForce = measureAccidentals.get(base) ?? keyAccidental(note);
        if (want === inForce) {
          partString += `${base}${note.length}`;
        } else {
          measureAccidentals.set(base, want);
          partString += `${ACCIDENTAL_PREFIX[want] ?? ""}${base}${note.length}`;
        }
      }
      // A space breaks the beam; leaving it out is what joins the notes.
      const startsAt = measureCount;
      measureCount += note.length;
      at += note.length;
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
    if (display.lyrics) {
      const syllables = lyricLineFor(notesForPart, key, display.lyrics);
      if (syllables.length > 0) abcString += `w: ${syllables.join(" ")}\n`;
    }
  }

  return abcString;
}
